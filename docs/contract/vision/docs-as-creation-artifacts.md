# Docs as Creation Artifacts

> Documentation as first-class creation artifacts that move through the vivief lifecycle, form a queryable graph, and compound through the factory loop.

**Origin**: [archived doc-discovery brainstorm](../../archive/brainstorms/doc-discovery.md) — prompted by REVIEW.md finding that 230+ docs are invisible to DevAC.

**Related Documents**:
- [fractal-software-factory.md](fractal-software-factory.md) — the factory loop that applies to docs
- [creation-loop-extensions.md](creation-loop-extensions.md) — aperture, context-as-fractal
- [vivief-concepts-v6.md](../vivief-concepts-v6.md) — five concepts, creation loop

## Related Decisions

*(Placeholder — ADR for doc-as-entity implementation will be listed here.)*

---

## Summary

Vivief's docs are creation artifacts — they move through intent→contract→fact, they reference each other, and they compound through the factory loop. But they're invisible to DevAC, the tool that makes the codebase queryable. This vision describes what it means to treat docs as first-class entities.

## The Problem

DevAC can query code entities (functions, classes, edges, effects) but cannot see the 250+ markdown files that contain the design decisions, concept definitions, and architectural reasoning behind that code. The fractal software factory claims "every persistent datom is a potential skill" — yet the docs that explain *why* the code exists are opaque.

A counselor's session notes become datoms. A developer's code becomes nodes and edges. The design documents are not.

---

## Docs Have Lifecycle

Documentation follows the same creation lifecycle as all vivief artifacts:

| Stage | Meaning | Folder | Mutability |
|-------|---------|--------|------------|
| **Intent** | Open brainstorm, exploration, hypothesis | `intent/` | Evolving |
| **Contract** | Locked decision, vision, or specification | `contract/` | Append-only |
| **Fact** | Implemented reality, tracks code | `fact/` | Tracks code |
| **Story** | Narrative arc, evolution history | `story/` | Append-only |
| **Archive** | Historical, superseded, completed | `archive/` | Frozen |

This lifecycle is already implicit in the folder structure. Making it explicit as trackable metadata (frontmatter `status:` field) enables:
- Querying: "show all intent docs that haven't been touched in 30 days"
- Validation: "this contract/ doc has no `last-verified` date"
- Routing: "new contributors start with fact/, experienced contributors with intent/"

## Docs Have Relationships

Cross-references between docs form a graph:

| Relationship | Example | Direction |
|-------------|---------|-----------|
| **motivates** | Vision doc → ADR it produced | Forward |
| **summarizes** | Claude window → human-version doc | Bidirectional (via `human-version:` frontmatter) |
| **supersedes** | New concept version → old version | Forward |
| **depends-on** | Claude window → windows it requires as context | Forward |
| **references** | Any markdown link between docs | Bidirectional |
| **archives** | Archive note → original location | Backward |

These relationships are already encoded in markdown links and frontmatter fields. Extracting them into a queryable graph enables:
- Broken link detection (edges where target doesn't exist)
- Impact analysis ("if I change this ADR, which docs reference it?")
- Orphan detection ("which docs have no incoming references?")
- Lifecycle tracking ("this intent doc has 5 dependents — it should be locked")

## Docs Compound Through the Factory Loop

The fractal software factory's retrieve→generate→evaluate pattern applies to documentation:

1. **Observe** — what docs exist? What's stale? What's orphaned? What's frequently referenced but poorly maintained?
2. **Orient** — which docs need review? Which intents are ready to lock? Which facts have drifted from code?
3. **Decide** — review, lock, archive, or update. Prioritize by impact (reference count, staleness, audience).
4. **Act** — update the doc, move it to the right lifecycle stage, verify cross-references.

Today this loop is manual (REVIEW.md). With docs as first-class entities, parts of this loop can be automated or assisted:
- Staleness detection: flag docs where `last-verified` is >30 days old
- Drift detection: compare fact/ docs against code changes since last verification
- Review prioritization: rank docs by (staleness × reference count)

---

## Implementation Strategy: Three Layers

### Layer 1: Catalog (frontmatter extraction)

Extract YAML frontmatter + first heading + file metadata into a queryable table:

```
doc_catalog: [path, title, folder, status, topic, last_modified, last_verified]
```

Queryable via `devac query sql` and MCP tools. Small effort — no parser needed, just frontmatter extraction.

### Layer 2: Graph (cross-reference extraction)

Add markdown as a parseable language in DevAC:

- **Nodes**: `document` (file), `heading` (h1-h6), `code_block`, `table`
- **Edges**: `REFERENCES` (markdown links), `CHILD_OF` (heading hierarchy), `DEPENDS_ON` (frontmatter field)
- **Metadata**: Frontmatter fields as node properties

Enables dependency queries, broken link detection, and cross-domain queries (code entities + doc entities in one graph).

### Layer 3: Semantic (vector + FTS)

Embeddings for doc content enabling:
- Vector search: "find docs related to encryption"
- Full-text search: keyword queries across all content
- Concept mapping: which docs mention which vivief concepts

Largest effort. Requires embedding pipeline and vector index.

---

## The Self-Dogfooding Principle

DevAC's philosophy is "make the codebase queryable." Making docs queryable is the factory loop applied to its own documentation. The tool that analyzes itself should be able to analyze its own design reasoning.

This is not a feature request — it's a completeness argument. The fractal software factory is incomplete until it can see its own documentation.
