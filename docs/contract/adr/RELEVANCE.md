# ADR Relevance Overlay

> Which ADRs are still load-bearing vs superseded by vivief-concepts evolution.

**Legend**: Active = still governs implementation. Transitional = valid for current DevAC, will evolve with datom migration. Superseded = replaced by newer decision. Context = still relevant as background/rationale.

| ADR | Title | Relevance | Notes |
|-----|-------|-----------|-------|
| 0001 | Replace Neo4j with DuckDB | **Transitional** | Current DevAC storage. Datom model targets Map-based indexes (L3 DuckDB preserved for analytics). |
| 0002 | Per-Package Partitioning | **Transitional** | Current partitioning. Datom model uses attribute namespaces instead. |
| 0003 | Entity IDs Use Scoped Names | **Active** | Entity ID format `{repo}:{package}:{kind}:{hash}` still valid, maps to datom Entity. |
| 0004 | Atomic Write Pattern | **Transitional** | Current write pattern. Datom transactions replace this. |
| 0005 | Two-Pass Parsing Architecture | **Active** | Parsing pipeline unchanged. |
| 0006 | Python Parser via Subprocess | **Active** | Multi-language parsing unchanged. |
| 0007 | Federation with Central Hub | **Transitional** | Hub federation. P2P replaces centralized hub long-term. |
| 0008 | Content Hash for Incremental | **Active** | Change detection unchanged. |
| 0009 | Windows Support Deferred | **Active** | Still deferred. |
| 0010 | Recursive CTE Depth Limit | **Transitional** | DuckDB-specific. Less relevant with DatomStore API (L1). |
| 0011 | Development Workflow | **Active** | Issue-driven, worktrees, ADRs — unchanged. |
| 0012 | Claude-Assisted Slash Commands | **Active** | Claude Code integration unchanged. |
| 0013 | Fixture Packages Per Language | **Active** | Testing approach unchanged. |
| 0014 | Git Worktree + Claude CLI | **Active** | Workflow unchanged. |
| 0015 | Conceptual Foundation — Effect Handler | **Context** | Superseded by vivief-concepts-v6, but provides historical rationale. |
| 0016 | Workspace Module Architecture | **Active** | Context discovery unchanged. |
| 0017 | Validation Hub Cache | **Active** | Diagnostic caching unchanged. |
| 0018 | Unified Diagnostics Model | **Active** | Watch-Validate-Cache-Query unchanged. |
| 0019 | Coverage Validator Integration | **Active** | Coverage validation unchanged. |
| 0020 | CALLS Edge Extraction | **Active** | Function call tracking unchanged. |
| 0021 | Code Understanding Pipeline | **Active** | Pipeline documentation unchanged. |
| 0022 | Answer Quality Evaluation | **Active** | Eval framework unchanged. |
| 0023 | Developer-Maintained Effects | **Active** | Effects documentation unchanged. |
| 0024 | Hub Single Writer with IPC | **Transitional** | Current concurrency model. P2P changes this. |
| 0025 | Unified Start-Issue Command | **Active** | devac-worktree workflow unchanged. |
| 0026 | Federated Documentation Gen | **Active** | Multi-repo docs unchanged. |
| 0027 | LikeC4 as Primary C4 Format | **Active** | C4 visualization unchanged. |
| 0028 | C4 Enrichment & Aggregation | **Active** | C4 enrichment unchanged. |
| 0029 | LikeC4 Directory Restructure | **Active** | Directory structure unchanged. |
| 0030 | Unified Query System | **Transitional** | Current query. Replaced by 3-layer query architecture long-term. |
| 0031 | Architecture Quality Loop | **Active** | Quality improvement process unchanged. |
| 0032 | Hub Location Validation | **Active** | Context detection unchanged. |
| 0033 | CALLS Edge Resolution | **Active** | Call graph queries unchanged. |
| 0034 | EXTENDS Edge Resolution | **Active** | Inheritance queries unchanged. |
| 0035 | Browser Element Ref Strategy | **Active** | Browser automation unchanged. |
| 0036 | Browser Session Singleton | **Active** | Session management unchanged. |
| 0037 | Browser MCP Tool Naming | **Active** | Tool conventions unchanged. |
| 0038 | Browser Error Handling | **Active** | Error strategy unchanged. |
| 0039 | Browser Automation Tests | **Active** | Test strategy unchanged. |
| 0040 | Version.ts Generation | **Active** | Versioning pattern unchanged. |
| 0041 | CLI Command Structure v4.0 | **Active** | CLI structure unchanged. |
| 0042 | MCP Tool Naming Conventions | **Active** | MCP conventions unchanged. |
| 0043 | Hook-Based Validation | **Active** | Validation hooks unchanged. |
| 0044 | Unified Addressing Scheme | **Active** | Entity addressing unchanged. |
| 0045 | Accessibility Intelligence | **Active** | A11y layer unchanged. |
| 0046 | Runtime and Language | **Superseded** | By ADR-0050 (Vivief Tech Stack). |
| 0047 | Datom Store and Sync | **Superseded** | By ADR-0050 + contract/datom/architecture.md. |
| 0048 | UI Framework | **Superseded** | By ADR-0050. |
| 0049 | Deployment Architecture | **Superseded** | By ADR-0050 + contract/p2p/lean-stack-v2.md. |
| 0050 | Vivief Tech Stack | **Active** | The umbrella decision. Browser-first lean stack. |

## Summary

- **Active**: 37 ADRs — still govern current implementation
- **Transitional**: 6 ADRs — valid now, will evolve with datom/P2P migration
- **Superseded**: 4 ADRs (0046-0049) — replaced by ADR-0050
- **Context**: 1 ADR (0015) — historical rationale, superseded by v6 concepts
