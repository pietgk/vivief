# Integration Tests

This document describes the integration test suite, organized by test file with scenario breakdowns.

## Overview

**Location:** `packages/devac-cli/__tests__/integration/`

Integration tests verify component interaction using the test harness with real fixtures. They sit between unit tests (mocked) and E2E tests (full CLI).

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `hook-output.integration.test.ts` | ~27 | Hook output schema and parsing |
| `validation-flow.integration.test.ts` | ~16 | Full validation workflow |
| `multi-package.integration.test.ts` | ~13 | Cross-package dependencies |

---

## hook-output.integration.test.ts

**Purpose:** Validate hook output JSON schema, parsing utilities, and content extraction.

### Test Categories

#### Schema Validation (7 tests)

Tests that the hook output conforms to expected JSON structure.

| Test | Description |
|------|-------------|
| `validates correct Stop event output` | Valid JSON with hookEventName="Stop" |
| `validates correct UserPromptSubmit event output` | Valid JSON with hookEventName="UserPromptSubmit" |
| `rejects missing hookSpecificOutput` | Schema error for missing required field |
| `rejects invalid hookEventName` | Schema error for unknown event type |
| `rejects missing additionalContext` | Schema error for missing context |
| `rejects non-string additionalContext` | Type validation for context field |
| `validates empty additionalContext` | Allows empty string as valid |

**Example Test:**
```typescript
it("validates correct Stop event output", () => {
  const output = {
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: "<system-reminder>Test</system-reminder>",
    },
  };

  expect(() => validateHookOutput(output)).not.toThrow();
});
```

#### Content Extraction (6 tests)

Tests for extracting content from `<system-reminder>` tags.

| Test | Description |
|------|-------------|
| `extracts content from system-reminder tags` | Basic extraction |
| `handles multiline content` | Content with newlines |
| `returns empty for missing tags` | No tags present |
| `handles nested content` | Content with inner tags |
| `trims whitespace` | Removes leading/trailing whitespace |
| `handles empty tags` | Empty system-reminder tags |

**Example Test:**
```typescript
it("extracts content from system-reminder tags", () => {
  const context = "<system-reminder>\nValidation found 5 errors\n</system-reminder>";
  const content = extractReminderContent(context);
  expect(content).toBe("Validation found 5 errors");
});
```

#### Count Parsing (8 tests)

Tests for extracting error/warning counts from text.

| Test | Description |
|------|-------------|
| `parses error count` | Extracts number before "error" |
| `parses warning count` | Extracts number before "warning" |
| `parses both counts` | Extracts errors and warnings |
| `handles zero counts` | Returns 0 when not mentioned |
| `case insensitive matching` | "Error" vs "error" |
| `handles plural forms` | "errors" and "warnings" |
| `handles large numbers` | Multi-digit counts |
| `handles no issues text` | Returns zeros for clean output |

**Example Test:**
```typescript
it("parses both error and warning counts", () => {
  const content = "Found 7 errors and 3 warnings in validation";
  const counts = parseDiagnosticsCounts(content);
  expect(counts).toEqual({ errors: 7, warnings: 3 });
});
```

#### Harness Integration (6 tests)

Tests for `ValidationTestHarness.parseHookOutput()` method.

| Test | Description |
|------|-------------|
| `parses valid hook output` | Returns valid=true with parsed data |
| `handles empty output` | Empty string returns valid with null output |
| `handles invalid JSON` | Returns valid=false with error |
| `handles schema validation errors` | Returns valid=false for bad schema |
| `extracts counts from valid output` | Counts are populated from content |
| `returns zero counts for empty output` | Empty implies no issues |

**Example Test:**
```typescript
it("handles empty output as success", () => {
  const result = harness.parseHookOutput("");
  expect(result.valid).toBe(true);
  expect(result.output).toBeNull();
  expect(result.counts).toEqual({ errors: 0, warnings: 0 });
});
```

---

## validation-flow.integration.test.ts

**Purpose:** Test the full validation workflow from workspace creation to result assertion.

### Test Categories

#### Workspace Creation (4 tests)

Tests for `createTempWorkspace()` functionality.

| Test | Description |
|------|-------------|
| `creates temp directory` | Directory exists after creation |
| `copies fixture packages` | All specified fixtures copied |
| `initializes Git when requested` | Git repo created with initGit=true |
| `creates initial commit` | Commit exists with createInitialCommit=true |

**Example Test:**
```typescript
it("creates temp directory with fixtures", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean", "pkg-ts-errors"],
    initGit: true,
  });

  expect(fs.existsSync(workspace.rootDir)).toBe(true);
  expect(fs.existsSync(workspace.packages["pkg-clean"])).toBe(true);
  expect(fs.existsSync(workspace.packages["pkg-ts-errors"])).toBe(true);
});
```

#### Git Operations (5 tests)

Tests for `GitSimulator` integration with workspaces.

| Test | Description |
|------|-------------|
| `stages files correctly` | stageFile() adds to Git index |
| `queries staged files` | getStagedFiles() returns staged list |
| `queries unstaged files` | getUnstagedFiles() returns modified unstaged |
| `queries untracked files` | getUntrackedFiles() returns new files |
| `categorizes all changes` | getChangedFiles() returns all categories |

**Example Test:**
```typescript
it("stages and queries files", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean"],
    initGit: true,
    createInitialCommit: true,
  });

  // Create new file
  await harness.writeFile(
    path.join(workspace.packages["pkg-clean"], "src/new.ts"),
    "export const x = 1;"
  );

  // Stage it
  await workspace.git.stageFile("pkg-clean/src/new.ts");

  // Verify
  const staged = await workspace.git.getStagedFiles();
  expect(staged).toContain("pkg-clean/src/new.ts");
});
```

#### Validation Execution (4 tests)

Tests for running validation and parsing results.

| Test | Description |
|------|-------------|
| `validates clean package` | pkg-clean returns no errors |
| `detects TypeScript errors` | pkg-ts-errors returns expected count |
| `detects lint errors` | pkg-lint-errors returns violations |
| `handles mixed results` | Multiple packages with different results |

**Example Test:**
```typescript
it("detects TypeScript errors in fixture", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-ts-errors"],
    initGit: true,
    createInitialCommit: true,
  });

  const result = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-ts-errors"]],
    workspace.rootDir
  );

  const parsed = harness.parseHookOutput(result.stdout);
  expect(parsed.valid).toBe(true);
  expect(parsed.counts.errors).toBeGreaterThanOrEqual(7);
});
```

#### Cleanup (3 tests)

Tests for workspace cleanup.

| Test | Description |
|------|-------------|
| `cleans up single workspace` | cleanupWorkspace() removes directory |
| `cleans up all workspaces` | cleanup() removes all created directories |
| `handles missing workspace` | No error for already-deleted workspace |

---

## multi-package.integration.test.ts

**Purpose:** Test scenarios involving multiple packages and cross-package dependencies.

### Test Categories

#### Multi-Package Workspace (4 tests)

Tests for workspaces with multiple fixture packages.

| Test | Description |
|------|-------------|
| `creates workspace with multiple packages` | All packages accessible |
| `maintains package isolation` | Errors in one don't affect others |
| `supports package dependencies` | pkg-multi-depend finds pkg-clean |
| `validates all packages` | Can validate entire workspace |

**Example Test:**
```typescript
it("maintains package isolation", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean", "pkg-ts-errors"],
    initGit: true,
  });

  // Validate clean package - should pass
  const cleanResult = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-clean"]],
    workspace.rootDir
  );
  const cleanParsed = harness.parseHookOutput(cleanResult.stdout);
  expect(cleanParsed.counts.errors).toBe(0);

  // Validate error package - should fail
  const errorResult = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-ts-errors"]],
    workspace.rootDir
  );
  const errorParsed = harness.parseHookOutput(errorResult.stdout);
  expect(errorParsed.counts.errors).toBeGreaterThan(0);
});
```

#### Dependency Scenarios (5 tests)

Tests for cross-package dependency handling.

| Test | Description |
|------|-------------|
| `resolves workspace dependencies` | pkg-multi-depend imports pkg-clean |
| `detects dependency errors` | Error in dep affects dependent |
| `supports affected flag` | --affected finds dependent packages |
| `handles circular dependencies` | No infinite loop |
| `validates dependency graph` | Correct order of validation |

**Example Test:**
```typescript
it("resolves workspace dependencies", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean", "pkg-multi-depend"],
    initGit: true,
  });

  // pkg-multi-depend should compile because pkg-clean is valid
  const result = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-multi-depend"]],
    workspace.rootDir
  );

  const parsed = harness.parseHookOutput(result.stdout);
  expect(parsed.counts.errors).toBe(0);
});
```

#### Workspace Structure (4 tests)

Tests for workspace discovery and structure detection.

| Test | Description |
|------|-------------|
| `discovers all packages` | Finds all fixture packages |
| `determines workspace root` | Correct root detection |
| `handles nested packages` | Packages in subdirectories |
| `identifies package managers` | Detects pnpm/npm/yarn workspace |

---

## Running Integration Tests

### Run All Integration Tests

```bash
pnpm test --filter=@pietgk/devac-cli -- --grep="integration"
```

### Run Specific File

```bash
pnpm test --filter=@pietgk/devac-cli -- hook-output.integration.test.ts
```

### Run with Coverage

```bash
pnpm test --filter=@pietgk/devac-cli -- --coverage --grep="integration"
```

### Debug Mode

```bash
DEBUG=devac:* pnpm test --filter=@pietgk/devac-cli -- hook-output.integration.test.ts
```

---

## Adding New Integration Tests

### Template

```typescript
import { ValidationTestHarness } from "@pietgk/devac-core/test-harness";
import { execCli } from "../helpers";
import path from "path";

describe("Feature Integration", () => {
  const fixturesPath = path.join(__dirname, "../../../fixtures-validation");
  const harness = new ValidationTestHarness(fixturesPath);

  afterAll(async () => {
    await harness.cleanup();
  });

  describe("scenario category", () => {
    it("should behave as expected", async () => {
      // 1. Setup workspace
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // 2. Perform actions
      // ...

      // 3. Assert results
      // ...
    });
  });
});
```

### Guidelines

1. **Use the harness** — Don't create temp directories manually
2. **Clean up** — Always call `harness.cleanup()` in `afterAll`
3. **Document scenarios** — Add tests to this documentation
4. **Use real fixtures** — Prefer fixtures over inline test data
5. **Test one thing** — Each test should verify one behavior
