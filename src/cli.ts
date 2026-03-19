#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { readManifest, writeManifest, writeLockfile, readLockfile, parsePluginId } from './lib/manifest.js';
import { ensureMarketplace, resolvePlugin } from './lib/resolver.js';
import { installPlugin, uninstallPlugin } from './lib/installer.js';
import { check } from './lib/checker.js';
import { installMcpDependencies } from './lib/mcp.js';
import { installHook, removeHook, validateHooks } from './lib/hooks.js';
import { getProjectClaudeDir, readInstalledPlugins, readProjectSettings } from './lib/config.js';
import type { Manifest, LockFile } from './lib/types.js';

const program = new Command();

program
  .name('claude-deps')
  .description('Dependency manager for Claude Code — sync plugins, hooks, and MCP servers across your team')
  .version('0.1.0');

// --- init ---
program
  .command('init')
  .description('Initialize deps.json by scanning current project setup')
  .action(() => {
    const projectPath = resolve(process.cwd());
    const claudeDir = getProjectClaudeDir(projectPath);

    mkdirSync(claudeDir, { recursive: true });

    const installed = readInstalledPlugins();
    const settings = readProjectSettings(projectPath);

    const plugins: Record<string, string> = {};
    const marketplaces: Record<string, { source: 'github' | 'git'; repo?: string }> = {};

    if (settings.enabledPlugins) {
      for (const pluginId of Object.keys(settings.enabledPlugins)) {
        const entries = installed.plugins[pluginId];
        if (entries) {
          const projectEntry = entries.find(
            (e) =>
              (e.scope === 'project' && e.projectPath === projectPath) ||
              e.scope === 'user',
          );
          if (projectEntry) {
            plugins[pluginId] = projectEntry.version;
            const { marketplace } = parsePluginId(pluginId);
            if (!marketplaces[marketplace]) {
              marketplaces[marketplace] = inferMarketplaceSource(marketplace);
            }
          }
        }
      }
    }

    const manifest: Manifest = {
      $schema: 'https://unpkg.com/claude-deps/schema.json',
      version: 1,
      plugins: Object.keys(plugins).length > 0 ? plugins : undefined,
      marketplaces: Object.keys(marketplaces).length > 0 ? marketplaces : undefined,
      hooks: { validate: true },
    };

    writeManifest(projectPath, manifest);
    console.log('Created .claude/deps.json');

    if (Object.keys(plugins).length > 0) {
      console.log(`  Found ${Object.keys(plugins).length} plugin(s):`);
      for (const [id, version] of Object.entries(plugins)) {
        console.log(`    - ${id}: ${version}`);
      }
    }
  });

// --- install ---
program
  .command('install')
  .description('Install all dependencies from deps.json')
  .action(() => {
    const projectPath = resolve(process.cwd());
    const manifest = readManifest(projectPath);
    const lockfile: LockFile = readLockfile(projectPath) || {
      lockVersion: 1,
      plugins: {},
    };

    let installedCount = 0;

    if (manifest.plugins && manifest.marketplaces) {
      for (const [pluginId, requestedVersion] of Object.entries(manifest.plugins)) {
        const { name, marketplace } = parsePluginId(pluginId);
        const marketplaceSource = manifest.marketplaces[marketplace];

        if (!marketplaceSource) {
          console.error(`  Marketplace '${marketplace}' not defined for plugin '${pluginId}'`);
          continue;
        }

        console.log(`  Installing ${pluginId}...`);

        try {
          const marketplacePath = ensureMarketplace(marketplace, marketplaceSource);
          const resolved = resolvePlugin(name, marketplace, requestedVersion, marketplacePath);
          installPlugin(resolved, projectPath);

          lockfile.plugins[pluginId] = {
            version: resolved.version,
            gitCommitSha: resolved.gitCommitSha,
            resolvedAt: new Date().toISOString(),
            marketplace,
          };

          console.log(`  Installed ${pluginId}@${resolved.version}`);
          installedCount++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`  Failed ${pluginId}: ${message}`);
        }
      }
    }

    if (manifest.mcp) {
      console.log('\n  Installing MCP dependencies...');
      installMcpDependencies(manifest.mcp, projectPath);
    }

    if (manifest.hooks?.validate) {
      const hookResult = validateHooks(projectPath);
      if (!hookResult.valid) {
        console.log('\n  Hook issues:');
        for (const issue of hookResult.issues) {
          console.log(`    Warning: ${issue}`);
        }
      }
    }

    writeLockfile(projectPath, lockfile);
    console.log(`\nInstalled ${installedCount} plugin(s)`);
  });

// --- check ---
program
  .command('check')
  .description('Verify installed state matches deps.json')
  .action(() => {
    const projectPath = resolve(process.cwd());
    const result = check(projectPath);

    if (result.ok && result.extra.length === 0) {
      console.log('All dependencies are installed and up to date');
      process.exit(0);
    }

    if (result.missing.length > 0) {
      console.log('Missing plugins:');
      for (const id of result.missing) {
        console.log(`    - ${id}`);
      }
    }

    if (result.outdated.length > 0) {
      console.log('Outdated plugins:');
      for (const id of result.outdated) {
        console.log(`    - ${id}`);
      }
    }

    if (result.extra.length > 0) {
      console.log('Extra plugins (not in manifest):');
      for (const id of result.extra) {
        console.log(`    - ${id}`);
      }
    }

    if (result.missing.length > 0 || result.outdated.length > 0) {
      console.log('\nRun: npx claude-deps install');
      process.exit(1);
    }
  });

// --- add ---
program
  .command('add <plugin>')
  .description('Add a plugin to deps.json and install it')
  .option('-v, --version <version>', 'Plugin version', 'latest')
  .action((plugin: string, options: { version: string }) => {
    const projectPath = resolve(process.cwd());
    const manifest = readManifest(projectPath);

    if (!manifest.plugins) manifest.plugins = {};
    if (!manifest.marketplaces) manifest.marketplaces = {};

    const { name, marketplace } = parsePluginId(plugin);

    if (!manifest.marketplaces[marketplace]) {
      manifest.marketplaces[marketplace] = inferMarketplaceSource(marketplace);
    }

    manifest.plugins[plugin] = options.version;
    writeManifest(projectPath, manifest);

    const marketplaceSource = manifest.marketplaces[marketplace];
    const marketplacePath = ensureMarketplace(marketplace, marketplaceSource);
    const resolved = resolvePlugin(name, marketplace, options.version, marketplacePath);
    installPlugin(resolved, projectPath);

    const lockfile = readLockfile(projectPath) || { lockVersion: 1, plugins: {} };
    lockfile.plugins[plugin] = {
      version: resolved.version,
      gitCommitSha: resolved.gitCommitSha,
      resolvedAt: new Date().toISOString(),
      marketplace,
    };
    writeLockfile(projectPath, lockfile);

    console.log(`Added ${plugin}@${resolved.version}`);
  });

// --- remove ---
program
  .command('remove <plugin>')
  .description('Remove a plugin from deps.json and uninstall it')
  .action((plugin: string) => {
    const projectPath = resolve(process.cwd());
    const manifest = readManifest(projectPath);

    if (!manifest.plugins?.[plugin]) {
      console.error(`Plugin '${plugin}' not in deps.json`);
      process.exit(1);
    }

    const { name, marketplace } = parsePluginId(plugin);

    delete manifest.plugins[plugin];
    writeManifest(projectPath, manifest);

    uninstallPlugin(name, marketplace, projectPath);

    const lockfile = readLockfile(projectPath);
    if (lockfile?.plugins[plugin]) {
      delete lockfile.plugins[plugin];
      writeLockfile(projectPath, lockfile);
    }

    console.log(`Removed ${plugin}`);
  });

// --- update ---
program
  .command('update')
  .description('Update plugins to latest compatible versions')
  .action(() => {
    const projectPath = resolve(process.cwd());
    const manifest = readManifest(projectPath);
    const lockfile: LockFile = { lockVersion: 1, plugins: {} };

    if (!manifest.plugins || !manifest.marketplaces) {
      console.log('No plugins to update');
      return;
    }

    let updatedCount = 0;

    for (const [pluginId, requestedVersion] of Object.entries(manifest.plugins)) {
      const { name, marketplace } = parsePluginId(pluginId);
      const marketplaceSource = manifest.marketplaces[marketplace];

      if (!marketplaceSource) continue;

      try {
        const marketplacePath = ensureMarketplace(marketplace, marketplaceSource);
        const resolved = resolvePlugin(name, marketplace, requestedVersion, marketplacePath);
        installPlugin(resolved, projectPath);

        lockfile.plugins[pluginId] = {
          version: resolved.version,
          gitCommitSha: resolved.gitCommitSha,
          resolvedAt: new Date().toISOString(),
          marketplace,
        };

        console.log(`  Updated ${pluginId}@${resolved.version}`);
        updatedCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Failed ${pluginId}: ${message}`);
      }
    }

    writeLockfile(projectPath, lockfile);
    console.log(`\nUpdated ${updatedCount} plugin(s)`);
  });

// --- hook ---
const hookCmd = program
  .command('hook')
  .description('Manage the SessionStart verification hook');

hookCmd
  .command('install')
  .description('Add SessionStart hook to verify deps on Claude launch')
  .action(() => {
    const projectPath = resolve(process.cwd());
    installHook(projectPath);
    console.log('SessionStart hook installed');
  });

hookCmd
  .command('remove')
  .description('Remove the SessionStart verification hook')
  .action(() => {
    const projectPath = resolve(process.cwd());
    removeHook(projectPath);
    console.log('SessionStart hook removed');
  });

// --- helpers ---
function inferMarketplaceSource(marketplace: string): {
  source: 'github';
  repo: string;
} {
  const known: Record<string, string> = {
    'claude-plugins-official': 'anthropics/claude-plugins',
  };

  if (known[marketplace]) {
    return { source: 'github', repo: known[marketplace] };
  }

  return { source: 'github', repo: `${marketplace}/${marketplace}` };
}

program.parse();
