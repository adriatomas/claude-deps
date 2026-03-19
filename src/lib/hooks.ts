import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import {
  readProjectSettings,
  getProjectSettingsPath,
  getProjectClaudeDir,
} from './config.js';

const HOOK_SCRIPT = `#!/usr/bin/env node
const { execSync } = require('child_process');
try {
  execSync('npx claude-deps check', {
    stdio: 'pipe',
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  });
} catch (e) {
  const msg = e.stdout ? e.stdout.toString() : e.message;
  console.error(msg);
  process.exit(1);
}
`;

export function installHook(projectPath: string): void {
  const claudeDir = getProjectClaudeDir(projectPath);
  const hooksDir = join(claudeDir, 'hooks');

  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, 'check-deps.js');
  writeFileSync(hookPath, HOOK_SCRIPT);
  chmodSync(hookPath, '755');

  const settings = readProjectSettings(projectPath);

  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks['SessionStart']) {
    settings.hooks['SessionStart'] = [];
  }

  const sessionStartHooks = settings.hooks['SessionStart'] as Array<{
    matcher?: string;
    hooks?: Array<{ type: string; command: string }>;
  }>;

  const hookExists = sessionStartHooks.some((h) =>
    h.hooks?.some((hook) => hook.command?.includes('check-deps')),
  );

  if (!hookExists) {
    sessionStartHooks.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: `node ${hookPath}`,
        },
      ],
    });
  }

  writeFileSync(
    getProjectSettingsPath(projectPath),
    JSON.stringify(settings, null, 2) + '\n',
  );
}

export function removeHook(projectPath: string): void {
  const settings = readProjectSettings(projectPath);

  if (settings.hooks?.['SessionStart']) {
    const sessionStartHooks = settings.hooks['SessionStart'] as Array<{
      hooks?: Array<{ type: string; command: string }>;
    }>;

    settings.hooks['SessionStart'] = sessionStartHooks.filter(
      (h) => !h.hooks?.some((hook) => hook.command?.includes('check-deps')),
    );

    if ((settings.hooks['SessionStart'] as unknown[]).length === 0) {
      delete settings.hooks['SessionStart'];
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }

  writeFileSync(
    getProjectSettingsPath(projectPath),
    JSON.stringify(settings, null, 2) + '\n',
  );
}

export function validateHooks(projectPath: string): {
  valid: boolean;
  issues: string[];
} {
  const settings = readProjectSettings(projectPath);
  const issues: string[] = [];

  if (!settings.hooks) return { valid: true, issues };

  for (const [event, matchers] of Object.entries(settings.hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      const m = matcher as { hooks?: Array<{ type: string; command: string }> };
      if (m.hooks) {
        for (const hook of m.hooks) {
          if (hook.type === 'command' && hook.command) {
            const parts = hook.command.split(' ');
            const scriptPath = parts[parts.length - 1];
            if (scriptPath.startsWith('/') && !existsSync(scriptPath)) {
              issues.push(`Hook script not found: ${scriptPath} (${event})`);
            }
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
