# DuckLake vs. Traditional Database Paradigms

*A mental model for understanding where DuckLake fits — and where it doesn't*

---

## The Fundamental Distinction

Traditional databases (relational, graph, document) are **compute + storage + metadata tightly coupled** in a single system. You send queries to the database, it stores data internally, and it manages its own metadata.

DuckLake is **none of these**. It's a **metadata format** that turns dumb file storage into something that behaves like a database. The data lives as Parquet files on blob storage. The metadata lives in a separate SQL database. The compute runs wherever you want (your laptop, a server, a Lambda function). These three concerns are fully decoupled.

This is the single most important thing to convey: DuckLake is not a database — it's an **open format that gives database-like guarantees to files on object storage**.

---

## Side-by-Side Comparison

### 1. Relational Databases (PostgreSQL, MySQL, SQL Server)

**What they are**: Row-oriented storage with strict schemas, ACID transactions, SQL interface, indexes, constraints, and a query optimizer. Everything runs inside one server process (or a cluster in distributed variants like CockroachDB, Spanner).

| Dimension | Relational DB | DuckLake |
|-----------|--------------|----------|
| **Data model** | Tables with rows and columns, strict schema enforcement, foreign keys, constraints | Tables with rows and columns, schema tracked in metadata, but no constraints/keys/indexes on data |
| **Storage** | Internal storage engine (B-trees, heap files, WAL) tightly managed by the DB process | Parquet files on any blob storage — the DB doesn't own the files |
| **Query pattern** | OLTP (many small reads/writes) and OLAP depending on the system | Analytical / OLAP — columnar Parquet is optimized for scanning, not point lookups |
| **Write pattern** | Row-at-a-time inserts, updates, deletes with immediate consistency | Batch-oriented — each write creates immutable Parquet files + a new snapshot |
| **Transactions** | Full ACID with row-level locking, immediate consistency | ACID via snapshot isolation — but at the snapshot level, not row level |
| **Schema** | `ALTER TABLE` mutates in place, may require table rewrites | Schema evolution tracked as metadata — old data files stay untouched, reads adapt |
| **Scaling** | Vertical (bigger server) or complex horizontal (sharding, read replicas) | Storage scales infinitely (blob storage), compute scales by adding DuckDB instances, metadata scales with the catalog DB |
| **Concurrency** | Thousands of concurrent connections with row-level locking | Optimistic concurrency — concurrent writers detect conflicts at commit time via snapshot IDs |
| **Point lookups** | Fast (indexes, B-trees) — `SELECT * FROM users WHERE id = 42` in microseconds | Slow — must scan Parquet files (columnar, no indexes). This is not DuckLake's use case |
| **Operational** | Backups, replication, vacuuming, connection pooling, monitoring | Catalog DB maintenance (standard) + Parquet file maintenance (merge, expire, cleanup) |

**When relational wins over DuckLake**: Transactional workloads with many small reads/writes (user sessions, shopping carts, real-time APIs), anything needing sub-millisecond point lookups, systems requiring foreign key enforcement or complex constraints.

**When DuckLake wins over relational**: Analytical workloads scanning large datasets, scenarios where storage and compute need to scale independently, multi-tool access to the same data (DuckDB, Spark, Python), cost-sensitive storage at scale (S3 is orders of magnitude cheaper than RDS per TB).

---

### 2. Document Databases (MongoDB, CouchDB, DynamoDB)

**What they are**: Schema-flexible stores where each record is a self-contained document (usually JSON/BSON). Optimized for developer ergonomics — store what you have, query what you need. No joins by default; data is denormalized.

| Dimension | Document DB | DuckLake |
|-----------|------------|----------|
| **Data model** | Flexible JSON/BSON documents — each document can have different fields, nested objects, arrays | Strict columnar tables — all rows in a table share the same schema. Complex types (structs, lists, maps) are supported but within a defined schema |
| **Schema** | Schema-on-read — the application interprets structure. Schema validation is optional (e.g., MongoDB JSON Schema) | Schema-on-write — columns have defined types. Schema evolution is tracked and versioned, but structure is enforced |
| **Nesting** | First-class — documents naturally nest objects and arrays to arbitrary depth | Supported via Parquet's complex types (structs, lists, maps), but querying deeply nested data is less ergonomic than in a document DB |
| **Query language** | Custom query languages (MongoDB's MQL, DynamoDB's PartiQL) or limited SQL | Full SQL via DuckDB — all the expressive power of SQL including window functions, CTEs, joins |
| **Joins** | Generally discouraged — denormalize instead. Some support exists but it's not the paradigm | Natural — DuckLake tables join freely, and cross-table queries are efficient with columnar storage |
| **Write pattern** | Single-document atomic writes, immediate availability | Batch-oriented snapshot writes — not suited for single-document CRUD |
| **Aggregation** | Aggregation pipelines (MongoDB) or Scan/Query with filters (DynamoDB) | Full SQL aggregation, window functions, grouping sets — far more powerful for analytics |
| **Scale model** | Horizontal sharding built-in (MongoDB sharding, DynamoDB partitions) | Separation of storage/compute/metadata — each scales independently |
| **Flexibility** | Extreme — evolve your document structure freely, different documents can have different shapes | Moderate — schema changes are versioned and tracked, but every row in a table conforms to the current schema |
| **Developer UX** | Direct — store a JSON object, get it back. Feels like working with native data structures | Indirect — data must be columnar/tabular. You interact through SQL, not object manipulation |
| **Cost at scale** | Can be expensive for large analytical scans (DynamoDB scan costs, MongoDB memory usage) | Very cheap for analytical workloads — Parquet on S3 is ~$0.023/GB/month, queries only read needed columns |

**When document DBs win over DuckLake**: Application backends with variable document structures, real-time CRUD APIs, rapid prototyping where schema is unknown, systems where each record is self-contained and rarely joined.

**When DuckLake wins over document DBs**: Analytical queries across large datasets, scenarios where you need to join data across tables, cost-effective storage of structured data at scale, when SQL expressiveness matters, data versioning and time travel requirements.

---

### 3. Graph Databases (Neo4j, Neptune, Kùzu, DGraph)

**What they are**: Store data as nodes and edges (relationships) with properties on both. Optimized for traversal queries — "find all friends of friends who bought product X." The relationship is a first-class citizen, not a foreign key.

| Dimension | Graph DB | DuckLake |
|-----------|---------|----------|
| **Data model** | Nodes + Edges + Properties. Relationships are explicit, named, and directional. Each node/edge can have arbitrary properties | Tables with rows and columns. Relationships are implicit — modeled through foreign keys or join tables |
| **Query language** | Cypher (Neo4j), Gremlin (TinkerPop), SPARQL (RDF), or GQL (emerging standard) | SQL — no native graph traversal syntax |
| **Traversal** | Fast — index-free adjacency means following an edge is O(1) regardless of graph size | Slow — requires self-joins or recursive CTEs. Each "hop" is a full join operation |
| **Pattern matching** | First-class — `MATCH (a)-[:KNOWS]->(b)-[:BOUGHT]->(p)` is natural and optimized | Requires multi-way joins — possible but verbose and not optimized for depth |
| **Relationship queries** | "Find shortest path", "find all paths between A and B", "detect cycles" — native operations | Must be implemented with recursive CTEs or application logic. Possible but not the strength |
| **Schema** | Typically schema-optional — nodes and edges carry whatever properties they have | Strict schemas on tables with versioned evolution |
| **Analytics on properties** | Weak to moderate — graph DBs optimize for traversal, not aggregation | Strong — columnar Parquet excels at scanning and aggregating property values |
| **Scale** | Varies greatly — Neo4j (single-leader), Neptune (managed cluster), Kùzu (embedded) | Infinite storage, infinite compute, catalog DB for metadata. Well-understood scaling model |
| **Mixed workloads** | Poor at large analytical scans. Good at local neighborhood queries | Good at large scans and aggregations. Poor at multi-hop traversals |
| **Data volume for relationships** | Efficient — an edge is a single record with source/target/type | Relationships stored as rows in junction tables — more storage overhead, but columnar compression helps |

**When graph DBs win over DuckLake**: Multi-hop relationship queries (social networks, dependency trees, knowledge graphs), path finding, cycle detection, pattern matching on graph structures, fraud detection through connection analysis, recommendation engines based on graph proximity.

**When DuckLake wins over graph DBs**: Analytical aggregation over large datasets, scenarios where relationships are secondary to property analysis, cost-effective storage at scale, time travel / versioning of data, when the query patterns are mostly tabular with occasional relationship lookups.

**The interesting middle ground** — this is relevant to your DevAC work: You can model graph-like data in DuckLake/DuckDB using Parquet files with node and edge tables, then use recursive CTEs for traversal. You lose index-free adjacency but gain columnar analytics over node/edge properties. For code intelligence (call graphs, dependency graphs), this can work well when most queries are "who depends on X" (one-hop) rather than "find the transitive closure of all dependencies" (multi-hop).

---

## DuckLake as a "Database for Documents" — What Does That Mean?

If by "documents" you mean **storing and querying document-like data** (PDFs, contracts, extracted text, structured records from document processing), here's how DuckLake compares:

### The Document Lifecycle

```
Raw Documents (PDFs, Word files, web pages)
        │
        ▼
    Extraction (LLM, NER, OCR)
        │
        ▼
    Structured Records (tables with fields)
        │
        ▼
    Storage & Query ← This is where the DB choice matters
```

| Need | Best Choice | Why |
|------|-------------|-----|
| Store raw document blobs | Object storage (S3) | Cheap, infinite, no DB needed |
| Store extracted structured data | **DuckLake** or Relational DB | Columnar is efficient for analytics over extracted fields |
| Full-text search within documents | Elasticsearch, Typesense, or PostgreSQL with tsvector | Purpose-built for text search |
| Store variable/evolving document schemas | Document DB (MongoDB) | Schema-on-read handles unknown structures |
| Query relationships between documents | Graph DB | "Which contracts reference this vendor across subsidiaries?" |
| Analytical queries across all documents | **DuckLake** | Columnar Parquet scans millions of records efficiently |
| Version tracking of document changes | **DuckLake** | Time travel gives you every historical state |
| Low-cost archival with queryability | **DuckLake** | S3 + Parquet is the cheapest queryable storage |

### DuckLake's Sweet Spot for Document Data

DuckLake excels when your document pipeline produces **structured, tabular output** that you want to:

- Analyze at scale (aggregate, filter, join across document types)
- Version over time (re-extraction produces new snapshots, old versions remain queryable)
- Store cheaply (Parquet on S3)
- Query with SQL (familiar, powerful, composable)
- Access from multiple tools (DuckDB, Python, potentially Spark)

It does **not** excel when you need:

- Full-text search inside document content (use Elasticsearch)
- Flexible per-document schemas (use MongoDB)
- Relationship traversal between documents (use a graph DB)
- Real-time single-document CRUD (use PostgreSQL or MongoDB)

---

## The Synthesis: A Polyglot Architecture

In practice, serious systems combine these. For your context (code intelligence, document extraction, analytics), a realistic architecture might use:

| Layer | Technology | Role |
|-------|-----------|------|
| **Transactional data** | PostgreSQL | User accounts, API state, real-time application data |
| **Document extraction output** | DuckLake (Parquet + Postgres catalog) | Structured records from processed documents, versioned, queryable, cheap |
| **Code relationships** | DuckDB on Parquet (plain or DuckLake) | Node/edge tables for code graph, queried with recursive CTEs |
| **Search** | Elasticsearch or DuckDB FTS | Full-text search over document content |
| **Graph queries** | Kùzu (if needed) or DuckDB recursive CTEs | Deep traversal when SQL CTEs hit limits |
| **Raw files** | S3 | Original documents, images, artifacts |

The key interview insight: **there is no universal database**. Each paradigm optimizes for a different access pattern. DuckLake's contribution is making analytical queries over large, versioned, structured datasets dramatically simpler and cheaper than the alternatives — by acknowledging that metadata management is a database problem and treating it as one.

---

## Quick Reference: "When Someone Asks Why Not Just Use X?"

**"Why not just PostgreSQL?"**
→ PostgreSQL stores data in its own internal format. You can't scan it with Spark, or share it as Parquet files, or store petabytes cheaply on S3. DuckLake gives you PostgreSQL-grade metadata management while keeping data in open, portable, cheap Parquet on blob storage.

**"Why not just MongoDB?"**
→ MongoDB optimizes for flexible, document-at-a-time access. DuckLake optimizes for analytical queries scanning millions of structured records. If your documents are already extracted into a consistent schema, MongoDB's flexibility becomes overhead rather than advantage.

**"Why not just Neo4j?"**
→ Neo4j is the right tool when relationships are the query. If your primary questions are traversal-shaped (paths, neighborhoods, patterns), use a graph DB. If your primary questions are aggregation-shaped (counts, sums, distributions, filters), DuckLake is faster and cheaper.

**"Why not just Iceberg?"**
→ You can. But if you're DuckDB-centric (not running Spark or Trino), DuckLake gives you the same capabilities with less moving parts. And if you change your mind, there's a metadata-only migration path between them.

**"Why not just Parquet files?"**
→ Plain Parquet has no transactions, no schema evolution tracking, no time travel, no concurrent write safety, and no compaction. DuckLake adds all of these. It's the difference between a pile of files and a managed dataset.
