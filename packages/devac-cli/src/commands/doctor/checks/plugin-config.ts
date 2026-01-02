/**
 * Plugin Configuration Checks
 *
 * Verify that Claude plugin configuration files are valid.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CheckContext, CheckResult, HealthCheck } from "../types.js";

/**
 * Check plugin.json validity
 */
const pluginJsonCheck: HealthCheck = {
  id: "plugin-json",
  name: "Plugin config",
  category: "plugin-config",
  requiresWorkspace: true,
  async run(context: CheckContext): Promise<CheckResult> {
    if (!context.isDevacWorkspace || !context.workspaceRoot) {
      return {
        id: "plugin-json",
        name: "Plugin config",
        status: "skip",
        message: "not in devac workspace",
        category: "plugin-config",
      };
    }

    const pluginPath = path.join(context.workspaceRoot, "plugins/devac/.claude-plugin/plugin.json");

    try {
      const content = await fs.readFile(pluginPath, "utf-8");
      const parsed = JSON.parse(content);

      // Validate required fields
      if (!parsed.name || !parsed.version) {
        return {
          id: "plugin-json",
          name: "Plugin config",
          status: "fail",
          message: "missing required fields",
          details: "plugin.json must have 'name' and 'version' fields",
          category: "plugin-config",
        };
      }

      return {
        id: "plugin-json",
        name: "Plugin config",
        status: "pass",
        message: `${parsed.name} v${parsed.version}`,
        category: "plugin-config",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          id: "plugin-json",
          name: "Plugin config",
          status: "fail",
          message: "plugin.json not found",
          category: "plugin-config",
        };
      }

      return {
        id: "plugin-json",
        name: "Plugin config",
        status: "fail",
        message: "parse error",
        details: error instanceof Error ? error.message : String(error),
        category: "plugin-config",
      };
    }
  },
};

/**
 * Check .mcp.json validity
 */
const mcpJsonCheck: HealthCheck = {
  id: "mcp-json",
  name: "MCP config",
  category: "plugin-config",
  requiresWorkspace: true,
  async run(context: CheckContext): Promise<CheckResult> {
    if (!context.isDevacWorkspace || !context.workspaceRoot) {
      return {
        id: "mcp-json",
        name: "MCP config",
        status: "skip",
        message: "not in devac workspace",
        category: "plugin-config",
      };
    }

    const mcpPath = path.join(context.workspaceRoot, "plugins/devac/.mcp.json");

    try {
      const content = await fs.readFile(mcpPath, "utf-8");
      const parsed = JSON.parse(content);

      // Validate mcpServers structure
      if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
        return {
          id: "mcp-json",
          name: "MCP config",
          status: "fail",
          message: "invalid structure",
          details: ".mcp.json must have 'mcpServers' object",
          category: "plugin-config",
        };
      }

      // Check if devac server is configured
      if (!parsed.mcpServers.devac) {
        return {
          id: "mcp-json",
          name: "MCP config",
          status: "warn",
          message: "devac server not configured",
          details: "Expected 'mcpServers.devac' configuration",
          category: "plugin-config",
        };
      }

      const devacConfig = parsed.mcpServers.devac;
      if (!devacConfig.command || !devacConfig.args) {
        return {
          id: "mcp-json",
          name: "MCP config",
          status: "warn",
          message: "incomplete devac config",
          details: "devac server config should have 'command' and 'args'",
          category: "plugin-config",
        };
      }

      return {
        id: "mcp-json",
        name: "MCP config",
        status: "pass",
        message: "valid",
        category: "plugin-config",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          id: "mcp-json",
          name: "MCP config",
          status: "fail",
          message: ".mcp.json not found",
          category: "plugin-config",
        };
      }

      return {
        id: "mcp-json",
        name: "MCP config",
        status: "fail",
        message: "parse error",
        details: error instanceof Error ? error.message : String(error),
        category: "plugin-config",
      };
    }
  },
};

/**
 * All plugin configuration checks
 */
export const pluginConfigChecks: HealthCheck[] = [pluginJsonCheck, mcpJsonCheck];
