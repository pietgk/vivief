/**
 * Types for devac-worktree CLI
 */

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: Array<{ name: string }>;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  issueNumber: number;
  issueTitle: string;
  createdAt: string;
  repoRoot: string;
}

export interface WorktreeState {
  worktrees: WorktreeInfo[];
}

export interface StartResult {
  success: boolean;
  worktreePath?: string;
  branch?: string;
  issueNumber?: number;
  error?: string;
}

export interface ListResult {
  success: boolean;
  worktrees: WorktreeInfo[];
  error?: string;
}

export interface StatusResult {
  success: boolean;
  worktrees: Array<WorktreeInfo & { issueState: string; prUrl?: string }>;
  error?: string;
}

export interface CleanResult {
  success: boolean;
  removed?: string;
  error?: string;
}

export type PackageManager = "pnpm" | "npm" | "yarn";
