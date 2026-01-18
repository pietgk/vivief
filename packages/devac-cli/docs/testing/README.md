# Validation Test Suite

> **Vision**: Tests as living documentation—not black boxes, but navigable guides to system behavior.

## Why This Matters

The validation test suite is the foundation of trust for Claude Code integration.
Understandable tests enable:

- **Confident refactoring** — Know what breaks before it breaks
- **Faster onboarding** — New contributors understand intent, not just code
- **Comprehensive coverage** — Visible gaps get filled

## Quick Start

| I want to... | Go to... |
|--------------|----------|
| Understand the architecture | [Architecture Overview](./architecture.md) |
| Use the test harness | [Test Harness API](./test-harness-api.md) |
| Know what fixtures exist | [Fixtures Guide](./fixtures-guide.md) |
| Find integration tests | [Integration Tests](./integration-tests.md) |
| Find E2E tests | [E2E Tests](./e2e-tests.md) |

## Test Layers

```
┌─────────────────────────────────────────────────────────┐
│  E2E Tests          Real CLI + Git + Validation         │
├─────────────────────────────────────────────────────────┤
│  Integration Tests  Harness + Fixtures + Assertions     │
├─────────────────────────────────────────────────────────┤
│  Unit Tests         Mocked validators, isolated logic   │
└─────────────────────────────────────────────────────────┘
```

**31 test files** | **~6,700 lines of test code** | **5 fixture packages**

## Key Files

| Component | Location | Purpose |
|-----------|----------|---------|
| Test Harness | [`devac-core/src/test-harness/`](../../../../devac-core/src/test-harness/) | Workspace creation, assertions |
| Git Simulator | [`git-simulator.ts`](../../../../devac-core/src/test-harness/git-simulator.ts) | Staged/unstaged file simulation |
| Hook Schemas | [`hook-output-schema.ts`](../../../../devac-core/src/test-harness/hook-output-schema.ts) | Zod validation for hook JSON |
| Fixtures | [`fixtures-validation/`](../../../../fixtures-validation/) | Test packages with known errors |
| Integration | [`__tests__/integration/`](../../__tests__/integration/) | Harness-based tests |
| E2E | [`__tests__/e2e/`](../../__tests__/e2e/) | Full CLI execution tests |

## Diagrams

Visual documentation of test architecture and data flows:

- [Test Architecture](./diagrams/test-architecture.md) — Component relationships
- [Validation Flow](./diagrams/validation-flow.md) — How validation tests execute
- [Git Staging Flow](./diagrams/git-staging-flow.md) — Git state management in tests
- [Hook Output Flow](./diagrams/hook-output-flow.md) — Hook JSON processing

## Test Categories

### Unit Tests (24 files)

Core CLI command tests with mocked dependencies:

- `cli.test.ts` — Core CLI commands
- `validate-command.test.ts` — Validation modes (quick/full)
- `hub-*.test.ts` — Hub federation commands (10 files)
- `code-graph-commands.test.ts` — Graph queries
- See [full list](./architecture.md#unit-tests)

### Integration Tests (3 files)

Harness-based tests with real fixtures:

- `hook-output.integration.test.ts` — Hook output schema validation (27 tests)
- `validation-flow.integration.test.ts` — Full validation workflow (16 tests)
- `multi-package.integration.test.ts` — Cross-package scenarios (13 tests)

### E2E Tests (2 files)

Full CLI execution with real Git:

- `cli-hooks.e2e.test.ts` — Hook command execution (8 tests)
- `git-integration.e2e.test.ts` — Git operations (12 tests)

## Fixture Packages

| Fixture | Expected Result | Errors | Use Case |
|---------|-----------------|--------|----------|
| `pkg-clean` | ✓ Pass | 0 | Control fixture, baseline |
| `pkg-ts-errors` | ✗ Fail typecheck | 7 TS errors | TypeScript validation |
| `pkg-lint-errors` | ✗ Fail lint | 10+ violations | Biome validation |
| `pkg-test-failures` | ✗ Fail tests | 7 failures | Test runner validation |
| `pkg-multi-depend` | ✓ Pass (if deps pass) | 0 | Cross-package dependencies |

See [Fixtures Guide](./fixtures-guide.md) for detailed error explanations.

## Quick Usage Example

```typescript
import { ValidationTestHarness } from "@anthropic/devac-core/test-harness";

const harness = new ValidationTestHarness(fixturesPath);

// Create workspace with fixtures
const workspace = await harness.createTempWorkspace({
  fixtures: ["pkg-ts-errors"],
  initGit: true,
  createInitialCommit: true,
});

// Run validation CLI
const result = await execCli(
  ["validate", "--on-stop", "--package", workspace.packages["pkg-ts-errors"]],
  workspace.rootDir
);

// Parse and assert
const parseResult = harness.parseHookOutput(result.stdout);
expect(parseResult.counts.errors).toBeGreaterThan(0);

// Cleanup
await harness.cleanup();
```

## Contributing

When adding new tests:

1. **Choose the right layer** — Unit for isolated logic, Integration for fixtures, E2E for CLI
2. **Use the harness** — Don't reinvent workspace management
3. **Document fixtures** — Update this guide if adding new fixtures
4. **Follow patterns** — See existing tests for conventions
