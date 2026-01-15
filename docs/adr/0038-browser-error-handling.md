# ADR-0038: Browser Error Handling Strategy

## Status

Accepted

## Context

Browser automation has multiple failure modes requiring different error handling:

- **Element not found**: Transient (page loading) or permanent (wrong selector)
- **Stale element**: Page changed after ref was obtained
- **Timeout**: Operation took too long
- **Session errors**: No active session, session limit reached
- **Navigation errors**: Invalid URL, page load failed
- **Playwright errors**: Various underlying browser errors

Key questions:
1. Should actions throw exceptions or return error results?
2. How should MCP tools communicate errors to AI agents?
3. What information should error messages contain?

## Decision

Implement a **hybrid error handling strategy**:

### Action Layer (browser-core)
- Return `{ success: boolean; error?: string }` result objects
- Never throw for expected failures (element not found, timeout)
- Include operation context in error message (which ref, which action)

### Custom Error Classes
- `BrowserError` - Base class with error code
- `StaleElementRefError` - Ref no longer valid
- `ElementNotFoundError` - Ref/selector not found
- `SessionNotFoundError` - Session ID invalid
- `SessionLimitError` - Too many sessions
- `NavigationError` - URL/navigation failed
- `TimeoutError` - Operation timed out

### MCP Layer (browser-mcp)
- Transform action results to `MCPToolResult` format
- Always return `{ success, data?, error? }` structure
- Use try-catch to handle unexpected errors gracefully
- Never crash the MCP server on tool errors

### Error Message Guidelines
- Include the operation that failed
- Include relevant identifiers (ref, URL, etc.)
- Suggest corrective action when possible
- Do not assume the cause (e.g., "page may have changed" not "navigation occurred")

## Consequences

### Positive

- Two error patterns allow flexibility for different use cases
- MCP server remains stable even with browser errors
- Error classes enable programmatic error handling
- Descriptive messages help AI agents self-correct

### Negative

- Callers must check success flag, not just catch exceptions
- Dual patterns require documentation clarity
- Error messages must be maintained with code changes

### Neutral

- Trade-off between detailed errors and message length
- Some errors are inherently ambiguous (element not found vs. not visible)

## References

- `packages/browser-core/src/types/index.ts` - Error class definitions
- `packages/browser-core/src/actions/*.ts` - Action result patterns
- `packages/browser-mcp/src/server.ts` - MCP error transformation
