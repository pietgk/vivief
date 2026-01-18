# Validation Flow Diagram

This sequence diagram shows how validation tests execute from setup to assertion.

## Validation Test Execution Flow

```mermaid
sequenceDiagram
    participant Test as Test Case
    participant Harness as ValidationTestHarness
    participant TempDir as /tmp workspace
    participant Git as GitSimulator
    participant CLI as devac CLI
    participant Validator as Validators (tsc/biome)

    Note over Test,Validator: Setup Phase

    Test->>Harness: createTempWorkspace({<br/>fixtures: ["pkg-ts-errors"],<br/>initGit: true,<br/>createInitialCommit: true<br/>})

    Harness->>TempDir: mkdir /tmp/devac-validation-test-XXX
    Harness->>TempDir: copy fixture files from fixtures-validation/
    Harness->>Git: git init
    Git->>TempDir: git config user.email "test@test.com"
    Git->>TempDir: git config user.name "Test"
    Harness->>Git: git add -A
    Git->>TempDir: git commit -m "Initial commit"

    Harness-->>Test: WorkspaceContext {<br/>rootDir: "/tmp/devac-...",<br/>packages: { "pkg-ts-errors": "..." },<br/>git: GitSimulator<br/>}

    Note over Test,Validator: Modification Phase (Optional)

    Test->>TempDir: writeFile("src/error.ts", "bad code")
    Test->>Git: stageFile("pkg-ts-errors/src/error.ts")
    Git->>TempDir: git add pkg-ts-errors/src/error.ts

    Note over Test,Validator: Execution Phase

    Test->>CLI: execCli(["validate", "--on-stop",<br/>"--package", packagePath])

    CLI->>Git: getStagedFiles()
    Git-->>CLI: ["src/error.ts", ...]

    CLI->>Validator: typecheck(package)
    Validator-->>CLI: TypeScript issues[]

    CLI->>Validator: lint(package)
    Validator-->>CLI: Biome issues[]

    CLI->>CLI: formatForHook(result, "Stop")
    CLI-->>Test: stdout: JSON hook output

    Note over Test,Validator: Assertion Phase

    Test->>Harness: parseHookOutput(stdout)
    Harness->>Harness: JSON.parse(stdout)
    Harness->>Harness: HookOutputSchema.safeParse(json)
    Harness->>Harness: extractReminderContent(context)
    Harness->>Harness: parseDiagnosticsCounts(content)

    Harness-->>Test: HookAssertionResult {<br/>valid: true,<br/>output: HookOutput,<br/>counts: { errors: 7, warnings: 0 }<br/>}

    Test->>Test: expect(counts.errors).toBe(7)

    Note over Test,Validator: Cleanup Phase

    Test->>Harness: cleanup()
    Harness->>TempDir: rm -rf /tmp/devac-validation-test-XXX
```

## Flow Phases

### 1. Setup Phase

The test harness:
1. Creates a unique temporary directory
2. Copies fixture packages into the workspace
3. Initializes Git repository (if requested)
4. Creates initial commit (if requested)
5. Returns a `WorkspaceContext` with paths and Git simulator

### 2. Modification Phase (Optional)

Tests may:
1. Write new files with errors
2. Modify existing files
3. Stage changes with Git
4. Create complex Git states (staged/unstaged/untracked)

### 3. Execution Phase

The CLI:
1. Determines which files to validate (staged or all)
2. Runs TypeScript compiler for type checking
3. Runs Biome for linting
4. Formats results as hook JSON output
5. Outputs to stdout

### 4. Assertion Phase

The test:
1. Captures CLI stdout
2. Parses JSON with the harness
3. Validates schema compliance
4. Extracts diagnostic counts
5. Asserts expected results

### 5. Cleanup Phase

The harness:
1. Removes temporary directories
2. Frees disk space
3. Prevents test pollution

## Key Data Structures

### WorkspaceContext

```typescript
{
  rootDir: "/tmp/devac-validation-test-abc123",
  packages: {
    "pkg-ts-errors": "/tmp/devac-validation-test-abc123/pkg-ts-errors"
  },
  git: GitSimulator
}
```

### HookAssertionResult

```typescript
{
  valid: true,
  output: {
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: "<system-reminder>...</system-reminder>"
    }
  },
  counts: {
    errors: 7,
    warnings: 0
  }
}
```
