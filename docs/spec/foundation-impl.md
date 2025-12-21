
# DevAC v3 High-Level Architecture Plan

## Prompt

  Goal

  Design the next generation of DevAC that implements the foundation.md concepts. Create high-level documentation with diagrams that
  establishes alignment on why/what/when before any implementation details.

  Core Thesis

  Seeds are the universal abstraction - everything is a queryable extraction from a source of truth. A seed can be:

  | Category       | Sources      | Examples                                          |
  |----------------|--------------|---------------------------------------------------|
  | Code           | Git repos    | AST, effects, call graphs, dependencies           |
  | Content        | Docs systems | Notion pages, Google Docs, Confluence             |
  | Infrastructure | Cloud APIs   | AWS resources, Azure services, GCP projects       |
  | CI/CD          | Pipelines    | GitHub Actions runs, Azure Pipelines, webhooks    |
  | Observability  | Monitoring   | Datadog metrics, OTEL traces, Prometheus          |
  | Validation     | Dev tools    | TypeScript errors, ESLint issues, test results    |
  | Security       | Scanners     | Yarn audit, npm audit, dependency vulnerabilities |

  Query Capabilities

  Seeds declare which query types they support:

  | Query Type  | Use Case        | Example                          |
  |-------------|-----------------|----------------------------------|
  | Graph       | Relationships   | "What calls this function?"      |
  | Relational  | Structured data | "All functions with >10 params"  |
  | Key-Value   | Lookups         | "Get entity by ID"               |
  | Full-text   | Search          | "Find code mentioning 'auth'"    |
  | Vector      | Semantic        | "Code similar to this pattern"   |
  | Time-series | Trends          | "Error rate over last week"      |
  | OTEL/Spans  | Traces          | "Slowest paths through checkout" |

  Note: Not all query types needed initially. Phase 1 focuses on core types.

  Simplification Principles

  Convention Over Configuration

  | Before (v2)                | After (v3)                                 |
  |----------------------------|--------------------------------------------|
  | Explicit repo registration | Workspace directory = registered workspace |
  | Per-repo hub registration  | Git repo in workspace = registered repo    |
  | Manual hub refresh         | Filesystem watch auto-updates              |
  | Per-repo watchers          | Single workspace-level watcher             |
  | State files for worktrees  | Convention-based naming discovery          |

  Single Workspace Context

  ~/ws/                     ← Workspace (auto-discovered)
  ├── api/                  ← Repo (auto-registered)
  ├── web/                  ← Repo (auto-registered)
  ├── api-123-auth/         ← Worktree (convention: {repo}-{issue}-{slug})
  └── .devac/               ← Workspace-level seeds & hub
      ├── hub.duckdb        ← Federated queries
      └── cache/            ← Shared cache

  Deliverables Requested

  1. High-level architecture diagram - Main components and data flow
  2. Seed taxonomy - Categories, sources, query capabilities
  3. Pipeline diagram - How data flows from sources → seeds → queries → views
  4. Component boundaries - What's core vs extension vs future
  5. Phasing - What to build first vs defer

  Constraints

  - No implementation details - Focus on concepts and relationships
  - Diagrams over text - Visual alignment before prose
  - Simplify first - Question every concept's necessity
  - Build on existing - Leverage devac-core's proven patterns

  Questions to Answer

  1. What are the minimal seed types for Phase 1?
  2. How do seeds compose across sources (code + infra + observability)?
  3. Where does the effect handler pattern fit?
  4. How do we enable real-time updates (webhooks, watchers)?
  5. What's the human/LLM/system boundary for each component?

## recap and answers

DevAC v3 Architecture Documentation Created

  The file /Users/grop/ws/vivief/docs/architecture/devac-v3-architecture.md contains 10 high-level diagrams covering:

  1. System Overview - Sources → Extractors → Seeds → Hub → Interfaces → Consumers
  2. Workspace Model - Convention-based discovery with ~/ws/ workspace structure
  3. Seed Taxonomy - 6 categories: Code, Content, Infra, Pipeline, Observability, Validation
  4. Query Capabilities Matrix - Which query types (graph, relational, k-v, full-text, vector, time-series, OTEL) apply to which seeds
  5. Data Flow Pipeline - Sources → Extract → Store (Parquet) → Index (DuckDB) → Query → Present
  6. Update Mechanisms - Filesystem watch, webhooks, polling, streaming
  7. Component Boundaries - Phase 1 (Core), Phase 2 (Validation), Phase 3+ (Future)
  8. Human/LLM/System Boundaries - What each handles in the workflow
  9. Effect Handler Integration - How effects flow through the system
  10. Phasing Summary - Gantt-style roadmap

  Key Design Decisions Captured

  | Decision        | Choice                                            |
  |-----------------|---------------------------------------------------|
  | Discovery       | Convention-based (no registration)                |
  | Workspace state | Single .devac/ at workspace level                 |
  | Seed storage    | Parquet files per-repo                            |
  | Query engine    | DuckDB hub for federation                         |
  | Update latency  | ~100ms (files), ~1s (webhooks), ~1-5min (polling) |

  Alignment Questions

  The document ends with 5 questions needing your input:

  1. Phase 1 Scope: Is workspace discovery + unified watcher + hub auto-refresh the right starting point?
  2. Seed Format: Same Parquet schema for all seeds, or seed-type-specific schemas?
  3. Query Interface: SQL-first with graph as recursive CTEs, or dedicated graph query language?
  4. Real-time vs Batch: Which seeds need real-time updates vs periodic refresh?
  5. LLM Integration: MCP tools for querying only, or also for triggering extractions?

> first a few document feedback details:
  - stop usign light colors as thoose boxes are unreadable because text is white,
  - Query capabilities in chapter 4 the table is clear the graph is not really usefull and not complete please only the graph is better for that chapter.
  - chapter 10 phasing summary gantt chart is not really readable [Image #1]
  Question answers:
  1 yes, i assume the code extraction (already implemented) is inherently part of phase 1
  2 currently we have parquet seed files for nodes, edges, ext_references each with a different schema, we should try to generalise what can logically be the
  same but we will have different seed schemas, it depends a bit on what seed types need what schema so we need to be smart, and manoever between generic and
  specific. with the effect system being very generic as in everything can be presented as an effecthandler we need to determine what can be handled by this
  and what makes no sense to do so. but lets be very carefull as this is very important to do right
  3 sql and graph with cte is good enough (as is currently the way devac v2 has choosen to use)
  4 i need to have the specific seeds to be able to answer this question, real-time when possible and pragmatic, batch has same pragmatic choice. so lets make
  generic choices that make sense on this one
  5 as llms get more powerfull and with skills being the new functions for claude we should have a nice pragmatic triggering extractions way. not sure if mcp
  is the best choice but for now having it seems the better option and cli and api already implement it its probbly bettter to be consistent

Document updated with your feedback:

  Changes made:
  1. Removed light color styling from Workspace Model and Component Boundaries diagrams
  2. Replaced the confusing graph in Chapter 4 with just the clear table + a note about SQL/CTE approach
  3. Replaced unreadable Gantt chart in Chapter 10 with readable tables per phase
  4. Converted "Key Questions for Alignment" to "Alignment Decisions" with your answers captured

  Document status: v0.2 - Ready for detailed design

  The architecture document now captures the alignment:

  | Decision           | Answer                                                                                                                         |
  |--------------------|--------------------------------------------------------------------------------------------------------------------------------|
  | Phase 1 Scope      | ✓ Workspace discovery + unified watcher + hub auto-refresh (code extraction is inherently Phase 1)                             |
  | Seed Format        | Seed-type-specific schemas (nodes, edges, ext_references). Generalize carefully, effect handler pattern applies where sensible |
  | Query Interface    | SQL + recursive CTEs (current approach)                                                                                        |
  | Real-time vs Batch | Pragmatic per-seed                                                                                                             |
  | LLM Integration    | MCP for querying AND triggering extractions                                                                                    |

  What's next - would you like to:
  1. Dive into Phase 1 detailed design (workspace discovery, unified watcher, hub auto-refresh)?
  2. Document the seed schema strategy more thoroughly given your answer about being smart between generic and specific?
  3. Something else?

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
> chapter 3 seed taxonomy specify Effects only on Code seeds. can you do a very thorough check with foundation document as i think there already is a broader
  use mentioned, so can we have a very thoughtfull look at this and try to make this more clear and consistent as i see this as a very core decision
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Done. Here's what I clarified:

  Seeds vs Effects - Now Consistent with Foundation

  Key distinction made clear:

  | Concept | What It Is                                | Examples                                        |
  |---------|-------------------------------------------|-------------------------------------------------|
  | Seeds   | Queryable data extracted from sources     | nodes, edges, documents, resources, diagnostics |
  | Effects | Events/changes flowing through the system | FileChanged, Extract, SeedUpdated, HubRefreshed |

  Changes made:

  Chapter 3 (Seed Taxonomy):
  - Added clarifying note at top: "Seeds are queryable data... Effects are events/changes"
  - Removed "Effects" from Code Seeds (was misleading)
  - Renamed to actual data structures: Nodes, Edges, External Refs
  - Added "Seed Data Structures" table showing tables and key fields per category

  Chapter 9 (Effect Handler Integration):
  - Added the universal pattern formula: effectHandler = (state, effect) => (state', [effect'])
  - Added explicit statement: "Effects are NOT specific to code"
  - Added "Effects by Seed Category" table showing trigger/processing/result effects for ALL 6 categories
  - This makes clear that Validation, Pipeline, Content, etc. all use the same effect pattern

  Alignment with foundation.md:
  - Section 5.3: Effect Taxonomy (Data, Do, Flow, Group) - universal
  - Section 5.8: Development Effects (FileChanged, PRMerged, etc.) - universal
  - All seeds are updated via effects when their source changes
