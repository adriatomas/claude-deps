import { cpSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import {
  INSTALLED_PLUGINS_PATH,
  PLUGINS_DIR,
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
