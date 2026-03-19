#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { checkbox, confirm } from './lib/prompts.js';
import { readManifest, writeManifest, writeLockfile, readLockfile, parsePluginId } from './lib/manifest.js';
import { ensureMarketplace, resolvePlugin } from './lib/resolver.js';
import { installPlugin, uninstallPlugin } from './lib/installer.js';
import { check } from './lib/checker.js';
import { installMcpDependencies } from './lib/mcp.js';
import { installHook, removeHook, validateHooks } from './lib/hooks.js';
import { getProjectClaudeDir } from './lib/config.js';
import { scan } from './lib/scanner.js';
import type { Manifest, LockFile, MarketplaceSource, McpServerConfig } from './lib/types.js';

const program = new Command();

program
  .name('claude-deps')
  .description('Dependency manager for Claude Code — sync plugins, hooks, and MCP servers across your team')
  .version('0.1.0');

// --- init ---
program
  .command('init')
  .description('Initialize deps.json by scanning current project setup')
  .option('-y, --yes', 'Accept all defaults without prompting')
  .action(async (options: { yes?: boolean }) => {
    const projectPath = resolve(process.cwd());
    const claudeDir = getProjectClaudeDir(projectPath);

    mkdirSync(claudeDir, { recursive: true });

    console.log('Scanning Claude Code configuration...\n');
    const scanResult = scan(projectPath);

    const selectedPlugins: Record<string, string> = {};
    const selectedMarketplaces: Record<string, MarketplaceSource> = {};
    const selectedMcp: Record<string, McpServerConfig> = {};
    let includeHookValidation = true;

    // --- Plugins ---
    if (scanResult.plugins.length > 0) {
      console.log(`Found ${scanResult.plugins.length} plugin(s):\n`);

      const pluginChoices = scanResult.plugins.map((p) => ({
        name: `${p.id} (${p.version}) [${p.source}]${p.enabled ? '' : ' (disabled)'}`,
        value: p.id,
        checked: options.yes || p.enabled,
      }));

      let chosen: string[];
      if (options.yes) {
        chosen = pluginChoices.filter((c) => c.checked).map((c) => c.value);
        for (const id of chosen) {
          console.log(`  + ${id}`);
        }
      } else {
        chosen = await checkbox({
          message: 'Select plugins to include in the manifest:',
          choices: pluginChoices,
        });
      }

      for (const pluginId of chosen) {
        const plugin = scanResult.plugins.find((p) => p.id === pluginId)!;
        selectedPlugins[pluginId] = plugin.version;
        if (!selectedMarketplaces[plugin.marketplace]) {
          selectedMarketplaces[plugin.marketplace] =
            scanResult.marketplaces[plugin.marketplace] ||
            inferMarketplaceSource(plugin.marketplace);
        }
      }
    } else {
      console.log('No plugins found.\n');
    }

    // --- Hooks ---
    if (scanResult.hooks.length > 0) {
      console.log(`\nFound ${scanResult.hooks.length} hook(s):\n`);

      for (const hook of scanResult.hooks) {
        const label = `[${hook.source}] ${hook.event}${hook.matcher !== '*' ? ` (${hook.matcher})` : ''}: ${truncate(hook.command, 60)}`;
        console.log(`  ${label}`);
      }

      if (!options.yes) {
        includeHookValidation = await confirm({
          message: '\nEnable hook validation in the manifest?',
          default: true,
        });
      }
    }

    // --- MCP Servers ---
    if (scanResult.mcpServers.length > 0) {
      console.log(`\nFound ${scanResult.mcpServers.length} MCP server(s):\n`);

      const mcpChoices = scanResult.mcpServers.map((s) => ({
        name: `${s.name} (${s.type}) [${s.source}] — ${s.command}`,
        value: s.name,
        checked: options.yes || s.source === 'project',
      }));

      let chosenMcp: string[];
      if (options.yes) {
        chosenMcp = mcpChoices.filter((c) => c.checked).map((c) => c.value);
        for (const name of chosenMcp) {
          console.log(`  + ${name}`);
        }
      } else {
        chosenMcp = await checkbox({
          message: 'Select MCP servers to include:',
          choices: mcpChoices,
        });
      }

      for (const serverName of chosenMcp) {
        const server = scanResult.mcpServers.find((s) => s.name === serverName)!;
        selectedMcp[serverName] = {
          type: server.type as 'stdio' | 'http' | 'sse',
          command: server.command,
          ...(server.args?.length ? { args: server.args } : {}),
          ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        };
      }
    }

    // --- Build manifest ---
    const manifest: Manifest = {
      $schema: 'https://unpkg.com/claude-deps/schema.json',
      version: 1,
      ...(Object.keys(selectedPlugins).length > 0 ? { plugins: selectedPlugins } : {}),
      ...(Object.keys(selectedMarketplaces).length > 0
        ? { marketplaces: selectedMarketplaces }
        : {}),
      ...(Object.keys(selectedMcp).length > 0
        ? { mcp: { servers: selectedMcp } }
        : {}),
      hooks: { validate: includeHookValidation },
    };

    writeManifest(projectPath, manifest);

    const pluginCount = Object.keys(selectedPlugins).length;
    const mcpCount = Object.keys(selectedMcp).length;
    console.log(
      `\nCreated .claude/deps.json (${pluginCount} plugin(s), ${mcpCount} MCP server(s))`,
    );
    console.log('Next steps:');
    console.log('  npx claude-deps install       # Install everything');
    console.log('  npx claude-deps hook install   # Add SessionStart guard');
    console.log('  git add .claude/deps.json      # Commit to share with your team');
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

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}

program.parse();
