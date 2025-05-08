import { atom } from 'nanostores';
import type { CoolifyConnection, CoolifyUser } from '~/types/coolify';
import { logStore } from './logs';
import { toast } from 'react-toastify';

// Initialize with stored connection or environment variable
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('coolify_connection') : null;
const envUrl = import.meta.env.VITE_COOLIFY_URL;
const envToken = import.meta.env.VITE_COOLIFY_API_TOKEN;

// If we have environment variables but no stored connection, initialize with them
const initialConnection: CoolifyConnection = storedConnection
  ? JSON.parse(storedConnection)
  : {
      user: null,
      url: envUrl || '',
      token: envToken || '',
      stats: undefined,
    };

export const coolifyConnection = atom<CoolifyConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

// Function to initialize Coolify connection with environment variables
export async function initializeCoolifyConnection() {
  const currentState = coolifyConnection.get();

  // If we already have a connection, don't override it
  if (currentState.user || !envUrl || !envToken) {
    return;
  }

  try {
    isConnecting.set(true);

    // Fetch user info from Coolify API
    const response = await fetch(`${envUrl}/api/v1/user`, {
      headers: {
        Authorization: `Bearer ${envToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to Coolify: ${response.statusText}`);
    }

    const userData = await response.json();

    // Update the connection state
    const connectionData: Partial<CoolifyConnection> = {
      user: userData.data as CoolifyUser,
      url: envUrl,
      token: envToken,
    };

    // Store in localStorage for persistence
    localStorage.setItem('coolify_connection', JSON.stringify(connectionData));

    // Update the store
    updateCoolifyConnection(connectionData);

    // Fetch initial stats
    await fetchCoolifyStats(envUrl, envToken);
  } catch (error) {
    console.error('Error initializing Coolify connection:', error);
    logStore.logError('Failed to initialize Coolify connection', { error });
  } finally {
    isConnecting.set(false);
  }
}

export const updateCoolifyConnection = (updates: Partial<CoolifyConnection>) => {
  const currentState = coolifyConnection.get();
  const newState = { ...currentState, ...updates };
  coolifyConnection.set(newState);

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('coolify_connection', JSON.stringify(newState));
  }
};

export async function fetchCoolifyStats(url: string, token: string) {
  try {
    isFetchingStats.set(true);

    // Fetch projects from Coolify API
    const projectsResponse = await fetch(`${url}/api/v1/projects`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!projectsResponse.ok) {
      throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
    }

    const projectsData = await projectsResponse.json();
    const projects = projectsData.data || [];

    const currentState = coolifyConnection.get();
    updateCoolifyConnection({
      ...currentState,
      stats: {
        projects,
        totalProjects: projects.length,
      },
    });
  } catch (error) {
    console.error('Coolify API Error:', error);
    logStore.logError('Failed to fetch Coolify stats', { error });
    toast.error('Failed to fetch Coolify statistics');
  } finally {
    isFetchingStats.set(false);
  }
} 