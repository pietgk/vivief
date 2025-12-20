# DevAC v3 Architecture

> High-level architecture for the next generation of DevAC
> Status: Planning / Alignment Phase

---

## 1. System Overview

```mermaid
graph TB
    subgraph "Sources of Truth"
        CODE[Code<br/>Git Repos]
        CONTENT[Content<br/>Docs Systems]
        INFRA[Infrastructure<br/>Cloud APIs]
        CICD[CI/CD<br/>Pipelines]
        OBS[Observability<br/>Monitoring]
        VAL[Validation<br/>Dev Tools]
    end

    subgraph "Extraction Layer"
        EXT[Extractors]
    end

    subgraph "Seed Layer"
        SEEDS[(Seeds<br/>Queryable State)]
    end

    subgraph "Query Layer"
        HUB[Hub<br/>Federated Queries]
    end

    subgraph "Interface Layer"
        CLI[CLI]
        MCP[MCP Server]
        API[API]
    end

    subgraph "Consumers"
        HUMAN[Human]
        LLM[LLM]
        SYSTEM[System]
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

---

## 2. Workspace Model

```mermaid
graph TB
    subgraph "Workspace ~/ws/"
        direction TB

        subgraph "Repos"
            API[api/]
            WEB[web/]
            SHARED[shared/]
        end

        subgraph "Worktrees"
            WT1[api-123-auth/]
            WT2[web-123-auth/]
        end

        subgraph "Workspace State"
            DEVAC[.devac/]
            HUB[(hub.duckdb)]
            CACHE[cache/]
        end
    end

    subgraph "Per-Repo Seeds"
        API_SEED[api/.devac/seed/]
        WEB_SEED[web/.devac/seed/]
    end

    API --> API_SEED
    WEB --> WEB_SEED
    API_SEED --> HUB
    WEB_SEED --> HUB

    style DEVAC fill:#e1f5fe
    style HUB fill:#fff9c4
```

**Convention-Based Discovery:**
- Workspace = directory containing multiple git repos
- Repo = any git repository in workspace
- Worktree = directory matching `{repo}-{issue}-{slug}` pattern
- No registration required - all discovered automatically

---

## 3. Seed Taxonomy

```mermaid
graph LR
    subgraph "Seed Categories"
        direction TB

        subgraph "Code Seeds"
            AST[AST Nodes]
            EDGES[Call Graph]
            DEPS[Dependencies]
            EFFECTS[Effects]
        end

        subgraph "Content Seeds"
            DOCS[Documents]
            PAGES[Pages]
            SCHEMAS[Schemas]
        end

        subgraph "Infra Seeds"
            RESOURCES[Resources]
            TOPOLOGY[Topology]
            CONFIG[Config]
        end

        subgraph "Pipeline Seeds"
            RUNS[CI Runs]
            WEBHOOKS[Webhooks]
            DEPLOYS[Deploys]
        end

        subgraph "Observability Seeds"
            METRICS[Metrics]
            TRACES[Traces]
            LOGS[Logs]
        end

        subgraph "Validation Seeds"
            ERRORS[Type Errors]
            LINT[Lint Issues]
            TESTS[Test Results]
            SECURITY[Security Audits]
        end
    end
```

---

## 4. Query Capabilities Matrix

```mermaid
graph TB
    subgraph "Query Types"
        GRAPH[Graph<br/>Relationships]
        REL[Relational<br/>Structured]
        KV[Key-Value<br/>Lookups]
        FTS[Full-Text<br/>Search]
        VEC[Vector<br/>Semantic]
        TS[Time-Series<br/>Trends]
        OTEL[OTEL<br/>Traces]
    end

    subgraph "Seeds Support"
        CODE_S[Code Seeds]
        CONTENT_S[Content Seeds]
        OBS_S[Observability Seeds]
    end

    CODE_S ---|graph, relational, kv, fts| GRAPH
    CODE_S ---|graph, relational, kv, fts| REL
    CODE_S ---|graph, relational, kv, fts| KV
    CODE_S ---|graph, relational, kv, fts| FTS

    CONTENT_S ---|fts, vector, kv| FTS
    CONTENT_S ---|fts, vector, kv| VEC
    CONTENT_S ---|fts, vector, kv| KV

    OBS_S ---|timeseries, otel, relational| TS
    OBS_S ---|timeseries, otel, relational| OTEL
    OBS_S ---|timeseries, otel, relational| REL
```

**Query Type Support by Seed Category:**

| Seed Category | Graph | Relational | K-V | Full-Text | Vector | Time-Series | OTEL |
|---------------|:-----:|:----------:|:---:|:---------:|:------:|:-----------:|:----:|
| Code          | ✓     | ✓          | ✓   | ✓         | ◐      | -           | -    |
| Content       | ◐     | ✓          | ✓   | ✓         | ✓      | -           | -    |
| Infra         | ✓     | ✓          | ✓   | ✓         | -      | -           | -    |
| Pipeline      | ◐     | ✓          | ✓   | ✓         | -      | ✓           | -    |
| Observability | ◐     | ✓          | ✓   | ✓         | -      | ✓           | ✓    |
| Validation    | -     | ✓          | ✓   | ✓         | -      | ✓           | -    |

*✓ = Primary, ◐ = Secondary, - = Not applicable*

---

## 5. Data Flow Pipeline

```mermaid
graph LR
    subgraph "1. Sources"
        S1[Git]
        S2[APIs]
        S3[Webhooks]
        S4[Watchers]
    end

    subgraph "2. Extract"
        E1[Parse]
        E2[Transform]
        E3[Normalize]
    end

    subgraph "3. Store"
        ST1[(Seeds<br/>Parquet)]
    end

    subgraph "4. Index"
        I1[(Hub<br/>DuckDB)]
    end

    subgraph "5. Query"
        Q1[SQL]
        Q2[Graph]
        Q3[Search]
    end

    subgraph "6. Present"
        P1[Views]
        P2[Diagrams]
        P3[Answers]
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

---

## 6. Update Mechanisms

```mermaid
graph TB
    subgraph "Change Detection"
        FS[Filesystem Watcher<br/>Workspace-level]
        WH[Webhooks<br/>GitHub, CI/CD]
        POLL[Polling<br/>Cloud APIs]
        STREAM[Streaming<br/>OTEL, Logs]
    end

    subgraph "Processing"
        QUEUE[Event Queue]
        DELTA[Delta Extraction]
        MERGE[Seed Merge]
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

**Update Strategies:**

| Source Type | Mechanism | Latency | Example |
|-------------|-----------|---------|---------|
| Local files | Filesystem watch | ~100ms | Code changes |
| GitHub | Webhooks (smee) | ~1s | PR events, CI status |
| Cloud APIs | Polling | ~1-5min | AWS resources |
| Monitoring | Streaming | Real-time | OTEL traces |

---

## 7. Component Boundaries

```mermaid
graph TB
    subgraph "Core (Phase 1)"
        CORE_EXT[Code Extractor]
        CORE_SEED[Seed Storage]
        CORE_HUB[Hub Federation]
        CORE_CLI[CLI]
        CORE_MCP[MCP Server]
    end

    subgraph "Extensions (Phase 2)"
        EXT_VAL[Validation Seeds<br/>tsc, eslint, tests]
        EXT_CICD[CI/CD Seeds<br/>GitHub Actions]
        EXT_SEC[Security Seeds<br/>Audit reports]
    end

    subgraph "Future (Phase 3+)"
        FUT_CONTENT[Content Seeds<br/>Notion, Docs]
        FUT_INFRA[Infra Seeds<br/>AWS, Azure]
        FUT_OBS[Observability Seeds<br/>OTEL, Datadog]
        FUT_VEC[Vector Queries<br/>Semantic search]
    end

    CORE_EXT --> CORE_SEED
    CORE_SEED --> CORE_HUB
    CORE_HUB --> CORE_CLI
    CORE_HUB --> CORE_MCP

    EXT_VAL --> CORE_SEED
    EXT_CICD --> CORE_SEED
    EXT_SEC --> CORE_SEED

    FUT_CONTENT --> CORE_SEED
    FUT_INFRA --> CORE_SEED
    FUT_OBS --> CORE_SEED

    style CORE_EXT fill:#c8e6c9
    style CORE_SEED fill:#c8e6c9
    style CORE_HUB fill:#c8e6c9
    style CORE_CLI fill:#c8e6c9
    style CORE_MCP fill:#c8e6c9
```

---

## 8. Human / LLM / System Boundaries

```mermaid
graph TB
    subgraph "System (Deterministic)"
        SYS1[Extract seeds from sources]
        SYS2[Execute queries]
        SYS3[Generate diagrams]
        SYS4[Run validations]
        SYS5[Detect changes]
    end

    subgraph "LLM (Reasoning)"
        LLM1[Interpret questions]
        LLM2[Propose changes]
        LLM3[Explain code]
        LLM4[Suggest fixes]
        LLM5[Generate docs]
    end

    subgraph "Human (Decisions)"
        HUM1[Define intent / vision]
        HUM2[Approve changes]
        HUM3[Set conventions]
        HUM4[Review architecture]
    end

    SYS1 --> LLM1
    LLM1 --> SYS2
    SYS2 --> LLM3
    LLM2 --> HUM2
    HUM1 --> LLM2
    SYS4 --> LLM4
    LLM4 --> HUM2
```

---

## 9. Effect Handler Integration

```mermaid
graph LR
    subgraph "Effect Flow"
        E1[FileChanged]
        E2[Extract]
        E3[SeedUpdated]
        E4[HubRefresh]
        E5[QueryReady]
    end

    subgraph "Handler Chain"
        H1["(state, FileChanged) →<br/>(state', [Extract])"]
        H2["(state, Extract) →<br/>(state', [SeedUpdated])"]
        H3["(state, SeedUpdated) →<br/>(state', [HubRefresh])"]
    end

    E1 --> H1
    H1 --> E2
    E2 --> H2
    H2 --> E3
    E3 --> H3
    H3 --> E4
    E4 --> E5
```

**Everything is an effect:**
- Source changes → `FileChanged`, `WebhookReceived`, `APIPolled`
- Processing → `Extract`, `Transform`, `Merge`
- State updates → `SeedUpdated`, `HubRefreshed`
- Queries → `QueryRequested`, `ResultReturned`

---

## 10. Phasing Summary

```mermaid
gantt
    title DevAC v3 Phases
    dateFormat X
    axisFormat %s

    section Phase 1 - Core
    Code Seeds (existing)      :done, p1a, 0, 1
    Workspace Discovery        :p1b, 1, 2
    Unified Watcher           :p1c, 2, 3
    Hub Auto-refresh          :p1d, 3, 4

    section Phase 2 - Validation
    TypeScript Errors         :p2a, 4, 5
    ESLint Issues            :p2b, 5, 6
    Test Results             :p2c, 6, 7
    Security Audits          :p2d, 7, 8

    section Phase 3 - CI/CD
    GitHub Webhooks          :p3a, 8, 9
    CI Run Seeds             :p3b, 9, 10
    PR Status Seeds          :p3c, 10, 11

    section Future
    Content Seeds            :p4a, 11, 12
    Infra Seeds              :p4b, 12, 13
    Observability Seeds      :p4c, 13, 14
    Vector Queries           :p4d, 14, 15
```

---

## Key Questions for Alignment

1. **Phase 1 Scope**: Is workspace discovery + unified watcher + hub auto-refresh the right starting point?

2. **Seed Format**: Should all seeds use the same Parquet schema, or allow seed-type-specific schemas?

3. **Query Interface**: SQL-first with graph as recursive CTEs, or add a dedicated graph query language?

4. **Real-time vs Batch**: Which seeds need real-time updates vs periodic refresh?

5. **LLM Integration**: MCP tools for querying, or also for triggering extractions?

---

*Document Version: 0.1 - Initial Architecture Diagrams*
*Status: Awaiting alignment feedback*
