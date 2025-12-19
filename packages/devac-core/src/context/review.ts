/**
 * LLM Review Module
 *
 * Gathers diffs from worktrees/repos and generates LLM review prompts.
 * Outputs actionable markdown with findings and suggested sub-issues.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { RepoContext, RepoInfo, WorktreeInfo } from "./types.js";

const execAsync = promisify(exec);

/**
 * A single finding from the LLM review
 */
export interface ReviewFinding {
  /** Severity of the finding */
  severity: "critical" | "warning" | "suggestion" | "note";
  /** Category of the finding */
  category: "security" | "performance" | "testing" | "architecture" | "code-quality" | "other";
  /** File path where the issue was found */
  filePath?: string;
  /** Line number if applicable */
  line?: number;
  /** Description of the finding */
  description: string;
  /** Suggested fix */
  suggestion?: string;
  /** Repository name */
  repo: string;
}

/**
 * A suggested sub-issue to create
 */
export interface SubIssueSuggestion {
  /** Suggested issue title */
  title: string;
  /** Suggested issue body */
  body: string;
  /** Labels to apply */
  labels?: string[];
  /** Repository to create the issue in */
  repo: string;
  /** Related findings */
  relatedFindings: number[];
}

/**
 * Result of an LLM review
 */
export interface ReviewResult {
  /** Whether the review was successful */
  success: boolean;
  /** Summary of the review */
  summary: string;
  /** Individual findings */
  findings: ReviewFinding[];
  /** Suggested sub-issues for follow-up */
  suggestedSubIssues: SubIssueSuggestion[];
  /** Statistics about the review */
  stats: {
    totalFiles: number;
    totalChanges: number;
    reposReviewed: number;
  };
  /** Error message if the review failed */
  error?: string;
}

/**
 * Options for running a review
 */
export interface ReviewOptions {
  /** Focus area for the review */
  focus?: "security" | "performance" | "tests" | "all";
  /** Base branch to diff against (default: main) */
  baseBranch?: string;
  /** Maximum diff size to process (default: 50000 characters) */
  maxDiffSize?: number;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Diff information for a repository
 */
export interface RepoDiff {
  /** Repository name */
  repo: string;
  /** Repository path */
  path: string;
  /** Git diff content */
  diff: string;
  /** Files changed */
  filesChanged: string[];
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
}

/**
 * Gathered diffs from all repos in context
 */
export interface GatheredDiffs {
  /** Diffs by repository */
  diffs: RepoDiff[];
  /** Total files changed across all repos */
  totalFiles: number;
  /** Total changes (insertions + deletions) */
  totalChanges: number;
}

/**
 * Gather diffs from all repos/worktrees in the context
 */
export async function gatherDiffs(
  context: RepoContext,
  options: ReviewOptions = {}
): Promise<GatheredDiffs> {
  const { baseBranch = "main", timeout = 30000 } = options;

  // Determine which repos to gather diffs from
  const repos: Array<RepoInfo | WorktreeInfo> = context.worktrees ?? context.repos;

  const diffs: RepoDiff[] = [];
  let totalFiles = 0;
  let totalChanges = 0;

  for (const repo of repos) {
    try {
      // Get the diff against the base branch
      const { stdout: diffOutput } = await execAsync(`git diff ${baseBranch}...HEAD`, {
        cwd: repo.path,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      });

      if (!diffOutput.trim()) {
        continue; // No changes in this repo
      }

      // Get diff stats
      const { stdout: statOutput } = await execAsync(`git diff ${baseBranch}...HEAD --stat`, {
        cwd: repo.path,
        timeout,
      });

      // Parse diff stats
      const stats = parseDiffStats(statOutput);

      diffs.push({
        repo: repo.name,
        path: repo.path,
        diff: diffOutput,
        filesChanged: stats.files,
        insertions: stats.insertions,
        deletions: stats.deletions,
      });

      totalFiles += stats.files.length;
      totalChanges += stats.insertions + stats.deletions;
    } catch (error) {
      // Skip repos that fail (e.g., no commits yet, base branch doesn't exist)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("unknown revision")) {
        console.warn(`Warning: Could not get diff for ${repo.name}: ${errorMessage}`);
      }
    }
  }

  return { diffs, totalFiles, totalChanges };
}

/**
 * Parse git diff --stat output
 */
function parseDiffStats(statOutput: string): {
  files: string[];
  insertions: number;
  deletions: number;
} {
  const lines = statOutput.trim().split("\n");
  const files: string[] = [];
  let insertions = 0;
  let deletions = 0;

  for (const line of lines) {
    // File lines look like: " src/file.ts | 10 ++++----"
    const fileMatch = line.match(/^\s*(.+?)\s*\|\s*\d+/);
    if (fileMatch?.[1]) {
      files.push(fileMatch[1].trim());
    }

    // Summary line looks like: " 3 files changed, 10 insertions(+), 5 deletions(-)"
    const summaryMatch = line.match(/(\d+)\s+insertion.*?(\d+)\s+deletion/);
    if (summaryMatch?.[1] && summaryMatch[2]) {
      insertions = Number.parseInt(summaryMatch[1], 10);
      deletions = Number.parseInt(summaryMatch[2], 10);
    }

    // Also handle single insertion/deletion
    const insertMatch = line.match(/(\d+)\s+insertion/);
    const deleteMatch = line.match(/(\d+)\s+deletion/);
    if (insertMatch?.[1] && !summaryMatch) {
      insertions = Number.parseInt(insertMatch[1], 10);
    }
    if (deleteMatch?.[1] && !summaryMatch) {
      deletions = Number.parseInt(deleteMatch[1], 10);
    }
  }

  return { files, insertions, deletions };
}

/**
 * Build a review prompt for the LLM
 */
export function buildReviewPrompt(diffs: GatheredDiffs, options: ReviewOptions = {}): string {
  const { focus = "all", maxDiffSize = 50000 } = options;

  const focusInstructions = getFocusInstructions(focus);

  let diffContent = "";
  let truncated = false;

  for (const diff of diffs.diffs) {
    const header = `\n--- Repository: ${diff.repo} ---\n`;
    const filesInfo = `Files changed: ${diff.filesChanged.join(", ")}\n`;

    if (diffContent.length + header.length + filesInfo.length + diff.diff.length > maxDiffSize) {
      // Truncate the diff
      const remaining = maxDiffSize - diffContent.length - header.length - filesInfo.length - 100;
      if (remaining > 1000) {
        diffContent += `${header}${filesInfo}${diff.diff.substring(0, remaining)}\n[...truncated...]`;
      }
      truncated = true;
      break;
    }

    diffContent += header + filesInfo + diff.diff;
  }

  const prompt = `You are reviewing code changes across ${diffs.diffs.length} repositories with ${diffs.totalFiles} files changed.

${focusInstructions}

## Review Guidelines

1. Identify any issues with the changes, categorized as:
   - **Critical**: Security vulnerabilities, data loss risks, breaking changes
   - **Warning**: Potential bugs, performance issues, missing error handling
   - **Suggestion**: Code quality improvements, better patterns
   - **Note**: Minor observations, documentation suggestions

2. For each finding, provide:
   - The severity level
   - The category (security, performance, testing, architecture, code-quality, other)
   - The file path and line number if applicable
   - A clear description of the issue
   - A suggested fix if applicable

3. At the end, suggest any follow-up sub-issues that should be created for larger improvements.

${truncated ? "Note: The diff was truncated due to size limits. Focus on what's visible.\n" : ""}

## Code Changes

${diffContent}

## Response Format

Please respond in the following structured format:

### Summary
[Brief 2-3 sentence summary of the overall changes]

### Findings
For each finding:
- **[SEVERITY]** [CATEGORY]: [description] (file: path, line: N)
  - Suggestion: [how to fix]

### Suggested Sub-Issues
For follow-up work that warrants separate issues:
1. **[Title]**: [Brief description of what needs to be done]
`;

  return prompt;
}

/**
 * Get focus-specific instructions
 */
function getFocusInstructions(focus: ReviewOptions["focus"]): string {
  switch (focus) {
    case "security":
      return `## Focus Area: Security

Pay special attention to:
- Authentication and authorization issues
- Input validation and sanitization
- SQL injection, XSS, and other injection attacks
- Sensitive data exposure
- Insecure dependencies
- Cryptographic issues`;

    case "performance":
      return `## Focus Area: Performance

Pay special attention to:
- Inefficient algorithms or data structures
- N+1 queries and database performance
- Memory leaks and resource management
- Unnecessary computations or re-renders
- Missing caching opportunities
- Large bundle sizes`;

    case "tests":
      return `## Focus Area: Testing

Pay special attention to:
- Missing test coverage for new code
- Edge cases not covered
- Flaky or unreliable tests
- Test quality and maintainability
- Integration vs unit test balance
- Mocking and test isolation`;

    default:
      return `## Focus Area: Comprehensive Review

Review all aspects including:
- Security vulnerabilities
- Performance issues
- Test coverage
- Code architecture
- Code quality and maintainability`;
  }
}

/**
 * Parse LLM response into structured review result
 *
 * This is a basic parser that extracts findings from a structured LLM response.
 * In a real implementation, you might use a more sophisticated parsing approach
 * or ask the LLM to respond in JSON format.
 */
export function parseReviewResponse(response: string, diffs: GatheredDiffs): ReviewResult {
  const findings: ReviewFinding[] = [];
  const suggestedSubIssues: SubIssueSuggestion[] = [];

  // Extract summary
  const summaryMatch = response.match(/### Summary\s*([\s\S]*?)(?=###|$)/);
  const summary = summaryMatch?.[1]?.trim() ?? "No summary provided.";

  // Extract findings
  const findingsMatch = response.match(/### Findings\s*([\s\S]*?)(?=### Suggested|$)/);
  if (findingsMatch?.[1]) {
    const findingsText = findingsMatch[1];
    const findingLines = findingsText.split(/\n-\s*\*\*/);

    for (const line of findingLines) {
      if (!line.trim()) continue;

      const finding = parseFinding(line, diffs.diffs[0]?.repo ?? "unknown");
      if (finding) {
        findings.push(finding);
      }
    }
  }

  // Extract sub-issues
  const subIssuesMatch = response.match(/### Suggested Sub-Issues\s*([\s\S]*?)$/);
  if (subIssuesMatch?.[1]) {
    const subIssuesText = subIssuesMatch[1];
    const issueLines = subIssuesText.split(/\n\d+\.\s*\*\*/);

    for (const line of issueLines) {
      if (!line.trim()) continue;

      const subIssue = parseSubIssue(line, diffs.diffs[0]?.repo ?? "unknown");
      if (subIssue) {
        suggestedSubIssues.push(subIssue);
      }
    }
  }

  return {
    success: true,
    summary,
    findings,
    suggestedSubIssues,
    stats: {
      totalFiles: diffs.totalFiles,
      totalChanges: diffs.totalChanges,
      reposReviewed: diffs.diffs.length,
    },
  };
}

/**
 * Parse a single finding from text
 */
function parseFinding(text: string, defaultRepo: string): ReviewFinding | null {
  // Try to extract severity
  const severityMatch = text.match(/\[?(CRITICAL|WARNING|SUGGESTION|NOTE)\]?/i);
  const severity = severityMatch?.[1]
    ? (severityMatch[1].toLowerCase() as ReviewFinding["severity"])
    : "note";

  // Try to extract category
  const categoryMatch = text.match(
    /\[?(security|performance|testing|architecture|code-quality|other)\]?/i
  );
  const category = categoryMatch?.[1]
    ? (categoryMatch[1].toLowerCase() as ReviewFinding["category"])
    : "other";

  // Try to extract file and line
  const fileMatch = text.match(/file:\s*([^\s,)]+)/i);
  const lineMatch = text.match(/line:\s*(\d+)/i);

  // Get the description (everything after the severity/category markers)
  const description = text
    .replace(/\*?\[?(CRITICAL|WARNING|SUGGESTION|NOTE)\]?\*?/gi, "")
    .replace(/\[?(security|performance|testing|architecture|code-quality|other)\]?:/gi, "")
    .replace(/\(file:.*?\)/gi, "")
    .trim();

  if (!description) {
    return null;
  }

  return {
    severity,
    category,
    filePath: fileMatch?.[1],
    line: lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : undefined,
    description,
    repo: defaultRepo,
  };
}

/**
 * Parse a sub-issue suggestion from text
 */
function parseSubIssue(text: string, defaultRepo: string): SubIssueSuggestion | null {
  // Try to extract title (text before colon or first sentence)
  const titleMatch = text.match(/^([^:\n]+)/);
  const title = titleMatch?.[1] ? titleMatch[1].replace(/\*\*/g, "").trim() : "Follow-up task";

  // Get the body (everything after the title)
  const body = text.replace(/^[^:\n]+:?\s*/, "").trim();

  if (!body) {
    return null;
  }

  return {
    title,
    body,
    repo: defaultRepo,
    relatedFindings: [],
  };
}

/**
 * Format review result as markdown
 */
export function formatReviewAsMarkdown(result: ReviewResult): string {
  if (!result.success) {
    return `# Review Failed\n\n${result.error}`;
  }

  const lines: string[] = [];

  // Header
  lines.push("# Code Review Report");
  lines.push("");
  lines.push(
    `*Reviewed ${result.stats.reposReviewed} repositories, ${result.stats.totalFiles} files, ${result.stats.totalChanges} changes*`
  );
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(result.summary);
  lines.push("");

  // Findings by severity
  if (result.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");

    const critical = result.findings.filter((f) => f.severity === "critical");
    const warnings = result.findings.filter((f) => f.severity === "warning");
    const suggestions = result.findings.filter((f) => f.severity === "suggestion");
    const notes = result.findings.filter((f) => f.severity === "note");

    if (critical.length > 0) {
      lines.push("### 🔴 Critical");
      lines.push("");
      for (const finding of critical) {
        lines.push(formatFinding(finding));
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("### 🟡 Warnings");
      lines.push("");
      for (const finding of warnings) {
        lines.push(formatFinding(finding));
      }
      lines.push("");
    }

    if (suggestions.length > 0) {
      lines.push("### 💡 Suggestions");
      lines.push("");
      for (const finding of suggestions) {
        lines.push(formatFinding(finding));
      }
      lines.push("");
    }

    if (notes.length > 0) {
      lines.push("### 📝 Notes");
      lines.push("");
      for (const finding of notes) {
        lines.push(formatFinding(finding));
      }
      lines.push("");
    }
  } else {
    lines.push("## Findings");
    lines.push("");
    lines.push("No significant issues found. ✅");
    lines.push("");
  }

  // Suggested sub-issues
  if (result.suggestedSubIssues.length > 0) {
    lines.push("## Suggested Follow-up Issues");
    lines.push("");
    for (let i = 0; i < result.suggestedSubIssues.length; i++) {
      const issue = result.suggestedSubIssues[i];
      if (issue) {
        lines.push(`${i + 1}. **${issue.title}** (${issue.repo})`);
        lines.push(`   ${issue.body}`);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format a single finding
 */
function formatFinding(finding: ReviewFinding): string {
  let result = `- **[${finding.category}]** ${finding.description}`;

  if (finding.filePath) {
    result += `\n  - File: \`${finding.filePath}\``;
    if (finding.line) {
      result += `:${finding.line}`;
    }
  }

  if (finding.suggestion) {
    result += `\n  - Fix: ${finding.suggestion}`;
  }

  return result;
}

/**
 * Create sub-issues on GitHub using gh CLI
 */
export async function createSubIssues(
  suggestions: SubIssueSuggestion[],
  parentIssueNumber: number,
  options: { timeout?: number } = {}
): Promise<Array<{ success: boolean; issueNumber?: number; error?: string }>> {
  const { timeout = 10000 } = options;
  const results: Array<{ success: boolean; issueNumber?: number; error?: string }> = [];

  for (const suggestion of suggestions) {
    try {
      // Create issue with reference to parent
      const body = `${suggestion.body}\n\n---\n*Related to #${parentIssueNumber}*`;

      const { stdout } = await execAsync(
        `gh issue create --title "${suggestion.title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`,
        { cwd: suggestion.repo, timeout }
      );

      // Parse issue number from output (usually "https://github.com/owner/repo/issues/123")
      const issueMatch = stdout.match(/issues\/(\d+)/);
      const issueNumber = issueMatch?.[1] ? Number.parseInt(issueMatch[1], 10) : undefined;

      results.push({ success: true, issueNumber });
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
