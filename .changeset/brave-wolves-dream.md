---
"@pietgk/devac-core": minor
---

Add Effect schema types with Zod for v3.0 foundation

Defines the Effect type system based on DevAC v3.0 Foundation (Sections 5.3-5.5):

**Code Effects** - What code does:
- `FunctionCall` - Code execution (method calls, function invocations)
- `Store` - Data persistence (database writes, cache sets)
- `Retrieve` - Data fetching (database reads, cache gets)
- `Send` - External communication (HTTP requests, emails)
- `Request` / `Response` - API boundary effects
- `Condition` / `Loop` - Control flow effects
- `Group` - Organizational boundaries (C4 diagrams)

**Workflow Effects** - Development activity:
- `FileChanged` - Filesystem watch triggers
- `SeedUpdated` - Extraction complete events
- `ValidationResult` - Check pass/fail with diagnostics
- `IssueClaimed` / `PRMerged` - GitHub workflow events
- `ChangeRequested` - Human/LLM action routing

Includes:
- Zod schemas for runtime validation
- TypeScript types inferred from schemas
- Helper functions (`createFunctionCallEffect`, `createValidationResultEffect`, etc.)
- Type guards (`isCodeEffect`, `isWorkflowEffect`)
- `parseEffect` / `safeParseEffect` for unknown data validation
