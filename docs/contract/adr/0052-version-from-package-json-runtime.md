# ADR-0052: Read Package Version from package.json at Runtime

## Status

Accepted (supersedes [ADR-0040](0040-version-ts-generation.md))

## Context

Each package exposes its version at runtime (CLI `--version`, MCP server metadata)
via a `VERSION` constant in `src/version.ts`. ADR-0040 generated that file from
`package.json` using a `prebuild` hook, gitignored it, and guarded it with a test
asserting `VERSION === package.json.version`.

In practice this drifted. `version.ts` is only regenerated on **`prebuild`**, but:

- `changeset version` bumps `package.json` without rebuilding.
- The pre-push hook and per-package `pnpm --filter <pkg> test` run the package's
  `pretest` (which only kills stray vitest processes), then `vitest` — against a
  **stale** generated `version.ts`.

The result was a recurring failure: after a version bump, the guardrail test goes
red across every package that hasn't been rebuilt, blocking pushes for a reason
unrelated to the change at hand. ADR-0040's own "Negative" section predicted this
("New packages must add the prebuild hook manually", "CI must explicitly generate").

ADR-0040 considered reading `package.json` at runtime and rejected it on three
grounds. Each is now moot:

1. **"Complex path resolution in ESM"** — resolved by `createRequire(import.meta.url)`
   + `require("../package.json")`. All packages use a uniform `rootDir: src` /
   `outDir: dist` layout, so `package.json` sits exactly one level above
   `version.ts` in both `src/` (tests) and `dist/` (published). The codebase
   already proves this pattern — the guardrail test itself used it to read
   `package.json`.
2. **"Runtime file I/O on every startup"** — a single synchronous, module-cached
   JSON read at load time; negligible for CLI/MCP startup.
3. **"Bundlers may not include package.json"** — these packages ship unbundled
   `tsc` output, with `package.json` always at the package root.

## Decision

Make `src/version.ts` a committed source file that reads `package.json` at runtime:

```typescript
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
```

Concretely:

1. **Delete the generator** (`scripts/generate-version.mjs`) and the per-package
   `prebuild` hook.
2. **Commit `version.ts`** — remove `packages/*/src/version.ts` from `.gitignore`.
3. **Remove the CI "Generate version files" step.**
4. **Keep the guardrail tests** — they now pass trivially and still catch a
   regression if someone reintroduces a hardcoded constant.

`package.json` remains the single source of truth; there is no longer a derived
artifact that can fall out of sync.

## Consequences

### Positive

- **Drift is structurally impossible** — there is no generated copy to go stale.
  Bumping a version needs no rebuild, no regeneration, no CI step.
- Fewer moving parts: no generator script, no prebuild hook, no gitignore entry,
  no CI generation step.
- New packages get correct behaviour by copying one `version.ts`; nothing to wire.

### Negative

- A single synchronous `require("../package.json")` at module load (cached).
- The relative path depends on the `rootDir: src` / `outDir: dist` layout; a
  package that changes its build layout must keep `package.json` one level above
  the compiled `version.js` (or adjust the path).

### Neutral

- `version.ts` is now tracked in git. The version value itself is not written
  there, so version bumps don't touch it — diffs stay clean.

## References

- Supersedes ADR-0040 (version.ts generation pattern)
- `packages/*/src/version.ts`: the runtime-read module
- `packages/*/__tests__/version.test.ts`: guardrail tests (retained)
