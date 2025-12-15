/**
 * MCP CLI Command Tests for DevAC v2.0 Phase 5
 *
 * Following TDD approach - tests written first, then implementation.
 * Based on Phase 5 plan.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type MCPCommandOptions, mcpCommand } from "../src/commands/mcp.js";

describe("CLI: mcp command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-mcp-test-"));

    // Create a minimal package structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "src", "index.ts"),
      `export function main(): void {
  console.log("hello");
}
`
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validation", () => {
    it("validates package path exists", async () => {
      const options: MCPCommandOptions = {
        packagePath: "/nonexistent/path",
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("accepts valid package path", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(result.success).toBe(true);

      // Clean up - stop if controller exists
      if (result.controller) {
        await result.controller.stop();
      }
    });
  });

  describe("start action", () => {
    it("starts MCP server", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(result.success).toBe(true);
      expect(result.controller).toBeDefined();
      expect(result.controller?.isRunning()).toBe(true);

      await result.controller?.stop();
    });

    it("returns controller for managing server", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(result.controller).toBeDefined();
      expect(typeof result.controller?.stop).toBe("function");
      expect(typeof result.controller?.isRunning).toBe("function");
      expect(typeof result.controller?.getTools).toBe("function");

      await result.controller?.stop();
    });

    it("provides list of available tools", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(result.controller).toBeDefined();
      const tools = result.controller?.getTools() ?? [];
      expect(Array.isArray(tools)).toBe(true);

      await result.controller?.stop();
    });
  });

  describe("stop action", () => {
    it("stops running MCP server", async () => {
      // First start
      const startResult = await mcpCommand({
        packagePath: tempDir,
        action: "start",
      });

      expect(startResult.controller?.isRunning()).toBe(true);

      // Then stop via controller
      await startResult.controller?.stop();

      expect(startResult.controller?.isRunning()).toBe(false);
    });
  });

  describe("server options", () => {
    it("accepts transport option (stdio)", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
        transport: "stdio",
      };

      const result = await mcpCommand(options);

      expect(result.success).toBe(true);

      await result.controller?.stop();
    });

    it("uses stdio transport by default", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(result.success).toBe(true);

      await result.controller?.stop();
    });
  });

  describe("tool availability", () => {
    it("exposes find_symbol tool", async () => {
      const result = await mcpCommand({
        packagePath: tempDir,
        action: "start",
      });

      const tools = result.controller?.getTools() ?? [];
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("find_symbol");

      await result.controller?.stop();
    });

    it("exposes get_dependencies tool", async () => {
      const result = await mcpCommand({
        packagePath: tempDir,
        action: "start",
      });

      const tools = result.controller?.getTools() ?? [];
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_dependencies");

      await result.controller?.stop();
    });

    it("exposes get_dependents tool", async () => {
      const result = await mcpCommand({
        packagePath: tempDir,
        action: "start",
      });

      const tools = result.controller?.getTools() ?? [];
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_dependents");

      await result.controller?.stop();
    });

    it("exposes get_affected tool", async () => {
      const result = await mcpCommand({
        packagePath: tempDir,
        action: "start",
      });

      const tools = result.controller?.getTools() ?? [];
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("get_affected");

      await result.controller?.stop();
    });

    it("exposes query_sql tool", async () => {
      const result = await mcpCommand({
        packagePath: tempDir,
        action: "start",
      });

      const tools = result.controller?.getTools() ?? [];
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("query_sql");

      await result.controller?.stop();
    });
  });

  describe("error handling", () => {
    it("handles start errors gracefully", async () => {
      // Create a directory that will cause issues
      const badPath = path.join(tempDir, "bad");
      await fs.mkdir(badPath);

      const options: MCPCommandOptions = {
        packagePath: badPath,
        action: "start",
      };

      const result = await mcpCommand(options);

      // Should still succeed (empty package is valid)
      expect(result).toBeDefined();

      if (result.controller) {
        await result.controller.stop();
      }
    });
  });

  describe("result structure", () => {
    it("returns success status", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(typeof result.success).toBe("boolean");

      await result.controller?.stop();
    });

    it("returns tool count", async () => {
      const options: MCPCommandOptions = {
        packagePath: tempDir,
        action: "start",
      };

      const result = await mcpCommand(options);

      expect(typeof result.toolCount).toBe("number");
      expect(result.toolCount).toBeGreaterThan(0);

      await result.controller?.stop();
    });
  });
});
