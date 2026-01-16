import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("version", () => {
  it("VERSION matches package.json", () => {
    const pkgPath = join(__dirname, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(VERSION).toBe(pkg.version);
  });
});
