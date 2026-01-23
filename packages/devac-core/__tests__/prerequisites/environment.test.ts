/**
 * Environment Prerequisites Tests
 *
 * Tests for environment checks in the prerequisites module.
 */

import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkHubNotLocked, checkNodeVersion } from "../../src/prerequisites/environment.js";

describe("checkHubNotLocked", () => {
  let testHubDir: string;

  beforeEach(async () => {
    testHubDir = await fs.mkdtemp(path.join(tmpdir(), "devac-prereq-test-"));
  });

  afterEach(async () => {
    await fs.rm(testHubDir, { recursive: true, force: true });
  });

  it("returns passed=true when no MCP socket exists", async () => {
    const result = await checkHubNotLocked(testHubDir);

    expect(result.passed).toBe(true);
    expect(result.id).toBe("hub_writable");
    expect(result.category).toBe("hub");
    expect(result.required).toBe(false);
    expect(result.message).toBe("Hub is available for writing");
  });

  it("returns passed=false when MCP socket exists", async () => {
    // Simulate MCP running by creating socket file
    const socketPath = path.join(testHubDir, "mcp.sock");
    await fs.writeFile(socketPath, "");

    const result = await checkHubNotLocked(testHubDir);

    expect(result.passed).toBe(false);
    expect(result.id).toBe("hub_writable");
    expect(result.category).toBe("hub");
    expect(result.required).toBe(false);
    expect(result.message).toContain("MCP");
    expect(result.detail).toContain("MCP server is running");
  });

  it("includes helpful detail about what happens when locked", async () => {
    // Simulate MCP running by creating socket file
    const socketPath = path.join(testHubDir, "mcp.sock");
    await fs.writeFile(socketPath, "");

    const result = await checkHubNotLocked(testHubDir);

    expect(result.detail).toContain("exclusive access");
    expect(result.detail).toContain("locally");
  });
});

describe("checkNodeVersion", () => {
  it("returns passed=true for current Node version", () => {
    const result = checkNodeVersion();

    // We're running on a valid Node version, so this should pass
    expect(result.passed).toBe(true);
    expect(result.id).toBe("node_version");
    expect(result.category).toBe("environment");
    expect(result.required).toBe(true);
  });

  it("includes version info in detail", () => {
    const result = checkNodeVersion();

    expect(result.detail).toContain(process.version);
  });
});
