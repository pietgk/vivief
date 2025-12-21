# DevAC Foundation: Implementation Details

> Implementation guidance for the concepts defined in [foundation.md](./foundation.md)
> This document covers the "how" - practical implementation details and current status.

---

## 1. Bootstrap Phases

Starting with an existing codebase requires progressive bootstrapping. The chicken-egg problem: seeds need rules, rules need patterns, patterns need analysis.

**Solution: Progressive Bootstrap**

```
Phase 1: Universal Extraction (Zero Rules)
├── Parse all code files (AST)
├── Extract: Files, Functions, Classes, Imports
├── Build: Call graph, dependency graph
└── Output: Raw structural seed (nodes, edges, external_refs)

Phase 2: Pattern Discovery (LLM-Assisted)
├── LLM analyzes raw effects
├── Proposes initial rules (tRPC, Kysely, etc.)
├── Human validates rule proposals
└── Output: Initial rule set

Phase 3: Rule Application
├── Apply rules to raw effects
├── Emit high-level effects (Actors, Components)
├── Generate first Views (C4 diagrams)
└── Output: Architectural seed

Phase 4: Iterative Refinement
├── Humans validate Views against Vision
├── Gaps reveal missing rules
├── LLM proposes new rules
└── Loop back to Phase 3
```

**Key insight**: Universal AST extraction produces seeds without requiring rules. Rules are an enhancement layer, not a prerequisite.

---

## 2. Implementation Status

### What DevAC Already Has

| Capability | Status | Notes |
|------------|--------|-------|
| Universal AST extraction | ✅ Done | TypeScript, Python, C# parsers |
| Seeds (Parquet) | ✅ Done | nodes, edges, external_refs tables |
| Hub federation | ✅ Done | Cross-repo queries via DuckDB |
| MCP server | ✅ Done | 8 tools for LLM querying |
| Worktree workflow | ✅ Done | Issue-based git worktrees |
| Incremental updates | ✅ Done | Watch mode, delta storage |
| Context discovery | ✅ Done | Sibling repos, issue grouping |
| Validation coordinator | ✅ Done | Type-check, lint, test integration |
| **Workspace module** | ✅ Done | Multi-repo orchestration (Phase 1) |
| CLI | ✅ Done | 17+ commands |

### Phase 1: Workspace Discovery + Unified Watcher (COMPLETE)

**Files:** `packages/devac-core/src/workspace/`

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | WorkspaceInfo, WorkspaceRepoInfo, WorkspaceState |
| Discovery | `discover.ts` | Scan directories, parse issueId, detect worktrees |
| State | `state.ts` | Persist workspace state to `.devac/state.json` |
| Seed Detector | `seed-detector.ts` | Watch `.devac/seed/**/*.parquet` for changes |
| Watcher | `watcher.ts` | Unified file watcher for entire workspace |
| Auto-Refresh | `auto-refresh.ts` | Debounced hub refresh on seed changes |
| Manager | `manager.ts` | Orchestrate discovery, watching, refresh |

**CLI Commands Added:**

| Command | Purpose |
|---------|---------|
| `devac workspace status` | Show repos, seeds, hub registration |
| `devac workspace watch` | Monitor seeds, auto-refresh hub |
| `devac workspace init` | Initialize workspace configuration |

**Key Architecture Decisions:**

1. **Two-tier watching**: `devac watch` (per-repo, source→seeds) + `devac workspace watch` (workspace, seeds→hub)
2. **Seed-based coordination**: Workspace watch monitors Parquet files, not source files
3. **State persistence**: `.devac/state.json` tracks repo discovery and hub status
4. **Event-driven**: WorkspaceEvent union type with subscription pattern

**Workflow:**
```
Source Files → [devac watch] → Seeds → [workspace watch] → Hub → Cross-repo Queries
```

### What Needs to Be Built

| Capability | Priority | Status | Notes |
|------------|----------|--------|-------|
| Effect Store (full) | Low | Not started | Seeds provide MVP; full log optional |
| Effect Schemas | Medium | Not started | Zod schemas for effect types |
| Rules Engine | Medium | Not started | Pattern matching for aggregation |
| Vision→View Pipeline | Medium | Partial | Diagram generation from seeds |
| Runtime Extraction | Low | Not started | Test-time instrumentation |
| GitHub Webhooks | Medium | Not started | Real-time PR/CI events |
| Vector Queries | Low | Not started | Semantic search over content |

---

## 3. Effect Store Implementation

The Effect Store is **optional** - Seeds provide the MVP implementation of accumulated state.

### When to Implement Full Effect Store

Implement when you need:
- Temporal queries ("when did this dependency appear?")
- Debugging extraction pipelines
- Audit trail beyond git history
- Complex cross-pipeline coordination

### Implementation Approach

```typescript
// Effect Stream - append-only log
interface EffectStream {
  append(effect: Effect): void
  query(filter: EffectFilter): Effect[]
  subscribe(handler: (effect: Effect) => void): Unsubscribe
}

// Accumulated State - derived from stream
interface AccumulatedState {
  hierarchy: GroupEffect[]
  actors: Map<string, Actor>
  interfaces: Interface[]
  refresh(): void  // Rebuild from stream
}

// Storage options
// - SQLite for local development
// - DuckDB for query performance
// - Kafka/EventStore for distributed systems
```

### Current MVP (Seeds)

Seeds already provide:
- Current state queries (nodes, edges, external_refs)
- Cross-repo federation via Hub
- Incremental updates via content-hash
- Branch-specific state (`.devac/seed/branch/{name}/`)

---

## 4. Rules Engine Implementation

Rules are **foundational conceptually** but implementation can be deferred.

### Rule Schema

```typescript
import { z } from "zod"

const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  
  // What to match
  pattern: z.object({
    effects: z.array(EffectPatternSchema),
    context: z.record(z.any()).optional()
  }),
  
  // What to produce
  output: z.object({
    effect: EffectSchema,
    confidence: z.number().min(0).max(1)
  }),
  
  // Metadata
  source: z.enum(["builtin", "llm-proposed", "human-defined"]),
  status: z.enum(["active", "proposed", "deprecated"])
})
```

### Pattern Matching Engine

```typescript
interface RulesEngine {
  // Register rules
  register(rule: Rule): void
  
  // Process effects through rules
  process(effects: Effect[]): HighLevelEffect[]
  
  // Find matching rules for given effects
  match(effects: Effect[]): Rule[]
}
```

### Built-in Rules (Examples)

```typescript
// tRPC Service Detection
{
  id: "trpc-service",
  pattern: {
    effects: [
      { type: "FunctionCall", name: /router\.(query|mutation|procedure)/ },
      { type: "File", path: /\/routers?\// }
    ]
  },
  output: {
    effect: { type: "Actor", actorType: "tRPC" },
    confidence: 0.95
  }
}

// Database Access Detection
{
  id: "db-access",
  pattern: {
    effects: [
      { type: "FunctionCall", name: /\.(select|insert|update|delete)/ }
    ]
  },
  output: {
    effect: { type: "Store", storeType: "database" },
    confidence: 0.9
  }
}
```

---

## 5. Runtime Extraction Implementation

Runtime extraction is **Phase 3+** - static extraction works now.

### Progressive Instrumentation Levels

| Level | What to Wrap | Effort | Value |
|-------|--------------|--------|-------|
| **Level 1** | Nothing (baseline) | 0% | Tests pass/fail only |
| **Level 2** | Boundaries only (tRPC, DB, APIs) | 20% | 50% value - C4 diagrams |
| **Level 3** | Full wrappers | 80% | 100% value - complete tracing |

**Recommendation**: Start at Level 2 - get architecture visibility fast, expand later.

### Wrapper Pattern

```typescript
// Wrapper that emits effects during test execution
function withEffectTracking<T>(
  fn: (...args: any[]) => T,
  metadata: { name: string; type: EffectType }
): (...args: any[]) => T {
  return (...args) => {
    emitEffect({
      type: metadata.type,
      name: metadata.name,
      args: args,
      timestamp: Date.now()
    })
    return fn(...args)
  }
}

// Usage
const trackedDbQuery = withEffectTracking(db.query, {
  name: "db.query",
  type: "Store"
})
```

### Test Integration

```typescript
// Jest/Vitest setup
beforeAll(() => {
  startEffectCollection()
})

afterAll(() => {
  const effects = stopEffectCollection()
  writeRuntimeSeed(effects)
})
```

---

## 6. Validation Integration

Validation checks produce `ValidationResult` workflow effects.

### Current Implementation

```typescript
// packages/devac-core/src/validation/
interface ValidationCoordinator {
  runTypeCheck(packagePath: string): Promise<ValidationResult>
  runLintCheck(packagePath: string): Promise<ValidationResult>
  runTestCheck(packagePath: string): Promise<ValidationResult>
  runBuildCheck(packagePath: string): Promise<ValidationResult>
}

interface ValidationResult {
  check: "type" | "lint" | "test" | "build"
  passed: boolean
  diagnostics: Diagnostic[]
  duration: number
}
```

### CLI Integration

```bash
devac validate                 # Run all checks
devac validate --type          # Type-check only
devac validate --lint          # Lint only
devac validate --test          # Tests only
devac validate --context       # Run across all context repos
```

---

## 7. Context Discovery Implementation

### Current Implementation

```typescript
// packages/devac-core/src/context/discovery.ts
interface RepoContext {
  currentDir: string
  repos: RepoInfo[]
  issueNumber?: number
  worktrees?: WorktreeInfo[]
}

async function discoverContext(cwd: string): Promise<RepoContext> {
  const parentDir = path.dirname(cwd)
  const siblings = await fs.readdir(parentDir)
  
  const repos = await Promise.all(
    siblings
      .filter(isGitRepo)
      .map(classifyRepo)
  )
  
  const issueNumber = extractIssueNumber(path.basename(cwd))
  
  if (issueNumber) {
    const worktrees = repos
      .filter(r => r.issueNumber === issueNumber)
    return { currentDir: cwd, repos, issueNumber, worktrees }
  }
  
  return { currentDir: cwd, repos }
}
```

### Worktree Pattern Extraction

```typescript
// Pattern: {repo}-{issue#}-{slug}
function extractIssueNumber(dirName: string): number | null {
  const match = dirName.match(/^(.+)-(\d+)-(.+)$/)
  return match ? parseInt(match[2], 10) : null
}

function extractRepoName(dirName: string): string {
  const match = dirName.match(/^(.+)-\d+-(.+)$/)
  return match ? match[1] : dirName
}
```

---

## 8. MCP Server Implementation

### Current Tools

| Tool | Purpose |
|------|---------|
| `find_symbol` | Search symbols by name (regex) |
| `get_dependencies` | Get outgoing edges from symbol |
| `get_dependents` | Get incoming edges (reverse deps) |
| `get_file_symbols` | List all symbols in a file |
| `get_affected` | Find affected files from changes |
| `get_call_graph` | Build call graph for functions |
| `query_sql` | Execute read-only SQL on seeds |
| `list_repos` | List registered repositories |

### Future Tools (Planned)

| Tool | Purpose |
|------|---------|
| `trigger_analyze` | Re-run extraction |
| `refresh_hub` | Sync hub with repo manifests |
| `get_context` | Return current context info |
| `query_cross_repo` | Federated query across context |

---

## 9. Recommended Implementation Order

1. **Effect Schemas** - Define Zod schemas for Code/Workflow effects
2. **Rules Engine (Basic)** - Pattern matching for common cases
3. **GitHub Webhooks** - Real-time CI/PR status
4. **Vision→View Pipeline** - Diagram generation from seeds
5. **Effect Store (Full)** - When temporal queries needed
6. **Runtime Extraction** - Test-time instrumentation

---

## 10. Key Sources

This implementation is based on concepts from:

**Core VVE System:**
- `packages/architecture/specs/334-vision-view-effect-system-v1.1.md`
- `packages/architecture/specs/334-vision-view-effect-system-v2.0.md`
- `packages/architecture/specs/UNIFIED-PATTERN.md`

**Supporting Concepts:**
- `packages/architecture/specs/335-linters-as-rules.md`
- `packages/architecture/specs/335-otel-overlap-analysis.md`
- `packages/architecture/specs/208-rules-interference-system.md`

**Current Implementation:**
- `vivief/packages/devac-core/` - Core extraction and seeds
- `vivief/packages/devac-cli/` - CLI commands
- `vivief/packages/devac-mcp/` - MCP server
- `vivief/packages/devac-worktree/` - Worktree workflow

---

*Version: 1.0 - Initial implementation guide*
*Companion to [foundation.md](./foundation.md) (conceptual foundation)*
