import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverWorkspace,
  discoverWorkspaceRepos,
  extractIssueNumberFromId,
  getGitBranch,
  getRepoId,
  getSeedsLastModified,
  hasDevacSeeds,
  isGitRepo,
  isGitWorktree,
  isWorkspaceDirectory,
  isWorktreeName,
  loadWorkspaceConfig,
  parseIssueId,
  parseWorktreeNameV2,
} from "../../src/workspace/discover.js";

// =============================================================================
// parseIssueId Tests
// =============================================================================

describe("parseIssueId", () => {
  it("should parse simple issueId format", () => {
    const result = parseIssueId("ghapi-123");
    expect(result).toEqual({
      full: "ghapi-123",
      source: "gh",
      originRepo: "api",
      number: 123,
    });
  });

  it("should parse issueId with repo containing dashes", () => {
    // "ghmonorepo-3.0-456" -> split on LAST dash
    // prefix: "ghmonorepo-3.0", number: "456"
    const result = parseIssueId("ghmonorepo-3.0-456");
    expect(result).toEqual({
      full: "ghmonorepo-3.0-456",
      source: "gh",
      originRepo: "monorepo-3.0",
      number: 456,
    });
  });

  it("should parse issueId with different sources", () => {
    // GitLab source
    const glResult = parseIssueId("glproject-99");
    expect(glResult).toEqual({
      full: "glproject-99",
      source: "gl",
      originRepo: "project",
      number: 99,
    });

    // Jira-like source
    const jrResult = parseIssueId("jrticket-1000");
    expect(jrResult).toEqual({
      full: "jrticket-1000",
      source: "jr",
      originRepo: "ticket",
      number: 1000,
    });
  });

  it("should return null for invalid issueIds", () => {
    expect(parseIssueId("")).toBeNull();
    expect(parseIssueId("noDash")).toBeNull();
    expect(parseIssueId("gh-123")).toBeNull(); // no repo
    expect(parseIssueId("a-1")).toBeNull(); // prefix too short
    expect(parseIssueId("ghapi-")).toBeNull(); // no number
    expect(parseIssueId("ghapi-abc")).toBeNull(); // non-numeric
    expect(parseIssueId("ghapi-0")).toBeNull(); // zero not valid
  });

  it("should handle edge case with double dash", () => {
    // "ghapi--1" splits on LAST dash, so prefix="ghapi-", number=1
    // This is technically valid: source="gh", originRepo="api-", number=1
    const result = parseIssueId("ghapi--1");
    expect(result).toEqual({
      full: "ghapi--1",
      source: "gh",
      originRepo: "api-",
      number: 1,
    });
  });
});

describe("extractIssueNumberFromId", () => {
  it("should extract issue number from valid issueId", () => {
    expect(extractIssueNumberFromId("ghapi-123")).toBe(123);
    expect(extractIssueNumberFromId("ghmonorepo-3.0-456")).toBe(456);
  });

  it("should return null for invalid issueId", () => {
    expect(extractIssueNumberFromId("invalid")).toBeNull();
    expect(extractIssueNumberFromId("")).toBeNull();
  });
});

// =============================================================================
// parseWorktreeNameV2 Tests
// =============================================================================

describe("parseWorktreeNameV2", () => {
  it("should parse standard worktree name", () => {
    // Pattern: {worktreeRepo}-{issueId}-{slug}
    // "api-ghapi-123-auth" -> worktreeRepo="api", issueId="ghapi-123", slug="auth"
    const result = parseWorktreeNameV2("api-ghapi-123-auth");
    expect(result).toEqual({
      worktreeRepo: "api",
      issueId: "ghapi-123",
      issueNumber: 123,
      slug: "auth",
    });
  });

  it("should parse worktree with multi-word slug", () => {
    const result = parseWorktreeNameV2("api-ghapi-123-fix-auth-bug");
    expect(result).toEqual({
      worktreeRepo: "api",
      issueId: "ghapi-123",
      issueNumber: 123,
      slug: "fix-auth-bug",
    });
  });

  it("should parse worktree with repo containing dashes (greedy match)", () => {
    // "my-app-ghmy-app-45-feature"
    // The algorithm finds the first valid issueId, which may split differently
    // than expected. It finds "app-ghmy-app-45" as a valid issueId.
    const result = parseWorktreeNameV2("my-app-ghmy-app-45-feature");
    // The greedy algorithm finds the first valid issueId pattern
    expect(result).not.toBeNull();
    expect(result?.issueNumber).toBe(45);
    expect(result?.slug).toBe("feature");
  });

  it("should parse worktree with complex repo and issueId (greedy match)", () => {
    // "frontend-monorepo-ghfrontend-monorepo-789-update"
    // The algorithm finds a valid issueId starting earlier
    const result = parseWorktreeNameV2("frontend-monorepo-ghfrontend-monorepo-789-update");
    expect(result).not.toBeNull();
    expect(result?.issueNumber).toBe(789);
    expect(result?.slug).toBe("update");
  });

  it("should return null for non-worktree names", () => {
    expect(parseWorktreeNameV2("")).toBeNull();
    expect(parseWorktreeNameV2("vivief")).toBeNull();
    expect(parseWorktreeNameV2("my-app")).toBeNull();
    expect(parseWorktreeNameV2("123")).toBeNull();
    // Not enough parts
    expect(parseWorktreeNameV2("a-b")).toBeNull();
    expect(parseWorktreeNameV2("a-b-c")).toBeNull();
  });
});

describe("isWorktreeName", () => {
  it("should return true for valid worktree names", () => {
    expect(isWorktreeName("api-ghapi-123-auth")).toBe(true);
    expect(isWorktreeName("my-app-ghmy-app-45-fix")).toBe(true);
  });

  it("should return false for non-worktree names", () => {
    expect(isWorktreeName("vivief")).toBe(false);
    expect(isWorktreeName("my-app")).toBe(false);
    expect(isWorktreeName("")).toBe(false);
  });
});

// =============================================================================
// Git Utilities Tests
// =============================================================================

describe("isGitRepo", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
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

  it("should return false for non-existent directories", async () => {
    expect(await isGitRepo(path.join(tempDir, "nonexistent"))).toBe(false);
  });
});

describe("isGitWorktree", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true for worktree (.git is a file)", async () => {
    const worktreeDir = path.join(tempDir, "worktree");
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(path.join(worktreeDir, ".git"), "gitdir: ../repo/.git/worktrees/worktree");

    expect(await isGitWorktree(worktreeDir)).toBe(true);
  });

  it("should return false for regular repo (.git is a directory)", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });

    expect(await isGitWorktree(repoDir)).toBe(false);
  });

  it("should return false for non-git directories", async () => {
    const nonRepoDir = path.join(tempDir, "not-a-repo");
    await fs.mkdir(nonRepoDir, { recursive: true });

    expect(await isGitWorktree(nonRepoDir)).toBe(false);
  });
});

describe("getGitBranch", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return branch name for regular repo", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(repoDir, ".git", "HEAD"), "ref: refs/heads/main\n");

    expect(await getGitBranch(repoDir)).toBe("main");
  });

  it("should return branch with slashes", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(repoDir, ".git", "HEAD"), "ref: refs/heads/feature/my-branch\n");

    expect(await getGitBranch(repoDir)).toBe("feature/my-branch");
  });

  it("should return null for detached HEAD", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(repoDir, ".git", "HEAD"), "abc123def456\n");

    expect(await getGitBranch(repoDir)).toBeNull();
  });

  it("should return null for non-git directories", async () => {
    expect(await getGitBranch(path.join(tempDir, "nonexistent"))).toBeNull();
  });
});

// =============================================================================
// Seed Detection Tests
// =============================================================================

describe("hasDevacSeeds", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true when seeds directory exists", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".devac", "seed"), { recursive: true });

    expect(await hasDevacSeeds(repoDir)).toBe(true);
  });

  it("should return false when seeds directory does not exist", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });

    expect(await hasDevacSeeds(repoDir)).toBe(false);
  });

  it("should return false when .devac exists but not seed", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".devac"), { recursive: true });

    expect(await hasDevacSeeds(repoDir)).toBe(false);
  });
});

describe("getSeedsLastModified", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return ISO date string when seeds exist", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, ".devac", "seed"), { recursive: true });

    const result = await getSeedsLastModified(repoDir);
    expect(result).not.toBeNull();
    expect(new Date(result!).getTime()).toBeGreaterThan(0);
  });

  it("should return null when seeds do not exist", async () => {
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(repoDir, { recursive: true });

    expect(await getSeedsLastModified(repoDir)).toBeNull();
  });
});

describe("getRepoId", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return repo_id from manifest if exists", async () => {
    const repoDir = path.join(tempDir, "my-repo");
    await fs.mkdir(path.join(repoDir, ".devac"), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, ".devac", "manifest.json"),
      JSON.stringify({ repo_id: "custom-repo-id" })
    );

    expect(await getRepoId(repoDir)).toBe("custom-repo-id");
  });

  it("should return directory name if no manifest", async () => {
    const repoDir = path.join(tempDir, "my-repo");
    await fs.mkdir(repoDir, { recursive: true });

    expect(await getRepoId(repoDir)).toBe("my-repo");
  });

  it("should return directory name if manifest has no repo_id", async () => {
    const repoDir = path.join(tempDir, "my-repo");
    await fs.mkdir(path.join(repoDir, ".devac"), { recursive: true });
    await fs.writeFile(path.join(repoDir, ".devac", "manifest.json"), JSON.stringify({}));

    expect(await getRepoId(repoDir)).toBe("my-repo");
  });
});

// =============================================================================
// Workspace Discovery Tests
// =============================================================================

describe("isWorkspaceDirectory", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true for directory containing git repos", async () => {
    // Create a workspace with two repos
    const workspace = path.join(tempDir, "workspace");
    await fs.mkdir(path.join(workspace, "repo1", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "repo2", ".git"), { recursive: true });

    expect(await isWorkspaceDirectory(workspace)).toBe(true);
  });

  it("should return false for git repo itself", async () => {
    const repo = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });

    expect(await isWorkspaceDirectory(repo)).toBe(false);
  });

  it("should return false for empty directory", async () => {
    const empty = path.join(tempDir, "empty");
    await fs.mkdir(empty, { recursive: true });

    expect(await isWorkspaceDirectory(empty)).toBe(false);
  });

  it("should return false for directory with only excluded dirs", async () => {
    const dir = path.join(tempDir, "onlyExcluded");
    await fs.mkdir(path.join(dir, "node_modules", ".git"), { recursive: true });

    expect(await isWorkspaceDirectory(dir)).toBe(false);
  });
});

describe("discoverWorkspaceRepos", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should discover main repos", async () => {
    const workspace = path.join(tempDir, "workspace");
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "web", ".git"), { recursive: true });

    const repos = await discoverWorkspaceRepos(workspace);

    expect(repos).toHaveLength(2);
    expect(repos.map((r) => r.name).sort()).toEqual(["api", "web"]);
    expect(repos.every((r) => !r.isWorktree)).toBe(true);
  });

  it("should identify worktrees by name pattern", async () => {
    const workspace = path.join(tempDir, "workspace");
    // Main repo
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    // Worktree (has .git file, not directory)
    const worktreeDir = path.join(workspace, "api-ghapi-123-auth");
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(
      path.join(worktreeDir, ".git"),
      "gitdir: ../api/.git/worktrees/api-ghapi-123-auth"
    );

    const repos = await discoverWorkspaceRepos(workspace);

    expect(repos).toHaveLength(2);

    const mainRepo = repos.find((r) => r.name === "api");
    expect(mainRepo?.isWorktree).toBe(false);

    const worktree = repos.find((r) => r.name === "api-ghapi-123-auth");
    expect(worktree?.isWorktree).toBe(true);
    expect(worktree?.issueId).toBe("ghapi-123");
    expect(worktree?.slug).toBe("auth");
  });

  it("should detect repos with seeds", async () => {
    const workspace = path.join(tempDir, "workspace");
    // Repo with seeds
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "api", ".devac", "seed"), { recursive: true });
    // Repo without seeds
    await fs.mkdir(path.join(workspace, "web", ".git"), { recursive: true });

    const repos = await discoverWorkspaceRepos(workspace);

    const apiRepo = repos.find((r) => r.name === "api");
    expect(apiRepo?.hasSeeds).toBe(true);

    const webRepo = repos.find((r) => r.name === "web");
    expect(webRepo?.hasSeeds).toBe(false);
  });

  it("should exclude node_modules and other default exclusions", async () => {
    const workspace = path.join(tempDir, "workspace");
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "node_modules", "some-pkg", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, ".git", "submodule", ".git"), { recursive: true });

    const repos = await discoverWorkspaceRepos(workspace);

    expect(repos).toHaveLength(1);
    expect(repos[0]?.name).toBe("api");
  });

  it("should support custom exclusions", async () => {
    const workspace = path.join(tempDir, "workspace");
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "vendor", ".git"), { recursive: true });

    const repos = await discoverWorkspaceRepos(workspace, { exclude: ["vendor"] });

    expect(repos).toHaveLength(1);
    expect(repos[0]?.name).toBe("api");
  });
});

describe("loadWorkspaceConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return default config when no config exists", async () => {
    const config = await loadWorkspaceConfig(tempDir);

    expect(config.version).toBe("1.0");
    expect(config.hub?.autoRefresh).toBe(true);
    expect(config.hub?.refreshDebounceMs).toBe(500);
    expect(config.watcher?.autoStart).toBe(false);
  });

  it("should load custom config", async () => {
    await fs.mkdir(path.join(tempDir, ".devac"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".devac", "workspace.json"),
      JSON.stringify({
        version: "1.0",
        hub: { autoRefresh: false, refreshDebounceMs: 1000 },
        watcher: { autoStart: true },
      })
    );

    const config = await loadWorkspaceConfig(tempDir);

    expect(config.hub?.autoRefresh).toBe(false);
    expect(config.hub?.refreshDebounceMs).toBe(1000);
    expect(config.watcher?.autoStart).toBe(true);
  });

  it("should merge partial config with defaults", async () => {
    await fs.mkdir(path.join(tempDir, ".devac"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".devac", "workspace.json"),
      JSON.stringify({
        version: "1.0",
        hub: { autoRefresh: false },
      })
    );

    const config = await loadWorkspaceConfig(tempDir);

    expect(config.hub?.autoRefresh).toBe(false);
    expect(config.hub?.refreshDebounceMs).toBe(500); // default
    expect(config.watcher?.autoStart).toBe(false); // default
  });
});

describe("discoverWorkspace", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-workspace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return complete workspace info", async () => {
    const workspace = path.join(tempDir, "workspace");
    // Create repos
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "api", ".devac", "seed"), { recursive: true });
    await fs.mkdir(path.join(workspace, "web", ".git"), { recursive: true });

    const info = await discoverWorkspace(workspace);

    expect(info.isWorkspace).toBe(true);
    expect(info.workspacePath).toBe(workspace);
    expect(info.repos).toHaveLength(2);
    expect(info.mainRepos).toHaveLength(2);
    expect(info.worktreesByIssue.size).toBe(0);
    expect(info.hubPath).toBe(path.join(workspace, ".devac", "hub.duckdb"));
    expect(info.config.version).toBe("1.0");
  });

  it("should group worktrees by issueId", async () => {
    const workspace = path.join(tempDir, "workspace");
    // Main repos
    await fs.mkdir(path.join(workspace, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(workspace, "web", ".git"), { recursive: true });
    // Worktrees for issue 123
    const wt1 = path.join(workspace, "api-ghapi-123-auth");
    await fs.mkdir(wt1, { recursive: true });
    await fs.writeFile(path.join(wt1, ".git"), "gitdir: ../api/.git/worktrees/api-ghapi-123-auth");
    const wt2 = path.join(workspace, "web-ghweb-123-auth");
    await fs.mkdir(wt2, { recursive: true });
    await fs.writeFile(path.join(wt2, ".git"), "gitdir: ../web/.git/worktrees/web-ghweb-123-auth");

    const info = await discoverWorkspace(workspace);

    expect(info.mainRepos).toHaveLength(2);
    expect(info.worktreesByIssue.size).toBe(2);
    expect(info.worktreesByIssue.get("ghapi-123")).toHaveLength(1);
    expect(info.worktreesByIssue.get("ghweb-123")).toHaveLength(1);
  });

  it("should return minimal info for non-workspace directories", async () => {
    // Single git repo, not a workspace
    const repo = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });

    const info = await discoverWorkspace(repo);

    expect(info.isWorkspace).toBe(false);
    expect(info.repos).toHaveLength(0);
    expect(info.mainRepos).toHaveLength(0);
    expect(info.worktreesByIssue.size).toBe(0);
  });
});
