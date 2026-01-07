<!--
  devac:seed-hash: 119c3e2d1173d50292184392b3a1b3e12991d5fccc049fc80fbb5f543f597b92
  devac:generated-at: 2026-01-06T16:55:20.790Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
  devac:package-path: /Users/grop/ws/vivief/packages/devac-eval
-->

# Package Effects: devac-eval
<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
  Run `devac doc-sync` to regenerate after verification.
  
  Review and refine the mappings below.
-->
## Metadata
- **Package:** devac-eval
- **Last Updated:** 2026-01-06
- **Verified:** ✗
## Store Operations
<!-- Pattern → Store effect mapping -->
_No store patterns detected. Add manually if needed._

## Retrieve Operations
<!-- Pattern → Retrieve effect mapping -->
_No retrieve patterns detected. Add manually if needed._

## External Calls
<!-- Pattern → Send effect mapping -->
| Pattern | Send Type | Service | Third Party | Module | Count |
|---------|-----------|---------|-------------|--------|-------|
| `join` | external | external | true | node:path | 23 |
| `z.string` | external | external | true | zod | 17 |
| `existsSync` | external | external | true | node:fs | 16 |
| `resolve` | external | external | true | node:path | 14 |
| `writeFile` | external | external | true | node:fs/promises | 9 |
| `readFile` | external | external | true | node:fs/promises | 8 |
| `z.array` | external | external | true | zod | 7 |
| `z.object` | external | external | true | zod | 5 |
| `mkdir` | external | external | true | node:fs/promises | 4 |
| `readdir` | external | external | true | node:fs/promises | 3 |
| `z.enum` | external | external | true | zod | 3 |
| `z.number` | external | external | true | zod | 2 |
| `Command` | external | external | true | commander | 1 |
| `spawn` | external | external | true | node:child_process | 1 |
| `randomUUID` | external | external | true | node:crypto | 1 |
| `defineConfig` | external | external | true | vitest/config | 1 |

## Other Patterns
<!-- Review these and categorize as needed -->
| Pattern | Method Call | Async | Count | Suggested Category |
|---------|-------------|-------|-------|-------------------|
| `console.log` | yes | no | 62 | ignore |
| `this.formatDelta` | yes | no | 23 | - |
| `padEnd` | no | no | 21 | - |
| `Error` | no | no | 17 | - |
| `option` | no | no | 15 | - |
| `console.error` | yes | no | 14 | ignore |
| `JSON.parse` | yes | no | 14 | - |
| `min` | no | no | 12 | - |
| `process.exit` | yes | no | 11 | - |
| `Date.now` | yes | no | 10 | - |
| `JSON.stringify` | yes | no | 10 | - |
| `toFixed` | no | no | 9 | - |
| `this.pad` | yes | no | 9 | - |
| `warnings.push` | yes | no | 8 | - |
| `averageScore` | no | no | 8 | - |
| `join` | no | no | 7 | - |
| `Date` | no | no | 7 | - |
| `toISOString` | no | no | 7 | - |
| `Array.from` | yes | no | 6 | - |
| `description` | no | no | 6 | - |
| `repeat` | no | no | 5 | - |
| `loadBenchmark` | no | yes | 5 | - |
| `Map` | no | no | 5 | - |
| `calculateWinRate` | no | no | 5 | - |
| `optional` | no | no | 5 | - |
| `mapWinner` | no | no | 5 | - |
| `this.clampScore` | yes | no | 5 | - |
| `action` | no | no | 5 | - |
| `program.command` | yes | no | 5 | - |
| `this.log` | yes | no | 5 | ignore |
| _...and 208 more_ | | | | |

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| devac-eval | Container | typescript | - | TODO: Add description |
