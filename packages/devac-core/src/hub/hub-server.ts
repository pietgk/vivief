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
  IPC_PROTOCOL_VERSION,
  type PingResponse,
  createErrorResponse,
  createSuccessResponse,
  getPidPath,
  getSocketPath,
} from "./ipc-protocol.js";

// Get version from package.json at runtime
const SERVER_VERSION = "1.0.0"; // TODO: Read from package.json

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
  private pidPath: string;
  private hubDir: string;
  private log: (message: string) => void;
  private events: HubServerEvents;
  private clientCounter = 0;
  private activeClients = new Set<string>();
  private shutdownRequested = false;
  private shutdownCallback?: () => void;

  constructor(options: HubServerOptions, events: HubServerEvents = {}) {
    this.hubDir = options.hubDir;
    this.socketPath = getSocketPath(options.hubDir);
    this.pidPath = getPidPath(options.hubDir);
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

    // Write PID file for shutdown fallback
    await fs.writeFile(this.pidPath, String(process.pid), "utf-8");
    this.log(`PID file written: ${this.pidPath}`);
  }

  /**
   * Register a callback to be called when shutdown is requested via IPC
   */
  onShutdownRequested(callback: () => void): void {
    this.shutdownCallback = callback;
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

    // Remove PID file
    await this.cleanupPidFile();

    this.log("Hub server stopped");
  }

  /**
   * Clean up PID file
   */
  private async cleanupPidFile(): Promise<void> {
    try {
      await fs.unlink(this.pidPath);
      this.log(`PID file removed: ${this.pidPath}`);
    } catch (err) {
      // Ignore ENOENT (file doesn't exist)
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.log(`Failed to remove PID file: ${err}`);
      }
    }
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

  /**
   * Check if another server is actively listening on the socket
   */
  private async isSocketInUse(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection(this.socketPath);
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 100); // Short timeout - just checking if anyone is listening

      socket.on("connect", () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true); // Another MCP is actively listening
      });

      socket.on("error", () => {
        clearTimeout(timeout);
        resolve(false); // Socket file may exist but nothing listening (stale)
      });
    });
  }

  /**
   * Clean up stale socket file, but refuse if another server is using it
   */
  private async cleanupSocket(): Promise<void> {
    try {
      // Check if socket file exists
      await fs.access(this.socketPath);

      // Socket exists - check if it's actively in use
      if (await this.isSocketInUse()) {
        throw new Error(
          `Another MCP server is already listening on ${this.socketPath}. Stop it first or use a different hub directory.`
        );
      }

      // Socket exists but is stale (no one listening) - safe to delete
      await fs.unlink(this.socketPath);
      this.log(`Cleaned up stale socket: ${this.socketPath}`);
    } catch (err) {
      // Ignore ENOENT (socket doesn't exist) - that's fine
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      // Re-throw other errors (including our "already listening" error)
      throw err;
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
    // Lifecycle methods don't require hub
    if (method === "ping") {
      const response: PingResponse = {
        serverVersion: SERVER_VERSION,
        protocolVersion: IPC_PROTOCOL_VERSION,
      };
      return response;
    }

    if (method === "shutdown") {
      this.log("Shutdown requested via IPC");
      this.shutdownRequested = true;
      // Call the shutdown callback asynchronously to allow response to be sent
      if (this.shutdownCallback) {
        setImmediate(() => this.shutdownCallback?.());
      }
      return { success: true };
    }

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

      case "pushValidationErrors":
        return hub.pushValidationErrors(
          p.repoId as string,
          p.packagePath as string,
          p.errors as Parameters<typeof hub.pushValidationErrors>[2]
        );

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
