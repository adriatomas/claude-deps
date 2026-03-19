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
import * as ui from './lib/ui.js';
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

    ui.banner();
    ui.info('Scanning Claude Code configuration...');
    console.log();

    const scanResult = scan(projectPath);

    const selectedPlugins: Record<string, string> = {};
    const selectedMarketplaces: Record<string, MarketplaceSource> = {};
    const selectedMcp: Record<string, McpServerConfig> = {};
    let includeHookValidation = true;

    // --- Plugins ---
    if (scanResult.plugins.length > 0) {
      ui.sectionHeader('Plugins', scanResult.plugins.length);

      if (options.yes) {
        const enabled = scanResult.plugins.filter((p) => p.enabled);
        for (const p of enabled) {
          ui.success(ui.pluginLabel(p.id, p.version, p.source, p.enabled));
        }
        for (const p of enabled) {
          selectedPlugins[p.id] = p.version;
          if (!selectedMarketplaces[p.marketplace]) {
            selectedMarketplaces[p.marketplace] =
              scanResult.marketplaces[p.marketplace] || inferMarketplaceSource(p.marketplace);
          }
        }
      } else {
        const pluginChoices = scanResult.plugins.map((p) => ({
          name: ui.pluginLabel(p.id, p.version, p.source, p.enabled),
          value: p.id,
          checked: p.enabled,
        }));

        const chosen = await checkbox({
          message: 'Select plugins to include:',
          choices: pluginChoices,
        });

        for (const pluginId of chosen) {
          const plugin = scanResult.plugins.find((p) => p.id === pluginId)!;
          selectedPlugins[pluginId] = plugin.version;
          if (!selectedMarketplaces[plugin.marketplace]) {
            selectedMarketplaces[plugin.marketplace] =
              scanResult.marketplaces[plugin.marketplace] ||
              inferMarketplaceSource(plugin.marketplace);
          }
        }
      }
      console.log();
    }

    // --- Hooks ---
    if (scanResult.hooks.length > 0) {
      ui.sectionHeader('Hooks', scanResult.hooks.length);

      for (let i = 0; i < scanResult.hooks.length; i++) {
        const hook = scanResult.hooks[i];
        const label = ui.hookLabel(hook.event, hook.matcher, hook.command, hook.source);
        if (i === scanResult.hooks.length - 1) {
          ui.lastItem(label, 4);
        } else {
          ui.listItem(label, 4);
        }
      }
      console.log();

      if (!options.yes) {
        includeHookValidation = await confirm({
          message: 'Enable hook validation?',
          default: true,
        });
      }
      console.log();
    }

    // --- MCP Servers ---
    if (scanResult.mcpServers.length > 0) {
      ui.sectionHeader('MCP Servers', scanResult.mcpServers.length);

      if (options.yes) {
        const projectServers = scanResult.mcpServers.filter((s) => s.source === 'project');
        for (const s of projectServers) {
          ui.success(ui.mcpLabel(s.name, s.type, s.command, s.source));
        }
        for (const s of projectServers) {
          selectedMcp[s.name] = {
            type: s.type as 'stdio' | 'http' | 'sse',
            command: s.command,
            ...(s.args?.length ? { args: s.args } : {}),
            ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
          };
        }
      } else {
        const mcpChoices = scanResult.mcpServers.map((s) => ({
          name: ui.mcpLabel(s.name, s.type, s.command, s.source),
          value: s.name,
          checked: s.source === 'project',
        }));

        const chosenMcp = await checkbox({
          message: 'Select MCP servers to include:',
          choices: mcpChoices,
        });

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
      console.log();
    }

    // --- Build manifest ---
    const manifest: Manifest = {
      $schema: 'https://unpkg.com/claude-deps/schema.json',
      version: 1,
      ...(Object.keys(selectedPlugins).length > 0 ? { plugins: selectedPlugins } : {}),
      ...(Object.keys(selectedMarketplaces).length > 0
        ? { marketplaces: selectedMarketplaces }
        : {}),
      ...(Object.keys(selectedMcp).length > 0 ? { mcp: { servers: selectedMcp } } : {}),
      hooks: { validate: includeHookValidation },
    };

    writeManifest(projectPath, manifest);

    const pluginCount = Object.keys(selectedPlugins).length;
    const mcpCount = Object.keys(selectedMcp).length;

    ui.divider();
    console.log();
    ui.success(
      `Created ${ui.bold('.claude/deps.json')} ${ui.dim(`(${pluginCount} plugins, ${mcpCount} MCP servers)`)}`,
    );

    ui.nextSteps([
      `${ui.cyan('npx claude-deps install')}     ${ui.dim('Install everything')}`,
      `${ui.cyan('npx claude-deps hook install')} ${ui.dim('Add SessionStart guard')}`,
      `${ui.cyan('git add .claude/deps.json')}    ${ui.dim('Commit to share with your team')}`,
    ]);
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

    ui.banner();

    let installedCount = 0;

    if (manifest.plugins && manifest.marketplaces) {
      ui.sectionHeader('Installing plugins', Object.keys(manifest.plugins).length);

      for (const [pluginId, requestedVersion] of Object.entries(manifest.plugins)) {
        const { name, marketplace } = parsePluginId(pluginId);
        const marketplaceSource = manifest.marketplaces[marketplace];

        if (!marketplaceSource) {
          ui.error(`Marketplace '${marketplace}' not defined for ${ui.bold(pluginId)}`);
          continue;
        }

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

          ui.success(`${ui.bold(name)}${ui.dim(`@${marketplace}`)} ${ui.dim(resolved.version)}`);
          installedCount++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          ui.error(`${ui.bold(name)}${ui.dim(`@${marketplace}`)} ${ui.red(message)}`);
        }
      }
      console.log();
    }

    if (manifest.mcp) {
      ui.sectionHeader('MCP dependencies');
      installMcpDependencies(manifest.mcp, projectPath);
      console.log();
    }

    if (manifest.hooks?.validate) {
      const hookResult = validateHooks(projectPath);
      if (!hookResult.valid) {
        ui.sectionHeader('Hook issues');
        for (const issue of hookResult.issues) {
          ui.warning(issue);
        }
        console.log();
      }
    }

    writeLockfile(projectPath, lockfile);

    ui.divider();
    console.log();
    ui.success(`Installed ${ui.bold(String(installedCount))} plugin(s)`);
    console.log();
  });

// --- check ---
program
  .command('check')
  .description('Verify installed state matches deps.json')
  .action(() => {
    const projectPath = resolve(process.cwd());
    const result = check(projectPath);

    if (result.ok && result.extra.length === 0) {
      ui.success('All dependencies are installed and up to date');
      process.exit(0);
    }

    if (result.missing.length > 0) {
      console.log();
      ui.sectionHeader('Missing', result.missing.length);
      for (const id of result.missing) {
        ui.error(id);
      }
    }

    if (result.outdated.length > 0) {
      console.log();
      ui.sectionHeader('Outdated', result.outdated.length);
      for (const id of result.outdated) {
        ui.warning(id);
      }
    }

    if (result.extra.length > 0) {
      console.log();
      ui.sectionHeader('Extra (not in manifest)', result.extra.length);
      for (const id of result.extra) {
        ui.info(id);
      }
    }

    if (result.missing.length > 0 || result.outdated.length > 0) {
      console.log();
      ui.info(`Run ${ui.cyan('npx claude-deps install')} to fix`);
      console.log();
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

    ui.success(`Added ${ui.bold(name)}${ui.dim(`@${marketplace}`)} ${ui.dim(resolved.version)}`);
  });

// --- remove ---
program
  .command('remove <plugin>')
  .description('Remove a plugin from deps.json and uninstall it')
  .action((plugin: string) => {
    const projectPath = resolve(process.cwd());
    const manifest = readManifest(projectPath);

    if (!manifest.plugins?.[plugin]) {
      ui.error(`Plugin '${plugin}' not in deps.json`);
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

    ui.success(`Removed ${ui.bold(name)}${ui.dim(`@${marketplace}`)}`);
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
      ui.info('No plugins to update');
      return;
    }

    ui.banner();
    ui.sectionHeader('Updating plugins');

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

        ui.success(`${ui.bold(name)}${ui.dim(`@${marketplace}`)} ${ui.dim(resolved.version)}`);
        updatedCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        ui.error(`${ui.bold(name)}${ui.dim(`@${marketplace}`)} ${ui.red(message)}`);
      }
    }

    writeLockfile(projectPath, lockfile);

    console.log();
    ui.divider();
    console.log();
    ui.success(`Updated ${ui.bold(String(updatedCount))} plugin(s)`);
    console.log();
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
    ui.success('SessionStart hook installed');
  });

hookCmd
  .command('remove')
  .description('Remove the SessionStart verification hook')
  .action(() => {
    const projectPath = resolve(process.cwd());
    removeHook(projectPath);
    ui.success('SessionStart hook removed');
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
