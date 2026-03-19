import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testCacheDir = join(tmpdir(), 'claude-deps-test-clean-cache');
const testPluginsDir = join(testCacheDir, 'plugins');
const testCachePath = join(testPluginsDir, 'cache');
const testInstalledPath = join(testPluginsDir, 'installed_plugins.json');

beforeEach(() => {
  vi.resetModules();
  mkdirSync(testCachePath, { recursive: true });
});

afterEach(() => {
  rmSync(testCacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function setupCache(structure: Record<string, string[]>) {
  for (const [path, files] of Object.entries(structure)) {
    const fullPath = join(testCachePath, path);
    mkdirSync(fullPath, { recursive: true });
    for (const file of files) {
      writeFileSync(join(fullPath, file), 'test content');
    }
  }
}

function mockConfig(installedPlugins: Record<string, Array<{ installPath: string }>>) {
  vi.doMock('../src/lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/lib/config.js')>();
    return {
      ...actual,
      PLUGINS_CACHE: testCachePath,
      PLUGINS_DIR: testPluginsDir,
      INSTALLED_PLUGINS_PATH: testInstalledPath,
      readInstalledPlugins: () => ({
        version: 2,
        plugins: Object.fromEntries(
          Object.entries(installedPlugins).map(([key, entries]) => [
            key,
            entries.map((e) => ({
              scope: 'project',
              projectPath: '/test',
              installPath: e.installPath,
              version: '1.0.0',
              installedAt: '2026-01-01T00:00:00.000Z',
              lastUpdated: '2026-01-01T00:00:00.000Z',
              gitCommitSha: 'abc123',
            })),
          ]),
        ),
      }),
    };
  });
}

describe('cleanCache', () => {
  it('removes orphaned plugin versions', async () => {
    const referencedPath = join(testCachePath, 'mp', 'plugin-a', '1.0.0');
    const orphanedPath = join(testCachePath, 'mp', 'plugin-a', '0.9.0');

    setupCache({
      'mp/plugin-a/1.0.0': ['plugin.json'],
      'mp/plugin-a/0.9.0': ['plugin.json'],
    });

    mockConfig({
      'plugin-a@mp': [{ installPath: referencedPath }],
    });

    const { cleanCache } = await import('../src/lib/installer.js');
    const result = cleanCache();

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toBe('mp/plugin-a/0.9.0');
    expect(existsSync(orphanedPath)).toBe(false);
    expect(existsSync(referencedPath)).toBe(true);
  });

  it('returns empty when cache is clean', async () => {
    const referencedPath = join(testCachePath, 'mp', 'plugin-a', '1.0.0');

    setupCache({
      'mp/plugin-a/1.0.0': ['plugin.json'],
    });

    mockConfig({
      'plugin-a@mp': [{ installPath: referencedPath }],
    });

    const { cleanCache } = await import('../src/lib/installer.js');
    const result = cleanCache();

    expect(result.removed).toHaveLength(0);
  });

  it('dry run does not delete files', async () => {
    const orphanedPath = join(testCachePath, 'mp', 'plugin-a', '0.9.0');

    setupCache({
      'mp/plugin-a/0.9.0': ['plugin.json'],
    });

    mockConfig({});

    const { cleanCache } = await import('../src/lib/installer.js');
    const result = cleanCache(true);

    expect(result.removed).toHaveLength(1);
    expect(existsSync(orphanedPath)).toBe(true); // not deleted
  });

  it('removes empty parent directories after cleaning', async () => {
    setupCache({
      'mp/orphaned-plugin/1.0.0': ['plugin.json'],
    });

    mockConfig({});

    const { cleanCache } = await import('../src/lib/installer.js');
    cleanCache();

    expect(existsSync(join(testCachePath, 'mp', 'orphaned-plugin'))).toBe(false);
    expect(existsSync(join(testCachePath, 'mp'))).toBe(false);
  });
});
