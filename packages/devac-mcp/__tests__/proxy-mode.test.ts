/**
 * Proxy Mode Tests
 *
 * Tests for the stdio-to-IPC proxy architecture when multiple Claude sessions
 * connect to a single backend HubServer.
 *
 * Architecture:
 *   Claude Code #1 ─── stdio ─── devac-mcp (client mode) ─┐
 *   Claude Code #2 ─── stdio ─── devac-mcp (client mode) ─┼── IPC ── Backend HubServer
 *   Claude Code #3 ─── stdio ─── devac-mcp (client mode) ─┘
 *
 * Key behaviors tested:
 *   1. Client mode detection when backend is running
 *   2. Proper hub operation routing in client mode
 *   3. Auto-promotion when backend dies
 *   4. Multiple clients connecting to same backend
 *   5. Request correlation and isolation
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared state for controlling mock behavior
// These must be at module level so vi.mock can access them
let mockIsMCPRunningResult = false;
let mockListReposResult: Array<{
  repoId: string;
  localPath?: string;
  packages?: number;
  status?: string;
  lastSynced?: string;
}> = [];
let mockGetValidationErrorsResult: Array<{
  repo_id: string;
  file: string;
  message: string;
  severity: string;
}> = [];

// Mock functions
const mockHubServerStart = vi.fn();
const mockHubServerStop = vi.fn();
const mockHubServerGetHub = vi.fn();
const mockDuckDBPoolInitialize = vi.fn();
const mockDuckDBPoolShutdown = vi.fn();

vi.mock("@pietgk/devac-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pietgk/devac-core")>();
  return {
    ...actual,
    createHubClient: vi.fn(() => ({
      isMCPRunning: vi.fn().mockImplementation(() => Promise.resolve(mockIsMCPRunningResult)),
      listRepos: vi.fn().mockImplementation(() => Promise.resolve(mockListReposResult)),
      getValidationErrors: vi
        .fn()
        .mockImplementation(() => Promise.resolve(mockGetValidationErrorsResult)),
      getValidationSummary: vi.fn().mockResolvedValue([]),
      getValidationCounts: vi.fn().mockResolvedValue({ errors: 0, warnings: 0, total: 0 }),
      getDiagnostics: vi.fn().mockResolvedValue([]),
      getDiagnosticsSummary: vi.fn().mockResolvedValue([]),
      getDiagnosticsCounts: vi.fn().mockResolvedValue({
        critical: 0,
        error: 0,
        warning: 0,
        suggestion: 0,
        note: 0,
        total: 0,
      }),
    })),
    createHubServer: vi.fn(() => ({
      start: mockHubServerStart,
      stop: mockHubServerStop,
      getHub: mockHubServerGetHub,
    })),
    DuckDBPool: vi.fn().mockImplementation(() => ({
      initialize: mockDuckDBPoolInitialize,
      shutdown: mockDuckDBPoolShutdown,
    })),
    findWorkspaceHubDir: vi.fn().mockResolvedValue("/mock/hub/dir"),
    validateHubLocation: vi.fn().mockResolvedValue({ valid: true }),
  };
});

import { HubDataProvider } from "../src/data-provider.js";

describe("Proxy Mode - Multiple Claude Sessions", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-proxy-test-"));
    hubDir = path.join(tempDir, ".devac");
    await fs.mkdir(hubDir, { recursive: true });

    // Reset mocks and state
    vi.clearAllMocks();
    mockIsMCPRunningResult = false;
    mockListReposResult = [];
    mockGetValidationErrorsResult = [];
    mockDuckDBPoolInitialize.mockResolvedValue(undefined);
    mockDuckDBPoolShutdown.mockResolvedValue(undefined);
    mockHubServerStart.mockResolvedValue(undefined);
    mockHubServerStop.mockResolvedValue(undefined);
    mockHubServerGetHub.mockReturnValue({
      listRepos: vi.fn().mockResolvedValue([]),
      getValidationErrors: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("client mode detection", () => {
    it("detects existing backend and enters client mode", async () => {
      // First provider - no backend running
      mockIsMCPRunningResult = false;
      const provider1 = new HubDataProvider(hubDir);
      await provider1.initialize();

      // First provider should start as server
      expect(mockHubServerStart).toHaveBeenCalledTimes(1);

      // Second provider - backend now running
      mockIsMCPRunningResult = true;
      const provider2 = new HubDataProvider(hubDir);
      await provider2.initialize();

      // Second provider should NOT start another server
      expect(mockHubServerStart).toHaveBeenCalledTimes(1);

      await provider1.shutdown();
      await provider2.shutdown();
    });

    it("multiple providers can coexist in client mode", async () => {
      // Backend is running
      mockIsMCPRunningResult = true;

      const providers: HubDataProvider[] = [];
      for (let i = 0; i < 3; i++) {
        const provider = new HubDataProvider(hubDir);
        await provider.initialize();
        providers.push(provider);
      }

      // No server should have been started
      expect(mockHubServerStart).not.toHaveBeenCalled();

      // All providers should be functional
      for (const provider of providers) {
        expect(provider.mode).toBe("hub");
      }

      // Clean up
      for (const provider of providers) {
        await provider.shutdown();
      }
    });
  });

  describe("operation routing in client mode", () => {
    it("routes hub operations through client in client mode", async () => {
      // Backend is running with repo data
      mockIsMCPRunningResult = true;
      mockListReposResult = [
        {
          repoId: "repo1",
          localPath: "/path/repo1",
          packages: 2,
          status: "active",
          lastSynced: "2025-01-01",
        },
      ];

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      const repos = await provider.listRepos();

      expect(repos).toHaveLength(1);
      expect(repos[0]?.repoId).toBe("repo1");

      await provider.shutdown();
    });

    it("routes validation operations through client", async () => {
      // Backend is running with error data
      mockIsMCPRunningResult = true;
      mockGetValidationErrorsResult = [
        { repo_id: "test-repo", file: "test.ts", message: "Type error", severity: "error" },
      ];

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      const errors = await provider.getValidationErrors({});

      expect(errors).toHaveLength(1);
      expect(errors[0]?.repo_id).toBe("test-repo");

      await provider.shutdown();
    });
  });

  describe("server mode fallback", () => {
    it("starts server mode when no backend is detected", async () => {
      mockIsMCPRunningResult = false;

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      // Should start as server
      expect(mockHubServerStart).toHaveBeenCalled();

      await provider.shutdown();
    });

    it("stops server on shutdown in server mode", async () => {
      mockIsMCPRunningResult = false;

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();
      await provider.shutdown();

      expect(mockHubServerStop).toHaveBeenCalled();
    });

    it("does not stop server on shutdown in client mode", async () => {
      mockIsMCPRunningResult = true;

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();
      await provider.shutdown();

      // Should not stop server we didn't start
      expect(mockHubServerStop).not.toHaveBeenCalled();
    });
  });
});

describe("Proxy Mode - Auto-Promotion", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-promo-test-"));
    hubDir = path.join(tempDir, ".devac");
    await fs.mkdir(hubDir, { recursive: true });

    vi.clearAllMocks();
    mockIsMCPRunningResult = false;
    mockListReposResult = [];
    mockDuckDBPoolInitialize.mockResolvedValue(undefined);
    mockDuckDBPoolShutdown.mockResolvedValue(undefined);
    mockHubServerStart.mockResolvedValue(undefined);
    mockHubServerStop.mockResolvedValue(undefined);
    mockHubServerGetHub.mockReturnValue({
      listRepos: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("connection error detection identifies backend death", () => {
    const provider = new HubDataProvider(hubDir);

    // Access the private method through type assertion
    type ProviderWithPrivate = { isConnectionError(err: unknown): boolean };
    const privateProvider = provider as unknown as ProviderWithPrivate;

    // Test connection error patterns
    expect(privateProvider.isConnectionError(new Error("connect ECONNREFUSED"))).toBe(true);
    expect(privateProvider.isConnectionError(new Error("connect ENOENT /tmp/socket"))).toBe(true);
    expect(privateProvider.isConnectionError(new Error("IPC timeout after 5000ms"))).toBe(true);

    // Regular errors should not trigger promotion
    expect(privateProvider.isConnectionError(new Error("Query failed: invalid SQL"))).toBe(false);
    expect(privateProvider.isConnectionError(new Error("Repo not found"))).toBe(false);
  });
});

describe("Proxy Mode - Connection Error Handling", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-conn-test-"));
    hubDir = path.join(tempDir, ".devac");
    await fs.mkdir(hubDir, { recursive: true });

    vi.clearAllMocks();
    mockIsMCPRunningResult = false;
    mockListReposResult = [];
    mockDuckDBPoolInitialize.mockResolvedValue(undefined);
    mockDuckDBPoolShutdown.mockResolvedValue(undefined);
    mockHubServerStart.mockResolvedValue(undefined);
    mockHubServerStop.mockResolvedValue(undefined);
    mockHubServerGetHub.mockReturnValue({
      listRepos: vi.fn().mockResolvedValue([{ repoId: "promoted", localPath: "/promoted" }]),
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("handles graceful backend operation in client mode", async () => {
    // Start in client mode
    mockIsMCPRunningResult = true;
    mockListReposResult = [{ repoId: "backend-repo" }];

    const provider = new HubDataProvider(hubDir);
    await provider.initialize();

    // Verify we're in client mode
    expect(mockHubServerStart).not.toHaveBeenCalled();

    // Request works
    const repos = await provider.listRepos();
    expect(repos[0]?.repoId).toBe("backend-repo");

    await provider.shutdown();
  });
});

describe("Proxy Mode - Concurrent Operations", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-concurrent-test-"));
    hubDir = path.join(tempDir, ".devac");
    await fs.mkdir(hubDir, { recursive: true });

    vi.clearAllMocks();
    mockIsMCPRunningResult = false;
    mockListReposResult = [];
    mockDuckDBPoolInitialize.mockResolvedValue(undefined);
    mockDuckDBPoolShutdown.mockResolvedValue(undefined);
    mockHubServerStart.mockResolvedValue(undefined);
    mockHubServerStop.mockResolvedValue(undefined);
    mockHubServerGetHub.mockReturnValue({
      listRepos: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("handles multiple concurrent requests in client mode", async () => {
    mockIsMCPRunningResult = true;
    mockListReposResult = [];

    const provider = new HubDataProvider(hubDir);
    await provider.initialize();

    // Fire multiple requests - they'll use the same mock
    const promises = [provider.listRepos(), provider.listRepos(), provider.listRepos()];

    const results = await Promise.all(promises);

    // All requests should complete
    expect(results).toHaveLength(3);

    await provider.shutdown();
  });

  it("handles concurrent providers in client mode", async () => {
    mockIsMCPRunningResult = true;
    mockListReposResult = [{ repoId: "shared-backend" }];

    const providers: HubDataProvider[] = [];

    // Create and initialize multiple providers
    for (let i = 0; i < 3; i++) {
      const provider = new HubDataProvider(hubDir);
      await provider.initialize();
      providers.push(provider);
    }

    // Fire concurrent requests from all providers
    const promises = providers.map((p) => p.listRepos());
    const results = await Promise.all(promises);

    // All requests should complete
    expect(results).toHaveLength(3);
    // All should get data from the shared backend
    for (const repos of results) {
      expect(repos[0]?.repoId).toBe("shared-backend");
    }

    // Clean up
    for (const provider of providers) {
      await provider.shutdown();
    }
  });
});
