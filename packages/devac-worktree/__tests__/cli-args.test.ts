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

  describe("legacy numeric format", () => {
    test("parses simple numeric issue number", () => {
      const result = parseIssueArg("42");
      expect(result).toEqual({
        issueNumber: 42,
      });
    });

    test("parses large issue numbers", () => {
      const result = parseIssueArg("12345");
      expect(result).toEqual({
        issueNumber: 12345,
      });
    });

    test("parses single digit issue numbers", () => {
      const result = parseIssueArg("1");
      expect(result).toEqual({
        issueNumber: 1,
      });
    });
  });

  describe("error handling", () => {
    test("throws on zero", () => {
      expect(() => parseIssueArg("0")).toThrow("Invalid issue");
    });

    test("throws on negative numbers", () => {
      expect(() => parseIssueArg("-5")).toThrow("Invalid issue");
    });

    test("throws on non-numeric strings", () => {
      expect(() => parseIssueArg("abc")).toThrow("Invalid issue");
    });

    test("throws on empty string", () => {
      expect(() => parseIssueArg("")).toThrow("Invalid issue");
    });

    test("throws on format without gh prefix", () => {
      // "repo-42" without "gh" prefix is not valid
      expect(() => parseIssueArg("repo-nope")).toThrow("Invalid issue");
    });

    test("error message includes the invalid input", () => {
      expect(() => parseIssueArg("invalid")).toThrow('"invalid"');
    });

    test("error message suggests correct formats", () => {
      expect(() => parseIssueArg("bad")).toThrow("ghrepo-123");
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
