/**
 * Claude CLI integration tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock execa before importing the module
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";
import { isClaudeInstalled, launchClaude, writeIssueContext } from "../src/claude.js";
import type { GitHubIssue } from "../src/types.js";

const mockedExeca = vi.mocked(execa);

// Helper to create typed mock results for execa
function mockExecaResult(stdout: string) {
  return { stdout, stderr: "", exitCode: 0 } as Awaited<ReturnType<typeof execa>>;
}

describe("writeIssueContext", () => {
  let tempHome: string;
  let originalHome: string;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "devac-worktree-claude-test-"));
    originalHome = process.env.HOME ?? "";
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("writes issue context markdown file", async () => {
    const issue: GitHubIssue = {
      number: 42,
      title: "Fix login bug",
      body: "Users cannot log in with special characters in password",
      state: "OPEN",
      labels: [{ name: "bug" }, { name: "priority-high" }],
    };

    await writeIssueContext(issue, "/worktrees/repo-42");

    const contextPath = path.join(tempHome, ".devac", "issue-context.md");
    const content = await fs.readFile(contextPath, "utf-8");

    expect(content).toContain("# Issue #42: Fix login bug");
    expect(content).toContain("## Worktree Location");
    expect(content).toContain("`/worktrees/repo-42`");
    expect(content).toContain("## Issue Body");
    expect(content).toContain("Users cannot log in with special characters");
  });

  it("creates .devac directory if it does not exist", async () => {
    const issue: GitHubIssue = {
      number: 1,
      title: "Test",
      body: "",
      state: "OPEN",
      labels: [],
    };

    await writeIssueContext(issue, "/test");

    const devacDir = path.join(tempHome, ".devac");
    const stat = await fs.stat(devacDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("handles issue with no body", async () => {
    const issue: GitHubIssue = {
      number: 5,
      title: "Empty issue",
      body: "",
      state: "OPEN",
      labels: [],
    };

    await writeIssueContext(issue, "/test");

    const contextPath = path.join(tempHome, ".devac", "issue-context.md");
    const content = await fs.readFile(contextPath, "utf-8");

    expect(content).toContain("# Issue #5: Empty issue");
    expect(content).toContain("## Issue Body");
  });
});

describe("isClaudeInstalled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when claude command exists", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult("claude version 1.0.0"));

    const installed = await isClaudeInstalled();

    expect(installed).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith("claude", ["--version"]);
  });

  it("returns false when claude command not found", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("not found"));

    const installed = await isClaudeInstalled();

    expect(installed).toBe(false);
  });
});

describe("launchClaude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("launches claude in the specified directory", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await launchClaude("/worktrees/repo-42");

    expect(mockedExeca).toHaveBeenCalledWith("claude", [], {
      cwd: "/worktrees/repo-42",
      stdio: "inherit",
      env: expect.objectContaining({
        PWD: "/worktrees/repo-42",
      }),
    });
  });

  it("passes resume option", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await launchClaude("/worktrees/repo-42", { resume: "abc123" });

    expect(mockedExeca).toHaveBeenCalledWith("claude", ["--resume", "abc123"], expect.any(Object));
  });

  it("passes print option", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await launchClaude("/worktrees/repo-42", { print: "Hello" });

    expect(mockedExeca).toHaveBeenCalledWith("claude", ["--print", "Hello"], expect.any(Object));
  });
});
