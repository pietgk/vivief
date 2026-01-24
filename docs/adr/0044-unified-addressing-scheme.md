# ADR-0044: Unified Addressing Scheme for DevAC

## Status

Accepted

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

### Industry Standards

| System | Format | Why It Works |
|--------|--------|--------------|
| **AWS ARN** | `arn:aws:s3:::bucket/key` | Clear semantic hierarchy |
| **Git refs** | `user/repo@branch:path#L10` | Branch separate from identity |
| **File URI** | `file:///path#L10:C5` | Position as fragment |
| **GitHub** | `org/repo/blob/branch/path#L10-L20` | Human-readable |
| **SCIP** | `npm pkg version file#Class.method().` | Symbol path with type suffixes |

### SCIP (Sourcegraph Code Intelligence Protocol)

SCIP uses descriptor suffixes to indicate symbol type:

| Suffix | Meaning | Example |
|--------|---------|---------|
| `/` | Namespace | `src/index.ts/` |
| `#` | Type (class, interface) | `#MyClass` |
| `.` | Term (function, variable) | `.myFunction().` |
| `()` | Method | `.myMethod().` |

Key insights:
- Human-readable without lookup
- Version is part of identity
- Chained descriptors for navigation

### Logseq Bidirectional Links

| Pattern | Our Adoption |
|---------|--------------|
| Simple syntax `[[page]]` | Relative refs |
| UUID for stability | Entity ID (hash-based) |
| Bidirectional links | Must implement reverse index |

## Decision

Implement a `devac://` URI scheme with three reference types:

### 1. Canonical URI (Human-Readable)

```
devac://[workspace/]repo[@version]/package/file[#symbol.path][#location]
```

**Components:**

| Component | Description | Example |
|-----------|-------------|---------|
| workspace | Workspace name | `mindlercare` |
| repo | Repository name | `app` |
| @version | Tag, branch, or commit | `@v2.1.0`, `@main` |
| package | Package path (`.` for root) | `packages/core` |
| file | File path within package | `src/auth.ts` |
| #symbol | SCIP-style symbol path | `#AuthService.login()` |
| #location | Line/column position | `#L45:C10` |

**Symbol Suffixes (SCIP-inspired):**

| Suffix | Meaning | Example |
|--------|---------|---------|
| `#` | Type (class, interface, type alias) | `#AuthService` |
| `.` | Term (function, variable, constant) | `.validateToken()` |
| Chained | Nested symbols | `#AuthService.login()` |

**Examples:**

```
# Workspace level
devac://mindlercare

# Repo at version
devac://mindlercare/app@v2.1.0

# File level
devac://mindlercare/app@main/packages/core/src/auth.ts

# Class (type)
devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService

# Method within class
devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login()

# With overload disambiguation
devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService.login(string,string)

# With position
devac://mindlercare/app@main/packages/core/src/auth.ts#AuthService#L45:C10
```

### 2. Entity ID (Stable Internal)

```
repo:package:kind:hash
```

- Used internally in parquet storage
- Hash-based, stable across renames
- Never changes for the lifetime of the entity

### 3. Relative Reference (Context-Dependent)

| Context | Relative Ref | Resolves To |
|---------|--------------|-------------|
| Same file | `#AuthService.login()` | Symbol in current file |
| Same package | `./src/auth.ts#AuthService` | Current workspace + repo + package + ref |
| Same repo | `./packages/core/src/auth.ts#AuthService` | Current workspace + repo + ref |
| Same workspace | `app@main/./src/auth.ts#AuthService` | Current workspace + ref |

### Dual Identity

Like Logseq's UUID blocks with display names, we maintain both:

| Layer | Format | Purpose |
|-------|--------|---------|
| **Internal ID** | `repo:pkg:kind:hash` | Stable across renames, stored in parquet |
| **Human URI** | `devac://repo/pkg/file#Symbol` | Readable, used in APIs/MCP |

The URI **resolves to** the internal ID via the index. If a symbol is renamed:
- Old URI stops resolving (or redirects)
- Internal ID remains stable
- Backlinks (dependents) still work via internal ID

### Effect URIs

Effects get semantic URIs instead of random IDs:

```
# Current (opaque)
effect_id: "eff_z1234_abcd5678"

# Proposed (semantic)
devac://repo/pkg/file#function/effects/FunctionCall:0
```

External targets keep native schemes:
- HTTP: `https://api.stripe.com/v1/charges`
- Database: `mysql://host/database/table`

## Implementation

### Phase 1: URI Parser & Formatter

New module at `packages/devac-core/src/uri/`:

```typescript
// Types
interface CanonicalURI {
  workspace: string;
  repo: string;
  version?: string;
  package: string;
  file?: string;
  symbol?: SymbolPath;
  location?: Location;
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
function parseCanonicalURI(uri: string): CanonicalURI;
function formatCanonicalURI(parts: CanonicalURI): string;
function parseSymbolPath(path: string): SymbolPath;
function resolveRelativeRef(ref: string, context: URIContext): CanonicalURI;
```

### Phase 2: MCP Tools Use URIs

```typescript
// Before (fragmented params)
query_file({ filePath: "/path/to/file.ts", repo_id: "..." })

// After (canonical URI)
query_file({ uri: "devac://mindlercare/app@main/./src/App.tsx" })
```

### Phase 3-5: Effect URIs, Schema Update, Regenerate Seeds

- Effects get semantic URIs
- Clean schema without legacy fields
- Regenerate all seeds from source

## Consequences

### Positive

- **Unified addressing**: One pattern for all references
- **Human-readable**: URIs show what they reference
- **Stable**: Entity IDs survive renames
- **Bidirectional**: Index supports backlink queries
- **Compatible**: Converts to/from SCIP, Git, GitHub formats

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
| Scheme `devac://` | Explicit prefix | Unambiguous like `file://`, `s3://` |
| Path hierarchy `/repo/pkg/file` | Filesystem mental model | Natural, matches GitHub URLs |
| Symbol suffixes `#Class.method()` | Human-readable | SCIP-inspired, no hash lookup |
| Version with `@` | `repo@version` | Like npm/git, separate from identity |
| Position with `#` | Fragment | Like File URIs, not part of identity |
| Dual identity | URI + Entity ID | Readable + stable |
| Root package `.` | Explicit | Unambiguous |

## Validation

Comparison with existing formats:

| System | Their Format | DevAC Equivalent | Convertible? |
|--------|--------------|------------------|--------------|
| **SCIP** | `npm @org/pkg 1.0.0 file#Class.method().` | `devac://ws/repo@1.0.0/./file#Class.method()` | ✓ |
| **Git ref** | `user/repo@branch:path#L10` | `devac://ws/repo@branch/./path#L10` | ✓ |
| **GitHub** | `github.com/org/repo/blob/main/file#L10` | `devac://ws/repo@main/./file#L10` | ✓ |
| **File URI** | `file:///path/file.ts#L10:C5` | `devac://ws/repo/pkg/file.ts#L10:C5` | ✓ |

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
