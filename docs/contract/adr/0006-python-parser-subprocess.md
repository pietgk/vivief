# ADR-0006: Python Parser via Subprocess

## Status

Accepted with known trade-offs

## Context

We need to parse Python files for structural analysis. Python has unique features (significant whitespace, dynamic typing) that make accurate parsing important.

The parsing approach needs to:
- Produce accurate AST representation
- Work without requiring Python installation for basic operation
- Support future optimization paths

## Decision

Use Python subprocess with native `ast` module for now, with warm worker pool as future optimization.

### Options Considered

1. **tree-sitter-python (fast, no semantic info)**
   - Pros: Fast (~10ms), no Python dependency
   - Cons: Limited semantic information, less accurate for complex cases

2. **Python subprocess with `ast` module (accurate, slow)**
   - Pros: Most accurate, uses Python's own parser
   - Cons: 200-500ms latency per invocation

3. **WASM Python interpreter (moderate)**
   - Pros: No system Python needed
   - Cons: Complex setup, moderate performance

4. **Long-running Python worker pool (fast after warmup)**
   - Pros: Fast after initial warmup, accurate
   - Cons: More complex implementation

## Consequences

### Positive

- Native `ast` module is the most accurate Python parser
- Simple implementation - just spawn subprocess
- 200-500ms latency is acceptable for initial implementation
- Clear optimization path (worker pool) when needed

### Negative

- Python parsing is slower than TypeScript parsing
- Requires Python to be installed for Python file analysis
- Cold start latency on first parse

### Neutral

- Worker pool optimization can be added in future phase
- Graceful degradation if Python not available

## References

- Python `ast` module documentation
- Future optimization: implement worker pool pattern from Node.js child_process
