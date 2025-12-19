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
  CrossRepoNeedEvent,
  CrossRepoDetectorOptions,
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

// Cross-repo detection
export {
  CrossRepoDetector,
  createCrossRepoDetector,
  formatCrossRepoNeed,
} from "./cross-repo-detector.js";

export type { CrossRepoAnalysisResult } from "./cross-repo-detector.js";

// CI Status
export {
  isGhCliAvailable,
  getCIStatusForContext,
  formatCIStatus,
} from "./ci-status.js";

export type {
  CheckStatus,
  CIStatus,
  CIStatusResult,
  CIStatusOptions,
} from "./ci-status.js";

// Review
export {
  gatherDiffs,
  buildReviewPrompt,
  parseReviewResponse,
  formatReviewAsMarkdown,
  createSubIssues,
} from "./review.js";

export type {
  ReviewFinding,
  SubIssueSuggestion,
  ReviewResult,
  ReviewOptions,
  RepoDiff,
  GatheredDiffs,
} from "./review.js";
