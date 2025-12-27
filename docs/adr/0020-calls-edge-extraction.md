# ADR-0020: CALLS Edge Extraction for Function Call Tracking

## Status

Accepted

## Context

DevAC seeds currently extract CONTAINS and EXTENDS edges but lack the ability to track function call relationships. This gap was identified during analysis of the Miami service (GitHub issue #24) when attempting to answer "How does Miami work?" - we couldn't trace which functions call which other functions.

The DevAC vision document (`docs/vision/foundation.md`) explicitly states that seeds should support "Find all callers of X" queries. Without CALLS edges, this fundamental capability is missing.

Key requirements:
1. Track caller → callee relationships
2. Handle various call patterns (simple calls, method calls, chained calls)
3. Include external/built-in calls (console.log, setTimeout, etc.)
4. Preserve source location for navigation
5. Minimal impact on parsing performance

## Decision

Implement CALLS edge extraction in the TypeScript parser using Babel's AST traversal with the following approach:

### 1. Entity Registration
Track function/method entity IDs during parsing so we can identify the "caller" when processing call expressions:
- Store mapping of AST node locations → entity IDs in ParserContext
- Register functions, arrow functions, and class methods when created

### 2. Call Expression Handling
For each `CallExpression` AST node:
- Use `nodePath.getFunctionParent()` to find the enclosing function
- Look up the enclosing function's entity ID (or use file entity for module-level calls)
- Extract callee name from the call expression
- Create CALLS edge with source entity → target entity

### 3. Target Entity ID Format
Use `unresolved:{calleeName}` format for targets since we don't perform type resolution:
- Simple calls: `unresolved:foo`
- Method calls: `unresolved:obj.method`
- Built-in calls: `unresolved:console.log`
- Super calls: `unresolved:super`
- This calls: `unresolved:this.method`

### 4. Edge Properties
Include additional metadata in the edge:
- `callee`: The extracted callee name
- `argumentCount`: Number of arguments passed

## Alternatives Considered

### A. Full Type Resolution
Run TypeScript compiler to resolve actual function references.

**Rejected because:**
- Significant performance overhead
- Requires tsconfig.json and full project setup
- Current Babel-based parser is intentionally fast and standalone
- Can be added later as optional semantic resolution

### B. Scope-based Resolution
Track variable declarations and resolve local references.

**Rejected because:**
- Complex to implement correctly
- Would only work for local calls, not imports
- The `unresolved:` prefix approach is simpler and still useful

### C. Skip External Calls
Only track calls to functions defined in the same file.

**Rejected because:**
- External calls are often the most interesting (AWS SDK, database drivers, HTTP clients)
- M2M communication visibility requires tracking external calls
- The plan explicitly requires including external calls

## Consequences

### Positive
- Enables "find all callers of X" queries
- Supports call graph visualization
- Helps identify M2M communication patterns
- Foundation for impact analysis ("what breaks if I change this function?")
- Relatively simple implementation with good test coverage

### Negative
- Increases seed file size (many more edges)
- All targets are `unresolved:` without type information
- Chained calls like `foo().bar()` may not capture intermediate callee

### Neutral
- Python and C# parsers will need similar implementation
- Semantic resolution can later resolve `unresolved:` targets to actual entity IDs
- Pattern consistent with EXTENDS edges (which also use `unresolved:` for base classes)
