import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), 'claude-deps-test-scanner');
const claudeDir = join(testDir, '.claude');

beforeEach(() => {
  vi.resetModules();
  mkdirSync(claudeDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockConfig(overrides: {
  installedPlugins?: Record<string, unknown>;
  projectSettings?: Record<string, unknown>;
}) {
  vi.doMock('../src/lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/lib/config.js')>();
    return {
      ...actual,
      CLAUDE_HOME: join(tmpdir(), 'nonexistent-claude-home-' + Date.now()),
      readInstalledPlugins: () => ({
        version: 2,
        plugins: overrides.installedPlugins ?? {},
      }),
      readProjectSettings: () => overrides.projectSettings ?? {},
    };
  });
}

describe('scan', () => {
  it('discovers project plugins from installed_plugins.json', async () => {
    mockConfig({
      installedPlugins: {
        'test-plugin@test-marketplace': [
          {
            scope: 'project',
            projectPath: testDir,
            installPath: '/tmp/cache/test-marketplace/test-plugin/1.0.0',
            version: '1.0.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            lastUpdated: '2026-01-01T00:00:00.000Z',
            gitCommitSha: 'abc123',
          },
        ],
      },
      projectSettings: {
        enabledPlugins: {
          'test-plugin@test-marketplace': true,
        },
      },
    });

    const { scan } = await import('../src/lib/scanner.js');
    const result = scan(testDir);

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]).toMatchObject({
      id: 'test-plugin@test-marketplace',
      source: 'project',
      enabled: true,
      version: '1.0.0',
    });
  });

  it('discovers hooks from project settings', async () => {
    mockConfig({
      projectSettings: {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [
                {
                  type: 'command',
                  command: 'echo hello',
                },
              ],
            },
          ],
        },
      },
    });

    const { scan } = await import('../src/lib/scanner.js');
    const result = scan(testDir);

    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]).toMatchObject({
      event: 'SessionStart',
      command: 'echo hello',
      source: 'project',
    });
  });

  it('discovers MCP servers from .mcp.json', async () => {
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'test-server': {
            type: 'stdio',
            command: 'node',
            args: ['./server.js'],
          },
        },
      }),
    );

    mockConfig({});

    const { scan } = await import('../src/lib/scanner.js');
    const result = scan(testDir);

    expect(result.mcpServers).toHaveLength(1);
    expect(result.mcpServers[0]).toMatchObject({
      name: 'test-server',
      type: 'stdio',
      command: 'node',
      source: 'project',
    });
  });

  it('returns empty results for clean project', async () => {
    mockConfig({});

    const { scan } = await import('../src/lib/scanner.js');
    const result = scan(testDir);

    expect(result.plugins).toHaveLength(0);
    expect(result.hooks).toHaveLength(0);
    expect(result.mcpServers).toHaveLength(0);
  });

  it('distinguishes user vs project plugins', async () => {
    mockConfig({
      installedPlugins: {
        'project-plugin@mp': [
          {
            scope: 'project',
            projectPath: testDir,
            installPath: '/tmp/cache/mp/project-plugin/1.0.0',
            version: '1.0.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            lastUpdated: '2026-01-01T00:00:00.000Z',
            gitCommitSha: 'abc',
          },
        ],
        'user-plugin@mp': [
          {
            scope: 'user',
            installPath: '/tmp/cache/mp/user-plugin/2.0.0',
            version: '2.0.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            lastUpdated: '2026-01-01T00:00:00.000Z',
            gitCommitSha: 'def',
          },
        ],
      },
      projectSettings: {
        enabledPlugins: { 'project-plugin@mp': true },
      },
    });

    const { scan } = await import('../src/lib/scanner.js');
    const result = scan(testDir);

    expect(result.plugins).toHaveLength(2);

    const projectPlugin = result.plugins.find((p) => p.source === 'project');
    const userPlugin = result.plugins.find((p) => p.source === 'user');

    expect(projectPlugin?.id).toBe('project-plugin@mp');
    expect(projectPlugin?.enabled).toBe(true);
    expect(userPlugin?.id).toBe('user-plugin@mp');
    expect(userPlugin?.enabled).toBe(false);
  });
});
