# ViviefCo Unified Platform — Architecture v4

> **Technology note (2026-04-01):** This brainstorm references the Holepunch stack (Hypercore, Hyperbee, Hyperswarm) which has since been replaced by Iroh + MoQ. The architectural reasoning (local-first, P2P, datom-based) remains valid. See `contract/p2p/lean-stack-v2.md` for the current P2P stack.

## "Local-First, Peer-to-Peer, Production is the Network of Laptops" Edition

> **The philosophical shift from v3**: v3 said "runs on a MacBook for dev, then deploy to servers for production." v4 asks the heretical question: *what if there is no separate production?* What if every developer laptop, every field worker's machine, every regional office server IS the production system — and the "cloud" is just the most well-connected peer?
>
> This document explores three sub-versions of increasing radicalism:
>
> - **v4a**: Pragmatic — adds Datomic-style datoms + TanStack DB to v3's NATS backbone
> - **v4b**: Bold — adds Hypercore P2P layer, making the system work without central servers
> - **v4c**: Radical — the full vision where every node IS production and the network IS the database

---

## The Conceptual Ingredients

Before combining them, let's understand what each brings:

```
┌────────────────────────────────────────────────────────────────┐
│  INGREDIENT          WHAT IT GIVES US                          │
│                                                                │
│  Datoms              The most elegant data primitive:          │
│  (from Datomic)      [Entity, Attribute, Value, Time, Op]     │
│                      Everything is an immutable fact.          │
│                      Time travel is free. History is free.     │
│                      No tables, no schemas to migrate.         │
│                                                                │
│  Hypercore           Append-only logs that replicate P2P.      │
│  (from Holepunch)    Each log has a public key. Anyone with    │
│                      the key can replicate. Merkle tree        │
│                      verified. Sparse download (get only       │
│                      what you need). Multi-writer via Autobase.│
│                                                                │
│  Hyperbee            B-tree on top of Hypercore. Gives you     │
│                      key-value with range queries over a       │
│                      P2P replicated append-only log. The P2P   │
│                      equivalent of a database index.           │
│                                                                │
│  Hyperswarm          DHT-based peer discovery with UDP         │
│                      holepunching. Find and connect to any     │
│                      peer, even behind NATs. No central server.│
│                                                                │
│  TanStack DB         Client-side reactive database with        │
│                      collections, live queries (differential   │
│                      dataflow), and optimistic mutations.      │
│                      Sub-millisecond UI updates. Sync-agnostic.│
│                                                                │
│  In-memory DB        A local-process reactive store that       │
│  (concept)           holds the "working set" of datoms in RAM. │
│                      Serves all reads with zero I/O latency.   │
│                      Fed by P2P replication and local writes.  │
│                                                                │
│  NATS (from v3)      The communication backbone that ties      │
│                      modules together. Can bridge between      │
│                      local processes and remote peers.         │
│                                                                │
│  DuckDB (from v3)    Analytical queries over the datom         │
│                      history. Parquet files for cold storage.  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## v4a: "Datoms All The Way Down" (Pragmatic)

### Core Idea

Take v3's NATS + PostgreSQL + DuckDB architecture, but replace the data model with Datomic-inspired datoms. Every piece of data in the system — a project, a product, a specification clause, a bid, a market forecast — is a set of `[E, A, V, Tx, Op]` tuples. Add TanStack DB on the client for reactive UI.

This doesn't require P2P. It's a centralized system with a radically simpler data model.

### The Datom as Universal Primitive

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  EVERYTHING IS A DATOM                                         │
│                                                                │
│  [Entity     Attribute              Value          Tx    Op]  │
│  ─────────── ───────────────────── ─────────────── ───── ──── │
│  proj-001    :project/name         "Oslo Hospital" tx-42 add  │
│  proj-001    :project/status       :approved       tx-42 add  │
│  proj-001    :project/location     [59.9, 10.7]   tx-42 add  │
│  proj-001    :project/value        150000000       tx-42 add  │
│  proj-001    :project/status       :approved       tx-98 retr │
│  proj-001    :project/status       :in-progress    tx-98 add  │
│  prod-777    :product/name         "FireClad X200" tx-55 add  │
│  prod-777    :product/embedding    [0.12, 0.87..]  tx-55 add  │
│  spec-003    :spec/project         proj-001        tx-60 add  │
│  spec-003    :spec/includes        prod-777        tx-60 add  │
│  tend-010    :tender/project       proj-001        tx-71 add  │
│  tend-010    :tender/status        :published      tx-71 add  │
│  bid-020     :bid/tender           tend-010        tx-80 add  │
│  bid-020     :bid/amount           12500000        tx-80 add  │
│                                                                │
│  WHAT THIS BUYS:                                               │
│                                                                │
│  • No tables, no schema migrations, no JOINs                  │
│  • Add any attribute to any entity at any time                 │
│  • Full history: "What was the project status on March 3?"     │
│    → Filter datoms where Tx <= tx-at-march-3                  │
│  • Graph traversal: follow :ref attributes between entities   │
│  • Audit trail: built in, not bolted on                        │
│  • Cross-module data: a tender references a project which      │
│    references a spec which includes a product — all datoms     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### v4a Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  v4a: DATOMS + NATS + TANSTACK DB                              │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  UI LAYER (browser)                                      │ │
│  │                                                          │ │
│  │  TanStack DB                                             │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ Collections (synced from backend via Electric/SSE)  │ │ │
│  │  │ Live Queries (differential dataflow, sub-ms)        │ │ │
│  │  │ Optimistic Mutations (instant UI, rollback on fail) │ │ │
│  │  │                                                     │ │ │
│  │  │ Data arrives as datom streams:                      │ │ │
│  │  │ [E, A, V, Tx, Op] → mapped into collections        │ │ │
│  │  │                                                     │ │ │
│  │  │ Mutation = create new datoms locally                 │ │ │
│  │  │ → optimistically apply to collection                │ │ │
│  │  │ → send to backend via NATS                          │ │ │
│  │  │ → backend confirms or rejects                       │ │ │
│  │  │ → TanStack DB handles rollback                      │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────┬───────────────────────────────┘ │
│                             │ WebSocket / SSE                  │
│  ┌──────────────────────────▼───────────────────────────────┐ │
│  │  NATS (backbone)                                         │ │
│  │  Events ARE datom batches:                               │ │
│  │  viviefco.tx.committed → [datom, datom, datom, ...]        │ │
│  │  Every event is a transaction. Every transaction is      │ │
│  │  a set of datoms. The event stream IS the database.      │ │
│  └──────────────────────────┬───────────────────────────────┘ │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐ │
│  │  IN-MEMORY DATOM STORE (per process)                     │ │
│  │                                                          │ │
│  │  • Holds all current-state datoms in RAM                 │ │
│  │  • Indexed by E, by A, by V, by Tx (EAVT, AEVT, VAET)  │ │
│  │  • Serves reads with zero I/O (microsecond latency)      │ │
│  │  • Fed by JetStream consumer (replays on startup)        │ │
│  │  • Each module has its OWN in-memory view               │ │
│  │    (subscribe to relevant attribute namespaces)          │ │
│  │                                                          │ │
│  │  Think of it as Datomic's peer cache — but simpler,      │ │
│  │  because we control the whole stack.                     │ │
│  └──────────────────────────┬───────────────────────────────┘ │
│                             │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐ │
│  │  PERSISTENT STORES (for durability + analytics)          │ │
│  │                                                          │ │
│  │  JetStream "DATOMS" stream                               │ │
│  │  → the durable append-only log of all transactions       │ │
│  │  → source of truth, replayed to rebuild any view         │ │
│  │                                                          │ │
│  │  DuckDB / DuckLake                                       │ │
│  │  → materialized analytical views over datom history      │ │
│  │  → Parquet files for cold storage                        │ │
│  │  → Time travel via DuckLake snapshots                    │ │
│  │                                                          │ │
│  │  (PostgreSQL optional: only if you need SQL access       │ │
│  │   for legacy integrations or reporting tools)            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  WHY THIS IS ELEGANT:                                         │
│  • One data shape everywhere: [E, A, V, Tx, Op]              │
│  • Client (TanStack DB) and server (in-memory store)          │
│    speak the same language: datom streams                     │
│  • Adding a new "module" = defining new attribute namespaces  │
│  • Schema evolution = just add new attributes. Old data       │
│    doesn't change. Old queries still work.                    │
│  • The in-memory store makes reads blazing fast (no DB call)  │
│  • NATS handles all communication. DuckDB handles analytics.  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Verdict on v4a

**Brilliant**: The datom model genuinely simplifies the data layer. No schema migrations ever. History and audit are free. TanStack DB on the client gives instant UI.

**Risky**: The in-memory store needs careful memory management. For 50M datoms you need ~8-16GB RAM — feasible on a beefy server, tight on a laptop. You'd need to shard by attribute namespace or entity partition.

**Overkill?**: The in-memory store is overkill if PostgreSQL is fast enough for your read patterns. But for a platform that needs sub-millisecond reads across interconnected construction data, it's a legitimate choice.

---

## v4b: "P2P Replication With Central Coordination" (Bold)

### Core Idea

Take v4a's datom model, but add Hypercore as the replication layer. Each regional office, each construction site, each developer laptop has a Hypercore that contains its datoms. These replicate peer-to-peer via Hyperswarm. A central NATS cluster provides coordination (transaction ordering, conflict resolution) but is not required for reads or local work.

```
┌────────────────────────────────────────────────────────────────┐
│  v4b: THE HYBRID P2P MODEL                                    │
│                                                                │
│  KEY INSIGHT: Construction is GEOGRAPHICALLY DISTRIBUTED.     │
│  An architect in Oslo, a contractor in Malmö, a supplier      │
│  in Hamburg, and an analyst in Stockholm are all working on    │
│  the same project. Each has different connectivity. Each       │
│  needs fast local access to THEIR slice of the data.           │
│                                                                │
│                                                                │
│    Oslo Office          Stockholm HQ         Hamburg Office    │
│    ┌──────────┐         ┌──────────┐         ┌──────────┐    │
│    │ Hypercore│◄────────►│ Hypercore│◄────────►│ Hypercore│    │
│    │ (local   │  P2P     │ (full    │  P2P     │ (local   │    │
│    │  datoms) │ replicate│  datoms) │ replicate│  datoms) │    │
│    │          │          │          │          │          │    │
│    │ In-mem   │          │ In-mem   │          │ In-mem   │    │
│    │ store    │          │ store    │          │ store    │    │
│    │          │          │          │          │          │    │
│    │ DuckDB   │          │ DuckDB   │          │ DuckDB   │    │
│    │ (local   │          │ (full    │          │ (local   │    │
│    │  analytics│         │  analytics│         │  analytics│   │
│    └──────────┘         └─────┬────┘         └──────────┘    │
│                               │                                │
│                        ┌──────▼──────┐                        │
│                        │NATS Cluster │                        │
│                        │(coordinator)│                        │
│                        │             │                        │
│                        │• Tx ordering│                        │
│                        │• Conflict   │                        │
│                        │  resolution │                        │
│                        │• AI gateway │                        │
│                        │• Global     │                        │
│                        │  queries    │                        │
│                        └─────────────┘                        │
│                                                                │
│  HOW IT WORKS:                                                 │
│                                                                │
│  1. LOCAL WRITES: User creates a datom locally.                │
│     → Appended to local Hypercore instantly.                   │
│     → In-memory store updated. TanStack DB reflects it.        │
│     → Sent to NATS for global ordering (async).                │
│                                                                │
│  2. GLOBAL ORDERING: NATS assigns a global Tx number.          │
│     → Published as viviefco.tx.{global-tx-id}                    │
│     → All peers receive the ordered transaction.               │
│     → Conflicts detected and resolved (LWW or merge function). │
│                                                                │
│  3. P2P REPLICATION: Hypercores replicate between peers.       │
│     → Oslo and Hamburg sync directly (no server needed).        │
│     → Sparse replication: each peer only downloads the         │
│       datoms for entities it cares about.                      │
│     → Hyperswarm finds peers via DHT holepunching.             │
│                                                                │
│  4. OFFLINE WORK: If NATS is unreachable:                      │
│     → Local writes still work (appended to Hypercore).         │
│     → Reads still work (in-memory store is local).             │
│     → When reconnected, local Hypercore syncs to NATS.         │
│     → NATS resolves any conflicts and re-orders.               │
│                                                                │
│  5. ANALYTICS: Each node has DuckDB with DuckLake.             │
│     → Locally computed analytics over local datoms.            │
│     → Stockholm HQ has full analytics (all datoms replicated). │
│     → Regional offices have regional analytics.                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### The Datom Flow: From Keystroke to Global Fact

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  1. Architect types "Oslo University Hospital" in spec editor  │
│     │                                                          │
│     ▼                                                          │
│  2. TanStack DB: optimistic mutation                           │
│     → collection updated instantly (sub-ms)                    │
│     → UI reflects change immediately                           │
│     │                                                          │
│     ▼                                                          │
│  3. Local Hypercore: append datom                              │
│     [spec-003, :spec/title, "Oslo University Hospital",       │
│      local-tx-1, add]                                          │
│     → persisted to local disk                                  │
│     → in-memory store updated                                  │
│     │                                                          │
│     ▼                                                          │
│  4. NATS: publish to viviefco.cmd.tx.submit                      │
│     → coordinator assigns global Tx number                     │
│     → publishes viviefco.tx.committed with global Tx            │
│     │                                                          │
│     ▼                                                          │
│  5. All peers: receive committed transaction                   │
│     → update their in-memory stores                            │
│     → Hypercores replicate the datom P2P                       │
│     │                                                          │
│     ▼                                                          │
│  6. DuckDB: analytics pipeline ingests the datom               │
│     → market intelligence views updated                        │
│     │                                                          │
│     ▼                                                          │
│  7. AI layer: embedding computed for new content               │
│     → stored as datom: [spec-003, :spec/embedding, [...],     │
│       ai-tx-1, add]                                            │
│                                                                │
│  Total time for steps 1-3: < 10ms (local)                      │
│  Total time for steps 4-7: < 500ms (network + AI)              │
│  If offline: steps 1-3 work. Steps 4-7 happen on reconnect.   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Verdict on v4b

**Brilliant**: Offline-first is killer for construction (sites have bad connectivity). P2P replication means regional offices can work together without routing through a central server. The datom model makes conflict resolution tractable (last-writer-wins per [E, A] pair).

**Risky**: Hypercore is JavaScript-ecosystem only (Holepunch's Bare runtime). Mixing it with Go/Rust NATS services requires bridge code. Multi-writer Hypercore (Autobase) is still maturing. P2P security (who can write what?) needs careful design.

**Overkill?**: For a company that already has reliable internet at all offices — probably yes. But for a construction platform where field workers on building sites need to look up product specs and submit bids with spotty 4G, it's a genuine advantage.

---

## v4c: "Every Node IS Production" (Radical)

### Core Idea

There is no "dev" and "production." There is no "client" and "server." Every node runs the same software. Nodes differ only in *capability* (how much data they hold, how much compute they have, which AI models they run). The network of all nodes IS the system. Bigger nodes (data centers) are just well-connected peers with more storage and GPU access.

```
┌────────────────────────────────────────────────────────────────┐
│  v4c: THE FULLY DISTRIBUTED VISION                             │
│                                                                │
│  EVERY NODE RUNS:                                              │
│  • Datom store (in-memory for hot data)                        │
│  • Hypercore (append-only log, P2P replicated)                 │
│  • Hyperbee (indexed views over datoms)                        │
│  • NATS (embedded, for local module communication)             │
│  • DuckDB (local analytics)                                    │
│  • TanStack DB (if it has a UI)                                │
│  • Model gateway (routes to local Ollama or remote cloud)      │
│                                                                │
│  NODES DIFFER IN:                                              │
│  • Storage: laptop = 100GB, office = 10TB, DC = petabytes     │
│  • Compute: laptop = 8 cores, DC = GPUs for AI                │
│  • Connectivity: field = 4G, office = 1Gbps, DC = 10Gbps     │
│  • Data scope: laptop = my projects, DC = all datoms           │
│  • AI tier: laptop = Ollama 8B, DC = Claude/GPT cloud API     │
│                                                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │  Laptop  │    │  Office  │    │   Data   │                │
│  │  (field  │◄──►│  Server  │◄──►│  Center  │                │
│  │   worker)│    │  (region)│    │  (global)│                │
│  │          │    │          │    │          │                │
│  │ Datoms:  │    │ Datoms:  │    │ Datoms:  │                │
│  │ ~10K     │    │ ~10M     │    │ ~1B      │                │
│  │ (my      │    │ (regional│    │ (all)    │                │
│  │  projects)│   │  data)   │    │          │                │
│  │          │    │          │    │          │                │
│  │ AI: local│    │ AI: local│    │ AI: GPU  │                │
│  │ Ollama   │    │ + cloud  │    │ cluster  │                │
│  │ (8B)     │    │ fallback │    │ + cloud  │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│       ▲               ▲               ▲                       │
│       │               │               │                       │
│       └───────────────┴───────────────┘                       │
│           Hyperswarm P2P (data replication)                    │
│           + NATS leaf nodes (coordination)                     │
│                                                                │
│                                                                │
│  THE RESOLUTION HIERARCHY:                                     │
│                                                                │
│  Query: "Find fire-rated cladding for Nordic hospitals"        │
│                                                                │
│  1. Check local in-memory datom store                          │
│     → Found 3 products locally? Done. (<1ms)                   │
│                                                                │
│  2. Not enough? Ask peers via Hyperswarm                       │
│     → Office server has more product datoms                    │
│     → Sparse-replicate matching datoms. (<100ms)               │
│                                                                │
│  3. Need AI-powered search? Route via NATS to                  │
│     nearest node with GPU / cloud API access                   │
│     → Embedding search over full product catalog. (<500ms)     │
│                                                                │
│  4. Need market intelligence? Route to data center             │
│     → DuckDB over full datom history. (<2s)                    │
│                                                                │
│  The system AUTOMATICALLY resolves queries at the lowest       │
│  latency tier that has sufficient data.                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### How TanStack DB + Datoms Create the Perfect UI Layer

```
┌────────────────────────────────────────────────────────────────┐
│  THE UI SYNC STORY                                             │
│                                                                │
│  TanStack DB collections ARE datom projections:                │
│                                                                │
│  const projects = createCollection({                           │
│    // Populated by streaming datoms where A starts with        │
│    // :project/ — projected into objects                       │
│    syncConfig: {                                               │
│      source: 'datom-stream',                                   │
│      filter: { attributePrefix: ':project/' },                 │
│      // Datoms [E, A, V, Tx, Op] are folded into entities:    │
│      // { id: E, name: V where A=:project/name, ... }         │
│      projection: datomsToEntity                                │
│    }                                                           │
│  })                                                            │
│                                                                │
│  // Live query: sub-millisecond, reactive, differential        │
│  const activeProjects = useLiveQuery(q =>                      │
│    q.from({ p: projects })                                     │
│     .where(({ p }) => eq(p.status, 'approved'))                │
│  )                                                             │
│                                                                │
│  // Mutation: creates datoms, optimistically applied            │
│  projects.update(projectId, (draft) => {                       │
│    draft.status = 'in-progress'                                │
│    // Under the hood: creates datom                            │
│    // [projectId, :project/status, :in-progress, local-tx, add]│
│    // + retraction of old value                                │
│    // Applied instantly to TanStack DB                          │
│    // Synced to Hypercore → NATS → all peers                   │
│  })                                                            │
│                                                                │
│  THE ELEGANCE:                                                 │
│  • The datom is the universal data format                      │
│  • It flows: User → TanStack DB → Hypercore → Peers           │
│  • Same format at every layer. No translation.                 │
│  • TanStack DB's differential dataflow = reactive datom views  │
│  • Optimistic mutations = local datoms that may be rolled back │
│  • Conflict resolution = which datom wins per [E, A]           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Verdict on v4c

**Brilliant**: This is the platonic ideal of local-first. Zero-latency reads. Offline-capable. P2P replication. No single point of failure. Construction workers on a building site can access product specs and submit bids without internet. When connectivity returns, everything syncs.

**Risky**: This is research-grade architecture. Conflict resolution across 26 countries with different regulatory requirements is genuinely hard. Hypercore's ecosystem is JS-only. Security (who can read/write which datoms?) in a P2P context is an unsolved problem for enterprise. Debugging distributed state across hundreds of peers is nightmarish.

**Overkill?**: Almost certainly, for a company that needs to ship product in 2025-2026. But as a north star vision for what the platform COULD become in 3-5 years, it's compelling.

---

## Comparison: v4a vs v4b vs v4c

```
┌─────────────────────┬──────────────┬──────────────┬──────────────┐
│                     │ v4a          │ v4b          │ v4c          │
│                     │ Datoms +     │ P2P + Central│ Every Node   │
│                     │ TanStack     │ Coordination │ IS Production│
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Can build in 2025?  │ YES          │ Partially    │ Not yet      │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Offline support     │ Limited      │ Full         │ Full         │
│                     │ (UI only)    │ (read+write) │ (everything) │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ P2P replication     │ None         │ Yes          │ Yes          │
│                     │ (centralized)│ (+ central)  │ (pure P2P)   │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Infrastructure      │ NATS only    │ NATS +       │ NATS embed + │
│ needed              │              │ Hyperswarm   │ Hyperswarm   │
│                     │              │              │ (nothing else)│
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Data model          │ Datoms       │ Datoms       │ Datoms       │
│ elegance            │ ★★★★★       │ ★★★★★       │ ★★★★★       │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Operational         │ ★★★★        │ ★★★         │ ★★           │
│ complexity          │ (familiar)   │ (P2P adds    │ (distributed │
│                     │              │  complexity) │  debugging)  │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ UI responsiveness   │ ★★★★★       │ ★★★★★       │ ★★★★★       │
│ (TanStack DB)       │              │              │              │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Construction site   │ ★★           │ ★★★★★       │ ★★★★★       │
│ usability (offline) │              │              │              │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Enterprise ready    │ ★★★★        │ ★★★         │ ★★           │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Hiring difficulty   │ ★★★          │ ★★★★        │ ★★★★★       │
│ (how hard to find   │ (datoms are  │ (P2P is      │ (this is     │
│  people who can     │  learnable)  │  niche)      │  PhD-level)  │
│  build this)        │              │              │              │
│                     │              │              │              │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ "Wow" factor in     │ ★★★★        │ ★★★★★       │ ★★★★★       │
│  a pitch            │              │              │ (off charts) │
└─────────────────────┴──────────────┴──────────────┴──────────────┘
```

---

## The Recommended Path: v4a Now, v4b As You Grow

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  YEAR 1: Build v4a                                             │
│  • Datom model from day one (never regret this)                │
│  • NATS backbone (from v3)                                     │
│  • In-memory datom store for reads                             │
│  • DuckDB for analytics                                        │
│  • TanStack DB for reactive UI                                 │
│  • AI layer via model gateway                                  │
│  • Runs on a MacBook. Deploys to cloud.                        │
│                                                                │
│  YEAR 2: Add v4b capabilities                                  │
│  • Hypercore for P2P replication of datoms                     │
│  • Offline support for field workers                           │
│  • Regional offices sync directly                              │
│  • NATS remains the coordinator                                │
│  • Hyperswarm for peer discovery                               │
│                                                                │
│  YEAR 3+: Explore v4c                                          │
│  • Evaluate whether pure P2P makes sense                       │
│  • Depends on: regulatory requirements, security model,        │
│    Hypercore ecosystem maturity, team expertise                │
│  • May remain a "mode" rather than the default                 │
│    (e.g. "field mode" for disconnected sites)                  │
│                                                                │
│  THE DATOM MODEL IS THE CONSTANT ACROSS ALL THREE.             │
│  Everything else is a deployment/replication choice.            │
│  This is the power of getting the data primitive right.        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## For Wednesday: How To Use This

You don't pitch v4c in a recruiter call. But you DO signal that you've thought beyond CRUD:

1. **"Have you considered an immutable fact-based data model instead of traditional tables?"** — Tests if they're open to Datomic-style thinking. If they say yes, you're in fascinating territory.

2. **"How important is offline capability for field workers?"** — If very, you have v4b ready. If not, v4a is still elegant.

3. **"What's the UI responsiveness target? Are you looking at local-first patterns like TanStack DB?"** — Shows you think about the full stack, not just backend.

4. **"Do you see this platform eventually supporting P2P scenarios — construction sites with intermittent connectivity, regional offices syncing directly?"** — Plants the seed for v4b/v4c without over-committing.

5. **The real power move**: Describe the datom `[E, A, V, Tx, Op]` on a whiteboard and show how it models a project, a product, a tender, and a specification all in one primitive. If their eyes light up, you've found your people.
