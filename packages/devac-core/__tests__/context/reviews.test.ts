/**
 * PR Reviews Module Tests
 *
 * Tests for the formatReviews function.
 * Note: getReviewsForContext requires complex child_process mocking
 * that conflicts with vitest's module hoisting.
 */

import { describe, expect, it } from "vitest";
import { formatReviews } from "../../src/context/reviews.js";
import type { ReviewsResult } from "../../src/context/reviews.js";

// ─────────────────────────────────────────────────────────────
// Tests for formatReviews
// ─────────────────────────────────────────────────────────────

describe("formatReviews", () => {
  it("formats error message when success is false", () => {
    const result: ReviewsResult = {
      success: false,
      repoReviews: [],
      totalReviews: 0,
      totalComments: 0,
      error: "GitHub CLI not installed",
    };

    const formatted = formatReviews(result);

    expect(formatted).toBe("Error: GitHub CLI not installed");
  });

  it("formats reviews for repo with PR", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          prUrl: "https://github.com/org/api/pull/42",
          reviews: [
            {
              id: 1,
              author: "alice",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "https://github.com/org/api/pull/42#pullrequestreview-1",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("PR Reviews:");
    expect(formatted).toContain("api: PR #42");
    expect(formatted).toContain("1 reviews");
    expect(formatted).toContain("✓ alice: APPROVED");
    expect(formatted).toContain("LGTM");
    expect(formatted).toContain("Total: 1 reviews, 0 comments");
  });

  it("shows no PR for repos without PR", () => {
    const result: ReviewsResult = {
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

    const formatted = formatReviews(result);

    expect(formatted).toContain("api: no PR");
  });

  it("shows repo-level errors", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          reviews: [],
          comments: [],
          error: "Rate limited",
        },
      ],
      totalReviews: 0,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("api:");
    expect(formatted).toContain("Error: Rate limited");
  });

  it("uses correct icon for APPROVED state", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "alice",
              state: "APPROVED",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("✓ alice: APPROVED");
  });

  it("uses correct icon for CHANGES_REQUESTED state", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "bob",
              state: "CHANGES_REQUESTED",
              body: "Needs work",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("✗ bob: CHANGES_REQUESTED");
  });

  it("uses correct icon for COMMENTED state", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "carol",
              state: "COMMENTED",
              body: "Just a comment",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("💬 carol: COMMENTED");
  });

  it("uses correct icon for PENDING state", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "dave",
              state: "PENDING",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("⏳ dave: PENDING");
  });

  it("uses correct icon for DISMISSED state", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "eve",
              state: "DISMISSED",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("○ eve: DISMISSED");
  });

  it("truncates long review bodies", () => {
    const longBody = "A".repeat(100);
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "alice",
              state: "APPROVED",
              body: longBody,
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("...");
    expect(formatted).not.toContain(longBody);
  });

  it("shows comment with line number", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [],
          comments: [
            {
              id: 123,
              path: "src/utils.ts",
              line: 25,
              originalLine: null,
              side: "RIGHT",
              body: "Consider refactoring this function",
              author: "bob",
              state: "SUBMITTED",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
        },
      ],
      totalReviews: 0,
      totalComments: 1,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("📝 bob at src/utils.ts:25:");
    expect(formatted).toContain("Consider refactoring this function");
  });

  it("shows comment without line number", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [],
          comments: [
            {
              id: 123,
              path: "src/utils.ts",
              line: null,
              originalLine: null,
              side: null,
              body: "General comment",
              author: "bob",
              state: null,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
        },
      ],
      totalReviews: 0,
      totalComments: 1,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("📝 bob at src/utils.ts:");
    expect(formatted).not.toContain("src/utils.ts:null");
  });

  it("formats multiple reviews and comments", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          prUrl: "https://github.com/org/api/pull/42",
          reviews: [
            {
              id: 1,
              author: "alice",
              state: "APPROVED",
              body: "LGTM",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
            {
              id: 2,
              author: "bob",
              state: "CHANGES_REQUESTED",
              body: "Fix the tests",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [
            {
              id: 123,
              path: "src/api.ts",
              line: 10,
              originalLine: null,
              side: "RIGHT",
              body: "Add error handling",
              author: "carol",
              state: "SUBMITTED",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
        },
      ],
      totalReviews: 2,
      totalComments: 1,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("2 reviews, 1 comments");
    expect(formatted).toContain("✓ alice: APPROVED");
    expect(formatted).toContain("✗ bob: CHANGES_REQUESTED");
    expect(formatted).toContain("📝 carol at src/api.ts:10:");
    expect(formatted).toContain("Total: 2 reviews, 1 comments");
  });

  it("formats reviews from multiple repos", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "alice",
              state: "APPROVED",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
        {
          repo: "web",
          path: "/ws/web",
          prNumber: 55,
          reviews: [
            {
              id: 2,
              author: "bob",
              state: "CHANGES_REQUESTED",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 2,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("api: PR #42");
    expect(formatted).toContain("web: PR #55");
    expect(formatted).toContain("✓ alice: APPROVED");
    expect(formatted).toContain("✗ bob: CHANGES_REQUESTED");
  });

  it("handles empty reviews and comments", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [],
          comments: [],
        },
      ],
      totalReviews: 0,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    expect(formatted).toContain("api: PR #42 - 0 reviews, 0 comments");
    expect(formatted).toContain("Total: 0 reviews, 0 comments");
  });

  it("handles review with empty body", () => {
    const result: ReviewsResult = {
      success: true,
      repoReviews: [
        {
          repo: "api",
          path: "/ws/api",
          prNumber: 42,
          reviews: [
            {
              id: 1,
              author: "alice",
              state: "APPROVED",
              body: "",
              submittedAt: "2024-01-01T00:00:00Z",
              url: "",
            },
          ],
          comments: [],
        },
      ],
      totalReviews: 1,
      totalComments: 0,
    };

    const formatted = formatReviews(result);

    // Should show review without body preview
    expect(formatted).toContain("✓ alice: APPROVED");
    // Should not have trailing dash from empty body
    expect(formatted).not.toMatch(/APPROVED\s+-\s*$/m);
  });
});
