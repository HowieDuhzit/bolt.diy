import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import type { CoolifyProjectInfo } from '~/types/coolify';

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
    
  // Remove port if specified
  normalizedUrl = normalizedUrl.replace(/:\d+$/, '');
  
  // Ensure no /api in the base URL
  normalizedUrl = normalizedUrl.replace(/\/api\/?$/, '');
  
  return normalizedUrl;
}

// Add loader function to handle GET requests
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  let baseUrl = url.searchParams.get('baseUrl');
  const token = url.searchParams.get('token');

  if (!projectId || !token || !baseUrl) {
    return json({ error: 'Missing projectId, baseUrl or token' }, { status: 400 });
  }

  // Normalize the base URL
  baseUrl = normalizeCoolifyUrl(baseUrl);

  try {
    // Get project info
    const projectResponse = await fetch(`${baseUrl}/api/v1/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!projectResponse.ok) {
      return json({ error: 'Failed to fetch project' }, { status: 400 });
    }

    const projectData = await projectResponse.json();
    const project = projectData.data;

    if (!project) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Get deployment info if available
    let deploymentInfo = null;
    if (project.deploymentStatus) {
      deploymentInfo = {
        id: project.id,
        state: project.deploymentStatus,
        url: project.url || `${project.domain || ''}`,
      };
    }

    return json({
      project: {
        id: project.id,
        name: project.name,
        url: project.url || `${project.domain || ''}`,
      },
      deploy: deploymentInfo,
    });
  } catch (error) {
    console.error('Error fetching Coolify deployment:', error);
    return json({ error: 'Failed to fetch deployment' }, { status: 500 });
  }
}

interface DeployRequestBody {
  projectId?: string;
  files: Record<string, string>;
  chatId: string;
  baseUrl: string;
}

// Action function for POST requests
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { projectId, files, baseUrl, token, chatId } = (await request.json()) as DeployRequestBody & { token: string };

    if (!token) {
      return json({ error: 'Not connected to Coolify' }, { status: 401 });
    }

    if (!baseUrl) {
      return json({ error: 'Coolify instance URL is required' }, { status: 400 });
    }

    // Normalize the base URL
    const normalizedBaseUrl = normalizeCoolifyUrl(baseUrl);

    let targetProjectId = projectId;
    let projectInfo: CoolifyProjectInfo | undefined;

    // If no projectId provided, create a new project
    if (!targetProjectId) {
      const projectName = `bolt-diy-${chatId}-${Date.now()}`;
      const createProjectResponse = await fetch(`${normalizedBaseUrl}/api/v1/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          type: 'docker', // Use Docker deploy type
        }),
      });

      if (!createProjectResponse.ok) {
        const errorData = await createProjectResponse.json();
        return json(
          { error: `Failed to create project: ${errorData.message || errorData.error || 'Unknown error'}` },
          { status: 400 },
        );
      }

      const newProject = await createProjectResponse.json();
      if (!newProject.data) {
        return json({ error: 'Invalid response when creating project' }, { status: 500 });
      }

      targetProjectId = newProject.data.id;
      projectInfo = {
        id: newProject.data.id,
        name: newProject.data.name,
        url: newProject.data.url || '', // May be empty initially
        chatId,
      };
    } else {
      // Get existing project info
      const projectResponse = await fetch(`${normalizedBaseUrl}/api/v1/projects/${targetProjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (projectResponse.ok) {
        const existingProjectData = await projectResponse.json();
        const existingProject = existingProjectData.data;
        
        if (!existingProject) {
          return json({ error: 'Project not found' }, { status: 404 });
        }

        projectInfo = {
          id: existingProject.id,
          name: existingProject.name,
          url: existingProject.url || existingProject.domain || '',
          chatId,
        };
      } else {
        // If project doesn't exist, create a new one
        const projectName = `bolt-diy-${chatId}-${Date.now()}`;
        const createProjectResponse = await fetch(`${normalizedBaseUrl}/api/v1/projects`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: projectName,
            type: 'docker',
          }),
        });

        if (!createProjectResponse.ok) {
          const errorData = await createProjectResponse.json();
          return json(
            { error: `Failed to create project: ${errorData.message || errorData.error || 'Unknown error'}` },
            { status: 400 },
          );
        }

        const newProject = await createProjectResponse.json();
        if (!newProject.data) {
          return json({ error: 'Invalid response when creating project' }, { status: 500 });
        }

        targetProjectId = newProject.data.id;
        projectInfo = {
          id: newProject.data.id,
          name: newProject.data.name,
          url: newProject.data.url || '',
          chatId,
        };
      }
    }

    // Prepare files for deployment
    // First, create a zip file with all files
    const zipBlob = await createZipFromFiles(files);
    const buffer = await zipBlob.arrayBuffer();
    const base64Content = Buffer.from(buffer).toString('base64');

    // Create deployment
    const deployResponse = await fetch(`${normalizedBaseUrl}/api/v1/projects/${targetProjectId}/deploy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zipFile: base64Content,
      }),
    });

    if (!deployResponse.ok) {
      const errorData = await deployResponse.json();
      return json(
        { error: `Failed to create deployment: ${errorData.message || errorData.error || 'Unknown error'}` },
        { status: 400 },
      );
    }

    const deployData = await deployResponse.json();
    const deploymentId = deployData.data?.id;

    // Check for deployment status
    let retryCount = 0;
    const maxRetries = 60;
    let deploymentStatus = 'pending';

    while (retryCount < maxRetries) {
      const statusResponse = await fetch(`${normalizedBaseUrl}/api/v1/projects/${targetProjectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const project = statusData.data;
        
        if (!project) {
          break;
        }

        deploymentStatus = project.deploymentStatus || 'pending';
        
        // Update project URL if available
        if (project.url) {
          projectInfo.url = project.url;
        } else if (project.domain) {
          projectInfo.url = project.domain;
        }

        if (deploymentStatus === 'complete' || deploymentStatus === 'error') {
          break;
        }
      }

      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (deploymentStatus === 'error') {
      return json({ error: 'Deployment failed' }, { status: 500 });
    }

    if (retryCount >= maxRetries) {
      return json({ 
        success: true,
        message: 'Deployment started but still in progress. Check Coolify dashboard for status.',
        deploy: {
          id: deploymentId,
          state: 'in_progress',
          url: projectInfo.url,
        },
        project: projectInfo,
      });
    }

    return json({
      success: true,
      deploy: {
        id: deploymentId,
        state: deploymentStatus,
        url: projectInfo.url,
      },
      project: projectInfo,
    });
  } catch (error) {
    console.error('Coolify deploy error:', error);
    return json({ error: 'Deployment failed' }, { status: 500 });
  }
}

// Helper function to create a zip file from the collected files
async function createZipFromFiles(files: Record<string, string>): Promise<Blob> {
  const JSZip = await import('jszip').then((module) => module.default);
  const zip = new JSZip();

  // Add each file to the zip
  for (const [filePath, content] of Object.entries(files)) {
    // Ensure file path doesn't start with a slash
    const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    zip.file(normalizedPath, content);
  }

  // Create the docker-compose.yaml file for Coolify deployment
  const dockerComposeContent = `
version: '3.8'
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "80:5173"
    environment:
      NODE_ENV: production
  `;

  zip.file('docker-compose.yaml', dockerComposeContent);

  // Create the Dockerfile if it doesn't exist
  if (!files['Dockerfile'] && !files['/Dockerfile']) {
    const dockerfileContent = `
FROM node:18-alpine

WORKDIR /app

COPY . .

RUN npm install

# Build if there's a build script
RUN if grep -q '"build"' package.json; then npm run build; fi

EXPOSE 5173

# Use a command that works for most JS frameworks
CMD ["npm", "start"]
`;
    zip.file('Dockerfile', dockerfileContent);
  }

  // Generate the zip file as a blob
  return await zip.generateAsync({ type: 'blob' });
} 