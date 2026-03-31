# ADR-0035: Browser Element Reference Hybrid Strategy

## Status

Accepted

## Context

AI agents interacting with web pages need a stable way to identify and reference elements across page states. Traditional approaches (XPath, CSS selectors) have significant drawbacks:

- **XPath**: Brittle, breaks with minor DOM changes, verbose
- **CSS selectors**: Often not unique, require context to disambiguate
- **Sequential numbering**: Not meaningful, changes when page content changes
- **DOM path references**: Verbose, break with structural changes

The browser automation packages need a reference system that is:
1. Deterministic when possible (same element = same ref across runs)
2. Human-readable for AI agents to understand context
3. Stable enough to survive minor page changes
4. Efficient to look up without re-scanning the entire DOM

## Decision

Implement a **hybrid element reference strategy** with the following priority:

1. **testId** - `data-testid` attribute (most deterministic)
   - Example: `submit-btn` from `data-testid="submit-btn"`
   
2. **ariaLabel** - Unique `aria-label` attribute
   - Example: `close_dialog` from `aria-label="Close dialog"`
   - Normalized: lowercase, spaces to underscores
   
3. **role:name** - Semantic ref from ARIA role + accessible name
   - Example: `button:Submit`, `link:Learn More`
   - Best balance of stability and readability
   
4. **fallback** - Context-aware sequential ref
   - Example: `form_1:button_2`
   - Uses parent landmark context for disambiguation

The system maintains a ref registry per page that maps refs to CSS selectors. Refs are invalidated on navigation or significant DOM changes, with a version number to detect stale refs.

## Consequences

### Positive

- Applications with `data-testid` attributes get fully deterministic refs
- ARIA-based refs are readable and convey semantic meaning to AI agents
- Fallback refs use parent context for better disambiguation
- Ref version system enables detection of stale refs

### Negative

- Pages without testIds or good ARIA attributes get less stable refs
- Fallback refs can change when elements are added/removed
- Ref registry must be invalidated on navigation, requiring re-scan

### Neutral

- Some refs may be longer than simple sequential numbers
- Trade-off between stability (testId) and zero-config (fallback)

## References

- `packages/browser-core/src/reader/element-ref.ts` - Ref generation logic
- `packages/browser-core/src/session/page-context.ts` - Ref registry
- `packages/browser-core/src/types/index.ts` - ElementRef type definition
