export { readManifest, writeManifest, readLockfile, writeLockfile, parsePluginId } from './lib/manifest.js';
export { ensureMarketplace, resolvePlugin } from './lib/resolver.js';
export { installPlugin, uninstallPlugin } from './lib/installer.js';
export { check } from './lib/checker.js';
export type { CheckResult } from './lib/checker.js';
export { installMcpDependencies } from './lib/mcp.js';
export { installHook, removeHook, validateHooks } from './lib/hooks.js';
export { scan } from './lib/scanner.js';
export type { ScannedPlugin, ScannedHook, ScannedMcpServer, ScanResult } from './lib/scanner.js';
export type {
  Manifest,
  MarketplaceSource,
  McpConfig,
  McpServerConfig,
  HooksConfig,
  LockFile,
  LockEntry,
  InstalledPlugins,
  InstalledPluginEntry,
  ClaudeSettings,
} from './lib/types.js';
export {
  CLAUDE_HOME,
  PLUGINS_DIR,
  PLUGINS_CACHE,
  INSTALLED_PLUGINS_PATH,
  MARKETPLACES_DIR,
  MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  CLAUDE_DIR,
  getProjectClaudeDir,
  getManifestPath,
  getLockfilePath,
  getProjectSettingsPath,
  readInstalledPlugins,
  readProjectSettings,
} from './lib/config.js';
