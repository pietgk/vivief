# Intent: Documentation Discoverability via DevAC

**Status**: Open — design exploration

## The problem

The vivief docs (~230 markdown files across 6 folders, 40+ subfolders) are only discoverable by browsing folders or following links from a handful of index files (`README.md`, `claude/INDEX.md`, `contract/adr/README.md`). The original REVIEW.md recommendation was to "generate a full document index." But a static markdown index is the wrong frame — it goes stale, isn't queryable, and doesn't compose with devac's tooling.

The real question: **should docs become first-class entities in the devac code graph?**

## Current discovery mechanisms

| Mechanism | Coverage | Queryable? |
|-----------|----------|------------|
| `docs/README.md` routing table | 11 entry points for common tasks | No — manual browsing |
| `claude/INDEX.md` | 17 Claude windows by category | No — read-only |
| `contract/adr/README.md` + `RELEVANCE.md` | 55 ADRs with status tracking | No — manual browsing |
| Folder structure (intent/contract/fact/story/archive) | All docs | No — grep/glob only |
| devac parsers | **Zero markdown files** — only TS, Python, C#, Storybook | Yes — but docs excluded |

## Who needs what

| Audience | Current friction | Unmet need |
|----------|-----------------|------------|
| **You (author)** | Know the docs, can grep/browse | Low — muscle memory + grep works |
| **Claude (LLM)** | Claude windows + grep solve most cases | Low — dual-format already built for this |
| **New contributor** | README routing helps; deep docs hard to find | Medium — better per-folder READMEs would help more than a flat index |
| **DevAC itself** | Cannot see markdown at all — `devac sync` skips docs | **High** — docs are invisible to the tool that analyzes the repo |

## Layered approach

Rather than a one-shot index, doc discoverability decomposes into layers that build on each other:

### Layer 1: Catalog (frontmatter extraction)

Add a `devac sync --docs` flag that:
1. Globs `docs/**/*.md`
2. Extracts YAML frontmatter + first heading + file metadata
3. Writes a `doc_catalog` Parquet table (path, title, folder, status, topic, last_modified)
4. Queryable via `devac query sql` and MCP `query_sql`

**What this enables:**
- `devac query sql "SELECT * FROM doc_catalog WHERE folder = 'intent'"` — all open brainstorms
- `devac query sql "SELECT * FROM doc_catalog WHERE status = 'canonical'"` — all locked docs
- MCP tools can answer "what docs exist about X?" via SQL

**Effort:** Small — no parser needed, just frontmatter extraction + Parquet write.

### Layer 2: Graph (cross-reference extraction)

Add a `markdown-parser.ts` implementing `LanguageParser` for `.md` files:

- **Nodes:** `document` (file), `heading` (h1-h6), `code_block`, `table`
- **Edges:** `REFERENCES` (markdown links between docs), `CHILD_OF` (heading hierarchy), `DEPENDS_ON` (frontmatter `depends-on` field)
- **Metadata:** Frontmatter fields as node properties

**What this enables:**
- `devac query deps "contract/datom/architecture.md"` — what docs link to this
- `devac query dependents "intent/p2p/cold-tier-indexing.md"` — who references this intent
- Cross-domain queries: code entities + doc entities in the same graph
- Broken link detection: edges where the target doc doesn't exist

**Effort:** Medium — new parser, possibly new node kinds in `NodeKindSchema`.

### Layer 3: Semantic (vector + FTS)

Add embeddings for doc content, enabling:
- Vector search: "find docs related to encryption" → nearest neighbors
- Full-text search: keyword queries across all doc content
- Concept graph: which docs mention which vivief concepts (Datom, Projection, etc.)

**What this enables:**
- Semantic doc discovery without knowing exact terms or paths
- AI-assisted doc navigation: "what should I read before implementing cold-tier indexing?"

**Effort:** Larger — embedding pipeline, vector index (pgvector or DuckDB vss), FTS index.

## The self-dogfooding angle

DevAC's philosophy is "make the codebase queryable." But the docs — which contain the design decisions, concept definitions, and architectural reasoning — are invisible to the tool. A counselor's session notes become datoms. A developer's code becomes nodes and edges. But the design documents that explain *why* the code exists are opaque.

Making docs first-class in devac closes this gap. The tool that analyzes itself should be able to analyze its own documentation.

## Decision needed

1. **Is Layer 1 (catalog) worth building now?** Small effort, immediately useful for SQL queries over doc metadata.
2. **Is Layer 2 (graph) a near-term priority?** Medium effort, enables relationship tracking and broken link detection.
3. **Is Layer 3 (semantic) a future aspiration or a near-term need?** Large effort, most powerful but also most complex.
4. **Or: close the REVIEW.md item as "won't fix — current discovery mechanisms are sufficient"?**

## Related documents

- `docs/REVIEW.md` — the open omission item that prompted this analysis
- `packages/devac-core/src/parsers/parser-interface.ts` — the `LanguageParser` extension point
- `packages/devac-core/src/storage/schemas/node.schema.ts` — `NodeKindSchema` (would need `document`, `heading` kinds)
- `packages/devac-cli/src/utils/doc-utils.ts` — existing ADR-specific doc utilities
