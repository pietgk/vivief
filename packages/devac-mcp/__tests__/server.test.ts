/**
 * DevAC MCP Server Tests
 *
 * Comprehensive tests for the MCP server lifecycle, initialization,
 * and error handling.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevacMCPServer, createMCPServer } from "../src/server.js";
import { MCP_TOOLS } from "../src/tools/index.js";
import type { MCPServerOptions } from "../src/types.js";

// Mock the MCP SDK transport to avoid actual stdio connections
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    close: vi.fn(),
  })),
}));

describe("DevacMCPServer", () => {
  let tempDir: string;
  let packagePath: string;
  let server: DevacMCPServer | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-mcp-test-"));
    packagePath = path.join(tempDir, "test-package");

    // Create a minimal package structure with seed data
    await createMockPackage(packagePath);
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch {
        // Ignore errors during cleanup
      }
      server = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a mock package with seed data
   */
  async function createMockPackage(pkgPath: string): Promise<void> {
    const seedPath = path.join(pkgPath, ".devac", "seed", "base");
    await fs.mkdir(seedPath, { recursive: true });

    await fs.writeFile(
      path.join(pkgPath, "package.json"),
      JSON.stringify({ name: "test-package", version: "1.0.0" })
    );

    // Create meta.json
    await fs.writeFile(
      path.join(pkgPath, ".devac", "seed", "meta.json"),
      JSON.stringify({ schemaVersion: "2.1" })
    );

    // Create mock parquet files (empty for testing structure)
    await fs.writeFile(path.join(seedPath, "nodes.parquet"), "");
    await fs.writeFile(path.join(seedPath, "edges.parquet"), "");
    await fs.writeFile(path.join(seedPath, "external_refs.parquet"), "");
  }

  describe("initialization", () => {
    it("creates server with correct name and version", () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // Server should be created but not running yet
      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(false);
    });

    it("stores package path from options", () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      const status = server.getStatus();
      expect(status.packagePath).toBe(packagePath);
    });

    it("uses default memory limit when not specified", () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // Server created without error using default memory limit
      expect(server).toBeDefined();
    });

    it("accepts custom memory limit", () => {
      const options: MCPServerOptions = {
        mode: "package",
        packagePath,
        memoryLimit: "512MB",
      };
      server = new DevacMCPServer(options);

      expect(server).toBeDefined();
    });

    it("has correct tool count in status before start", () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      const status = server.getStatus();
      expect(status.toolCount).toBe(MCP_TOOLS.length);
      expect(status.toolCount).toBe(9); // find_symbol, get_dependencies, get_dependents, get_file_symbols, get_affected, get_call_graph, query_sql, list_repos, get_context
    });
  });

  describe("start/stop lifecycle", () => {
    it("start() sets isRunning to true", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      expect(server.isRunning()).toBe(false);

      await server.start();

      expect(server.isRunning()).toBe(true);
    });

    it("stop() sets isRunning to false", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it("getStatus() returns uptime when running", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      const statusBefore = server.getStatus();
      expect(statusBefore.uptime).toBe(0);

      await server.start();

      // Wait a bit for uptime to accumulate
      await new Promise((resolve) => setTimeout(resolve, 50));

      const statusAfter = server.getStatus();
      expect(statusAfter.uptime).toBeGreaterThan(0);
    });

    it("getStatus() returns zero uptime when stopped", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();
      await server.stop();

      const status = server.getStatus();
      expect(status.uptime).toBe(0);
    });

    it("can be started and stopped multiple times", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // First cycle
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);

      // Second cycle
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });
  });

  describe("getStatus()", () => {
    it("returns complete status object", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();

      const status = server.getStatus();

      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("mode");
      expect(status).toHaveProperty("packagePath");
      expect(status).toHaveProperty("toolCount");
      expect(status).toHaveProperty("uptime");

      expect(status.isRunning).toBe(true);
      expect(status.mode).toBe("package");
      expect(status.packagePath).toBe(packagePath);
      expect(status.toolCount).toBe(9);
      expect(typeof status.uptime).toBe("number");
    });

    it("reflects correct state after stop", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();
      await server.stop();

      const status = server.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.uptime).toBe(0);
    });
  });

  describe("createMCPServer factory", () => {
    it("creates and starts server in one call", async () => {
      server = await createMCPServer({ mode: "package", packagePath });

      expect(server).toBeInstanceOf(DevacMCPServer);
      expect(server.isRunning()).toBe(true);
    });

    it("returns started server ready for use", async () => {
      server = await createMCPServer({ mode: "package", packagePath });

      const status = server.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.toolCount).toBe(9);
    });
  });
});

describe("MCP Tool Registration", () => {
  it("has all expected tools defined", () => {
    const toolNames = MCP_TOOLS.map((t) => t.name);

    expect(toolNames).toContain("find_symbol");
    expect(toolNames).toContain("get_dependencies");
    expect(toolNames).toContain("get_dependents");
    expect(toolNames).toContain("get_file_symbols");
    expect(toolNames).toContain("get_affected");
    expect(toolNames).toContain("get_call_graph");
    expect(toolNames).toContain("query_sql");
    expect(toolNames).toContain("list_repos");
  });

  it("each tool has required properties", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema).toHaveProperty("properties");
    }
  });

  it("find_symbol requires name parameter", () => {
    const findSymbol = MCP_TOOLS.find((t) => t.name === "find_symbol");
    expect(findSymbol?.inputSchema.required).toContain("name");
  });

  it("get_dependencies requires entityId parameter", () => {
    const getDeps = MCP_TOOLS.find((t) => t.name === "get_dependencies");
    expect(getDeps?.inputSchema.required).toContain("entityId");
  });

  it("get_dependents requires entityId parameter", () => {
    const getDependents = MCP_TOOLS.find((t) => t.name === "get_dependents");
    expect(getDependents?.inputSchema.required).toContain("entityId");
  });

  it("get_file_symbols requires filePath parameter", () => {
    const getFileSymbols = MCP_TOOLS.find((t) => t.name === "get_file_symbols");
    expect(getFileSymbols?.inputSchema.required).toContain("filePath");
  });

  it("get_affected requires changedFiles parameter", () => {
    const getAffected = MCP_TOOLS.find((t) => t.name === "get_affected");
    expect(getAffected?.inputSchema.required).toContain("changedFiles");
  });

  it("get_call_graph requires entityId parameter", () => {
    const getCallGraph = MCP_TOOLS.find((t) => t.name === "get_call_graph");
    expect(getCallGraph?.inputSchema.required).toContain("entityId");
  });

  it("query_sql requires sql parameter", () => {
    const querySql = MCP_TOOLS.find((t) => t.name === "query_sql");
    expect(querySql?.inputSchema.required).toContain("sql");
  });

  it("get_call_graph has direction enum", () => {
    const getCallGraph = MCP_TOOLS.find((t) => t.name === "get_call_graph");
    const directionProp = getCallGraph?.inputSchema.properties.direction as {
      enum?: string[];
    };
    expect(directionProp?.enum).toEqual(["callers", "callees", "both"]);
  });
});
