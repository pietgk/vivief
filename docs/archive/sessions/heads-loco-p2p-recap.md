# Heads, Loco & P2P Knowledge Recap

*Accumulated knowledge from Claude sessions — context document for new conversations*
*Last updated: February 2026*

---

## 1. Heads — Company Overview

### What Heads Is

Heads Svenska AB is a Stockholm-based company (~18-20 people, ~$6.2M revenue) building a unified retail/commerce platform. Founded by Joachim Wester, who also founded Starcounter (the underlying database technology). CEO is Anton Fagerberg.

### Key Customers

- **Gekås Ullared**: Sweden's biggest physical retail store by volume
- **Dollarstore**: 134+ stores, ~2,000 employees — Heads powers POS, discount engine, BI (not their website)
- **Sportson**: 27+ bike shops — full-stack: POS + e-commerce + ERP + service management
- **Telenor**: Telco customer

### Tech Stack

- **Backend**: .NET/C# with Starcounter VMDBMS
- **Frontend**: Web Components as shared foundation + React, Vue, Svelte for specific apps
- **Database**: Starcounter — proprietary patented in-memory VMDBMS
- **Marketing sites**: Built with Framer (no-code), not their own platform
- **Job posting mentions**: TypeScript & C++, "AI-first by design"

### The Starcounter VMDBMS

The crown jewel of Heads' technology:

- Application objects and database objects share the **same virtual memory space**
- No ORM, no serialization, no data copying between app and DB
- Objects live directly in the database from the moment you `new` them
- Patented "representation invariance" — data keeps the same in-memory representation whether queried or persisted
- Claims up to 3 million transactions per second
- JSON-Patch sync for client-server communication
- Gartner "Cool Vendor" 2015, €2.2M EU Horizon 2020 grant

### Starcounter Architecture Concepts

- **VMDBMS**: Virtual Machine Database Management System — fuses ACID database engine with application server directly in RAM
- **Business Ontology**: Semantic layer giving meaning to data structures, enabling "real-world" business understanding
- **Representation Invariance**: Data structures remain identical between compute and storage — no translation layer
- **Latent Feature Space**: The ontology captures implicit relationships (like how a SKU connects to inventory, pricing, suppliers)

### What Heads Delivers (In Production)

**For Dollarstore** (operational backbone):
- POS terminals across 134+ stores with zero downtime
- Complex discount engine (mix-and-match deals like "3 for 50 kr")
- BI dashboards for real-time sales/inventory per store
- Staff onboarding: new hires learn POS in 1 hour
- Website is separate — just a catalog consuming product data via API

**For Sportson** (full-stack commerce):
- E-commerce with product catalog, comparison tools, bike selector wizard
- Click-and-collect across 27+ stores
- Service booking (bike repair/maintenance)
- Unified order management across online + in-store + service desk
- Hybrid architecture: WordPress for content, Heads APIs for commerce
- Zero downtime since launch

### Key People

- **Joachim Wester**: Founder, technical visionary
- **Anton Fagerberg**: CEO (programmer-CEO)
- **Erik von Krusenstierna**: Software Engineer (also musician, string quartet composer)
- **Martin Törnwall**: Software Engineer, based in Uppsala. GitHub shows deep .NET/C# background (Starcounter.Powershell, Serilog, Newtonsoft.Json)
- **Erik Ohlsson**: Patent co-author on database technology
- **Anthony Moore**: Recruiter who reached out about Senior Engineer role

### Interview Insights

- The Starcounter lineage is key — not a standard SaaS company
- Small team with big ambitions, value wearing multiple hats
- "AI-first" is actively being pushed — good area for smart questions
- The C# to TypeScript migration story is worth asking about
- Web Components as framework-agnostic glue layer is architecturally interesting
- SKU management at scale is the core operational challenge they solve

### Alignment with Piet's Thinking

Strong intellectual alignment identified:
- Piet's "everything is or has a location" ERP thinking ↔ Starcounter's unified ontology
- Vivief's Effects model ↔ Starcounter's first-class business primitives
- Both: identify the right primitive that can represent everything, make it first-class throughout

---

## 2. Loco (LocationCounter) — Experimental Project

### What Loco Is

A C#/.NET in-memory database inspired by Heads/Starcounter concepts, used as a brainstorming vehicle to explore architecture choices. Built to understand and experiment with the ideas behind Heads' technology.

### Core Architecture

**Hierarchical Location Tree** with path-based addressing:

```
Root → Collection → Entity → Property
/products/com.ex.sku=ABC/name
```

- Path structure matches JSON Pointer-like addressing
- External identifiers: `com.example.sku=WIDGET-001` — multiple identity systems per entity
- Operator pipeline: `~where(status=Active)~just(name,price)` for queries
- JSONL WAL (Write-Ahead Log) for persistence
- In-memory store with snapshot support for consistent reads
- HTTP REST API matching the path structure

### The Location Tree API

```
GET  /products/sku=ABC/name      →  read a value
SET  /products/sku=ABC/name      →  write a value  
LIST /products/                  →  enumerate children
WATCH /products/sku=ABC/         →  subscribe to changes
```

### Agent Hierarchy

Person, Company, Store — maps to access control and ownership.

### ERP History Context

Piet built an ERP 25 years ago with "everything is a location" architecture. The scaling lesson learned: separating identity (where something is) from history (what happened). Modern solution: event sourcing + CQRS — append-only event log for writes, separate optimized projections for different read patterns.

---

## 3. P2P and Distributed Architecture

### The Holepunch/Hypercore Stack

Chosen as the P2P infrastructure for loco after thorough evaluation. A complete set of composable primitives:

**Hypercore** — Append-only log
- Cryptographically signed, Merkle-tree verified
- Sparse replication (download only what you need)
- Immutable: entries cannot be forged, modified, or reordered
- Each block verified against the Merkle tree
- Storage: 4 file types (tree, bitfield, data, key pair)
- Wire protocol with Noise XX handshake for encrypted connections

**Hyperbee** — B-tree on Hypercore
- Sorted key-value store with range queries
- B-tree nodes stored as Hypercore entries
- `checkout(version)` gives read-only snapshot at any version
- Live watching for real-time updates
- This IS MVCC — versions are WAL entries, not database-internal structures

**Autobase** — Multi-writer coordination
- Takes N Hypercores (one per writer) and produces merged, linearized output
- DAG linearization for agreed-upon ordering
- All agents agree on shared view without central coordination
- Handles offline writes and automatic reconciliation

**Hyperswarm** — Peer discovery
- Kademlia-based DHT on UDP for internet-wide discovery
- UDP hole-punching for direct connections through NATs
- mDNS for instant local network discovery
- Noise protocol encryption from the start
- The topic key acts as pre-shared key for Noise handshake

**Pear Runtime** — JavaScript runtime (Bare) for P2P desktop/mobile apps
**Corestore** — Efficient management of many Hypercores per peer

### P2P Technology Comparison

| | Holepunch/Hypercore | TanStack DB | GunDB |
|---|---|---|---|
| **Purpose** | P2P infrastructure primitives | Reactive client-side query engine | Decentralized graph database |
| **P2P capable** | ✅ Core purpose | ❌ Needs backend | ✅ But unreliable |
| **WAL concept** | ✅ Hypercore IS a WAL | ❌ No WAL | Sort of (append-only graph) |
| **Offline support** | ✅ First-class | ❌ | ✅ But conflict resolution is poor |
| **Cryptographic verification** | ✅ Merkle tree per entry | ❌ | ❌ |
| **Multi-writer** | ✅ Autobase | ❌ | ✅ Last-write-wins (too simplistic) |
| **Maturity** | Good (Keet in production) | Alpha/experimental | Concerning codebase quality |
| **Verdict** | ✅ **Chosen** | Keep as future UI layer | ❌ Rejected |

**TanStack DB** is worth watching as a reactive frontend layer consuming Hypercore-synced data (differential dataflow is impressive for UI reactivity).

### Also Explored (from broader P2P survey)

- **Holochain**: Agent-centric, each agent validates own chain. Interesting but different model.
- **IPFS/libp2p**: Content-addressed storage. Infrastructure layer, not directly comparable.
- **Nostr**: Social protocol, simple pub/sub. Too specialized.
- **Secure Scuttlebutt**: Append-only feeds. Inspirational but less active.
- **Veilid**: Privacy-focused. Early stage.

---

## 4. Loco + Hypercore Integration Architecture

### The Commerce Mesh Vision

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  POS Terminal │    │  POS Terminal │    │  Warehouse   │
│  (Standalone) │    │  (Standalone) │    │  Terminal    │
│  Loco + HC   │◄──►│  Loco + HC   │◄──►│  Loco + HC   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       └───────────────────┼───────────────────┘
                    ┌──────┴──────────┐
                    │  Central Server  │
                    │  Loco + Autobase │
                    │  Merged view     │
                    └─────────────────┘
```

- **Normal**: Everything flows through central server
- **Central down**: POS terminals keep working, sync P2P with each other
- **New terminal**: Downloads snapshot from any peer, subscribes to live updates
- **Internet loss**: Keeps selling locally, orders sync when reconnected

### Hypercore as Loco's WAL

**Hypercore replaces the JSONL WAL:**
- Per-writer Hypercore (one per Agent)
- Transaction-batched JSON Patches as WAL entries
- Hyperbee index for current state (the "compacted view")
- Autobase for multi-writer reconciliation

### Location Paths → Hyperbee Keys

Direct mapping: loco's `/products/com.ex.sku=ABC/name` becomes a Hyperbee key. This gives:
- Natural range queries (all products: range scan `/products/` prefix)
- Path-level conflict resolution (two terminals updating different properties auto-merge)
- Selective replication per collection

### External Identity Resolution Across Peers

```
Store A knows:  com.store-a.sku=ABC → entity X
Store B knows:  com.store-b.sku=XYZ → entity X  (same entity, different ID)
Central knows:  com.erp.id=12345    → entity X  (canonical ID)
```

Identifier mappings travel with the data via Hyperbee secondary indexes.

### Operator Pipeline as Replication Filter

`/products~where(status=Active)~just(name,price)` isn't just a query — it becomes a **sync subscription**. Different peers get exactly the data they need via sparse Hypercore replication.

---

## 5. ClearScript — Embedded V8 in C#

### The Game-Changer

ClearScript (Microsoft) embeds V8 JavaScript engine directly in the C# process. No IPC overhead, shared memory space.

### What Can Run Pure in V8 (without Node.js)

- `flat-tree` — Merkle tree index math (pure arithmetic)
- `compact-encoding` — binary encoding/decoding
- Hyperbee's B-tree logic
- `hypercore-crypto` with sodium-javascript swap
- Autobase linearization algorithm

### What Needs C# Bridges

- Cryptography → C# libsodium-net (native speed)
- File storage → C# file system
- Networking → C# Socket/UdpClient
- Hyperswarm DHT → either C# mDNS (LAN) or thin Node.js sidecar (internet)

### Architecture: The Inverted Bridge

C# owns all I/O. V8 owns all protocol logic:

```
C# Process
├── Loco In-Memory DB (fast reads)
├── ClearScript V8 Engine
│   ├── Hypercore protocol logic
│   ├── Hyperbee B-tree logic
│   ├── Autobase linearization
│   └── Business rule scripts (pricing, tax, discounts)
├── C# Bridges
│   ├── Storage (file system)
│   ├── Crypto (libsodium-net)
│   └── Network (TCP, mDNS)
└── HTTP API
```

### Phased Approach

1. **Phase 1**: ClearScript in-process for Hypercore + mDNS for LAN discovery
2. **Phase 2**: Optional thin Node.js sidecar ONLY for DHT-based internet discovery
3. **Phase 3**: V8 as Loco's scripting platform — JS-defined validation, computed properties, business rules

### The Elegant Result

A single binary that is simultaneously: an in-memory database, a P2P node, a JavaScript runtime for business rules, and an HTTP server. Compelling deployment story for retail.

---

## 6. The Temperature Model (Data Layers)

### Three Temperatures, One Shape

```
Frozen (WAL/Hypercore)  →  Warm (In-Memory DB)  →  Hot (UI State)
```

- **Frozen**: Persistent, append-only, cryptographically verified. The WAL.
- **Warm**: Materialized view of frozen data. In-memory, fast queries.
- **Hot**: Subset of warm data currently displayed/active in UI.

### The Unifying Insight

Sync between ANY two temperatures follows the same pattern:

```
WAL ↔ In-memory:   replay diffs (materialization)
In-memory ↔ UI:    replay diffs (presentation)
Peer A ↔ Peer B:   replay diffs (replication)
```

**They are all the same operation**: a consumer behind a producer catches up by replaying tree mutations it hasn't seen yet.

### The Tree Is The API

The same operations work everywhere:

| Operation | REST (UI sync) | P2P (system sync) | In-memory (internal) |
|-----------|---------------|-------------------|---------------------|
| Read | `GET /path` | `hyperbee.get(path)` | `tree.get(path)` |
| Write | `PUT /path` | `hyperbee.put(path)` | `tree.set(path)` |
| List | `GET /path/` | `createRange({gte: path})` | `tree.children(path)` |
| Watch | SSE/WebSocket | `hyperbee.watch()` | `tree.on('change')` |

### Snapshots Are Not Separate

Hyperbee stores B-tree nodes in Hypercore entries. `checkout(version)` gives read-only snapshot. The WAL IS the version system. No separate snapshot mechanism needed.

---

## 7. Differential Dataflow (d2ts)

### What d2ts Is

TanStack DB's differential dataflow engine — a TypeScript implementation of the Differential Dataflow paradigm.

### Core Concepts

- **MultiSets with multiplicity**: Data as `(value, time, diff)` triples — positive diff for insertions, negative for deletions
- **Operators**: Map, Filter, Join, Reduce — all incremental
- **Versions and Frontiers**: Partial ordering of time, frontier tracks "what's complete"
- **Incremental joins**: Only recompute affected rows when data changes

### Relevance to Loco

d2ts could potentially operate at multiple temperatures:
- **Frozen → Warm**: Incrementally materialize WAL changes into in-memory state
- **Warm → Hot**: Reactive queries that update UI when underlying data changes
- **Cross-peer**: Merge remote diffs with local state

### Open Question

Should the warm layer mirror the frozen layer's shape (sorted keys) or the hot layer's shape (diff streams)? The answer determines whether loco optimizes for reads or for reactivity.

---

## 8. POS UI Future Vision

### Three Convergences Explored

1. **Agentic UI**: Agents use protocols with specific components
2. **Multimodal**: Text, voice, speech in different languages
3. **AR**: Phones, tablets, glasses, headsets

### Architecture Stacks Evaluated

- **Stack A**: LLM as runtime, components as tools
- **Stack B**: Event mesh with NATS for pub-sub coordination
- **Stack C**: WASM portability, write-once-run-anywhere
- **Stack D**: Graph database where relationships drive UI logic
- **Stack E**: Hypermedia/server-driven UI

### Agentic UI Technologies

- **AG-UI protocol** with CopilotKit (frontend) + Semantic Kernel (.NET backend)
- Natural language input → .NET API → LLM orchestration → component instructions
- SSE streaming back to React frontend
- Headless components for web-only deployment

---

## 9. Strategic Assessment

### "Thin Wrapper" Analysis

**Where Heads is NOT a thin wrapper:**
- Starcounter's patented VMDBMS is genuinely novel tech
- Deep retail domain integration (Gekås, Dollarstore, Sportson in production)
- 19 years of database R&D behind it

**Where Loco is NOT a thin wrapper:**
- Combination of in-memory VMDBMS-style storage + P2P Hypercore sync + differential dataflow is genuinely novel
- No foundation model is going to ship that as a feature

**Where Loco's risk lives:**
- Moat is architectural vision, not deployed infrastructure
- Needs real-world "atoms" — actual retail deployments that create defensible friction

### Strategic Question

Is loco preparation for joining Heads, or an independent product direction? The answer affects everything from architecture choices to how to present it in interviews.

---

## 10. .NET Technical Context

- **.NET 10**: Recommended for new projects (LTS, supported until Nov 2028)
- **Kestrel**: Built-in cross-platform HTTP server for ASP.NET Core
- **WAL format exploration**: Evaluated binary, Avro, Parquet, JSONL — recommended Avro for hot WAL + Parquet compaction for cold archive
- **ClearScript**: Microsoft's V8 embedding for .NET (key integration point)
- **libsodium-net**: Native crypto performance from C#
