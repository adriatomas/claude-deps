import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installHook, removeHook, validateHooks } from '../src/lib/hooks.js';

const testDir = join(tmpdir(), 'claude-deps-test-hooks');
const claudeDir = join(testDir, '.claude');

beforeEach(() => {
  mkdirSync(claudeDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('installHook', () => {
  it('creates hook script and updates settings', () => {
    writeFileSync(join(claudeDir, 'settings.json'), '{}');

    installHook(testDir);

    const hookPath = join(claudeDir, 'hooks', 'check-deps.js');
    expect(existsSync(hookPath)).toBe(true);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain('check-deps');
  });

  it('does not duplicate hooks', () => {
    writeFileSync(join(claudeDir, 'settings.json'), '{}');

    installHook(testDir);
    installHook(testDir);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });
});

describe('removeHook', () => {
  it('removes the hook from settings', () => {
    writeFileSync(join(claudeDir, 'settings.json'), '{}');

    installHook(testDir);
    removeHook(testDir);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeUndefined();
  });
});

describe('validateHooks', () => {
  it('returns valid when no hooks', () => {
    writeFileSync(join(claudeDir, 'settings.json'), '{}');
    const result = validateHooks(testDir);
    expect(result.valid).toBe(true);
  });

  it('detects missing hook scripts', () => {
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                {
                  type: 'command',
                  command: '/nonexistent/script.sh',
                },
              ],
            },
          ],
        },
      }),
    );

    const result = validateHooks(testDir);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('/nonexistent/script.sh');
  });
});
