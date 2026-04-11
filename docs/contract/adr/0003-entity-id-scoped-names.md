# ADR-0003: Entity IDs Use Scoped Names

## Status

Accepted

## Context

Entity IDs need to be stable across code changes. Line-number-based IDs would change whenever code is added above a function, causing issues with:
- Git merges and rebases
- Branch comparisons
- Historical tracking

We needed an ID scheme that:
- Remains stable when unrelated code changes
- Is deterministic (same input produces same ID)
- Works across branches
- Is human-debuggable

## Decision

Use scoped names with content hash for entity IDs.

Format: `repo:pkg:kind:hash(file+scopedName+kind)`

### Scoped Name Examples

- Top-level function: `handleLogin`
- Class method: `AuthService.login`
- Nested function: `processUser.validate`
- Anonymous callback: `users.map.$arg0`

### Options Considered

1. **Line-number based: `repo:pkg:function:file:line`**
   - Pros: Simple to implement
   - Cons: Unstable - changes when lines shift

2. **Scoped-name based: `repo:pkg:kind:hash(file+scopedName+kind)`**
   - Pros: Stable across code shifts, deterministic, debuggable
   - Cons: More complex to implement

3. **UUID per symbol**
   - Pros: Globally unique
   - Cons: Not deterministic, requires persistence

## Consequences

### Positive

- Code above function changes → entity_id STABLE
- Merge/rebase shifts lines → entity_id STABLE
- Same code on different branches → SAME entity_id
- Deterministic: same input always produces same ID

### Negative

- Branch is NOT part of entity_id (by design)
- Renaming a function creates a new entity_id
- Scoped name calculation requires AST traversal

### Neutral

- Storage uses composite key: `(entity_id, branch)`
- Hash portion ensures uniqueness even with same scoped name in different files

## References

- `devac-spec-v2.0-entity-id-lifecycle-analysis.md` - Entity ID stability analysis across scenarios
