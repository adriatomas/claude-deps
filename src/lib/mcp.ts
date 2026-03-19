import { execSync } from 'child_process';
import type { McpConfig } from './types.js';

export function installMcpDependencies(mcp: McpConfig, projectPath: string): void {
  if (!mcp.servers) return;

  for (const [serverName, config] of Object.entries(mcp.servers)) {
    if (!config.dependencies) continue;

    if (config.dependencies.npm?.length) {
      console.log(`  Installing npm dependencies for MCP server '${serverName}'...`);
      const packages = config.dependencies.npm.join(' ');
      execSync(`npm install ${packages}`, { cwd: projectPath, stdio: 'pipe' });
    }

    if (config.dependencies.pip?.length) {
      console.log(`  Installing pip dependencies for MCP server '${serverName}'...`);
      const packages = config.dependencies.pip.join(' ');
      execSync(`pip install ${packages}`, { cwd: projectPath, stdio: 'pipe' });
    }
  }
}
