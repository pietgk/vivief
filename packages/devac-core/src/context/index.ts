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
  // v3 issueId format support
  parseIssueId,
  parseWorktreeNameV2,
  extractIssueNumberAny,
} from "./discovery.js";

export type {
  ParsedIssueId,
  ParsedWorktreeNameV2,
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

// CI Hub Sync
export { syncCIStatusToHub } from "./ci-hub-sync.js";

export type { CISyncOptions, CISyncResult } from "./ci-hub-sync.js";

// Issues
export { getIssuesForContext, formatIssues } from "./issues.js";

export type {
  GitHubIssue,
  IssueLabel,
  RepoIssues,
  IssuesResult,
  IssuesOptions,
} from "./issues.js";

// Issues Hub Sync
export { syncIssuesToHub } from "./issues-hub-sync.js";

export type { IssueSyncOptions, IssueSyncResult } from "./issues-hub-sync.js";

// PR Reviews
export { getReviewsForContext, formatReviews } from "./reviews.js";

export type {
  Review,
  ReviewComment,
  RepoReviews,
  ReviewsResult,
  ReviewsOptions,
} from "./reviews.js";

// Reviews Hub Sync
export { syncReviewsToHub } from "./reviews-hub-sync.js";

export type { ReviewSyncOptions, ReviewSyncResult } from "./reviews-hub-sync.js";
