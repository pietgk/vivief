/**
 * GitHub module tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock execa before importing the module
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";
import { createPR, fetchIssue, generateBranchName, getPRForBranch } from "../src/github.js";

const mockedExeca = vi.mocked(execa);

// Helper to create typed mock results for execa
function mockExecaResult(stdout: string) {
  return { stdout, stderr: "", exitCode: 0 } as Awaited<ReturnType<typeof execa>>;
}

describe("fetchIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches issue via gh CLI", async () => {
    mockedExeca.mockResolvedValueOnce(
      mockExecaResult(
        JSON.stringify({
          number: 42,
          title: "Fix login bug",
          body: "Users cannot log in",
          state: "OPEN",
          labels: [{ name: "bug" }, { name: "priority-high" }],
        })
      )
    );

    const issue = await fetchIssue(42);

    expect(mockedExeca).toHaveBeenCalledWith("gh", [
      "issue",
      "view",
      "42",
      "--json",
      "number,title,body,state,labels",
    ]);
    expect(issue).toEqual({
      number: 42,
      title: "Fix login bug",
      body: "Users cannot log in",
      state: "OPEN",
      labels: [{ name: "bug" }, { name: "priority-high" }],
    });
  });

  it("handles issue with no labels", async () => {
    mockedExeca.mockResolvedValueOnce(
      mockExecaResult(
        JSON.stringify({
          number: 1,
          title: "Test issue",
          body: "",
          state: "OPEN",
          labels: [],
        })
      )
    );

    const issue = await fetchIssue(1);

    expect(issue.labels).toEqual([]);
  });
});

describe("createPR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates PR via gh CLI", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult("https://github.com/owner/repo/pull/5"));

    const result = await createPR({
      branch: "42-fix-bug",
      title: "Fix login bug",
      body: "Fixes the login bug",
      issueNumber: 42,
    });

    expect(mockedExeca).toHaveBeenCalledWith("gh", [
      "pr",
      "create",
      "--head",
      "42-fix-bug",
      "--title",
      "Fix login bug",
      "--body",
      "Fixes the login bug\n\nCloses #42",
    ]);
    expect(result).toBe("https://github.com/owner/repo/pull/5");
  });
});

describe("getPRForBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PR info when PR exists", async () => {
    mockedExeca.mockResolvedValueOnce(
      mockExecaResult(
        JSON.stringify({
          url: "https://github.com/owner/repo/pull/5",
          state: "OPEN",
        })
      )
    );

    const pr = await getPRForBranch("42-fix-bug");

    expect(mockedExeca).toHaveBeenCalledWith("gh", [
      "pr",
      "view",
      "42-fix-bug",
      "--json",
      "url,state",
    ]);
    expect(pr).toEqual({
      url: "https://github.com/owner/repo/pull/5",
      state: "OPEN",
    });
  });

  it("returns null when no PR exists", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("no pull requests found"));

    const pr = await getPRForBranch("no-pr-branch");

    expect(pr).toBeNull();
  });
});

describe("generateBranchName", () => {
  it("generates branch name from issue", () => {
    const branch = generateBranchName(42, "Fix login bug");

    expect(branch).toBe("42-fix-login-bug");
  });

  it("limits to 4 words", () => {
    const longTitle = "This is a very long issue title";
    const branch = generateBranchName(123, longTitle);

    // 4 words max
    expect(branch).toBe("123-this-is-a-very");
  });

  it("handles special characters", () => {
    const branch = generateBranchName(1, "Fix: [bug] & issue (test)");

    expect(branch).toBe("1-fix-bug-issue-test");
    expect(branch).not.toMatch(/[^a-z0-9-]/);
  });

  it("handles [Task]: prefix", () => {
    const branch = generateBranchName(5, "[Task]: Add new feature");

    expect(branch).toBe("5-add-new-feature");
  });
});
