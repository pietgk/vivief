# Tree-sitter Knowledge Base

This document captures tree-sitter patterns and lessons learned from CodeGraph v1.0 development. These patterns are useful for extending DevAC with additional language support.

## General Tree-sitter Patterns

### Location Extraction

Always extract location information consistently:

```typescript
function extractLocation(node: SyntaxNode): SourceLocation {
  return {
    startLine: node.startPosition.row + 1,  // 1-indexed
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column,
  };
}
```

### Text Extraction

Safe text extraction with null handling:

```typescript
function getNodeText(node: SyntaxNode | null): string | undefined {
  return node?.text;
}

function getChildText(node: SyntaxNode, fieldName: string): string | undefined {
  return node.childForFieldName(fieldName)?.text;
}
```

### Field Access Patterns

Tree-sitter provides two ways to access children:

```typescript
// Named field access (preferred when available)
const name = node.childForFieldName("name");

// Type-based search (for anonymous children)
const identifier = node.children.find(c => c.type === "identifier");

// Multiple children of same type
const parameters = node.children.filter(c => c.type === "parameter");
```

## C# Parser Patterns

### Grammar Quirks

1. **Namespace handling**: C# 10 file-scoped namespaces use `file_scoped_namespace_declaration`
   ```typescript
   if (node.type === "file_scoped_namespace_declaration") {
     // No braces, applies to entire file
   } else if (node.type === "namespace_declaration") {
     // Traditional with braces
   }
   ```

2. **Method vs Function**: In C#, all functions are methods. Detect context:
   ```typescript
   const isMethod = node.parent?.type === "class_declaration" ||
                    node.parent?.type === "struct_declaration" ||
                    node.parent?.type === "interface_declaration";
   ```

3. **Constructor detection**: Look for method with same name as containing class:
   ```typescript
   const isConstructor = node.type === "constructor_declaration";
   // Or check if method name matches class name
   ```

4. **Extension methods**: First parameter with `this` modifier:
   ```typescript
   const isExtension = node.descendantsOfType("parameter")
     .some(p => p.childForFieldName("modifier")?.text === "this");
   ```

### C# Node Type Mapping

| tree-sitter node | DevAC kind | Notes |
|------------------|------------|-------|
| `class_declaration` | class | |
| `struct_declaration` | class | Set `isStruct: true` |
| `record_declaration` | class | Set `isRecord: true` |
| `interface_declaration` | interface | |
| `method_declaration` | method | |
| `constructor_declaration` | method | Set `isConstructor: true` |
| `property_declaration` | property | |
| `field_declaration` | variable | |
| `event_declaration` | property | Set `isEvent: true` |

## Go Parser Patterns

### Import Handling

Go imports can be grouped or individual:

```typescript
// Single import
if (node.type === "import_declaration") {
  const spec = node.childForFieldName("spec");
  // ...
}

// Import group
if (node.type === "import_spec_list") {
  for (const spec of node.namedChildren) {
    // Each spec is an import
  }
}
```

### Method Receivers

Go methods have receivers that determine the type:

```typescript
if (node.type === "method_declaration") {
  const receiver = node.childForFieldName("receiver");
  const receiverType = receiver?.descendantsOfType("type_identifier")[0]?.text;
  // This method belongs to receiverType
}
```

### Package Detection

```typescript
if (node.type === "package_clause") {
  const packageName = node.childForFieldName("name")?.text;
}
```

## Java Parser Patterns

### AST Node Types

| tree-sitter node | DevAC kind |
|------------------|------------|
| `class_declaration` | class |
| `interface_declaration` | interface |
| `enum_declaration` | enum |
| `method_declaration` | method |
| `constructor_declaration` | method |
| `field_declaration` | variable |

### Method Context Validation

Ensure method is inside a class, not a lambda:

```typescript
function isValidMethodContext(node: SyntaxNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "class_declaration" ||
        parent.type === "interface_declaration" ||
        parent.type === "enum_declaration") {
      return true;
    }
    if (parent.type === "lambda_expression") {
      return false;  // Skip lambda methods
    }
    parent = parent.parent;
  }
  return false;
}
```

### Annotation Handling

```typescript
if (node.type === "annotation") {
  const name = node.childForFieldName("name")?.text;
  // Handle @Override, @Deprecated, etc.
}
```

## C/C++ Parser Patterns

### Function vs Method

In C++, distinguish between free functions and methods:

```typescript
function isMethod(node: SyntaxNode): boolean {
  // Check if inside class or has class scope
  const declarator = node.childForFieldName("declarator");
  return declarator?.type === "function_declarator" &&
         declarator.children.some(c => c.type === "qualified_identifier");
}
```

### Header Guards

Skip header guard macros:

```typescript
if (node.type === "preproc_ifdef" || node.type === "preproc_ifndef") {
  const name = node.childForFieldName("name")?.text;
  if (name?.endsWith("_H") || name?.endsWith("_HPP")) {
    // Skip header guard
    return;
  }
}
```

## Entity ID Generation

### Stable ID Strategy

Entity IDs should be:
1. **Deterministic**: Same input produces same ID
2. **Unique**: Different entities have different IDs
3. **Parseable**: Can extract components from ID

Format: `{repo}:{package_path}:{kind}:{scope_hash}`

```typescript
function generateEntityId(
  repo: string,
  packagePath: string,
  kind: string,
  scopedName: string
): string {
  const scopeHash = createHash("sha256")
    .update(scopedName)
    .digest("hex")
    .slice(0, 12);
  
  return `${repo}:${packagePath}:${kind}:${scopeHash}`;
}
```

### Scoped Name Generation

Build fully-qualified names for scope:

```typescript
function buildScopedName(node: SyntaxNode, ancestors: string[]): string {
  const name = getNodeName(node);
  return [...ancestors, name].join(".");
}

// Examples:
// MyClass.myMethod
// MyNamespace.MyClass.myMethod
// myModule.myFunction
```

## Common Edge Cases

### Anonymous Functions

Handle lambda/arrow functions without names:

```typescript
if (!name && (node.type === "arrow_function" || node.type === "lambda_expression")) {
  name = `<anonymous@${node.startPosition.row + 1}:${node.startPosition.column}>`;
}
```

### Overloaded Functions

Same name, different parameters - use parameter types in ID:

```typescript
function getOverloadSignature(params: Parameter[]): string {
  return params.map(p => p.type || "any").join(",");
}
```

### Re-exports

Track re-exports vs original exports:

```typescript
if (node.type === "export_statement" && node.childForFieldName("source")) {
  // This is a re-export: export { x } from './other'
  edge.type = "REEXPORTS";
}
```

## Performance Considerations

1. **Parse once, traverse multiple times**: Don't re-parse for different node types
2. **Use cursors for deep traversal**: TreeCursor is faster than recursive descent
3. **Cache parent lookups**: Store parent references when walking down
4. **Batch ID generation**: Compute hashes in batches when possible

## Adding New Language Support

1. Install tree-sitter grammar: `npm install tree-sitter-{lang}`
2. Create parser implementing `LanguageParser` interface
3. Map grammar node types to DevAC kinds
4. Handle language-specific constructs (imports, exports, etc.)
5. Add comprehensive tests with fixture files
6. Document any grammar quirks

## Testing Strategy

1. Create fixture files covering:
   - All node kinds
   - All edge types
   - Edge cases (anonymous, overloaded, nested)
2. Verify entity IDs are stable across parses
3. Test incremental updates
4. Benchmark parse time (<100ms per file target)
