/**
 * Workspace Repo Init Command
 *
 * Creates a dedicated git repository for workspace configuration.
 * The workspace repo contains:
 * - CLAUDE.md (auto-generated + manual sections)
 * - workspace.yaml (workspace definition)
 * - .agent-os/ (optional agent OS configuration)
 * - scripts/install.sh (symlink setup script)
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type WorkspaceInfo, type WorkspaceRepoInfo, discoverWorkspace } from "@pietgk/devac-core";
import { type ParsedAgentsMd, parseAllAgentsMd } from "./utils/agents-parser.js";
import { type WorkspaceDefinition, generateClaudeMd } from "./utils/claude-generator.js";

/**
 * Options for repo init command
 */
export interface RepoInitOptions {
  /** Workspace path */
  workspacePath: string;
  /** Name for the workspace repo (default: "workspace") */
  name?: string;
  /** Path for the workspace repo (default: <workspace>/<name>-workspace) */
  repoPath?: string;
  /** Create symlinks after init */
  createSymlinks?: boolean;
  /** Force overwrite existing repo */
  force?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result of repo init command
 */
export interface RepoInitResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Path to the created workspace repo */
  repoPath: string;
  /** Path to the generated CLAUDE.md */
  claudeMdPath: string;
  /** Path to workspace.yaml */
  workspaceYamlPath: string;
  /** Symlinks created (if createSymlinks was true) */
  symlinksCreated: string[];
  /** Number of repos discovered */
  reposDiscovered: number;
  /** Number of AGENTS.md files found */
  agentsMdFound: number;
  /** Formatted output */
  formatted?: string;
}

/**
 * Default workspace.yaml content
 */
function generateWorkspaceYaml(
  name: string,
  description: string | undefined,
  repos: WorkspaceRepoInfo[]
): string {
  const lines: string[] = [];

  lines.push("# Workspace definition file");
  lines.push(`version: \"1.0\"`);
  lines.push(`name: ${name}`);
  if (description) {
    lines.push(`description: ${description}`);
  }
  lines.push("");
  lines.push("# Repository list (source of truth)");
  lines.push("repos:");

  for (const repo of repos) {
    lines.push(`  - path: ${repo.name}`);
    if (repo.name.includes("-workspace")) {
      lines.push("    exclude_from_docs: true");
    }
  }

  lines.push("");
  lines.push("# Symlink configuration");
  lines.push("symlinks:");
  lines.push("  - source: CLAUDE.md");
  lines.push("    target: ../CLAUDE.md");
  lines.push("  - source: .agent-os");
  lines.push("    target: ../.agent-os");
  lines.push("");
  lines.push("# Generation settings");
  lines.push("generation:");
  lines.push("  preserve_sections: true");
  lines.push("  include_commands: true");
  lines.push("  include_tech_stack: true");

  return lines.join("\n");
}

/**
 * Generate install.sh script
 */
function generateInstallScript(workspaceRepoName: string): string {
  const lines: string[] = [];

  lines.push("#!/bin/bash");
  lines.push("");
  lines.push("# Install script for workspace configuration");
  lines.push("# Creates symlinks from workspace repo to workspace root");
  lines.push("");
  lines.push("set -e");
  lines.push("");
  lines.push('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"');
  lines.push('WORKSPACE_REPO="$(dirname "$SCRIPT_DIR")"');
  lines.push('WORKSPACE_ROOT="$(dirname "$WORKSPACE_REPO")"');
  lines.push("");
  lines.push('echo "Installing workspace configuration..."');
  lines.push('echo "  Workspace repo: $WORKSPACE_REPO"');
  lines.push('echo "  Workspace root: $WORKSPACE_ROOT"');
  lines.push("");
  lines.push("# Create symlinks");
  lines.push("create_symlink() {");
  lines.push('  local source="$1"');
  lines.push('  local target="$2"');
  lines.push("  ");
  lines.push('  if [ -L "$target" ]; then');
  lines.push('    echo "  Updating symlink: $target"');
  lines.push('    rm "$target"');
  lines.push('  elif [ -e "$target" ]; then');
  lines.push('    echo "  Backing up existing: $target -> ${target}.bak"');
  lines.push('    mv "$target" "${target}.bak"');
  lines.push("  fi");
  lines.push("  ");
  lines.push('  ln -s "$source" "$target"');
  lines.push('  echo "  Created symlink: $target -> $source"');
  lines.push("}");
  lines.push("");
  lines.push("# CLAUDE.md symlink");
  lines.push(`create_symlink \"${workspaceRepoName}/CLAUDE.md\" \"$WORKSPACE_ROOT/CLAUDE.md\"`);
  lines.push("");
  lines.push("# .agent-os symlink (if exists)");
  lines.push('if [ -d "$WORKSPACE_REPO/.agent-os" ]; then');
  lines.push(`  create_symlink \"${workspaceRepoName}/.agent-os\" \"$WORKSPACE_ROOT/.agent-os\"`);
  lines.push("fi");
  lines.push("");
  lines.push('echo ""');
  lines.push('echo "Done! Workspace configuration installed."');

  return lines.join("\n");
}

/**
 * Parse workspace.yaml to get workspace definition
 */
function createWorkspaceDefinition(name: string, repos: WorkspaceRepoInfo[]): WorkspaceDefinition {
  return {
    name,
    repos: repos.map((repo) => ({
      path: repo.name,
      description: undefined,
      excludeFromDocs: repo.name.includes("-workspace"),
    })),
  };
}

/**
 * Execute repo init command
 */
export async function repoInitCommand(options: RepoInitOptions): Promise<RepoInitResult> {
  const {
    workspacePath,
    name = "workspace",
    repoPath: customRepoPath,
    createSymlinks = false,
    force = false,
  } = options;

  const resolvedWorkspacePath = path.resolve(workspacePath);
  const workspaceRepoName = `${name}-workspace`;
  const repoPath = customRepoPath
    ? path.resolve(customRepoPath)
    : path.join(resolvedWorkspacePath, workspaceRepoName);

  const result: RepoInitResult = {
    success: false,
    repoPath,
    claudeMdPath: path.join(repoPath, "CLAUDE.md"),
    workspaceYamlPath: path.join(repoPath, "workspace.yaml"),
    symlinksCreated: [],
    reposDiscovered: 0,
    agentsMdFound: 0,
  };

  try {
    // Check if repo already exists
    try {
      await fs.access(repoPath);
      if (!force) {
        return {
          ...result,
          error: `Workspace repo already exists at ${repoPath}. Use --force to overwrite.`,
        };
      }
    } catch {
      // Doesn't exist, good
    }

    // Discover workspace repos
    const workspaceInfo: WorkspaceInfo = await discoverWorkspace(resolvedWorkspacePath);
    result.reposDiscovered = workspaceInfo.repos.length;

    if (!workspaceInfo.isWorkspace || workspaceInfo.repos.length === 0) {
      return {
        ...result,
        error: `No repositories found in workspace at ${resolvedWorkspacePath}`,
      };
    }

    // Parse AGENTS.md from all repos
    const repoPaths = workspaceInfo.repos.map((r) => r.path);
    const parsedAgentsMd: ParsedAgentsMd[] = await parseAllAgentsMd(repoPaths);
    result.agentsMdFound = parsedAgentsMd.filter((p) => p.found).length;

    // Create workspace repo directory
    await fs.mkdir(repoPath, { recursive: true });

    // Create scripts directory
    const scriptsDir = path.join(repoPath, "scripts");
    await fs.mkdir(scriptsDir, { recursive: true });

    // Create .agent-os directory structure
    const agentOsDir = path.join(repoPath, ".agent-os");
    const productDir = path.join(agentOsDir, "product");
    const specsDir = path.join(agentOsDir, "specs");
    await fs.mkdir(productDir, { recursive: true });
    await fs.mkdir(specsDir, { recursive: true });

    // Generate workspace.yaml
    const workspaceYaml = generateWorkspaceYaml(name, undefined, workspaceInfo.repos);
    await fs.writeFile(result.workspaceYamlPath, workspaceYaml, "utf-8");

    // Generate CLAUDE.md
    const workspaceDefinition = createWorkspaceDefinition(name, workspaceInfo.repos);
    const claudeResult = generateClaudeMd({
      workspace: workspaceDefinition,
      parsedAgentsMd,
      includeCommands: true,
      includeTechStack: true,
    });
    await fs.writeFile(result.claudeMdPath, claudeResult.content, "utf-8");

    // Generate install.sh
    const installScript = generateInstallScript(workspaceRepoName);
    const installScriptPath = path.join(scriptsDir, "install.sh");
    await fs.writeFile(installScriptPath, installScript, "utf-8");
    await fs.chmod(installScriptPath, 0o755);

    // Create .gitignore
    const gitignore = [
      "# DevAC local state",
      ".devac/",
      "",
      "# Editor files",
      ".idea/",
      ".vscode/",
      "*.swp",
      "*.swo",
      "",
      "# OS files",
      ".DS_Store",
      "Thumbs.db",
    ].join("\n");
    await fs.writeFile(path.join(repoPath, ".gitignore"), gitignore, "utf-8");

    // Initialize git repo
    try {
      execSync("git init", { cwd: repoPath, stdio: "pipe" });
      execSync("git add .", { cwd: repoPath, stdio: "pipe" });
      execSync('git commit -m "Initialize workspace repo"', {
        cwd: repoPath,
        stdio: "pipe",
      });
    } catch (gitError) {
      // Git init failed, but repo is still usable
      console.warn("Warning: Failed to initialize git repo:", gitError);
    }

    // Create symlinks if requested
    if (createSymlinks) {
      const claudeSymlink = path.join(resolvedWorkspacePath, "CLAUDE.md");
      const agentOsSymlink = path.join(resolvedWorkspacePath, ".agent-os");

      // Remove existing symlinks or backup existing files
      const symlinkPairs: [string, string][] = [
        [result.claudeMdPath, claudeSymlink],
        [agentOsDir, agentOsSymlink],
      ];

      for (const [source, target] of symlinkPairs) {
        try {
          const stats = await fs.lstat(target);
          if (stats.isSymbolicLink()) {
            await fs.unlink(target);
          } else {
            await fs.rename(target, `${target}.bak`);
          }
        } catch {
          // Doesn't exist, good
        }

        // Create relative symlink
        const relativeSource = path.relative(path.dirname(target), source);
        await fs.symlink(relativeSource, target);
        result.symlinksCreated.push(target);
      }
    }

    result.success = true;
    result.formatted = formatResult(result, createSymlinks);

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
function formatResult(result: RepoInitResult, showSymlinks: boolean): string {
  const lines: string[] = [];

  lines.push("✓ Workspace repo initialized");
  lines.push("");
  lines.push("Created:");
  lines.push(`  📁 ${result.repoPath}`);
  lines.push("  📄 CLAUDE.md");
  lines.push("  📄 workspace.yaml");
  lines.push("  📄 scripts/install.sh");
  lines.push("  📁 .agent-os/");
  lines.push("");
  lines.push("Discovery:");
  lines.push(`  Repositories: ${result.reposDiscovered}`);
  lines.push(`  AGENTS.md found: ${result.agentsMdFound}`);

  if (showSymlinks && result.symlinksCreated.length > 0) {
    lines.push("");
    lines.push("Symlinks created:");
    for (const symlink of result.symlinksCreated) {
      lines.push(`  🔗 ${symlink}`);
    }
  }

  lines.push("");
  lines.push("Next steps:");
  if (!showSymlinks) {
    lines.push("  1. Run: devac workspace repo install");
    lines.push("     (Creates symlinks from workspace repo to workspace root)");
  }
  lines.push("  2. Review and customize workspace.yaml");
  lines.push("  3. Run: devac workspace repo sync");
  lines.push("     (Updates CLAUDE.md from repo AGENTS.md files)");
  lines.push("  4. Commit and push the workspace repo");

  return lines.join("\n");
}
