---
"@pietgk/devac-core": minor
---

Add JSDoc/documentation extraction to TypeScript parser

- Extract JSDoc comments from functions, classes, interfaces, type aliases, and enums
- Handle JSDoc attached to export wrappers (`export function foo`)
- Clean and normalize JSDoc comment formatting (remove `*` prefixes, trim whitespace)
- Populate the existing `documentation` field in parsed nodes
- Respect `includeDocumentation` config flag (defaults to true)
