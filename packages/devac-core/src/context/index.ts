/**
 * Context Discovery Module
 *
 * Discovers sibling repositories and issue worktrees
 * for cross-repository context awareness.
 */

// Types
export type {
  RepoInfo,
  WorktreeInfo,
  RepoContext,
  DiscoveryOptions,
  ParsedWorktreeName,
} from "./types.js";

// Discovery
export {
  parseWorktreeName,
  extractIssueNumber,
  extractRepoName,
  isGitRepo,
  isGitWorktree,
  hasDevacSeeds,
  getGitBranch,
  discoverContext,
  formatContext,
} from "./discovery.js";
