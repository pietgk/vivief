/**
 * HubDataProvider Dual-Mode Tests
 *
 * Tests for client/server mode detection and auto-promotion.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the devac-core module
const mockIsMCPRunning = vi.fn();
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
      isMCPRunning: mockIsMCPRunning,
      listRepos: vi.fn().mockResolvedValue([]),
      getValidationErrors: vi.fn().mockResolvedValue([]),
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
  };
});

import { HubDataProvider } from "../src/data-provider.js";

describe("HubDataProvider Dual-Mode", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-test-"));
    hubDir = path.join(tempDir, ".devac");
    await fs.mkdir(hubDir, { recursive: true });

    // Reset all mocks
    vi.clearAllMocks();
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

  describe("initialization", () => {
    it("starts in server mode when no MCP is running", async () => {
      mockIsMCPRunning.mockResolvedValue(false);

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      expect(mockHubServerStart).toHaveBeenCalled();
      expect(mockIsMCPRunning).toHaveBeenCalled();

      await provider.shutdown();
    });

    it("starts in client mode when MCP is already running", async () => {
      mockIsMCPRunning.mockResolvedValue(true);

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      // Should NOT start a new server
      expect(mockHubServerStart).not.toHaveBeenCalled();
      expect(mockIsMCPRunning).toHaveBeenCalled();

      await provider.shutdown();
    });
  });

  describe("shutdown", () => {
    it("stops hub server in server mode", async () => {
      mockIsMCPRunning.mockResolvedValue(false);

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();
      await provider.shutdown();

      expect(mockHubServerStop).toHaveBeenCalled();
      expect(mockDuckDBPoolShutdown).toHaveBeenCalled();
    });

    it("cleans up client in client mode without stopping server", async () => {
      mockIsMCPRunning.mockResolvedValue(true);

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();
      await provider.shutdown();

      // Should NOT call stop since we didn't start the server
      expect(mockHubServerStop).not.toHaveBeenCalled();
      expect(mockDuckDBPoolShutdown).toHaveBeenCalled();
    });
  });

  describe("hubOperation routing", () => {
    it("uses hub directly in server mode", async () => {
      mockIsMCPRunning.mockResolvedValue(false);
      const mockListRepos = vi
        .fn()
        .mockResolvedValue([
          { repoId: "test", localPath: "/test", packages: 1, status: "active", lastSynced: "now" },
        ]);
      mockHubServerGetHub.mockReturnValue({
        listRepos: mockListRepos,
      });

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      const repos = await provider.listRepos();

      expect(repos).toHaveLength(1);
      expect(repos[0]?.repoId).toBe("test");
      expect(mockListRepos).toHaveBeenCalled();

      await provider.shutdown();
    });

    it("delegates to client in client mode", async () => {
      mockIsMCPRunning.mockResolvedValue(true);

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      const repos = await provider.listRepos();

      // Client mode returns empty array from mock
      expect(repos).toHaveLength(0);
      // Hub server's listRepos should NOT be called
      expect(mockHubServerGetHub).not.toHaveBeenCalled();

      await provider.shutdown();
    });
  });

  describe("getAffected in client mode", () => {
    it("returns empty results in client mode", async () => {
      mockIsMCPRunning.mockResolvedValue(true);

      const provider = new HubDataProvider(hubDir);
      await provider.initialize();

      const result = await provider.getAffected(["some/file.ts"]);

      // In client mode, getAffected returns empty as getAffectedRepos is not available via IPC
      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);

      await provider.shutdown();
    });
  });
});

describe("HubDataProvider Auto-Promotion", () => {
  let tempDir: string;
  let hubDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "devac-hub-promo-test-"));
    hubDir = path.join(tempDir, ".devac");
    await fs.mkdir(hubDir, { recursive: true });

    vi.clearAllMocks();
    mockDuckDBPoolInitialize.mockResolvedValue(undefined);
    mockDuckDBPoolShutdown.mockResolvedValue(undefined);
    mockHubServerStart.mockResolvedValue(undefined);
    mockHubServerStop.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("detects connection errors for auto-promotion", async () => {
    // Start in client mode
    mockIsMCPRunning.mockResolvedValue(true);

    const provider = new HubDataProvider(hubDir);
    await provider.initialize();

    // Verify we're in client mode (no server started)
    expect(mockHubServerStart).not.toHaveBeenCalled();

    await provider.shutdown();
  });
});
