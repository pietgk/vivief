/**
 * Tests for Hub Writer
 *
 * Tests the detectRepoId and internal helper functions.
 * The pushResultsToHub function requires a real DevAC hub and is tested via integration tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectRepoId } from "../../src/commands/scan-storybook/hub-writer.js";

// Mock child_process for git commands
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

describe("hub-writer", () => {
  describe("detectRepoId", () => {
    let mockExec: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const cp = await import("node:child_process");
      mockExec = vi.mocked(cp.exec);
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it("should parse HTTPS GitHub URL", async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          callback?: (error: Error | null, result: { stdout: string }) => void
        ) => {
          if (callback) {
            callback(null, { stdout: "https://github.com/org/repo.git\n" });
          }
          return {} as ReturnType<typeof mockExec>;
        }
      );

      const result = await detectRepoId();

      expect(result).toBe("github.com/org/repo");
    });

    it("should parse HTTPS GitHub URL without .git suffix", async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          callback?: (error: Error | null, result: { stdout: string }) => void
        ) => {
          if (callback) {
            callback(null, { stdout: "https://github.com/org/repo\n" });
          }
          return {} as ReturnType<typeof mockExec>;
        }
      );

      const result = await detectRepoId();

      expect(result).toBe("github.com/org/repo");
    });

    it("should parse SSH GitHub URL", async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          callback?: (error: Error | null, result: { stdout: string }) => void
        ) => {
          if (callback) {
            callback(null, { stdout: "git@github.com:org/repo.git\n" });
          }
          return {} as ReturnType<typeof mockExec>;
        }
      );

      const result = await detectRepoId();

      expect(result).toBe("github.com/org/repo");
    });

    it("should return null when git command fails", async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          callback?: (error: Error | null, result: { stdout: string }) => void
        ) => {
          if (callback) {
            callback(new Error("Not a git repository"), { stdout: "" });
          }
          return {} as ReturnType<typeof mockExec>;
        }
      );

      const result = await detectRepoId();

      expect(result).toBeNull();
    });

    it("should return null when remote URL does not match expected format", async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          callback?: (error: Error | null, result: { stdout: string }) => void
        ) => {
          if (callback) {
            callback(null, { stdout: "invalid-url\n" });
          }
          return {} as ReturnType<typeof mockExec>;
        }
      );

      const result = await detectRepoId();

      expect(result).toBeNull();
    });

    it("should handle generic git URL format", async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          _opts: unknown,
          callback?: (error: Error | null, result: { stdout: string }) => void
        ) => {
          if (callback) {
            callback(null, { stdout: "https://gitlab.com/org/repo.git\n" });
          }
          return {} as ReturnType<typeof mockExec>;
        }
      );

      const result = await detectRepoId();

      // Falls back to generic parsing
      expect(result).toBe("org/repo");
    });
  });
});
