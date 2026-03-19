# claude-deps

Dependency manager for Claude Code. Sync plugins, hooks, and MCP servers across your team.

## The Problem

Claude Code plugins are installed per-user in `~/.claude/plugins/`. When a team works on the same repo, each developer must manually discover and install the right plugins. There's no `package.json` equivalent — no manifest, no lockfile, no auto-install.

**claude-deps** fixes this.

## Quick Start

```bash
# Initialize — scans your setup and lets you pick what to include
npx claude-deps init

# Install all declared dependencies
npx claude-deps install

# Add the SessionStart guard hook
npx claude-deps hook install

# Commit the manifest
git add .claude/deps.json .claude/deps-lock.json
git commit -m "add claude-deps"
```

## How It Works

1. A **manifest** (`.claude/deps.json`) declares required plugins, marketplaces, MCP servers, and hooks
2. A **lockfile** (`.claude/deps-lock.json`) pins exact versions and git SHAs for reproducibility
3. A **SessionStart hook** verifies everything is installed when Claude launches
4. `claude-deps install` resolves and installs everything from the manifest

## Commands

| Command | Description |
|---------|-------------|
| `init` | Scan current project and create `deps.json` (interactive) |
| `init --yes` | Auto-accept all enabled plugins |
| `install` | Install all dependencies from manifest |
| `check` | Verify installed state matches manifest (exit 1 if not) |
| `add <plugin@marketplace>` | Add a plugin and install it |
| `remove <plugin@marketplace>` | Remove a plugin |
| `update` | Update plugins to latest compatible versions |
| `clean` | Remove orphaned plugin versions from cache |
| `clean --dry-run` | Show what would be removed without deleting |
| `hook install` | Add SessionStart verification hook |
| `hook remove` | Remove the verification hook |

## Interactive Init

`claude-deps init` scans your entire Claude Code setup and presents an interactive selector:

- **Plugins** — from project and user-level installations
- **Hooks** — SessionStart, PreToolUse, PostToolUse from project and user settings
- **MCP Servers** — from `.mcp.json` files

Use arrow keys to navigate, space to toggle, `a` to select all, enter to confirm.

Each item shows its source (`[project]` or `[user]`) so you know where it comes from.

## Manifest Format

`.claude/deps.json`:

```json
{
  "$schema": "https://unpkg.com/claude-deps/schema.json",
  "version": 1,
  "plugins": {
    "typescript-lsp@claude-plugins-official": "1.0.0",
    "code-review@claude-plugins-official": "latest"
  },
  "marketplaces": {
    "claude-plugins-official": {
      "source": "github",
      "repo": "anthropics/claude-plugins"
    }
  },
  "mcp": {
    "servers": {
      "my-server": {
        "type": "stdio",
        "command": "node",
        "args": ["./mcp/server.js"],
        "dependencies": {
          "npm": ["@modelcontextprotocol/sdk"]
        }
      }
    }
  },
  "hooks": {
    "validate": true
  }
}
```

## Team Workflow

### Maintainer sets up the project

```bash
npx claude-deps init
npx claude-deps hook install
git add .claude/deps.json .claude/deps-lock.json .claude/settings.json
git commit -m "add claude-deps"
```

### New team member onboards

```bash
git clone <repo>
npm install          # postinstall runs claude-deps install
claude               # everything works
```

### Someone adds a plugin

```bash
npx claude-deps add code-review@claude-plugins-official
git add .claude/deps.json .claude/deps-lock.json
git commit -m "add code-review plugin"
# Teammates: git pull + npm install → auto-installed
```

### Clean up old versions

```bash
npx claude-deps clean            # remove orphaned cached plugins
npx claude-deps clean --dry-run  # preview what would be removed
```

## Private / Corporate Marketplaces

```json
{
  "marketplaces": {
    "internal": {
      "source": "git",
      "url": "git@gitlab.company.com:team/claude-plugins.git"
    }
  }
}
```

## Using as a Library

```typescript
import { check, readManifest, cleanCache } from 'claude-deps';

const manifest = readManifest('/path/to/project');
const result = check('/path/to/project');

if (!result.ok) {
  console.log('Missing:', result.missing);
}

// Clean orphaned cache entries
const cleaned = cleanCache();
console.log(`Freed ${cleaned.freedBytes} bytes`);
```

## CI Integration

```yaml
# .github/workflows/check-claude-deps.yml
- run: npx claude-deps check
```

## License

MIT
