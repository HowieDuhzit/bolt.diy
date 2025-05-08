import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { coolifyConnection } from '~/lib/stores/coolify';
import { chatId } from '~/lib/persistence/useChatHistory';

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
        const projectId = localStorage.getItem(`coolify-project-${currentChatId}`);

        if (!projectId) {
          setIsLoading(false);
          return;
        }

        // Fetch project details
        const response = await fetch(`/api/coolify-deploy?projectId=${projectId}&baseUrl=${encodeURIComponent(connection.url)}&token=${connection.token}`, {
          method: 'GET',
        });

        const data = await response.json();

        if ((data as { deploy?: { url?: string } }).deploy?.url) {
          setDeploymentUrl((data as { deploy: { url: string } }).deploy.url);
        } else if ((data as { project?: { url?: string } }).project?.url) {
          setDeploymentUrl((data as { project: { url: string } }).project.url);
        }
      } catch (err) {
        console.error('Error fetching Coolify deployment:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProjectData();
  }, [connection.token, connection.url, currentChatId]);

  if (!deploymentUrl) {
    return null;
  }

  return (
    <div className="ml-auto inline-flex items-center gap-1">
      <span className="px-1.5 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs rounded-full">
        Live
      </span>
      <a
        href={deploymentUrl.startsWith('http') ? deploymentUrl : `https://${deploymentUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-bolt-elements-borderColorActive hover:underline truncate max-w-24 sm:max-w-32"
        title={deploymentUrl}
      >
        {deploymentUrl.replace(/^https?:\/\//, '')}
      </a>
    </div>
  );
} 