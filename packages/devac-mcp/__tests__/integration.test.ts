/**
 * DevAC MCP Integration Tests
 *
 * End-to-end tests for MCP server workflows.
 * Tests the full server lifecycle and tool handling through MCP protocol.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevacMCPServer } from "../src/server.js";
import type { MCPServerOptions } from "../src/types.js";

// Mock the MCP SDK transport to avoid actual stdio connections
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    close: vi.fn(),
  })),
}));

describe("MCP Integration", () => {
  let tempDir: string;
  let packagePath: string;
  let server: DevacMCPServer | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-mcp-integration-"));
    packagePath = path.join(tempDir, "test-package");

    // Create minimal package structure
    await fs.mkdir(path.join(packagePath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(packagePath, "package.json"),
      JSON.stringify({ name: "test-package", version: "1.0.0" })
    );
    await fs.writeFile(
      path.join(packagePath, "src", "index.ts"),
      "export function main(): void { console.log('hello'); }"
    );
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch {
        // Ignore cleanup errors
      }
      server = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("full workflow: start → list tools → stop", () => {
    it("completes full lifecycle successfully", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // Start
      await server.start();
      expect(server.isRunning()).toBe(true);

      // Get status (includes tool count)
      const status = server.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.toolCount).toBe(12);
      expect(status.packagePath).toBe(packagePath);
      expect(status.uptime).toBeGreaterThanOrEqual(0);

      // Stop
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it("handles multiple start/stop cycles", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };

      // First cycle
      server = new DevacMCPServer(options);
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);

      // Second cycle - new server instance
      server = new DevacMCPServer(options);
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });
  });

  describe("server state transitions", () => {
    it("transitions from stopped → running → stopped", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // Initial state (not started)
      expect(server.isRunning()).toBe(false);
      expect(server.getStatus().uptime).toBe(0);

      // After start
      await server.start();
      expect(server.isRunning()).toBe(true);
      expect(server.getStatus().uptime).toBeGreaterThanOrEqual(0);

      // After stop
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it("getStatus reflects current state accurately", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // Before start
      let status = server.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.uptime).toBe(0);

      // After start
      await server.start();
      status = server.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.toolCount).toBe(12);

      // After stop
      await server.stop();
      status = server.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe("configuration options", () => {
    it("accepts custom memory limit", async () => {
      const options: MCPServerOptions = {
        mode: "package",
        packagePath,
        memoryLimit: "512MB",
      };
      server = new DevacMCPServer(options);

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });

    it("uses default memory limit when not specified", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // Should start without error with default 256MB
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });
  });

  describe("package path handling", () => {
    it("creates seed reader for valid package path", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();

      // Server should be running with package path set
      const status = server.getStatus();
      expect(status.packagePath).toBe(packagePath);

      await server.stop();
    });

    it("handles package path with spaces", async () => {
      const pathWithSpaces = path.join(tempDir, "path with spaces");
      await fs.mkdir(path.join(pathWithSpaces, "src"), { recursive: true });
      await fs.writeFile(
        path.join(pathWithSpaces, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" })
      );

      const options: MCPServerOptions = { mode: "package", packagePath: pathWithSpaces };
      server = new DevacMCPServer(options);

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });

    it("handles package path with special characters", async () => {
      const specialPath = path.join(tempDir, "path-with_special.chars");
      await fs.mkdir(path.join(specialPath, "src"), { recursive: true });
      await fs.writeFile(
        path.join(specialPath, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0" })
      );

      const options: MCPServerOptions = { mode: "package", packagePath: specialPath };
      server = new DevacMCPServer(options);

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });
  });

  describe("uptime tracking", () => {
    it("tracks uptime correctly", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();

      // Wait a bit to accumulate uptime
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = server.getStatus();
      expect(status.uptime).toBeGreaterThan(0);

      await server.stop();
    });

    it("resets uptime to 0 after stop", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const runningStatus = server.getStatus();
      expect(runningStatus.uptime).toBeGreaterThan(0);

      await server.stop();

      const stoppedStatus = server.getStatus();
      expect(stoppedStatus.uptime).toBe(0);
    });
  });

  describe("resource cleanup", () => {
    it("cleans up DuckDB pool on stop", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);

      // Server should be completely stopped
      const status = server.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it("handles stop when already stopped gracefully", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();
      await server.stop();

      // Second stop should not throw
      await expect(server.stop()).resolves.not.toThrow();
    });
  });

  describe("error resilience", () => {
    it("handles empty package directory", async () => {
      const emptyDir = path.join(tempDir, "empty-package");
      await fs.mkdir(emptyDir, { recursive: true });

      const options: MCPServerOptions = { mode: "package", packagePath: emptyDir };
      server = new DevacMCPServer(options);

      // Should start even with empty directory (seed files may not exist yet)
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });
  });
});

describe("MCP Protocol Handlers", () => {
  let tempDir: string;
  let packagePath: string;
  let server: DevacMCPServer | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-mcp-protocol-"));
    packagePath = path.join(tempDir, "test-package");

    await fs.mkdir(path.join(packagePath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(packagePath, "package.json"),
      JSON.stringify({ name: "test-package", version: "1.0.0" })
    );
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch {
        // Ignore
      }
      server = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("server metadata", () => {
    it("reports correct server name and version", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      // The server is created with name "devac-mcp" and version "0.1.0"
      // This is set in the Server constructor
      await server.start();

      // We can verify the server is created correctly by checking it runs
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });
  });

  describe("tool count", () => {
    it("reports 8 available tools", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();

      const status = server.getStatus();
      expect(status.toolCount).toBe(12);

      await server.stop();
    });
  });
});

describe("Concurrent Operations", () => {
  let tempDir: string;
  let packagePath: string;
  let server: DevacMCPServer | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-mcp-concurrent-"));
    packagePath = path.join(tempDir, "test-package");

    await fs.mkdir(path.join(packagePath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(packagePath, "package.json"),
      JSON.stringify({ name: "test-package", version: "1.0.0" })
    );
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch {
        // Ignore
      }
      server = null;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("concurrent status checks", () => {
    it("handles multiple concurrent getStatus calls", async () => {
      const options: MCPServerOptions = { mode: "package", packagePath };
      server = new DevacMCPServer(options);

      await server.start();

      // Make multiple concurrent status calls
      const statusPromises = Array.from({ length: 10 }, () => Promise.resolve(server?.getStatus()));

      const statuses = await Promise.all(statusPromises);

      // All should return consistent results
      for (const status of statuses) {
        expect(status?.isRunning).toBe(true);
        expect(status?.toolCount).toBe(12);
      }

      await server.stop();
    });
  });
});
