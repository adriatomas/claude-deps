# claude-deps

Dependency manager for Claude Code. Sync plugins, hooks, and MCP servers across your team.

## The Problem

Claude Code plugins are installed per-user in `~/.claude/plugins/`. When a team works on the same repo, each developer must manually discover and install the right plugins. There's no `package.json` equivalent — no manifest, no lockfile, no auto-install.

**claude-deps** fixes this.

## Quick Start

```bash
# Initialize from your current setup
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
| `init` | Scan current project and create `deps.json` |
| `install` | Install all dependencies from manifest |
| `check` | Verify installed state matches manifest (exit 1 if not) |
| `add <plugin@marketplace>` | Add a plugin and install it |
| `remove <plugin@marketplace>` | Remove a plugin |
| `update` | Update plugins to latest compatible versions |
| `hook install` | Add SessionStart verification hook |
| `hook remove` | Remove the verification hook |

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
import { check, installPlugin, readManifest } from 'claude-deps';

const manifest = readManifest('/path/to/project');
const result = check('/path/to/project');

if (!result.ok) {
  console.log('Missing:', result.missing);
}
```

## CI Integration

```yaml
# .github/workflows/check-claude-deps.yml
- run: npx claude-deps check
```

## License

MIT
