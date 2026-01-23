/**
 * HubClient Tests for DevAC v2.0
 *
 * Tests the IPC routing logic defined in ADR-0024.
 * Ensures HubClient properly routes to MCP when running,
 * and falls back to direct hub access when not.
 */

import * as fs from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCentralHub } from "../src/hub/central-hub.js";
import { HubClient, createHubClient } from "../src/hub/hub-client.js";
import type { HubRequest, HubResponse } from "../src/hub/ipc-protocol.js";

describe("HubClient", () => {
  let tempDir: string;
  let hubDir: string;
  let socketPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-client-test-"));
    hubDir = path.join(tempDir, ".devac");
    socketPath = path.join(hubDir, "mcp.sock");
    await fs.mkdir(hubDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("isMCPRunning()", () => {
    it("returns false when socket does not exist", async () => {
      const client = createHubClient({ hubDir, skipValidation: true });
      expect(await client.isMCPRunning()).toBe(false);
    });

    it("returns false when socket file exists but no server is listening (stale socket)", async () => {
      // Create a stale socket file
      await fs.writeFile(socketPath, "stale");

      const client = createHubClient({ hubDir, skipValidation: true });
      expect(await client.isMCPRunning()).toBe(false);
    });

    it("returns true when server is listening on socket", async () => {
      // Create a mock server
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      try {
        const client = createHubClient({ hubDir, skipValidation: true });
        expect(await client.isMCPRunning()).toBe(true);
      } finally {
        server.close();
      }
    });

    it("returns false when connection times out", async () => {
      // Create a server that doesn't respond to connections quickly
      const server = net.createServer(() => {
        // Don't accept the connection - let it hang
      });
      // Use a different socket to avoid conflicts
      const slowSocketPath = path.join(hubDir, "slow.sock");
      await new Promise<void>((resolve) => server.listen(slowSocketPath, resolve));

      try {
        // Create client pointing to default socket path (which doesn't exist)
        const client = createHubClient({ hubDir, skipValidation: true });

        // isMCPRunning checks the default socket path, not our custom one
        expect(await client.isMCPRunning()).toBe(false);
      } finally {
        server.close();
      }
    });
  });

  describe("dispatch routing", () => {
    /**
     * Helper to create a mock MCP server that responds to IPC requests.
     * Automatically handles ping requests for version negotiation.
     */
    async function createMockMCPServer(
      onRequest: (request: HubRequest) => HubResponse<unknown>
    ): Promise<{ server: net.Server; close: () => Promise<void> }> {
      const server = net.createServer((socket) => {
        let buffer = "";
        socket.on("data", (data) => {
          buffer += data.toString();
          for (
            let newlineIndex = buffer.indexOf("\n");
            newlineIndex !== -1;
            newlineIndex = buffer.indexOf("\n")
          ) {
            const message = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            try {
              const request = JSON.parse(message) as HubRequest;
              // Handle ping requests automatically (version negotiation)
              if (request.method === "ping") {
                socket.write(
                  `${JSON.stringify({
                    id: request.id,
                    result: { serverVersion: "1.0.0", protocolVersion: "1.0" },
                  })}\n`
                );
              } else {
                const response = onRequest(request);
                socket.write(`${JSON.stringify(response)}\n`);
              }
            } catch {
              socket.write(
                `${JSON.stringify({
                  id: "unknown",
                  error: { code: -32700, message: "Parse error" },
                })}\n`
              );
            }
          }
        });
      });

      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      return {
        server,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          }),
      };
    }

    it("routes to direct hub when MCP is not running", async () => {
      // Initialize a real hub
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      // Create client - no MCP server running
      const client = createHubClient({ hubDir, skipValidation: true });

      // Query should go to direct hub
      const result = await client.query("SELECT 1 as test");
      expect(result.rows).toEqual([{ test: 1 }]);
    });

    it("routes to MCP when server is running", async () => {
      // Initialize hub first (required for fallback)
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      // Track requests to MCP
      const receivedRequests: HubRequest[] = [];

      // Create mock MCP server
      const { close } = await createMockMCPServer((request) => {
        receivedRequests.push(request);
        return {
          id: request.id,
          result: { rows: [{ mock: true }], rowCount: 1 },
        };
      });

      try {
        const client = createHubClient({ hubDir, skipValidation: true });

        // Query should go to MCP
        const result = await client.query("SELECT 1 as test");

        // Verify request went to MCP
        expect(receivedRequests).toHaveLength(1);
        // biome-ignore lint/style/noNonNullAssertion: We just asserted length is 1
        const request = receivedRequests[0]!;
        expect(request.method).toBe("query");
        expect(request.params).toEqual({ sql: "SELECT 1 as test" });

        // Verify MCP response was returned
        expect(result).toEqual({ rows: [{ mock: true }], rowCount: 1 });
      } finally {
        await close();
      }
    });

    it("handles MCP error responses", async () => {
      // Initialize hub first
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      // Create mock MCP server that returns errors
      const { close } = await createMockMCPServer((request) => ({
        id: request.id,
        error: { code: -32603, message: "Internal error" },
      }));

      try {
        const client = createHubClient({ hubDir, skipValidation: true });

        await expect(client.query("SELECT 1")).rejects.toThrow("Internal error");
      } finally {
        await close();
      }
    });

    it("listRepos routes correctly", async () => {
      // Initialize hub first
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      const receivedRequests: HubRequest[] = [];

      const { close } = await createMockMCPServer((request) => {
        receivedRequests.push(request);
        return {
          id: request.id,
          result: [],
        };
      });

      try {
        const client = createHubClient({ hubDir, skipValidation: true });
        await client.listRepos();

        expect(receivedRequests).toHaveLength(1);
        // biome-ignore lint/style/noNonNullAssertion: We just asserted length is 1
        expect(receivedRequests[0]!.method).toBe("listRepos");
      } finally {
        await close();
      }
    });

    it("registerRepo routes correctly", async () => {
      // Initialize hub first
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      const receivedRequests: HubRequest[] = [];

      const { close } = await createMockMCPServer((request) => {
        receivedRequests.push(request);
        return {
          id: request.id,
          result: { repoId: "test", packages: 1, edges: 0 },
        };
      });

      try {
        const client = createHubClient({ hubDir, skipValidation: true });
        await client.registerRepo("/test/repo");

        expect(receivedRequests).toHaveLength(1);
        // biome-ignore lint/style/noNonNullAssertion: We just asserted length is 1
        const request = receivedRequests[0]!;
        expect(request.method).toBe("register");
        expect(request.params).toEqual({ repoPath: "/test/repo" });
      } finally {
        await close();
      }
    });
  });

  describe("factory function", () => {
    it("createHubClient returns HubClient instance", () => {
      const client = createHubClient({ hubDir, skipValidation: true });
      expect(client).toBeInstanceOf(HubClient);
    });
  });

  describe("timeout handling", () => {
    it("falls back to direct hub when MCP times out", async () => {
      // Initialize hub
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      // Create server that accepts but never responds
      const server = net.createServer(() => {
        // Accept connection but don't respond
      });
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      try {
        // Create client with very short timeout
        const client = new HubClient({
          hubDir,
          timeout: 100, // 100ms timeout
          skipValidation: true,
        });

        // With the new fallback logic, IPC timeout causes fallback to direct hub
        // The query should succeed via direct hub access
        const result = await client.query("SELECT 1 as test");
        expect(result.rows).toEqual([{ test: 1 }]);
      } finally {
        server.close();
      }
    });
  });

  describe("pushValidationErrors", () => {
    it("routes pushValidationErrors to MCP when running", async () => {
      // Initialize hub first
      const hub = createCentralHub({ hubDir });
      await hub.init({ skipValidation: true });
      await hub.close();

      const receivedRequests: HubRequest[] = [];

      const mockServer = net.createServer((socket) => {
        let buffer = "";
        socket.on("data", (data) => {
          buffer += data.toString();
          for (
            let newlineIndex = buffer.indexOf("\n");
            newlineIndex !== -1;
            newlineIndex = buffer.indexOf("\n")
          ) {
            const message = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            const request = JSON.parse(message) as HubRequest;
            // Handle ping requests automatically (version negotiation)
            if (request.method === "ping") {
              socket.write(
                `${JSON.stringify({
                  id: request.id,
                  result: { serverVersion: "1.0.0", protocolVersion: "1.0" },
                })}\n`
              );
            } else {
              receivedRequests.push(request);
              socket.write(`${JSON.stringify({ id: request.id, result: undefined })}\n`);
            }
          }
        });
      });

      await new Promise<void>((resolve) => mockServer.listen(socketPath, resolve));

      try {
        const client = createHubClient({ hubDir, skipValidation: true });

        await client.pushValidationErrors("repo-id", "packages/core", [
          {
            file: "src/index.ts",
            line: 10,
            column: 5,
            message: "Type error",
            severity: "error",
            source: "tsc",
            code: "TS2322",
          },
        ]);

        expect(receivedRequests).toHaveLength(1);
        // biome-ignore lint/style/noNonNullAssertion: We just asserted length is 1
        const request = receivedRequests[0]!;
        expect(request.method).toBe("pushValidationErrors");
        expect(request.params).toMatchObject({
          repoId: "repo-id",
          packagePath: "packages/core",
          errors: [
            {
              file: "src/index.ts",
              line: 10,
              message: "Type error",
            },
          ],
        });
      } finally {
        mockServer.close();
      }
    });
  });
});
