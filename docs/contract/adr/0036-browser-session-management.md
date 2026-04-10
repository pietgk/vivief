# ADR-0036: Browser Session Management Singleton Pattern

## Status

Accepted

## Context

Browser automation requires managing multiple browser instances (sessions), each potentially with multiple pages. Key challenges include:

- **Resource limits**: Preventing runaway browser instances that consume memory
- **Session lifecycle**: Tracking active sessions, handling cleanup on errors
- **Concurrent access**: Multiple tools accessing the same session safely
- **Session timeout**: Cleaning up abandoned sessions automatically
- **Global state**: Need to track "current" session for tools that don't specify one

We considered several patterns:
1. Per-request browser instances (simple but wasteful)
2. Session pool with checkout/checkin (complex for simple use cases)
3. Singleton manager with session registry (balance of simplicity and control)

## Decision

Use a **singleton SessionManager pattern** that:

1. Provides a single point of coordination via `SessionManager.getInstance()`
2. Enforces resource limits (max concurrent sessions, max pages per session)
3. Manages session lifecycle with automatic cleanup
4. Tracks "current" session for implicit session selection
5. Runs periodic cleanup to expire abandoned sessions

Key implementation details:
- Session timeout: 5 minutes of inactivity (configurable)
- Cleanup interval: 15 seconds (with mutex to prevent concurrent cleanups)
- Max concurrent sessions: 3 (configurable)
- Uses `Promise.allSettled` for cleanup to handle partial failures

## Consequences

### Positive

- Single point of coordination for all session operations
- Resource limits prevent runaway browser instances
- Automatic cleanup reduces memory leaks
- "Current session" concept simplifies tool APIs

### Negative

- Singleton pattern can make testing more complex
- Global state requires careful handling in concurrent scenarios
- Cleanup race conditions possible without mutex protection

### Neutral

- Sessions are identified by UUID for uniqueness
- Session info includes start time, URL, page count for monitoring

## References

- `packages/browser-core/src/session/session-manager.ts` - SessionManager implementation
- `packages/browser-core/src/types/index.ts` - SessionConfig, SessionInfo types
- Issue #185 - Race condition fix in cleanup (mutex pattern)
