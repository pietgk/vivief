# ADR-0009: Windows Support Deferred

## Status

Accepted

## Context

Windows file locking behavior differs significantly from POSIX systems:
- Files cannot be renamed/deleted while open by another process
- This causes EBUSY errors during atomic write operations
- The atomic write pattern (ADR-0004) may fail on Windows

## Decision

Defer native Windows support to Phase 4+.

### Current State

- macOS and Linux work reliably with atomic writes
- Windows users can use WSL (Windows Subsystem for Linux)
- Core functionality is proven on POSIX systems

### Future Windows Support

When implementing Windows support:
1. Add retry logic for EBUSY errors
2. Implement exponential backoff
3. Consider file locking alternatives
4. Test with common Windows development tools (VS Code, etc.)

## Consequences

### Positive

- Focus development effort on core functionality first
- macOS and Linux cover majority of developer workflows
- WSL provides viable Windows workaround
- Simpler codebase without Windows-specific branches

### Negative

- Native Windows users must use WSL
- May limit adoption in Windows-heavy organizations
- Technical debt to address later

### Neutral

- WSL performance is generally acceptable for development
- Windows support can be added without architectural changes

## References

- See ADR-0004 for atomic write pattern details
- Node.js `fs.rename` behavior on Windows
- WSL documentation for Windows users
