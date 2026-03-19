import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeManifest, readManifest, writeLockfile, readLockfile, parsePluginId } from '../src/lib/manifest.js';
import type { Manifest } from '../src/lib/types.js';

const testDir = join(tmpdir(), 'claude-deps-test-manifest');
const claudeDir = join(testDir, '.claude');

beforeEach(() => {
  mkdirSync(claudeDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('parsePluginId', () => {
  it('parses valid plugin ID', () => {
    const result = parsePluginId('typescript-lsp@claude-plugins-official');
    expect(result).toEqual({
      name: 'typescript-lsp',
      marketplace: 'claude-plugins-official',
    });
  });

  it('throws on invalid plugin ID', () => {
    expect(() => parsePluginId('no-marketplace')).toThrow('Invalid plugin ID');
  });

  it('handles @ in plugin name', () => {
    const result = parsePluginId('@scoped/plugin@marketplace');
    expect(result).toEqual({
      name: '@scoped/plugin',
      marketplace: 'marketplace',
    });
  });
});

describe('writeManifest / readManifest', () => {
  it('writes and reads a manifest', () => {
    const manifest: Manifest = {
      version: 1,
      plugins: {
        'test-plugin@test-marketplace': '1.0.0',
      },
      marketplaces: {
        'test-marketplace': {
          source: 'github',
          repo: 'test/test',
        },
      },
      hooks: { validate: true },
    };

    writeManifest(testDir, manifest);
    const read = readManifest(testDir);

    expect(read.version).toBe(1);
    expect(read.plugins?.['test-plugin@test-marketplace']).toBe('1.0.0');
  });

  it('throws when manifest does not exist', () => {
    const emptyDir = join(tmpdir(), 'claude-deps-test-empty-' + Date.now());
    mkdirSync(join(emptyDir, '.claude'), { recursive: true });
    expect(() => readManifest(emptyDir)).toThrow('Manifest not found');
    rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('writeLockfile / readLockfile', () => {
  it('writes and reads a lockfile', () => {
    const lockfile = {
      lockVersion: 1,
      plugins: {
        'test-plugin@test-marketplace': {
          version: '1.0.0',
          gitCommitSha: 'abc123',
          resolvedAt: '2026-01-01T00:00:00.000Z',
          marketplace: 'test-marketplace',
        },
      },
    };

    writeLockfile(testDir, lockfile);
    const read = readLockfile(testDir);

    expect(read).not.toBeNull();
    expect(read!.plugins['test-plugin@test-marketplace'].version).toBe('1.0.0');
  });

  it('returns null when lockfile does not exist', () => {
    expect(readLockfile(testDir)).toBeNull();
  });
});
