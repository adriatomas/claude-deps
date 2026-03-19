import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  CLAUDE_HOME,
  readInstalledPlugins,
  readProjectSettings,
  getProjectClaudeDir,
} from './config.js';
import { parsePluginId } from './manifest.js';
import type { MarketplaceSource } from './types.js';

export interface ScannedPlugin {
  id: string;
  name: string;
  marketplace: string;
  version: string;
  source: 'project' | 'user';
  enabled: boolean;
}

export interface ScannedHook {
  event: string;
  matcher: string;
  command: string;
  source: 'project' | 'user';
}

export interface ScannedMcpServer {
  name: string;
  type: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  source: 'project' | 'user';
}

export interface ScanResult {
  plugins: ScannedPlugin[];
  hooks: ScannedHook[];
  mcpServers: ScannedMcpServer[];
  marketplaces: Record<string, MarketplaceSource>;
}

export function scan(projectPath: string): ScanResult {
  const plugins = scanPlugins(projectPath);
  const hooks = scanHooks(projectPath);
  const mcpServers = scanMcpServers(projectPath);
  const marketplaces = scanMarketplaces();

  return { plugins, hooks, mcpServers, marketplaces };
}

function scanPlugins(projectPath: string): ScannedPlugin[] {
  const installed = readInstalledPlugins();
  const projectSettings = readProjectSettings(projectPath);
  const userSettings = readUserSettings();

  const projectEnabled = (projectSettings.enabledPlugins ?? {}) as Record<string, boolean>;
  const userEnabled = (userSettings.enabledPlugins ?? {}) as Record<string, boolean>;

  const plugins: ScannedPlugin[] = [];
  const seen = new Set<string>();

  // Scan plugins installed for this project
  for (const [pluginId, entries] of Object.entries(installed.plugins)) {
    for (const entry of entries) {
      if (entry.scope === 'project' && entry.projectPath === projectPath) {
        const { name, marketplace } = parsePluginId(pluginId);
        plugins.push({
          id: pluginId,
          name,
          marketplace,
          version: entry.version,
          source: 'project',
          enabled: projectEnabled[pluginId] === true,
        });
        seen.add(pluginId);
      }
    }
  }

  // Scan user-level plugins (not already in project)
  for (const [pluginId, entries] of Object.entries(installed.plugins)) {
    if (seen.has(pluginId)) continue;
    for (const entry of entries) {
      if (entry.scope === 'user') {
        const { name, marketplace } = parsePluginId(pluginId);
        plugins.push({
          id: pluginId,
          name,
          marketplace,
          version: entry.version,
          source: 'user',
          enabled: userEnabled[pluginId] === true || projectEnabled[pluginId] === true,
        });
        seen.add(pluginId);
      }
    }
  }

  return plugins;
}

function scanHooks(projectPath: string): ScannedHook[] {
  const projectSettings = readProjectSettings(projectPath);
  const userSettings = readUserSettings();
  const hooks: ScannedHook[] = [];

  extractHooks(projectSettings, 'project', hooks);
  extractHooks(userSettings, 'user', hooks);

  return hooks;
}

function extractHooks(
  settings: Record<string, unknown>,
  source: 'project' | 'user',
  hooks: ScannedHook[],
): void {
  const settingsHooks = settings.hooks as
    | Record<string, Array<{ matcher?: string; hooks?: Array<{ type: string; command: string }> }>>
    | undefined;

  if (!settingsHooks) return;

  for (const [event, matchers] of Object.entries(settingsHooks)) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      if (!matcher.hooks) continue;
      for (const hook of matcher.hooks) {
        if (hook.type === 'command' && hook.command) {
          hooks.push({
            event,
            matcher: matcher.matcher || '*',
            command: hook.command,
            source,
          });
        }
      }
    }
  }
}

function scanMcpServers(projectPath: string): ScannedMcpServer[] {
  const servers: ScannedMcpServer[] = [];

  // Check project-level .mcp.json
  const projectMcpPath = join(projectPath, '.mcp.json');
  if (existsSync(projectMcpPath)) {
    const mcpConfig = JSON.parse(readFileSync(projectMcpPath, 'utf-8'));
    extractMcpServers(mcpConfig, 'project', servers);
  }

  // Check project .claude/.mcp.json
  const claudeMcpPath = join(getProjectClaudeDir(projectPath), '.mcp.json');
  if (existsSync(claudeMcpPath)) {
    const mcpConfig = JSON.parse(readFileSync(claudeMcpPath, 'utf-8'));
    extractMcpServers(mcpConfig, 'project', servers);
  }

  // Check user-level .mcp.json
  const userMcpPath = join(CLAUDE_HOME, '.mcp.json');
  if (existsSync(userMcpPath)) {
    const mcpConfig = JSON.parse(readFileSync(userMcpPath, 'utf-8'));
    extractMcpServers(mcpConfig, 'user', servers);
  }

  return servers;
}

function extractMcpServers(
  mcpConfig: Record<string, unknown>,
  source: 'project' | 'user',
  servers: ScannedMcpServer[],
): void {
  const mcpServers = mcpConfig.mcpServers as
    | Record<string, { type?: string; command?: string; args?: string[]; env?: Record<string, string> }>
    | undefined;

  if (!mcpServers) return;

  for (const [name, config] of Object.entries(mcpServers)) {
    servers.push({
      name,
      type: config.type || 'stdio',
      command: config.command || '',
      args: config.args,
      env: config.env,
      source,
    });
  }
}

function scanMarketplaces(): Record<string, MarketplaceSource> {
  const marketplaces: Record<string, MarketplaceSource> = {};

  // From known_marketplaces.json
  const knownPath = join(CLAUDE_HOME, 'plugins', 'known_marketplaces.json');
  if (existsSync(knownPath)) {
    const known = JSON.parse(readFileSync(knownPath, 'utf-8'));
    for (const [name, config] of Object.entries(known as Record<string, { source?: { source: string; repo?: string; url?: string } }>)) {
      if (config.source) {
        marketplaces[name] = config.source as MarketplaceSource;
      }
    }
  }

  // From user settings extraKnownMarketplaces
  const userSettings = readUserSettings();
  const extra = userSettings.extraKnownMarketplaces as
    | Record<string, { source: MarketplaceSource }>
    | undefined;

  if (extra) {
    for (const [name, config] of Object.entries(extra)) {
      if (config.source) {
        marketplaces[name] = config.source;
      }
    }
  }

  // Add known defaults
  if (!marketplaces['claude-plugins-official']) {
    marketplaces['claude-plugins-official'] = {
      source: 'github',
      repo: 'anthropics/claude-plugins',
    };
  }

  return marketplaces;
}

function readUserSettings(): Record<string, unknown> {
  const settingsPath = join(CLAUDE_HOME, 'settings.json');
  if (!existsSync(settingsPath)) return {};
  return JSON.parse(readFileSync(settingsPath, 'utf-8'));
}
