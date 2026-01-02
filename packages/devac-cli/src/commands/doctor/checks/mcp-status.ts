/**
 * MCP Status Checks
 *
 * Verify the MCP server socket status.
 */

import * as fs from "node:fs/promises";
import * as net from "node:net";
import { IPC_CONNECT_TIMEOUT_MS, getSocketPath } from "@pietgk/devac-core";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

/**
 * Check if socket is responsive
 */
async function checkSocketResponsive(socketPath: string): Promise<boolean> {
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
 * Check MCP server socket status
 */
const mcpSocketCheck: HealthCheck = {
  id: "mcp-socket-status",
  name: "MCP server",
  category: "mcp-status",
  requiresWorkspace: false,
  async run(context: CheckContext): Promise<CheckResult> {
    const socketPath = getSocketPath(context.hubDir);

    // Check if socket file exists
    try {
      await fs.access(socketPath);
    } catch {
      // Socket doesn't exist - MCP not running, which is fine
      return {
        id: "mcp-socket-status",
        name: "MCP server",
        status: "pass",
        message: "not running (socket not found)",
        category: "mcp-status",
      };
    }

    // Socket exists, check if responsive
    const isResponsive = await checkSocketResponsive(socketPath);

    if (isResponsive) {
      return {
        id: "mcp-socket-status",
        name: "MCP server",
        status: "pass",
        message: "running and responsive",
        category: "mcp-status",
      };
    }

    // Socket exists but not responsive - stale socket
    return {
      id: "mcp-socket-status",
      name: "MCP server",
      status: "warn",
      message: "stale socket file",
      details: "Socket file exists but MCP is not responding. File may be stale.",
      fixable: true,
      fixCommand: `rm "${socketPath}"`,
      category: "mcp-status",
    };
  },
};

/**
 * All MCP status checks
 */
export const mcpStatusChecks: HealthCheck[] = [mcpSocketCheck];
