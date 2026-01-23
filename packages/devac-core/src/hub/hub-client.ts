/**
 * Hub Client - Client for hub operations
 *
 * Provides a unified interface for hub operations that:
 * - Delegates to MCP server via IPC when it's running
 * - Falls back to direct hub access when MCP is not running
 */

import * as fs from "node:fs/promises";
import * as net from "node:net";
import {
  type CentralHub,
  type HubStatus,
  type QueryResult,
  type RefreshResult,
  type RepoInfo,
  type RepoRegistrationResult,
  createCentralHub,
} from "./central-hub.js";
import type {
  DiagnosticsFilter,
  DiagnosticsSummary,
  UnifiedDiagnostics,
  ValidationError,
  ValidationFilter,
  ValidationSummary,
} from "./hub-storage.js";
import {
  type HubMethod,
  type HubRequest,
  type HubResponse,
  IPC_CONNECT_TIMEOUT_MS,
  IPC_PROTOCOL_VERSION,
  IPC_TIMEOUT_MS,
  type PingResponse,
  getPidPath,
  getSocketPath,
} from "./ipc-protocol.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface HubClientOptions {
  /** Hub directory (required - use findWorkspaceHubDir to get it) */
  hubDir: string;
  /** Timeout for IPC operations (ms) */
  timeout?: number;
  /** Skip hub location validation (for tests only) */
  skipValidation?: boolean;
}

/**
 * Type representing the common interface between CentralHub and HubClient
 * for sync functions that need to push/clear diagnostics or validation errors.
 */
export type HubLike = {
  pushDiagnostics(diagnostics: UnifiedDiagnostics[]): Promise<void>;
  clearDiagnostics(repoId?: string, source?: string): Promise<void>;
  pushValidationErrors(
    repoId: string,
    packagePath: string,
    errors: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      severity: "error" | "warning";
      source: "tsc" | "eslint" | "biome" | "test" | "coverage";
      code: string | null;
    }>
  ): Promise<void>;
};

// ─────────────────────────────────────────────────────────────
// HubClient Class
// ─────────────────────────────────────────────────────────────

export class HubClient {
  private hubDir: string;
  private socketPath: string;
  private pidPath: string;
  private timeout: number;
  private skipValidation: boolean;
  private versionChecked = false;
  private serverVersion: string | null = null;

  constructor(options: HubClientOptions) {
    this.hubDir = options.hubDir;
    this.socketPath = getSocketPath(this.hubDir);
    this.pidPath = getPidPath(this.hubDir);
    this.timeout = options.timeout ?? IPC_TIMEOUT_MS;
    this.skipValidation = options.skipValidation ?? false;
  }

  // ─────────────────────────────────────────────────────────────
  // Core dispatch methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Check if MCP server is running (socket exists and accepts connections)
   */
  async isMCPRunning(): Promise<boolean> {
    try {
      await fs.access(this.socketPath);
    } catch {
      return false;
    }

    // Try to connect with short timeout
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection(this.socketPath);
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, IPC_CONNECT_TIMEOUT_MS);

      socket.on("connect", () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Ping the MCP server and get version info
   */
  async ping(): Promise<PingResponse> {
    return this.sendToMCP<PingResponse>("ping", {});
  }

  /**
   * Check version compatibility with MCP server.
   * Throws if versions are incompatible.
   */
  private async checkVersionIfNeeded(): Promise<void> {
    if (this.versionChecked) {
      return;
    }

    try {
      const response = await this.ping();
      this.serverVersion = response.serverVersion;
      this.versionChecked = true;

      // Check protocol version compatibility
      if (response.protocolVersion !== IPC_PROTOCOL_VERSION) {
        throw new Error(
          `MCP server protocol version ${response.protocolVersion} incompatible with CLI protocol version ${IPC_PROTOCOL_VERSION}. Run 'devac mcp stop' to stop the old server, then retry your command.`
        );
      }
    } catch (err) {
      // If ping fails, reset version check state so we retry next time
      this.versionChecked = false;
      throw err;
    }
  }

  /**
   * Request MCP server to shut down gracefully
   */
  async shutdown(): Promise<{ success: boolean }> {
    return this.sendToMCP<{ success: boolean }>("shutdown", {});
  }

  /**
   * Get the PID of the MCP server from the PID file
   * Returns null if PID file doesn't exist
   */
  async getMCPPid(): Promise<number | null> {
    try {
      const content = await fs.readFile(this.pidPath, "utf-8");
      const pid = Number.parseInt(content.trim(), 10);
      return Number.isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  /**
   * Send request to MCP via IPC socket
   */
  private async sendToMCP<T>(method: HubMethod, params: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      let buffer = "";
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new Error(`IPC timeout after ${this.timeout}ms`));
        }
      }, this.timeout);

      const request: HubRequest = {
        id: crypto.randomUUID(),
        method,
        params,
        protocolVersion: IPC_PROTOCOL_VERSION,
      };

      socket.on("connect", () => {
        socket.write(`${JSON.stringify(request)}\n`);
      });

      socket.on("data", (data) => {
        buffer += data.toString();
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex !== -1) {
          const message = buffer.slice(0, newlineIndex);
          clearTimeout(timeout);

          if (!settled) {
            settled = true;
            socket.destroy();

            try {
              const response = JSON.parse(message) as HubResponse<T>;
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.result as T);
              }
            } catch (error) {
              reject(new Error(`Invalid IPC response: ${error}`));
            }
          }
        }
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error(`IPC connection error: ${error.message}`));
        }
      });

      socket.on("close", () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error("IPC connection closed unexpectedly"));
        }
      });
    });
  }

  /**
   * Execute operation directly on hub (fallback when MCP not running)
   */
  private async sendToHub<T>(
    operation: (hub: CentralHub) => Promise<T>,
    options: { readOnly?: boolean } = {}
  ): Promise<T> {
    const hub = createCentralHub({
      hubDir: this.hubDir,
      readOnly: options.readOnly,
    });
    await hub.init({ skipValidation: this.skipValidation });
    try {
      return await operation(hub);
    } finally {
      await hub.close();
    }
  }

  /**
   * Check if an error is a connection/communication error vs application error.
   * Connection errors trigger fallback, application errors are re-thrown.
   */
  private isConnectionError(message: string): boolean {
    return (
      message.includes("IPC connection error") ||
      message.includes("IPC timeout") ||
      message.includes("IPC connection closed") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ENOENT") ||
      message.includes("connect ENOENT")
    );
  }

  /**
   * Route to MCP if running, otherwise direct to hub.
   * Falls back to direct hub access if IPC connection fails.
   * Application errors from MCP are re-thrown, not caught.
   */
  private async dispatch<T>(
    method: HubMethod,
    params: unknown,
    hubOperation: (hub: CentralHub) => Promise<T>,
    options: { readOnly?: boolean } = {}
  ): Promise<T> {
    if (await this.isMCPRunning()) {
      try {
        // Check version compatibility on first IPC call
        await this.checkVersionIfNeeded();
        return await this.sendToMCP<T>(method, params);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Don't fallback for version mismatch - that's a hard error
        if (message.includes("incompatible")) {
          throw err;
        }
        // Only fallback for connection/communication errors
        // Application errors (error responses from MCP) should be re-thrown
        if (!this.isConnectionError(message)) {
          throw err;
        }
        // IPC connection failed - fall through to direct hub access
        console.debug?.(`[HubClient] IPC failed, falling back to direct hub: ${message}`);
      }
    }
    return this.sendToHub(hubOperation, options);
  }

  // ─────────────────────────────────────────────────────────────
  // Read operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Execute a SQL query against the hub
   */
  async query(sql: string): Promise<QueryResult> {
    return this.dispatch("query", { sql }, (hub) => hub.query(sql), { readOnly: true });
  }

  /**
   * List all registered repositories
   */
  async listRepos(): Promise<RepoInfo[]> {
    return this.dispatch("listRepos", {}, (hub) => hub.listRepos(), { readOnly: true });
  }

  /**
   * Get hub status
   */
  async getStatus(): Promise<HubStatus> {
    return this.dispatch("getRepoStatus", {}, (hub) => hub.getStatus(), { readOnly: true });
  }

  /**
   * Get validation errors
   */
  async getValidationErrors(filter?: ValidationFilter): Promise<ValidationError[]> {
    return this.dispatch(
      "getValidationErrors",
      filter ?? {},
      (hub) => hub.getValidationErrors(filter),
      { readOnly: true }
    );
  }

  /**
   * Get diagnostics
   */
  async getDiagnostics(filter?: DiagnosticsFilter): Promise<UnifiedDiagnostics[]> {
    return this.dispatch("getDiagnostics", filter ?? {}, (hub) => hub.getDiagnostics(filter), {
      readOnly: true,
    });
  }

  /**
   * Get validation summary grouped by field
   */
  async getValidationSummary(
    groupBy: "repo" | "file" | "source" | "severity"
  ): Promise<ValidationSummary[]> {
    return this.dispatch(
      "getValidationSummary",
      { groupBy },
      (hub) => hub.getValidationSummary(groupBy),
      { readOnly: true }
    );
  }

  /**
   * Get validation counts
   */
  async getValidationCounts(): Promise<{ errors: number; warnings: number; total: number }> {
    return this.dispatch("getValidationCounts", {}, (hub) => hub.getValidationCounts(), {
      readOnly: true,
    });
  }

  /**
   * Get diagnostics summary grouped by field
   */
  async getDiagnosticsSummary(
    groupBy: "repo" | "source" | "severity" | "category"
  ): Promise<DiagnosticsSummary[]> {
    return this.dispatch(
      "getDiagnosticsSummary",
      { groupBy },
      (hub) => hub.getDiagnosticsSummary(groupBy),
      { readOnly: true }
    );
  }

  /**
   * Get diagnostics counts by severity
   */
  async getDiagnosticsCounts(): Promise<{
    critical: number;
    error: number;
    warning: number;
    suggestion: number;
    note: number;
    total: number;
  }> {
    return this.dispatch("getDiagnosticsCounts", {}, (hub) => hub.getDiagnosticsCounts(), {
      readOnly: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Write operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Register a repository with the hub
   */
  async registerRepo(repoPath: string): Promise<RepoRegistrationResult> {
    return this.dispatch("register", { repoPath }, (hub) => hub.registerRepo(repoPath), {
      readOnly: false,
    });
  }

  /**
   * Unregister a repository
   */
  async unregisterRepo(repoId: string): Promise<void> {
    return this.dispatch("unregister", { repoId }, (hub) => hub.unregisterRepo(repoId), {
      readOnly: false,
    });
  }

  /**
   * Refresh a repository or all repositories
   */
  async refresh(repoId?: string): Promise<RefreshResult> {
    return this.dispatch(
      "refresh",
      { repoId },
      (hub) => (repoId ? hub.refreshRepo(repoId) : hub.refreshAll()),
      { readOnly: false }
    );
  }

  /**
   * Refresh all repositories
   */
  async refreshAll(): Promise<RefreshResult> {
    return this.dispatch("refreshAll", {}, (hub) => hub.refreshAll(), { readOnly: false });
  }

  /**
   * Push diagnostics to the hub
   */
  async pushDiagnostics(diagnostics: UnifiedDiagnostics[]): Promise<void> {
    return this.dispatch(
      "pushDiagnostics",
      { diagnostics },
      (hub) => hub.pushDiagnostics(diagnostics),
      { readOnly: false }
    );
  }

  /**
   * Clear diagnostics
   */
  async clearDiagnostics(repoId?: string, source?: string): Promise<void> {
    return this.dispatch(
      "clearDiagnostics",
      { repoId, source },
      (hub) => hub.clearDiagnostics(repoId, source as Parameters<typeof hub.clearDiagnostics>[1]),
      { readOnly: false }
    );
  }

  /**
   * Resolve diagnostics by IDs
   */
  async resolveDiagnostics(ids: string[]): Promise<void> {
    return this.dispatch("resolveDiagnostics", { ids }, (hub) => hub.resolveDiagnostics(ids), {
      readOnly: false,
    });
  }

  /**
   * Push validation errors to the hub
   */
  async pushValidationErrors(
    repoId: string,
    packagePath: string,
    errors: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      severity: "error" | "warning";
      source: "tsc" | "eslint" | "biome" | "test" | "coverage";
      code: string | null;
    }>
  ): Promise<void> {
    return this.dispatch(
      "pushValidationErrors",
      { repoId, packagePath, errors },
      (hub) => hub.pushValidationErrors(repoId, packagePath, errors),
      { readOnly: false }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────

export function createHubClient(options: HubClientOptions): HubClient {
  return new HubClient(options);
}
