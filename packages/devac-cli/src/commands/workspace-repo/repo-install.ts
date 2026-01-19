/**
 * Workspace Repo Install Command
 *
 * Creates symlinks from workspace repo to workspace root:
 * - CLAUDE.md -> <workspace-repo>/CLAUDE.md
 * - .agent-os -> <workspace-repo>/.agent-os
 *
 * This allows the workspace root to have access to the versioned
 * workspace configuration without duplicating files.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";

/**
 * Options for repo install command
 */
export interface RepoInstallOptions {
  /** Workspace path */
  workspacePath: string;
  /** Path to workspace repo (auto-detected if not provided) */
  repoPath?: string;
  /** Force overwrite existing files (backup first) */
  force?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Symlink info
 */
export interface SymlinkInfo {
  /** Source path (in workspace repo) */
  source: string;
  /** Target path (in workspace root) */
  target: string;
  /** Status */
  status: "created" | "updated" | "skipped" | "backed_up" | "error";
  /** Error message if status is "error" */
  error?: string;
  /** Backup path if file was backed up */
  backupPath?: string;
}

/**
 * Result of repo install command
 */
export interface RepoInstallResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Path to the workspace repo */
  repoPath: string;
  /** Symlinks that were processed */
  symlinks: SymlinkInfo[];
  /** Formatted output */
  formatted?: string;
}

/**
 * Symlink configuration from workspace.yaml
 */
interface SymlinkConfig {
  source: string;
  target: string;
}

/**
 * Default symlinks to create
 */
const DEFAULT_SYMLINKS: SymlinkConfig[] = [
  { source: "CLAUDE.md", target: "../CLAUDE.md" },
  { source: ".agent-os", target: "../.agent-os" },
];

/**
 * Find workspace repo in the workspace directory
 */
async function findWorkspaceRepo(workspacePath: string): Promise<string | null> {
  const entries = await fs.readdir(workspacePath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith("-workspace")) {
      const repoPath = path.join(workspacePath, entry.name);
      const workspaceYamlPath = path.join(repoPath, "workspace.yaml");

      try {
        await fs.access(workspaceYamlPath);
        return repoPath;
      } catch {
        // Not a workspace repo
      }
    }
  }

  return null;
}

/**
 * Load symlink configuration from workspace.yaml
 */
async function loadSymlinkConfig(repoPath: string): Promise<SymlinkConfig[]> {
  const workspaceYamlPath = path.join(repoPath, "workspace.yaml");

  try {
    const content = await fs.readFile(workspaceYamlPath, "utf-8");
    const parsed = YAML.parse(content);

    if (parsed.symlinks && Array.isArray(parsed.symlinks)) {
      return parsed.symlinks.map((s: Record<string, string>) => ({
        source: s.source,
        target: s.target,
      }));
    }
  } catch {
    // Use defaults
  }

  return DEFAULT_SYMLINKS;
}

/**
 * Create a symlink with proper error handling
 */
async function createSymlink(
  sourcePath: string,
  targetPath: string,
  force: boolean
): Promise<SymlinkInfo> {
  const result: SymlinkInfo = {
    source: sourcePath,
    target: targetPath,
    status: "created",
  };

  try {
    // Check if source exists
    await fs.access(sourcePath);
  } catch {
    return {
      ...result,
      status: "skipped",
      error: `Source does not exist: ${sourcePath}`,
    };
  }

  try {
    // Check if target already exists
    const targetStats = await fs.lstat(targetPath);

    if (targetStats.isSymbolicLink()) {
      // Already a symlink - update it
      const currentTarget = await fs.readlink(targetPath);
      const expectedTarget = path.relative(path.dirname(targetPath), sourcePath);

      if (currentTarget === expectedTarget) {
        return {
          ...result,
          status: "skipped",
          error: "Symlink already exists and points to correct target",
        };
      }

      // Remove old symlink and create new one
      await fs.unlink(targetPath);
      result.status = "updated";
    } else {
      // Regular file/directory exists
      if (!force) {
        return {
          ...result,
          status: "error",
          error: "Target exists and is not a symlink. Use --force to backup and replace.",
        };
      }

      // Backup existing file
      const backupPath = `${targetPath}.bak`;
      await fs.rename(targetPath, backupPath);
      result.backupPath = backupPath;
      result.status = "backed_up";
    }
  } catch (err) {
    // Target doesn't exist - this is fine
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        ...result,
        status: "error",
        error: `Error checking target: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  try {
    // Create relative symlink
    const relativeSource = path.relative(path.dirname(targetPath), sourcePath);
    await fs.symlink(relativeSource, targetPath);

    if (result.status !== "updated" && result.status !== "backed_up") {
      result.status = "created";
    }

    return result;
  } catch (err) {
    return {
      ...result,
      status: "error",
      error: `Failed to create symlink: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Execute repo install command
 */
export async function repoInstallCommand(options: RepoInstallOptions): Promise<RepoInstallResult> {
  const { workspacePath, repoPath: customRepoPath, force = false } = options;

  const resolvedWorkspacePath = path.resolve(workspacePath);

  const result: RepoInstallResult = {
    success: false,
    repoPath: "",
    symlinks: [],
  };

  try {
    // Find workspace repo
    const repoPath = customRepoPath
      ? path.resolve(customRepoPath)
      : await findWorkspaceRepo(resolvedWorkspacePath);

    if (!repoPath) {
      return {
        ...result,
        error: "No workspace repo found. Run 'devac workspace repo init' first.",
      };
    }

    result.repoPath = repoPath;

    // Load symlink configuration
    const symlinkConfigs = await loadSymlinkConfig(repoPath);

    // Process each symlink
    for (const config of symlinkConfigs) {
      const sourcePath = path.join(repoPath, config.source);
      const targetPath = path.resolve(repoPath, config.target);

      const symlinkResult = await createSymlink(sourcePath, targetPath, force);
      result.symlinks.push(symlinkResult);
    }

    // Check if all symlinks were successful
    const errors = result.symlinks.filter((s) => s.status === "error");
    if (errors.length > 0) {
      result.success = false;
      result.error = `${errors.length} symlink(s) failed`;
    } else {
      result.success = true;
    }

    result.formatted = formatResult(result);

    return result;
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format result for display
 */
function formatResult(result: RepoInstallResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push("✓ Workspace symlinks installed");
  } else {
    lines.push("⚠ Workspace symlinks partially installed");
  }

  lines.push("");
  lines.push(`Workspace repo: ${result.repoPath}`);
  lines.push("");

  // Group symlinks by status
  const created = result.symlinks.filter((s) => s.status === "created");
  const updated = result.symlinks.filter((s) => s.status === "updated");
  const backedUp = result.symlinks.filter((s) => s.status === "backed_up");
  const skipped = result.symlinks.filter((s) => s.status === "skipped");
  const errors = result.symlinks.filter((s) => s.status === "error");

  if (created.length > 0) {
    lines.push("Created:");
    for (const s of created) {
      lines.push(`  🔗 ${s.target}`);
    }
    lines.push("");
  }

  if (updated.length > 0) {
    lines.push("Updated:");
    for (const s of updated) {
      lines.push(`  🔗 ${s.target}`);
    }
    lines.push("");
  }

  if (backedUp.length > 0) {
    lines.push("Backed up and replaced:");
    for (const s of backedUp) {
      lines.push(`  🔗 ${s.target}`);
      lines.push(`     (backup: ${s.backupPath})`);
    }
    lines.push("");
  }

  if (skipped.length > 0) {
    lines.push("Skipped:");
    for (const s of skipped) {
      lines.push(`  ⏭  ${s.target}`);
      if (s.error) {
        lines.push(`     ${s.error}`);
      }
    }
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push("Errors:");
    for (const s of errors) {
      lines.push(`  ✗ ${s.target}`);
      if (s.error) {
        lines.push(`     ${s.error}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
