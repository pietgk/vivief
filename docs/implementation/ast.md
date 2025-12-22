# AST Architecture

This document describes the Universal AST model used by DevAC for cross-language code analysis.

## Overview

DevAC uses a **Universal AST** model that normalizes code structures from multiple languages (TypeScript, Python, C#) into a common representation. This enables:

- Cross-language queries (e.g., "find all classes that call external APIs")
- Consistent graph structure regardless of source language
- Language-specific details preserved in the `properties` JSON field

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UNIVERSAL AST MODEL                                                        │
│                                                                             │
│  TypeScript ──┐                                                             │
│               │      ┌──────────────────────┐      ┌───────────────────┐   │
│  Python ──────┼────► │  Universal Node/Edge │ ────►│  Parquet Storage  │   │
│               │      │  (16 kinds, 19 types)│      │  + DuckDB Queries │   │
│  C# ──────────┘      └──────────────────────┘      └───────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Universal Node Kinds (16 types)

All code elements are classified into one of 16 universal kinds:

| Kind | Description | TypeScript Example | Python Example | C# Example |
|------|-------------|-------------------|----------------|------------|
| `function` | Standalone function | `function foo()` | `def foo():` | N/A (use static method) |
| `class` | Class declaration | `class User {}` | `class User:` | `public class User {}` |
| `method` | Method in class | `login() {}` | `def login(self):` | `public void Login()` |
| `property` | Class property | `private name: string` | `self.name` | `public string Name { get; }` |
| `variable` | Variable declaration | `const x = 1` | `x = 1` | `var x = 1` |
| `constant` | Constant value | `const MAX = 100` | `MAX = 100` | `const int MAX = 100` |
| `interface` | Interface definition | `interface IUser` | `Protocol` | `public interface IUser` |
| `type` | Type alias | `type ID = string` | `ID: TypeAlias = str` | `delegate` |
| `enum` | Enumeration | `enum Status {}` | `class Status(Enum):` | `public enum Status` |
| `enum_member` | Enum value | `Active = 1` | `ACTIVE = 1` | `Active = 1` |
| `namespace` | Namespace/module | `namespace Auth` | N/A | `namespace Auth` |
| `module` | Module/file | Source file | Source file | Source file |
| `parameter` | Function parameter | `(name: string)` | `(name: str)` | `(string name)` |
| `decorator` | Decorator/attribute | `@Injectable()` | `@property` | `[Attribute]` |
| `jsx_component` | React component | `<UserCard />` | N/A | N/A |
| `hook` | React hook | `useAuth()` | N/A | N/A |
| `unknown` | Unclassified | Fallback | Fallback | Fallback |

## Universal Edge Types (19 types)

Relationships between nodes are classified into 19 edge types:

| Edge Type | Description | Example |
|-----------|-------------|---------|
| `CONTAINS` | Parent contains child | File → Function |
| `CALLS` | Function calls another | `login()` → `validate()` |
| `IMPORTS` | Imports from module | File → External module |
| `EXTENDS` | Class inheritance | `Admin` → `User` |
| `IMPLEMENTS` | Interface implementation | `UserService` → `IUserService` |
| `RETURNS` | Return type relationship | Function → Type |
| `PARAMETER_OF` | Parameter belongs to | Parameter → Function |
| `TYPE_OF` | Type annotation | Variable → Type |
| `DECORATES` | Decorator applied to | `@Log` → Method |
| `OVERRIDES` | Method override | Child method → Parent method |
| `REFERENCES` | Symbol reference | Usage → Definition |
| `EXPORTS` | Module exports symbol | File → Function (exported) |
| `RE_EXPORTS` | Re-exports from another | `index.ts` → Original module |
| `INSTANTIATES` | Creates instance | `new User()` → `User` class |
| `USES_TYPE` | Uses type (not import) | Generic parameter → Type |
| `ACCESSES` | Property/field access | Code → Property |
| `THROWS` | Throws exception | Function → Error type |
| `AWAITS` | Awaits promise | Async code → Promise |
| `YIELDS` | Generator yield | Generator → Yielded type |

## Language Mappings

### TypeScript Mapping

```typescript
// TypeScript AST (ts-morph) → Universal Kind
FunctionDeclaration     → function
ArrowFunctionExpression → function    // is_arrow: true in properties
MethodDeclaration       → method
ClassDeclaration        → class
InterfaceDeclaration    → interface
TypeAliasDeclaration    → type
EnumDeclaration         → enum
VariableDeclaration     → variable    // or constant based on const keyword
PropertyDeclaration     → property
ParameterDeclaration    → parameter
Decorator               → decorator
JsxElement              → jsx_component
```

**Properties for TypeScript:**
```json
{
  "is_async": true,
  "is_arrow": true,
  "is_generator": false,
  "is_abstract": false,
  "is_static": false,
  "visibility": "public",
  "type_parameters": ["T", "U"],
  "decorators": ["Injectable", "Log"]
}
```

### Python Mapping

```python
# Python AST → Universal Kind
FunctionDef       → function
AsyncFunctionDef  → function    # is_async: true in properties
ClassDef          → class
MethodDef (in class) → method
Assignment (module level) → variable
Assignment (UPPER_CASE) → constant
TypeAlias         → type
```

**Properties for Python:**
```json
{
  "is_async": true,
  "is_classmethod": false,
  "is_staticmethod": false,
  "is_property": false,
  "decorators": ["property", "classmethod"],
  "docstring": "Function description"
}
```

### C# Mapping

```csharp
// C# Syntax → Universal Kind
ClassDeclaration      → class
StructDeclaration     → class       // is_struct: true
RecordDeclaration     → class       // is_record: true
InterfaceDeclaration  → interface
MethodDeclaration     → method
PropertyDeclaration   → property
FieldDeclaration      → variable
ConstDeclaration      → constant
EnumDeclaration       → enum
DelegateDeclaration   → type
NamespaceDeclaration  → namespace
```

**Properties for C#:**
```json
{
  "is_struct": false,
  "is_record": false,
  "is_partial": false,
  "is_abstract": false,
  "is_sealed": false,
  "is_static": false,
  "visibility": "public",
  "attributes": ["Serializable", "DataContract"]
}
```

## Entity ID Format

Each node has a globally unique entity ID:

```
{repo}:{package_path}:{kind}:{scope_hash}
```

| Component | Description | Example |
|-----------|-------------|---------|
| `repo` | Repository identifier | `vivief` |
| `package_path` | Path to package | `packages/devac-core` |
| `kind` | Universal node kind | `function` |
| `scope_hash` | Hash of scoped name | `a1b2c3d4` |

**Examples:**
```
vivief:packages/devac-core:function:a1b2c3d4
vivief:packages/devac-cli:class:e5f6g7h8
myapp:src:method:i9j0k1l2
```

The scope hash is computed from the fully-qualified name (e.g., `AuthService.login`) to ensure uniqueness within a file.

## Design Principles

### 1. Language-Agnostic Core

The 16 node kinds and 19 edge types cover common programming concepts across all supported languages. This enables queries like:

```sql
-- Find all classes across all languages
SELECT * FROM nodes WHERE kind = 'class';

-- Find all function calls
SELECT * FROM edges WHERE edge_type = 'CALLS';
```

### 2. Language-Specific Properties

Language-specific details are preserved in the `properties` JSON field:

```sql
-- Find all async functions in TypeScript
SELECT * FROM nodes 
WHERE kind = 'function' 
  AND language = 'typescript'
  AND properties->>'is_async' = 'true';

-- Find all static methods in C#
SELECT * FROM nodes
WHERE kind = 'method'
  AND language = 'csharp'
  AND properties->>'is_static' = 'true';
```

### 3. Extensibility

Adding a new language requires:

1. **Create a parser** that maps language constructs to universal kinds
2. **Define property mappings** for language-specific features
3. **Implement semantic resolver** for cross-file resolution

The universal model doesn't need to change when adding languages.

## Adding a New Language

### Step 1: Create Parser

```typescript
// src/parsers/{language}-parser.ts
export class NewLanguageParser implements LanguageParser {
  parse(content: string, filePath: string): ParseResult {
    // Parse source into universal nodes and edges
    return {
      nodes: [...],
      edges: [...],
      externalRefs: [...]
    };
  }
}
```

### Step 2: Define Kind Mapping

Document how language constructs map to universal kinds:

```typescript
const kindMapping = {
  'LanguageSpecificClass': 'class',
  'LanguageSpecificFunction': 'function',
  // ...
};
```

### Step 3: Define Property Schema

Document language-specific properties:

```typescript
interface NewLanguageProperties {
  language_specific_flag: boolean;
  language_specific_list: string[];
}
```

### Step 4: Create Semantic Resolver

```typescript
// src/semantic/{language}-semantic.ts
export class NewLanguageSemanticResolver implements SemanticResolver {
  readonly language = "newlanguage";
  
  async isAvailable(): Promise<boolean> { /* ... */ }
  async buildExportIndex(packagePath: string): Promise<ExportIndex> { /* ... */ }
  async resolveRef(ref: UnresolvedRef, index: ExportIndex): Promise<ResolvedRef | null> { /* ... */ }
  async resolvePackage(packagePath: string, refs: UnresolvedRef[]): Promise<ResolutionResult> { /* ... */ }
  clearCache(packagePath: string): void { /* ... */ }
}
```

### Step 5: Register in Factory

```typescript
// src/semantic/index.ts
if (this.config.newlanguage.enabled) {
  this.resolvers.set("newlanguage", new NewLanguageSemanticResolver(this.config.newlanguage));
}
```

## Query Examples

### Cross-Language Queries

```sql
-- All exported functions across all languages
SELECT entity_id, name, language, file_path
FROM nodes
WHERE kind = 'function' AND is_exported = true;

-- Class inheritance hierarchy
SELECT 
  child.name AS child_class,
  parent.name AS parent_class,
  child.language
FROM edges e
JOIN nodes child ON e.source_entity_id = child.entity_id
JOIN nodes parent ON e.target_entity_id = parent.entity_id
WHERE e.edge_type = 'EXTENDS';

-- Functions with most callers
SELECT 
  target.name,
  target.file_path,
  COUNT(*) as caller_count
FROM edges e
JOIN nodes target ON e.target_entity_id = target.entity_id
WHERE e.edge_type = 'CALLS'
GROUP BY target.entity_id, target.name, target.file_path
ORDER BY caller_count DESC
LIMIT 10;
```

### Language-Specific Queries

```sql
-- TypeScript: Find all React hooks
SELECT * FROM nodes
WHERE kind = 'hook' AND language = 'typescript';

-- Python: Find all async functions
SELECT * FROM nodes
WHERE kind = 'function' 
  AND language = 'python'
  AND properties->>'is_async' = 'true';

-- C#: Find all interfaces
SELECT * FROM nodes
WHERE kind = 'interface' AND language = 'csharp';
```

## Related Documentation

- [Data Model](./data-model.md) - Schema details for nodes, edges, external_refs
- [Parsing Pipeline](./parsing.md) - Two-pass analysis architecture
- [Semantic Resolution](./resolution.md) - Cross-file symbol resolution
