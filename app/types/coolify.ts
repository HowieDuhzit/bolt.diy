export interface CoolifyUser {
  id: string;
  name: string;
  email: string;
  teamId?: string;
}

export interface CoolifyProject {
  id: string;
  name: string;
  url?: string;
  createdAt: string | number | Date;
  status?: string;
}

export interface CoolifyStats {
  projects: CoolifyProject[];
  totalProjects: number;
}

export interface CoolifyConnection {
  user: CoolifyUser | null;
  url: string;
  token: string;
  stats?: CoolifyStats;
}

export interface CoolifyProjectInfo {
  id: string;
  name: string;
  url: string;
  chatId: string;
} 