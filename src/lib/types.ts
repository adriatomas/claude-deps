export interface Manifest {
  $schema?: string;
  version: number;
  plugins?: Record<string, string>;
  marketplaces?: Record<string, MarketplaceSource>;
  mcp?: McpConfig;
  hooks?: HooksConfig;
}

export interface MarketplaceSource {
  source: 'github' | 'git';
  repo?: string;
  url?: string;
}

export interface McpConfig {
  servers?: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  type: 'stdio' | 'http' | 'sse';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  dependencies?: {
    npm?: string[];
    pip?: string[];
  };
}

export interface HooksConfig {
  validate?: boolean;
}

export interface LockFile {
  lockVersion: number;
  plugins: Record<string, LockEntry>;
}

export interface LockEntry {
  version: string;
  gitCommitSha: string;
  resolvedAt: string;
  marketplace: string;
}

export interface InstalledPlugins {
  version: number;
  plugins: Record<string, InstalledPluginEntry[]>;
}

export interface InstalledPluginEntry {
  scope: 'user' | 'project';
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
}

export interface ClaudeSettings {
  hooks?: Record<string, unknown[]>;
  enabledPlugins?: Record<string, boolean>;
  permissions?: Record<string, string[]>;
  [key: string]: unknown;
}
