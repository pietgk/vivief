/**
 * Hub Server - IPC server for hub operations
 *
 * Runs within the MCP server to handle hub operations from CLI clients.
 * Provides a Unix socket interface for hub read/write operations.
 */

import * as fs from "node:fs/promises";
import * as net from "node:net";
import { type CentralHub, createCentralHub } from "./central-hub.js";
import {
  HubErrorCode,
  type HubMethod,
  type HubRequest,
  type HubResponse,
  createErrorResponse,
  createSuccessResponse,
  getSocketPath,
} from "./ipc-protocol.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface HubServerOptions {
  /** Hub directory (contains central.duckdb) */
  hubDir: string;
  /** Optional callback for logging */
  onLog?: (message: string) => void;
}

export interface HubServerEvents {
  onClientConnect?: (clientId: string) => void;
  onClientDisconnect?: (clientId: string) => void;
  onRequest?: (clientId: string, method: HubMethod) => void;
  onError?: (error: Error) => void;
}

// ─────────────────────────────────────────────────────────────
// HubServer Class
// ─────────────────────────────────────────────────────────────

export class HubServer {
  private server: net.Server | null = null;
  private hub: CentralHub | null = null;
  private socketPath: string;
  private hubDir: string;
  private log: (message: string) => void;
  private events: HubServerEvents;
  private clientCounter = 0;
  private activeClients = new Set<string>();

  constructor(options: HubServerOptions, events: HubServerEvents = {}) {
    this.hubDir = options.hubDir;
    this.socketPath = getSocketPath(options.hubDir);
    this.log = options.onLog ?? (() => {});
    this.events = events;
  }

  /**
   * Start the hub server
   */
  async start(): Promise<void> {
    // Clean up stale socket file
    await this.cleanupSocket();

    // Ensure hub directory exists
    await fs.mkdir(this.hubDir, { recursive: true });

    // Initialize hub with read-write access (we own it)
    this.hub = createCentralHub({ hubDir: this.hubDir, readOnly: false });
    await this.hub.init();

    // Create and start socket server
    this.server = net.createServer((socket) => this.handleConnection(socket));

    await new Promise<void>((resolve, reject) => {
      this.server?.on("error", reject);
      this.server?.listen(this.socketPath, () => {
        this.log(`Hub server listening on ${this.socketPath}`);
        resolve();
      });
    });

    // Set socket permissions (owner only)
    await fs.chmod(this.socketPath, 0o600);
  }

  /**
   * Stop the hub server
   */
  async stop(): Promise<void> {
    // Close all active connections
    for (const clientId of this.activeClients) {
      this.log(`Disconnecting client ${clientId}`);
    }
    this.activeClients.clear();

    // Close server
    if (this.server) {
      const server = this.server;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      this.server = null;
    }

    // Close hub
    if (this.hub) {
      await this.hub.close();
      this.hub = null;
    }

    // Remove socket file
    await this.cleanupSocket();

    this.log("Hub server stopped");
  }

  /**
   * Check if server is running
   */
  get isRunning(): boolean {
    return this.server?.listening ?? false;
  }

  /**
   * Get the hub instance (for direct access within the same process)
   */
  getHub(): CentralHub | null {
    return this.hub;
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  private async cleanupSocket(): Promise<void> {
    try {
      await fs.unlink(this.socketPath);
    } catch {
      // Ignore if doesn't exist
    }
  }

  private handleConnection(socket: net.Socket): void {
    const clientId = `client-${++this.clientCounter}`;
    this.activeClients.add(clientId);
    this.events.onClientConnect?.(clientId);
    this.log(`Client connected: ${clientId}`);

    let buffer = "";

    socket.on("data", async (data) => {
      buffer += data.toString();

      // Process complete messages (newline-delimited)
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const message = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (message.trim()) {
          const response = await this.handleMessage(clientId, message);
          socket.write(`${JSON.stringify(response)}\n`);
        }
        newlineIndex = buffer.indexOf("\n");
      }
    });

    socket.on("close", () => {
      this.activeClients.delete(clientId);
      this.events.onClientDisconnect?.(clientId);
      this.log(`Client disconnected: ${clientId}`);
    });

    socket.on("error", (error) => {
      this.events.onError?.(error);
      this.log(`Client error (${clientId}): ${error.message}`);
    });
  }

  private async handleMessage(clientId: string, message: string): Promise<HubResponse> {
    let request: HubRequest;

    try {
      request = JSON.parse(message) as HubRequest;
    } catch {
      return createErrorResponse("unknown", HubErrorCode.INVALID_PARAMS, "Invalid JSON");
    }

    const { id, method, params } = request;

    if (!this.hub) {
      return createErrorResponse(id, HubErrorCode.HUB_NOT_READY, "Hub not initialized");
    }

    this.events.onRequest?.(clientId, method);
    this.log(`Request from ${clientId}: ${method}`);

    try {
      const result = await this.dispatch(method, params);
      return createSuccessResponse(id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResponse(id, HubErrorCode.OPERATION_FAILED, message);
    }
  }

  private async dispatch(method: HubMethod, params: unknown): Promise<unknown> {
    if (!this.hub) {
      throw new Error("Hub not initialized");
    }
    const hub = this.hub;
    const p = params as Record<string, unknown>;

    switch (method) {
      // Write operations
      case "register":
        return hub.registerRepo(p.repoPath as string);

      case "unregister":
        return hub.unregisterRepo(p.repoId as string);

      case "refresh":
        return p.repoId ? hub.refreshRepo(p.repoId as string) : hub.refreshAll();

      case "refreshAll":
        return hub.refreshAll();

      case "pushDiagnostics":
        return hub.pushDiagnostics(p.diagnostics as Parameters<typeof hub.pushDiagnostics>[0]);

      case "clearDiagnostics":
        return hub.clearDiagnostics(
          p.repoId as string | undefined,
          p.source as Parameters<typeof hub.clearDiagnostics>[1]
        );

      case "resolveDiagnostics":
        return hub.resolveDiagnostics(p.ids as string[]);

      // Read operations
      case "query":
        return hub.query(p.sql as string);

      case "listRepos":
        return hub.listRepos();

      case "getRepoStatus":
        return hub.getStatus();

      case "getValidationErrors":
        return hub.getValidationErrors(p as Parameters<typeof hub.getValidationErrors>[0]);

      case "getValidationSummary":
        return hub.getValidationSummary(p.groupBy as "repo" | "file" | "source" | "severity");

      case "getValidationCounts":
        return hub.getValidationCounts();

      case "getDiagnostics":
        return hub.getDiagnostics(p as Parameters<typeof hub.getDiagnostics>[0]);

      case "getDiagnosticsSummary":
        return hub.getDiagnosticsSummary(p.groupBy as "repo" | "source" | "severity" | "category");

      case "getDiagnosticsCounts":
        return hub.getDiagnosticsCounts();

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────

export function createHubServer(options: HubServerOptions, events?: HubServerEvents): HubServer {
  return new HubServer(options, events);
}
