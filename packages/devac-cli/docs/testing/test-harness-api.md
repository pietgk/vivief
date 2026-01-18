# Test Harness API Reference

Complete API documentation for the validation test harness, Git simulator, and hook output utilities.

## ValidationTestHarness

**Import:**
```typescript
import { ValidationTestHarness, createValidationTestHarness } from "@anthropic/devac-core/test-harness";
```

### Constructor

```typescript
const harness = new ValidationTestHarness(fixturesBasePath: string);
```

**Parameters:**
- `fixturesBasePath` — Absolute path to fixtures directory (typically `fixtures-validation/packages/`)

### Workspace Management

#### createTempWorkspace

Creates a temporary workspace with fixture packages.

```typescript
const workspace = await harness.createTempWorkspace(options: WorkspaceOptions);
```

**Options:**
```typescript
interface WorkspaceOptions {
  fixtures: string[];           // Fixture names to copy (e.g., ["pkg-clean", "pkg-ts-errors"])
  initGit?: boolean;           // Initialize Git repository (default: false)
  createInitialCommit?: boolean; // Create initial commit after init (default: false)
}
```

**Returns:**
```typescript
interface WorkspaceContext {
  rootDir: string;                    // Absolute path to temp workspace
  packages: Record<string, string>;   // Map of fixture name → absolute path
  git: GitSimulator;                  // Git operations helper (if initGit: true)
}
```

**Example:**
```typescript
const workspace = await harness.createTempWorkspace({
  fixtures: ["pkg-clean", "pkg-ts-errors"],
  initGit: true,
  createInitialCommit: true,
});

console.log(workspace.rootDir);              // /tmp/devac-validation-test-abc123
console.log(workspace.packages["pkg-clean"]); // /tmp/devac-validation-test-abc123/pkg-clean
```

#### cleanup

Removes all temporary workspaces created during tests.

```typescript
await harness.cleanup();
```

**Usage:** Call in `afterAll()` or `afterEach()` hooks.

#### cleanupWorkspace

Removes a specific workspace.

```typescript
await harness.cleanupWorkspace(rootDir: string);
```

### File Operations

#### writeFile

Write content to a file in the workspace.

```typescript
await harness.writeFile(filePath: string, content: string);
```

**Parameters:**
- `filePath` — Absolute path to file
- `content` — File content

#### readFile

Read content from a file.

```typescript
const content = await harness.readFile(filePath: string);
```

#### fileExists

Check if a file exists.

```typescript
const exists = await harness.fileExists(filePath: string);
```

### Hook Output Parsing

#### parseHookOutput

Safely parse CLI hook output JSON.

```typescript
const result = harness.parseHookOutput(stdout: string);
```

**Returns:**
```typescript
interface HookAssertionResult {
  valid: boolean;                     // Whether output is valid
  output: HookOutput | null;         // Parsed output (null if empty or invalid)
  error?: string;                     // Error message if parsing failed
  counts: DiagnosticsCounts;          // Extracted error/warning counts
}

interface DiagnosticsCounts {
  errors: number;
  warnings: number;
}
```

**Behavior:**
- Empty output (`""`) returns `{ valid: true, output: null, counts: { errors: 0, warnings: 0 } }`
- Invalid JSON returns `{ valid: false, error: "...", counts: { errors: 0, warnings: 0 } }`
- Valid JSON is schema-validated and counts are extracted from `additionalContext`

**Example:**
```typescript
const result = await execCli(["validate", "--on-stop"], workspaceDir);
const parsed = harness.parseHookOutput(result.stdout);

if (parsed.valid && parsed.output) {
  console.log(`Found ${parsed.counts.errors} errors`);
}
```

### Assertions

#### assertHookOutputValid

Assert that hook output is valid JSON conforming to schema.

```typescript
harness.assertHookOutputValid(stdout: string);
```

**Throws:** Error if output is invalid or doesn't match schema.

#### assertHookOutputEmpty

Assert that hook output is empty (indicating no issues found).

```typescript
harness.assertHookOutputEmpty(stdout: string);
```

**Throws:** Error if output is not empty.

#### assertDiagnosticsCounts

Assert expected error and warning counts.

```typescript
harness.assertDiagnosticsCounts(
  actual: DiagnosticsCounts,
  expected: Partial<DiagnosticsCounts>
);
```

**Example:**
```typescript
const parsed = harness.parseHookOutput(result.stdout);
harness.assertDiagnosticsCounts(parsed.counts, {
  errors: 7,
  warnings: 0,
});
```

#### assertValidationResult

Comprehensive assertion for validation results.

```typescript
harness.assertValidationResult(result: HookAssertionResult, expected: ExpectedResult);
```

---

## GitSimulator

**Import:**
```typescript
import { GitSimulator, execGit } from "@anthropic/devac-core/test-harness";
```

### Constructor

```typescript
const git = new GitSimulator(repoRoot: string);
```

**Parameters:**
- `repoRoot` — Absolute path to Git repository root

### Repository Management

#### init

Initialize a Git repository.

```typescript
await git.init();
```

Equivalent to `git init` + configuring test user.

#### isGitRepo

Check if directory is a Git repository.

```typescript
const isRepo = await git.isGitRepo();
```

#### getRepoRoot

Get the repository root path.

```typescript
const root = git.getRepoRoot();
```

### Staging Operations

#### stageFile

Stage a single file.

```typescript
await git.stageFile(relativePath: string);
```

**Parameters:**
- `relativePath` — Path relative to repository root

**Example:**
```typescript
await git.stageFile("src/index.ts");
await git.stageFile("packages/my-package/error.ts");
```

#### stageAll

Stage all files.

```typescript
await git.stageAll();
```

Equivalent to `git add -A`.

#### unstageFile

Unstage a file.

```typescript
await git.unstageFile(relativePath: string);
```

Equivalent to `git reset HEAD <file>`.

### State Queries

#### getStagedFiles

Get list of staged files.

```typescript
const staged = await git.getStagedFiles();
// Returns: ["src/index.ts", "src/utils.ts"]
```

#### getUnstagedFiles

Get list of modified but unstaged files.

```typescript
const unstaged = await git.getUnstagedFiles();
```

#### getUntrackedFiles

Get list of untracked files.

```typescript
const untracked = await git.getUntrackedFiles();
```

#### getChangedFiles

Get all changed files categorized.

```typescript
const changes = await git.getChangedFiles();
```

**Returns:**
```typescript
interface ChangedFiles {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}
```

### Commit Operations

#### commit

Create a commit.

```typescript
await git.commit(message: string);
```

#### createInitialCommit

Create an initial empty commit.

```typescript
await git.createInitialCommit(message?: string);
```

Default message: `"Initial commit"`.

### Low-Level Git Execution

#### execGit (standalone function)

Execute arbitrary Git commands.

```typescript
import { execGit } from "@anthropic/devac-core/test-harness";

const result = await execGit(args: string[], cwd: string, timeout?: number);
```

**Returns:**
```typescript
interface GitExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}
```

**Example:**
```typescript
const result = await execGit(["status", "--porcelain"], "/path/to/repo");
if (result.success) {
  console.log(result.stdout);
}
```

---

## Hook Output Schema

**Import:**
```typescript
import {
  HookOutputSchema,
  validateHookOutput,
  safeValidateHookOutput,
  extractReminderContent,
  parseDiagnosticsCounts,
  hasIssues,
} from "@anthropic/devac-core/test-harness";
```

### Schema Definitions

#### HookOutputSchema

Zod schema for full hook output.

```typescript
const HookOutputSchema = z.object({
  hookSpecificOutput: z.object({
    hookEventName: z.enum(["UserPromptSubmit", "Stop"]),
    additionalContext: z.string(), // Content wrapped in <system-reminder> tags
  }),
});

type HookOutput = z.infer<typeof HookOutputSchema>;
```

#### DiagnosticsCountsSchema

Zod schema for error/warning counts.

```typescript
const DiagnosticsCountsSchema = z.object({
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
});

type DiagnosticsCounts = z.infer<typeof DiagnosticsCountsSchema>;
```

### Validation Functions

#### validateHookOutput

Validate and parse hook output (throws on error).

```typescript
const output = validateHookOutput(data: unknown);
```

**Returns:** `HookOutput`
**Throws:** `ZodError` if validation fails

#### safeValidateHookOutput

Validate without throwing.

```typescript
const result = safeValidateHookOutput(data: unknown);
```

**Returns:**
```typescript
{ success: true; data: HookOutput } | { success: false; error: ZodError }
```

### Content Extraction

#### extractReminderContent

Extract content from `<system-reminder>` tags.

```typescript
const content = extractReminderContent(additionalContext: string);
```

**Example:**
```typescript
const ctx = "<system-reminder>\n5 errors found\n</system-reminder>";
const content = extractReminderContent(ctx);
// Returns: "5 errors found"
```

**Behavior:**
- Returns content between tags
- Returns empty string if tags not found
- Handles multiline content

#### parseDiagnosticsCounts

Extract error/warning counts from text.

```typescript
const counts = parseDiagnosticsCounts(content: string);
```

**Returns:** `DiagnosticsCounts`

**Parsing Patterns:**
- Errors: `/(\d+)\s+error/i` (case-insensitive)
- Warnings: `/(\d+)\s+warning/i` (case-insensitive)

**Example:**
```typescript
const counts = parseDiagnosticsCounts("Found 7 errors and 3 warnings");
// Returns: { errors: 7, warnings: 3 }

const counts2 = parseDiagnosticsCounts("No issues found");
// Returns: { errors: 0, warnings: 0 }
```

### Status Checking

#### hasIssues

Check if hook output indicates any issues.

```typescript
const hasProblem = hasIssues(hookOutput: HookOutput);
```

**Returns:** `boolean` — `true` if errors > 0 or warnings > 0

---

## Common Patterns

### Full E2E Test Pattern

```typescript
import { ValidationTestHarness } from "@anthropic/devac-core/test-harness";
import { execCli } from "./helpers";

describe("Feature E2E", () => {
  const fixturesPath = path.join(__dirname, "../../../fixtures-validation/packages");
  const harness = new ValidationTestHarness(fixturesPath);

  afterAll(() => harness.cleanup());

  it("detects TypeScript errors", async () => {
    // 1. Create workspace
    const workspace = await harness.createTempWorkspace({
      fixtures: ["pkg-ts-errors"],
      initGit: true,
      createInitialCommit: true,
    });

    // 2. Make changes and stage
    const errorFile = path.join(workspace.packages["pkg-ts-errors"], "src/new-error.ts");
    await harness.writeFile(errorFile, "const x: number = 'string';");
    await workspace.git.stageFile("pkg-ts-errors/src/new-error.ts");

    // 3. Verify staging
    const staged = await workspace.git.getStagedFiles();
    expect(staged).toContain("pkg-ts-errors/src/new-error.ts");

    // 4. Run CLI
    const result = await execCli(
      ["validate", "--on-stop", "--package", workspace.packages["pkg-ts-errors"]],
      workspace.rootDir
    );

    // 5. Parse and assert
    const parsed = harness.parseHookOutput(result.stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.counts.errors).toBeGreaterThan(0);
  });
});
```

### Schema Validation Pattern

```typescript
import {
  validateHookOutput,
  extractReminderContent,
  parseDiagnosticsCounts,
} from "@anthropic/devac-core/test-harness";

function processHookOutput(stdout: string) {
  // Parse JSON
  const json = JSON.parse(stdout);

  // Validate schema
  const output = validateHookOutput(json);

  // Extract content
  const content = extractReminderContent(output.hookSpecificOutput.additionalContext);

  // Get counts
  const counts = parseDiagnosticsCounts(content);

  return { output, content, counts };
}
```

### Git State Testing Pattern

```typescript
it("handles staged and unstaged files", async () => {
  const workspace = await harness.createTempWorkspace({
    fixtures: ["pkg-clean"],
    initGit: true,
    createInitialCommit: true,
  });

  // Create files
  await harness.writeFile(path.join(workspace.rootDir, "staged.ts"), "// staged");
  await harness.writeFile(path.join(workspace.rootDir, "unstaged.ts"), "// unstaged");

  // Stage only one
  await workspace.git.stageFile("staged.ts");

  // Verify state
  const changes = await workspace.git.getChangedFiles();
  expect(changes.staged).toContain("staged.ts");
  expect(changes.untracked).toContain("unstaged.ts");
});
```
