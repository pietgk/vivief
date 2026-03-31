# DuckLake: Complete Technical Overview

*Interview preparation reference — February 2026*

---

## 1. What Is DuckLake?

DuckLake is an **open lakehouse format** released by DuckDB Labs in May 2025 under the MIT license. It is not a table format competing with Apache Iceberg or Delta Lake individually — it replaces the **entire lakehouse stack**: the table format *plus* the catalog combined.

The core thesis: every Iceberg or Delta Lake deployment already needs a database for its catalog (Polaris, Glue, Unity Catalog, Nessie). DuckLake asks — if you need a database anyway, why not store **all** metadata there? Not just a pointer to `metadata.json`, but the actual snapshot history, manifest information, file statistics, schema definitions — everything.

The result is a system with only two components:

- **A SQL database** — for all metadata (PostgreSQL, MySQL, SQLite, DuckDB, or MotherDuck)
- **Parquet files** — for actual data, on any blob storage (S3, GCS, Azure Blob, local disk)

No Avro files. No JSON metadata files. No manifest lists. No separate catalog server or API. Just SQL and Parquet.

---

## 2. The Problem DuckLake Solves

### The Iceberg Metadata Problem

To query a single row in an Iceberg table, the engine must:

1. Ask the catalog for the current `metadata.json` location
2. Fetch and parse `metadata.json` (Avro/JSON)
3. Read the manifest list to find relevant manifest files
4. Read manifest files to locate actual data files
5. Finally read the Parquet data

This is multiple round trips to object storage just for metadata, before touching any actual data. Each write operation also requires writing new metadata files, creating a cascade of small files over time.

### The Catalog Problem

Iceberg's metadata-as-files approach was designed for an era before catalogs were universal. But every production Iceberg deployment now uses a database-backed catalog (Polaris uses PostgreSQL, Glue uses DynamoDB, etc.). The design constraints were never revisited after this fundamental change. You end up with a database pointing to files that encode catalog information — redundancy at the architecture level.

### What DuckLake Changes

DuckLake consolidates everything into a single SQL query against the metadata database. One round trip resolves the current snapshot, file list, schema, and statistics. Then you read the Parquet data. That's it.

---

## 3. Architecture: Three-Way Separation of Concerns

DuckLake separates a data architecture into three independent, scalable components:

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│     STORAGE      │    │     METADATA     │    │     COMPUTE      │
│                  │    │                  │    │                  │
│  Parquet files   │    │  SQL database    │    │  DuckDB clients  │
│  on blob storage │    │  (Postgres, etc) │    │  (bring your own)│
│                  │    │                  │    │                  │
│  Scales: ∞       │    │  Scales: normal  │    │  Scales: ∞       │
│  (S3/GCS/Azure)  │    │  DB scaling      │    │  (each user runs │
│                  │    │  (metadata is     │    │   their own)     │
│                  │    │   tiny: ~10GB     │    │                  │
│                  │    │   per PB of data) │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

This is the same architecture as BigQuery (Spanner for metadata) and Snowflake (FoundationDB for metadata). The difference: DuckLake's metadata is open and inspectable — it's just SQL tables you can query directly.

---

## 4. The Internal Data Model (Specification v0.3)

DuckLake uses **22 SQL tables** to store all metadata. The key ones:

### Core Tables

| Table | Purpose |
|-------|---------|
| `ducklake_snapshot` | Version history. Each write creates a snapshot with an incrementing `snapshot_id`, timestamp, and schema version. |
| `ducklake_snapshot_changes` | Summary of what changed per snapshot. Used for conflict resolution — quickly determines if two concurrent writes conflict. |
| `ducklake_schema` | Schema definitions with `begin_snapshot` / `end_snapshot` for temporal validity. |
| `ducklake_table` | Table definitions, also temporally scoped via snapshot ranges. |
| `ducklake_column` | Column definitions per table, including type, nullability, defaults. Also snapshot-scoped. |
| `ducklake_view` | View definitions with stored SQL and dialect. |

### Data File Tracking

| Table | Purpose |
|-------|---------|
| `ducklake_data_file` | Maps data files to tables and snapshots. Each file has `begin_snapshot` and `end_snapshot` defining when it's valid. Also stores encryption keys and partial file info. |
| `ducklake_delete_file` | Tracks deletion files (merge-on-read strategy for DELETEs). |
| `ducklake_files_scheduled_for_deletion` | Files marked for cleanup after snapshot expiration. |
| `ducklake_inlined_data_tables` | Links DuckLake snapshots to inlined data tables (see Data Inlining below). |

### Statistics

| Table | Purpose |
|-------|---------|
| `ducklake_table_stats` | Row counts and file sizes per table. |
| `ducklake_table_column_stats` | Column-level statistics (min/max, null counts) per table. |
| `ducklake_file_column_stats` | Per-file column statistics for query planning / file pruning. |

### Partitioning

| Table | Purpose |
|-------|---------|
| `ducklake_partition_info` | Partition scheme definitions. |
| `ducklake_partition_column` | Which columns participate in partitioning. |
| `ducklake_file_partition_value` | Actual partition values for each data file. |

### Auxiliary

| Table | Purpose |
|-------|---------|
| `ducklake_metadata` | Key-value configuration (format version, inlining limits, row group sizes). Scoped to global, schema, or table level. |
| `ducklake_tag` | Named tags for snapshots (like Git tags). |
| `ducklake_column_tag` | Tags on individual columns. |
| `ducklake_column_mapping` | Maps between DuckLake's internal column representation and Parquet column names. |
| `ducklake_name_mapping` | Name mappings for schema evolution compatibility. |
| `ducklake_schema_versions` | Tracks schema version increments. |

---

## 5. Key Features

### ACID Transactions (Including Multi-Table)

Because all metadata lives in a real SQL database, you get true ACID transactions for free. This includes **cross-table transactions** — atomically update multiple tables in a single commit. Iceberg can only provide single-table transactions.

### Time Travel

Every mutation creates a new snapshot. You can query any historical state:

```sql
SELECT * FROM my_table VERSION AS OF 5;          -- by snapshot ID
SELECT * FROM my_table VERSION AS OF '2025-06-01'; -- by timestamp
```

Old snapshots are retained until explicitly expired. You can also **tag** snapshots with human-readable names.

### Schema Evolution

Columns can be added, renamed, reordered, or have their types widened. Schema changes are tracked via the `ducklake_column` table with `begin_snapshot` / `end_snapshot` ranges. The `schema_version` in `ducklake_snapshot` increments only on schema changes, allowing clients to cache schema information when only data changes.

### Data Inlining

This is one of DuckLake's most clever features. When writing small changes (say, inserting 5 rows), creating an entire Parquet file is wasteful. DuckLake can instead **inline the data directly into the metadata database**.

```sql
ATTACH 'ducklake:my.ducklake' AS lake (DATA_INLINING_ROW_LIMIT 10);
```

Rows below the threshold are stored in dynamically created tables within the catalog database. They behave identically to Parquet-backed data — you query them the same way. When enough inlined data accumulates, it can be flushed to Parquet:

```sql
CALL lake.ducklake_flush_inlined_data('my_table');
```

This directly addresses the **small files problem** that plagues Iceberg and Delta Lake deployments.

### Native Encryption

Each Parquet file can be encrypted with a unique key, stored in the `encryption_key` column of `ducklake_data_file`. The files on blob storage are useless without access to the metadata database.

This enables a powerful pattern: store encrypted Parquet on **publicly accessible** blob storage, and control access entirely through the metadata database. Useful for federation scenarios — e.g., healthcare institutions sharing data on common infrastructure while each controlling access through their own metadata DB.

### Conflict Resolution

DuckLake uses **optimistic concurrency control**. When two clients try to commit simultaneously, they attempt to write a snapshot with the same `snapshot_id`. The database's PRIMARY KEY constraint on `ducklake_snapshot` ensures one succeeds and the other fails.

The `ducklake_snapshot_changes` table stores a summary of what each snapshot modified, allowing the failed client to quickly determine if its changes actually conflict with the committed snapshot. If they don't conflict (e.g., different tables), it can retry with a new snapshot ID.

### Partitioning

DuckLake supports explicit partitioning defined through `ducklake_partition_info` and `ducklake_partition_column`. Partition values for each data file are tracked in `ducklake_file_partition_value`, enabling partition pruning during query planning.

### Upserts

DuckLake supports UPSERT operations (INSERT ... ON CONFLICT), combining insert and update semantics.

### Data Change Feed

Track what changed between snapshots — useful for CDC (Change Data Capture) workflows.

### Row Lineage

Track the origin of rows across transformations.

### Delete Strategy: Merge-on-Read

UPDATE operations are expressed as DELETE + INSERT within the same transaction. Deletes are tracked via separate delete files (`ducklake_delete_file`). During reads, delete files are merged with data files to exclude deleted rows. This avoids rewriting large Parquet files for small deletions.

When delete files accumulate and slow reads, you can rewrite:

```sql
CALL lake.rewrite_files_with_deletes('my_table');
```

---

## 6. Maintenance Operations

### Merge Files (Compaction)

Combine small Parquet files into larger ones for better read performance:

```sql
CALL lake.merge_adjacent_files('my_table');
```

### Expire Snapshots

Remove old snapshots to reclaim metadata space and enable file cleanup:

```sql
CALL lake.expire_snapshots('my_table', older_than := TIMESTAMP '2025-01-01');
```

### Cleanup Files

After expiring snapshots, actually delete orphaned data files from blob storage:

```sql
CALL lake.cleanup_files('my_table');
```

### Checkpoint

Optimize the metadata database itself:

```sql
CALL lake.checkpoint('my_table');
```

The catalog database itself also needs standard maintenance (e.g., `VACUUM` for PostgreSQL).

---

## 7. Multiplayer DuckDB

DuckLake solves DuckDB's single-writer limitation. Multiple DuckDB instances can concurrently read and write the same dataset by connecting to a shared catalog database (PostgreSQL or MySQL). Each instance runs its own local compute — "bring your own compute."

This is fundamentally different from client-server databases. There's no central query coordinator, no resource scheduling. Each DuckDB instance independently:

1. Reads metadata from the catalog DB
2. Reads/writes Parquet files from/to blob storage
3. Commits metadata changes back to the catalog DB

When using DuckDB itself as the catalog database, you're limited to a single client (since DuckDB is embedded/single-writer). For multi-user scenarios, use PostgreSQL or MySQL.

---

## 8. Connecting and Usage

```sql
-- Install the extension
INSTALL ducklake;

-- Local development (DuckDB as catalog)
ATTACH 'ducklake:my_lake.duckdb' AS lake (DATA_PATH 'data/');

-- Production (PostgreSQL as catalog, S3 for data)
ATTACH 'ducklake:postgres:dbname=catalog host=pg.example.com' AS lake
  (DATA_PATH 's3://my-bucket/lake/');

-- SQLite as catalog
ATTACH 'ducklake:sqlite:metadata.sqlite' AS lake (DATA_PATH 'data/');

-- MySQL as catalog
ATTACH 'ducklake:mysql:db=ducklake_catalog host=mysql.example.com' AS lake
  (DATA_PATH 'data/');

-- Then use it like any database
USE lake;
CREATE TABLE events (id INT, ts TIMESTAMP, payload VARCHAR);
INSERT INTO events VALUES (1, now(), 'hello');
SELECT * FROM events;
```

---

## 9. Iceberg Interoperability

DuckLake is not hostile to Iceberg — it's interoperable:

- **Import**: `iceberg_to_ducklake()` does a metadata-only copy. It imports all Iceberg snapshot history into DuckLake without copying any data files. The same Parquet files are referenced by both.
- **Export**: You can go the other direction, exporting DuckLake metadata to Iceberg format.
- **File compatibility**: DuckLake writes standard Parquet files that any Iceberg-compatible engine can read.

This means migration is a metadata operation, not a data copy. You can switch between formats without rewriting terabytes of Parquet data.

---

## 10. DuckLake vs. Iceberg + Catalog — When to Choose What

| Factor | DuckLake | Iceberg + REST Catalog |
|--------|----------|----------------------|
| **Best for** | DuckDB-centric workloads | Multi-engine environments |
| **Engine support** | DuckDB (primary), growing | Spark, Trino, Flink, DuckDB, Presto, etc. |
| **Metadata storage** | SQL database (Postgres, MySQL, SQLite, DuckDB) | Files on object storage + catalog DB |
| **Small changes** | Fast (SQL update or data inlining) | Slow (must write new metadata files) |
| **Multi-table transactions** | Yes (native SQL transactions) | No (single-table only) |
| **Operational complexity** | Low (just a database + Parquet) | Higher (metadata files + catalog + cleanup) |
| **Encryption** | Built-in, per-file keys in metadata | Varies by implementation |
| **Maturity** | Experimental (released May 2025) | Production-proven, broad ecosystem |
| **Ecosystem** | Growing (SQLMesh, MotherDuck) | Massive (AWS, Snowflake, Databricks, etc.) |
| **Disaster recovery** | If catalog DB is lost, data files alone can't reconstruct metadata | Metadata files on object store provide self-describing recovery |

### The Trade-Off to Know

DuckLake's main weakness: if the catalog database is corrupted or lost, you cannot reconstruct it from the Parquet files alone. Iceberg's metadata-as-files approach means you can always recover from object storage. This is a trade-off, not a fatal flaw — it's mitigated by standard database backup practices.

---

## 11. Positioning in the Landscape

| Stack | Components |
|-------|-----------|
| **DuckLake** | DuckLake (format + catalog unified) |
| **Iceberg ecosystem** | Iceberg (format) + Polaris/Lakekeeper/Glue (catalog) |
| **Delta Lake ecosystem** | Delta Lake (format) + Unity Catalog (catalog) |
| **Nessie** | Iceberg (format) + Nessie (Git-like versioned catalog) |

DuckLake competes at the "format + catalog" level, not the format level alone. The DuckDB team frames it as replacing "Iceberg + Polaris" or "Delta + Unity" with a single, simpler thing.

---

## 12. Scalability

The question "does it scale?" is answered by understanding what DuckLake actually scales:

- **Storage** scales infinitely — it's just Parquet on blob storage.
- **Compute** scales infinitely — each user runs their own DuckDB instance.
- **Metadata** is tiny — roughly 10 GB per petabyte of data. Any production PostgreSQL can handle this.

This is the exact same scaling model as BigQuery and Snowflake. The only difference is that DuckLake's metadata is open and inspectable.

---

## 13. Current Status and Limitations

As of early 2026:

- **Status**: Available as a DuckDB extension, actively maturing. MotherDuck is building hosted support.
- **Version**: DuckLake specification v0.3
- **No constraints/keys/indexes**: Like Iceberg and Delta Lake, DuckLake does not support database constraints, keys, or indexes on the data itself.
- **Engine support**: Currently DuckDB-centric. The format is defined as pure SQL transactions, making it theoretically implementable by any engine, but practical support is limited.
- **Access control**: Piggybacks on the catalog database's authentication. If your catalog is PostgreSQL, you use PostgreSQL's auth/authz.
- **License**: MIT, with all IP in the non-profit DuckDB Foundation.

---

## Key Talking Points for an Interview

1. **The core insight**: Metadata management is fundamentally a database problem. DuckLake stops fighting this truth and uses a real database.

2. **It's not "just another table format"**: It replaces the entire stack (format + catalog) rather than competing only at the format layer.

3. **Same architecture as BigQuery/Snowflake**: The separation of storage, compute, and metadata is proven at planetary scale. DuckLake makes it open.

4. **Data inlining is genuinely novel**: No other lakehouse format can transparently stage small writes in the metadata store to avoid the small files problem.

5. **The trade-off is honest**: Loss of self-describing recovery (metadata can't be reconstructed from data files alone) in exchange for dramatically simpler operations and faster metadata access.

6. **Interoperability over lock-in**: Bidirectional migration with Iceberg. Standard Parquet files. Any SQL database as catalog. MIT license.
