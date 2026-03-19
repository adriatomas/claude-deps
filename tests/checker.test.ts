import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { check } from '../src/lib/checker.js';

const testDir = join(tmpdir(), 'claude-deps-test-checker');
const claudeDir = join(testDir, '.claude');

beforeEach(() => {
  mkdirSync(claudeDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('check', () => {
  it('reports missing plugins', () => {
    writeFileSync(
      join(claudeDir, 'deps.json'),
      JSON.stringify({
        version: 1,
        plugins: {
          'missing-plugin@test': '1.0.0',
        },
        marketplaces: {
          test: { source: 'github', repo: 'test/test' },
        },
      }),
    );

    // Mock readInstalledPlugins to return empty
    vi.mock('../src/lib/config.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/lib/config.js')>();
      return {
        ...actual,
        readInstalledPlugins: () => ({ version: 2, plugins: {} }),
      };
    });

    const result = check(testDir);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('missing-plugin@test');
  });

  it('reports all ok when plugins are installed', () => {
    writeFileSync(
      join(claudeDir, 'deps.json'),
      JSON.stringify({
        version: 1,
        plugins: {
          'installed-plugin@test': '1.0.0',
        },
        marketplaces: {
          test: { source: 'github', repo: 'test/test' },
        },
      }),
    );

    vi.mock('../src/lib/config.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/lib/config.js')>();
      return {
        ...actual,
        readInstalledPlugins: () => ({
          version: 2,
          plugins: {
            'installed-plugin@test': [
              {
                scope: 'project',
                projectPath: testDir,
                installPath: '/tmp/cache/test/installed-plugin/1.0.0',
                version: '1.0.0',
                installedAt: '2026-01-01T00:00:00.000Z',
                lastUpdated: '2026-01-01T00:00:00.000Z',
                gitCommitSha: 'abc123',
              },
            ],
          },
        }),
      };
    });

    const result = check(testDir);
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});
