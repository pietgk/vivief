# ADR-0037: Browser MCP Tool Naming and Schema Conventions

## Status

Accepted

## Context

The browser automation MCP server exposes tools for AI agents. Tool naming and schema design significantly impact usability:

- **Discoverability**: AI agents need to find relevant tools quickly
- **Consistency**: Similar tools should follow similar patterns
- **Clarity**: Tool names should convey their purpose
- **Validation**: Schemas should prevent invalid inputs

We considered several naming conventions:
1. `browser.<category>.<action>` (namespaced but verbose)
2. `browser_<action>` (simple but may lack context)
3. `browser_<noun>_<verb>` (balanced, descriptive)

## Decision

Adopt the following conventions for browser MCP tools:

### Naming Convention
- Pattern: `browser_<category>` or `browser_<action>`
- All tools start with `browser_` prefix
- Use snake_case for multi-word names
- Examples: `browser_session_start`, `browser_click`, `browser_read_page`

### Schema Conventions
- All schemas use `type: "object"`
- Required parameters listed in `required` array
- Optional parameters have sensible defaults
- Use `enum` for constrained string values
- Nested objects have explicit `properties` and `required`

### Parameter Patterns
- `ref` - Element reference (string, required for element actions)
- `url` - URL with format validation
- `timeout` - Milliseconds with minimum constraint
- `direction` - Enum of valid values

### Input Validation
- All handlers validate required parameters before use
- Type-specific validators: `validateRef()`, `validateUrl()`, `validateRequiredString()`
- Descriptive error messages indicating parameter name and issue

## Consequences

### Positive

- Consistent naming makes tools predictable for AI agents
- Explicit schemas enable better client-side validation
- Validation prevents crashes from invalid inputs
- Error messages help agents self-correct

### Negative

- Some tools have dual behaviors (e.g., `browser_scroll` with/without ref)
- Verbose names for simple actions

### Neutral

- Tool count will grow as features are added
- Schema complexity matches capability complexity

## References

- `packages/browser-mcp/src/tools/index.ts` - Tool definitions
- `packages/browser-mcp/src/server.ts` - Input validation helpers
- `CLAUDE.md` - Browser MCP tool documentation
