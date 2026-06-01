import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

/**
 * Package version, read at runtime from package.json — the single source of truth.
 *
 * package.json sits one level above this module in both `src/` (tests) and the
 * compiled `dist/` output, so `../package.json` resolves in every context.
 * See docs/contract/adr/0052-version-from-package-json-runtime.md.
 */
export const VERSION: string = pkg.version;
