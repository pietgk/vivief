<!--
  devac:seed-hash: 935496ece615114b0314d74412b86fe37a5743f00731031c27b6c30c232b8f80
  devac:generated-at: 2026-01-06T16:55:20.634Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
  devac:package-path: /Users/grop/ws/vivief/packages/devac-core
-->

# Package Effects: devac-core
<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
  Run `devac doc-sync` to regenerate after verification.
  
  Review and refine the mappings below.
-->
## Metadata
- **Package:** devac-core
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
| `path.join` | external | external | true | node:path | 208 |
| `z.string` | external | external | true | zod | 70 |
| `fs.readFile` | external | external | true | node:fs/promises | 34 |
| `path.basename` | external | external | true | node:path | 30 |
| `path.dirname` | external | external | true | node:path | 29 |
| `performance.now` | external | external | true | node:perf_hooks | 27 |
| `fs.stat` | external | external | true | node:fs/promises | 24 |
| `t.isIdentifier` | external | external | true | @babel/types | 21 |
| `fs.mkdir` | external | external | true | node:fs/promises | 20 |
| `z.number` | external | external | true | zod | 19 |
| `z.enum` | external | external | true | zod | 19 |
| `path.relative` | external | external | true | node:path | 18 |
| `path.resolve` | external | external | true | node:path | 18 |
| `z.boolean` | external | external | true | zod | 15 |
| `z.literal` | external | external | true | zod | 15 |
| `fs.readdir` | external | external | true | node:fs/promises | 14 |
| `fs.access` | external | external | true | node:fs/promises | 14 |
| `z.object` | external | external | true | zod | 12 |
| `fs.existsSync` | external | external | true | node:fs | 10 |
| `fs.unlink` | external | external | true | node:fs/promises | 10 |
| `path.extname` | external | external | true | node:path | 9 |
| `crypto.randomBytes` | external | external | true | node:crypto | 9 |
| `fs.rename` | external | external | true | node:fs/promises | 8 |
| `z.array` | external | external | true | zod | 7 |
| `spawn` | external | external | true | node:child_process | 6 |
| `promisify` | external | external | true | node:util | 6 |
| `t.isMemberExpression` | external | external | true | @babel/types | 6 |
| `path.isAbsolute` | external | external | true | node:path | 5 |
| `crypto.createHash` | external | external | true | node:crypto | 5 |
| `stat` | external | external | true | node:fs/promises | 5 |
| `fs.writeFile` | external | external | true | node:fs/promises | 5 |
| `fs.open` | external | external | true | node:fs/promises | 5 |
| `EventEmitter` | external | external | true | node:events | 5 |
| `glob` | external | external | true | glob | 5 |
| `readFile` | external | external | true | node:fs/promises | 4 |
| `Database.create` | external | external | true | duckdb-async | 4 |
| `t.isStringLiteral` | external | external | true | @babel/types | 4 |
| `net.createConnection` | external | external | true | node:net | 3 |
| `t.isExportNamedDeclaration` | external | external | true | @babel/types | 3 |
| `t.isExportDefaultDeclaration` | external | external | true | @babel/types | 3 |
| `fs.readFileSync` | external | external | true | node:fs | 3 |
| `chokidar.watch` | external | external | true | chokidar | 3 |
| `fs.rm` | external | external | true | node:fs/promises | 2 |
| `t.isSuper` | external | external | true | @babel/types | 2 |
| `t.isCallExpression` | external | external | true | @babel/types | 2 |
| `t.isAwaitExpression` | external | external | true | @babel/types | 2 |
| `t.isImport` | external | external | true | @babel/types | 2 |
| `t.isImportSpecifier` | external | external | true | @babel/types | 2 |
| `t.isTemplateLiteral` | external | external | true | @babel/types | 2 |
| `fs.readdirSync` | external | external | true | node:fs | 2 |
| `os.hostname` | external | external | true | node:os | 2 |
| `z.discriminatedUnion` | external | external | true | zod | 2 |
| `path.parse` | external | external | true | node:path | 2 |
| `readdir` | external | external | true | node:fs/promises | 1 |
| `fs.chmod` | external | external | true | node:fs/promises | 1 |
| `net.createServer` | external | external | true | node:net | 1 |
| `Parser` | external | external | true | tree-sitter | 1 |
| `unlink` | external | external | true | node:fs/promises | 1 |
| `writeFile` | external | external | true | node:fs/promises | 1 |
| `tmpdir` | external | external | true | node:os | 1 |
| `mkdtemp` | external | external | true | node:fs/promises | 1 |
| `fileURLToPath` | external | external | true | node:url | 1 |
| `t.isVariableDeclaration` | external | external | true | @babel/types | 1 |
| `t.isExportSpecifier` | external | external | true | @babel/types | 1 |
| `t.isThisExpression` | external | external | true | @babel/types | 1 |
| `t.isNewExpression` | external | external | true | @babel/types | 1 |
| `t.isImportNamespaceSpecifier` | external | external | true | @babel/types | 1 |
| `t.isImportDefaultSpecifier` | external | external | true | @babel/types | 1 |
| `t.isClassProperty` | external | external | true | @babel/types | 1 |
| `t.isClassMethod` | external | external | true | @babel/types | 1 |
| `t.isFunctionExpression` | external | external | true | @babel/types | 1 |
| `t.isArrowFunctionExpression` | external | external | true | @babel/types | 1 |
| `t.isVariableDeclarator` | external | external | true | @babel/types | 1 |
| `parse` | external | external | true | @babel/parser | 1 |
| `os.cpus` | external | external | true | node:os | 1 |
| `os.tmpdir` | external | external | true | node:os | 1 |
| `fs.rmdir` | external | external | true | node:fs/promises | 1 |
| `z.union` | external | external | true | zod | 1 |
| `z.unknown` | external | external | true | zod | 1 |
| `z.record` | external | external | true | zod | 1 |
| `fs.accessSync` | external | external | true | node:fs | 1 |
| `defineConfig` | external | external | true | vitest/config | 1 |
| `afterAll` | external | external | true | vitest | 1 |
| `afterEach` | external | external | true | vitest | 1 |
| `beforeEach` | external | external | true | vitest | 1 |

## Other Patterns
<!-- Review these and categorize as needed -->
| Pattern | Method Call | Async | Count | Suggested Category |
|---------|-------------|-------|-------|-------------------|
| `lines.push` | yes | no | 676 | - |
| `Date.now` | yes | no | 119 | - |
| `lower.includes` | yes | no | 83 | - |
| `Map` | no | no | 78 | - |
| `fileExists` | no | yes | 59 | - |
| `Number` | no | no | 57 | - |
| `Date` | no | no | 55 | - |
| `Error` | no | no | 54 | - |
| `lines.join` | yes | no | 53 | - |
| `errors.push` | yes | no | 50 | - |
| `toISOString` | no | no | 48 | - |
| `conn.run` | yes | yes | 47 | - |
| `String` | no | no | 46 | - |
| `Set` | no | no | 46 | store? |
| `conn.all` | yes | yes | 40 | - |
| `JSON.parse` | yes | no | 39 | - |
| `escapeString` | no | no | 39 | - |
| `join` | no | no | 38 | - |
| `getNodeText` | no | no | 38 | retrieve? |
| `sanitizeId` | no | no | 34 | - |
| `this.db.run` | yes | yes | 31 | - |
| `defineRule` | no | no | 31 | - |
| `Array.from` | yes | no | 30 | - |
| `hasModifier` | no | no | 30 | - |
| `getChildByField` | no | no | 28 | retrieve? |
| `sanitizeLikeC4Id` | no | no | 27 | - |
| `JSON.stringify` | yes | no | 27 | - |
| `findChildByType` | no | no | 27 | retrieve? |
| `getSeedPaths` | no | no | 27 | retrieve? |
| `executeWithRecovery` | no | yes | 26 | - |
| _...and 1492 more_ | | | | |

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| devac-core | Container | typescript | - | TODO: Add description |
