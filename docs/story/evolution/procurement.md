# Evolution: Procurement Domain

| Phase | Date | Focus |
|-------|------|-------|
| Initial exploration | 2025 | Procurement from first principles, elementary particles (What-types, Directions) |
| DuckLake analysis | 2026 | Explored DuckLake as storage layer, compared to traditional databases |
| MVP specification | 2026 | 5-document MVP spec: executive summary, vision, architecture, tech stack, KG extraction |
| Domain planning | 2026 | **Current** — planned as third domain, useful for cross-domain sharing patterns |

## Key role

Procurement is explicitly planned as the domain that tests cross-domain sharing patterns. It exercises different aspects of vivief concepts than DevAC or counseling — data extraction, schema discovery, self-improving pipelines.

## Architecture explorations

Multiple approaches explored in brainstorm phase:
- Self-organizing data pipeline (NATS JetStream backbone)
- Schema-first with LLM enhancement (pragmatic)
- Progressive schema discovery (hybrid)
- Agentic catalog (novel: intelligent catalog proposing schemas)

## Canonical documents

- Domain overview: `contract/procurement/README.md`
- MVP spec: `contract/procurement/mvp/` (5 documents)

## Active brainstorms

Open questions in `intent/procurement/`.
