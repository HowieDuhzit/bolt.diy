import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';
import {
  coolifyConnection,
  isConnecting,
  isFetchingStats,
  updateCoolifyConnection,
  fetchCoolifyStats,
} from '~/lib/stores/coolify';

export default function CoolifyConnection() {
  const connection = useStore(coolifyConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      if (connection.user && connection.url && connection.token) {
        await fetchCoolifyStats(connection.url, connection.token);
      }
    };
    fetchProjects();
  }, [connection.user, connection.url, connection.token]);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    isConnecting.set(true);

    try {
      // Normalize URL format - allow input like @http://cool.howieduhzit.best
      let baseUrl = connection.url.trim();
      if (baseUrl.startsWith('@')) {
        baseUrl = baseUrl.substring(1);
      }
      
      // Validate URL format
      if (!baseUrl.startsWith('http')) {
        throw new Error('Coolify URL must start with http:// or https://');
      }

      // Remove trailing slash if present
      baseUrl = baseUrl.endsWith('/')
        ? baseUrl.slice(0, -1)
        : baseUrl;
        
      // Remove port if specified
      baseUrl = baseUrl.replace(/:\d+$/, '');
      
      // Ensure no /api in the base URL
      baseUrl = baseUrl.replace(/\/api\/?$/, '');

      const response = await fetch(`${baseUrl}/api/v1/user`, {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Invalid URL, token or unauthorized');
      }

      const userData = await response.json();
      
      if (!userData.data) {
        throw new Error('Invalid response from Coolify API');
      }

      updateCoolifyConnection({
        user: userData.data,
        url: baseUrl,
        token: connection.token,
      });

      await fetchCoolifyStats(baseUrl, connection.token);
      toast.success('Successfully connected to Coolify');
    } catch (error) {
      console.error('Auth error:', error);
      logStore.logError('Failed to authenticate with Coolify', { error });
      toast.error(error instanceof Error ? error.message : 'Failed to connect to Coolify');
      // Don't reset the token on failure to allow trying again
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateCoolifyConnection({ user: null, url: '', token: '' });
    toast.success('Disconnected from Coolify');
  };

  return (
    <motion.div
      className="bg-[#FFFFFF] dark:bg-[#0A0A0A] rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Coolify logo or placeholder icon */}
            <img
              className="w-5 h-5"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src="https://raw.githubusercontent.com/coollabsio/coolify/main/.coolify-logo"
              alt="Coolify"
            />
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">Coolify Connection</h3>
          </div>
        </div>

        {!connection.user ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-bolt-elements-textSecondary mb-2">Coolify Instance URL</label>
              <input
                type="text"
                value={connection.url}
                onChange={(e) => updateCoolifyConnection({ ...connection, url: e.target.value })}
                disabled={connecting}
                placeholder="http://coolify.example.com"
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                  'border border-[#E5E5E5] dark:border-[#333333]',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                  'disabled:opacity-50',
                )}
              />
              <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                <span>Just enter the base URL like http://cool.howieduhzit.best</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-bolt-elements-textSecondary mb-2">API Token</label>
              <input
                type="password"
                value={connection.token}
                onChange={(e) => updateCoolifyConnection({ ...connection, token: e.target.value })}
                disabled={connecting}
                placeholder="Enter your Coolify API token"
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                  'border border-[#E5E5E5] dark:border-[#333333]',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                  'disabled:opacity-50',
                )}
              />
              <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                <span>Find your token in Coolify dashboard under Settings → API → API Tokens</span>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting || !connection.token || !connection.url}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                'bg-[#303030] text-white',
                'hover:bg-[#5E41D0] hover:text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                'transform active:scale-95',
              )}
            >
              {connecting ? (
                <>
                  <div className="i-ph:spinner-gap animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <div className="i-ph:plug-charging w-4 h-4" />
                  Connect
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDisconnect}
                  className={classNames(
                    'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                    'bg-red-500 text-white',
                    'hover:bg-red-600',
                  )}
                >
                  <div className="i-ph:plug w-4 h-4" />
                  Disconnect
                </button>
                <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                  <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                  Connected to Coolify
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
              <div className="w-12 h-12 rounded-full bg-bolt-elements-borderColorActive flex items-center justify-center text-white font-bold">
                {connection.user.name?.charAt(0) || 'C'}
              </div>
              <div>
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                  {connection.user.name || 'Coolify User'}
                </h4>
                <p className="text-sm text-bolt-elements-textSecondary">
                  {connection.user.email || 'No email available'}
                </p>
                <p className="text-xs text-bolt-elements-textTertiary mt-1">
                  {connection.url}
                </p>
              </div>
            </div>

            {fetchingStats ? (
              <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
                <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                Fetching Coolify projects...
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
                  className="w-full bg-transparent text-left text-sm font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2"
                >
                  <div className="i-ph:buildings w-4 h-4" />
                  Your Projects ({connection.stats?.totalProjects || 0})
                  <div
                    className={classNames(
                      'i-ph:caret-down w-4 h-4 ml-auto transition-transform',
                      isProjectsExpanded ? 'rotate-180' : '',
                    )}
                  />
                </button>
                {isProjectsExpanded && connection.stats?.projects?.length ? (
                  <div className="grid gap-3">
                    {connection.stats.projects.map((project) => (
                      <a
                        key={project.id}
                        href={`${connection.url}/project/${project.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 rounded-lg border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                              <div className="i-ph:globe w-4 h-4 text-bolt-elements-borderColorActive" />
                              {project.name}
                            </h5>
                            <div className="flex items-center gap-2 mt-2 text-xs text-bolt-elements-textSecondary">
                              {project.url && (
                                <>
                                  <a
                                    href={project.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-bolt-elements-borderColorActive"
                                  >
                                    {project.url}
                                  </a>
                                  <span>•</span>
                                </>
                              )}
                              <span className="flex items-center gap-1">
                                <div className="i-ph:clock w-3 h-3" />
                                {new Date(project.createdAt).toLocaleDateString()}
                              </span>
                              {project.status && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <div className="i-ph:info w-3 h-3" />
                                    {project.status}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : isProjectsExpanded ? (
                  <div className="text-sm text-bolt-elements-textSecondary p-4 text-center">
                    No projects found
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
} 