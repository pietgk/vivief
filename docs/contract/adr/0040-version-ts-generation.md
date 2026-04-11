# ADR-0040: Version.ts Generation Pattern

## Status

Accepted

## Context

Each package needs to expose its version at runtime (e.g., for `--version` CLI flag, MCP server metadata). The version must:

1. Be available as a TypeScript constant (not require file I/O at runtime)
2. Stay in sync with `package.json` automatically
3. Work in both development and published packages
4. Not require manual updates when bumping versions

The challenge is that `package.json` is the source of truth for version, but TypeScript code needs a compile-time constant.

## Decision

Generate `version.ts` files from `package.json` using a prebuild npm hook:

1. **Generation script**: `scripts/generate-version.mjs` reads `package.json` and writes `src/version.ts`
2. **Prebuild hook**: Each package has `"prebuild": "node ../../scripts/generate-version.mjs ."` in `package.json`
3. **Gitignore**: Generated files are ignored via `packages/*/src/version.ts` in `.gitignore`
4. **CI generation**: CI workflow generates version files before typecheck/build
5. **Test guardrails**: Each package has a test verifying `VERSION` matches `package.json`

### Generated file format

```typescript
// This file is auto-generated. Do not edit manually.
export const VERSION = "0.24.4";
```

### CI workflow

```yaml
- name: Generate version files
  run: |
    for pkg in packages/browser-* packages/devac-*; do
      if [ -d "$pkg/src" ]; then
        node scripts/generate-version.mjs "$pkg"
      fi
    done
```

## Consequences

### Positive

- Single source of truth (`package.json`)
- No runtime file I/O needed
- Version is type-safe and tree-shakeable
- Prebuild hook makes it automatic in normal development
- Test guardrails catch drift if generation is skipped

### Negative

- CI must explicitly generate files before typecheck
- New packages must add the prebuild hook manually
- Files appear as "untracked" locally until first build

### Neutral

- Generated files are not committed (reduces noise in diffs, but requires CI awareness)

## Alternatives Considered

### 1. Commit version.ts to git

Would require a mechanism to keep files in sync (pre-commit hook or CI check). Adds noise to diffs when bumping versions across many packages.

### 2. Read package.json at runtime

```typescript
import { readFileSync } from "fs";
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
export const VERSION = pkg.version;
```

Problems:
- Complex path resolution in ESM (especially for published packages)
- Runtime file I/O on every startup
- Bundlers may not include package.json

### 3. Use npm_package_version environment variable

```typescript
export const VERSION = process.env.npm_package_version ?? "unknown";
```

Problems:
- Only populated when running via npm scripts
- Doesn't work with direct `node dist/index.js` execution
- Doesn't work in published packages run by consumers

## References

- PR #190: Fixed CI to include browser-* packages in version generation
- `scripts/generate-version.mjs`: The generation script
- Test files: `packages/*/___tests__/version.test.ts`
