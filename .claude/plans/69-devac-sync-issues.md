# Plan: devac sync has 2 issues on my current workspace

> **Issue:** [#69](https://github.com/pietgk/vivief/issues/69)
> **Status:** COMPLETE
> **Created:** 2026-01-03
> **Completed:** 2026-01-03

## Problem Statement

`devac sync` had 2 issues:

1. **npm-private-packages not correctly analyzed** - Only 1 package discovered instead of ~18
2. **aws_infra_map_neo4j confusing error** - "Run devac analyze first" but Python repos couldn't be analyzed

## Root Causes

1. **Issue 1**: No pnpm-workspace.yaml or workspaces field → fell back to single-package mode
2. **Issue 2**: Python discovery only found pyproject.toml, not requirements.txt repos

## Implementation

### Changes Made

1. **`packages/devac-core/src/workspace/package-manager.ts`**
   - Added `discoverFromFallbackPatterns()` function with patterns: `packages/*`, `apps/*`, `libs/*`, `services/*`
   - Updated `discoverJSPackages()` to try fallback patterns before single-package mode
   - Updated `discoverPythonPackages()` to discover `requirements.txt` repos with `.py` files

2. **`packages/devac-core/__tests__/workspace/package-manager.test.ts`**
   - Added 7 new tests for fallback discovery behaviors

### Verification

- All 28 package-manager tests pass
- All 315 tests pass across all packages
- Typecheck passes
- Lint passes

