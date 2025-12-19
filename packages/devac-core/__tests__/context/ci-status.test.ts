/**
 * CI Status Module Tests
 *
 * Tests for GitHub Actions CI status retrieval.
 */

import { describe, expect, it } from "vitest";
import { formatCIStatus } from "../../src/context/ci-status.js";
import type { CIStatusResult } from "../../src/context/ci-status.js";

describe("CI Status", () => {
  describe("formatCIStatus", () => {
    it("formats successful CI status", () => {
      const result: CIStatusResult = {
        success: true,
        statuses: [
          {
            repo: "api",
            path: "/ws/api-123-auth",
            prNumber: 45,
            prUrl: "https://github.com/org/api/pull/45",
            prTitle: "Add authentication",
            status: "passing",
          },
          {
            repo: "web",
            path: "/ws/web-123-auth",
            prNumber: 46,
            prUrl: "https://github.com/org/web/pull/46",
            prTitle: "Update frontend for auth",
            status: "pending",
          },
        ],
        summary: {
          total: 2,
          passing: 1,
          failing: 0,
          pending: 1,
          noPr: 0,
          unknown: 0,
        },
      };

      const formatted = formatCIStatus(result);

      expect(formatted).toContain("CI Status:");
      expect(formatted).toContain("api");
      expect(formatted).toContain("PR #45");
      expect(formatted).toContain("Add authentication");
      expect(formatted).toContain("web");
      expect(formatted).toContain("PR #46");
      expect(formatted).toContain("1 passing");
      expect(formatted).toContain("1 pending");
    });

    it("formats error message when success is false", () => {
      const result: CIStatusResult = {
        success: false,
        statuses: [],
        summary: { total: 0, passing: 0, failing: 0, pending: 0, noPr: 0, unknown: 0 },
        error: "GitHub CLI not installed",
      };

      const formatted = formatCIStatus(result);

      expect(formatted).toContain("❌");
      expect(formatted).toContain("GitHub CLI not installed");
    });

    it("shows no-pr status", () => {
      const result: CIStatusResult = {
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

      const formatted = formatCIStatus(result);

      expect(formatted).toContain("api");
      expect(formatted).toContain("no PR");
    });

    it("shows failing status", () => {
      const result: CIStatusResult = {
        success: true,
        statuses: [
          {
            repo: "api",
            path: "/ws/api-123-auth",
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

      const formatted = formatCIStatus(result);

      expect(formatted).toContain("✗");
      expect(formatted).toContain("1 failing");
    });

    it("includes check details when provided", () => {
      const result: CIStatusResult = {
        success: true,
        statuses: [
          {
            repo: "api",
            path: "/ws/api-123-auth",
            prNumber: 45,
            status: "passing",
            checks: [
              { name: "build", status: "completed", conclusion: "success" },
              { name: "test", status: "completed", conclusion: "success" },
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

      const formatted = formatCIStatus(result);

      expect(formatted).toContain("build");
      expect(formatted).toContain("test");
    });

    it("shows error for individual repos", () => {
      const result: CIStatusResult = {
        success: true,
        statuses: [
          {
            repo: "api",
            path: "/ws/api",
            status: "unknown",
            error: "Network error",
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

      const formatted = formatCIStatus(result);

      expect(formatted).toContain("⚠️");
      expect(formatted).toContain("Network error");
    });
  });
});
