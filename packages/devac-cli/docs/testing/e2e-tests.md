# E2E Tests

This document describes the end-to-end test suite for the DevAC CLI.

## Overview

**Location:** `packages/devac-cli/__tests__/e2e/`

E2E tests spawn real CLI processes and interact with real Git repositories to verify complete user workflows.

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `cli-hooks.e2e.test.ts` | ~8 | Hook command execution |
| `git-integration.e2e.test.ts` | ~12 | Git state management |

---

## cli-hooks.e2e.test.ts

**Purpose:** Verify that CLI hook commands produce correct JSON output for Claude Code integration.

### Test Scenarios

#### Stop Hook Output (4 tests)

Tests for `--on-stop` flag behavior.

| Test | Description | Command |
|------|-------------|---------|
| `produces valid JSON for clean package` | Empty or null output | `devac validate --on-stop --package <clean>` |
| `produces error JSON for ts-errors` | JSON with error counts | `devac validate --on-stop --package <ts-errors>` |
| `includes system-reminder tags` | Output wrapped in XML | `devac validate --on-stop --package <errors>` |
| `reports correct error count` | Count matches fixture | `devac validate --on-stop --package <ts-errors>` |

**Example Test:**
```typescript
it("produces valid JSON for TypeScript errors", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-ts-errors"],
    initGit: true,
    createInitialCommit: true,
  });

  const result = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-ts-errors"]],
    workspace.rootDir,
    { timeout: 30000 }
  );

  expect(result.exitCode).toBe(0);

  const parsed = harness.parseHookOutput(result.stdout);
  expect(parsed.valid).toBe(true);
  expect(parsed.output?.hookSpecificOutput.hookEventName).toBe("Stop");
  expect(parsed.counts.errors).toBeGreaterThanOrEqual(7);
});
```

**Expected Output Format:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "<system-reminder>\nValidation found issues:\n- 7 TypeScript errors in pkg-ts-errors\n\nConsider fixing these before continuing.\n</system-reminder>"
  }
}
```

#### Inject Hook Output (2 tests)

Tests for `--inject` flag behavior (UserPromptSubmit event).

| Test | Description | Command |
|------|-------------|---------|
| `produces UserPromptSubmit event` | Correct event type | `devac validate --inject --package <pkg>` |
| `includes diagnostics summary` | Summary in context | `devac validate --inject` |

**Example Test:**
```typescript
it("produces UserPromptSubmit event for inject hook", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-ts-errors"],
    initGit: true,
    createInitialCommit: true,
  });

  const result = await execCli(
    ["validate", "--inject", "--package", workspace.packages["pkg-ts-errors"]],
    workspace.rootDir
  );

  const parsed = harness.parseHookOutput(result.stdout);
  expect(parsed.output?.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
});
```

#### Validation Modes (2 tests)

Tests for `--mode` flag behavior.

| Test | Description | Command |
|------|-------------|---------|
| `quick mode skips tests` | Faster validation | `devac validate --on-stop --mode quick` |
| `full mode runs all validators` | Complete validation | `devac validate --on-stop --mode full` |

---

## git-integration.e2e.test.ts

**Purpose:** Verify Git-aware validation behavior, including staged file detection.

### Test Scenarios

#### Git Repository Detection (3 tests)

Tests for Git repository awareness.

| Test | Description |
|------|-------------|
| `detects Git repository` | CLI knows it's in a repo |
| `handles non-Git directory` | Graceful fallback |
| `finds repository root` | Correct root detection |

**Example Test:**
```typescript
it("detects Git repository", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean"],
    initGit: true,
  });

  expect(await workspace.git.isGitRepo()).toBe(true);
});
```

#### Staged File Detection (5 tests)

Tests for validating only staged files.

| Test | Description |
|------|-------------|
| `validates staged files only` | Unstaged changes ignored |
| `detects errors in staged files` | New staged errors found |
| `ignores errors in unstaged files` | Unstaged errors not reported |
| `handles mixed staged/unstaged` | Correct filtering |
| `handles no staged changes` | Empty staged list handled |

**Example Test:**
```typescript
it("validates staged files only", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean"],
    initGit: true,
    createInitialCommit: true,
  });

  // Create error file but don't stage it
  const errorFile = path.join(workspace.packages["pkg-clean"], "src/error.ts");
  await harness.writeFile(errorFile, "const x: number = 'string';");

  // Validate - should pass because error is unstaged
  const result = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-clean"]],
    workspace.rootDir
  );

  const parsed = harness.parseHookOutput(result.stdout);
  // Should have zero errors or empty output since error file is not staged
  expect(parsed.counts.errors).toBe(0);
});

it("detects errors in staged files", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean"],
    initGit: true,
    createInitialCommit: true,
  });

  // Create and stage error file
  const errorFile = path.join(workspace.packages["pkg-clean"], "src/error.ts");
  await harness.writeFile(errorFile, "const x: number = 'string';");
  await workspace.git.stageFile("pkg-clean/src/error.ts");

  // Verify staged
  const staged = await workspace.git.getStagedFiles();
  expect(staged.some(f => f.includes("error.ts"))).toBe(true);

  // Validate - should detect error now
  const result = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-clean"]],
    workspace.rootDir
  );

  const parsed = harness.parseHookOutput(result.stdout);
  expect(parsed.counts.errors).toBeGreaterThan(0);
});
```

#### Workspace State (4 tests)

Tests for complex Git workspace states.

| Test | Description |
|------|-------------|
| `handles empty repository` | No commits yet |
| `handles uncommitted changes` | Changes after initial commit |
| `handles multiple packages with changes` | Multi-package workspace |
| `handles partial staging` | Same file staged and modified |

**Example Test:**
```typescript
it("handles partial staging", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean"],
    initGit: true,
    createInitialCommit: true,
  });

  // Create file
  const file = path.join(workspace.packages["pkg-clean"], "src/partial.ts");
  await harness.writeFile(file, "export const valid = 1;");

  // Stage it
  await workspace.git.stageFile("pkg-clean/src/partial.ts");

  // Modify without staging
  await harness.writeFile(file, "export const valid = 1;\nconst x: number = 'error';");

  // Staged version is valid, unstaged has error
  const changes = await workspace.git.getChangedFiles();
  expect(changes.staged).toContain("pkg-clean/src/partial.ts");
  expect(changes.unstaged).toContain("pkg-clean/src/partial.ts");

  // Validation should pass (staged version is valid)
  const result = await execCli(
    ["validate", "--on-stop", "--package", workspace.packages["pkg-clean"]],
    workspace.rootDir
  );

  const parsed = harness.parseHookOutput(result.stdout);
  expect(parsed.counts.errors).toBe(0);
});
```

---

## Running E2E Tests

### Run All E2E Tests

```bash
pnpm test --filter=@anthropic/devac-cli -- --grep="e2e"
```

### Run Specific File

```bash
pnpm test --filter=@anthropic/devac-cli -- cli-hooks.e2e.test.ts
```

### Run with Verbose Output

```bash
DEBUG=devac:* pnpm test --filter=@anthropic/devac-cli -- cli-hooks.e2e.test.ts
```

### Run with Timeout Extension

E2E tests may need longer timeouts:

```bash
pnpm test --filter=@anthropic/devac-cli -- --testTimeout=60000 cli-hooks.e2e.test.ts
```

---

## execCli Helper

E2E tests use a helper function to execute the CLI.

```typescript
interface ExecCliOptions {
  timeout?: number;    // Default: 30000ms
  env?: NodeJS.ProcessEnv;
}

interface ExecCliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function execCli(
  args: string[],
  cwd: string,
  options?: ExecCliOptions
): Promise<ExecCliResult>;
```

**Example Usage:**
```typescript
const result = await execCli(
  ["validate", "--on-stop", "--package", "/path/to/pkg"],
  "/workspace/root",
  { timeout: 60000 }
);

console.log(result.stdout);   // CLI output
console.log(result.exitCode); // Process exit code
```

---

## Adding New E2E Tests

### Template

```typescript
import { ValidationTestHarness } from "@anthropic/devac-core/test-harness";
import { execCli } from "../helpers";
import path from "path";

describe("Feature E2E", () => {
  const fixturesPath = path.join(__dirname, "../../../fixtures-validation/packages");
  const harness = new ValidationTestHarness(fixturesPath);

  afterAll(async () => {
    await harness.cleanup();
  });

  describe("scenario", () => {
    it("should work end-to-end", async () => {
      // 1. Create workspace
      const workspace = await harness.createTempWorkspace({
        fixtures: ["pkg-clean"],
        initGit: true,
        createInitialCommit: true,
      });

      // 2. Optionally modify files
      // await harness.writeFile(...)
      // await workspace.git.stageFile(...)

      // 3. Execute CLI
      const result = await execCli(
        ["command", "--flag"],
        workspace.rootDir,
        { timeout: 30000 }
      );

      // 4. Assert results
      expect(result.exitCode).toBe(0);
      // ...
    });
  });
});
```

### Guidelines

1. **Use realistic scenarios** — Test actual user workflows
2. **Set appropriate timeouts** — E2E tests are slower
3. **Clean up workspaces** — Use harness cleanup
4. **Test exit codes** — Verify process exit status
5. **Parse JSON output** — Use harness.parseHookOutput for hook tests
6. **Document in this file** — Add new tests to the scenario tables

---

## Troubleshooting

### Test Timeouts

If tests timeout:

1. Increase timeout: `{ timeout: 60000 }`
2. Check for hanging processes
3. Verify Git operations complete
4. Check disk space for temp directories

### Git State Issues

If Git state tests fail:

1. Ensure `initGit: true` is set
2. Verify `createInitialCommit: true` for staged file tests
3. Check file paths are relative to repo root
4. Use `workspace.git.getChangedFiles()` to debug state

### JSON Parse Errors

If hook output parsing fails:

1. Check `result.stderr` for CLI errors
2. Verify CLI actually produced output
3. Use `harness.parseHookOutput()` which handles empty output
4. Check for non-JSON output (error messages)
