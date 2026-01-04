/**
 * Doc Sync Command Implementation
 *
 * Generates documentation from DevAC analysis results.
 * Supports effects documentation and C4 architecture diagrams.
 * Part of DevAC v3.0 Foundation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  type C4ContainerDiagram,
  type C4Context,
  DuckDBPool,
  type EffectsDocData,
  type HubClient,
  type PackageEffectsInput,
  aggregatePackageEffects,
  builtinRules,
  computeRepoSeedHash,
  computeSeedHash,
  computeWorkspaceSeedHash,
  createEffectReader,
  createHubClient,
  createRuleEngine,
  discoverPackagesInRepo,
  docNeedsRegeneration,
  findWorkspaceDir,
  generateAllC4Docs,
  generateAllRepoC4Docs,
  generateC4Containers,
  generateC4Context,
  generateEffectsDoc,
  generateEmptyC4ContainersDoc,
  generateEmptyC4ContextDoc,
  generateEmptyEffectsDoc,
  generateEmptyRepoEffectsDoc,
  generateEmptyWorkspaceEffectsDoc,
  generateRepoEffectsDoc,
  generateWorkspaceC4ContainersDoc,
  generateWorkspaceC4ContextDoc,
  generateWorkspaceEffectsDoc,
  getC4FilePaths,
  getRepoC4FilePaths,
  hasSeed,
  queryWorkspaceEffects,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput } from "./output-formatter.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for doc-sync command
 */
export interface DocSyncOptions {
  /** Package path (sync specific package) */
  package?: string;
  /** Repo path (sync all packages in repo) */
  repo?: string;
  /** Sync entire workspace */
  workspace?: boolean;
  /** Effects documentation only */
  effects?: boolean;
  /** C4 diagrams only */
  c4?: boolean;
  /** All documentation (default) */
  all?: boolean;
  /** Regenerate even if unchanged */
  force?: boolean;
  /** CI mode: verify docs are in sync */
  check?: boolean;
  /** Only staged seed changes */
  staged?: boolean;
  /** Only process verified packages */
  requireVerified?: boolean;
  /** JSON output */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Result of syncing a single package
 */
export interface PackageSyncResult {
  /** Package path */
  packagePath: string;
  /** Package name */
  packageName: string;
  /** Whether sync was successful */
  success: boolean;
  /** Whether docs were regenerated */
  regenerated: boolean;
  /** Reason for regeneration (or why skipped) */
  reason?: string;
  /** Files that were written */
  filesWritten: string[];
  /** Errors encountered */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

/**
 * Result of syncing repo-level documentation
 */
export interface RepoSyncResult {
  /** Repo path */
  repoPath: string;
  /** Repo name */
  repoName: string;
  /** Whether sync was successful */
  success: boolean;
  /** Whether docs were regenerated */
  regenerated: boolean;
  /** Reason for regeneration (or why skipped) */
  reason?: string;
  /** Files that were written */
  filesWritten: string[];
  /** Errors encountered */
  errors: string[];
  /** Number of packages aggregated */
  packagesAggregated: number;
}

/**
 * Result of syncing workspace-level documentation
 */
export interface WorkspaceSyncResult {
  /** Workspace path */
  workspacePath: string;
  /** Whether sync was successful */
  success: boolean;
  /** Whether docs were regenerated */
  regenerated: boolean;
  /** Reason for regeneration (or why skipped) */
  reason?: string;
  /** Files that were written */
  filesWritten: string[];
  /** Errors encountered */
  errors: string[];
  /** Number of repos aggregated */
  reposAggregated: number;
}

/**
 * Result from doc-sync command
 */
export interface DocSyncResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of packages processed */
  packagesProcessed: number;
  /** Number of packages regenerated */
  packagesRegenerated: number;
  /** Number of packages skipped */
  packagesSkipped: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Per-package results */
  packages: PackageSyncResult[];
  /** Repo-level result (when --repo) */
  repoLevel?: RepoSyncResult;
  /** Workspace-level result (when --workspace) */
  workspaceLevel?: WorkspaceSyncResult;
  /** Whether docs are in sync (for --check mode) */
  inSync?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get package name from path
 */
function getPackageName(packagePath: string): string {
  try {
    const pkgJsonPath = path.join(packagePath, "package.json");
    // Using dynamic import to avoid require issues
    const content = JSON.parse(
      // eslint-disable-next-line no-restricted-globals
      require("node:fs").readFileSync(pkgJsonPath, "utf-8")
    );
    return content.name || path.basename(packagePath);
  } catch {
    return path.basename(packagePath);
  }
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

/**
 * Extract effects data from seed files for generating documentation
 */
async function extractEffectsData(
  pool: DuckDBPool,
  packagePath: string
): Promise<EffectsDocData | null> {
  try {
    const reader = createEffectReader(pool, packagePath);
    const effectsResult = await reader.readEffects({});

    if (effectsResult.effects.length === 0) {
      return null;
    }

    // Categorize effects into patterns
    const storePatterns = new Map<string, number>();
    const retrievePatterns = new Map<string, number>();
    const externalPatterns = new Map<string, { count: number; module: string | null }>();
    const otherPatterns = new Map<string, { count: number; isMethod: boolean; isAsync: boolean }>();

    for (const effect of effectsResult.effects) {
      // Access fields directly from effect - they are top-level, not in properties
      // Use type assertion for FunctionCall-specific fields
      const eff = effect as {
        callee_name?: string;
        is_external?: boolean;
        is_async?: boolean;
        external_module?: string | null;
        store_type?: string;
        retrieve_type?: string;
      };
      const callee = eff.callee_name || "";
      const isExternal = eff.is_external || false;
      const isAsync = eff.is_async || false;

      if (effect.effect_type === "Store") {
        const current = storePatterns.get(callee) || 0;
        storePatterns.set(callee, current + 1);
      } else if (effect.effect_type === "Retrieve") {
        const current = retrievePatterns.get(callee) || 0;
        retrievePatterns.set(callee, current + 1);
      } else if (effect.effect_type === "Send" || isExternal) {
        const existing = externalPatterns.get(callee);
        if (existing) {
          existing.count++;
        } else {
          externalPatterns.set(callee, {
            count: 1,
            module: eff.external_module || null,
          });
        }
      } else {
        const existing = otherPatterns.get(callee);
        if (existing) {
          existing.count++;
        } else {
          otherPatterns.set(callee, {
            count: 1,
            isMethod: callee.includes("."),
            isAsync,
          });
        }
      }
    }

    return {
      packageName: getPackageName(packagePath),
      storePatterns: Array.from(storePatterns.entries())
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count),
      retrievePatterns: Array.from(retrievePatterns.entries())
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count),
      externalPatterns: Array.from(externalPatterns.entries())
        .map(([pattern, data]) => ({ pattern, ...data }))
        .sort((a, b) => b.count - a.count),
      otherPatterns: Array.from(otherPatterns.entries())
        .map(([pattern, data]) => ({ pattern, ...data }))
        .sort((a, b) => b.count - a.count),
    };
  } catch {
    return null;
  }
}

/**
 * Generate C4 diagrams from effects
 */
async function generateC4FromEffects(
  pool: DuckDBPool,
  packagePath: string,
  packageName: string
): Promise<{ context: C4Context; containers: C4ContainerDiagram } | null> {
  try {
    const reader = createEffectReader(pool, packagePath);
    const effectsResult = await reader.readEffects({});

    if (effectsResult.effects.length === 0) {
      return null;
    }

    // Run rules engine to get domain effects
    const ruleEngine = createRuleEngine({ rules: builtinRules });
    const rulesResult = ruleEngine.process(effectsResult.effects);

    if (rulesResult.domainEffects.length === 0) {
      return null;
    }

    // Generate C4 diagrams
    const context = generateC4Context(rulesResult.domainEffects, {
      systemName: packageName,
      systemDescription: `Package: ${packageName}`,
    });

    const containers = generateC4Containers(rulesResult.domainEffects, {
      systemName: packageName,
      systemDescription: `Package: ${packageName}`,
    });

    return { context, containers };
  } catch {
    return null;
  }
}

/**
 * Sync documentation for a single package
 */
async function syncPackage(
  pool: DuckDBPool,
  packagePath: string,
  options: DocSyncOptions
): Promise<PackageSyncResult> {
  const packageName = getPackageName(packagePath);
  const result: PackageSyncResult = {
    packagePath,
    packageName,
    success: false,
    regenerated: false,
    filesWritten: [],
    errors: [],
    warnings: [],
  };

  // Check if package has seeds
  if (!(await hasSeed(packagePath))) {
    result.reason = "No seeds found - run 'devac analyze' first";
    result.warnings.push(result.reason);
    result.success = true; // Not an error, just nothing to do
    return result;
  }

  // Compute seed hash
  const seedHashResult = await computeSeedHash(packagePath);
  if (!seedHashResult.hash) {
    result.reason = "Could not compute seed hash";
    result.errors.push(result.reason);
    return result;
  }

  const docsDir = path.join(packagePath, "docs");
  const effectsDocPath = path.join(docsDir, "package-effects.md");
  const c4Paths = getC4FilePaths(docsDir);

  // Determine what to sync
  const syncEffects = options.effects || options.all || (!options.effects && !options.c4);
  const syncC4 = options.c4 || options.all || (!options.effects && !options.c4);

  // Check if regeneration is needed
  let needsEffectsRegen = options.force || false;
  let needsC4Regen = options.force || false;

  if (!options.force) {
    if (syncEffects) {
      const check = await docNeedsRegeneration(effectsDocPath, seedHashResult.hash);
      needsEffectsRegen = check.needsRegeneration;
      if (check.reason && options.verbose) {
        result.warnings.push(`Effects: ${check.reason}`);
      }
    }

    if (syncC4) {
      const check = await docNeedsRegeneration(c4Paths.context, seedHashResult.hash);
      needsC4Regen = check.needsRegeneration;
      if (check.reason && options.verbose) {
        result.warnings.push(`C4: ${check.reason}`);
      }
    }
  }

  // In check mode, just report if docs are out of sync
  if (options.check) {
    if ((syncEffects && needsEffectsRegen) || (syncC4 && needsC4Regen)) {
      result.reason = "Documentation is out of sync with seeds";
      result.regenerated = false;
      result.success = false;
    } else {
      result.reason = "Documentation is in sync";
      result.regenerated = false;
      result.success = true;
    }
    return result;
  }

  // Skip if nothing needs regeneration
  if (!needsEffectsRegen && !needsC4Regen) {
    result.reason = "Documentation is up to date";
    result.success = true;
    return result;
  }

  // Ensure docs directory exists
  await ensureDir(docsDir);

  // Generate effects documentation
  if (syncEffects && needsEffectsRegen) {
    try {
      const effectsData = await extractEffectsData(pool, packagePath);

      let content: string;
      if (effectsData) {
        content = generateEffectsDoc(effectsData, {
          seedHash: seedHashResult.hash,
          packagePath,
        });
      } else {
        content = generateEmptyEffectsDoc(packageName, {
          seedHash: seedHashResult.hash,
          packagePath,
        });
      }

      await fs.writeFile(effectsDocPath, content, "utf-8");
      result.filesWritten.push(effectsDocPath);
    } catch (err) {
      result.errors.push(`Failed to generate effects doc: ${err}`);
    }
  }

  // Generate C4 diagrams
  if (syncC4 && needsC4Regen) {
    try {
      await ensureDir(c4Paths.directory);

      const c4Data = await generateC4FromEffects(pool, packagePath, packageName);

      if (c4Data) {
        const docs = generateAllC4Docs(c4Data.context, c4Data.containers, {
          seedHash: seedHashResult.hash,
          packagePath,
        });

        await fs.writeFile(c4Paths.context, docs.context, "utf-8");
        await fs.writeFile(c4Paths.containers, docs.containers, "utf-8");
        result.filesWritten.push(c4Paths.context);
        result.filesWritten.push(c4Paths.containers);
      } else {
        // Generate empty C4 diagrams
        const contextDoc = generateEmptyC4ContextDoc(packageName, {
          seedHash: seedHashResult.hash,
          packagePath,
        });
        const containersDoc = generateEmptyC4ContainersDoc(packageName, {
          seedHash: seedHashResult.hash,
          packagePath,
        });

        await fs.writeFile(c4Paths.context, contextDoc, "utf-8");
        await fs.writeFile(c4Paths.containers, containersDoc, "utf-8");
        result.filesWritten.push(c4Paths.context);
        result.filesWritten.push(c4Paths.containers);
      }
    } catch (err) {
      result.errors.push(`Failed to generate C4 diagrams: ${err}`);
    }
  }

  result.success = result.errors.length === 0;
  result.regenerated = result.filesWritten.length > 0;
  result.reason = result.regenerated
    ? `Regenerated ${result.filesWritten.length} files`
    : "No files generated";

  return result;
}

/**
 * Sync repo-level documentation by aggregating effects from all packages
 */
async function syncRepoLevel(
  pool: DuckDBPool,
  repoPath: string,
  packagePaths: string[],
  options: DocSyncOptions
): Promise<RepoSyncResult> {
  const repoName = path.basename(repoPath);
  const result: RepoSyncResult = {
    repoPath,
    repoName,
    success: false,
    regenerated: false,
    filesWritten: [],
    errors: [],
    packagesAggregated: 0,
  };

  // Compute combined seed hash from all packages
  const seedHashResult = await computeRepoSeedHash(packagePaths);
  if (!seedHashResult.hash) {
    result.reason = "Could not compute repo seed hash";
    result.errors.push(result.reason);
    return result;
  }

  const docsDir = path.join(repoPath, "docs");
  const effectsDocPath = path.join(docsDir, "repo-effects.md");
  const c4Paths = getRepoC4FilePaths(repoPath);

  // Determine what to sync
  const syncEffects = options.effects || options.all || (!options.effects && !options.c4);
  const syncC4 = options.c4 || options.all || (!options.effects && !options.c4);

  // Check if regeneration is needed
  let needsEffectsRegen = options.force || false;
  let needsC4Regen = options.force || false;

  if (!options.force) {
    if (syncEffects) {
      const check = await docNeedsRegeneration(effectsDocPath, seedHashResult.hash);
      needsEffectsRegen = check.needsRegeneration;
    }
    if (syncC4) {
      const check = await docNeedsRegeneration(c4Paths.context, seedHashResult.hash);
      needsC4Regen = check.needsRegeneration;
    }
  }

  // In check mode, just report if docs are out of sync
  if (options.check) {
    if ((syncEffects && needsEffectsRegen) || (syncC4 && needsC4Regen)) {
      result.reason = "Repo documentation is out of sync with seeds";
      result.success = false;
    } else {
      result.reason = "Repo documentation is in sync";
      result.success = true;
    }
    return result;
  }

  // Skip if nothing needs regeneration
  if (!needsEffectsRegen && !needsC4Regen) {
    result.reason = "Repo documentation is up to date";
    result.success = true;
    return result;
  }

  // Collect effects data from all packages
  const packageInputs: PackageEffectsInput[] = [];

  for (const packagePath of packagePaths) {
    const packageName = getPackageName(packagePath);
    const packageSeedHash = seedHashResult.packageHashes.get(packagePath) || null;
    const effectsData = await extractEffectsData(pool, packagePath);

    if (effectsData) {
      packageInputs.push({
        packageName,
        packagePath,
        data: effectsData,
        seedHash: packageSeedHash,
      });
    }
  }

  result.packagesAggregated = packageInputs.length;

  // Ensure docs directory exists
  await ensureDir(docsDir);

  // Generate repo-level effects documentation
  if (syncEffects && needsEffectsRegen) {
    try {
      if (packageInputs.length > 0) {
        const repoData = aggregatePackageEffects(packageInputs);
        const content = generateRepoEffectsDoc(repoData, {
          seedHash: seedHashResult.hash,
          repoPath,
        });
        await fs.writeFile(effectsDocPath, content, "utf-8");
      } else {
        const content = generateEmptyRepoEffectsDoc(repoName, {
          seedHash: seedHashResult.hash,
          repoPath,
        });
        await fs.writeFile(effectsDocPath, content, "utf-8");
      }
      result.filesWritten.push(effectsDocPath);
    } catch (err) {
      result.errors.push(`Failed to generate repo effects doc: ${err}`);
    }
  }

  // Generate repo-level C4 diagrams
  if (syncC4 && needsC4Regen) {
    try {
      await ensureDir(c4Paths.directory);

      if (packageInputs.length > 0) {
        const repoData = aggregatePackageEffects(packageInputs);
        const docs = generateAllRepoC4Docs(repoData, {
          seedHash: seedHashResult.hash,
          repoPath,
        });

        await fs.writeFile(c4Paths.context, docs.context, "utf-8");
        await fs.writeFile(c4Paths.containers, docs.containers, "utf-8");
      } else {
        // Generate empty C4 diagrams
        const { generateEmptyRepoC4ContextDoc, generateEmptyRepoC4ContainersDoc } = (await import(
          "@pietgk/devac-core"
        )) as typeof import("@pietgk/devac-core");
        const contextDoc = generateEmptyRepoC4ContextDoc(repoName, {
          seedHash: seedHashResult.hash,
          repoPath,
        });
        const containersDoc = generateEmptyRepoC4ContainersDoc(repoName, {
          seedHash: seedHashResult.hash,
          repoPath,
        });

        await fs.writeFile(c4Paths.context, contextDoc, "utf-8");
        await fs.writeFile(c4Paths.containers, containersDoc, "utf-8");
      }
      result.filesWritten.push(c4Paths.context);
      result.filesWritten.push(c4Paths.containers);
    } catch (err) {
      result.errors.push(`Failed to generate repo C4 diagrams: ${err}`);
    }
  }

  result.success = result.errors.length === 0;
  result.regenerated = result.filesWritten.length > 0;
  result.reason = result.regenerated
    ? `Regenerated ${result.filesWritten.length} repo-level files`
    : "No repo files generated";

  return result;
}

/**
 * Sync workspace-level documentation by aggregating effects from hub
 */
async function syncWorkspaceLevel(
  hubClient: HubClient,
  workspacePath: string,
  options: DocSyncOptions
): Promise<WorkspaceSyncResult> {
  const result: WorkspaceSyncResult = {
    workspacePath,
    success: false,
    regenerated: false,
    filesWritten: [],
    errors: [],
    reposAggregated: 0,
  };

  // Compute combined seed hash from hub
  const seedHashResult = await computeWorkspaceSeedHash(hubClient);
  if (!seedHashResult.hash) {
    result.reason = "Could not compute workspace seed hash (no repos registered?)";
    result.errors.push(result.reason);
    return result;
  }

  const docsDir = path.join(workspacePath, "docs");
  const effectsDocPath = path.join(docsDir, "workspace-effects.md");
  const c4Dir = path.join(docsDir, "c4");
  const contextPath = path.join(c4Dir, "context.puml");
  const containersPath = path.join(c4Dir, "containers.puml");

  // Determine what to sync
  const syncEffects = options.effects || options.all || (!options.effects && !options.c4);
  const syncC4 = options.c4 || options.all || (!options.effects && !options.c4);

  // Check if regeneration is needed
  let needsEffectsRegen = options.force || false;
  let needsC4Regen = options.force || false;

  if (!options.force) {
    if (syncEffects) {
      const check = await docNeedsRegeneration(effectsDocPath, seedHashResult.hash);
      needsEffectsRegen = check.needsRegeneration;
    }
    if (syncC4) {
      const check = await docNeedsRegeneration(contextPath, seedHashResult.hash);
      needsC4Regen = check.needsRegeneration;
    }
  }

  // In check mode, just report if docs are out of sync
  if (options.check) {
    if ((syncEffects && needsEffectsRegen) || (syncC4 && needsC4Regen)) {
      result.reason = "Workspace documentation is out of sync with hub";
      result.success = false;
    } else {
      result.reason = "Workspace documentation is in sync";
      result.success = true;
    }
    return result;
  }

  // Skip if nothing needs regeneration
  if (!needsEffectsRegen && !needsC4Regen) {
    result.reason = "Workspace documentation is up to date";
    result.success = true;
    return result;
  }

  // Query workspace effects from hub
  let workspaceData: Awaited<ReturnType<typeof queryWorkspaceEffects>> | undefined;
  try {
    workspaceData = await queryWorkspaceEffects(hubClient);
    result.reposAggregated = workspaceData.repos.length;
  } catch (err) {
    result.errors.push(`Failed to query workspace effects: ${err}`);
    return result;
  }

  // Ensure docs directory exists
  await ensureDir(docsDir);

  // Generate workspace-level effects documentation
  if (syncEffects && needsEffectsRegen) {
    try {
      if (workspaceData.repos.length > 0) {
        const content = generateWorkspaceEffectsDoc(workspaceData, {
          seedHash: seedHashResult.hash,
          workspacePath,
        });
        await fs.writeFile(effectsDocPath, content, "utf-8");
      } else {
        const content = generateEmptyWorkspaceEffectsDoc({
          seedHash: seedHashResult.hash,
          workspacePath,
        });
        await fs.writeFile(effectsDocPath, content, "utf-8");
      }
      result.filesWritten.push(effectsDocPath);
    } catch (err) {
      result.errors.push(`Failed to generate workspace effects doc: ${err}`);
    }
  }

  // Generate workspace-level C4 diagrams
  if (syncC4 && needsC4Regen) {
    try {
      await ensureDir(c4Dir);

      if (workspaceData.repos.length > 0) {
        const contextContent = generateWorkspaceC4ContextDoc(workspaceData, {
          seedHash: seedHashResult.hash,
          workspacePath,
        });
        const containersContent = generateWorkspaceC4ContainersDoc(workspaceData, {
          seedHash: seedHashResult.hash,
          workspacePath,
        });

        await fs.writeFile(contextPath, contextContent, "utf-8");
        await fs.writeFile(containersPath, containersContent, "utf-8");
      } else {
        // Empty diagrams for no repos case
        const contextContent = generateWorkspaceC4ContextDoc(
          { ...workspaceData, repos: [] },
          { seedHash: seedHashResult.hash, workspacePath }
        );
        const containersContent = generateWorkspaceC4ContainersDoc(
          { ...workspaceData, repos: [] },
          { seedHash: seedHashResult.hash, workspacePath }
        );

        await fs.writeFile(contextPath, contextContent, "utf-8");
        await fs.writeFile(containersPath, containersContent, "utf-8");
      }
      result.filesWritten.push(contextPath);
      result.filesWritten.push(containersPath);
    } catch (err) {
      result.errors.push(`Failed to generate workspace C4 diagrams: ${err}`);
    }
  }

  result.success = result.errors.length === 0;
  result.regenerated = result.filesWritten.length > 0;
  result.reason = result.regenerated
    ? `Regenerated ${result.filesWritten.length} workspace-level files`
    : "No workspace files generated";

  return result;
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Execute the doc-sync command
 */
export async function docSyncCommand(options: DocSyncOptions): Promise<DocSyncResult> {
  const startTime = Date.now();

  const result: DocSyncResult = {
    success: false,
    output: "",
    packagesProcessed: 0,
    packagesRegenerated: 0,
    packagesSkipped: 0,
    timeMs: 0,
    packages: [],
  };

  // Create DuckDB pool
  const pool = new DuckDBPool();

  try {
    // Determine packages to process
    let packagePaths: string[] = [];
    let repoPath: string | undefined;
    let workspacePath: string | undefined;

    if (options.package) {
      // Single package mode
      packagePaths = [path.resolve(options.package)];
    } else if (options.repo) {
      // Repo mode - discover all packages
      repoPath = path.resolve(options.repo);
      const discovered = await discoverPackagesInRepo(repoPath);
      packagePaths = discovered.map((p) => p.path);
    } else if (options.workspace) {
      // Workspace mode - find workspace and process all registered repos
      const foundWorkspace = await findWorkspaceDir(process.cwd());
      workspacePath = foundWorkspace ?? process.cwd();
      if (foundWorkspace) {
        const discovered = await discoverPackagesInRepo(workspacePath);
        packagePaths = discovered.map((p) => p.path);
        // Also set repo path for the local repo
        repoPath = workspacePath;
      }
    } else {
      // Default: current directory as package
      packagePaths = [process.cwd()];
    }

    if (packagePaths.length === 0 && !options.workspace) {
      result.output = formatOutput(
        { error: "No packages found to process" },
        { json: options.json || false }
      );
      return result;
    }

    // Process each package
    for (const packagePath of packagePaths) {
      const packageResult = await syncPackage(pool, packagePath, options);
      result.packages.push(packageResult);
      result.packagesProcessed++;

      if (packageResult.regenerated) {
        result.packagesRegenerated++;
      } else {
        result.packagesSkipped++;
      }
    }

    // Repo-level aggregation (after processing all packages)
    if (options.repo && repoPath && packagePaths.length > 0) {
      const repoResult = await syncRepoLevel(pool, repoPath, packagePaths, options);
      result.repoLevel = repoResult;
    }

    // Workspace-level aggregation (requires hub)
    if (options.workspace && workspacePath) {
      const hubDir = path.join(workspacePath, ".devac");
      try {
        const hubClient = createHubClient({ hubDir });
        const repos = await hubClient.listRepos();

        if (repos.length > 0) {
          const workspaceResult = await syncWorkspaceLevel(hubClient, workspacePath, options);
          result.workspaceLevel = workspaceResult;
        } else {
          result.workspaceLevel = {
            workspacePath,
            success: true,
            regenerated: false,
            reason: "No repos registered with hub",
            filesWritten: [],
            errors: [],
            reposAggregated: 0,
          };
        }
      } catch {
        // Hub not available, skip workspace-level docs
        result.workspaceLevel = {
          workspacePath,
          success: true,
          regenerated: false,
          reason: "Hub not available - skipping workspace-level docs",
          filesWritten: [],
          errors: [],
          reposAggregated: 0,
        };
      }
    }

    // Determine overall success
    const hasPackageErrors = result.packages.some((p) => p.errors.length > 0);
    const hasRepoErrors = (result.repoLevel?.errors.length ?? 0) > 0;
    const hasWorkspaceErrors = (result.workspaceLevel?.errors.length ?? 0) > 0;
    result.success = !hasPackageErrors && !hasRepoErrors && !hasWorkspaceErrors;

    // In check mode, success means all docs are in sync
    if (options.check) {
      const packagesInSync = result.packages.every((p) => p.success);
      const repoInSync = result.repoLevel ? result.repoLevel.success : true;
      const workspaceInSync = result.workspaceLevel ? result.workspaceLevel.success : true;
      result.inSync = packagesInSync && repoInSync && workspaceInSync;
      result.success = result.inSync;
    }

    // Format output
    result.timeMs = Date.now() - startTime;

    if (options.json) {
      result.output = formatOutput(
        {
          success: result.success,
          packagesProcessed: result.packagesProcessed,
          packagesRegenerated: result.packagesRegenerated,
          packagesSkipped: result.packagesSkipped,
          timeMs: result.timeMs,
          inSync: result.inSync,
          packages: result.packages,
          repoLevel: result.repoLevel,
          workspaceLevel: result.workspaceLevel,
        },
        { json: true }
      );
    } else {
      const lines: string[] = [];

      if (options.check) {
        lines.push(result.inSync ? "✓ Documentation is in sync" : "✗ Documentation is out of sync");
      } else {
        lines.push(`Processed ${result.packagesProcessed} package(s)`);
        lines.push(`  Regenerated: ${result.packagesRegenerated}`);
        lines.push(`  Skipped: ${result.packagesSkipped}`);
      }

      if (options.verbose || !result.success) {
        lines.push("");
        for (const pkg of result.packages) {
          const status = pkg.success ? "✓" : "✗";
          lines.push(`${status} ${pkg.packageName}`);
          if (pkg.reason) {
            lines.push(`    ${pkg.reason}`);
          }
          for (const file of pkg.filesWritten) {
            lines.push(`    + ${path.relative(process.cwd(), file)}`);
          }
          for (const err of pkg.errors) {
            lines.push(`    ✗ ${err}`);
          }
        }
      }

      // Repo-level output
      if (result.repoLevel) {
        lines.push("");
        const status = result.repoLevel.success ? "✓" : "✗";
        lines.push(`${status} Repo: ${result.repoLevel.repoName}`);
        if (result.repoLevel.reason) {
          lines.push(`    ${result.repoLevel.reason}`);
        }
        if (result.repoLevel.packagesAggregated > 0) {
          lines.push(`    Aggregated ${result.repoLevel.packagesAggregated} package(s)`);
        }
        for (const file of result.repoLevel.filesWritten) {
          lines.push(`    + ${path.relative(process.cwd(), file)}`);
        }
        for (const err of result.repoLevel.errors) {
          lines.push(`    ✗ ${err}`);
        }
      }

      // Workspace-level output
      if (result.workspaceLevel) {
        lines.push("");
        const status = result.workspaceLevel.success ? "✓" : "✗";
        lines.push(`${status} Workspace`);
        if (result.workspaceLevel.reason) {
          lines.push(`    ${result.workspaceLevel.reason}`);
        }
        if (result.workspaceLevel.reposAggregated > 0) {
          lines.push(`    Aggregated ${result.workspaceLevel.reposAggregated} repo(s)`);
        }
        for (const file of result.workspaceLevel.filesWritten) {
          lines.push(`    + ${path.relative(process.cwd(), file)}`);
        }
        for (const err of result.workspaceLevel.errors) {
          lines.push(`    ✗ ${err}`);
        }
      }

      lines.push("");
      lines.push(`Completed in ${result.timeMs}ms`);

      result.output = lines.join("\n");
    }

    return result;
  } catch (err) {
    result.timeMs = Date.now() - startTime;
    result.output = formatOutput(
      { error: `doc-sync failed: ${err}` },
      { json: options.json || false }
    );
    return result;
  } finally {
    // Shutdown DuckDB pool
    await pool.shutdown();
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the doc-sync command with Commander
 */
export function registerDocSyncCommand(program: Command): void {
  program
    .command("doc-sync")
    .description("Generate documentation from DevAC analysis results")
    .option("-p, --package <path>", "Sync specific package")
    .option("-r, --repo <path>", "Sync all packages in repo")
    .option("-w, --workspace", "Sync entire workspace")
    .option("--effects", "Effects documentation only")
    .option("--c4", "C4 diagrams only")
    .option("--all", "All documentation (default)")
    .option("--force", "Regenerate even if unchanged")
    .option("--check", "CI mode: verify docs are in sync")
    .option("--staged", "Only staged seed changes")
    .option("--require-verified", "Only process verified packages")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Detailed progress")
    .action(async (opts) => {
      const result = await docSyncCommand({
        package: opts.package,
        repo: opts.repo,
        workspace: opts.workspace,
        effects: opts.effects,
        c4: opts.c4,
        all: opts.all,
        force: opts.force,
        check: opts.check,
        staged: opts.staged,
        requireVerified: opts.requireVerified,
        json: opts.json,
        verbose: opts.verbose,
      });

      console.log(result.output);
      process.exit(result.success ? 0 : 1);
    });
}
