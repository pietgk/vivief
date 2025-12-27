---
"@pietgk/devac-core": minor
---

Add CALLS edge extraction to TypeScript parser

- New CALLS edges track function and method call relationships
- Captures caller → callee relationships including:
  - Simple function calls: `foo()`
  - Method calls: `obj.method()`
  - Chained calls: `items.filter().map()`
  - Built-in calls: `console.log()`, `setTimeout()`
  - Constructor calls: `super()`, `new Class()`
  - Instance method calls: `this.method()`
- Edge properties include source location and argument count
- Enables "find all callers of X" queries on seeds
