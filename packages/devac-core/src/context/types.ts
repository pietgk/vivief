/**
 * Context Discovery Types
 *
 * Types for discovering and managing cross-repository context
 * in a parent directory workflow.
 */

/**
 * Information about a repository in the context
 */
export interface RepoInfo {
  /** Absolute path to the repository */
  path: string;
  /** Directory name (e.g., "vivief" or "vivief-123-auth") */
  name: string;
  /** Whether the repo has DevAC seeds (.devac/seed/) */
  hasSeeds: boolean;
  /** Whether this is a git worktree (vs main repo) */
  isWorktree: boolean;
  /** Issue number if this is an issue worktree */
  issueNumber?: number;
  /** Slug part of worktree name (e.g., "auth" from "vivief-123-auth") */
  slug?: string;
}

/**
 * Extended information for issue worktrees
 */
export interface WorktreeInfo extends RepoInfo {
  /** Issue number (always present for worktrees) */
  issueNumber: number;
  /** Slug part of worktree name */
  slug: string;
  /** Path to the main repository this worktree is from */
  mainRepoPath: string;
  /** Name of the main repository */
  mainRepoName: string;
  /** Git branch name */
  branch: string;
  /** PR number if one exists */
  prNumber?: number;
  /** PR URL if one exists */
  prUrl?: string;
}

/**
 * Context discovered from the current working directory
 */
export interface RepoContext {
  /** Current working directory */
  currentDir: string;
  /** Parent directory containing all repos */
  parentDir: string;
  /** All repositories found in the context (siblings + current) */
  repos: RepoInfo[];

  /** Issue number if currently in an issue worktree */
  issueNumber?: number;
  /** All worktrees for the current issue (across all repos) */
  worktrees?: WorktreeInfo[];
  /** Main repos that have worktrees for this issue */
  mainRepos?: RepoInfo[];
}

/**
 * Options for context discovery
 */
export interface DiscoveryOptions {
  /** Maximum depth to search for repos (default: 1) */
  depth?: number;
  /** Whether to check for seeds (default: true) */
  checkSeeds?: boolean;
  /** Whether to resolve PR info (default: false, requires gh CLI) */
  resolvePRs?: boolean;
}

/**
 * Result of parsing a worktree directory name
 */
export interface ParsedWorktreeName {
  /** Original repo name (e.g., "vivief") */
  repoName: string;
  /** Issue number */
  issueNumber: number;
  /** Slug/description (e.g., "auth") */
  slug: string;
}
