/**
 * Manifest Generator Implementation
 *
 * Generates repository manifests for federation.
 * Based on DevAC v2.0 spec Phase 4: Federation.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { detectRepoId } from "../utils/git.js";

/**
 * Repository manifest structure
 */
export interface RepositoryManifest {
  version: "2.0";
  repo_id: string;
  generated_at: string;
  packages: PackageInfo[];
  external_dependencies: ExternalDependency[];
}

/**
 * Package information in manifest
 */
export interface PackageInfo {
  path: string;
  name: string;
  seed_path: string;
  last_analyzed: string;
  file_count: number;
  node_count: number;
  edge_count: number;
}

/**
 * External dependency information
 */
export interface ExternalDependency {
  package: string;
  repo_id?: string;
  version?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Stats from seed directory
 */
interface SeedStats {
  nodeCount: number;
  edgeCount: number;
  refCount: number;
  fileCount: number;
}

/**
 * Manifest Generator
 *
 * Generates and updates repository manifests.
 */
export class ManifestGenerator {
  /**
   * Generate a new manifest for a repository
   */
  async generate(repoPath: string): Promise<RepositoryManifest> {
    const repoId = await this.detectRepoIdFromPath(repoPath);
    const packages = await this.discoverPackages(repoPath);
    const externalDeps = await this.collectExternalDependencies(repoPath, packages);

    const manifest: RepositoryManifest = {
      version: "2.0",
      repo_id: repoId,
      generated_at: new Date().toISOString(),
      packages,
      external_dependencies: externalDeps,
    };

    // Write manifest to disk
    await this.writeManifest(repoPath, manifest);

    return manifest;
  }

  /**
   * Update manifest for specific changed packages
   */
  async update(repoPath: string, changedPackages: string[]): Promise<RepositoryManifest> {
    // Read existing manifest
    const existingManifest = await this.readManifest(repoPath);

    if (!existingManifest) {
      // No existing manifest, generate fresh
      return this.generate(repoPath);
    }

    // Update only changed packages
    const updatedPackages = new Map<string, PackageInfo>();

    // Keep existing packages
    for (const pkg of existingManifest.packages) {
      updatedPackages.set(pkg.path, pkg);
    }

    // Update changed packages
    for (const pkgPath of changedPackages) {
      const fullPath = path.join(repoPath, pkgPath);
      const pkgInfo = await this.analyzePackage(repoPath, fullPath);
      if (pkgInfo) {
        updatedPackages.set(pkgPath, pkgInfo);
      }
    }

    // Check for new packages not in the list
    const allPackages = await this.discoverPackages(repoPath);
    for (const pkg of allPackages) {
      if (!updatedPackages.has(pkg.path)) {
        updatedPackages.set(pkg.path, pkg);
      }
    }

    const manifest: RepositoryManifest = {
      version: "2.0",
      repo_id: existingManifest.repo_id,
      generated_at: new Date().toISOString(),
      packages: Array.from(updatedPackages.values()),
      external_dependencies: await this.collectExternalDependencies(
        repoPath,
        Array.from(updatedPackages.values())
      ),
    };

    await this.writeManifest(repoPath, manifest);

    return manifest;
  }

  /**
   * Validate a manifest
   */
  validate(manifest: RepositoryManifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!manifest.version) {
      errors.push("Missing required field: version");
    } else if (manifest.version !== "2.0") {
      errors.push(`Invalid version: expected "2.0", got "${manifest.version}"`);
    }

    if (!manifest.repo_id) {
      errors.push("Missing required field: repo_id");
    }

    if (!manifest.generated_at) {
      errors.push("Missing required field: generated_at");
    } else {
      // Validate date format
      const date = new Date(manifest.generated_at);
      if (Number.isNaN(date.getTime())) {
        errors.push(`Invalid generated_at date: ${manifest.generated_at}`);
      }
    }

    if (!manifest.packages) {
      errors.push("Missing required field: packages");
    } else if (!Array.isArray(manifest.packages)) {
      errors.push("packages must be an array");
    } else {
      // Validate each package
      for (let i = 0; i < manifest.packages.length; i++) {
        const pkg = manifest.packages[i];
        if (pkg) {
          const pkgErrors = this.validatePackageInfo(pkg, i);
          errors.push(...pkgErrors);
        }
      }
    }

    if (!manifest.external_dependencies) {
      errors.push("Missing required field: external_dependencies");
    } else if (!Array.isArray(manifest.external_dependencies)) {
      errors.push("external_dependencies must be an array");
    } else {
      // Validate each dependency
      for (let i = 0; i < manifest.external_dependencies.length; i++) {
        const dep = manifest.external_dependencies[i];
        if (!dep?.package || dep.package.length === 0) {
          errors.push(`external_dependencies[${i}]: package name is required`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a package info entry
   */
  private validatePackageInfo(pkg: PackageInfo, index: number): string[] {
    const errors: string[] = [];
    const prefix = `packages[${index}]`;

    if (!pkg.path) {
      errors.push(`${prefix}: missing path`);
    }
    if (!pkg.name) {
      errors.push(`${prefix}: missing name`);
    }
    if (!pkg.seed_path) {
      errors.push(`${prefix}: missing seed_path`);
    }
    if (!pkg.last_analyzed) {
      errors.push(`${prefix}: missing last_analyzed`);
    } else {
      const date = new Date(pkg.last_analyzed);
      if (Number.isNaN(date.getTime())) {
        errors.push(`${prefix}: invalid last_analyzed date`);
      }
    }
    if (typeof pkg.file_count !== "number" || pkg.file_count < 0) {
      errors.push(`${prefix}: file_count must be a non-negative number`);
    }
    if (typeof pkg.node_count !== "number" || pkg.node_count < 0) {
      errors.push(`${prefix}: node_count must be a non-negative number`);
    }
    if (typeof pkg.edge_count !== "number" || pkg.edge_count < 0) {
      errors.push(`${prefix}: edge_count must be a non-negative number`);
    }

    return errors;
  }

  /**
   * Detect repository ID from git remote, package.json, or path.
   * Delegates to the shared git utility which handles worktrees.
   */
  private async detectRepoIdFromPath(repoPath: string): Promise<string> {
    const result = await detectRepoId(repoPath);
    return result.repoId;
  }

  /**
   * Discover all packages with seed directories
   */
  private async discoverPackages(repoPath: string): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];

    // Check if repo root has seeds
    const rootSeedPath = path.join(repoPath, ".devac", "seed", "base");
    if (await this.directoryExists(rootSeedPath)) {
      const pkgInfo = await this.analyzePackage(repoPath, repoPath);
      if (pkgInfo) {
        packages.push(pkgInfo);
      }
    }

    // Recursively find all .devac/seed directories
    await this.findPackagesRecursive(repoPath, repoPath, packages);

    return packages;
  }

  /**
   * Recursively find packages with seed directories
   */
  private async findPackagesRecursive(
    repoPath: string,
    currentPath: string,
    packages: PackageInfo[]
  ): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip node_modules, .git, and .devac directories
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".devac") {
          continue;
        }

        const entryPath = path.join(currentPath, entry.name);
        const seedPath = path.join(entryPath, ".devac", "seed", "base");

        if (await this.directoryExists(seedPath)) {
          const pkgInfo = await this.analyzePackage(repoPath, entryPath);
          if (pkgInfo) {
            packages.push(pkgInfo);
          }
        }

        // Continue recursively
        await this.findPackagesRecursive(repoPath, entryPath, packages);
      }
    } catch {
      // Directory not readable, skip
    }
  }

  /**
   * Analyze a single package
   */
  private async analyzePackage(repoPath: string, packagePath: string): Promise<PackageInfo | null> {
    const seedPath = path.join(packagePath, ".devac", "seed", "base");

    if (!(await this.directoryExists(seedPath))) {
      return null;
    }

    const relativePath = path.relative(repoPath, packagePath) || ".";
    const name = await this.getPackageName(packagePath, relativePath);
    const stats = await this.readSeedStats(seedPath);
    const lastAnalyzed = await this.getLastAnalyzedTime(seedPath);

    // Generate seed_path in standard format
    const seedPathRelative =
      relativePath === "."
        ? ".devac/seed/base/"
        : `.devac/seed/base/${relativePath.replace(/\//g, "-")}/`;

    return {
      path: relativePath,
      name,
      seed_path: seedPathRelative,
      last_analyzed: lastAnalyzed,
      file_count: stats.fileCount,
      node_count: stats.nodeCount,
      edge_count: stats.edgeCount,
    };
  }

  /**
   * Get package name from package.json or directory name
   */
  private async getPackageName(packagePath: string, relativePath: string): Promise<string> {
    try {
      const packageJsonPath = path.join(packagePath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);
      if (packageJson.name) {
        return packageJson.name;
      }
    } catch {
      // No package.json or invalid
    }

    // Fall back to directory name
    if (relativePath === ".") {
      return path.basename(path.resolve(packagePath));
    }
    return path.basename(relativePath);
  }

  /**
   * Read seed statistics
   */
  private async readSeedStats(seedPath: string): Promise<SeedStats> {
    const defaultStats: SeedStats = {
      nodeCount: 0,
      edgeCount: 0,
      refCount: 0,
      fileCount: 0,
    };

    try {
      // Try to read stats.json (test/mock format)
      const statsPath = path.join(seedPath, "stats.json");
      const content = await fs.readFile(statsPath, "utf-8");
      const stats = JSON.parse(content);
      return {
        nodeCount: stats.nodeCount ?? 0,
        edgeCount: stats.edgeCount ?? 0,
        refCount: stats.refCount ?? 0,
        fileCount: stats.fileCount ?? 0,
      };
    } catch {
      // stats.json not available, try to read from parquet meta
      // In production, we would query the parquet files
      return defaultStats;
    }
  }

  /**
   * Get last analyzed time from seed files
   */
  private async getLastAnalyzedTime(seedPath: string): Promise<string> {
    try {
      // Use the modification time of nodes.parquet
      const nodesPath = path.join(seedPath, "nodes.parquet");
      const stat = await fs.stat(nodesPath);
      return stat.mtime.toISOString();
    } catch {
      // Fall back to current time
      return new Date().toISOString();
    }
  }

  /**
   * Collect external dependencies from all packages
   */
  private async collectExternalDependencies(
    repoPath: string,
    packages: PackageInfo[]
  ): Promise<ExternalDependency[]> {
    const depsMap = new Map<string, ExternalDependency>();

    for (const pkg of packages) {
      const pkgPath = pkg.path === "." ? repoPath : path.join(repoPath, pkg.path);
      const seedPath = path.join(pkgPath, ".devac", "seed", "base");

      try {
        // Try to read external_deps.json
        const depsPath = path.join(seedPath, "external_deps.json");
        const content = await fs.readFile(depsPath, "utf-8");
        const deps = JSON.parse(content) as ExternalDependency[];

        for (const dep of deps) {
          if (dep.package) {
            depsMap.set(dep.package, dep);
          }
        }
      } catch {
        // No external deps file
      }
    }

    return Array.from(depsMap.values());
  }

  /**
   * Write manifest to disk atomically
   */
  private async writeManifest(repoPath: string, manifest: RepositoryManifest): Promise<void> {
    const manifestDir = path.join(repoPath, ".devac");
    await fs.mkdir(manifestDir, { recursive: true });

    const manifestPath = path.join(manifestDir, "manifest.json");
    // Use crypto random to avoid collisions in concurrent calls
    const randomSuffix = crypto.randomBytes(8).toString("hex");
    const tempPath = `${manifestPath}.tmp.${Date.now()}.${randomSuffix}`;

    try {
      // Write to temp file first
      const content = JSON.stringify(manifest, null, 2);
      await fs.writeFile(tempPath, content, "utf-8");

      // Atomic rename
      await fs.rename(tempPath, manifestPath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Read existing manifest
   */
  private async readManifest(repoPath: string): Promise<RepositoryManifest | null> {
    try {
      const manifestPath = path.join(repoPath, ".devac", "manifest.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      return JSON.parse(content) as RepositoryManifest;
    } catch {
      return null;
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

/**
 * Create a ManifestGenerator instance
 */
export function createManifestGenerator(): ManifestGenerator {
  return new ManifestGenerator();
}
