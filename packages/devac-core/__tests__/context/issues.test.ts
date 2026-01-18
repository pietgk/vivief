/**
 * GitHub Issues Module Tests
 *
 * Tests for the formatIssues function.
 * Note: getIssuesForContext requires complex child_process mocking
 * that conflicts with vitest's module hoisting.
 */

import { describe, expect, it } from "vitest";
import { formatIssues } from "../../src/context/issues.js";
import type { IssuesResult } from "../../src/context/issues.js";

// ─────────────────────────────────────────────────────────────
// Tests for formatIssues
// ─────────────────────────────────────────────────────────────

describe("formatIssues", () => {
  it("formats error message when success is false", () => {
    const result: IssuesResult = {
      success: false,
      repoIssues: [],
      totalIssues: 0,
      error: "GitHub CLI not installed",
    };

    const formatted = formatIssues(result);

    expect(formatted).toBe("Error: GitHub CLI not installed");
  });

  it("formats issues for single repo", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Bug fix",
              body: "Fix the bug",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "bug" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
            {
              number: 2,
              title: "Feature request",
              body: "Add feature",
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

    const formatted = formatIssues(result);

    expect(formatted).toContain("GitHub Issues:");
    expect(formatted).toContain("api: 2 issues");
    expect(formatted).toContain("#1: Bug fix [bug]");
    expect(formatted).toContain("#2: Feature request [enhancement]");
    expect(formatted).toContain("Total: 2 issues");
  });

  it("formats issues for multiple repos", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "API bug",
              body: "Fix it",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "bug" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
        {
          repo: "web",
          path: "/ws/web",
          issues: [
            {
              number: 5,
              title: "Frontend issue",
              body: "UI bug",
              state: "OPEN",
              url: "https://github.com/org/web/issues/5",
              labels: [{ name: "frontend" }, { name: "priority" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 2,
    };

    const formatted = formatIssues(result);

    expect(formatted).toContain("api: 1 issues");
    expect(formatted).toContain("#1: API bug [bug]");
    expect(formatted).toContain("web: 1 issues");
    expect(formatted).toContain("#5: Frontend issue [frontend, priority]");
    expect(formatted).toContain("Total: 2 issues");
  });

  it("shows repo-level errors", () => {
    const result: IssuesResult = {
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

    const formatted = formatIssues(result);

    expect(formatted).toContain("api: 0 issues");
    expect(formatted).toContain("Error: Rate limited");
  });

  it("truncates long titles", () => {
    const longTitle = "A".repeat(100);
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: longTitle,
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

    const formatted = formatIssues(result);

    expect(formatted).toContain("...");
    expect(formatted).not.toContain(longTitle);
    // Should contain truncated version (60 chars + ...)
    expect(formatted).toContain(`${"A".repeat(60)}...`);
  });

  it("shows issues without labels", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "No labels issue",
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

    const formatted = formatIssues(result);

    expect(formatted).toContain("#1: No labels issue");
    // Should not have empty brackets
    expect(formatted).not.toContain("[]");
    expect(formatted).not.toMatch(/#1: No labels issue \[/);
  });

  it("handles empty repo issues array", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [],
        },
      ],
      totalIssues: 0,
    };

    const formatted = formatIssues(result);

    expect(formatted).toContain("api: 0 issues");
    expect(formatted).toContain("Total: 0 issues");
  });

  it("handles closed issues", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Fixed bug",
              body: "This was fixed",
              state: "CLOSED",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "bug" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-02T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const formatted = formatIssues(result);

    expect(formatted).toContain("#1: Fixed bug [bug]");
  });

  it("handles multiple labels", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [
        {
          repo: "api",
          path: "/ws/api",
          issues: [
            {
              number: 1,
              title: "Multi-label issue",
              body: "Has many labels",
              state: "OPEN",
              url: "https://github.com/org/api/issues/1",
              labels: [{ name: "bug" }, { name: "priority" }, { name: "needs-review" }],
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
        },
      ],
      totalIssues: 1,
    };

    const formatted = formatIssues(result);

    expect(formatted).toContain("[bug, priority, needs-review]");
  });

  it("handles empty repoIssues array", () => {
    const result: IssuesResult = {
      success: true,
      repoIssues: [],
      totalIssues: 0,
    };

    const formatted = formatIssues(result);

    expect(formatted).toContain("GitHub Issues:");
    expect(formatted).toContain("Total: 0 issues");
  });
});
