/**
 * Health Check for DevAC Hub
 *
 * Proactively detects and diagnoses common issues with the hub/MCP setup
 * that can prevent CLI commands from working correctly.
 */

import { exec as execCallback } from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import { promisify } from "node:util";
import {
  IPC_CONNECT_TIMEOUT_MS,
  IPC_PROTOCOL_VERSION,
  getPidPath,
  getSocketPath,
} from "./ipc-protocol.js";

const exec = promisify(execCallback);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Types of issues that can be detected */
export type HealthIssueType = "STALE_SOCKET" | "STALE_PID" | "MULTIPLE_MCP" | "VERSION_MISMATCH";

/** A fix action that can be applied to resolve an issue */
export interface HealthIssueFix {
  /** Human-readable description of what the fix does */
  description: string;
  /** Execute the fix */
  execute: () => Promise<void>;
}

/** A detected health issue */
export interface HealthIssue {
  /** Type of issue */
  type: HealthIssueType;
  /** Human-readable description of the issue */
  message: string;
  /** The fix that can be applied */
  fix: HealthIssueFix;
}

/** Result of running a health check */
export interface HealthCheckResult {
  /** Whether the system is healthy (no issues found) */
  healthy: boolean;
  /** List of issues found (empty if healthy) */
  issues: HealthIssue[];
}

/** Options for running the health check */
export interface HealthCheckOptions {
  /** Hub directory to check (contains mcp.sock, mcp.pid, etc.) */
  hubDir: string;
  /** Whether to check for version mismatch (requires socket connection) */
  checkVersion?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a process with the given PID is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // kill(pid, 0) doesn't actually send a signal, just checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the PID from a PID file
 */
async function readPidFile(pidPath: string): Promise<number | null> {
  try {
    const content = await fs.readFile(pidPath, "utf-8");
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Check if something is listening on the socket
 */
async function canConnectToSocket(socketPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection(socketPath);
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
 * Find all devac-mcp processes running on the system
 */
async function findMCPProcesses(): Promise<number[]> {
  try {
    // Use pgrep to find devac-mcp processes
    const { stdout } = await exec("pgrep -f devac-mcp || true");
    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => !Number.isNaN(pid));
  } catch {
    // pgrep not found or other error - return empty
    return [];
  }
}

/**
 * Ping the MCP server to get version info
 */
async function pingMCP(
  socketPath: string
): Promise<{ serverVersion: string; protocolVersion: string } | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 2000); // 2 second timeout for ping

    const request = {
      id: `health-check-${Date.now()}`,
      method: "ping",
      params: {},
      protocolVersion: IPC_PROTOCOL_VERSION,
    };

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        clearTimeout(timeout);
        const message = buffer.slice(0, newlineIndex);
        socket.destroy();

        try {
          const response = JSON.parse(message);
          if (response.result) {
            resolve(response.result);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      }
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Kill all devac-mcp processes
 */
async function killAllMCPProcesses(): Promise<void> {
  try {
    await exec("pkill -f devac-mcp || true");
    // Wait for processes to terminate
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch {
    // pkill failed - ignore
  }
}

/**
 * Delete the socket file
 */
async function deleteSocketFile(socketPath: string): Promise<void> {
  try {
    await fs.unlink(socketPath);
  } catch {
    // File doesn't exist or can't delete - ignore
  }
}

/**
 * Delete the PID file
 */
async function deletePidFile(pidPath: string): Promise<void> {
  try {
    await fs.unlink(pidPath);
  } catch {
    // File doesn't exist or can't delete - ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Main Health Check Function
// ─────────────────────────────────────────────────────────────

/**
 * Run a comprehensive health check on the DevAC hub
 *
 * Checks for:
 * - Multiple MCP processes running (should only be one)
 * - Stale socket file (exists but nothing listening)
 * - Stale PID file (exists but process is dead)
 * - Version mismatch (MCP protocol version differs from CLI)
 *
 * @param options - Health check options
 * @returns Health check result with issues and fixes
 */
export async function runHealthCheck(options: HealthCheckOptions): Promise<HealthCheckResult> {
  const { hubDir, checkVersion = true } = options;
  const socketPath = getSocketPath(hubDir);
  const pidPath = getPidPath(hubDir);
  const issues: HealthIssue[] = [];

  // 1. Check for multiple MCP processes
  const mcpPids = await findMCPProcesses();
  if (mcpPids.length > 1) {
    issues.push({
      type: "MULTIPLE_MCP",
      message: `${mcpPids.length} devac-mcp processes running (should be 0 or 1)`,
      fix: {
        description: "Kill all devac-mcp processes",
        execute: async () => {
          await killAllMCPProcesses();
          // Also clean up stale socket and PID files
          await deleteSocketFile(socketPath);
          await deletePidFile(pidPath);
        },
      },
    });
    // If we have multiple processes, don't check other issues - they'll be fixed by killing processes
    return { healthy: false, issues };
  }

  // 2. Check for stale socket
  const socketExists = await fileExists(socketPath);
  const socketResponds = socketExists && (await canConnectToSocket(socketPath));

  if (socketExists && !socketResponds) {
    issues.push({
      type: "STALE_SOCKET",
      message: "Socket file exists but nothing is listening",
      fix: {
        description: "Remove stale socket file",
        execute: async () => {
          await deleteSocketFile(socketPath);
        },
      },
    });
  }

  // 3. Check for stale PID file
  const pid = await readPidFile(pidPath);
  if (pid !== null && !isProcessRunning(pid)) {
    issues.push({
      type: "STALE_PID",
      message: `PID file exists (pid=${pid}) but process is not running`,
      fix: {
        description: "Remove stale PID file",
        execute: async () => {
          await deletePidFile(pidPath);
        },
      },
    });
  }

  // 4. Check version mismatch (only if socket responds and we want to check)
  if (checkVersion && socketResponds) {
    const pingResponse = await pingMCP(socketPath);
    if (pingResponse && pingResponse.protocolVersion !== IPC_PROTOCOL_VERSION) {
      issues.push({
        type: "VERSION_MISMATCH",
        message: `MCP protocol version ${pingResponse.protocolVersion} != CLI version ${IPC_PROTOCOL_VERSION}`,
        fix: {
          description: "Restart MCP server with matching version",
          execute: async () => {
            // Kill the old MCP process
            if (pid !== null) {
              try {
                process.kill(pid, "SIGTERM");
              } catch {
                // Process might already be dead
              }
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            // Clean up stale files
            await deleteSocketFile(socketPath);
            await deletePidFile(pidPath);
          },
        },
      });
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Apply all fixes for the detected issues
 *
 * @param issues - List of issues to fix
 */
export async function applyHealthFixes(issues: HealthIssue[]): Promise<void> {
  for (const issue of issues) {
    await issue.fix.execute();
  }
}
