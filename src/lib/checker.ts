import { readManifest, readLockfile } from './manifest.js';
import { readInstalledPlugins } from './config.js';

export interface CheckResult {
  ok: boolean;
  missing: string[];
  outdated: string[];
  extra: string[];
}

export function check(projectPath: string): CheckResult {
  const manifest = readManifest(projectPath);
  const installed = readInstalledPlugins();
  const lockfile = readLockfile(projectPath);

  const missing: string[] = [];
  const outdated: string[] = [];

  if (manifest.plugins) {
    for (const pluginId of Object.keys(manifest.plugins)) {
      const entries = installed.plugins[pluginId];

      if (!entries || entries.length === 0) {
        missing.push(pluginId);
        continue;
      }

      const projectEntry = entries.find(
        (e) => e.scope === 'project' && e.projectPath === projectPath,
      );

      if (!projectEntry) {
        missing.push(pluginId);
        continue;
      }

      if (lockfile?.plugins[pluginId]) {
        const locked = lockfile.plugins[pluginId];
        if (projectEntry.gitCommitSha !== locked.gitCommitSha) {
          outdated.push(pluginId);
        }
      }
    }
  }

  const extra: string[] = [];
  for (const [pluginId, entries] of Object.entries(installed.plugins)) {
    const projectEntry = entries.find(
      (e) => e.scope === 'project' && e.projectPath === projectPath,
    );
    if (projectEntry && !manifest.plugins?.[pluginId]) {
      extra.push(pluginId);
    }
  }

  return {
    ok: missing.length === 0 && outdated.length === 0,
    missing,
    outdated,
    extra,
  };
}
