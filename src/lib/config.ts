import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { InstalledPlugins, ClaudeSettings } from './types.js';

export const CLAUDE_HOME = join(homedir(), '.claude');
export const PLUGINS_DIR = join(CLAUDE_HOME, 'plugins');
export const PLUGINS_CACHE = join(PLUGINS_DIR, 'cache');
export const INSTALLED_PLUGINS_PATH = join(PLUGINS_DIR, 'installed_plugins.json');
export const MARKETPLACES_DIR = join(PLUGINS_DIR, 'marketplaces');
export const KNOWN_MARKETPLACES_PATH = join(PLUGINS_DIR, 'known_marketplaces.json');

export const MANIFEST_FILENAME = 'deps.json';
export const LOCKFILE_FILENAME = 'deps-lock.json';
export const CLAUDE_DIR = '.claude';

export function getProjectClaudeDir(projectPath: string): string {
  return join(projectPath, CLAUDE_DIR);
}

export function getManifestPath(projectPath: string): string {
  return join(getProjectClaudeDir(projectPath), MANIFEST_FILENAME);
}

export function getLockfilePath(projectPath: string): string {
  return join(getProjectClaudeDir(projectPath), LOCKFILE_FILENAME);
}

export function getProjectSettingsPath(projectPath: string): string {
  return join(getProjectClaudeDir(projectPath), 'settings.json');
}

export function readInstalledPlugins(): InstalledPlugins {
  if (!existsSync(INSTALLED_PLUGINS_PATH)) {
    return { version: 2, plugins: {} };
  }
  return JSON.parse(readFileSync(INSTALLED_PLUGINS_PATH, 'utf-8'));
}

export function readProjectSettings(projectPath: string): ClaudeSettings {
  const settingsPath = getProjectSettingsPath(projectPath);
  if (!existsSync(settingsPath)) {
    return {};
  }
  return JSON.parse(readFileSync(settingsPath, 'utf-8'));
}
