# Effects Architecture Skill

Generate verified architecture documentation using the effectHandler pattern.

## Foundational Principle

```
effectHandler = (State, Effect) => (State', [Effects'])
```

**Verified sources:**
- @docs/vision/concepts.md:15 - Core definition
- @docs/vision/foundation.md:22 - Equivalence principle
- @docs/adr/0015-conceptual-foundation.md:24-28 - ADR formalization

## Triggers

This skill activates when users ask about:
- "explain effects", "how do effects work"
- "generate architecture doc", "document effects architecture"
- "verify this documentation"
- "what is an effectHandler"

## Capabilities

### 1. Answer Effect Questions
Use conceptual framework + DevAC tools to answer accurately.
Always verify claims against source documents.

### 2. Generate Verified Documentation
Create documents like how-are-effects-handled-v4.md with:
- Confidence markers (HIGH/MEDIUM/LOW/N/A)
- Source verification (file:line references)
- Complete enumerations (apply M1)
- Generic-first explanations (apply M2)

### 3. Apply Quality Rules
Before finalizing any output, check against M1-M4 rules.
See @knowledge/quality-rules.md

### 4. Use Tacit Insights
Incorporate knowledge not detectable from code/DevAC.
See @knowledge/tacit-insights.md

## Knowledge Sources

| Source | Purpose |
|--------|---------|
| @knowledge/tacit-insights.md | Insights not in code/docs |
| @knowledge/quality-rules.md | M1-M4 meta-rules |
| @examples/effects/how-are-effects-handled-v4.md | Reference output (clean, M1-M4 compliant) |
| @examples/effects/how-are-effects-handled-v3.md | Historical version (has known issues) |
| @examples/effects/prompts.md | Prompt evolution |
| @examples/effects/v3-mistakes-analysis.md | Lessons learned |
| @docs/vision/concepts.md | Conceptual foundation |

## Workflow

### For Questions
1. Read tacit-insights.md for knowledge not in DevAC
2. Query DevAC tools for code-level data
3. Verify against source documentation with file:line
4. Answer with confidence markers

### For Document Generation
1. Read all knowledge sources
2. Query DevAC for effects, nodes, edges, schema
3. Apply M1 before any enumeration (check set completeness)
4. Apply M2 for any concept explanation (generic -> varieties -> example)
5. Add confidence markers to all claims
6. Include Data Sources chapter with verification commands

## CLI Commands

```bash
# Query effects
devac effects list -p <package>

# Query schema
devac query "SELECT * FROM effects LIMIT 5"

# Get file symbols
devac file-symbols <path>
```

## MCP Tools

- `query_effects` - Query raw effects
- `get_schema` - Get table structure
- `run_rules` - Execute handler dispatch
- `list_rules` - Show available rules

## Example Interaction

**User:** "How do effects work in DevAC?"

**Response approach:**
1. Read @knowledge/tacit-insights.md for Parser-as-Handler, AST-as-State
2. Start with generic definition from concepts.md:15
3. Show implementation varieties (M2): pattern matching, AST traversal, direct transformation
4. Give specific example: RuleEngine
5. Mark confidence levels
6. Cite sources with file:line

**User:** "Generate architecture documentation for effects"

**Response approach:**
1. Use @examples/effects/how-are-effects-handled-v4.md as template
2. Query DevAC for current data
3. Apply M1: count sets before listing (4 parquet files, list all 4)
4. Apply M2: define concepts generically before examples
5. Include Data Sources chapter
6. Add verification commands

## Notes

- Always read tacit-insights.md before answering effect questions
- Apply M1-M4 rules to all generated documentation
- Reference existing example docs rather than duplicating
- Mark confidence: HIGH (source code), MEDIUM (MCP), LOW (inferred), N/A (planned)
