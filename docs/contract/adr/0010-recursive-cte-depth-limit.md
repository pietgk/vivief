# ADR-0010: Recursive CTE Depth Limit

## Status

Accepted

## Context

With DuckDB replacing Neo4j (ADR-0001), graph traversal queries use recursive CTEs instead of Cypher. Recursive CTEs have performance characteristics that degrade exponentially with depth:

- Depth 1-2: ~50ms
- Depth 3-4: ~200-500ms
- Depth 5-6: ~1-5s (acceptable for interactive use)
- Depth 7+: May timeout, unpredictable performance

## Decision

Cap recursive CTE depth at 6 for interactive queries.

### Implementation

```sql
WITH RECURSIVE call_graph AS (
  -- Base case
  SELECT entity_id, 1 as depth
  FROM nodes WHERE entity_id = $start
  
  UNION ALL
  
  -- Recursive case with depth limit
  SELECT e.target_entity_id, cg.depth + 1
  FROM call_graph cg
  JOIN edges e ON e.source_entity_id = cg.entity_id
  WHERE cg.depth < 6  -- Depth limit
)
SELECT * FROM call_graph;
```

## Consequences

### Positive

- Predictable query performance for interactive use
- 6 hops covers most practical use cases (caller → callee chains)
- Prevents runaway queries that could hang the system
- Clear user expectations about query capabilities

### Negative

- Deep call chains beyond 6 hops not traversable interactively
- Some valid queries may hit the limit
- Users need awareness of the limitation

### Neutral

- Deeper queries can use batch mode with longer timeouts
- Future optimization: pre-compute transitive closure for common patterns
- Limit can be made configurable per-query if needed

## References

- DuckDB recursive CTE documentation
- See ADR-0001 for why we use CTEs instead of Cypher
