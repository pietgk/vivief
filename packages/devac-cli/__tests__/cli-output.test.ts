/**
 * CLI Output Utility Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { displayCommandResult, error, success } from "../src/utils/cli-output.js";

describe("cli-output utilities", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("success()", () => {
    it("logs message with checkmark", () => {
      success("Operation completed");

      expect(consoleSpy).toHaveBeenCalledWith("✓ Operation completed");
    });
  });

  describe("error()", () => {
    it("logs error message with X mark", () => {
      error("Operation failed");

      expect(errorSpy).toHaveBeenCalledWith("✗ Operation failed");
    });

    it("logs error details when provided", () => {
      error("Operation failed", "Connection refused");

      expect(errorSpy).toHaveBeenCalledWith("✗ Operation failed");
      expect(errorSpy).toHaveBeenCalledWith("  Connection refused");
    });

    it("shows suggestion for 'not initialized' errors", () => {
      error("Hub error", "Hub is not initialized");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith("  Suggestion: Run 'devac workspace init' first");
    });

    it("shows suggestion for locked database errors", () => {
      error("Database error", "Conflicting lock on file");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Database locked by another process. The MCP server may be running."
      );
    });

    it("shows suggestion for 'locked' errors", () => {
      error("Database error", "Database is locked");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Database locked by another process. The MCP server may be running."
      );
    });

    it("shows suggestion for missing seed errors", () => {
      error("Seed error", "No .devac/seed directory found");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Run 'devac sync' in the repository first"
      );
    });

    it("shows suggestion for 'not in a workspace' errors", () => {
      error("Workspace error", "Not in a workspace directory");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Run this command from inside a workspace directory"
      );
    });

    it("shows suggestion for repository not found errors", () => {
      error("Registry error", "Repository not found in hub");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Check the repository ID with 'devac query repos'"
      );
    });

    it("shows suggestion for ENOENT errors", () => {
      error("File error", "ENOENT: no such file or directory");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Check that the specified path exists and is accessible"
      );
    });

    it("shows suggestion for 'does not exist' errors", () => {
      error("Path error", "The specified path does not exist");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith(
        "  Suggestion: Check that the specified path exists and is accessible"
      );
    });

    it("does not show suggestion for unknown errors", () => {
      error("Unknown error", "Something unexpected happened");

      // Only two calls: error message and details, no suggestion
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith("✗ Unknown error");
      expect(errorSpy).toHaveBeenCalledWith("  Something unexpected happened");
    });

    it("checks message text for suggestion when no details provided", () => {
      error("Hub is not initialized");

      expect(errorSpy).toHaveBeenCalledWith("");
      expect(errorSpy).toHaveBeenCalledWith("  Suggestion: Run 'devac workspace init' first");
    });
  });

  describe("displayCommandResult()", () => {
    it("logs success message for successful result", () => {
      displayCommandResult({
        success: true,
        message: "Operation completed successfully",
      });

      expect(consoleSpy).toHaveBeenCalledWith("Operation completed successfully");
      expect(process.exit).not.toHaveBeenCalled();
    });

    it("logs error and exits for failed result", () => {
      displayCommandResult({
        success: false,
        message: "Operation failed",
        error: "Connection refused",
      });

      expect(errorSpy).toHaveBeenCalledWith("✗ Operation failed");
      expect(errorSpy).toHaveBeenCalledWith("  Connection refused");
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it("handles failed result without error details", () => {
      displayCommandResult({
        success: false,
        message: "Operation failed",
      });

      expect(errorSpy).toHaveBeenCalledWith("✗ Operation failed");
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it("shows suggestions for failed results with known error patterns", () => {
      displayCommandResult({
        success: false,
        message: "Hub status failed",
        error: "Hub is not initialized",
      });

      expect(errorSpy).toHaveBeenCalledWith("  Suggestion: Run 'devac workspace init' first");
    });
  });
});
