# @pietgk/browser-mcp

## 0.2.2

### Patch Changes

- fd9bef3: Read package version from package.json at runtime instead of generating
  `src/version.ts` on prebuild. Removes the generation script, the per-package
  `prebuild` hook, and the CI generation step; makes version drift structurally
  impossible. See ADR-0052 (supersedes ADR-0040).
- Updated dependencies [fd9bef3]
  - @pietgk/browser-core@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [9656502]
  - @pietgk/browser-core@0.3.0

## 0.2.0

### Minor Changes

- 66396cd: Add browser automation packages for AI-assisted web interaction

  - **browser-core**: Playwright wrapper with element ref system, session management, and page reading
  - **browser-cli**: Command-line interface for browser automation
  - **browser-mcp**: MCP server exposing browser tools to AI assistants

### Patch Changes

- Updated dependencies [66396cd]
  - @pietgk/browser-core@0.2.0
