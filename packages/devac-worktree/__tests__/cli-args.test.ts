/**
 * Tests for CLI argument parsing functions
 */

import { describe, expect, test } from "vitest";
import { parseIssueArg, parseRepos } from "../src/index.js";

describe("parseIssueArg", () => {
  describe("full issue ID format (ghrepo-123)", () => {
    test("parses full issue ID with repo name", () => {
      const result = parseIssueArg("ghvivief-42");
      expect(result).toEqual({
        issueNumber: 42,
        issueId: "ghvivief-42",
        repoName: "vivief",
      });
    });

    test("parses issue ID with different repo names", () => {
      const result = parseIssueArg("ghapi-99");
      expect(result).toEqual({
        issueNumber: 99,
        issueId: "ghapi-99",
        repoName: "api",
      });
    });

    test("parses issue ID with hyphenated repo name", () => {
      const result = parseIssueArg("ghmy-cool-repo-123");
      expect(result).toEqual({
        issueNumber: 123,
        issueId: "ghmy-cool-repo-123",
        repoName: "my-cool-repo",
      });
    });
  });

  describe("non-gh input (assumed Jira, coming soon)", () => {
    test("numeric-only input shows Jira message", () => {
      expect(() => parseIssueArg("42")).toThrow("Jira issue format detected");
      expect(() => parseIssueArg("42")).toThrow("coming soon");
    });

    test("TEAM-123 format shows Jira message", () => {
      expect(() => parseIssueArg("CORE-123")).toThrow("Jira issue format detected");
      expect(() => parseIssueArg("CORE-123")).toThrow("coming soon");
    });

    test("jTEAM-123 format shows Jira message", () => {
      expect(() => parseIssueArg("jCORE-123")).toThrow("Jira issue format detected");
      expect(() => parseIssueArg("jCORE-123")).toThrow("JCORE-123"); // uppercased
    });

    test("mixed case input is uppercased in error", () => {
      expect(() => parseIssueArg("core-123")).toThrow("CORE-123");
      expect(() => parseIssueArg("Core-456")).toThrow("CORE-456");
      expect(() => parseIssueArg("mobile-789")).toThrow("MOBILE-789");
    });

    test("suggests GitHub format as alternative", () => {
      expect(() => parseIssueArg("CORE-123")).toThrow("gh<repoDirectoryName>");
    });

    test("any non-gh input is assumed Jira", () => {
      expect(() => parseIssueArg("abc")).toThrow("Jira issue format detected");
      expect(() => parseIssueArg("123")).toThrow("Jira issue format detected");
      expect(() => parseIssueArg("repo-42")).toThrow("Jira issue format detected");
    });
  });

  describe("invalid GitHub format", () => {
    test("gh without proper format throws GitHub error", () => {
      expect(() => parseIssueArg("gh")).toThrow("Invalid GitHub issue ID");
    });

    test("gh- without repo throws GitHub error", () => {
      expect(() => parseIssueArg("gh-123")).toThrow("Invalid GitHub issue ID");
    });

    test("ghrepo without number throws GitHub error", () => {
      expect(() => parseIssueArg("ghrepo")).toThrow("Invalid GitHub issue ID");
    });

    test("error message includes the invalid input", () => {
      expect(() => parseIssueArg("ghbad")).toThrow('"ghbad"');
    });

    test("error message suggests correct format", () => {
      expect(() => parseIssueArg("ghbad")).toThrow("ghvivief-123");
    });
  });
});

describe("parseRepos", () => {
  test("parses comma-separated repos", () => {
    expect(parseRepos("api,web,shared")).toEqual(["api", "web", "shared"]);
  });

  test("handles single repo", () => {
    expect(parseRepos("api")).toEqual(["api"]);
  });

  test("trims whitespace around repos", () => {
    expect(parseRepos(" api , web , shared ")).toEqual(["api", "web", "shared"]);
  });

  test("filters empty entries", () => {
    expect(parseRepos("api,,web")).toEqual(["api", "web"]);
  });

  test("handles empty string", () => {
    expect(parseRepos("")).toEqual([]);
  });

  test("handles string with only commas", () => {
    expect(parseRepos(",,,")).toEqual([]);
  });

  test("handles repos with hyphens", () => {
    expect(parseRepos("my-api,cool-web")).toEqual(["my-api", "cool-web"]);
  });
});
