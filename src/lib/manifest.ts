import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getManifestPath, getLockfilePath } from './config.js';
import type { Manifest, LockFile } from './types.js';
import { z } from 'zod';

const MarketplaceSourceSchema = z.object({
  source: z.enum(['github', 'git']),
  repo: z.string().optional(),
  url: z.string().optional(),
}).refine(
  (data) => {
    if (data.source === 'github') return !!data.repo;
    if (data.source === 'git') return !!data.url;
    return false;
  },
  { message: 'github source requires "repo", git source requires "url"' }
);

const McpServerSchema = z.object({
  type: z.enum(['stdio', 'http', 'sse']),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  dependencies: z.object({
    npm: z.array(z.string()).optional(),
    pip: z.array(z.string()).optional(),
  }).optional(),
});

const ManifestSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  plugins: z.record(z.string()).optional(),
  marketplaces: z.record(MarketplaceSourceSchema).optional(),
  mcp: z.object({
    servers: z.record(McpServerSchema).optional(),
  }).optional(),
  hooks: z.object({
    validate: z.boolean().optional(),
  }).optional(),
});

export function readManifest(projectPath: string): Manifest {
  const manifestPath = getManifestPath(projectPath);
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}. Run 'claude-deps init' first.`);
  }
  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  return ManifestSchema.parse(raw);
}

export function writeManifest(projectPath: string, manifest: Manifest): void {
  const manifestPath = getManifestPath(projectPath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

export function readLockfile(projectPath: string): LockFile | null {
  const lockPath = getLockfilePath(projectPath);
  if (!existsSync(lockPath)) return null;
  return JSON.parse(readFileSync(lockPath, 'utf-8'));
}

export function writeLockfile(projectPath: string, lockfile: LockFile): void {
  const lockPath = getLockfilePath(projectPath);
  writeFileSync(lockPath, JSON.stringify(lockfile, null, 2) + '\n');
}

export function parsePluginId(pluginId: string): { name: string; marketplace: string } {
  const atIndex = pluginId.lastIndexOf('@');
  if (atIndex <= 0) {
    throw new Error(`Invalid plugin ID: ${pluginId}. Expected format: name@marketplace`);
  }
  return {
    name: pluginId.substring(0, atIndex),
    marketplace: pluginId.substring(atIndex + 1),
  };
}
