/**
 * Hub Sync Module Tests
 *
 * Tests for syncing CI status, issues, and reviews to the Hub's unified_diagnostics table.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncCIStatusToHub } from "../../src/context/ci-hub-sync.js";
import type { CIStatusResult } from "../../src/context/ci-status.js";
import { syncIssuesToHub } from "../../src/context/issues-hub-sync.js";
import type { IssuesResult } from "../../src/context/issues.js";
import { syncReviewsToHub } from "../../src/context/reviews-hub-sync.js";
import type { ReviewsResult } from "../../src/context/reviews.js";
import type { HubLike } from "../../src/hub/hub-client.js";
import type { UnifiedDiagnostics } from "../../src/hub/hub-storage.js";

// ─────────────────────────────────────────────────────────────
// Mock Hub
// ─────────────────────────────────────────────────────────────

function createMockHub(): HubLike & {
  pushedDiagnostics: UnifiedDiagnostics[];
  clearedSources: string[];
} {
  const pushedDiagnostics: UnifiedDiagnostics[] = [];
  const clearedSources: string[] = [];

  return {
    pushedDiagnostics,
    clearedSources,
    pushDiagnostics: vi.fn(async (diagnostics: UnifiedDiagnostics[]) => {
      pushedDiagnostics.push(...diagnostics);
    }),
    clearDiagnostics: vi.fn(async (_repoId?: string, source?: string) => {
      if (source) {
        clearedSources.push(source);
      }
    }),
    pushValidationErrors: vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────
// CI Hub Sync Tests
// ─────────────────────────────────────────────────────────────

describe("syncCIStatusToHub", () => {
  let mockHub: ReturnType<typeof createMockHub>;

  beforeEach(() => {
    mockHub = createMockHub();
  });

  it("returns error when CI result is not successful", async () => {
    const ciResult: CIStatusResult = {
      success: false,
      statuses: [],
      summary: {
        total: 0,
        passing: 0,
        failing: 0,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
      error: "GitHub CLI not installed",
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(0);
    expect(result.errors).toContain("GitHub CLI not installed");
    expect(mockHub.pushDiagnostics).not.toHaveBeenCalled();
  });

  it("skips repos with no-pr status", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api",
          status: "no-pr",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 0,
        pending: 0,
        noPr: 1,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(0);
    expect(result.reposProcessed).toBe(1);
    expect(mockHub.pushedDiagnostics).toHaveLength(0);
  });

  it("skips repos with unknown status", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api",
          status: "unknown",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 0,
        pending: 0,
        noPr: 0,
        unknown: 1,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(0);
    expect(result.reposProcessed).toBe(1);
  });

  it("creates diagnostics for failing CI with checks", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          prUrl: "https://github.com/org/api/pull/45",
          prTitle: "Add feature",
          status: "failing",
          checks: [
            { name: "build", status: "completed", conclusion: "success" },
            {
              name: "test",
              status: "completed",
              conclusion: "failure",
              detailsUrl: "https://github.com/org/api/actions/runs/123",
            },
            { name: "lint", status: "completed", conclusion: "cancelled" },
          ],
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(2); // failure + cancelled (not success)
    expect(result.reposProcessed).toBe(1);
    expect(mockHub.clearedSources).toContain("ci-check");

    // Check the failure diagnostic
    const failureDiag = mockHub.pushedDiagnostics.find((d) => d.title.includes("test"));
    expect(failureDiag).toBeDefined();
    expect(failureDiag?.severity).toBe("error");
    expect(failureDiag?.source).toBe("ci-check");
    expect(failureDiag?.github_pr_number).toBe(45);

    // Check the cancelled diagnostic
    const cancelledDiag = mockHub.pushedDiagnostics.find((d) => d.title.includes("lint"));
    expect(cancelledDiag).toBeDefined();
    expect(cancelledDiag?.severity).toBe("warning");
  });

  it("creates overall failing diagnostic when no checks available", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          prUrl: "https://github.com/org/api/pull/45",
          prTitle: "Add feature",
          status: "failing",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(1);
    const diag = mockHub.pushedDiagnostics[0];
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.title).toContain("CI failing");
    expect(diag?.description).toContain("Add feature");
  });

  it("creates pending diagnostic for pending CI", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          prUrl: "https://github.com/org/api/pull/45",
          prTitle: "Add feature",
          status: "pending",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 0,
        pending: 1,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(1);
    const diag = mockHub.pushedDiagnostics[0];
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("note");
    expect(diag?.title).toContain("CI pending");
    expect(diag?.actionable).toBe(false);
  });

  it("creates diagnostics for in_progress checks", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "pending",
          checks: [
            { name: "build", status: "in_progress" },
            { name: "test", status: "queued" },
          ],
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 0,
        pending: 1,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(2);
    expect(mockHub.pushedDiagnostics.every((d) => d.severity === "note")).toBe(true);
  });

  it("filters to failing only when option is set", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "failing",
          checks: [
            { name: "build", status: "completed", conclusion: "failure" },
            { name: "lint", status: "completed", conclusion: "cancelled" },
          ],
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult, {
      failingOnly: true,
    });

    expect(result.pushed).toBe(1); // Only failure, not cancelled (warning)
    expect(mockHub.pushedDiagnostics[0]?.severity).toBe("error");
  });

  it("does not clear existing when clearExisting is false", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "failing",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    await syncCIStatusToHub(mockHub, ciResult, { clearExisting: false });

    expect(mockHub.clearDiagnostics).not.toHaveBeenCalled();
  });

  it("handles push error gracefully", async () => {
    mockHub.pushDiagnostics = vi.fn().mockRejectedValue(new Error("Database error"));

    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "failing",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to push CI diagnostics");
  });

  it("handles clear error gracefully", async () => {
    mockHub.clearDiagnostics = vi.fn().mockRejectedValue(new Error("Clear failed"));

    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "failing",
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to clear existing CI diagnostics");
    // Should still try to push
    expect(mockHub.pushDiagnostics).toHaveBeenCalled();
  });

  it("handles timed_out conclusion as error", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "failing",
          checks: [{ name: "long-test", status: "completed", conclusion: "timed_out" }],
        },
      ],
      summary: {
        total: 1,
        passing: 0,
        failing: 1,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.severity).toBe("error");
  });

  it("skips neutral and skipped checks", async () => {
    const ciResult: CIStatusResult = {
      success: true,
      statuses: [
        {
          repo: "api",
          path: "/ws/api-123",
          prNumber: 45,
          status: "passing",
          checks: [
            { name: "optional", status: "completed", conclusion: "neutral" },
            { name: "skip-ci", status: "completed", conclusion: "skipped" },
            { name: "build", status: "completed", conclusion: "success" },
          ],
        },
      ],
      summary: {
        total: 1,
        passing: 1,
        failing: 0,
        pending: 0,
        noPr: 0,
        unknown: 0,
      },
    };

    const result = await syncCIStatusToHub(mockHub, ciResult);

    expect(result.pushed).toBe(0); // All skipped (neutral, skipped, success)
  });
});

// ─────────────────────────────────────────────────────────────
// Issues Hub Sync Tests
// ─────────────────────────────────────────────────────────────

describe("syncIssuesToHub", () => {
  let mockHub: ReturnType<typeof createMockHub>;

  beforeEach(() => {
    mockHub = createMockHub();
  });

  it("returns error when issues result is not successful", async () => {
    const issuesResult: IssuesResult = {
      success: false,
      repoIssues: [],
      totalIssues: 0,
      error: "GitHub CLI not installed",
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(0);
    expect(result.errors).toContain("GitHub CLI not installed");
    expect(mockHub.pushDiagnostics).not.toHaveBeenCalled();
  });

  it("syncs issues with correct severity based on labels", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Critical bug",
              body: "Very important",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "critical" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 2,
              title: "Bug report",
              body: "Something broken",
              state: "OPEN",
              url: "https://github.com/org/api/issues/2",
              labels: [{ name: "bug" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 3,
              title: "Enhancement request",
              body: "Nice to have",
              state: "OPEN",
              url: "https://github.com/org/api/issues/3",
              labels: [{ name: "enhancement" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 4,
              title: "Warning issue",
              body: "Watch out",
              state: "OPEN",
              url: "https://github.com/org/api/issues/4",
              labels: [{ name: "warning" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 5,
              title: "No labels",
              body: "Default severity",
              state: "OPEN",
              url: "https://github.com/org/api/issues/5",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 5,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(5);
    expect(result.reposProcessed).toBe(1);

    const criticalDiag = mockHub.pushedDiagnostics.find((d) => d.title === "Critical bug");
    expect(criticalDiag?.severity).toBe("critical");

    const bugDiag = mockHub.pushedDiagnostics.find((d) => d.title === "Bug report");
    expect(bugDiag?.severity).toBe("error");

    const enhancementDiag = mockHub.pushedDiagnostics.find(
      (d) => d.title === "Enhancement request"
    );
    expect(enhancementDiag?.severity).toBe("suggestion");

    const warningDiag = mockHub.pushedDiagnostics.find((d) => d.title === "Warning issue");
    expect(warningDiag?.severity).toBe("warning");

    const noLabelDiag = mockHub.pushedDiagnostics.find((d) => d.title === "No labels");
    expect(noLabelDiag?.severity).toBe("note");
  });

  it("maps error label to error severity", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Error issue",
              body: "Has error label",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "error" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.severity).toBe("error");
  });

  it("maps suggestion label to suggestion severity", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Suggestion issue",
              body: "Has suggestion label",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "suggestion" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.severity).toBe("suggestion");
  });

  it("sets category based on labels", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Feedback issue",
              body: "User feedback",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "feedback" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 2,
              title: "Task issue",
              body: "Work to do",
              state: "OPEN",
              url: "https://github.com/org/api/issues/2",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 2,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(2);

    const feedbackDiag = mockHub.pushedDiagnostics.find((d) => d.title === "Feedback issue");
    expect(feedbackDiag?.category).toBe("feedback");

    const taskDiag = mockHub.pushedDiagnostics.find((d) => d.title === "Task issue");
    expect(taskDiag?.category).toBe("task");
  });

  it("marks closed issues as resolved", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Closed issue",
              body: "Done",
              state: "CLOSED",
              url: "https://github.com/org/api/issues/1",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.resolved).toBe(true);
  });

  it("filters issues by label when filterLabels option is set", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Bug issue",
              body: "Bug",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "bug" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 2,
              title: "Enhancement issue",
              body: "Enhancement",
              state: "OPEN",
              url: "https://github.com/org/api/issues/2",
              labels: [{ name: "enhancement" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 2,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult, {
      filterLabels: ["bug"],
    });

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.title).toBe("Bug issue");
  });

  it("handles case-insensitive label filtering", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Bug issue",
              body: "Bug",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "BUG" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult, {
      filterLabels: ["bug"],
    });

    expect(result.pushed).toBe(1);
  });

  it("does not clear existing when clearExisting is false", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Issue",
              body: "Body",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    await syncIssuesToHub(mockHub, issuesResult, { clearExisting: false });

    expect(mockHub.clearDiagnostics).not.toHaveBeenCalled();
  });

  it("handles repo errors gracefully", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [],
          error: "Rate limited",
        },
      ],
      totalIssues: 0,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(0);
    expect(result.reposProcessed).toBe(1);
    expect(result.errors).toContain("api: Rate limited");
  });

  it("handles push error gracefully", async () => {
    mockHub.pushDiagnostics = vi.fn().mockRejectedValue(new Error("Database error"));

    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Issue",
              body: "Body",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to push issue diagnostics");
  });

  it("uses title as description when body is empty", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Issue without body",
              body: "",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const result = await syncIssuesToHub(mockHub, issuesResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.description).toBe("Issue without body");
  });

  it("clears github-issue source by default", async () => {
    const issuesResult: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Issue",
              body: "Body",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    await syncIssuesToHub(mockHub, issuesResult);

    expect(mockHub.clearedSources).toContain("github-issue");
  });
});

// ─────────────────────────────────────────────────────────────
// Reviews Hub Sync Tests
// ─────────────────────────────────────────────────────────────

describe("syncReviewsToHub", () => {
  let mockHub: ReturnType<typeof createMockHub>;

  beforeEach(() => {
    mockHub = createMockHub();
  });

  it("returns error when reviews result is not successful", async () => {
    const reviewsResult: ReviewsResult = {
      success: false,
      repoReviews: [],
      totalReviews: 0,
      totalComments: 0,
      error: "GitHub CLI not installed",
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(0);
    expect(result.errors).toContain("GitHub CLI not installed");
    expect(mockHub.pushDiagnostics).not.toHaveBeenCalled();
  });

  it("skips repos without PR number", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          reviews: [],
          comments: [],
        },
      ],
      totalReviews: 0,
      totalComments: 0,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(0);
    expect(result.reposProcessed).toBe(1);
  });

  it("syncs reviews with correct severity based on state", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "CHANGES_REQUESTED",
              body: "Please fix this",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-1",
            },
            {
              id: 2,
              author: "reviewer2",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-2",
            },
            {
              id: 3,
              author: "reviewer3",
              state: "COMMENTED",
              body: "Just a comment",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-3",
            },
            {
              id: 4,
              author: "reviewer4",
              state: "PENDING",
              body: "Draft review",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-4",
            },
            {
              id: 5,
              author: "reviewer5",
              state: "DISMISSED",
              body: "Dismissed",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-5",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 5,
      totalComments: 0,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(5);
    expect(result.reposProcessed).toBe(1);

    const changesRequestedDiag = mockHub.pushedDiagnostics.find((d) =>
      d.title.includes("CHANGES_REQUESTED")
    );
    expect(changesRequestedDiag?.severity).toBe("warning");
    expect(changesRequestedDiag?.actionable).toBe(true);
    expect(changesRequestedDiag?.resolved).toBe(false);

    const approvedDiag = mockHub.pushedDiagnostics.find((d) => d.title.includes("APPROVED"));
    expect(approvedDiag?.severity).toBe("note");
    expect(approvedDiag?.resolved).toBe(true);

    const commentedDiag = mockHub.pushedDiagnostics.find((d) => d.title.includes("COMMENTED"));
    expect(commentedDiag?.severity).toBe("suggestion");

    const pendingDiag = mockHub.pushedDiagnostics.find((d) => d.title.includes("PENDING"));
    expect(pendingDiag?.severity).toBe("note");
    expect(pendingDiag?.actionable).toBe(true);

    const dismissedDiag = mockHub.pushedDiagnostics.find((d) => d.title.includes("DISMISSED"));
    expect(dismissedDiag?.severity).toBe("note");
    expect(dismissedDiag?.resolved).toBe(true);
  });

  it("syncs review comments with file location", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [],
          comments: [
            {
              id: 1,
              author: "reviewer1",
              body: "This needs fixing",
              path: "src/index.ts",
              line: 42,
              originalLine: null,
              side: null,
              state: "PENDING",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#discussion_r1",
            },
          ],
        },
      ],
      totalReviews: 0,
      totalComments: 1,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(1);
    const commentDiag = mockHub.pushedDiagnostics[0];
    expect(commentDiag).toBeDefined();
    expect(commentDiag?.file_path).toBe("src/index.ts");
    expect(commentDiag?.line_number).toBe(42);
    expect(commentDiag?.severity).toBe("suggestion");
    expect(commentDiag?.category).toBe("code-review");
  });

  it("marks dismissed comments as resolved", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [],
          comments: [
            {
              id: 1,
              author: "reviewer1",
              body: "Dismissed comment",
              path: "src/index.ts",
              line: 42,
              originalLine: null,
              side: null,
              state: "DISMISSED",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#discussion_r1",
            },
          ],
        },
      ],
      totalReviews: 0,
      totalComments: 1,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.resolved).toBe(true);
  });

  it("filters to changes_requested only when option is set", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "CHANGES_REQUESTED",
              body: "Fix this",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-1",
            },
            {
              id: 2,
              author: "reviewer2",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-2",
            },
          ],
          comments: [
            {
              id: 1,
              author: "reviewer1",
              body: "Comment",
              path: "src/index.ts",
              line: 42,
              originalLine: null,
              side: null,
              state: "PENDING",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#discussion_r1",
            },
          ],
        },
      ],
      totalReviews: 2,
      totalComments: 1,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult, {
      changesRequestedOnly: true,
    });

    // Only CHANGES_REQUESTED review + all comments
    expect(result.pushed).toBe(2);
    const reviewDiags = mockHub.pushedDiagnostics.filter((d) =>
      d.diagnostic_id.startsWith("review-api")
    );
    expect(reviewDiags).toHaveLength(1);
    expect(reviewDiags[0]?.title).toContain("CHANGES_REQUESTED");
  });

  it("does not clear existing when clearExisting is false", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-1",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    await syncReviewsToHub(mockHub, reviewsResult, { clearExisting: false });

    expect(mockHub.clearDiagnostics).not.toHaveBeenCalled();
  });

  it("handles repo errors gracefully", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [],
          comments: [],
          error: "Rate limited",
        },
      ],
      totalReviews: 0,
      totalComments: 0,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(0);
    expect(result.reposProcessed).toBe(1);
    expect(result.errors).toContain("api: Rate limited");
  });

  it("handles push error gracefully", async () => {
    mockHub.pushDiagnostics = vi.fn().mockRejectedValue(new Error("Database error"));

    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-1",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to push review diagnostics");
  });

  it("uses state as description when body is empty", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "APPROVED",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-1",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(1);
    expect(mockHub.pushedDiagnostics[0]?.description).toContain("APPROVED by reviewer1");
  });

  it("clears pr-review source by default", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 45,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/45#pullrequestreview-1",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    await syncReviewsToHub(mockHub, reviewsResult);

    expect(mockHub.clearedSources).toContain("pr-review");
  });

  it("sets correct github_pr_number on all diagnostics", async () => {
    const reviewsResult: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 123,
          reviews: [
            {
              id: 1,
              author: "reviewer1",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/123#pullrequestreview-1",
            },
          ],
          comments: [
            {
              id: 1,
              author: "reviewer1",
              body: "Comment",
              path: "src/index.ts",
              line: 42,
              originalLine: null,
              side: null,
              state: "PENDING",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/123#discussion_r1",
            },
          ],
        },
      ],
      totalReviews: 1,
      totalComments: 1,
    };

    const result = await syncReviewsToHub(mockHub, reviewsResult);

    expect(result.pushed).toBe(2);
    expect(mockHub.pushedDiagnostics.every((d) => d.github_pr_number === 123)).toBe(true);
  });
});
