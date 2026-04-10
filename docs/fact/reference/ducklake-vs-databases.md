# DuckLake vs. Traditional Database Paradigms

*Including DuckDB's Full-Text Search and Vector Similarity Search capabilities*

---

## The Fundamental Distinction

Traditional databases (relational, graph, document) are **compute + storage + metadata tightly coupled** in a single system. You send queries to the database, it stores data internally, and it manages its own metadata.

DuckLake is **none of these**. It's a **metadata format** that turns dumb file storage into something that behaves like a database. The data lives as Parquet files on blob storage. The metadata lives in a separate SQL database. The compute runs wherever you want (your laptop, a server, a Lambda function). These three concerns are fully decoupled.

This is the single most important thing to convey: DuckLake is not a database — it's an **open format that gives database-like guarantees to files on object storage**.

But here's where it gets interesting: **DuckDB as the compute engine brings capabilities that blur the lines** — specifically Full-Text Search (FTS) and Vector Similarity Search (VSS). These don't live in DuckLake (the storage layer), they live in DuckDB (the compute layer). Understanding this distinction is critical to understanding the architecture.

---

## The Layer Model: Where FTS and VSS Actually Live

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMPUTE LAYER (DuckDB)                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  SQL Engine   │  │  FTS Index   │  │  VSS / HNSW Index     │ │
│  │  (columnar    │  │  (inverted   │  │  (in-memory, based    │ │
│  │   vectorized  │  │   index,     │  │   on usearch lib,     │ │
│  │   execution)  │  │   BM25       │  │   FLOAT[] arrays)     │ │
│  │              │  │   scoring)   │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                 │
│  These indexes are EPHEMERAL — they live in the DuckDB process, │
│  not in DuckLake's Parquet files or metadata database.          │
│  They must be rebuilt when data changes or DuckDB restarts.     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ reads/writes
┌──────────────────────┴──────────────────────────────────────────┐
│                   METADATA LAYER (DuckLake)                     │
│                                                                 │
│  SQL database (PostgreSQL, MySQL, SQLite, DuckDB)               │
│  22 tables: snapshots, schemas, columns, file stats,            │
│  partition info, inlined data, encryption keys                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ references
┌──────────────────────┴──────────────────────────────────────────┐
│                   STORAGE LAYER (Parquet on blob)                │
│                                                                 │
│  Immutable Parquet files on S3/GCS/Azure/local                  │
│  Contains: your actual data columns, including TEXT columns      │
│  for FTS and FLOAT[] columns for vector embeddings              │
└─────────────────────────────────────────────────────────────────┘
```

This means:

- **Embeddings and text are stored in DuckLake** — as regular columns in Parquet files (FLOAT[384] for embeddings, VARCHAR for text)
- **FTS and HNSW indexes are built by DuckDB at compute time** — they don't persist in DuckLake's format
- **Brute-force vector search works directly** — `array_distance()`, `array_cosine_similarity()` work on any DuckDB-readable data including DuckLake, without any index
- **The HNSW index accelerates** but is optional and currently experimental for persistence

---

## DuckDB's FTS Extension: What It Actually Does

DuckDB's Full-Text Search is an extension that builds an **inverted index** with **BM25 scoring** (Okapi BM25), similar to SQLite's FTS5. It supports stemming (porter, snowball for 20+ languages including Swedish), stopword removal, accent stripping, and configurable tokenization.

```sql
-- Build an FTS index on a DuckLake table
PRAGMA create_fts_index('documents', 'doc_id', 'title', 'body',
    stemmer := 'swedish', stopwords := 'english');

-- Search with BM25 ranking
SELECT doc_id, title, score
FROM (
    SELECT *, fts_main_documents.match_bm25(doc_id, 'search terms') AS score
    FROM documents
) sq
WHERE score IS NOT NULL
ORDER BY score DESC;
```

**Key characteristics:**

- The index is **purely SQL-based** — it creates helper tables (docs, terms, dict, stats) in a schema named `fts_main_{table}`
- It does **NOT auto-update** when data changes — you must drop and recreate after inserts/updates
- Supports multi-column indexing and field-specific search
- Conjunctive mode available (all terms must match)
- BM25 parameters (k1, b) are tunable

**DuckLake compatibility:** The FTS index builds on whatever DuckDB can read. Since DuckLake tables appear as regular tables to DuckDB, FTS works — but the index lives in DuckDB's process memory / local schema, not in DuckLake's metadata. If another DuckDB instance connects to the same DuckLake, it must build its own FTS index. After a DuckLake data update (new snapshot), the FTS index is stale and must be rebuilt.

---

## DuckDB's VSS Extension: What It Actually Does

The Vector Similarity Search extension adds **HNSW (Hierarchical Navigable Small Worlds) indexes** based on the usearch library. It works with DuckDB's fixed-size `ARRAY` type (e.g., `FLOAT[384]`).

```sql
-- Store embeddings in a DuckLake table
CREATE TABLE documents (
    doc_id VARCHAR,
    title VARCHAR,
    body VARCHAR,
    embedding FLOAT[384]  -- stored as a column in Parquet
);

-- Brute-force search (works immediately, no index needed)
SELECT doc_id, title,
       array_cosine_similarity(embedding, [0.1, 0.2, ...]::FLOAT[384]) AS score
FROM documents
ORDER BY score DESC
LIMIT 10;

-- Accelerated search with HNSW index
CREATE INDEX doc_embedding_idx ON documents USING HNSW (embedding)
    WITH (metric = 'cosine');

-- Same query now uses HNSW_INDEX_SCAN
SELECT doc_id, title
FROM documents
ORDER BY array_distance(embedding, [0.1, 0.2, ...]::FLOAT[384])
LIMIT 10;
```

**Key characteristics:**

- Supports L2 squared, cosine distance, and inner product metrics
- HNSW index is **in-memory only** by default — experimental persistence flag exists but is not production-ready
- Brute-force vector search (without HNSW) works on **any** data DuckDB can read — including DuckLake
- Index must fit in RAM
- Deletes are "marked" not removed — requires `PRAGMA hnsw_compact_index` to clean up
- Supports vector joins: `vss_join()` and `vss_match()` macros for batch similarity operations
- Building the index after data is loaded is significantly faster than incremental inserts

**DuckLake compatibility:** The embedding data (FLOAT[] columns) lives in Parquet files managed by DuckLake. Brute-force vector search works directly. The HNSW index is compute-side only — each DuckDB instance builds its own. One practitioner noted explicitly that the VSS extension's HNSW persistence does not work with DuckLake-attached databases. This is expected: DuckLake manages Parquet files, not DuckDB's internal index storage.

---

## The Hybrid Search Pattern: FTS + VSS Combined

DuckDB's official blog demonstrates combining both for **hybrid retrieval** — this is the same pattern used by Elasticsearch + vector search or PostgreSQL's tsvector + pgvector:

```sql
-- Hybrid search: combine BM25 (lexical) with cosine similarity (semantic)
WITH
lexical AS (
    SELECT doc_id,
           fts_main_docs.match_bm25(doc_id, 'search query') AS bm25_score
    FROM documents
    WHERE bm25_score IS NOT NULL
),
semantic AS (
    SELECT doc_id,
           array_cosine_similarity(embedding, ?::FLOAT[384]) AS cosine_score
    FROM documents
    ORDER BY cosine_score DESC
    LIMIT 100
)
SELECT d.doc_id, d.title,
       COALESCE(0.3 * l.bm25_score, 0) + COALESCE(0.7 * s.cosine_score, 0) AS hybrid_score
FROM documents d
LEFT JOIN lexical l USING (doc_id)
LEFT JOIN semantic s USING (doc_id)
WHERE l.doc_id IS NOT NULL OR s.doc_id IS NOT NULL
ORDER BY hybrid_score DESC
LIMIT 10;
```

This is significant because it means a single DuckDB query can combine lexical matching (exact keywords) with semantic similarity (meaning) — something that typically requires Elasticsearch + a vector DB + an orchestration layer.

---

## Updated Side-by-Side Comparison

### 1. Relational Databases (PostgreSQL, MySQL, SQL Server)

| Dimension | Relational DB | DuckLake + DuckDB |
|-----------|--------------|-------------------|
| **Data model** | Tables with rows and columns, strict schema enforcement, foreign keys, constraints | Tables with rows and columns, schema tracked in metadata, but no constraints/keys/indexes on data |
| **Storage** | Internal storage engine (B-trees, heap files, WAL) tightly managed by the DB process | Parquet files on any blob storage — the DB doesn't own the files |
| **Query pattern** | OLTP (many small reads/writes) and OLAP depending on the system | Analytical / OLAP — columnar Parquet is optimized for scanning, not point lookups |
| **Write pattern** | Row-at-a-time inserts, updates, deletes with immediate consistency | Batch-oriented — each write creates immutable Parquet files + a new snapshot |
| **Transactions** | Full ACID with row-level locking, immediate consistency | ACID via snapshot isolation — but at the snapshot level, not row level |
| **Schema** | `ALTER TABLE` mutates in place, may require table rewrites | Schema evolution tracked as metadata — old data files stay untouched, reads adapt |
| **Scaling** | Vertical (bigger server) or complex horizontal (sharding, read replicas) | Storage scales infinitely (blob storage), compute scales by adding DuckDB instances, metadata scales with the catalog DB |
| **Concurrency** | Thousands of concurrent connections with row-level locking | Optimistic concurrency — concurrent writers detect conflicts at commit time via snapshot IDs |
| **Point lookups** | Fast (indexes, B-trees) — `SELECT * WHERE id = 42` in microseconds | Slow — must scan Parquet files (columnar, no indexes). Not DuckLake's use case |
| **Full-text search** | PostgreSQL: excellent built-in tsvector/tsquery with GIN indexes, auto-updating, production-grade. MySQL: FULLTEXT indexes. | DuckDB FTS: BM25 inverted index, experimental, does NOT auto-update, must rebuild after data changes. Functional but not production-grade for mutable data |
| **Vector search** | PostgreSQL + pgvector: HNSW and IVFFlat indexes, disk-based, production-grade, auto-updating. Integrated with transactions | DuckDB VSS: HNSW via usearch, in-memory only (experimental persistence), must rebuild per DuckDB instance. Brute-force always works. Good for analytical batch workloads, not for real-time serving |
| **Hybrid search** | PostgreSQL can do tsvector + pgvector in one query — production-grade, transactional, auto-updating indexes | DuckDB can do FTS + VSS in one query — same expressiveness, but indexes are ephemeral and manual. Better suited for analytical/batch use |
| **Operational** | Backups, replication, vacuuming, connection pooling, monitoring | Catalog DB maintenance (standard) + Parquet file maintenance (merge, expire, cleanup) + index rebuilds |

**When relational wins:** Transactional workloads, real-time APIs needing sub-millisecond lookups, production search serving, anything requiring auto-updating indexes, systems requiring foreign key enforcement.

**When DuckLake + DuckDB wins:** Analytical workloads scanning large datasets, cost-sensitive storage at scale, multi-tool data access, batch search/embedding analysis, versioned datasets with time travel.

**The PostgreSQL + pgvector comparison specifically:** For a production RAG system serving real-time queries, PostgreSQL + pgvector is more mature — disk-based HNSW, transactional consistency, auto-updating indexes. For analytical exploration over millions of embedded documents (finding clusters, running batch similarity, iterating on embedding strategies), DuckLake + DuckDB is cheaper and more flexible. The data stays in open Parquet, and you can swap compute (different DuckDB instances, Python, Spark) without moving data.

---

### 2. Document Databases (MongoDB, CouchDB, DynamoDB)

| Dimension | Document DB | DuckLake + DuckDB |
|-----------|------------|-------------------|
| **Data model** | Flexible JSON/BSON documents — each document can have different fields, nested objects, arrays | Strict columnar tables — all rows share the same schema. Complex types (structs, lists, maps) supported within a defined schema |
| **Schema** | Schema-on-read — the application interprets structure | Schema-on-write — columns have defined types, versioned evolution |
| **Nesting** | First-class — documents naturally nest to arbitrary depth | Supported via Parquet's complex types, but less ergonomic for deep nesting |
| **Query language** | Custom query languages (MongoDB MQL, DynamoDB PartiQL) | Full SQL via DuckDB — window functions, CTEs, joins, plus FTS and vector search |
| **Joins** | Generally discouraged — denormalize instead | Natural — tables join freely, columnar storage is efficient for this |
| **Full-text search** | MongoDB: Atlas Search (Lucene-based, production-grade, auto-sync). DynamoDB: requires OpenSearch integration | DuckDB FTS: BM25 inverted index, manual rebuild. Less polished than Atlas Search but runs locally with zero infrastructure |
| **Vector search** | MongoDB: Atlas Vector Search (production, managed). DynamoDB: requires OpenSearch or Bedrock | DuckDB VSS: brute-force always works, HNSW for acceleration. No managed service but zero-dependency and runs anywhere |
| **Write pattern** | Single-document atomic writes, immediate availability | Batch-oriented snapshot writes — not suited for single-document CRUD |
| **Aggregation** | Aggregation pipelines (MongoDB) or Scan/Query with filters | Full SQL aggregation, window functions, grouping sets — far more powerful |
| **Cost at scale** | Can be expensive for large analytical scans (DynamoDB scan costs, MongoDB memory) | Very cheap — Parquet on S3 is ~$0.023/GB/month, queries only read needed columns |

**When document DBs win:** Application backends with variable document structures, real-time CRUD, managed search infrastructure (Atlas Search is genuinely excellent), rapid prototyping.

**When DuckLake + DuckDB wins:** Analytical queries across large structured datasets, batch embedding analysis, hybrid FTS + vector search without managed service costs, data versioning, scenarios where you want SQL expressiveness over documents rather than pipeline-based aggregation.

---

### 3. Graph Databases (Neo4j, Neptune, Kùzu)

| Dimension | Graph DB | DuckLake + DuckDB |
|-----------|---------|-------------------|
| **Data model** | Nodes + Edges + Properties. Relationships are first-class | Tables with rows and columns. Relationships modeled through joins |
| **Query language** | Cypher, Gremlin, SPARQL, GQL | SQL — no native graph traversal syntax |
| **Traversal** | Fast — index-free adjacency, O(1) edge following | Requires self-joins or recursive CTEs — each hop is a join |
| **Pattern matching** | First-class and optimized | Requires multi-way joins — verbose, not optimized for depth |
| **Full-text search** | Neo4j: built-in Lucene indexes, auto-updating. Neptune: OpenSearch integration | DuckDB FTS: BM25, manual rebuild. Works but not integrated with graph traversal |
| **Vector search** | Neo4j 5.x: native vector indexes for node properties. Neptune: via OpenSearch | DuckDB VSS: brute-force or HNSW on FLOAT[] columns. Can combine with SQL analytics but no graph-aware vector search |
| **Analytics on properties** | Weak to moderate — optimized for traversal, not aggregation | Strong — columnar Parquet excels at scanning and aggregating |
| **Combined graph + semantic** | Neo4j: GraphRAG patterns — traverse graph context, then vector search on node properties. Powerful for knowledge graphs + LLM | DuckDB: can do vector search + recursive CTEs in one query, but graph traversal is not a strength |

**When graph DBs win:** Multi-hop relationship queries, path finding, cycle detection, GraphRAG patterns where graph structure informs semantic retrieval, knowledge graph + LLM integration.

**When DuckLake + DuckDB wins:** Analytical aggregation, cost-effective storage at scale, one-hop relationship queries via joins, batch vector analytics over graph node properties (e.g., "find clusters of semantically similar functions in a codebase").

---

### 4. Dedicated Vector Databases (Pinecone, Weaviate, Qdrant, Milvus, Chroma)

This is a new comparison made relevant by DuckDB's VSS capabilities:

| Dimension | Dedicated Vector DB | DuckLake + DuckDB |
|-----------|-------------------|-------------------|
| **Primary purpose** | Real-time vector similarity serving | Analytical queries with vector capabilities as a feature |
| **Index types** | HNSW, IVF, Product Quantization, DiskANN — production-grade, tuned, persistent | HNSW only, in-memory (experimental persistence), or brute-force scan |
| **Scale** | Designed for billions of vectors with distributed sharding | Limited by RAM for HNSW index; brute-force scales with Parquet scan |
| **Filtering** | Pre-filter or post-filter on metadata during search | Full SQL WHERE clauses, joins, aggregations — far more expressive |
| **Update latency** | Near-real-time index updates | Batch-oriented — index rebuilds required after data changes |
| **Hybrid search** | Some support (Weaviate, Qdrant have BM25 + vector) | Full SQL: FTS BM25 + vector cosine in one query with tunable weights |
| **Analytics** | Minimal — these are search engines, not analytics engines | Full OLAP: window functions, grouping, CTEs, cross-table joins |
| **Storage cost** | Often expensive — vector-optimized storage formats, managed hosting | Parquet on S3 — cheapest possible columnar storage |
| **Multi-modal queries** | Vector similarity only (plus metadata filters) | SQL can combine vector similarity with text search, aggregations, joins, time travel, and analytical transformations in a single query |
| **Operational** | Managed services or complex cluster management | Zero infrastructure for local dev; catalog DB + blob storage for production |

**When dedicated vector DBs win:** Real-time RAG serving at scale, production search APIs, billions of vectors with sub-millisecond latency requirements, auto-updating indexes, managed infrastructure.

**When DuckLake + DuckDB wins:** Embedding analytics (clustering, drift detection, batch comparison), prototyping and iteration on embedding strategies, combining vector search with rich analytical context, cost-sensitive scenarios, offline batch retrieval, scenarios where embeddings are one column among many in a larger analytical dataset.

**The key insight:** Dedicated vector DBs are **search engines**. DuckLake + DuckDB is an **analytical engine that can also search**. The distinction matters enormously for use case fit.

---

### 5. Dedicated Search Engines (Elasticsearch, Typesense, Meilisearch)

Also newly relevant:

| Dimension | Search Engine | DuckLake + DuckDB |
|-----------|--------------|-------------------|
| **Primary purpose** | Full-text search and retrieval serving | Analytical queries with search capabilities |
| **Index type** | Inverted index (Lucene-based for ES), auto-updating, production-grade | BM25 inverted index, experimental, must manually rebuild |
| **Scale** | Distributed clusters handling billions of documents | Single-node analytical engine with distributed storage |
| **Relevance tuning** | Extensive: custom analyzers, boosting, function scores, multi-match, fuzzy | BM25 with configurable k1/b, stemmer, stopwords. Less tunable |
| **Analytics** | Elasticsearch: aggregation framework (terms, histograms, nested). Powerful but different from SQL | Full SQL analytics — more expressive for complex transformations |
| **Real-time updates** | Near-real-time indexing (refresh intervals) | Batch-oriented — index is stale after data changes |
| **Hybrid (text + vector)** | Elasticsearch 8.x: native dense vector field + kNN + text scoring in one query. Production-grade | DuckDB: FTS + VSS in one SQL query. Equivalent expressiveness but experimental |
| **Cost** | Significant — RAM-heavy, requires cluster management or managed service (Elastic Cloud) | Minimal — Parquet on S3 + DuckDB process. Orders of magnitude cheaper |
| **Language support** | Extensive: analyzers for 30+ languages, ICU, custom tokenizers | FTS: 20+ Snowball stemmers (including Swedish), stopwords, accent stripping |

**When search engines win:** Production search APIs, real-time indexing, complex relevance tuning, serving search results to end users, auto-complete, fuzzy matching, geo-search.

**When DuckLake + DuckDB wins:** Analytical text exploration (find patterns across millions of documents), batch search quality evaluation, cost-sensitive search over archival data, combining text search with rich analytical context (aggregations, joins, window functions), scenarios where search is a feature within analytics rather than the primary product.

---

## The "Get Crazy" Scenario: DuckLake as a Unified Document Intelligence Platform

Let's imagine the full stack, taking advantage of every capability:

```
Raw Documents (PDFs, contracts, web pages)
        │
        ▼
    Extraction Pipeline (LLM / NER / OCR)
        │
        ├── Structured fields (vendor, date, value, type)
        ├── Full text body (for FTS)
        └── Embedding vector (for semantic search)
        │
        ▼
    DuckLake Table:
    ┌──────────────────────────────────────────────────────────────┐
    │  documents                                                    │
    │  ─────────                                                    │
    │  doc_id       VARCHAR     (unique identifier)                 │
    │  vendor       VARCHAR     (extracted structured field)        │
    │  contract_val DECIMAL     (extracted structured field)        │
    │  doc_date     DATE        (extracted structured field)        │
    │  doc_type     VARCHAR     (extracted structured field)        │
    │  body_text    VARCHAR     (full document text → FTS target)   │
    │  embedding    FLOAT[384]  (sentence-transformers → VSS)       │
    │  source_url   VARCHAR     (provenance)                        │
    │  extracted_at TIMESTAMP   (extraction timestamp)              │
    │                                                               │
    │  Stored as: Parquet on S3, metadata in PostgreSQL             │
    │  Versioned: each re-extraction creates a new DuckLake         │
    │             snapshot — old extractions remain queryable        │
    └──────────────────────────────────────────────────────────────┘
```

At query time, a **single DuckDB instance** can:

```sql
-- 1. Pure analytical: aggregate contract values by vendor and year
SELECT vendor, YEAR(doc_date) AS yr, SUM(contract_val) AS total
FROM documents GROUP BY vendor, yr ORDER BY total DESC;

-- 2. Full-text search: find contracts mentioning force majeure
SELECT doc_id, vendor, score
FROM (
    SELECT *, fts_main_documents.match_bm25(doc_id, 'force majeure') AS score
    FROM documents
) sq WHERE score IS NOT NULL ORDER BY score DESC;

-- 3. Semantic search: find documents similar to a concept
SELECT doc_id, vendor,
       array_cosine_similarity(embedding, ?::FLOAT[384]) AS sim
FROM documents ORDER BY sim DESC LIMIT 20;

-- 4. Hybrid search: combine lexical + semantic
WITH
  lex AS (SELECT doc_id, fts_main_documents.match_bm25(doc_id, 'renewable energy') AS bm25
          FROM documents WHERE bm25 IS NOT NULL),
  sem AS (SELECT doc_id, array_cosine_similarity(embedding, ?::FLOAT[384]) AS cosine
          FROM documents)
SELECT d.doc_id, d.vendor, d.contract_val,
       0.3 * COALESCE(l.bm25, 0) + 0.7 * COALESCE(s.cosine, 0) AS hybrid
FROM documents d
LEFT JOIN lex l USING (doc_id) LEFT JOIN sem s USING (doc_id)
ORDER BY hybrid DESC LIMIT 10;

-- 5. Time travel: compare extraction quality across versions
SELECT v1.doc_id,
       array_cosine_similarity(v1.embedding, v2.embedding) AS drift
FROM documents VERSION AS OF 5 v1
JOIN documents VERSION AS OF 10 v2 USING (doc_id)
WHERE drift < 0.95  -- find documents whose embeddings shifted significantly
ORDER BY drift ASC;

-- 6. Cross-table analytical + search: join with vendor master data
SELECT d.doc_id, d.vendor, v.risk_score,
       fts_main_documents.match_bm25(d.doc_id, 'penalty clause') AS relevance
FROM documents d
JOIN vendors v ON d.vendor = v.vendor_name
WHERE relevance IS NOT NULL AND v.risk_score > 0.7
ORDER BY relevance DESC;
```

**No other single system can do all six of these.** Elasticsearch can do 2-4 but not 1, 5, or 6. Pinecone can do 3 but nothing else. PostgreSQL + pgvector can do 1-4 and 6 but not 5 (time travel). MongoDB Atlas can do 2-3 but is weak on 1 and can't do 5 or 6. Neo4j can do relationship queries none of these address.

---

## Honest Assessment: Where This Falls Apart

This "unified platform" story has real limitations:

**FTS is experimental and indexes don't auto-update.** Every time new documents land in DuckLake (a new snapshot), you must rebuild the FTS index. In a production search serving scenario, this is a serious limitation. Elasticsearch's near-real-time indexing is genuinely better for search-serving use cases.

**HNSW indexes are in-memory and per-instance.** If 5 DuckDB instances connect to the same DuckLake, each builds its own HNSW index. The HNSW persistence flag is documented as not working with DuckLake. For production RAG serving, a dedicated vector DB is more appropriate.

**Brute-force vector search is fine for moderate scale but doesn't scale to billions.** DuckDB's columnar scan is fast — you can brute-force search millions of vectors in seconds. But Pinecone or Qdrant with distributed HNSW will be faster for real-time serving at billion-vector scale.

**No real-time updates.** DuckLake is batch-oriented. If your use case is "user uploads a document and can search it 50ms later," you need PostgreSQL or Elasticsearch, not DuckLake.

**DuckDB's FTS is less sophisticated than Elasticsearch.** No fuzzy matching, no auto-complete, no custom analyzers beyond stemming/stopwords, no nested document search, no geo-aware scoring.

---

## When to Combine vs. When to Choose

| Scenario | Recommended Stack |
|----------|------------------|
| **Production search API** serving end users with <100ms latency | Elasticsearch or Typesense |
| **Production RAG system** with real-time embedding updates | PostgreSQL + pgvector, or Pinecone/Qdrant |
| **Analytical exploration** of extracted document data with ad-hoc queries | **DuckLake + DuckDB (with FTS + VSS)** |
| **Batch embedding analysis** — clustering, drift detection, quality evaluation | **DuckLake + DuckDB** |
| **Cost-sensitive archival search** over millions of documents | **DuckLake + DuckDB** |
| **Hybrid analytical + search** — combine aggregations with text/semantic search | **DuckLake + DuckDB** |
| **Prototyping** search strategies before committing to infrastructure | **DuckLake + DuckDB** |
| **Real-time CRUD** with immediate search availability | PostgreSQL or MongoDB |
| **Graph-aware retrieval** (GraphRAG, relationship traversal + search) | Neo4j |
| **Multi-system production** — search serves users, analytics runs batch | Elasticsearch for serving + DuckLake for analytics (same Parquet, different access patterns) |

---

## Quick Reference: "Why Not Just Use X?"

**"Why not just PostgreSQL + pgvector?"**
→ For production serving, pgvector is more mature — disk-based HNSW, transactional, auto-updating. But DuckLake stores data 10-100x cheaper (Parquet on S3 vs. PostgreSQL storage), scans columnar data faster for analytics, provides time travel across your entire dataset, and keeps data in an open format accessible by any tool. If your primary need is analytical exploration over extracted documents with occasional search, DuckLake wins. If you're serving real-time queries to users, pgvector wins.

**"Why not just Elasticsearch?"**
→ Elasticsearch is the production search standard — auto-indexing, fuzzy matching, complex relevance tuning. But it's expensive to run, stores data in its own format (no Parquet portability), and its aggregation capabilities are SQL's distant cousin. DuckLake + DuckDB gives you 80% of the search capability at 10% of the cost, plus full SQL analytics, time travel, and data portability. For search-serving: Elasticsearch. For search-within-analytics: DuckDB.

**"Why not just Pinecone/Qdrant/Weaviate?"**
→ These are search engines optimized for real-time vector retrieval at scale. DuckDB's vector search is a feature within an analytical engine. If you need sub-millisecond kNN serving a production API, use a dedicated vector DB. If you need to analyze, compare, cluster, and explore embeddings alongside structured data and text search — all in SQL — DuckDB on DuckLake is more capable and far cheaper.

**"Why not just MongoDB Atlas?"**
→ Atlas Search + Atlas Vector Search is a compelling managed package. But it's expensive at scale, data is locked in MongoDB's format, and analytical capabilities (aggregation pipelines) are less expressive than SQL. DuckLake gives you open data, cheaper storage, better analytics, and version history. Atlas gives you production-grade managed search with real-time updates.

**"Why not just Neo4j?"**
→ If relationships are the query, Neo4j wins. DuckDB's recursive CTEs can handle simple graph traversals but are not competitive with Cypher for multi-hop patterns or path finding. However, Neo4j is weak at columnar analytics, expensive for large property datasets, and doesn't provide versioned data. For code intelligence: DuckDB handles "who calls this function?" (one-hop) well; Neo4j handles "trace the full dependency chain across 12 hops" better.

**"Why not just Parquet files with FTS and VSS?"**
→ You can build FTS and HNSW indexes on plain Parquet tables in DuckDB. But without DuckLake, you have no transactions, no concurrent writers, no schema evolution tracking, no time travel, and no compaction. DuckLake adds the metadata layer that turns your Parquet + search indexes into a manageable, versioned, multi-user analytical platform.

---

## The Pitch (if asked in an interview)

"DuckLake is a storage and metadata format — not a database. But DuckDB as the compute engine brings FTS and vector search capabilities that let you build surprisingly powerful document intelligence pipelines on top of it. The key is understanding the layer model: your data and embeddings live in cheap, open Parquet files on blob storage. Your metadata lives in a SQL database. Your search indexes are ephemeral, built at compute time by each DuckDB instance. This means DuckLake + DuckDB won't replace Elasticsearch for production search serving or Pinecone for real-time RAG. But for analytical workloads — exploring extracted documents, evaluating embedding quality, running hybrid text + semantic search alongside SQL aggregations, with full time travel and versioning — it's an incredibly cost-effective and flexible platform that no other single system can match."
