/**
 * Git Simulator
 *
 * Utilities for simulating Git state in tests.
 * Used by E2E tests to verify hook behavior with staged/unstaged files.
 */

import { spawn } from "node:child_process";

/**
 * Result of a git command execution.
 */
export interface GitCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Changed files categorized by state.
 */
export interface ChangedFiles {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

/**
 * Execute a git command and return the result.
 */
export async function execGit(
  args: string[],
  cwd: string,
  timeout = 10000
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      timeout,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code,
      });
    });

    proc.on("error", (error) => {
      resolve({
        success: false,
        stdout,
        stderr: error.message,
        code: null,
      });
    });
  });
}

/**
 * Git simulator for test environments.
 * Provides utilities to simulate Git state for hook testing.
 */
export class GitSimulator {
  constructor(private readonly workDir: string) {}

  /**
   * Initialize a new Git repository.
   */
  async init(): Promise<boolean> {
    const result = await execGit(["init"], this.workDir);
    if (result.success) {
      // Configure git user for commits
      await execGit(["config", "user.email", "test@test.com"], this.workDir);
      await execGit(["config", "user.name", "Test User"], this.workDir);
    }
    return result.success;
  }

  /**
   * Stage a file for commit.
   */
  async stageFile(relativePath: string): Promise<boolean> {
    const result = await execGit(["add", relativePath], this.workDir);
    return result.success;
  }

  /**
   * Stage all files for commit.
   */
  async stageAll(): Promise<boolean> {
    const result = await execGit(["add", "-A"], this.workDir);
    return result.success;
  }

  /**
   * Unstage a file.
   */
  async unstageFile(relativePath: string): Promise<boolean> {
    const result = await execGit(["restore", "--staged", relativePath], this.workDir);
    return result.success;
  }

  /**
   * Get list of staged files.
   */
  async getStagedFiles(): Promise<string[]> {
    const result = await execGit(["diff", "--cached", "--name-only"], this.workDir);
    if (!result.success) {
      return [];
    }
    return result.stdout
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  }

  /**
   * Get list of unstaged modified files.
   */
  async getUnstagedFiles(): Promise<string[]> {
    const result = await execGit(["diff", "--name-only"], this.workDir);
    if (!result.success) {
      return [];
    }
    return result.stdout
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  }

  /**
   * Get list of untracked files.
   */
  async getUntrackedFiles(): Promise<string[]> {
    const result = await execGit(["ls-files", "--others", "--exclude-standard"], this.workDir);
    if (!result.success) {
      return [];
    }
    return result.stdout
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  }

  /**
   * Get all changed files categorized by state.
   */
  async getChangedFiles(): Promise<ChangedFiles> {
    const [staged, unstaged, untracked] = await Promise.all([
      this.getStagedFiles(),
      this.getUnstagedFiles(),
      this.getUntrackedFiles(),
    ]);

    return { staged, unstaged, untracked };
  }

  /**
   * Create an initial commit (required before staging shows proper diff).
   */
  async createInitialCommit(message = "Initial commit"): Promise<boolean> {
    const result = await execGit(["commit", "--allow-empty", "-m", message], this.workDir);
    return result.success;
  }

  /**
   * Create a commit with all staged changes.
   */
  async commit(message: string): Promise<boolean> {
    const result = await execGit(["commit", "-m", message], this.workDir);
    return result.success;
  }

  /**
   * Check if the directory is a Git repository.
   */
  async isGitRepo(): Promise<boolean> {
    const result = await execGit(["rev-parse", "--git-dir"], this.workDir);
    return result.success;
  }

  /**
   * Get the repository root.
   */
  async getRepoRoot(): Promise<string | null> {
    const result = await execGit(["rev-parse", "--show-toplevel"], this.workDir);
    return result.success ? result.stdout.trim() : null;
  }
}

/**
 * Create a GitSimulator instance.
 */
export function createGitSimulator(workDir: string): GitSimulator {
  return new GitSimulator(workDir);
}
