# Test Architecture Diagram

This diagram shows the component relationships in the validation test infrastructure.

## Architecture Overview

```mermaid
graph TB
    subgraph "Test Layers"
        E2E["E2E Tests<br/>cli-hooks.e2e.test.ts<br/>git-integration.e2e.test.ts"]
        INT["Integration Tests<br/>hook-output.integration.test.ts<br/>validation-flow.integration.test.ts<br/>multi-package.integration.test.ts"]
        UNIT["Unit Tests<br/>(24 test files with mocked dependencies)"]
    end

    subgraph "Test Infrastructure"
        HARNESS["ValidationTestHarness<br/>• createTempWorkspace()<br/>• parseHookOutput()<br/>• assertValidationResult()<br/>• cleanup()"]
        GIT["GitSimulator<br/>• stageFile()<br/>• getStagedFiles()<br/>• getChangedFiles()<br/>• commit()"]
        SCHEMA["Hook Output Schema<br/>• HookOutputSchema<br/>• validateHookOutput()<br/>• parseDiagnosticsCounts()<br/>• extractReminderContent()"]
    end

    subgraph "Test Fixtures"
        CLEAN["pkg-clean<br/>✓ No errors<br/>(control)"]
        TS["pkg-ts-errors<br/>✗ 7 type errors<br/>(TypeScript)"]
        LINT["pkg-lint-errors<br/>✗ 10+ violations<br/>(Biome)"]
        TEST["pkg-test-failures<br/>✗ 7 failing tests<br/>(Vitest)"]
        MULTI["pkg-multi-depend<br/>→ depends on pkg-clean<br/>(cross-package)"]
    end

    subgraph "CLI & Validators"
        CLI["devac CLI<br/>validate command"]
        TSC["TypeScript<br/>Compiler"]
        BIOME["Biome<br/>Linter"]
        VITEST["Vitest<br/>Test Runner"]
    end

    E2E --> HARNESS
    E2E --> GIT
    E2E --> CLI
    INT --> HARNESS
    INT --> SCHEMA

    HARNESS --> CLEAN
    HARNESS --> TS
    HARNESS --> LINT
    HARNESS --> TEST
    HARNESS --> MULTI

    CLI --> TSC
    CLI --> BIOME
    CLI --> VITEST

    style E2E fill:#e1f5fe
    style INT fill:#fff3e0
    style UNIT fill:#f3e5f5
    style HARNESS fill:#e8f5e9
    style GIT fill:#e8f5e9
    style SCHEMA fill:#e8f5e9
```

## Component Descriptions

### Test Layers

| Layer | Purpose | Speed | Confidence |
|-------|---------|-------|------------|
| E2E | Full process execution | Slowest | Highest |
| Integration | Component interaction | Medium | High |
| Unit | Isolated logic | Fastest | Targeted |

### Test Infrastructure

| Component | Location | Responsibility |
|-----------|----------|----------------|
| ValidationTestHarness | `devac-core/src/test-harness/validation-harness.ts` | Workspace management, assertions |
| GitSimulator | `devac-core/src/test-harness/git-simulator.ts` | Git operations |
| Hook Output Schema | `devac-core/src/test-harness/hook-output-schema.ts` | Output validation |

### Test Fixtures

| Fixture | Error Count | Validation Type |
|---------|-------------|-----------------|
| pkg-clean | 0 | Control/baseline |
| pkg-ts-errors | 7 | TypeScript |
| pkg-lint-errors | 10+ | Biome linting |
| pkg-test-failures | 7 | Test runner |
| pkg-multi-depend | 0 | Dependencies |

## Data Flow

```
Fixtures → Test Harness → Temp Workspace → CLI → Validators → JSON Output → Assertions
```

See [Validation Flow Diagram](./validation-flow.md) for detailed sequence.
