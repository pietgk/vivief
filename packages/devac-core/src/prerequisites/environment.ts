/**
 * Environment Checks
 *
 * New prerequisite checks that don't already exist in the codebase.
 * These are checks for:
 * - Source file existence (has .ts/.py/.cs files)
 * - Node.js version compatibility
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { PrerequisiteCheck } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Source File Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported source file extensions.
 */
const SOURCE_EXTENSIONS = new Set([
  // TypeScript/JavaScript
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  // Python
  ".py",
  // C#
  ".cs",
]);

/**
 * Directories to skip when scanning for source files.
 */
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".devac",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "__pycache__",
  ".venv",
  "venv",
  "bin",
  "obj",
]);

/**
 * Check if a directory contains source files that can be analyzed.
 *
 * Does a shallow scan (depth 2) to quickly detect if there are any
 * analyzable source files without scanning the entire tree.
 *
 * @param dirPath Directory to check
 * @returns PrerequisiteCheck result
 */
export async function checkHasSourceFiles(dirPath: string): Promise<PrerequisiteCheck> {
  const absolutePath = path.resolve(dirPath);

  try {
    const hasFiles = await hasSourceFilesRecursive(absolutePath, 0, 3);

    if (hasFiles) {
      return {
        id: "has_source_files",
        category: "workspace",
        passed: true,
        required: true,
        message: "Source files found",
        detail: "Directory contains analyzable source files (.ts, .py, .cs, etc.)",
      };
    }

    return {
      id: "has_source_files",
      category: "workspace",
      passed: false,
      required: true,
      message: `No source files found in ${absolutePath}`,
      detail:
        "DevAC requires TypeScript, JavaScript, Python, or C# source files to analyze. " +
        "This directory does not appear to contain any supported source files.",
      fixCommand: "cd <your-project>",
      fixDescription: "Navigate to a directory containing source code",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "has_source_files",
      category: "workspace",
      passed: false,
      required: true,
      message: `Cannot read directory: ${absolutePath}`,
      detail: message,
    };
  }
}

/**
 * Recursively check for source files up to a maximum depth.
 */
async function hasSourceFilesRecursive(
  dirPath: string,
  currentDepth: number,
  maxDepth: number
): Promise<boolean> {
  if (currentDepth > maxDepth) {
    return false;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Check files for source extensions
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          return true;
        }
      }

      // Recursively check directories (skip node_modules, etc.)
      if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
        const subPath = path.join(dirPath, entry.name);
        const foundInSubdir = await hasSourceFilesRecursive(subPath, currentDepth + 1, maxDepth);
        if (foundInSubdir) {
          return true;
        }
      }
    }
  } catch {
    // Directory not readable, skip
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node.js Version Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum required Node.js major version.
 */
const MIN_NODE_VERSION = 20;

/**
 * Check if the current Node.js version is compatible.
 *
 * DevAC requires Node.js 20+ for:
 * - Native fetch API
 * - Modern ESM support
 * - DuckDB compatibility
 *
 * @returns PrerequisiteCheck result
 */
export function checkNodeVersion(): PrerequisiteCheck {
  const version = process.version;
  const majorMatch = version.match(/^v(\d+)/);
  const majorVersionStr = majorMatch?.[1];
  const majorVersion = majorVersionStr ? Number.parseInt(majorVersionStr, 10) : 0;

  if (majorVersion >= MIN_NODE_VERSION) {
    return {
      id: "node_version",
      category: "environment",
      passed: true,
      required: true,
      message: `Node.js ${version} is compatible`,
      detail: `Node.js ${MIN_NODE_VERSION}+ is required, you have ${version}`,
    };
  }

  return {
    id: "node_version",
    category: "environment",
    passed: false,
    required: true,
    message: `Node.js ${version} is not supported`,
    detail:
      `DevAC requires Node.js ${MIN_NODE_VERSION} or later. ` +
      `Your current version is ${version}. Please upgrade Node.js.`,
    fixCommand: "nvm install 20 && nvm use 20",
    fixDescription: "Install and use Node.js 20 (using nvm)",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub Lock Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the hub is locked by another process.
 *
 * @param hubDir Hub directory path
 * @returns PrerequisiteCheck result
 */
export async function checkHubNotLocked(hubDir: string): Promise<PrerequisiteCheck> {
  const socketPath = path.join(hubDir, "mcp.sock");

  try {
    await fs.access(socketPath);
    // Socket exists - MCP is likely running and has the lock
    return {
      id: "hub_writable",
      category: "hub",
      passed: false,
      required: false, // Not required - can still sync locally
      message: "Hub is locked by MCP server",
      detail:
        "The MCP server is running and has exclusive access to the hub. " +
        "Sync will write seeds locally. Hub registration will be skipped.",
      fixCommand: "devac sync",
      fixDescription: "Seeds will be analyzed locally, hub registration skipped",
    };
  } catch {
    // Socket doesn't exist - hub is available
    return {
      id: "hub_writable",
      category: "hub",
      passed: true,
      required: false,
      message: "Hub is available for writing",
      detail: "No MCP server lock detected, hub can be written to directly",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub Existence Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a hub database exists.
 *
 * @param hubDir Hub directory path
 * @returns PrerequisiteCheck result
 */
export async function checkHubExists(hubDir: string): Promise<PrerequisiteCheck> {
  const hubPath = path.join(hubDir, "central.duckdb");

  try {
    await fs.access(hubPath);
    return {
      id: "hub_exists",
      category: "hub",
      passed: true,
      required: false, // Hub is created automatically on first sync
      message: "Hub database exists",
      detail: `Found hub at ${hubPath}`,
    };
  } catch {
    return {
      id: "hub_exists",
      category: "hub",
      passed: false,
      required: false, // Hub is created automatically
      message: "Hub database does not exist yet",
      detail:
        "This is normal on first run. The hub will be created automatically " +
        "when you run 'devac sync' to analyze packages.",
    };
  }
}
