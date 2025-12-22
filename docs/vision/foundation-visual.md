# Foundation Visual Vision Architecture

> Visual architecture companion to [foundation.md](./foundation.md)
> This document shows system structure through diagrams - the "what" in visual form.

---

## 1. System Overview

The DevAC system extracts queryable state from sources of truth and makes it available to humans, LLMs, and automated systems.

```mermaid
graph TB
    subgraph "Sources of Truth"
        CODE[Code<br/>Git Repos]
        CONTENT[Content<br/>Docs, CMS]
        INFRA[Infrastructure<br/>Cloud APIs]
        CICD[CI/CD<br/>Pipelines]
        OBS[Observability<br/>Monitoring]
        VAL[Validation<br/>Dev Tools]
    end

    subgraph "Extraction Layer"
        EXT[Extractors<br/>AST, API, Webhooks]
    end

    subgraph "Seed Layer"
        SEEDS[(Seeds<br/>Parquet Files)]
    end

    subgraph "Query Layer"
        HUB[Hub<br/>DuckDB Federation]
    end

    subgraph "Interface Layer"
        CLI[CLI<br/>devac]
        MCP[MCP Server<br/>LLM Tools]
        API[API<br/>Programmatic]
    end

    subgraph "Consumers"
        HUMAN[Human<br/>Developer]
        LLM[LLM<br/>Claude, etc.]
        SYSTEM[System<br/>CI, Automation]
    end

    CODE --> EXT
    CONTENT --> EXT
    INFRA --> EXT
    CICD --> EXT
    OBS --> EXT
    VAL --> EXT

    EXT --> SEEDS
    SEEDS --> HUB
    HUB --> CLI
    HUB --> MCP
    HUB --> API

    CLI --> HUMAN
    MCP --> LLM
    API --> SYSTEM
```

**Key Principle**: Sources of truth are sacred. Seeds are derived, queryable representations - never authoritative.

---

## 2. Workspace Model

Development spans multiple repositories. DevAC uses convention-based discovery to understand workspace structure.

### 2.1 Workspace Topology

```mermaid
graph TB
    subgraph "Workspace ~/ws/"
        direction TB

        subgraph "Main Repos"
            API[api/]
            WEB[web/]
            SHARED[shared/]
        end

        subgraph "Issue ghapi-123 Worktrees"
            WT1[api-ghapi-123-auth/]
            WT2[shared-ghapi-123-auth/]
        end

        subgraph "Issue ghweb-456 Worktree"
            WT3[web-ghweb-456-bugfix/]
        end
    end

    subgraph "Per-Repo Seeds"
        API_SEED[api/.devac/seed/]
        WEB_SEED[web/.devac/seed/]
        SHARED_SEED[shared/.devac/seed/]
    end

    subgraph "Hub"
        HUB[(~/.devac/hub.duckdb)]
    end

    API --> API_SEED
    WEB --> WEB_SEED
    SHARED --> SHARED_SEED
    
    API_SEED --> HUB
    WEB_SEED --> HUB
    SHARED_SEED --> HUB
```

### 2.2 Context Discovery

```mermaid
graph LR
    subgraph "Discovery Rules"
        R1[Rule 1: Sibling Discovery<br/>All repos in parent dir]
        R2[Rule 2: Issue Grouping<br/>Match issueId in worktree name]
    end

    subgraph "Example: CWD = shared-ghapi-123-auth/"
        direction TB
        CWD[shared-ghapi-123-auth/]
        
        subgraph "Context Discovered"
            I123[Issue ghapi-123 Worktrees<br/>api-ghapi-123-auth, shared-ghapi-123-auth]
            MAIN[Main Repos<br/>api/, shared/]
            SIB[Siblings<br/>web/]
        end
    end

    R1 --> SIB
    R2 --> I123
    R2 --> MAIN
```

**issueId Parsing**: Split worktree name on first `-` for worktreeRepo, then extract issueId by finding the pattern `{source}{repo}-{number}` (split on last `-` for number).

### 2.3 Worktree Naming Convention

```
{worktreeRepo}-{issueId}-{slug}
       │           │        │
       │           │        └── Human-readable description
       │           └── Issue identifier: {source}{originRepo}-{number}
       └── Repo this worktree belongs to (may differ from issue origin)

Examples:
  api-ghapi-123-auth           → Worktree of api, for GitHub issue 123 from api
  shared-ghapi-123-auth        → Worktree of shared, for same issue (from api)
  web-ghweb-456-bugfix         → Worktree of web, for GitHub issue 456 from web
  api-PROJ-789-feature         → Worktree of api, for Jira issue PROJ-789

Parsing issueId (split on last dash for number):
  ghapi-123                    → source=gh, originRepo=api, number=123
  ghmonorepo-3.0-456           → source=gh, originRepo=monorepo-3.0, number=456
  PROJ-789                     → Jira key PROJ-789
```

---

## 3. Seed Architecture

Seeds are queryable representations of sources of truth, stored as Parquet files.

### 3.1 Seed Categories

```mermaid
graph TB
    subgraph "Seed Categories"
        direction LR

        subgraph "Code Seeds"
            NODES[nodes<br/>functions, classes]
            EDGES[edges<br/>calls, imports]
            REFS[external_refs<br/>dependencies]
        end

        subgraph "Validation Cache (Hub)"
            DIAG[diagnostics<br/>tsc, eslint]
            TEST[test_results<br/>pass/fail]
            AUDIT[audits<br/>security]
        end

        subgraph "Pipeline Seeds"
            WORK[workflows<br/>CI definitions]
            RUNS[runs<br/>job status]
        end

        subgraph "Future Seeds"
            CONTENT[content<br/>docs, CMS]
            INFRA[infra<br/>cloud resources]
            OBS[observability<br/>traces, metrics]
        end
    end
```

### 3.2 Seed Storage Model

```mermaid
graph TB
    subgraph "Per-Repo Storage"
        REPO[repo/]
        DEVAC[.devac/]
        SEED[seed/]
        BASE[base/<br/>main branch]
        BRANCH[branch/name/<br/>feature branches]
        
        subgraph "Parquet Files"
            N[nodes.parquet]
            E[edges.parquet]
            R[external_refs.parquet]
        end
    end

    subgraph "Central Hub"
        HUB[(~/.devac/hub.duckdb)]
        MANIFEST[manifests<br/>repo registry]
        CROSS[cross-repo edges<br/>computed]
    end

    REPO --> DEVAC --> SEED
    SEED --> BASE
    SEED --> BRANCH
    BASE --> N
    BASE --> E
    BASE --> R

    N --> HUB
    E --> HUB
    R --> HUB
```

### 3.3 Validation Cache (Hub-Based)

Unlike code seeds which are stored as Parquet files per-repo, validation errors are stored directly in the Hub's DuckDB. This is because validation data is ephemeral (obsolete when fixed) and benefits from fast SQL writes over Parquet rewrites.

```mermaid
graph LR
    subgraph "Per-Repo Validation"
        VAL[devac validate<br/>runs tsc, eslint]
    end

    subgraph "Central Hub"
        HUB[(~/.devac/central.duckdb)]
        VE[validation_errors table]
    end

    subgraph "Query"
        MCP[MCP Tools<br/>get_validation_*]
    end

    VAL -->|push| HUB
    HUB --> VE
    VE --> MCP
```

See [ADR-0017: Validation Hub Cache](./adr/0017-validation-hub-cache.md) for the decision rationale.

### 3.4 Federation Model

```mermaid
graph LR
    subgraph "Query"
        Q[SQL Query]
    end

    subgraph "Hub"
        HUB[(DuckDB)]
    end

    subgraph "Federated Access"
        A[api/.devac/seed/nodes.parquet]
        B[web/.devac/seed/nodes.parquet]
        C[shared/.devac/seed/nodes.parquet]
    end

    Q --> HUB
    HUB --> A
    HUB --> B
    HUB --> C
```

**Key**: Hub doesn't copy data - it queries Parquet files in place via DuckDB's federated query capability.

---

## 4. Effect Flow

Effects are the universal abstraction for all changes. See [foundation.md Section 5](./foundation.md#5-effects-the-universal-abstraction) for definitions.

### 4.1 Code Effects Flow

Code Effects describe what code does - extracted from AST analysis.

```mermaid
graph LR
    subgraph "Source"
        CODE[Source Code]
    end

    subgraph "Extraction"
        AST[AST Parser]
    end

    subgraph "Low-Level Effects"
        FC[FunctionCall]
        ST[Store]
        RT[Retrieve]
        SN[Send]
    end

    subgraph "Rules Engine"
        RULES[Pattern Matching]
    end

    subgraph "High-Level Effects"
        ACTOR[Actor<br/>UserService]
        COMP[Component<br/>AuthModule]
        DOMAIN[Domain Effect<br/>ChargePayment]
    end

    subgraph "Views"
        C4[C4 Diagrams]
        SEQ[Sequence Diagrams]
        DOCS[Architecture Docs]
    end

    CODE --> AST
    AST --> FC
    AST --> ST
    AST --> RT
    AST --> SN

    FC --> RULES
    ST --> RULES
    RT --> RULES
    SN --> RULES

    RULES --> ACTOR
    RULES --> COMP
    RULES --> DOMAIN

    ACTOR --> C4
    COMP --> C4
    DOMAIN --> SEQ
    DOMAIN --> DOCS
```

### 4.2 Workflow Effects Flow

Workflow Effects describe development activity - triggering pipelines and updates.

```mermaid
graph LR
    subgraph "Triggers"
        FS[FileChanged<br/>fs watch]
        WH[Webhook<br/>GitHub]
        CMD[Command<br/>CLI]
    end

    subgraph "Processing"
        EXT[Extract<br/>parse, transform]
        VAL[Validate<br/>type, lint, test]
    end

    subgraph "State Updates"
        SU[SeedUpdated]
        HR[HubRefresh]
        VR[ValidationResult]
    end

    subgraph "Notifications"
        CLI[CLI Output]
        MCP[MCP Events]
        LOG[Log File]
    end

    FS --> EXT
    WH --> EXT
    CMD --> EXT

    EXT --> SU
    SU --> HR

    FS --> VAL
    VAL --> VR

    HR --> CLI
    HR --> MCP
    VR --> CLI
    VR --> LOG
```

### 4.3 Effect Handler Chain

```mermaid
graph LR
    subgraph "Handler 1"
        H1["(state, FileChanged) →<br/>(state', [Extract])"]
    end

    subgraph "Handler 2"
        H2["(state, Extract) →<br/>(state', [SeedUpdated])"]
    end

    subgraph "Handler 3"
        H3["(state, SeedUpdated) →<br/>(state', [HubRefresh])"]
    end

    subgraph "Handler 4"
        H4["(state, HubRefresh) →<br/>(state', [QueryReady])"]
    end

    E1[FileChanged] --> H1
    H1 --> E2[Extract]
    E2 --> H2
    H2 --> E3[SeedUpdated]
    E3 --> H3
    H3 --> E4[HubRefresh]
    E4 --> H4
    H4 --> E5[QueryReady]
```

**Universal Pattern**: `effectHandler = (state, effect) => (state', [effect'])`

---

## 5. Data Flow Pipeline

```mermaid
graph LR
    subgraph "1. Sources"
        S1[Git<br/>file watch]
        S2[APIs<br/>polling]
        S3[Webhooks<br/>push]
        S4[CLI<br/>manual]
    end

    subgraph "2. Extract"
        E1[Parse<br/>AST, JSON]
        E2[Transform<br/>normalize]
        E3[Validate<br/>schema check]
    end

    subgraph "3. Store"
        ST1[(Seeds<br/>Parquet)]
    end

    subgraph "4. Index"
        I1[(Hub<br/>DuckDB)]
    end

    subgraph "5. Query"
        Q1[SQL<br/>relational]
        Q2[Graph<br/>recursive CTEs]
        Q3[Search<br/>full-text]
    end

    subgraph "6. Present"
        P1[Views<br/>tables, JSON]
        P2[Diagrams<br/>C4, sequence]
        P3[Answers<br/>LLM responses]
    end

    S1 --> E1
    S2 --> E1
    S3 --> E1
    S4 --> E1

    E1 --> E2 --> E3 --> ST1
    ST1 --> I1
    I1 --> Q1
    I1 --> Q2
    I1 --> Q3

    Q1 --> P1
    Q2 --> P2
    Q3 --> P3
```

### 5.1 Update Mechanisms

```mermaid
graph TB
    subgraph "Change Detection"
        FS[Filesystem Watcher<br/>~100ms latency]
        WH[Webhooks<br/>~1s latency]
        POLL[Polling<br/>1-5min latency]
        STREAM[Streaming<br/>real-time]
    end

    subgraph "Event Queue"
        QUEUE[Debounced Queue<br/>batch changes]
    end

    subgraph "Processing"
        DELTA[Delta Extraction<br/>only changed files]
        MERGE[Seed Merge<br/>atomic update]
    end

    subgraph "State"
        SEEDS[(Seeds)]
        HUB[(Hub)]
    end

    FS --> QUEUE
    WH --> QUEUE
    POLL --> QUEUE
    STREAM --> QUEUE

    QUEUE --> DELTA
    DELTA --> MERGE
    MERGE --> SEEDS
    SEEDS --> HUB
```

| Source Type | Mechanism | Latency | Example |
|-------------|-----------|---------|---------|
| Local files | Filesystem watch | ~100ms | Code changes |
| GitHub | Webhooks | ~1s | PR events, CI status |
| Cloud APIs | Polling | ~1-5min | AWS resources |
| Monitoring | Streaming | Real-time | OTEL traces |

---

## 6. Component Boundaries

### 6.1 Package Structure

```mermaid
graph TB
    subgraph "devac-core"
        PARSE[Parsers<br/>TS, Python, C#]
        SEED[Seed Storage<br/>Parquet, DuckDB]
        HUB_CORE[Hub Federation]
        WATCH[File Watcher]
        VAL_CORE[Validation Coordinator]
        CTX[Context Discovery]
    end

    subgraph "devac-cli"
        CMDS[Commands<br/>analyze, query, watch, hub, context, validate]
    end

    subgraph "devac-mcp"
        TOOLS[MCP Tools<br/>find_symbol, get_dependencies, query_sql, ...]
        SERVER[MCP Server]
    end

    subgraph "devac-worktree"
        WT_CMDS[Worktree Commands<br/>start, list, status, clean]
        GH[GitHub Integration]
    end

    CMDS --> PARSE
    CMDS --> SEED
    CMDS --> HUB_CORE
    CMDS --> WATCH
    CMDS --> VAL_CORE
    CMDS --> CTX

    TOOLS --> HUB_CORE
    TOOLS --> SEED
    SERVER --> TOOLS

    WT_CMDS --> CTX
    WT_CMDS --> GH
```

### 6.2 Dependency Flow

```mermaid
graph LR
    CLI[devac-cli] --> CORE[devac-core]
    MCP[devac-mcp] --> CORE
    WT[devac-worktree] --> CORE

    CORE --> DUCKDB[duckdb]
    CORE --> PARQUET[parquet-wasm]
    CORE --> TSMORPH[ts-morph]
    CORE --> CHOKIDAR[chokidar]
```

### 6.4 Workspace Module

The workspace module (`devac-core/src/workspace/`) orchestrates multi-repo operations.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      WorkspaceManager                                │
│                  (orchestrates all workspace operations)             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│  │  Discovery   │   │   Watcher    │   │  Auto-Refresh    │        │
│  │              │   │              │   │                  │        │
│  │  - Scan dirs │   │  - Chokidar  │   │  - Debounce      │        │
│  │  - Parse IDs │   │  - Seed globs│   │  - Hub refresh   │        │
│  │  - Group WTs │   │  - Events    │   │  - Batch changes │        │
│  └──────────────┘   └──────────────┘   └──────────────────┘        │
│         │                  │                    │                   │
│         ▼                  ▼                    ▼                   │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│  │    State     │   │ SeedDetector │   │   CentralHub     │        │
│  │ .devac/state │   │  *.parquet   │   │   (existing)     │        │
│  └──────────────┘   └──────────────┘   └──────────────────┘        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Effect Flow:**
```
SeedFileChanged → SeedDetector → AutoRefresher → Hub.refresh()
```

**Two-Tier Watching:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Per-Repo (devac watch)              Workspace (workspace watch)    │
│                                                                     │
│  Source Files ──► Seeds              Seeds ──► Hub                  │
│  *.ts, *.py, *.cs                    *.parquet                      │
│                                                                     │
│  Updates on source change            Refreshes on seed change       │
│  Run inside each repo                Run from parent directory      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Human / LLM / System Boundaries

### 7.1 Responsibility Flow

```mermaid
graph TB
    subgraph "System (Deterministic)"
        SYS1[Extract seeds]
        SYS2[Execute queries]
        SYS3[Generate diagrams]
        SYS4[Run validations]
        SYS5[Detect changes]
    end

    subgraph "LLM (Reasoning)"
        LLM1[Interpret intent]
        LLM2[Propose changes]
        LLM3[Explain code]
        LLM4[Suggest fixes]
        LLM5[Generate docs]
    end

    subgraph "Human (Decisions)"
        HUM1[Define vision]
        HUM2[Approve changes]
        HUM3[Set conventions]
        HUM4[Validate rules]
    end

    SYS1 --> LLM3
    SYS2 --> LLM1
    LLM2 --> HUM2
    HUM1 --> LLM2
    SYS4 --> LLM4
    LLM4 --> HUM2
    HUM3 --> SYS4
    LLM5 --> HUM4
```

### 7.2 Collaboration Patterns

```mermaid
sequenceDiagram
    participant H as Human
    participant L as LLM
    participant S as System

    Note over H,S: Pattern 1: Human Intent → LLM Execution → System Validation
    H->>L: "Add auth to the API"
    L->>S: Query seeds
    S->>L: Return context
    L->>S: Write code
    S->>S: Type-check, lint, test
    S->>L: Validation results
    L->>H: Present for review
    H->>S: Approve

    Note over H,S: Pattern 2: System Alert → LLM Triage → Human Decision
    S->>L: Test failure detected
    L->>L: Analyze failure
    L->>H: Propose fixes
    H->>L: Choose approach
    L->>S: Implement fix
```

---

## 8. Query Architecture

### 8.1 Query Capabilities by Seed Type

| Seed Category | Graph | Relational | K-V | Full-Text | Vector |
|---------------|:-----:|:----------:|:---:|:---------:|:------:|
| Code          | ✓     | ✓          | ✓   | ✓         | ◐      |
| Validation    | -     | ✓          | ✓   | ✓         | -      |
| Pipeline      | ◐     | ✓          | ✓   | ✓         | -      |
| Content       | ◐     | ✓          | ✓   | ✓         | ✓      |
| Infra         | ✓     | ✓          | ✓   | ✓         | -      |
| Observability | ◐     | ✓          | ✓   | ✓         | -      |

*✓ = Primary, ◐ = Secondary, - = Not applicable*

### 8.2 Query Implementation

```mermaid
graph LR
    subgraph "Query Types"
        SQL[SQL<br/>SELECT, JOIN, WHERE]
        GRAPH[Graph<br/>Recursive CTEs]
        SEARCH[Full-Text<br/>LIKE, regex]
    end

    subgraph "Engine"
        DUCK[(DuckDB)]
    end

    subgraph "Storage"
        PQ1[nodes.parquet]
        PQ2[edges.parquet]
        PQ3[external_refs.parquet]
    end

    SQL --> DUCK
    GRAPH --> DUCK
    SEARCH --> DUCK

    DUCK --> PQ1
    DUCK --> PQ2
    DUCK --> PQ3
```

**Implementation**: SQL-first with graph traversal via recursive CTEs. No dedicated graph language needed.

### 8.3 MCP Tool Mapping

| MCP Tool | Query Type | Purpose |
|----------|------------|---------|
| `find_symbol` | Full-text | Search symbols by name |
| `get_dependencies` | Graph | Outgoing edges from symbol |
| `get_dependents` | Graph | Incoming edges to symbol |
| `get_file_symbols` | Relational | All symbols in a file |
| `get_affected` | Graph | Impact analysis |
| `get_call_graph` | Graph | Function call tree |
| `query_sql` | SQL | Arbitrary queries |
| `list_repos` | Relational | Hub registry |
| `get_context` | Relational | Sibling repos, worktrees, issues |
| `get_validation_errors` | Relational | Query cached validation errors |
| `get_validation_summary` | Relational | Grouped error counts |
| `get_validation_counts` | Relational | Total error/warning counts |

---

## 9. Document References

| Topic | Document | Section |
|-------|----------|---------|
| Core concepts | [foundation.md](./foundation.md) | All |
| Effects taxonomy | [foundation.md](./foundation.md) | Section 5 |
| Rules | [foundation.md](./foundation.md) | Section 5.6 |
| Effect Store | [foundation.md](./foundation.md) | Section 6 |
| Human/LLM/System | [foundation.md](./foundation.md) | Section 9 |
| Implementation status | [foundation-how.md](./foundation-how.md) | Section 2 |
| Bootstrap phases | [foundation-how.md](./foundation-how.md) | Section 1 |
| Rules implementation | [foundation-how.md](./foundation-how.md) | Section 4 |

---

*Version: 1.1 - Added validation hub cache, updated MCP tools*
*Visual companion to [foundation.md](./foundation.md)*
