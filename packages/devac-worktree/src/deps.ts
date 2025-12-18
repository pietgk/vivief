/**
 * Dependency management - detect package manager and install dependencies
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execa } from "execa";
import type { PackageManager } from "./types.js";

/**
 * Detect which package manager is used in a directory
 */
export async function detectPackageManager(directory: string): Promise<PackageManager> {
  // Check for lockfiles in order of preference
  const checks: Array<{ file: string; manager: PackageManager }> = [
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
  ];

  for (const { file, manager } of checks) {
    try {
      await fs.access(path.join(directory, file));
      return manager;
    } catch {
      // File doesn't exist, try next
    }
  }

  // Default to pnpm if no lockfile found
  return "pnpm";
}

/**
 * Install dependencies in a directory
 */
export async function installDependencies(
  directory: string,
  options?: { verbose?: boolean }
): Promise<{ success: boolean; manager: PackageManager; error?: string }> {
  const manager = await detectPackageManager(directory);

  const installCmd: Record<PackageManager, string[]> = {
    pnpm: ["pnpm", "install"],
    npm: ["npm", "install"],
    yarn: ["yarn", "install"],
  };

  const [cmd, ...args] = installCmd[manager];

  try {
    await execa(cmd, args, {
      cwd: directory,
      stdio: options?.verbose ? "inherit" : "pipe",
    });

    return { success: true, manager };
  } catch (error) {
    return {
      success: false,
      manager,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if node_modules exists
 */
export async function hasNodeModules(directory: string): Promise<boolean> {
  try {
    await fs.access(path.join(directory, "node_modules"));
    return true;
  } catch {
    return false;
  }
}
