---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
"@pietgk/devac-mcp": minor
---

Integrate effect extraction, rules engine, and C4 diagrams into full pipeline

**Core:**
- TypeScript parser now extracts code effects (function calls, store operations, external requests)
- Effects written to `.devac/seed/base/effects.parquet` during analysis

**CLI:**
- Add `devac effects` command to query code effects
- Add `devac rules` command to run rules engine and produce domain effects
- Add `devac c4` command to generate C4 architecture diagrams (PlantUML/Mermaid/JSON)

**MCP:**
- Add `query_effects` tool for querying code effects from seeds
- Add `run_rules` tool for running rules engine on effects
- Add `list_rules` tool for listing available rules
- Add `generate_c4` tool for generating C4 diagrams

**Documentation:**
- Add effects table schema to data model docs
- Add rules engine implementation guide
- Add C4 generator (views) implementation guide
- Update CLI reference with new commands
