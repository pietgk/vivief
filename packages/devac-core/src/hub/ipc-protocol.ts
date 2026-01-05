/**
 * IPC Protocol for Hub communication between CLI and MCP server
 *
 * When MCP server is running, it owns the hub database exclusively.
 * CLI commands communicate with MCP via Unix socket IPC.
 */

import * as path from "node:path";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Socket file name within hub directory */
export const HUB_SOCKET_NAME = "mcp.sock";

/** Default timeout for IPC operations (ms) */
export const IPC_TIMEOUT_MS = 30_000;

/** Connection attempt timeout (ms) */
export const IPC_CONNECT_TIMEOUT_MS = 100;

// ─────────────────────────────────────────────────────────────
// Method Types
// ─────────────────────────────────────────────────────────────

/** Hub methods that can be invoked via IPC */
export type HubMethod =
  // Write operations
  | "register"
  | "unregister"
  | "refresh"
  | "refreshAll"
  | "pushDiagnostics"
  | "clearDiagnostics"
  | "resolveDiagnostics"
  // Read operations
  | "query"
  | "listRepos"
  | "getRepoStatus"
  | "getValidationErrors"
  | "getValidationSummary"
  | "getValidationCounts"
  | "getDiagnostics"
  | "getDiagnosticsSummary"
  | "getDiagnosticsCounts";

// ─────────────────────────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────────────────────────

/** IPC request from CLI to MCP */
export interface HubRequest {
  /** Unique request ID for correlation */
  id: string;
  /** Method to invoke */
  method: HubMethod;
  /** Method parameters */
  params: unknown;
}

/** IPC response from MCP to CLI */
export interface HubResponse<T = unknown> {
  /** Request ID this responds to */
  id: string;
  /** Result on success */
  result?: T;
  /** Error on failure */
  error?: HubError;
}

/** Error details in IPC response */
export interface HubError {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Optional additional data */
  data?: unknown;
}

// ─────────────────────────────────────────────────────────────
// Error Codes
// ─────────────────────────────────────────────────────────────

export const HubErrorCode = {
  /** Unknown method */
  METHOD_NOT_FOUND: -32601,
  /** Invalid parameters */
  INVALID_PARAMS: -32602,
  /** Internal server error */
  INTERNAL_ERROR: -32603,
  /** Hub not initialized */
  HUB_NOT_READY: -32000,
  /** Operation failed */
  OPERATION_FAILED: -32001,
} as const;

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * Get the socket path for a given hub directory
 */
export function getSocketPath(hubDir: string): string {
  return path.join(hubDir, HUB_SOCKET_NAME);
}

/**
 * Serialize a request to send over IPC
 */
export function serializeRequest(request: HubRequest): string {
  return `${JSON.stringify(request)}\n`;
}

/**
 * Parse a response received over IPC
 */
export function parseResponse<T>(data: string): HubResponse<T> {
  return JSON.parse(data.trim()) as HubResponse<T>;
}

/**
 * Create an error response
 */
export function createErrorResponse(
  id: string,
  code: number,
  message: string,
  data?: unknown
): HubResponse {
  return {
    id,
    error: { code, message, data },
  };
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(id: string, result: T): HubResponse<T> {
  return {
    id,
    result,
  };
}
