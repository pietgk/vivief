/**
 * Tests for git.ts
 *
 * Tests the git repository ID detection utilities.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  detectRepoId,
  detectRepoIdFromGit,
  detectRepoIdFromPackageJson,
  getRepoIdSync,
  parseGitConfigForOrigin,
  parseGitUrl,
} from "../../src/utils/git.js";

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

async function createTestDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "git-test-"));
}

async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function createGitConfig(repoPath: string, configContent: string): Promise<void> {
  const gitDir = path.join(repoPath, ".git");
  await fs.mkdir(gitDir, { recursive: true });
  await fs.writeFile(path.join(gitDir, "config"), configContent);
}

async function createWorktree(repoPath: string, mainGitDir: string): Promise<void> {
  await fs.mkdir(repoPath, { recursive: true });
  // Create .git file pointing to worktree dir
  await fs.writeFile(path.join(repoPath, ".git"), `gitdir: ${mainGitDir}`);
}

// =============================================================================
// parseGitUrl Tests
// =============================================================================

describe("parseGitUrl", () => {
  test("parses SSH URL with .git suffix", () => {
    const url = "git@github.com:org/repo.git";
    const result = parseGitUrl(url);
    expect(result).toBe("github.com/org/repo");
  });

  test("parses SSH URL without .git suffix", () => {
    const url = "git@github.com:org/repo";
    const result = parseGitUrl(url);
    expect(result).toBe("github.com/org/repo");
  });

  test("parses HTTPS URL with .git suffix", () => {
    const url = "https://github.com/org/repo.git";
    const result = parseGitUrl(url);
    expect(result).toBe("github.com/org/repo");
  });

  test("parses HTTPS URL without .git suffix", () => {
    const url = "https://github.com/org/repo";
    const result = parseGitUrl(url);
    expect(result).toBe("github.com/org/repo");
  });

  test("parses HTTP URL", () => {
    const url = "http://gitlab.com/group/project.git";
    const result = parseGitUrl(url);
    expect(result).toBe("gitlab.com/group/project");
  });

  test("parses nested paths", () => {
    const url = "git@github.com:org/nested/repo.git";
    const result = parseGitUrl(url);
    expect(result).toBe("github.com/org/nested/repo");
  });

  test("parses GitLab SSH URL", () => {
    const url = "git@gitlab.com:team/project.git";
    const result = parseGitUrl(url);
    expect(result).toBe("gitlab.com/team/project");
  });

  test("parses Bitbucket SSH URL", () => {
    const url = "git@bitbucket.org:company/repo.git";
    const result = parseGitUrl(url);
    expect(result).toBe("bitbucket.org/company/repo");
  });

  test("returns original URL if cannot parse", () => {
    const url = "some-weird-format";
    const result = parseGitUrl(url);
    expect(result).toBe("some-weird-format");
  });

  test("handles enterprise GitHub URLs", () => {
    const url = "git@github.company.com:org/repo.git";
    const result = parseGitUrl(url);
    expect(result).toBe("github.company.com/org/repo");
  });
});

// =============================================================================
// parseGitConfigForOrigin Tests
// =============================================================================

describe("parseGitConfigForOrigin", () => {
  test("extracts origin URL from standard config", () => {
    const config = `
[core]
	repositoryformatversion = 0
	filemode = true
[remote "origin"]
	url = git@github.com:org/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main
`;
    const result = parseGitConfigForOrigin(config);
    expect(result).toBe("github.com/org/repo");
  });

  test("extracts HTTPS origin URL", () => {
    const config = `
[remote "origin"]
	url = https://github.com/org/repo.git
`;
    const result = parseGitConfigForOrigin(config);
    expect(result).toBe("github.com/org/repo");
  });

  test("returns null when no origin remote", () => {
    const config = `
[core]
	repositoryformatversion = 0
[remote "upstream"]
	url = git@github.com:other/repo.git
`;
    const result = parseGitConfigForOrigin(config);
    expect(result).toBeNull();
  });

  test("returns null for empty config", () => {
    const result = parseGitConfigForOrigin("");
    expect(result).toBeNull();
  });

  test("handles tabs and spaces in config", () => {
    const config = `[remote "origin"]
\turl = git@github.com:org/repo.git`;
    const result = parseGitConfigForOrigin(config);
    expect(result).toBe("github.com/org/repo");
  });

  test("handles URL with equals sign", () => {
    const config = `[remote "origin"]
	url=git@github.com:org/repo.git`;
    const result = parseGitConfigForOrigin(config);
    expect(result).toBe("github.com/org/repo");
  });
});

// =============================================================================
// detectRepoIdFromGit Tests
// =============================================================================

describe("detectRepoIdFromGit", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("detects repo ID from regular git repo", async () => {
    const repoPath = path.join(testDir, "repo");
    await createGitConfig(repoPath, `[remote "origin"]\n\turl = git@github.com:org/myrepo.git`);

    const result = await detectRepoIdFromGit(repoPath);

    expect(result).toBe("github.com/org/myrepo");
  });

  test("returns null when no .git directory", async () => {
    const repoPath = path.join(testDir, "no-git");
    await fs.mkdir(repoPath, { recursive: true });

    const result = await detectRepoIdFromGit(repoPath);

    expect(result).toBeNull();
  });

  test("returns null when no origin remote", async () => {
    const repoPath = path.join(testDir, "no-origin");
    await createGitConfig(repoPath, "[core]\n\tbare = false");

    const result = await detectRepoIdFromGit(repoPath);

    expect(result).toBeNull();
  });

  test("handles worktree with absolute path", async () => {
    // Create main repo with .git directory
    const mainRepo = path.join(testDir, "main-repo");
    await createGitConfig(mainRepo, `[remote "origin"]\n\turl = git@github.com:org/main.git`);

    // Create worktrees directory structure
    const worktreeDir = path.join(mainRepo, ".git", "worktrees", "feature");
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(path.join(worktreeDir, "gitdir"), "/some/path");

    // Create the worktree
    const worktreePath = path.join(testDir, "worktree");
    await createWorktree(worktreePath, worktreeDir);

    const result = await detectRepoIdFromGit(worktreePath);

    expect(result).toBe("github.com/org/main");
  });

  test("handles worktree with relative path", async () => {
    // Create main repo
    const mainRepo = path.join(testDir, "main-repo");
    await createGitConfig(
      mainRepo,
      `[remote "origin"]\n\turl = https://github.com/org/relative.git`
    );

    // Create worktrees directory
    const worktreeDir = path.join(mainRepo, ".git", "worktrees", "branch");
    await fs.mkdir(worktreeDir, { recursive: true });

    // Create worktree with relative path to worktrees dir
    const worktreePath = path.join(testDir, "feature-branch");
    await fs.mkdir(worktreePath, { recursive: true });
    // Relative path from worktree to the worktrees/<name> directory
    const relativePath = path.relative(worktreePath, worktreeDir);
    await fs.writeFile(path.join(worktreePath, ".git"), `gitdir: ${relativePath}`);

    const result = await detectRepoIdFromGit(worktreePath);

    expect(result).toBe("github.com/org/relative");
  });
});

// =============================================================================
// detectRepoIdFromPackageJson Tests
// =============================================================================

describe("detectRepoIdFromPackageJson", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("detects repo ID from package.json name", async () => {
    const repoPath = path.join(testDir, "npm-package");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "my-package" }));

    const result = await detectRepoIdFromPackageJson(repoPath);

    expect(result).toBe("package/my-package");
  });

  test("removes scope from scoped package name", async () => {
    const repoPath = path.join(testDir, "scoped-package");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name: "@myorg/my-package" })
    );

    const result = await detectRepoIdFromPackageJson(repoPath);

    expect(result).toBe("package/my-package");
  });

  test("returns null when no package.json", async () => {
    const repoPath = path.join(testDir, "no-package");
    await fs.mkdir(repoPath, { recursive: true });

    const result = await detectRepoIdFromPackageJson(repoPath);

    expect(result).toBeNull();
  });

  test("returns null when package.json has no name", async () => {
    const repoPath = path.join(testDir, "no-name");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ version: "1.0.0" }));

    const result = await detectRepoIdFromPackageJson(repoPath);

    expect(result).toBeNull();
  });

  test("returns null when name is not a string", async () => {
    const repoPath = path.join(testDir, "invalid-name");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: 123 }));

    const result = await detectRepoIdFromPackageJson(repoPath);

    expect(result).toBeNull();
  });

  test("returns null for invalid JSON", async () => {
    const repoPath = path.join(testDir, "invalid-json");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "package.json"), "not valid json");

    const result = await detectRepoIdFromPackageJson(repoPath);

    expect(result).toBeNull();
  });
});

// =============================================================================
// detectRepoId Tests
// =============================================================================

describe("detectRepoId", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("prefers git source over package.json", async () => {
    const repoPath = path.join(testDir, "both-sources");
    await createGitConfig(repoPath, `[remote "origin"]\n\turl = git@github.com:org/git-repo.git`);
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name: "package-name" })
    );

    const result = await detectRepoId(repoPath);

    expect(result.repoId).toBe("github.com/org/git-repo");
    expect(result.source).toBe("git");
  });

  test("falls back to package.json when no git", async () => {
    const repoPath = path.join(testDir, "package-only");
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "my-lib" }));

    const result = await detectRepoId(repoPath);

    expect(result.repoId).toBe("package/my-lib");
    expect(result.source).toBe("package");
  });

  test("falls back to directory name when no git or package.json", async () => {
    const repoPath = path.join(testDir, "my-directory");
    await fs.mkdir(repoPath, { recursive: true });

    const result = await detectRepoId(repoPath);

    expect(result.repoId).toBe("local/my-directory");
    expect(result.source).toBe("directory");
  });

  test("handles nested directory paths", async () => {
    const repoPath = path.join(testDir, "deeply", "nested", "repo");
    await fs.mkdir(repoPath, { recursive: true });

    const result = await detectRepoId(repoPath);

    expect(result.repoId).toBe("local/repo");
    expect(result.source).toBe("directory");
  });
});

// =============================================================================
// getRepoIdSync Tests
// =============================================================================

describe("getRepoIdSync", () => {
  test("returns detected repo ID when provided", () => {
    const result = getRepoIdSync("github.com/org/repo", "/some/path");

    expect(result).toBe("github.com/org/repo");
  });

  test("returns fallback when detected is undefined", () => {
    const result = getRepoIdSync(undefined, "/path/to/my-repo");

    expect(result).toBe("local/my-repo");
  });

  test("returns fallback when detected is empty string", () => {
    const result = getRepoIdSync("", "/path/to/fallback");

    // Empty string is falsy, so it uses fallback
    expect(result).toBe("local/fallback");
  });

  test("handles relative paths", () => {
    const result = getRepoIdSync(undefined, "./relative/path/repo");

    expect(result).toBe("local/repo");
  });

  test("handles paths with trailing slash", () => {
    const result = getRepoIdSync(undefined, "/path/to/repo/");

    // path.basename handles trailing slashes
    expect(result).toContain("local/");
  });
});
