/**
 * Worktree module tests
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
import type { WorktreeState } from "../src/types.js";
import {
  addWorktreeToState,
  checkWorktreeStatus,
  createWorktree,
  createWorktreeWithGitCrypt,
  deleteBranch,
  findWorktreeForIssue,
  getDefaultBranch,
  listWorktrees,
  loadState,
  pruneWorktrees,
  removeWorktree,
  removeWorktreeFromState,
  saveState,
  usesGitCrypt,
} from "../src/worktree.js";

const mockedExeca = vi.mocked(execa);

// Helper to create typed mock results for execa
function mockExecaResult(stdout: string) {
  return { stdout, stderr: "", exitCode: 0 } as Awaited<ReturnType<typeof execa>>;
}

describe("State Management", () => {
  let tempHome: string;
  let originalHome: string;

  beforeEach(async () => {
    // Create a temp directory to use as HOME
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "devac-worktree-test-"));
    originalHome = process.env.HOME ?? "";
    process.env.HOME = tempHome;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("loadState returns empty state when file does not exist", async () => {
    const state = await loadState();

    expect(state).toEqual({ worktrees: [] });
  });

  it("loadState returns saved state", async () => {
    const devacDir = path.join(tempHome, ".devac");
    await fs.mkdir(devacDir, { recursive: true });

    const testState: WorktreeState = {
      worktrees: [
        {
          issueNumber: 42,
          issueTitle: "Fix bug",
          branch: "42-fix-bug",
          path: "/path/to/worktree",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    };

    await fs.writeFile(path.join(devacDir, "worktrees.json"), JSON.stringify(testState, null, 2));

    const state = await loadState();

    expect(state).toEqual(testState);
  });

  it("loadState returns empty state on invalid JSON", async () => {
    const devacDir = path.join(tempHome, ".devac");
    await fs.mkdir(devacDir, { recursive: true });
    await fs.writeFile(path.join(devacDir, "worktrees.json"), "invalid json {");

    const state = await loadState();

    expect(state).toEqual({ worktrees: [] });
  });

  it("saveState creates .devac directory if needed", async () => {
    const testState: WorktreeState = {
      worktrees: [
        {
          issueNumber: 1,
          issueTitle: "Test",
          branch: "1-test",
          path: "/test",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    };

    await saveState(testState);

    const saved = await fs.readFile(path.join(tempHome, ".devac", "worktrees.json"), "utf-8");
    expect(JSON.parse(saved)).toEqual(testState);
  });

  it("saveState overwrites existing state", async () => {
    const oldState: WorktreeState = { worktrees: [] };
    const newState: WorktreeState = {
      worktrees: [
        {
          issueNumber: 99,
          issueTitle: "New",
          branch: "99-new",
          path: "/new",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    };

    await saveState(oldState);
    await saveState(newState);

    const loaded = await loadState();
    expect(loaded).toEqual(newState);
  });

  it("addWorktreeToState adds new worktree", async () => {
    await addWorktreeToState({
      issueNumber: 10,
      issueTitle: "Add feature",
      branch: "10-add-feature",
      path: "/worktrees/repo-10",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const state = await loadState();

    expect(state.worktrees).toHaveLength(1);
    expect(state.worktrees[0].issueNumber).toBe(10);
  });

  it("addWorktreeToState replaces existing worktree for same issue", async () => {
    await addWorktreeToState({
      issueNumber: 10,
      issueTitle: "Old title",
      branch: "10-old",
      path: "/old/path",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    await addWorktreeToState({
      issueNumber: 10,
      issueTitle: "New title",
      branch: "10-new",
      path: "/new/path",
      createdAt: "2025-01-02T00:00:00.000Z",
    });

    const state = await loadState();

    expect(state.worktrees).toHaveLength(1);
    expect(state.worktrees[0].issueTitle).toBe("New title");
  });

  it("addWorktreeToState preserves other worktrees", async () => {
    await addWorktreeToState({
      issueNumber: 1,
      issueTitle: "First",
      branch: "1-first",
      path: "/path1",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    await addWorktreeToState({
      issueNumber: 2,
      issueTitle: "Second",
      branch: "2-second",
      path: "/path2",
      createdAt: "2025-01-02T00:00:00.000Z",
    });

    const state = await loadState();

    expect(state.worktrees).toHaveLength(2);
  });

  it("removeWorktreeFromState removes worktree", async () => {
    await addWorktreeToState({
      issueNumber: 10,
      issueTitle: "Test",
      branch: "10-test",
      path: "/test",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    await addWorktreeToState({
      issueNumber: 20,
      issueTitle: "Keep",
      branch: "20-keep",
      path: "/keep",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    await removeWorktreeFromState(10);

    const state = await loadState();

    expect(state.worktrees).toHaveLength(1);
    expect(state.worktrees[0].issueNumber).toBe(20);
  });

  it("removeWorktreeFromState does nothing when issue not found", async () => {
    await addWorktreeToState({
      issueNumber: 42,
      issueTitle: "Test",
      branch: "42-test",
      path: "/test",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    await removeWorktreeFromState(999); // Different issue number

    const state = await loadState();

    expect(state.worktrees).toHaveLength(1);
  });

  it("findWorktreeForIssue returns path when found in state", async () => {
    await addWorktreeToState({
      issueNumber: 42,
      issueTitle: "Test",
      branch: "42-test",
      path: "/worktrees/repo-42",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const result = await findWorktreeForIssue(42);

    expect(result).toBe("/worktrees/repo-42");
  });

  it("findWorktreeForIssue returns null when not found", async () => {
    const result = await findWorktreeForIssue(999);

    expect(result).toBeNull();
  });
});

describe("Git Worktree Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createWorktree fetches and creates worktree with explicit baseBranch", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult("")) // fetch
      .mockResolvedValueOnce(mockExecaResult("")); // worktree add

    await createWorktree({
      branch: "42-fix-bug",
      worktreePath: "/worktrees/repo-42",
      baseBranch: "main",
    });

    // First call fetches main
    expect(mockedExeca).toHaveBeenNthCalledWith(1, "git", ["fetch", "origin", "main:main"], {
      reject: false,
    });

    // Second call creates worktree (with empty cwd options when no repoPath)
    expect(mockedExeca).toHaveBeenNthCalledWith(
      2,
      "git",
      ["worktree", "add", "-b", "42-fix-bug", "/worktrees/repo-42", "main"],
      {}
    );
  });

  it("createWorktree uses custom base branch", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult(""))
      .mockResolvedValueOnce(mockExecaResult(""));

    await createWorktree({
      branch: "42-fix-bug",
      worktreePath: "/worktrees/repo-42",
      baseBranch: "develop",
    });

    expect(mockedExeca).toHaveBeenNthCalledWith(1, "git", ["fetch", "origin", "develop:develop"], {
      reject: false,
    });
  });

  it("removeWorktree calls git worktree remove", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await removeWorktree("/worktrees/repo-42");

    expect(mockedExeca).toHaveBeenCalledWith("git", ["worktree", "remove", "/worktrees/repo-42"]);
  });

  it("removeWorktree with force uses --force flag", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await removeWorktree("/worktrees/repo-42", { force: true });

    expect(mockedExeca).toHaveBeenCalledWith("git", [
      "worktree",
      "remove",
      "--force",
      "/worktrees/repo-42",
    ]);
  });

  it("listWorktrees parses porcelain format", async () => {
    mockedExeca.mockResolvedValueOnce(
      mockExecaResult(
        [
          "worktree /main/repo",
          "HEAD abc1234",
          "branch refs/heads/main",
          "",
          "worktree /worktrees/repo-42",
          "HEAD def5678",
          "branch refs/heads/42-fix-bug",
          "",
        ].join("\n")
      )
    );

    const worktrees = await listWorktrees();

    expect(worktrees).toHaveLength(2);
    expect(worktrees[0]).toEqual({
      path: "/main/repo",
      head: "abc1234",
      branch: "main",
    });
    expect(worktrees[1]).toEqual({
      path: "/worktrees/repo-42",
      head: "def5678",
      branch: "42-fix-bug",
    });
  });

  it("pruneWorktrees calls git worktree prune", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await pruneWorktrees();

    expect(mockedExeca).toHaveBeenCalledWith("git", ["worktree", "prune"]);
  });

  it("deleteBranch calls git branch -d", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await deleteBranch("42-fix-bug");

    expect(mockedExeca).toHaveBeenCalledWith("git", ["branch", "-d", "42-fix-bug"]);
  });

  it("deleteBranch with force uses -D flag", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await deleteBranch("42-fix-bug", { force: true });

    expect(mockedExeca).toHaveBeenCalledWith("git", ["branch", "-D", "42-fix-bug"]);
  });
});

describe("checkWorktreeStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns clean status when no changes", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult("")) // git diff --name-only HEAD
      .mockResolvedValueOnce(mockExecaResult("")); // git ls-files --others

    const status = await checkWorktreeStatus("/path/to/worktree");

    expect(status.isClean).toBe(true);
    expect(status.modifiedFiles).toEqual([]);
    expect(status.untrackedFiles).toEqual([]);
  });

  it("detects modified files", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult("src/file1.ts\nsrc/file2.ts"))
      .mockResolvedValueOnce(mockExecaResult(""));

    const status = await checkWorktreeStatus("/path/to/worktree");

    expect(status.isClean).toBe(false);
    expect(status.modifiedFiles).toEqual(["src/file1.ts", "src/file2.ts"]);
    expect(status.untrackedFiles).toEqual([]);
  });

  it("detects untracked files", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult(""))
      .mockResolvedValueOnce(mockExecaResult("new-file.ts\ntemp.log"));

    const status = await checkWorktreeStatus("/path/to/worktree");

    expect(status.isClean).toBe(false);
    expect(status.modifiedFiles).toEqual([]);
    expect(status.untrackedFiles).toEqual(["new-file.ts", "temp.log"]);
  });

  it("detects both modified and untracked files", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult("changed.ts"))
      .mockResolvedValueOnce(mockExecaResult("new.ts"));

    const status = await checkWorktreeStatus("/path/to/worktree");

    expect(status.isClean).toBe(false);
    expect(status.modifiedFiles).toEqual(["changed.ts"]);
    expect(status.untrackedFiles).toEqual(["new.ts"]);
  });

  it("returns clean status on error (graceful degradation)", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("git failed"));

    const status = await checkWorktreeStatus("/invalid/path");

    expect(status.isClean).toBe(true);
    expect(status.modifiedFiles).toEqual([]);
    expect(status.untrackedFiles).toEqual([]);
  });

  it("passes correct cwd to git commands", async () => {
    mockedExeca
      .mockResolvedValueOnce(mockExecaResult(""))
      .mockResolvedValueOnce(mockExecaResult(""));

    await checkWorktreeStatus("/my/worktree/path");

    expect(mockedExeca).toHaveBeenNthCalledWith(1, "git", ["diff", "--name-only", "HEAD"], {
      cwd: "/my/worktree/path",
    });
    expect(mockedExeca).toHaveBeenNthCalledWith(
      2,
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: "/my/worktree/path" }
    );
  });
});

describe("getDefaultBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns branch from symbolic-ref when available", async () => {
    mockedExeca.mockResolvedValueOnce({
      ...mockExecaResult("refs/remotes/origin/development"),
      exitCode: 0,
    });

    const branch = await getDefaultBranch("/repo");

    expect(branch).toBe("development");
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      expect.objectContaining({ cwd: "/repo", reject: false })
    );
  });

  it("falls back to checking common branches", async () => {
    mockedExeca
      .mockResolvedValueOnce({ ...mockExecaResult(""), exitCode: 1 }) // symbolic-ref fails
      .mockResolvedValueOnce({ ...mockExecaResult(""), exitCode: 1 }) // main doesn't exist
      .mockResolvedValueOnce({ ...mockExecaResult(""), exitCode: 1 }) // master doesn't exist
      .mockResolvedValueOnce({ ...mockExecaResult("abc123"), exitCode: 0 }); // development exists

    const branch = await getDefaultBranch("/repo");

    expect(branch).toBe("development");
  });

  it("throws when no default branch can be determined", async () => {
    mockedExeca.mockResolvedValue({ ...mockExecaResult(""), exitCode: 1 });

    await expect(getDefaultBranch("/repo")).rejects.toThrow("Could not determine default branch");
  });

  it("works without repoPath (uses current directory)", async () => {
    mockedExeca.mockResolvedValueOnce({
      ...mockExecaResult("refs/remotes/origin/main"),
      exitCode: 0,
    });

    const branch = await getDefaultBranch();

    expect(branch).toBe("main");
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      expect.objectContaining({ reject: false })
    );
  });
});

describe("usesGitCrypt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-crypt-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when .git-crypt directory exists", async () => {
    await fs.mkdir(path.join(tempDir, ".git-crypt"));

    const result = await usesGitCrypt(tempDir);

    expect(result).toBe(true);
  });

  it("returns false when .git-crypt directory does not exist", async () => {
    const result = await usesGitCrypt(tempDir);

    expect(result).toBe(false);
  });
});

describe("createWorktreeWithGitCrypt", () => {
  let tempDir: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-crypt-worktree-test-"));
    repoPath = path.join(tempDir, "repo");
    await fs.mkdir(repoPath);
    await fs.mkdir(path.join(repoPath, ".git"));
    await fs.mkdir(path.join(repoPath, ".git", "git-crypt"));
    await fs.mkdir(path.join(repoPath, ".git", "worktrees"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates worktree with --no-checkout and symlinks git-crypt", async () => {
    const worktreePath = path.join(tempDir, "repo-42-feature");
    const worktreeName = "repo-42-feature";

    // Create the worktree git directory that git worktree add would create
    await fs.mkdir(path.join(repoPath, ".git", "worktrees", worktreeName), { recursive: true });

    mockedExeca
      .mockResolvedValueOnce(mockExecaResult("")) // worktree add --no-checkout
      .mockResolvedValueOnce(mockExecaResult("")); // checkout

    await createWorktreeWithGitCrypt({
      branch: "42-feature",
      worktreePath,
      baseBranch: "main",
      repoPath,
    });

    // Verify worktree add was called with --no-checkout
    expect(mockedExeca).toHaveBeenNthCalledWith(
      1,
      "git",
      ["worktree", "add", "--no-checkout", "-b", "42-feature", worktreePath, "main"],
      { cwd: repoPath }
    );

    // Verify checkout was called
    expect(mockedExeca).toHaveBeenNthCalledWith(2, "git", ["checkout", "HEAD", "."], {
      cwd: worktreePath,
    });

    // Verify symlink was created
    const symlinkPath = path.join(repoPath, ".git", "worktrees", worktreeName, "git-crypt");
    const symlinkTarget = await fs.readlink(symlinkPath);
    expect(symlinkTarget).toBe("../../git-crypt");
  });
});

describe("createWorktree with git-crypt support", () => {
  let tempDir: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worktree-gitcrypt-test-"));
    repoPath = path.join(tempDir, "repo");
    await fs.mkdir(repoPath);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("auto-detects default branch when not specified", async () => {
    mockedExeca
      .mockResolvedValueOnce({ ...mockExecaResult("refs/remotes/origin/development"), exitCode: 0 }) // getDefaultBranch
      .mockResolvedValueOnce(mockExecaResult("")) // fetch
      .mockResolvedValueOnce(mockExecaResult("")); // worktree add

    await createWorktree({
      branch: "42-feature",
      worktreePath: "/path/to/worktree",
      repoPath,
    });

    // Verify fetch was called with auto-detected branch
    expect(mockedExeca).toHaveBeenNthCalledWith(
      2,
      "git",
      ["fetch", "origin", "development:development"],
      expect.objectContaining({ cwd: repoPath, reject: false })
    );

    // Verify worktree add was called with auto-detected branch
    expect(mockedExeca).toHaveBeenNthCalledWith(
      3,
      "git",
      ["worktree", "add", "-b", "42-feature", "/path/to/worktree", "development"],
      expect.objectContaining({ cwd: repoPath })
    );
  });

  it("uses git-crypt workflow when .git-crypt exists", async () => {
    // Setup git-crypt directories
    await fs.mkdir(path.join(repoPath, ".git"));
    await fs.mkdir(path.join(repoPath, ".git-crypt"));
    await fs.mkdir(path.join(repoPath, ".git", "git-crypt"));
    await fs.mkdir(path.join(repoPath, ".git", "worktrees"));
    await fs.mkdir(path.join(repoPath, ".git", "worktrees", "worktree"), { recursive: true });

    mockedExeca
      .mockResolvedValueOnce({ ...mockExecaResult("refs/remotes/origin/main"), exitCode: 0 }) // getDefaultBranch
      .mockResolvedValueOnce(mockExecaResult("")) // fetch
      .mockResolvedValueOnce(mockExecaResult("")) // worktree add --no-checkout
      .mockResolvedValueOnce(mockExecaResult("")); // checkout

    const worktreePath = path.join(tempDir, "worktree");

    await createWorktree({
      branch: "42-feature",
      worktreePath,
      repoPath,
    });

    // Verify --no-checkout was used (git-crypt flow)
    expect(mockedExeca).toHaveBeenNthCalledWith(
      3,
      "git",
      ["worktree", "add", "--no-checkout", "-b", "42-feature", worktreePath, "main"],
      expect.objectContaining({ cwd: repoPath })
    );
  });

  it("throws error when base branch not found", async () => {
    // When baseBranch is explicitly provided, getDefaultBranch is NOT called
    mockedExeca
      .mockResolvedValueOnce({ ...mockExecaResult(""), exitCode: 1 }) // fetch fails
      .mockResolvedValueOnce({ ...mockExecaResult(""), exitCode: 1 }); // local check fails

    await expect(
      createWorktree({
        branch: "42-feature",
        worktreePath: "/path/to/worktree",
        baseBranch: "nonexistent",
        repoPath,
      })
    ).rejects.toThrow("Base branch 'nonexistent' not found locally or on remote");
  });
});
