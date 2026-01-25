# ADR-0044: Unified Addressing Scheme for DevAC

## Status

Accepted (Revised)

## Context

DevAC currently has fragmented addressing:

| What | Current Format | Problem |
|------|---------------|---------|
| Entity IDs | `repo:pkg:kind:hash` | No file, no line, no branch |
| Effect IDs | `eff_timestamp_random` | No semantic structure, can't parse |
| File paths | `src/foo.ts` (relative) | Stored in separate columns, different names |
| Targets | Entity ID, resource string, or URL | No unified pattern |

This fragmentation causes several issues:
1. MCP tools require separate parameters for repo, package, file, etc.
2. Effect targets are inconsistent (entity IDs, resource strings, URLs)
3. No standard way to reference specific symbols across the codebase
4. Difficult to implement cross-repo references cleanly

## Research Findings

### Logseq's Single Identity Model

Logseq uses **ONE identity (UUID) with multiple access patterns**:

| Layer | Format | Purpose |
|-------|--------|---------|
| **Storage** | UUID | `68485f78-...` - stable, never changes |
| **Display** | Title | `[[My Page]]` - human readable, can change |
| **Alias** | Alternative titles | Multiple names → same UUID |

**Key insight**: The UUID IS the identity. Display names and aliases are just lookup keys that resolve TO the identity. This is conceptually clean—there's no confusion about "which one is canonical."

### Industry Standards

| System | Format | Why It Works |
|--------|--------|--------------|
| **AWS ARN** | `arn:aws:s3:::bucket/key` | Clear semantic hierarchy |
| **Git refs** | `user/repo@branch:path#L10` | Branch separate from identity |
| **File URI** | `file:///path#L10:C5` | Position as fragment |
| **GitHub** | `org/repo/blob/branch/path#L10-L20` | Human-readable |
| **SCIP** | `npm pkg version file#Class.method().` | Symbol path with type suffixes |

## Decision

Adopt a **Single Identity Model** with the `devac://` URI scheme.

### Core Principle: Single Identity

**Entity ID is the only identity:**
```
repo:package:kind:hash
```
- Stable across renames
- Stored in parquet
- Used for all relationships (refs, backlinks)
- Never contains version (identity is version-independent)

**URIs are lookup keys** (not identities):
```
devac://repo/package/file#Symbol.path
```
- Human-readable query syntax
- Resolves to Entity ID via index
- Can fail to resolve (symbol renamed/deleted)

### URI Format

```
devac://repo/package/file[#symbol.path][?params]
```

| Component | Required | Format | Example |
|-----------|----------|--------|---------|
| Scheme | Yes | `devac://` | `devac://` |
| Repo | Yes | name | `vivief` |
| Package | Yes | path (`.` for root) | `packages/core` |
| File | Optional | path within package | `src/auth.ts` |
| Symbol | Optional | `#Type.method()` | `#AuthService.login()` |
| Params | Optional | `?key=value` | `?version=main&line=45` |

**Query Parameters:**

| Param | Purpose | Example |
|-------|---------|---------|
| `version` | Branch/tag/commit filter | `?version=main` |
| `line` | Line number for navigation | `?line=45` |
| `col` | Column for precise position | `?col=10` |

**Examples:**

```
# Repo level
devac://app

# Package level
devac://app/packages/core

# File level
devac://app/packages/core/src/auth.ts

# File in root package
devac://app/./src/App.tsx

# Class (type)
devac://app/packages/core/src/auth.ts#AuthService

# Method within class
devac://app/packages/core/src/auth.ts#AuthService.login()

# With overload disambiguation
devac://app/packages/core/src/auth.ts#AuthService.login(string,string)

# With version filter
devac://app/packages/core/src/auth.ts#AuthService?version=main

# With position
devac://app/packages/core/src/auth.ts#AuthService?version=main&line=45&col=10
```

### Symbol Path Suffixes (SCIP-inspired)

| Suffix | Meaning | Example |
|--------|---------|---------|
| `#` | Type (class, interface, type alias) | `#AuthService` |
| `.` | Term (function, variable, constant) | `.validateToken()` |
| `()` | Method/function call | `.login()` |
| Chained | Nested symbols | `#AuthService.login()` |

### Overload Disambiguation

For languages with function/method overloading (TypeScript, Java, C#), argument types can be included in parentheses to disambiguate between overloads:

```
#AuthService.login(string,string)    # login(username: string, password: string)
#AuthService.login(OAuth2Token)      # login(token: OAuth2Token)
#Array.from(Iterable)                # from<T>(iterable: Iterable<T>)
#Array.from(Iterable,Function)       # from<T,U>(iterable: Iterable<T>, mapFn: (v: T) => U)
```

**Format:** `methodName(Type1,Type2,...)`

| Component | Description |
|-----------|-------------|
| `methodName` | The method or function name |
| `()` | Parentheses indicate a callable |
| `Type1,Type2` | Comma-separated type names (no spaces) |

**Notes:**
- Empty parentheses `()` match any callable (no disambiguation)
- Type names should match the source language's type syntax
- Generics are simplified to their base type (e.g., `Array<string>` → `Array`)
- Optional: implementation may fall back to first match if disambiguation fails

### Entity ID Format

```
repo:package:kind:hash
```

| Component | Description | Example |
|-----------|-------------|---------|
| repo | Repository name | `app` |
| package | Package path within repo | `packages/core` |
| kind | Symbol kind (class, function, etc.) | `class` |
| hash | Content-based hash for stability | `a1b2c3d4` |

**Examples:**

```
app:packages/core:class:a1b2c3d4
app:.:function:xyz789
```

### Relative References (Simplified)

Only **same-file references** are supported:
```
#Symbol.path
```

| Format | Meaning | Resolution |
|--------|---------|------------|
| `#AuthService` | Type in current file | Requires file context |
| `#AuthService.login()` | Method in current file | Requires file context |
| `.validateToken()` | Term in current file | Requires file context |

**Why no cross-file relative refs?**

Cross-file refs like `./src/auth.ts#AuthService` add complexity:
- Context-dependent resolution introduces stateful behavior
- Different relative paths could mean the same thing
- Hard to reason about in diffs/reviews

Instead, always use full URIs for cross-file references. They can be shortened for display.

### External References

External targets keep native schemes:
- HTTP: `https://api.stripe.com/v1/charges`
- Database: `mysql://host/database/table`
- AWS: `s3://bucket/key`

### Resolution Flow

```
User Input                    Internal
───────────                   ────────
devac://repo/pkg/file#Symbol
          ↓
     Parse URI
          ↓
  Query Index by path
          ↓
     Entity ID: repo:pkg:kind:hash
          ↓
  Use for queries/backlinks
```

## Implementation

### Phase 1: URI Parser & Formatter

New module at `packages/devac-core/src/uri/`:

```typescript
// Types
interface CanonicalURI {
  repo: string;
  version?: string;
  package: string;
  file?: string;
  symbol?: SymbolPath;
}

interface URIQueryParams {
  version?: string;
  line?: number;
  col?: number;
}

interface ParsedURI {
  uri: CanonicalURI;
  params?: URIQueryParams;
}

interface EntityID {
  repo: string;
  package: string;
  kind: string;
  hash: string;
}

interface SymbolPath {
  segments: SymbolSegment[];
}

interface SymbolSegment {
  kind: "type" | "term";
  name: string;
  params?: string[];
}

// Functions
function parseCanonicalURI(uri: string): ParsedURI;
function formatCanonicalURI(uri: CanonicalURI, params?: URIQueryParams): string;
function parseSymbolPath(path: string): SymbolPath;
function resolveRelativeRef(ref: string, context: URIContext): CanonicalURI;
```

### Phase 2: MCP Tools Use URIs

```typescript
// Before (fragmented params)
query_file({ filePath: "/path/to/file.ts", repo_id: "..." })

// After (canonical URI)
query_file({ uri: "devac://app/./src/App.tsx" })
```

### Phase 3-5: Effect URIs, Schema Update, Regenerate Seeds

- Effects get semantic URIs
- Clean schema without legacy fields
- Regenerate all seeds from source

## Consequences

### Positive

- **Single identity**: Entity ID is THE identity, no confusion
- **Human-readable**: URIs show what they reference
- **Stable**: Entity IDs survive renames
- **Bidirectional**: Index supports backlink queries
- **Simple**: No cross-file relative refs to complicate resolution
- **Query-friendly**: Version/position as query params, not identity

### Negative

- **Learning curve**: New URI format to understand
- **Migration**: MCP tools need updating
- **Index overhead**: Must index both URI and Entity ID

### Neutral

- **No backward compatibility needed**: Can regenerate all seeds
- **External URIs unchanged**: HTTP, database URLs stay as-is

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Identity model | Single (Entity ID) | Like Logseq's UUID - one identity, multiple lookup paths |
| Scheme `devac://` | Explicit prefix | Unambiguous like `file://`, `s3://` |
| Path hierarchy `/repo/pkg/file` | Filesystem mental model | Natural, matches GitHub URLs |
| Symbol suffixes `#Class.method()` | Human-readable | SCIP-inspired, no hash lookup |
| Version handling | Query param `?version=` | Version is a filter, not identity |
| Position handling | Query params `?line=&col=` | Position is navigation, not identity |
| Relative refs | Same-file only (`#Symbol`) | Simplicity over flexibility |
| Root package `.` | Explicit | Unambiguous |

## Migration

**Before (old format):**
```
devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService#L45:C10
```

**After (new format):**
```
devac://app/packages/core/src/auth.ts#AuthService?version=main&line=45&col=10
```

| Change | Before | After |
|--------|--------|-------|
| Workspace | In path: `mindlercare/` | Removed (inferred from context) |
| Version | In path: `@main` | Query param: `?version=main` |
| Position | Fragment: `#L45:C10` | Query params: `?line=45&col=10` |
| Fragment | Overloaded | Symbol only: `#AuthService` |

## Validation

Comparison with existing formats:

| System | Their Format | DevAC Equivalent | Convertible? |
|--------|--------------|------------------|--------------|
| **SCIP** | `npm @org/pkg 1.0.0 file#Class.method().` | `devac://repo/./file#Class.method()?version=1.0.0` | ✓ |
| **Git ref** | `user/repo@branch:path#L10` | `devac://repo/./path?version=branch&line=10` | ✓ |
| **GitHub** | `github.com/org/repo/blob/main/file#L10` | `devac://repo/./file?version=main&line=10` | ✓ |
| **File URI** | `file:///path/file.ts#L10:C5` | `devac://repo/pkg/file.ts?line=10&col=5` | ✓ |

## Files

### New Files

| File | Purpose |
|------|---------|
| `packages/devac-core/src/uri/types.ts` | Type definitions |
| `packages/devac-core/src/uri/parser.ts` | URI parsing |
| `packages/devac-core/src/uri/formatter.ts` | URI formatting |
| `packages/devac-core/src/uri/resolver.ts` | URI ↔ Entity ID resolution |
| `packages/devac-core/src/uri/relative.ts` | Relative reference handling |
| `packages/devac-core/src/uri/index.ts` | Public exports |

### Modified Files (Future Phases)

| File | Change |
|------|--------|
| `packages/devac-mcp/src/tools/index.ts` | Replace params with `uri` |
| `packages/devac-mcp/src/data-provider.ts` | Use URI system |
| `packages/devac-core/src/storage/seed-types.ts` | Clean schema |

## References

- [SCIP Specification](https://sourcegraph.com/docs/code-intelligence/how-it-works)
- [ADR-0001](0001-replace-neo4j-with-duckdb.md) - DuckDB choice
- [ADR-0007](0007-federation-central-hub.md) - Federation design
- [Logseq Architecture](https://docs.logseq.com/) - Single identity inspiration
