# ADR-0039: Browser Automation Test Strategy

## Status

Accepted

## Context

Testing browser automation code presents unique challenges:

- **Playwright dependency**: Real browser tests are slow and flaky
- **UI state**: Browser state is complex and hard to mock comprehensively
- **Async operations**: Many operations involve waiting and timeouts
- **Integration complexity**: Full stack testing requires session management

We needed to balance:
1. Test speed and reliability in CI
2. Confidence that code works with real browsers
3. Developer experience (fast feedback loop)
4. Coverage of edge cases and error conditions

## Decision

Implement a **layered test strategy**:

### Unit Tests with Mocked Playwright
- Mock Playwright locators and page objects
- Test business logic without browser overhead
- Fast execution (~50ms per file)
- Cover all code paths including error cases

```typescript
const mockLocator = {
  click: vi.fn().mockResolvedValue(undefined),
  textContent: vi.fn().mockResolvedValue("text"),
};
```

### Test Coverage Requirements
- **Actions**: All action functions (click, type, fill, scroll, etc.)
- **Page Reading**: Element extraction, ref generation
- **Session Management**: Create, close, cleanup, limits
- **MCP Handlers**: Input validation, error responses
- **Screenshot Manager**: Capture, cleanup, path validation

### Integration Tests (Optional/Manual)
- Real browser tests for critical paths
- Run manually or in dedicated CI job
- Not part of standard `pnpm test`

### Test File Organization
- Co-locate tests with source: `__tests__/*.test.ts`
- One test file per major module
- Shared mock utilities in test files

## Consequences

### Positive

- Fast CI pipeline (~1 second for all tests)
- Reliable tests that don't flake
- Easy to test edge cases and errors
- Good developer experience

### Negative

- Mocked tests may miss Playwright behavior changes
- Some browser quirks only caught in real tests
- Mock maintenance burden as APIs change

### Neutral

- Trade-off between speed and realism
- Tests verify contract, not implementation details

## References

- `packages/browser-core/__tests__/*.test.ts` - Unit tests
- `packages/browser-mcp/__tests__/*.test.ts` - MCP handler tests
- `vitest.config.ts` - Test configuration
