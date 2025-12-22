/**
 * Version Guardrail Test
 *
 * Ensures the CLI version matches package.json to prevent version drift.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

describe("version", () => {
  it("VERSION export matches package.json version", () => {
    expect(VERSION).toBe(pkg.version);
  });

  it("VERSION is a valid semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });
});
