# Alternative A — Schema-First with LLM Enhancement (Archived)

> **Archived 2026-04-09.** Resolved as Phase 1 of phased approach in [contract/procurement/extraction-pipeline.md](../../contract/procurement/extraction-pipeline.md).

> Original: The pragmatic approach: humans define schemas, LLMs fill them, 
> the system just gets better at filling over time.
> Lower risk, lower reward. The safe starting point.

## Architecture

```mermaid
graph TB
    subgraph Sources["🌐 Sources"]
        WEB[("Procurement\nPortals")]
        PDF[("Documents")]
    end

    subgraph Scraping["⬇️ Scraping"]
        BA["Browser Agents"]
        CR["Crawlers"]
    end

    subgraph SchemaRegistry["📋 Schema Registry (Human-Managed)"]
        direction LR
        S_SE["Swedish\nProcurement\nSchema"]
        S_NO["Norwegian\nProcurement\nSchema"]
        S_EU["EU TED\nSchema"]
        S_GEN["Generic\nContract\nSchema"]
    end

    subgraph NATS["📡 NATS"]
        RAW[/"RAW_DOCS"/]
        DONE[/"EXTRACTED"/]
    end

    subgraph Extraction["🧠 LLM Extraction"]
        CLS["Document Classifier\n(which schema?)"]
        EXT["Schema-Driven Extractor\n(fill the template)"]
        VAL["Deterministic Validator"]
    end

    subgraph Lake["🏠 Lakehouse"]
        ICE_SE["iceberg: procurement_se"]
        ICE_NO["iceberg: procurement_no"]
        ICE_EU["iceberg: procurement_eu"]
        ICE_GEN["iceberg: contracts_generic"]
    end

    subgraph Query["🔍 Query"]
        DDB["DuckDB"]
    end

    WEB --> BA --> RAW
    PDF --> CR --> RAW

    RAW --> CLS
    SchemaRegistry --> CLS
    CLS -->|"matched"| EXT
    CLS -->|"unknown type"| MANUAL["⚠️ Manual\nSchema Creation"]
    MANUAL --> SchemaRegistry
    EXT --> VAL
    VAL -->|"valid"| DONE
    VAL -->|"invalid"| REVIEW["👤 Manual Review"]
    DONE --> ICE_SE & ICE_NO & ICE_EU & ICE_GEN
    ICE_SE & ICE_NO & ICE_EU & ICE_GEN --> DDB

    style SchemaRegistry fill:#744210,color:#fff
    style MANUAL fill:#9b2c2c,color:#fff
    style REVIEW fill:#9b2c2c,color:#fff
```

## Comparison with Self-Organizing Approach

```
┌─────────────────────────┬──────────────────────┬──────────────────────┐
│                         │ Schema-First (this)  │ Self-Organizing      │
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ New source onboarding   │ Days (human defines  │ Hours (system        │
│                         │ schema first)        │ discovers schema)    │
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ Schema quality          │ High (human-crafted) │ Variable (emergent)  │
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ Handles surprises       │ Poorly (unknown docs │ Well (clusters new   │
│                         │ fail or get generic) │ patterns naturally)  │
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ Operational complexity  │ Low                  │ High                 │
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ Trust / auditability    │ High (schemas are    │ Lower (schemas are   │
│                         │ explicit contracts)  │ derived, need review)│
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ Scales to new countries │ Linearly (each needs │ Sub-linearly (system │
│                         │ manual schema work)  │ reuses patterns)     │
├─────────────────────────┼──────────────────────┼──────────────────────┤
│ Best for                │ Known, stable sources│ Diverse, evolving    │
│                         │ with clear structure │ sources at scale     │
└─────────────────────────┴──────────────────────┴──────────────────────┘
```
