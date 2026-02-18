# The Agentic Catalog — The Novel Idea

> What if the catalog wasn't just a metadata store, 
> but an intelligent agent that proposes, validates, 
> and evolves schemas autonomously?

## Concept

```mermaid
graph TB
    subgraph Traditional["Traditional Catalog (passive)"]
        direction LR
        TC_IN["Engine asks:\nwhere is table X?"]
        TC_CAT["Catalog returns:\nmetadata pointer"]
        TC_OUT["Engine reads data"]
        TC_IN --> TC_CAT --> TC_OUT
    end

    subgraph Agentic["Agentic Catalog (active)"]
        direction TB

        subgraph Observe["👁️ Observe"]
            OB1["Monitor incoming data patterns"]
            OB2["Detect schema drift"]
            OB3["Track extraction quality metrics"]
        end

        subgraph Reason["🧠 Reason"]
            RE1["'These 3 tables could\nbe unified into 1'"]
            RE2["'Field X has changed\nmeaning since last month'"]
            RE3["'New document type detected,\nresembles Swedish procurement\nbut with Finnish fields'"]
        end

        subgraph Propose["📝 Propose"]
            PR1["Generate schema\nmerge request"]
            PR2["Create Nessie branch\nwith proposed changes"]
            PR3["Run validation against\nexisting data"]
        end

        subgraph Present["👤 Present to Human"]
            HU1["'I propose merging tables\nA and B. Here's why.\nHere's the diff.\n94% of records validate.'"]
        end

        Observe --> Reason --> Propose --> Present
    end

    Traditional ~~~ Agentic

    style Traditional fill:#4a5568,color:#fff
    style Agentic fill:#1a365d,color:#fff
    style Observe fill:#2c5282,color:#fff
    style Reason fill:#553c9a,color:#fff
    style Propose fill:#2f855a,color:#fff
    style Present fill:#744210,color:#fff
```

## The Agentic Catalog Loop

```mermaid
stateDiagram-v2
    [*] --> Monitoring: Catalog watches data streams

    Monitoring --> PatternDetected: New pattern / drift / anomaly
    Monitoring --> Monitoring: Normal operations

    PatternDetected --> Analysis: LLM analyzes the change

    Analysis --> SchemaProposal: Change warrants schema update
    Analysis --> Monitoring: False alarm, continue

    SchemaProposal --> BranchCreated: Create Nessie branch\nwith proposed schema

    BranchCreated --> ValidationRun: Test proposal against\nN existing + new documents

    ValidationRun --> PassedValidation: > 95% validate cleanly
    ValidationRun --> FailedValidation: Too many failures

    FailedValidation --> SchemaProposal: Refine proposal\n(up to 3 attempts)
    FailedValidation --> Monitoring: Abandon after 3 failures\n+ alert human

    PassedValidation --> HumanReview: Present merge request\nwith evidence

    HumanReview --> Merged: Human approves
    HumanReview --> Rejected: Human rejects
    HumanReview --> Refined: Human modifies

    Merged --> Monitoring: Schema updated on main\nExtractors notified via NATS
    Rejected --> Monitoring: Branch deleted\nLesson logged
    Refined --> ValidationRun: Re-validate with changes
```

## What the Agentic Catalog "Sees"

```mermaid
graph LR
    subgraph Signals["📊 Input Signals"]
        direction TB
        SIG1["Field distribution changes\n<i>e.g. 'currency' field now has\n40% EUR where it was 100% SEK</i>"]
        SIG2["New field clusters appearing\n<i>e.g. 50 docs have a 'framework_id'\nfield we never defined</i>"]
        SIG3["Extraction confidence dropping\n<i>e.g. validator rejection rate\nwent from 2% to 15%</i>"]
        SIG4["Cross-table patterns\n<i>e.g. 'procurement_dk' and\n'procurement_se' share 80% of fields</i>"]
        SIG5["Temporal patterns\n<i>e.g. new regulation changed\ndocument structure on Jan 1</i>"]
    end

    subgraph Actions["🎯 Possible Actions"]
        direction TB
        ACT1["Propose schema evolution\n<i>add nullable field 'framework_id'\nto procurement_se</i>"]
        ACT2["Propose table merge\n<i>unify dk + se into\nprocurement_nordic</i>"]
        ACT3["Propose partition change\n<i>switch from monthly to daily\npartitioning (volume increased)</i>"]
        ACT4["Flag for investigation\n<i>'extraction quality degraded,\npossible source site redesign'</i>"]
        ACT5["Update extraction prompts\n<i>regenerate few-shot examples\nfrom latest validated data</i>"]
    end

    SIG1 --> ACT4
    SIG2 --> ACT1
    SIG3 --> ACT4
    SIG3 --> ACT5
    SIG4 --> ACT2
    SIG5 --> ACT1
    SIG5 --> ACT3

    style Signals fill:#1a365d,color:#fff
    style Actions fill:#22543d,color:#fff
```

## Contrast: Three Catalog Philosophies

```mermaid
graph TB
    subgraph Passive["📁 Passive Catalog\n(Polaris, Glue, Hive)"]
        direction TB
        P1["Stores metadata"]
        P2["Answers queries"]
        P3["Enforces access control"]
        P4["<b>Does exactly what\nyou tell it</b>"]
    end

    subgraph Versioned["🔀 Versioned Catalog\n(Nessie)"]
        direction TB
        V1["Everything Passive does +"]
        V2["Tracks history"]
        V3["Supports branching"]
        V4["<b>Remembers what happened\nand lets you experiment</b>"]
    end

    subgraph AgenticCat["🤖 Agentic Catalog\n(Novel concept)"]
        direction TB
        A1["Everything Versioned does +"]
        A2["Monitors data patterns"]
        A3["Proposes schema changes"]
        A4["Self-heals quality issues"]
        A5["<b>Actively improves\nthe data platform</b>"]
    end

    Passive -->|"add git\nsemantics"| Versioned
    Versioned -->|"add LLM\nobservation\n& reasoning"| AgenticCat

    style Passive fill:#4a5568,color:#fff
    style Versioned fill:#2c5282,color:#fff
    style AgenticCat fill:#9b2c2c,color:#fff
```

## Implementation Sketch

```
The agentic catalog is not a new catalog implementation.
It's an LLM agent LAYER that sits on top of Nessie and
uses the existing catalog APIs to observe and act.

┌───────────────────────────────────────────────────┐
│              Agentic Catalog Agent                 │
│                                                   │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Observer    │  │ Reasoner │  │ Proposer    │  │
│  │             │  │          │  │             │  │
│  │ - subscribes│  │ - Claude │  │ - creates   │  │
│  │   to NATS   │  │   API    │  │   Nessie    │  │
│  │   streams   │  │ - prompt │  │   branches  │  │
│  │ - queries   │  │   chain  │  │ - runs      │  │
│  │   DuckDB    │  │   with   │  │   validation│  │
│  │   for stats │  │   context│  │ - formats   │  │
│  │ - tracks    │  │   from   │  │   merge     │  │
│  │   quality   │  │   lake-  │  │   request   │  │
│  │   metrics   │  │   house  │  │   for human │  │
│  └──────┬──────┘  └────┬─────┘  └──────┬──────┘  │
│         │              │               │          │
│         ▼              ▼               ▼          │
│  ┌─────────────────────────────────────────────┐  │
│  │         Standard APIs (nothing custom)       │  │
│  │  NATS subscribe │ Nessie REST │ DuckDB SQL  │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘

This is the key: no custom catalog needed.
Just an agent that uses existing tools intelligently.
```
