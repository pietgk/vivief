/**
 * Package Manager Detection and Multi-Language Package Discovery
 *
 * Detects package managers (pnpm, npm, yarn) and discovers all packages
 * in a workspace. Also discovers Python and C# projects.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import { createLogger } from "../utils/logger.js";

const logger = createLogger({ prefix: "[PackageManager]" });

// ============================================================================
// Types
// ============================================================================

export type PackageManagerType = "pnpm" | "npm" | "yarn";
export type LanguageType = "typescript" | "javascript" | "python" | "csharp";

export interface PackageInfo {
  /** Absolute path to the package */
  path: string;
  /** Package name (from package.json, pyproject.toml, or .csproj) */
  name: string;
  /** Detected language */
  language: LanguageType;
  /** Package manager (for JS/TS packages) */
  packageManager?: PackageManagerType;
}

export interface DiscoveryError {
  /** Path where the error occurred */
  path: string;
  /** Error message */
  error: string;
}

export interface DiscoveryResult {
  /** Discovered packages */
  packages: PackageInfo[];
  /** Errors encountered during discovery */
  errors: DiscoveryError[];
  /** Root path that was scanned */
  rootPath: string;
  /** Detected package manager for JS/TS (if any) */
  detectedPackageManager?: PackageManagerType;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_EXCLUDE = [
  "node_modules",
  ".git",
  ".devac",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "bin",
  "obj",
  ".venv",
  "venv",
  "__pycache__",
  ".tox",
  ".pytest_cache",
  ".mypy_cache",
];

// ============================================================================
// Package Manager Detection
// ============================================================================

/**
 * Detect the package manager used in a repository
 *
 * Detection priority:
 * 1. pnpm-workspace.yaml → pnpm
 * 2. yarn.lock + workspaces → yarn
 * 3. package.json workspaces (no yarn.lock) → npm
 */
export async function detectPackageManager(rootPath: string): Promise<PackageManagerType | null> {
  // Check for pnpm workspace (highest priority)
  const pnpmWorkspacePath = path.join(rootPath, "pnpm-workspace.yaml");
  if (await fileExists(pnpmWorkspacePath)) {
    return "pnpm";
  }

  // Check for yarn.lock
  const yarnLockPath = path.join(rootPath, "yarn.lock");
  const hasYarnLock = await fileExists(yarnLockPath);

  // Check for package.json with workspaces
  const packageJsonPath = path.join(rootPath, "package.json");
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      const hasWorkspaces = pkg.workspaces !== undefined;

      if (hasWorkspaces) {
        return hasYarnLock ? "yarn" : "npm";
      }
    } catch {
      // Invalid package.json, continue
    }
  }

  return null;
}

// ============================================================================
// JavaScript/TypeScript Package Discovery
// ============================================================================

/**
 * Discover all packages in a JavaScript/TypeScript workspace
 */
export async function discoverJSPackages(rootPath: string): Promise<PackageInfo[]> {
  const packageManager = await detectPackageManager(rootPath);
  if (!packageManager) {
    // Not a JS workspace, check if it's a single package
    const packageJsonPath = path.join(rootPath, "package.json");
    if (await fileExists(packageJsonPath)) {
      const name = await getPackageJsonName(packageJsonPath);
      return [
        {
          path: rootPath,
          name: name || path.basename(rootPath),
          language: "typescript",
          packageManager: undefined,
        },
      ];
    }
    return [];
  }

  let patterns: string[] = [];

  if (packageManager === "pnpm") {
    patterns = await parsePnpmWorkspace(rootPath);
  } else {
    patterns = await parsePackageJsonWorkspaces(rootPath);
  }

  if (patterns.length === 0) {
    return [];
  }

  // Expand glob patterns to find package directories
  const packages: PackageInfo[] = [];

  for (const pattern of patterns) {
    const resolvedPattern = path.join(rootPath, pattern);
    const matches = await glob(resolvedPattern, {
      ignore: DEFAULT_EXCLUDE.map((e) => `**/${e}/**`),
    });

    for (const match of matches) {
      const packageJsonPath = path.join(match, "package.json");
      if (await fileExists(packageJsonPath)) {
        const name = await getPackageJsonName(packageJsonPath);
        packages.push({
          path: match,
          name: name || path.basename(match),
          language: "typescript", // Default to TS, could detect based on tsconfig
          packageManager,
        });
      }
    }
  }

  return packages;
}

/**
 * Parse pnpm-workspace.yaml to extract package patterns
 */
async function parsePnpmWorkspace(rootPath: string): Promise<string[]> {
  const workspacePath = path.join(rootPath, "pnpm-workspace.yaml");

  try {
    const content = await fs.readFile(workspacePath, "utf-8");

    // Simple YAML parsing for packages: field
    // Handles formats like:
    //   packages:
    //     - 'packages/*'
    //     - "apps/*"
    //     - libs/*
    const packagesMatch = content.match(/packages:\s*\n((?:\s+-\s+['"]?[^'"#\n]+['"]?\s*\n?)*)/);
    if (!packagesMatch) {
      return [];
    }

    const packagesSection = packagesMatch[1];
    if (!packagesSection) {
      return [];
    }
    const lines = packagesSection.split("\n");
    const patterns: string[] = [];

    for (const line of lines) {
      const match = line.match(/-\s+['"]?([^'"#\n]+?)['"]?\s*$/);
      if (match?.[1]) {
        patterns.push(match[1].trim());
      }
    }

    return patterns;
  } catch {
    logger.warn(`Failed to parse pnpm-workspace.yaml at ${rootPath}`);
    return [];
  }
}

/**
 * Parse package.json workspaces field
 */
async function parsePackageJsonWorkspaces(rootPath: string): Promise<string[]> {
  const packageJsonPath = path.join(rootPath, "package.json");

  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    if (!pkg.workspaces) {
      return [];
    }

    // Handle both array format and object format
    // Array: ["packages/*", "apps/*"]
    // Object: { packages: ["packages/*"], nohoist: [...] }
    if (Array.isArray(pkg.workspaces)) {
      return pkg.workspaces;
    }

    if (typeof pkg.workspaces === "object" && pkg.workspaces.packages) {
      return pkg.workspaces.packages;
    }

    return [];
  } catch {
    logger.warn(`Failed to parse package.json workspaces at ${rootPath}`);
    return [];
  }
}

// ============================================================================
// Python Package Discovery
// ============================================================================

/**
 * Discover Python projects via pyproject.toml
 */
export async function discoverPythonPackages(rootPath: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  try {
    const pyprojectFiles = await glob("**/pyproject.toml", {
      cwd: rootPath,
      ignore: DEFAULT_EXCLUDE.map((e) => `**/${e}/**`),
      absolute: true,
    });

    for (const pyprojectPath of pyprojectFiles) {
      const packageDir = path.dirname(pyprojectPath);
      const name = await getPyprojectName(pyprojectPath);

      packages.push({
        path: packageDir,
        name: name || path.basename(packageDir),
        language: "python",
      });
    }
  } catch (error) {
    logger.warn(`Failed to discover Python packages: ${error}`);
  }

  return packages;
}

/**
 * Extract project name from pyproject.toml
 */
async function getPyprojectName(pyprojectPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(pyprojectPath, "utf-8");

    // Try [project] section first (PEP 621)
    const projectMatch = content.match(/\[project\]\s*\n[^[]*name\s*=\s*["']([^"']+)["']/);
    if (projectMatch?.[1]) {
      return projectMatch[1];
    }

    // Try [tool.poetry] section
    const poetryMatch = content.match(/\[tool\.poetry\]\s*\n[^[]*name\s*=\s*["']([^"']+)["']/);
    if (poetryMatch?.[1]) {
      return poetryMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// C# Package Discovery
// ============================================================================

/**
 * Discover C# projects via .csproj files
 */
export async function discoverCSharpPackages(rootPath: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  try {
    const csprojFiles = await glob("**/*.csproj", {
      cwd: rootPath,
      ignore: DEFAULT_EXCLUDE.map((e) => `**/${e}/**`),
      absolute: true,
    });

    for (const csprojPath of csprojFiles) {
      const packageDir = path.dirname(csprojPath);
      const name = path.basename(csprojPath, ".csproj");

      packages.push({
        path: packageDir,
        name,
        language: "csharp",
      });
    }
  } catch (error) {
    logger.warn(`Failed to discover C# packages: ${error}`);
  }

  return packages;
}

// ============================================================================
// Unified Discovery
// ============================================================================

/**
 * Discover all packages across all languages in a repository
 */
export async function discoverAllPackages(rootPath: string): Promise<DiscoveryResult> {
  const errors: DiscoveryError[] = [];
  const packages: PackageInfo[] = [];

  // Detect JS package manager
  const packageManager = await detectPackageManager(rootPath);

  // Discover JS/TS packages
  try {
    const jsPackages = await discoverJSPackages(rootPath);
    packages.push(...jsPackages);
    logger.debug(`Found ${jsPackages.length} JS/TS packages`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push({ path: rootPath, error: `JS discovery failed: ${msg}` });
  }

  // Discover Python packages
  try {
    const pyPackages = await discoverPythonPackages(rootPath);
    packages.push(...pyPackages);
    logger.debug(`Found ${pyPackages.length} Python packages`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push({ path: rootPath, error: `Python discovery failed: ${msg}` });
  }

  // Discover C# packages
  try {
    const csPackages = await discoverCSharpPackages(rootPath);
    packages.push(...csPackages);
    logger.debug(`Found ${csPackages.length} C# packages`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push({ path: rootPath, error: `C# discovery failed: ${msg}` });
  }

  // Deduplicate by path (in case a directory has both package.json and pyproject.toml)
  const seen = new Set<string>();
  const dedupedPackages = packages.filter((pkg) => {
    if (seen.has(pkg.path)) {
      return false;
    }
    seen.add(pkg.path);
    return true;
  });

  logger.info(`Discovered ${dedupedPackages.length} total packages in ${rootPath}`);

  return {
    packages: dedupedPackages,
    errors,
    rootPath,
    detectedPackageManager: packageManager ?? undefined,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getPackageJsonName(packageJsonPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.name || null;
  } catch {
    return null;
  }
}
