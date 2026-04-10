---
topic: procurement-domain
status: canonical
depends-on: [vivief-identity]
human-version: ../contract/procurement/README.md
last-verified: 2026-03-30
---

## Procurement Domain

Procurement is the third vivief domain — intelligent data extraction at scale.
Currently at intent stage with MVP spec written.

### Purpose

Procurement exercises different aspects of vivief concepts than DevAC or counseling:

| Concept | DevAC Usage | Counseling Usage | Procurement Usage |
|---------|-------------|-----------------|-------------------|
| Datom | Code entities | Session notes | Extracted data records |
| Projection | Code graph views | Role-based clinical views | Extraction pipeline stages |
| Surface | Dashboards, MCP tools | Session UI, briefs | Catalog views, audit trails |
| Contract | Schema validation | Privacy, consent | Data quality, SLA |
| effectHandler | Parse, analyze, validate | Conduct session, track goals | Extract, transform, verify |

This diversity is why procurement was chosen as the third domain — it serves as a
test case for cross-domain sharing patterns and proves the concepts work beyond
development and clinical contexts.

### Key Capabilities (Planned)

- **Data extraction** — Scraping, API ingestion, document parsing into datoms
- **Self-improving pipelines** — Effect system tracks extraction quality; handlers
  improve over iterations using feedback datoms
- **Agentic catalog** — AI agents browse, evaluate, and procure data sources
  autonomously, constrained by Contracts
- **DuckLake integration** — Reference: `fact/reference/ducklake-overview.md`.
  DuckLake as a data lake layer that complements DuckDB for large-scale
  procurement data storage

### MVP Spec

Five documents in `contract/procurement/mvp/` define the minimum viable product:

1. Core extraction pipeline (source to datoms)
2. Quality scoring and feedback loops
3. Catalog data model
4. Contract-based SLA enforcement
5. Integration points with DevAC and counseling domains

### Self-Improving Extraction

The procurement domain's distinctive pattern is self-improvement through effects:

```
extract(source) → datoms + quality_score
  |
  if quality_score < threshold:
    effect: retry_with_refined_strategy
  |
  quality feedback → datoms → improve next extraction
```

Each extraction run produces datoms about its own quality. These meta-datoms feed
back into the pipeline, allowing handlers to refine their extraction strategies
over time. This is the effectHandler concept applied to data quality.

### Schema Approaches

Multiple schema strategies are being explored (`intent/procurement/`):

- **Schema-on-read** — Extract raw, apply schema via Projections at query time
- **Schema-on-write** — Enforce schema via Contracts at extraction time
- **Hybrid** — Loose extraction with progressive schema tightening as confidence grows

The hybrid approach aligns with vivief's trust model — low-confidence extractions
get loose schema (low trust score), high-confidence extractions get strict schema
enforcement (high trust score).

### Open Brainstorms

- `intent/procurement/` — primitives, agentic catalog design, schema approaches
- Cross-domain sharing patterns with DevAC and counseling
- DuckLake exploration for large-scale storage beyond DuckDB
