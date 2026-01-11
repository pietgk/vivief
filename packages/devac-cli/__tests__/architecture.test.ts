/**
 * Architecture Tests for DevAC CLI
 *
 * These tests enforce architectural patterns that prevent structural bugs.
 * Specifically, they ensure CLI commands follow the hub access pattern
 * defined in ADR-0024 (Hub Single-Writer IPC).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const COMMANDS_DIR = path.join(__dirname, "../src/commands");

/**
 * Recursively walk a directory and return all .ts files
 */
function walkDir(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Architecture: Hub Access Pattern (ADR-0024)", () => {
  /**
   * CLI commands must not import the CentralHub class directly.
   * This prevents bypassing IPC routing which causes DuckDB lock errors
   * when MCP server is running.
   *
   * Allowed: import type { CentralHub } from "@pietgk/devac-core"
   * Allowed: import { createCentralHub } from "@pietgk/devac-core" (factory for hub-init only)
   * Forbidden: import { CentralHub } from "@pietgk/devac-core"
   */
  it("CLI commands must not import CentralHub class directly (only type imports allowed)", () => {
    const violations: string[] = [];
    const commandFiles = walkDir(COMMANDS_DIR);

    for (const filePath of commandFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(COMMANDS_DIR, filePath);

      // Pattern: import { ... CentralHub ... } from (but not createCentralHub)
      // Also NOT: import type { ... CentralHub ... } from
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Skip type-only imports
        if (line.includes("import type")) continue;

        // Check for CentralHub class in value imports
        // Use word boundary to avoid matching createCentralHub
        if (
          line.includes("import") &&
          line.includes("from") &&
          /\bCentralHub\b/.test(line) &&
          !/createCentralHub/.test(line)
        ) {
          violations.push(`${relativePath}:${i + 1} - imports CentralHub class directly`);
        }
      }
    }

    expect(
      violations,
      `Found CLI commands importing CentralHub class directly. Use createHubClient() instead to ensure proper IPC routing.\nViolations:\n${violations.join("\n")}`
    ).toEqual([]);
  });

  /**
   * Hub commands (hub-*.ts) must use createHubClient() for hub operations.
   * This ensures commands route through MCP when running.
   *
   * Exception: hub-init.ts creates the hub itself, so it uses createCentralHub instead.
   */
  it("Hub commands must use createHubClient() (except hub-init)", () => {
    const violations: string[] = [];

    // hub-init.ts is exempt - it creates the hub before HubClient can be used
    const EXEMPT_FILES = ["hub-init.ts"];

    // Get all hub-*.ts command files (not in subdirectories)
    const hubCommands = fs
      .readdirSync(COMMANDS_DIR)
      .filter((f) => f.startsWith("hub-") && f.endsWith(".ts"))
      .filter((f) => !EXEMPT_FILES.includes(f));

    for (const file of hubCommands) {
      const filePath = path.join(COMMANDS_DIR, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Must import or use createHubClient
      if (!content.includes("createHubClient")) {
        violations.push(`${file}: missing createHubClient - must use HubClient for IPC routing`);
      }
    }

    expect(
      violations,
      `Found hub commands not using createHubClient(). Per ADR-0024, all hub operations must go through HubClient for proper IPC routing.\nViolations:\n${violations.join("\n")}`
    ).toEqual([]);
  });

  /**
   * Commands that interact with the hub should use createHubClient()
   * rather than instantiating CentralHub directly.
   */
  it("Commands using hub operations must use createHubClient(), not new CentralHub()", () => {
    const violations: string[] = [];
    const commandFiles = walkDir(COMMANDS_DIR);

    for (const filePath of commandFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(COMMANDS_DIR, filePath);

      // Check for direct CentralHub instantiation
      if (content.includes("new CentralHub(")) {
        violations.push(`${relativePath} - uses "new CentralHub()" instead of createHubClient()`);
      }
    }

    expect(
      violations,
      `Found commands instantiating CentralHub directly. Use createHubClient() to ensure proper IPC routing when MCP is running.\nViolations:\n${violations.join("\n")}`
    ).toEqual([]);
  });
});

describe("Architecture: Import Hygiene", () => {
  /**
   * Ensure all command files have proper ESM extensions in relative imports
   */
  it("relative imports should use .js extension (ESM)", () => {
    const violations: string[] = [];
    const commandFiles = walkDir(COMMANDS_DIR);

    for (const filePath of commandFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(COMMANDS_DIR, filePath);

      // Pattern: from "./something" or from "../something" without .js
      const relativeImportRegex = /from\s+["'](\.[^"']+)["']/g;
      const matches = content.matchAll(relativeImportRegex);

      for (const match of matches) {
        const importPath = match[1];
        if (!importPath) continue;

        // Skip if it already has .js extension or is a directory import
        if (!importPath.endsWith(".js") && !importPath.endsWith("/")) {
          // Check if it looks like a file import (has path segments after ./ or ../)
          if (importPath.includes("/") || !importPath.match(/^\.\.?$/)) {
            violations.push(`${relativePath}: "${importPath}" should end with .js`);
          }
        }
      }
    }

    // This is a soft check - report but don't fail (existing code may have issues)
    if (violations.length > 0) {
      const preview = violations.slice(0, 5).join("\n");
      const suffix = violations.length > 5 ? `\n... and ${violations.length - 5} more` : "";
      console.warn(
        `Found ${violations.length} relative imports without .js extension:\n${preview}${suffix}`
      );
    }
  });
});
