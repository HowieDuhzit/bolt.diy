import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { coolifyConnection } from '~/lib/stores/coolify';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { path } from '~/utils/path';
import { useState } from 'react';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { chatId } from '~/lib/persistence/useChatHistory';

// Helper function to normalize Coolify URLs
function normalizeCoolifyUrl(url: string): string {
  // Remove @ prefix if present
  let normalizedUrl = url.trim();
  if (normalizedUrl.startsWith('@')) {
    normalizedUrl = normalizedUrl.substring(1);
  }
  
  // Remove trailing slash
  normalizedUrl = normalizedUrl.endsWith('/')
    ? normalizedUrl.slice(0, -1)
    : normalizedUrl;
    
  // Check if port is specified, add 8000 if not
  if (!normalizedUrl.match(/:\d+$/)) {
    normalizedUrl = `${normalizedUrl}:8000`;
  }
  
  // Ensure no /api in the base URL
  normalizedUrl = normalizedUrl.replace(/\/api\/?$/, '');
  
  return normalizedUrl;
}

export function useCoolifyDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const coolifyConn = useStore(coolifyConnection);
  const currentChatId = useStore(chatId);

  const handleCoolifyDeploy = async () => {
    if (!coolifyConn.user || !coolifyConn.token || !coolifyConn.url) {
      toast.error('Please connect to Coolify first');
      return;
    }

    setIsDeploying(true);
    const baseUrl = normalizeCoolifyUrl(coolifyConn.url);

    try {
      // Get all files from the webcontainer
      const allFiles: Record<string, string> = {};
      const vm = await webcontainer.vm();
      const filePaths = await vm.run({
        command: 'find', // Use a command that works across unix-like systems
        args: ['.', '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'], // Exclude node_modules and .git
      });

      const pathsArray = filePaths.output
        .split('\n')
        .filter((filePath) => filePath.trim() !== '' && filePath.trim() !== '.' && !filePath.startsWith('./node_modules'));

      // Read all files
      for (const filePath of pathsArray) {
        try {
          // Clean up the path
          const normalizedPath = filePath.trim().startsWith('./') ? filePath.trim().substring(2) : filePath.trim();
          
          if (normalizedPath) {
            const fileContents = await webcontainer.fs.readFile(normalizedPath, 'utf-8');
            allFiles[normalizedPath] = fileContents;
          }
        } catch (error) {
          console.error(`Error reading file ${filePath}:`, error);
        }
      }

      // Get existing project ID for this chat from localStorage, if available
      const projectId = localStorage.getItem(`coolify_project_${currentChatId}`) || undefined;

      // Deploy to Coolify
      const response = await fetch('/api/coolify-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: allFiles,
          baseUrl,
          token: coolifyConn.token,
          projectId,
          chatId: currentChatId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Deployment failed');
      }

      const data = await response.json() as ActionCallbackData & {
        deploy?: { id: string; url: string };
        project?: { id: string; name: string; url: string };
      };

      if (data.project?.id) {
        // Store the project ID for future deployments
        localStorage.setItem(`coolify_project_${currentChatId}`, data.project.id);
      }

      toast.success('Deployed to Coolify successfully!');
      
      if (data.project?.url) {
        workbenchStore.setActiveWindow('browser');
        workbenchStore.setActiveBrowserTab(null);
        workbenchStore.setBrowserUrl(data.project.url);
      }
      return data;
    } catch (error) {
      console.error('Coolify deployment error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy to Coolify');
      return null;
    } finally {
      setIsDeploying(false);
    }
  };

  return { handleCoolifyDeploy, isDeploying };
} 