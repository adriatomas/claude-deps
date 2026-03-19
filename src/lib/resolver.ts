import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { MARKETPLACES_DIR, PLUGINS_CACHE } from './config.js';
import type { MarketplaceSource } from './types.js';

export interface ResolvedPlugin {
  name: string;
  marketplace: string;
  version: string;
  gitCommitSha: string;
  sourcePath: string;
}

function getMarketplacePath(name: string): string {
  return join(MARKETPLACES_DIR, name);
}

function getMarketplaceRepoUrl(source: MarketplaceSource): string {
  if (source.source === 'github') {
    return `https://github.com/${source.repo}.git`;
  }
  return source.url!;
}

export function ensureMarketplace(name: string, source: MarketplaceSource): string {
  const marketplacePath = getMarketplacePath(name);

  if (existsSync(join(marketplacePath, '.git'))) {
    try {
      execSync('git pull --ff-only', { cwd: marketplacePath, stdio: 'pipe' });
    } catch {
      // If pull fails, continue with what we have
    }
    return marketplacePath;
  }

  mkdirSync(marketplacePath, { recursive: true });
  const repoUrl = getMarketplaceRepoUrl(source);
  execSync(`git clone "${repoUrl}" "${marketplacePath}"`, { stdio: 'pipe' });

  return marketplacePath;
}

export function resolvePlugin(
  pluginName: string,
  marketplace: string,
  requestedVersion: string,
  marketplacePath: string,
): ResolvedPlugin {
  const gitCommitSha = execSync('git rev-parse HEAD', {
    cwd: marketplacePath,
    encoding: 'utf-8',
  }).trim();

  const pluginDir = findPluginInMarketplace(pluginName, marketplacePath);
  if (!pluginDir) {
    throw new Error(`Plugin '${pluginName}' not found in marketplace '${marketplace}'`);
  }

  let version = requestedVersion;

  const pluginJsonPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  if (existsSync(pluginJsonPath)) {
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
    if (pluginJson.version) {
      version = pluginJson.version;
    }
  }

  if (requestedVersion === 'latest') {
    version = version !== 'latest' ? version : gitCommitSha.substring(0, 12);
  }

  return {
    name: pluginName,
    marketplace,
    version,
    gitCommitSha,
    sourcePath: pluginDir,
  };
}

function findPluginInMarketplace(pluginName: string, marketplacePath: string): string | null {
  const directPath = join(marketplacePath, 'plugins', pluginName);
  if (existsSync(directPath)) return directPath;

  const externalPath = join(marketplacePath, 'external_plugins', pluginName);
  if (existsSync(externalPath)) return externalPath;

  const rootPluginJson = join(marketplacePath, '.claude-plugin', 'plugin.json');
  if (existsSync(rootPluginJson)) {
    const pluginJson = JSON.parse(readFileSync(rootPluginJson, 'utf-8'));
    if (pluginJson.name === pluginName) return marketplacePath;
  }

  return null;
}

export function getPluginCachePath(
  marketplace: string,
  pluginName: string,
  version: string,
): string {
  return join(PLUGINS_CACHE, marketplace, pluginName, version);
}
