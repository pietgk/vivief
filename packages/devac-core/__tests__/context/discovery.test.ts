import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverContext,
  extractIssueNumber,
  extractRepoName,
  formatContext,
  hasDevacSeeds,
  isGitRepo,
  isGitWorktree,
  parseWorktreeName,
} from "../../src/context/discovery.js";

describe("parseWorktreeName", () => {
  it("should parse valid worktree names", () => {
    expect(parseWorktreeName("vivief-123-auth")).toEqual({
      repoName: "vivief",
      issueNumber: 123,
      slug: "auth",
    });

    expect(parseWorktreeName("my-app-45-fix-bug")).toEqual({
      repoName: "my-app",
      issueNumber: 45,
      slug: "fix-bug",
    });

    expect(parseWorktreeName("repo-1-a")).toEqual({
      repoName: "repo",
      issueNumber: 1,
      slug: "a",
    });
  });

  it("should return null for non-worktree names", () => {
    expect(parseWorktreeName("vivief")).toBeNull();
    expect(parseWorktreeName("my-app")).toBeNull();
    expect(parseWorktreeName("123")).toBeNull();
    expect(parseWorktreeName("")).toBeNull();
    expect(parseWorktreeName("vivief-abc-auth")).toBeNull(); // issue not a number
    expect(parseWorktreeName("vivief-123")).toBeNull(); // no slug
  });
});

describe("extractIssueNumber", () => {
  it("should extract issue number from worktree names", () => {
    expect(extractIssueNumber("vivief-123-auth")).toBe(123);
    expect(extractIssueNumber("my-app-45-fix-bug")).toBe(45);
  });

  it("should return null for non-worktree names", () => {
    expect(extractIssueNumber("vivief")).toBeNull();
    expect(extractIssueNumber("my-app")).toBeNull();
  });
});

describe("extractRepoName", () => {
  it("should extract repo name from worktree names", () => {
    expect(extractRepoName("vivief-123-auth")).toBe("vivief");
    expect(extractRepoName("my-app-45-fix-bug")).toBe("my-app");
  });

  it("should return original name for non-worktree names", () => {
    expect(extractRepoName("vivief")).toBe("vivief");
    expect(extractRepoName("my-app")).toBe("my-app");
  });
});

describe("isGitRepo", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-context-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true for directories with .git directory", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });

    expect(await isGitRepo(repoDir)).toBe(true);
  });

  it("should return true for directories with .git file (worktree)", async () => {
    const worktreeDir = path.join(tempDir, "worktree");
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(path.join(worktreeDir, ".git"), "gitdir: ../repo/.git/worktrees/worktree");

    expect(await isGitRepo(worktreeDir)).toBe(true);
  });

  it("should return false for directories without .git", async () => {
    const nonRepoDir = path.join(tempDir, "not-a-repo");
    await fs.mkdir(nonRepoDir, { recursive: true });

    expect(await isGitRepo(nonRepoDir)).toBe(false);
  });
});

describe("isGitWorktree", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-context-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true for directories with .git file", async () => {
    const worktreeDir = path.join(tempDir, "worktree");
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(path.join(worktreeDir, ".git"), "gitdir: ../repo/.git/worktrees/worktree");

    expect(await isGitWorktree(worktreeDir)).toBe(true);
  });

  it("should return false for directories with .git directory", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });

    expect(await isGitWorktree(repoDir)).toBe(false);
  });
});

describe("hasDevacSeeds", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-context-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true for directories with .devac/seed/", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".devac", "seed"), { recursive: true });

    expect(await hasDevacSeeds(repoDir)).toBe(true);
  });

  it("should return false for directories without .devac/seed/", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });

    expect(await hasDevacSeeds(repoDir)).toBe(false);
  });
});

describe("discoverContext", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-context-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should discover sibling repos", async () => {
    // Create two sibling repos
    const repo1 = path.join(tempDir, "repo1");
    const repo2 = path.join(tempDir, "repo2");
    await fs.mkdir(path.join(repo1, ".git"), { recursive: true });
    await fs.mkdir(path.join(repo2, ".git"), { recursive: true });

    const context = await discoverContext(repo1);

    expect(context.currentDir).toBe(repo1);
    expect(context.parentDir).toBe(tempDir);
    expect(context.repos).toHaveLength(2);
    expect(context.repos.map((r) => r.name).sort()).toEqual(["repo1", "repo2"]);
    expect(context.issueNumber).toBeUndefined();
  });

  it("should identify issue worktrees", async () => {
    // Create main repo and issue worktree
    const mainRepo = path.join(tempDir, "vivief");
    const worktree = path.join(tempDir, "vivief-123-auth");

    await fs.mkdir(path.join(mainRepo, ".git"), { recursive: true });
    await fs.mkdir(worktree, { recursive: true });
    await fs.writeFile(path.join(worktree, ".git"), "gitdir: ../vivief/.git/worktrees/123-auth");

    const context = await discoverContext(worktree);

    expect(context.issueNumber).toBe(123);
    expect(context.worktrees).toHaveLength(1);
    const worktreeInfo = context.worktrees?.[0];
    expect(worktreeInfo?.name).toBe("vivief-123-auth");
    expect(worktreeInfo?.mainRepoName).toBe("vivief");
    expect(context.mainRepos).toHaveLength(1);
    expect(context.mainRepos?.[0]?.name).toBe("vivief");
  });

  it("should group worktrees for the same issue across repos", async () => {
    // Create two main repos and worktrees for the same issue
    const repo1 = path.join(tempDir, "api");
    const repo2 = path.join(tempDir, "web");
    const worktree1 = path.join(tempDir, "api-123-auth");
    const worktree2 = path.join(tempDir, "web-123-auth");

    await fs.mkdir(path.join(repo1, ".git"), { recursive: true });
    await fs.mkdir(path.join(repo2, ".git"), { recursive: true });
    await fs.mkdir(worktree1, { recursive: true });
    await fs.mkdir(worktree2, { recursive: true });
    await fs.writeFile(path.join(worktree1, ".git"), "gitdir: ../api/.git/worktrees/123-auth");
    await fs.writeFile(path.join(worktree2, ".git"), "gitdir: ../web/.git/worktrees/123-auth");

    const context = await discoverContext(worktree1);

    expect(context.issueNumber).toBe(123);
    expect(context.worktrees).toHaveLength(2);
    expect(context.worktrees?.map((w) => w.mainRepoName).sort()).toEqual(["api", "web"]);
    expect(context.mainRepos).toHaveLength(2);
    expect(context.mainRepos?.map((r) => r.name).sort()).toEqual(["api", "web"]);
  });

  it("should detect repos with seeds", async () => {
    const repoWithSeeds = path.join(tempDir, "with-seeds");
    const repoWithoutSeeds = path.join(tempDir, "without-seeds");

    await fs.mkdir(path.join(repoWithSeeds, ".git"), { recursive: true });
    await fs.mkdir(path.join(repoWithSeeds, ".devac", "seed"), { recursive: true });
    await fs.mkdir(path.join(repoWithoutSeeds, ".git"), { recursive: true });

    const context = await discoverContext(repoWithSeeds);

    const withSeeds = context.repos.find((r) => r.name === "with-seeds");
    const withoutSeeds = context.repos.find((r) => r.name === "without-seeds");

    expect(withSeeds?.hasSeeds).toBe(true);
    expect(withoutSeeds?.hasSeeds).toBe(false);
  });
});

describe("formatContext", () => {
  it("should format context for regular repo", () => {
    const context = {
      currentDir: "/tmp/repo1",
      parentDir: "/tmp",
      repos: [
        { path: "/tmp/repo1", name: "repo1", hasSeeds: true, isWorktree: false },
        { path: "/tmp/repo2", name: "repo2", hasSeeds: false, isWorktree: false },
      ],
    };

    const output = formatContext(context);
    expect(output).toContain("Context");
    expect(output).toContain("repo1");
    expect(output).toContain("repo2");
    expect(output).toContain("📦"); // seed icon
  });

  it("should format context for issue worktree", () => {
    const context = {
      currentDir: "/tmp/vivief-123-auth",
      parentDir: "/tmp",
      repos: [
        { path: "/tmp/vivief", name: "vivief", hasSeeds: true, isWorktree: false },
        {
          path: "/tmp/vivief-123-auth",
          name: "vivief-123-auth",
          hasSeeds: false,
          isWorktree: true,
          issueNumber: 123,
          slug: "auth",
        },
      ],
      issueNumber: 123,
      worktrees: [
        {
          path: "/tmp/vivief-123-auth",
          name: "vivief-123-auth",
          hasSeeds: false,
          isWorktree: true,
          issueNumber: 123,
          slug: "auth",
          mainRepoPath: "/tmp/vivief",
          mainRepoName: "vivief",
          branch: "123-auth",
        },
      ],
      mainRepos: [{ path: "/tmp/vivief", name: "vivief", hasSeeds: true, isWorktree: false }],
    };

    const output = formatContext(context);
    expect(output).toContain("Issue #123");
    expect(output).toContain("Worktrees");
    expect(output).toContain("vivief-123-auth");
    expect(output).toContain("Main Repos");
    expect(output).toContain("vivief");
  });
});
