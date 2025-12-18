/**
 * Dependency management module tests
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
import { detectPackageManager, installDependencies } from "../src/deps.js";

const mockedExeca = vi.mocked(execa);

// Helper to create typed mock results for execa
function mockExecaResult(stdout: string) {
  return { stdout, stderr: "", exitCode: 0 } as Awaited<ReturnType<typeof execa>>;
}

describe("detectPackageManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-worktree-deps-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");

    const pm = await detectPackageManager(tempDir);

    expect(pm).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", async () => {
    await fs.writeFile(path.join(tempDir, "yarn.lock"), "");

    const pm = await detectPackageManager(tempDir);

    expect(pm).toBe("yarn");
  });

  it("detects npm from package-lock.json", async () => {
    await fs.writeFile(path.join(tempDir, "package-lock.json"), "{}");

    const pm = await detectPackageManager(tempDir);

    expect(pm).toBe("npm");
  });

  it("defaults to pnpm when no lockfile found", async () => {
    const pm = await detectPackageManager(tempDir);

    expect(pm).toBe("pnpm");
  });

  it("prefers pnpm when multiple lockfiles exist", async () => {
    // pnpm takes priority
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");
    await fs.writeFile(path.join(tempDir, "yarn.lock"), "");
    await fs.writeFile(path.join(tempDir, "package-lock.json"), "{}");

    const pm = await detectPackageManager(tempDir);

    expect(pm).toBe("pnpm");
  });
});

describe("installDependencies", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-worktree-install-test-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("runs pnpm install for pnpm projects", async () => {
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    const result = await installDependencies(tempDir);

    expect(mockedExeca).toHaveBeenCalledWith("pnpm", ["install"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    expect(result).toEqual({ success: true, manager: "pnpm" });
  });

  it("runs yarn install for yarn projects", async () => {
    await fs.writeFile(path.join(tempDir, "yarn.lock"), "");
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    const result = await installDependencies(tempDir);

    expect(mockedExeca).toHaveBeenCalledWith("yarn", ["install"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    expect(result).toEqual({ success: true, manager: "yarn" });
  });

  it("runs npm install for npm projects", async () => {
    await fs.writeFile(path.join(tempDir, "package-lock.json"), "{}");
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    const result = await installDependencies(tempDir);

    expect(mockedExeca).toHaveBeenCalledWith("npm", ["install"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    expect(result).toEqual({ success: true, manager: "npm" });
  });

  it("uses inherit stdio when verbose", async () => {
    mockedExeca.mockResolvedValueOnce(mockExecaResult(""));

    await installDependencies(tempDir, { verbose: true });

    expect(mockedExeca).toHaveBeenCalledWith(
      expect.any(String),
      ["install"],
      expect.objectContaining({ stdio: "inherit" })
    );
  });

  it("returns error on failure", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("Install failed"));

    const result = await installDependencies(tempDir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Install failed");
  });
});
