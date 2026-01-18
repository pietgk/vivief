/**
 * Hub Server Tests
 *
 * Tests for hub-server.ts - IPC server for hub operations
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubServer, type HubServerEvents, createHubServer } from "../../src/hub/hub-server.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("node:net");
vi.mock("../../src/hub/central-hub.js");
vi.mock("../../src/hub/ipc-protocol.js", () => ({
  HubErrorCode: {
    INVALID_PARAMS: "INVALID_PARAMS",
    HUB_NOT_READY: "HUB_NOT_READY",
    OPERATION_FAILED: "OPERATION_FAILED",
  },
  getSocketPath: vi.fn((hubDir: string) => `${hubDir}/hub.sock`),
  createErrorResponse: vi.fn((id, code, message) => ({
    id,
    error: { code, message },
  })),
  createSuccessResponse: vi.fn((id, result) => ({
    id,
    result,
  })),
}));

const mockFs = vi.mocked(fs);
const mockNet = vi.mocked(net);
const { createCentralHub } = await import("../../src/hub/central-hub.js");
const { createErrorResponse } = await import("../../src/hub/ipc-protocol.js");

// Mock hub instance
const mockHub = {
  init: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  registerRepo: vi.fn().mockResolvedValue({ success: true }),
  unregisterRepo: vi.fn().mockResolvedValue({ success: true }),
  refreshRepo: vi.fn().mockResolvedValue({ success: true }),
  refreshAll: vi.fn().mockResolvedValue({ success: true }),
  pushDiagnostics: vi.fn().mockResolvedValue({ success: true }),
  clearDiagnostics: vi.fn().mockResolvedValue({ success: true }),
  resolveDiagnostics: vi.fn().mockResolvedValue({ success: true }),
  pushValidationErrors: vi.fn().mockResolvedValue({ success: true }),
  query: vi.fn().mockResolvedValue([]),
  listRepos: vi.fn().mockResolvedValue([]),
  getStatus: vi.fn().mockResolvedValue({ repos: [] }),
  getValidationErrors: vi.fn().mockResolvedValue([]),
  getValidationSummary: vi.fn().mockResolvedValue([]),
  getValidationCounts: vi.fn().mockResolvedValue({ errors: 0, warnings: 0 }),
  getDiagnostics: vi.fn().mockResolvedValue([]),
  getDiagnosticsSummary: vi.fn().mockResolvedValue([]),
  getDiagnosticsCounts: vi.fn().mockResolvedValue({}),
};

// Mock socket for client connections
class MockSocket extends EventEmitter {
  write = vi.fn();
  destroy = vi.fn();
}

// Mock server
class MockServer extends EventEmitter {
  listening = false;
  listen = vi.fn((_path: string, cb: () => void) => {
    this.listening = true;
    cb();
    return this;
  });
  close = vi.fn((cb: () => void) => {
    this.listening = false;
    cb();
  });
}

describe("HubServer", () => {
  let server: HubServer;
  let mockServer: MockServer;
  let mockSocket: MockSocket;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockServer = new MockServer();
    mockSocket = new MockSocket();

    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.chmod.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue({ code: "ENOENT" }); // Socket doesn't exist
    mockFs.unlink.mockResolvedValue(undefined);

    mockNet.createServer.mockReturnValue(mockServer as unknown as net.Server);
    mockNet.createConnection.mockImplementation(() => {
      const socket = new MockSocket();
      // Simulate connection error (no server listening)
      setTimeout(() => socket.emit("error", new Error("ECONNREFUSED")), 1);
      return socket as unknown as net.Socket;
    });

    vi.mocked(createCentralHub).mockReturnValue(
      mockHub as unknown as ReturnType<typeof createCentralHub>
    );

    server = new HubServer({ hubDir: "/test/hub" });
  });

  afterEach(async () => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("creates server with default options", () => {
      const server = new HubServer({ hubDir: "/test/hub" });
      expect(server).toBeInstanceOf(HubServer);
      expect(server.isRunning).toBe(false);
    });

    it("accepts custom log function", () => {
      const onLog = vi.fn();
      const server = new HubServer({ hubDir: "/test/hub", onLog });
      expect(server).toBeInstanceOf(HubServer);
    });

    it("accepts event callbacks", () => {
      const events: HubServerEvents = {
        onClientConnect: vi.fn(),
        onClientDisconnect: vi.fn(),
        onRequest: vi.fn(),
        onError: vi.fn(),
      };
      const server = new HubServer({ hubDir: "/test/hub" }, events);
      expect(server).toBeInstanceOf(HubServer);
    });
  });

  describe("start", () => {
    it("creates hub directory", async () => {
      await server.start();

      expect(mockFs.mkdir).toHaveBeenCalledWith("/test/hub", {
        recursive: true,
      });
    });

    it("initializes hub", async () => {
      await server.start();

      expect(createCentralHub).toHaveBeenCalledWith({
        hubDir: "/test/hub",
        readOnly: false,
      });
      expect(mockHub.init).toHaveBeenCalled();
    });

    it("creates and starts socket server", async () => {
      await server.start();

      expect(mockNet.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith("/test/hub/hub.sock", expect.any(Function));
    });

    it("sets socket permissions", async () => {
      await server.start();

      expect(mockFs.chmod).toHaveBeenCalledWith("/test/hub/hub.sock", 0o600);
    });

    it("cleans up stale socket before starting", async () => {
      mockFs.access.mockResolvedValueOnce(undefined); // Socket exists

      await server.start();

      expect(mockFs.unlink).toHaveBeenCalledWith("/test/hub/hub.sock");
    });

    it("throws if another server is using socket", async () => {
      mockFs.access.mockResolvedValueOnce(undefined); // Socket exists
      mockNet.createConnection.mockImplementation(() => {
        const socket = new MockSocket();
        // Simulate successful connection (server is listening)
        setTimeout(() => socket.emit("connect"), 1);
        return socket as unknown as net.Socket;
      });

      await expect(server.start()).rejects.toThrow("Another MCP server is already listening");
    });

    it("sets isRunning to true", async () => {
      await server.start();

      expect(server.isRunning).toBe(true);
    });
  });

  describe("stop", () => {
    beforeEach(async () => {
      await server.start();
    });

    it("closes server", async () => {
      await server.stop();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it("closes hub", async () => {
      await server.stop();

      expect(mockHub.close).toHaveBeenCalled();
    });

    it("removes socket file", async () => {
      mockFs.access.mockResolvedValue(undefined);

      await server.stop();

      expect(mockFs.unlink).toHaveBeenCalledWith("/test/hub/hub.sock");
    });

    it("sets isRunning to false", async () => {
      await server.stop();

      expect(server.isRunning).toBe(false);
    });
  });

  describe("getHub", () => {
    it("returns null before start", () => {
      expect(server.getHub()).toBe(null);
    });

    it("returns hub after start", async () => {
      await server.start();

      expect(server.getHub()).toBe(mockHub);
    });

    it("returns null after stop", async () => {
      await server.start();
      await server.stop();

      expect(server.getHub()).toBe(null);
    });
  });

  describe("client handling", () => {
    beforeEach(async () => {
      await server.start();
    });

    it("handles client connection", () => {
      const events: HubServerEvents = {
        onClientConnect: vi.fn(),
      };
      const _serverWithEvents = new HubServer({ hubDir: "/test/hub" }, events);

      // Simulate connection callback
      const connectionCallback = mockNet.createServer.mock.calls[0]?.[0] as
        | ((socket: net.Socket) => void)
        | undefined;
      if (connectionCallback) {
        connectionCallback(mockSocket as unknown as net.Socket);
      }

      // Events are on the new server instance, check mockSocket was set up
      expect(mockSocket.listenerCount("data")).toBe(1);
      expect(mockSocket.listenerCount("close")).toBe(1);
      expect(mockSocket.listenerCount("error")).toBe(1);
    });

    it("handles client disconnect", async () => {
      const connectionCallback = mockNet.createServer.mock.calls[0]?.[0] as
        | ((socket: net.Socket) => void)
        | undefined;
      if (connectionCallback) {
        connectionCallback(mockSocket as unknown as net.Socket);
      }

      mockSocket.emit("close");

      // No error thrown
    });

    it("handles client error", async () => {
      const connectionCallback = mockNet.createServer.mock.calls[0]?.[0] as
        | ((socket: net.Socket) => void)
        | undefined;
      if (connectionCallback) {
        connectionCallback(mockSocket as unknown as net.Socket);
      }

      mockSocket.emit("error", new Error("Connection reset"));

      // No error thrown
    });
  });

  describe("message handling", () => {
    beforeEach(async () => {
      await server.start();
      const connectionCallback = mockNet.createServer.mock.calls[0]?.[0] as
        | ((socket: net.Socket) => void)
        | undefined;
      if (connectionCallback) {
        connectionCallback(mockSocket as unknown as net.Socket);
      }
    });

    it("handles valid JSON request", async () => {
      const request = JSON.stringify({
        id: "1",
        method: "listRepos",
        params: {},
      });

      mockSocket.emit("data", Buffer.from(`${request}\n`));

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSocket.write).toHaveBeenCalled();
      expect(mockHub.listRepos).toHaveBeenCalled();
    });

    it("handles invalid JSON", async () => {
      mockSocket.emit("data", Buffer.from("not valid json\n"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(createErrorResponse).toHaveBeenCalledWith("unknown", "INVALID_PARAMS", "Invalid JSON");
    });

    it("handles multiple messages in one data event", async () => {
      const request1 = JSON.stringify({
        id: "1",
        method: "listRepos",
        params: {},
      });
      const request2 = JSON.stringify({
        id: "2",
        method: "listRepos",
        params: {},
      });

      mockSocket.emit("data", Buffer.from(`${request1}\n${request2}\n`));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSocket.write).toHaveBeenCalledTimes(2);
    });

    it("handles partial message across multiple data events", async () => {
      const request = JSON.stringify({
        id: "1",
        method: "listRepos",
        params: {},
      });
      const part1 = request.slice(0, 10);
      const part2 = `${request.slice(10)}\n`;

      mockSocket.emit("data", Buffer.from(part1));
      mockSocket.emit("data", Buffer.from(part2));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSocket.write).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatch methods", () => {
    beforeEach(async () => {
      await server.start();
      const connectionCallback = mockNet.createServer.mock.calls[0]?.[0] as
        | ((socket: net.Socket) => void)
        | undefined;
      if (connectionCallback) {
        connectionCallback(mockSocket as unknown as net.Socket);
      }
    });

    const sendRequest = async (method: string, params: Record<string, unknown> = {}) => {
      const request = JSON.stringify({ id: "test", method, params });
      mockSocket.emit("data", Buffer.from(`${request}\n`));
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    it("dispatches register method", async () => {
      await sendRequest("register", { repoPath: "/test/repo" });
      expect(mockHub.registerRepo).toHaveBeenCalledWith("/test/repo");
    });

    it("dispatches unregister method", async () => {
      await sendRequest("unregister", { repoId: "repo-123" });
      expect(mockHub.unregisterRepo).toHaveBeenCalledWith("repo-123");
    });

    it("dispatches refresh method with repoId", async () => {
      await sendRequest("refresh", { repoId: "repo-123" });
      expect(mockHub.refreshRepo).toHaveBeenCalledWith("repo-123");
    });

    it("dispatches refresh method without repoId", async () => {
      await sendRequest("refresh", {});
      expect(mockHub.refreshAll).toHaveBeenCalled();
    });

    it("dispatches refreshAll method", async () => {
      await sendRequest("refreshAll", {});
      expect(mockHub.refreshAll).toHaveBeenCalled();
    });

    it("dispatches query method", async () => {
      await sendRequest("query", { sql: "SELECT * FROM repos" });
      expect(mockHub.query).toHaveBeenCalledWith("SELECT * FROM repos");
    });

    it("dispatches listRepos method", async () => {
      await sendRequest("listRepos", {});
      expect(mockHub.listRepos).toHaveBeenCalled();
    });

    it("dispatches getRepoStatus method", async () => {
      await sendRequest("getRepoStatus", {});
      expect(mockHub.getStatus).toHaveBeenCalled();
    });

    it("dispatches getValidationErrors method", async () => {
      await sendRequest("getValidationErrors", { repoId: "repo-123" });
      expect(mockHub.getValidationErrors).toHaveBeenCalled();
    });

    it("dispatches getValidationSummary method", async () => {
      await sendRequest("getValidationSummary", { groupBy: "repo" });
      expect(mockHub.getValidationSummary).toHaveBeenCalledWith("repo");
    });

    it("dispatches getValidationCounts method", async () => {
      await sendRequest("getValidationCounts", {});
      expect(mockHub.getValidationCounts).toHaveBeenCalled();
    });

    it("dispatches getDiagnostics method", async () => {
      await sendRequest("getDiagnostics", { repoId: "repo-123" });
      expect(mockHub.getDiagnostics).toHaveBeenCalled();
    });

    it("dispatches getDiagnosticsSummary method", async () => {
      await sendRequest("getDiagnosticsSummary", { groupBy: "severity" });
      expect(mockHub.getDiagnosticsSummary).toHaveBeenCalledWith("severity");
    });

    it("dispatches getDiagnosticsCounts method", async () => {
      await sendRequest("getDiagnosticsCounts", {});
      expect(mockHub.getDiagnosticsCounts).toHaveBeenCalled();
    });

    it("dispatches pushDiagnostics method", async () => {
      const diagnostics = [{ id: "d1" }];
      await sendRequest("pushDiagnostics", { diagnostics });
      expect(mockHub.pushDiagnostics).toHaveBeenCalledWith(diagnostics);
    });

    it("dispatches clearDiagnostics method", async () => {
      await sendRequest("clearDiagnostics", {
        repoId: "repo-123",
        source: "tsc",
      });
      expect(mockHub.clearDiagnostics).toHaveBeenCalledWith("repo-123", "tsc");
    });

    it("dispatches resolveDiagnostics method", async () => {
      await sendRequest("resolveDiagnostics", { ids: ["d1", "d2"] });
      expect(mockHub.resolveDiagnostics).toHaveBeenCalledWith(["d1", "d2"]);
    });

    it("dispatches pushValidationErrors method", async () => {
      const errors = [{ message: "error" }];
      await sendRequest("pushValidationErrors", {
        repoId: "repo-123",
        packagePath: "/pkg",
        errors,
      });
      expect(mockHub.pushValidationErrors).toHaveBeenCalledWith("repo-123", "/pkg", errors);
    });

    it("returns error for unknown method", async () => {
      await sendRequest("unknownMethod", {});
      expect(createErrorResponse).toHaveBeenCalledWith(
        "test",
        "OPERATION_FAILED",
        "Unknown method: unknownMethod"
      );
    });

    it("returns error when operation fails", async () => {
      mockHub.listRepos.mockRejectedValueOnce(new Error("Database error"));
      await sendRequest("listRepos", {});
      expect(createErrorResponse).toHaveBeenCalledWith(
        "test",
        "OPERATION_FAILED",
        "Database error"
      );
    });
  });
});

describe("createHubServer", () => {
  it("creates a HubServer instance", () => {
    const server = createHubServer({ hubDir: "/test/hub" });
    expect(server).toBeInstanceOf(HubServer);
  });

  it("passes events to constructor", () => {
    const events: HubServerEvents = {
      onClientConnect: vi.fn(),
    };
    const server = createHubServer({ hubDir: "/test/hub" }, events);
    expect(server).toBeInstanceOf(HubServer);
  });
});
