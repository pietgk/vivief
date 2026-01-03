/**
 * Workflow Plugin Dev/Global Commands
 *
 * Switch between local development and global marketplace plugin modes:
 * - plugin-dev: Symlink cache to local plugin for development
 * - plugin-global: Revert to marketplace version
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getGitRoot, isGitRepo } from "../../utils/git-utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CLAUDE_PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins");
const CACHE_DIR = path.join(CLAUDE_PLUGINS_DIR, "cache", "vivief", "devac");
const VERSION_DIR = "1.0.0";
const CACHE_VERSION_PATH = path.join(CACHE_DIR, VERSION_DIR);
const MARKETPLACE_PLUGIN_PATH = path.join(
  CLAUDE_PLUGINS_DIR,
  "marketplaces",
  "vivief",
  "plugins",
  "devac"
);
const TEMP_CACHE_PATTERN = /^temp_local_/;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginDevOptions {
  /** Path to repository root */
  path?: string;
  /** Output as JSON */
  json?: boolean;
}

export interface PluginDevResult {
  success: boolean;
  error?: string;

  /** Mode that was set */
  mode: "dev" | "global";

  /** Path to the plugin source */
  sourcePath: string;

  /** Path to the cache location */
  cachePath: string;

  /** Whether symlink was created (dev mode) or directory copied (global mode) */
  action: "symlink" | "copy" | "none";

  /** Number of temp caches cleaned */
  tempCachesCleaned: number;

  /** Formatted output for CLI */
  formatted?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find local plugin directory in the repository
 */
function findLocalPlugin(repoRoot: string): string | undefined {
  const pluginPath = path.join(repoRoot, "plugins", "devac");
  if (fs.existsSync(pluginPath) && fs.existsSync(path.join(pluginPath, ".claude-plugin"))) {
    return pluginPath;
  }
  return undefined;
}

/**
 * Check if a path is a symlink
 */
function isSymlink(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Clean orphaned temp plugin caches
 */
function cleanTempCaches(): number {
  const cacheDir = path.join(CLAUDE_PLUGINS_DIR, "cache");
  let cleaned = 0;

  if (!fs.existsSync(cacheDir)) {
    return cleaned;
  }

  try {
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && TEMP_CACHE_PATTERN.test(entry.name)) {
        try {
          fs.rmSync(path.join(cacheDir, entry.name), { recursive: true, force: true });
          cleaned++;
        } catch {
          // Skip if can't remove
        }
      }
    }
  } catch {
    // Skip if can't read directory
  }

  return cleaned;
}

/**
 * Ensure parent directory exists
 */
function ensureParentDir(targetPath: string): void {
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
}

/**
 * Remove existing cache entry (symlink or directory)
 */
function removeExistingCache(): void {
  if (fs.existsSync(CACHE_VERSION_PATH) || isSymlink(CACHE_VERSION_PATH)) {
    fs.rmSync(CACHE_VERSION_PATH, { recursive: true, force: true });
  }
}

/**
 * Copy directory recursively
 */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Commands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Switch to local development mode (symlink)
 */
export async function pluginDevCommand(options: PluginDevOptions): Promise<PluginDevResult> {
  const cwd = options.path ? path.resolve(options.path) : process.cwd();

  // Verify git repo
  if (!isGitRepo(cwd)) {
    return {
      success: false,
      error: "Not a git repository",
      mode: "dev",
      sourcePath: "",
      cachePath: CACHE_VERSION_PATH,
      action: "none",
      tempCachesCleaned: 0,
    };
  }

  const repoRoot = getGitRoot(cwd) || cwd;

  // Find local plugin
  const localPluginPath = findLocalPlugin(repoRoot);
  if (!localPluginPath) {
    return {
      success: false,
      error: "Local plugin not found at plugins/devac/",
      mode: "dev",
      sourcePath: path.join(repoRoot, "plugins", "devac"),
      cachePath: CACHE_VERSION_PATH,
      action: "none",
      tempCachesCleaned: 0,
    };
  }

  // Check if already in dev mode
  if (isSymlink(CACHE_VERSION_PATH)) {
    const currentTarget = fs.readlinkSync(CACHE_VERSION_PATH);
    if (currentTarget === localPluginPath) {
      const tempCachesCleaned = cleanTempCaches();
      const result: PluginDevResult = {
        success: true,
        mode: "dev",
        sourcePath: localPluginPath,
        cachePath: CACHE_VERSION_PATH,
        action: "none",
        tempCachesCleaned,
      };
      if (!options.json) {
        result.formatted = formatPluginDevResult(result, "Already in dev mode");
      }
      return result;
    }
  }

  // Create symlink
  try {
    ensureParentDir(CACHE_VERSION_PATH);
    removeExistingCache();
    fs.symlinkSync(localPluginPath, CACHE_VERSION_PATH);
  } catch (error: unknown) {
    const err = error as { message?: string };
    return {
      success: false,
      error: `Failed to create symlink: ${err.message || "Unknown error"}`,
      mode: "dev",
      sourcePath: localPluginPath,
      cachePath: CACHE_VERSION_PATH,
      action: "none",
      tempCachesCleaned: 0,
    };
  }

  // Clean temp caches
  const tempCachesCleaned = cleanTempCaches();

  const result: PluginDevResult = {
    success: true,
    mode: "dev",
    sourcePath: localPluginPath,
    cachePath: CACHE_VERSION_PATH,
    action: "symlink",
    tempCachesCleaned,
  };

  if (!options.json) {
    result.formatted = formatPluginDevResult(result);
  }

  return result;
}

/**
 * Switch to global/marketplace mode (copy from marketplace)
 */
export async function pluginGlobalCommand(options: PluginDevOptions): Promise<PluginDevResult> {
  // Check if marketplace version exists
  if (!fs.existsSync(MARKETPLACE_PLUGIN_PATH)) {
    return {
      success: false,
      error: `Marketplace plugin not found at ${MARKETPLACE_PLUGIN_PATH}`,
      mode: "global",
      sourcePath: MARKETPLACE_PLUGIN_PATH,
      cachePath: CACHE_VERSION_PATH,
      action: "none",
      tempCachesCleaned: 0,
    };
  }

  // Check if already in global mode (not a symlink and exists)
  if (fs.existsSync(CACHE_VERSION_PATH) && !isSymlink(CACHE_VERSION_PATH)) {
    const tempCachesCleaned = cleanTempCaches();
    const result: PluginDevResult = {
      success: true,
      mode: "global",
      sourcePath: MARKETPLACE_PLUGIN_PATH,
      cachePath: CACHE_VERSION_PATH,
      action: "none",
      tempCachesCleaned,
    };
    if (!options.json) {
      result.formatted = formatPluginDevResult(result, "Already in global mode");
    }
    return result;
  }

  // Copy from marketplace
  try {
    ensureParentDir(CACHE_VERSION_PATH);
    removeExistingCache();
    copyDir(MARKETPLACE_PLUGIN_PATH, CACHE_VERSION_PATH);
  } catch (error: unknown) {
    const err = error as { message?: string };
    return {
      success: false,
      error: `Failed to copy from marketplace: ${err.message || "Unknown error"}`,
      mode: "global",
      sourcePath: MARKETPLACE_PLUGIN_PATH,
      cachePath: CACHE_VERSION_PATH,
      action: "none",
      tempCachesCleaned: 0,
    };
  }

  // Clean temp caches
  const tempCachesCleaned = cleanTempCaches();

  const result: PluginDevResult = {
    success: true,
    mode: "global",
    sourcePath: MARKETPLACE_PLUGIN_PATH,
    cachePath: CACHE_VERSION_PATH,
    action: "copy",
    tempCachesCleaned,
  };

  if (!options.json) {
    result.formatted = formatPluginDevResult(result);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format result for CLI output
 */
function formatPluginDevResult(result: PluginDevResult, message?: string): string {
  const lines: string[] = [];

  lines.push(`Plugin ${result.mode === "dev" ? "Development" : "Global"} Mode`);
  lines.push("─".repeat(40));

  if (message) {
    lines.push(`  ${message}`);
  } else if (result.success) {
    if (result.mode === "dev") {
      lines.push("  Switched to development mode");
      lines.push(`  Source: ${result.sourcePath}`);
      lines.push(`  Symlink: ${result.cachePath}`);
    } else {
      lines.push("  Switched to global mode");
      lines.push(`  Source: ${result.sourcePath}`);
      lines.push(`  Copied to: ${result.cachePath}`);
    }
  } else {
    lines.push(`  Error: ${result.error}`);
  }

  if (result.tempCachesCleaned > 0) {
    lines.push("");
    lines.push(`  Cleaned ${result.tempCachesCleaned} orphaned temp cache(s)`);
  }

  lines.push("");
  lines.push(`  Success: ${result.success ? "YES" : "NO"}`);

  if (result.success && result.mode === "dev") {
    lines.push("");
    lines.push("  Note: Restart Claude to use updated skills");
  }

  return lines.join("\n");
}
