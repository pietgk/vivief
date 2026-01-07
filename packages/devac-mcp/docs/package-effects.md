<!--
  devac:seed-hash: 3d235305c8db1f32256e89b5b3130d2fa0af5419201c18b8bdc43409e25bda2c
  devac:generated-at: 2026-01-06T16:55:20.818Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
  devac:package-path: /Users/grop/ws/vivief/packages/devac-mcp
-->

# Package Effects: devac-mcp
<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
  Run `devac doc-sync` to regenerate after verification.
  
  Review and refine the mappings below.
-->
## Metadata
- **Package:** devac-mcp
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
| `queryMultiplePackages` | external | external | true | @pietgk/devac-core | 11 |
| `generateC4Context` | external | external | true | @pietgk/devac-core | 4 |
| `createRuleEngine` | external | external | true | @pietgk/devac-core | 4 |
| `exportContextToPlantUML` | external | external | true | @pietgk/devac-core | 2 |
| `generateC4Containers` | external | external | true | @pietgk/devac-core | 2 |
| `exportContainersToPlantUML` | external | external | true | @pietgk/devac-core | 2 |
| `discoverDomainBoundaries` | external | external | true | @pietgk/devac-core | 2 |
| `getRulesByDomain` | external | external | true | @pietgk/devac-core | 2 |
| `getRulesByProvider` | external | external | true | @pietgk/devac-core | 2 |
| `DuckDBPool` | external | external | true | @pietgk/devac-core | 2 |
| `createHubClient` | external | external | true | @pietgk/devac-core | 2 |
| `createHubServer` | external | external | true | @pietgk/devac-core | 2 |
| `path.resolve` | external | external | true | node:path | 2 |
| `findWorkspaceHubDir` | external | external | true | @pietgk/devac-core | 1 |
| `createSeedReader` | external | external | true | @pietgk/devac-core | 1 |
| `createSymbolAffectedAnalyzer` | external | external | true | @pietgk/devac-core | 1 |
| `discoverContext` | external | external | true | @pietgk/devac-core | 1 |
| `getWorkspaceStatus` | external | external | true | @pietgk/devac-core | 1 |
| `StdioServerTransport` | external | external | true | @modelcontextprotocol/sdk/server/stdio.js | 1 |
| `Server` | external | external | true | @modelcontextprotocol/sdk/server/index.js | 1 |
| `defineConfig` | external | external | true | vitest/config | 1 |

## Other Patterns
<!-- Review these and categorize as needed -->
| Pattern | Method Call | Async | Count | Suggested Category |
|---------|-------------|-------|-------|-------------------|
| `Date.now` | yes | no | 48 | - |
| `console.error` | yes | no | 30 | ignore |
| `Error` | no | no | 15 | - |
| `String` | no | no | 15 | - |
| `this.getPackagePaths` | yes | yes | 10 | retrieve? |
| `conditions.push` | yes | no | 10 | - |
| `replace` | no | no | 9 | - |
| `this.hubOperation` | yes | yes | 9 | - |
| `this.seedReader.querySeeds` | yes | yes | 8 | retrieve? |
| `process.exit` | yes | no | 7 | - |
| `entityId.replace` | yes | no | 6 | - |
| `engine.process` | yes | no | 4 | - |
| `message.includes` | yes | no | 4 | - |
| `hub.listRepos` | yes | no | 2 | - |
| `client.listRepos` | yes | no | 2 | - |
| `repos.map` | yes | no | 2 | - |
| `filter.type.replace` | yes | no | 2 | - |
| `filter.file.replace` | yes | no | 2 | - |
| `filter.entity.replace` | yes | no | 2 | - |
| `conditions.join` | yes | no | 2 | - |
| `domainEffects.filter` | yes | no | 2 | - |
| `e.domain.toLowerCase` | yes | no | 2 | - |
| `Promise.resolve` | yes | no | 2 | - |
| `this._pool.initialize` | yes | yes | 2 | - |
| `this._hubServer.start` | yes | yes | 2 | - |
| `this._pool.shutdown` | yes | yes | 2 | - |
| `name.replace` | yes | no | 2 | - |
| `kind.replace` | yes | no | 2 | - |
| `filePath.replace` | yes | no | 2 | - |
| `process.on` | yes | no | 2 | - |
| _...and 100 more_ | | | | |

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| devac-mcp | Container | typescript | - | TODO: Add description |
