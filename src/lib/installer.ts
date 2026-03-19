import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  INSTALLED_PLUGINS_PATH,
  PLUGINS_DIR,
  PLUGINS_CACHE,
  readInstalledPlugins,
  readProjectSettings,
  getProjectSettingsPath,
} from './config.js';
import { getPluginCachePath, type ResolvedPlugin } from './resolver.js';

export function installPlugin(
  resolved: ResolvedPlugin,
  projectPath: string,
): void {
  const cachePath = getPluginCachePath(resolved.marketplace, resolved.name, resolved.version);

  if (!existsSync(cachePath)) {
    mkdirSync(cachePath, { recursive: true });
    cpSync(resolved.sourcePath, cachePath, { recursive: true });
  }

  registerPlugin(resolved, projectPath, cachePath);
  enablePluginInProject(resolved, projectPath);
}

function registerPlugin(
  resolved: ResolvedPlugin,
  projectPath: string,
  cachePath: string,
): void {
  const installed = readInstalledPlugins();
  const pluginKey = `${resolved.name}@${resolved.marketplace}`;
  const now = new Date().toISOString();

  const entry = {
    scope: 'project' as const,
    projectPath,
    installPath: cachePath,
    version: resolved.version,
    installedAt: now,
    lastUpdated: now,
    gitCommitSha: resolved.gitCommitSha,
  };

  if (!installed.plugins[pluginKey]) {
    installed.plugins[pluginKey] = [];
  }

  const existingIndex = installed.plugins[pluginKey].findIndex(
    (e) => e.scope === 'project' && e.projectPath === projectPath,
  );

  if (existingIndex >= 0) {
    installed.plugins[pluginKey][existingIndex] = entry;
  } else {
    installed.plugins[pluginKey].push(entry);
  }

  mkdirSync(PLUGINS_DIR, { recursive: true });
  writeFileSync(INSTALLED_PLUGINS_PATH, JSON.stringify(installed, null, 2) + '\n');
}

function enablePluginInProject(resolved: ResolvedPlugin, projectPath: string): void {
  const settings = readProjectSettings(projectPath);
  const pluginKey = `${resolved.name}@${resolved.marketplace}`;

  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }

  settings.enabledPlugins[pluginKey] = true;

  const settingsPath = getProjectSettingsPath(projectPath);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function uninstallPlugin(
  pluginName: string,
  marketplace: string,
  projectPath: string,
): void {
  const pluginKey = `${pluginName}@${marketplace}`;

  const installed = readInstalledPlugins();
  if (installed.plugins[pluginKey]) {
    installed.plugins[pluginKey] = installed.plugins[pluginKey].filter(
      (e) => !(e.scope === 'project' && e.projectPath === projectPath),
    );
    if (installed.plugins[pluginKey].length === 0) {
      delete installed.plugins[pluginKey];
    }
    writeFileSync(INSTALLED_PLUGINS_PATH, JSON.stringify(installed, null, 2) + '\n');
  }

  const settings = readProjectSettings(projectPath);
  if (settings.enabledPlugins?.[pluginKey]) {
    delete settings.enabledPlugins[pluginKey];
    const settingsPath = getProjectSettingsPath(projectPath);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
}

export interface CleanResult {
  removed: string[];
  freedBytes: number;
}

export function cleanCache(dryRun = false): CleanResult {
  const installed = readInstalledPlugins();
  const result: CleanResult = { removed: [], freedBytes: 0 };

  if (!existsSync(PLUGINS_CACHE)) return result;

  // Collect all referenced cache paths
  const referencedPaths = new Set<string>();
  for (const entries of Object.values(installed.plugins)) {
    for (const entry of entries) {
      referencedPaths.add(entry.installPath);
    }
  }

  // Walk the cache: cache/<marketplace>/<plugin>/<version>/
  const marketplaces = safeReaddir(PLUGINS_CACHE);
  for (const marketplace of marketplaces) {
    const marketplacePath = join(PLUGINS_CACHE, marketplace);
    const plugins = safeReaddir(marketplacePath);
    for (const plugin of plugins) {
      const pluginPath = join(marketplacePath, plugin);
      const versions = safeReaddir(pluginPath);
      for (const version of versions) {
        const versionPath = join(pluginPath, version);
        if (!referencedPaths.has(versionPath)) {
          const size = getDirSize(versionPath);
          if (!dryRun) {
            rmSync(versionPath, { recursive: true, force: true });
          }
          result.removed.push(`${marketplace}/${plugin}/${version}`);
          result.freedBytes += size;
        }
      }
      // Remove empty plugin dir
      if (!dryRun && safeReaddir(pluginPath).length === 0) {
        rmSync(pluginPath, { recursive: true, force: true });
      }
    }
    // Remove empty marketplace dir
    if (!dryRun && safeReaddir(marketplacePath).length === 0) {
      rmSync(marketplacePath, { recursive: true, force: true });
    }
  }

  return result;
}

function safeReaddir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => !f.startsWith('.'));
}

function getDirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let size = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      try {
        size += statSync(fullPath).size;
      } catch {
        // skip unreadable files
      }
    }
  }
  return size;
}
