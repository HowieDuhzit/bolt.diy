import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { coolifyConnection } from '~/lib/stores/coolify';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { path } from '~/utils/path';
import { useState } from 'react';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { chatId } from '~/lib/persistence/useChatHistory';

export function useCoolifyDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const coolifyConn = useStore(coolifyConnection);
  const currentChatId = useStore(chatId);

  const handleCoolifyDeploy = async () => {
    if (!coolifyConn.user || !coolifyConn.token || !coolifyConn.url) {
      toast.error('Please connect to Coolify first in the settings tab!');
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-coolify-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'Coolify Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'coolify' });

      const actionId = 'build-' + Date.now();
      const actionData: ActionCallbackData = {
        messageId: 'coolify build',
        artifactId: artifact.id,
        actionId,
        action: {
          type: 'build' as const,
          content: 'npm run build',
        },
      };

      // Add the action first
      artifact.runner.addAction(actionData);

      // Then run it
      await artifact.runner.runAction(actionData);

      if (!artifact.runner.buildOutput) {
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: 'Build failed. Check the terminal for details.',
          source: 'coolify',
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment is starting
      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'coolify' });

      // Get the build files
      const container = await webcontainer;

      // Remove /home/project from buildPath if it exists
      const buildPath = artifact.runner.buildOutput.path.replace('/home/project', '');

      // Check if the build path exists
      let finalBuildPath = buildPath;
      try {
        await container.fs.stat(buildPath);
      } catch (err) {
        // If the buildPath doesn't exist, look for a /build or /dist directory
        for (const tryPath of ['/build', '/dist', '/out']) {
          try {
            await container.fs.stat(tryPath);
            finalBuildPath = tryPath;
            break;
          } catch (err) {
            // continue to next path
          }
        }
      }

      // Get all files (from root and build directory)
      const allFiles: Record<string, string> = {};

      async function collectFiles(dirPath: string, isRoot = false) {
        const dirContents = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const file of dirContents) {
          const filePath = path.join(dirPath, file.name);
          
          // Skip node_modules, .git, and other unnecessary folders
          if (
            isRoot &&
            (file.name === 'node_modules' ||
              file.name === '.git' ||
              file.name === '.cache' ||
              file.name === '.next/cache' ||
              file.name === '.vscode')
          ) {
            continue;
          }

          if (file.isDirectory()) {
            await collectFiles(filePath, false);
          } else {
            try {
              const content = await container.fs.readFile(filePath, 'utf-8');
              allFiles[filePath] = content;
            } catch (err) {
              console.warn(`Could not read file ${filePath}:`, err);
            }
          }
        }
      }

      // Collect files from project root (for package.json, etc)
      await collectFiles('/', true);

      // Check if we have a custom Dockerfile or docker-compose.yaml in the project
      let hasDockerfile = allFiles['/Dockerfile'] !== undefined;
      let hasDockerCompose = allFiles['/docker-compose.yaml'] !== undefined || allFiles['/docker-compose.yml'] !== undefined;

      if (!hasDockerfile) {
        // Generate a simple Dockerfile if none exists
        allFiles['/Dockerfile'] = `FROM node:18-alpine

WORKDIR /app

COPY . .

RUN npm install

${artifact.runner.buildOutput ? '# Build already completed\n' : 'RUN npm run build\n'}

EXPOSE 5173

CMD ["npm", "start"]`;
      }

      if (!hasDockerCompose) {
        // Generate a docker-compose.yaml file for Coolify
        allFiles['/docker-compose.yaml'] = `version: '3.8'
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "80:5173"
    environment:
      NODE_ENV: production`;
      }

      // Get existing project ID if we have one
      const existingProjectId = localStorage.getItem(`coolify-project-${currentChatId}`);

      const response = await fetch('/api/coolify-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: existingProjectId || undefined,
          files: allFiles,
          baseUrl: coolifyConn.url,
          token: coolifyConn.token,
          chatId: currentChatId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.deploy || !data.project) {
        console.error('Invalid deploy response:', data);

        // Notify that deployment failed
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: data.error || 'Invalid deployment response',
          source: 'coolify',
        });
        throw new Error(data.error || 'Invalid deployment response');
      }

      if (data.project) {
        localStorage.setItem(`coolify-project-${currentChatId}`, data.project.id);
      }

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: data.deploy.url,
        source: 'coolify',
      });

      return true;
    } catch (err) {
      console.error('Coolify deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'Coolify deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleCoolifyDeploy,
    isConnected: !!coolifyConn.user,
  };
} 