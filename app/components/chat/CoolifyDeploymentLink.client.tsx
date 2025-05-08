import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { coolifyConnection } from '~/lib/stores/coolify';
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

export function CoolifyDeploymentLink() {
  const connection = useStore(coolifyConnection);
  const currentChatId = useStore(chatId);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchProjectData() {
      if (!connection.token || !connection.url || !currentChatId) {
        setIsLoading(false);
        return;
      }

      try {
        // Get the project ID from local storage
        const projectId = localStorage.getItem(`coolify_project_${currentChatId}`);
        
        if (!projectId) {
          setIsLoading(false);
          return;
        }

        const baseUrl = normalizeCoolifyUrl(connection.url);
        
        // Fetch project data from the API
        const response = await fetch(
          `/api/coolify-deploy?projectId=${projectId}&baseUrl=${encodeURIComponent(
            baseUrl,
          )}&token=${encodeURIComponent(connection.token)}`,
        );

        if (!response.ok) {
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        
        if (data.project?.url) {
          setDeploymentUrl(data.project.url);
        } else if (data.deploy?.url) {
          setDeploymentUrl(data.deploy.url);
        }
      } catch (error) {
        console.error('Error fetching Coolify deployment data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProjectData();
  }, [connection.token, connection.url, currentChatId]);

  if (isLoading) {
    return (
      <div className="w-full flex justify-center items-center h-6">
        <div className="i-ph:spinner-gap w-4 h-4 animate-spin text-bolt-elements-textSecondary" />
      </div>
    );
  }

  if (!deploymentUrl) {
    return null;
  }

  return (
    <div className="px-3 py-1.5 flex gap-2 rounded-lg items-center justify-between">
      <div className="flex items-center gap-1.5">
        <div className="i-ph:cloud-check w-4 h-4 text-[#5E41D0]" />
        <div className="text-xs text-bolt-elements-textSecondary flex items-center gap-1">
          <span>Coolify Deployment:</span>
          <a
            href={deploymentUrl}
            className="text-bolt-elements-textPrimaryLink hover:text-bolt-elements-textPrimaryLinkActive"
            target="_blank"
            rel="noopener noreferrer"
          >
            {deploymentUrl}
          </a>
        </div>
      </div>
    </div>
  );
} 