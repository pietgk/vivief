# Technology Stack Map & Component Detail

## Concrete Technology Choices per Layer

```mermaid
graph TB
    subgraph Scraping["Acquisition Layer"]
        direction LR
        BU["🔧 Browser-Use\n<i>portal navigation,\nlogin, pagination</i>"]
        C4["🔧 Crawl4AI\n<i>bulk crawling,\ncosine filtering</i>"]
        JN["🔧 Jina Reader\n<i>quick URL→markdown,\nPDF reading</i>"]
        LW["🔧 LLMWhisperer\n<i>scanned docs,\nhandwriting OCR</i>"]
    end

    subgraph Messaging["Messaging & Coordination"]
        direction LR
        NS["🔧 NATS JetStream\n<i>streams, KV store,\nobject store, req-reply</i>"]
    end

    subgraph Extraction["Extraction & Intelligence"]
        direction LR
        CL["🔧 Claude / GPT-4o\n<i>complex extraction,\nschema proposals</i>"]
        OL["🔧 Ollama (local)\n<i>Llama/Qwen for\nhigh-volume extraction</i>"]
        EM["🔧 all-MiniLM-L6-v2\n<i>embeddings for\nclustering & similarity</i>"]
        PY["🔧 Pydantic\n<i>schema definitions,\nvalidation</i>"]
    end

    subgraph Storage["Lakehouse Storage"]
        direction LR
        S3["🔧 AWS S3\n<i>data files\n(Parquet)</i>"]
        PG["🔧 PostgreSQL\n<i>catalog metadata\n(DuckLake or Polaris)</i>"]
    end

    subgraph Catalog["Catalog Options"]
        direction LR
        DL["🔧 DuckLake\n<i>simplest, DuckDB-native\nbest for starting</i>"]
        PO["🔧 Polaris\n<i>REST catalog, RBAC\nmulti-engine</i>"]
        NE["🔧 Nessie\n<i>Git branching\nschema proposals</i>"]
    end

    subgraph Query["Query & Analysis"]
        direction LR
        DD["🔧 DuckDB\n<i>dev, analytics,\nfast iteration</i>"]
        TR["🔧 Trino\n<i>multi-user,\ndashboards</i>"]
    end

    Scraping --> Messaging
    Messaging --> Extraction
    Extraction --> Storage
    Storage --- Catalog
    Catalog --> Query

    style Scraping fill:#2d3748,color:#fff
    style Messaging fill:#4a5568,color:#fff
    style Extraction fill:#1a365d,color:#fff
    style Storage fill:#22543d,color:#fff
    style Catalog fill:#553c9a,color:#fff
    style Query fill:#744210,color:#fff
```

## Cost-Optimized Extraction Pipeline

> Key insight: use cheap/free tools for filtering, 
> expensive LLMs only for the hard parts.

```mermaid
graph LR
    subgraph Free["💚 Free / Cheap"]
        JINA["Jina Reader\nURL → Markdown\n(free tier)"]
        COS["Cosine Similarity\nFilter irrelevant\nchunks\n(local embeddings)"]
        REG["Regex + Rules\nExtract obvious\nfields\n(dates, amounts)"]
    end

    subgraph Mid["💛 Moderate Cost"]
        OLL["Ollama (local LLM)\nSchema-driven\nextraction\n(~$0/request)"]
        VAL["Pydantic Validation\nType-check +\nbusiness rules\n(free)"]
    end

    subgraph Expensive["🔴 Expensive (use sparingly)"]
        GPT["Claude / GPT-4o\nComplex docs,\nschema discovery,\nadversarial validation\n(~$0.01-0.10/doc)"]
    end

    DOC["📄 Document"] --> JINA
    JINA -->|"markdown"| COS
    COS -->|"relevant\nchunks only\n(~30% of content)"| REG
    REG -->|"partially\nextracted"| OLL
    OLL -->|"structured\nJSON"| VAL

    VAL -->|"✓ valid"| DONE["✅ Lakehouse"]
    VAL -->|"✗ low\nconfidence"| GPT
    GPT -->|"re-extracted"| VAL

    COS -->|"unknown\ndoc type"| GPT

    style Free fill:#22543d,color:#fff
    style Mid fill:#744210,color:#fff
    style Expensive fill:#9b2c2c,color:#fff
```

## Data Flow Through NATS Subjects

```mermaid
graph TD
    subgraph Subjects["NATS Subject Hierarchy"]
        direction TB

        subgraph scrape["scrape.>"]
            scrape_se["scrape.procurement.se"]
            scrape_no["scrape.procurement.no"]
            scrape_eu["scrape.procurement.eu"]
            scrape_new["scrape.discovery.*"]
        end

        subgraph extract["extract.>"]
            extract_req["extract.request\n<i>(request-reply)</i>"]
            extract_schema["extract.with-schema.*\n<i>(known types)</i>"]
            extract_discover["extract.unsupervised\n<i>(unknown types)</i>"]
        end

        subgraph schema["schema.>"]
            schema_propose["schema.proposal.new"]
            schema_approved["schema.approved"]
            schema_evolved["schema.evolved"]
            schema_drift["schema.drift-detected"]
        end

        subgraph data["data.>"]
            data_validated["data.validated.*"]
            data_failed["data.failed.validation"]
            data_review["data.needs-review"]
        end
    end

    scrape --> extract
    extract --> schema
    extract --> data

    style scrape fill:#2d3748,color:#fff
    style extract fill:#1a365d,color:#fff
    style schema fill:#553c9a,color:#fff
    style data fill:#22543d,color:#fff
```

## Deployment View — Minimal Viable Setup

```mermaid
graph TB
    subgraph Dev["🖥️ Developer Laptop"]
        direction TB
        DDEV["DuckDB + DuckLake\n(local catalog + storage)"]
        NDEV["NATS Server\n(single binary)"]
        ODEV["Ollama\n(local LLM)"]
        WDEV["Workers\n(Python processes)"]
        DDEV ~~~ NDEV ~~~ ODEV ~~~ WDEV
    end

    subgraph Prod["☁️ Production (AWS)"]
        direction TB

        subgraph Compute["ECS / Lambda"]
            SCRP["Scraper Workers\n(x3-10, auto-scale)"]
            EXTR["Extraction Workers\n(x2-5, GPU optional)"]
            LOAD["Loader\n(x1-2)"]
        end

        subgraph Data["Managed Services"]
            S3P["S3\n(Parquet files)"]
            RDS["RDS PostgreSQL\n(catalog metadata)"]
        end

        subgraph Infra["Self-Hosted (lightweight)"]
            NPROD["NATS JetStream\n(t3.medium, clustered)"]
            POL["Polaris or DuckLake\n(on RDS PostgreSQL)"]
        end

        Compute --> NPROD
        NPROD --> LOAD
        LOAD --> S3P
        LOAD --> POL
        POL --> RDS
    end

    Dev -->|"same code,\ndifferent config"| Prod

    style Dev fill:#2d3748,color:#fff
    style Prod fill:#1a365d,color:#fff
    style Compute fill:#2c5282,color:#fff
    style Data fill:#22543d,color:#fff
    style Infra fill:#553c9a,color:#fff
```

## Decision Matrix — Which Architecture to Start With

```
                        Your Situation
                        ─────────────────────────────────────────
                        │ < 5 sources,   │ 5-20 sources,  │ 20+ sources,
                        │ stable schemas │ some new ones   │ many countries
                        │                │ occasionally    │ evolving fast
┌───────────────────────┼────────────────┼────────────────┼──────────────┐
│ Schema-First (Alt A)  │  ✅ START HERE │  ⚠️ works but  │  ❌ doesn't  │
│                       │  simple, fast  │  onboarding is │  scale       │
│                       │  predictable   │  a bottleneck  │              │
├───────────────────────┼────────────────┼────────────────┼──────────────┤
│ Progressive (Alt B)   │  overkill      │  ✅ SWEET SPOT │  ✅ good     │
│                       │                │  fast+slow path│  balance     │
│                       │                │  human gate    │              │
├───────────────────────┼────────────────┼────────────────┼──────────────┤
│ Self-Organizing       │  overkill      │  premature     │  ✅ THE GOAL │
│ (Full Vision)         │                │                │  if you can  │
│                       │                │                │  invest in it│
└───────────────────────┴────────────────┴────────────────┴──────────────┘

Recommended path: Start with A → evolve to B → aim for full vision
Each stage is independently useful, not wasted work
```
