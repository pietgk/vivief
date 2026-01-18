# Test Architecture

This document describes the layered test architecture, component relationships, and when to use each testing approach.

## Architecture Overview

See [Test Architecture Diagram](./diagrams/test-architecture.md) for the visual representation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              E2E Tests                                       │
│         Real CLI process + Real Git + Real Validation + Real Filesystem     │
│                                                                              │
│  • cli-hooks.e2e.test.ts         — Hook command execution                   │
│  • git-integration.e2e.test.ts   — Git state management                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Integration Tests                                   │
│           Test Harness + Real Fixtures + Schema Validation                  │
│                                                                              │
│  • hook-output.integration.test.ts      — Hook JSON schema (27 tests)       │
│  • validation-flow.integration.test.ts  — Validation workflow (16 tests)    │
│  • multi-package.integration.test.ts    — Dependencies (13 tests)           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Unit Tests                                       │
│                  Mocked dependencies, isolated logic                         │
│                                                                              │
│  • CLI command tests (cli.test.ts, validate-command.test.ts, ...)           │
│  • Hub tests (hub-init.test.ts, hub-register.test.ts, ...)                  │
│  • Graph tests (code-graph-commands.test.ts, affected-command.test.ts)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Test Infrastructure Components

### ValidationTestHarness

**Location:** `devac-core/src/test-harness/validation-harness.ts`

The central testing utility providing:

- **Workspace Management** — Create/destroy temporary test directories
- **Fixture Copying** — Copy fixture packages to test workspaces
- **Hook Output Parsing** — Parse and validate CLI JSON output
- **Assertions** — Typed assertion helpers for validation results

### GitSimulator

**Location:** `devac-core/src/test-harness/git-simulator.ts`

Git operations for testing staged file scenarios:

- **Repository Setup** — Initialize Git repos in test workspaces
- **File Staging** — Stage/unstage files programmatically
- **State Queries** — Get staged, unstaged, and untracked files

### Hook Output Schema

**Location:** `devac-core/src/test-harness/hook-output-schema.ts`

Zod schemas for validating CLI hook output:

- **HookOutputSchema** — Main output structure
- **DiagnosticsCountsSchema** — Error/warning counts
- **Utilities** — Content extraction and count parsing

### Fixture Packages

**Location:** `fixtures-validation/`

Pre-built packages with intentional errors:

- `pkg-clean` — No errors (control)
- `pkg-ts-errors` — TypeScript errors
- `pkg-lint-errors` — Biome lint violations
- `pkg-test-failures` — Failing tests
- `pkg-multi-depend` — Cross-package dependencies

## Data Flow

```
┌──────────────┐    ┌───────────────┐    ┌─────────────────┐
│   Fixtures   │───▶│  Test Harness │───▶│  Temp Workspace │
│              │    │               │    │                 │
│ pkg-clean    │    │ createTemp    │    │ /tmp/devac-xxx  │
│ pkg-ts-errors│    │ Workspace()   │    │   └── fixtures/ │
└──────────────┘    └───────────────┘    └─────────────────┘
                                                  │
                                                  ▼
                    ┌───────────────┐    ┌─────────────────┐
                    │  Git Simulator│◀───│    Git Init     │
                    │               │    │  + Initial      │
                    │ stageFile()   │    │    Commit       │
                    │ getStagedFiles│    └─────────────────┘
                    └───────────────┘
                            │
                            ▼
                    ┌───────────────┐    ┌─────────────────┐
                    │   CLI Exec    │───▶│  Hook Output    │
                    │               │    │     JSON        │
                    │ devac validate│    │                 │
                    │ --on-stop     │    │ {hookSpecific.. │
                    └───────────────┘    └─────────────────┘
                                                  │
                                                  ▼
                    ┌───────────────┐    ┌─────────────────┐
                    │  Parse + Validate│◀─│ Test Assertions │
                    │               │    │                 │
                    │ parseHookOutput│   │ expect(counts)  │
                    │ validateSchema │   │   .errors > 0   │
                    └───────────────┘    └─────────────────┘
```

## Layer Responsibilities

### E2E Tests

**Purpose:** Verify the entire CLI works end-to-end from process spawn to output.

**Characteristics:**
- Spawns actual Node process with CLI
- Uses real Git operations
- Tests actual file system interactions
- Slowest but highest confidence

**When to Use:**
- Testing CLI argument parsing
- Verifying hook output format
- Testing Git-specific behavior
- Validating user-facing commands

**Example Files:**
- `cli-hooks.e2e.test.ts` — Tests `--on-stop` and `--inject` hooks
- `git-integration.e2e.test.ts` — Tests staged file detection

### Integration Tests

**Purpose:** Verify components work together with real fixtures but controlled environment.

**Characteristics:**
- Uses test harness for workspace management
- Real fixture packages with known errors
- Schema validation of outputs
- Moderate speed, good coverage

**When to Use:**
- Testing validation workflow end-to-end
- Verifying error detection and counting
- Testing cross-package scenarios
- Validating hook output schema

**Example Files:**
- `hook-output.integration.test.ts` — Schema validation (27 tests)
- `validation-flow.integration.test.ts` — Full workflow (16 tests)
- `multi-package.integration.test.ts` — Dependencies (13 tests)

### Unit Tests

**Purpose:** Test isolated logic with mocked dependencies.

**Characteristics:**
- Fast execution
- Mocked file system and validators
- Tests specific functions in isolation
- Highest quantity of tests

**When to Use:**
- Testing pure functions
- Verifying command parsing
- Testing error handling logic
- Validating configuration processing

**Example Files:**
- `cli.test.ts` — Core CLI commands
- `validate-command.test.ts` — Validation modes
- `hub-*.test.ts` — Hub federation commands

## Unit Tests

The 24 unit test files cover:

### CLI Commands
- `cli.test.ts` — Core CLI entry point
- `validate-command.test.ts` — Validation with quick/full modes
- `status-command.test.ts` — Status reporting
- `version.test.ts` — Version output
- `cli-output.test.ts` — Output formatting
- `command-aliases.test.ts` — Command aliases

### Hub Federation
- `hub-init.test.ts` — Initialize hub
- `hub-register.test.ts` — Register repositories
- `hub-unregister.test.ts` — Deregister repositories
- `hub-status.test.ts` — Hub status
- `hub-list.test.ts` — List repositories
- `hub-refresh.test.ts` — Refresh hub data
- `hub-query.test.ts` — SQL queries
- `hub-diagnostics.test.ts` — Diagnostics
- `hub-errors.test.ts` — Error handling
- `hub-summary.test.ts` — Summary info

### Code Analysis
- `code-graph-commands.test.ts` — Graph queries
- `affected-command.test.ts` — Affected files
- `architecture.test.ts` — Architecture visualization

### Other
- `sync.test.ts` — Sync functionality
- `watch.test.ts` — Watch mode
- `workspace-discovery.test.ts` — Workspace detection
- `performance.test.ts` — Performance metrics
- `mcp-command.test.ts` — MCP server

## Choosing the Right Layer

| Scenario | Recommended Layer | Reason |
|----------|-------------------|--------|
| Testing CLI argument parsing | E2E | Need real process |
| Verifying hook JSON format | E2E or Integration | Need real output |
| Testing error detection | Integration | Need real fixtures |
| Testing pure utility function | Unit | No dependencies |
| Testing cross-package deps | Integration | Need multiple fixtures |
| Testing Git staging | E2E | Need real Git |
| Testing command logic | Unit | Can mock dependencies |

## Adding New Tests

### New E2E Test
```typescript
// __tests__/e2e/new-feature.e2e.test.ts
import { ValidationTestHarness } from "@anthropic/devac-core/test-harness";

describe("New Feature E2E", () => {
  const harness = new ValidationTestHarness(fixturesPath);

  afterAll(() => harness.cleanup());

  it("should work end-to-end", async () => {
    const workspace = await harness.createTempWorkspace({
      fixtures: ["pkg-clean"],
      initGit: true,
    });

    // Execute real CLI and assert
  });
});
```

### New Integration Test
```typescript
// __tests__/integration/new-flow.integration.test.ts
import { ValidationTestHarness } from "@anthropic/devac-core/test-harness";

describe("New Flow Integration", () => {
  const harness = new ValidationTestHarness(fixturesPath);

  afterAll(() => harness.cleanup());

  it("should validate correctly", async () => {
    const workspace = await harness.createTempWorkspace({
      fixtures: ["pkg-ts-errors"],
    });

    // Use harness assertions
  });
});
```

### New Unit Test
```typescript
// __tests__/new-feature.test.ts
import { myFunction } from "../src/my-feature";

describe("myFunction", () => {
  it("should return expected result", () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```
