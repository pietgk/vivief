<!--
  devac:seed-hash: b2dfe1379313ec821804f9c1d26b737ef018d18544a5dc246cd1e29d5e05b0df
  devac:generated-at: 2026-01-06T16:55:20.440Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
  devac:package-path: /Users/grop/ws/vivief/packages/devac-cli
-->

# Package Effects: devac-cli
<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
  Run `devac doc-sync` to regenerate after verification.
  
  Review and refine the mappings below.
-->
## Metadata
- **Package:** devac-cli
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
| `path.join` | external | external | true | node:path | 90 |
| `path.resolve` | external | external | true | node:path | 72 |
| `DuckDBPool` | external | external | true | @pietgk/devac-core | 25 |
| `fs.writeFile` | external | external | true | node:fs/promises | 25 |
| `fs.access` | external | external | true | node:fs/promises | 22 |
| `fs.existsSync` | external | external | true | node:fs | 21 |
| `createHubClient` | external | external | true | @pietgk/devac-core | 12 |
| `createCentralHub` | external | external | true | @pietgk/devac-core | 12 |
| `execSync` | external | external | true | node:child_process | 11 |
| `executeWithRecovery` | external | external | true | @pietgk/devac-core | 11 |
| `queryMultiplePackages` | external | external | true | @pietgk/devac-core | 11 |
| `path.basename` | external | external | true | node:path | 11 |
| `discoverContext` | external | external | true | @pietgk/devac-core | 9 |
| `path.dirname` | external | external | true | node:path | 8 |
| `discoverPackagesInRepo` | external | external | true | @pietgk/devac-core | 8 |
| `createSeedReader` | external | external | true | @pietgk/devac-core | 8 |
| `path.relative` | external | external | true | node:path | 7 |
| `fs.readFileSync` | external | external | true | node:fs | 7 |
| `CentralHub` | external | external | true | @pietgk/devac-core | 7 |
| `fs.readdirSync` | external | external | true | node:fs | 6 |
| `SeedReader` | external | external | true | @pietgk/devac-core | 6 |
| `setupQueryContext` | external | external | true | @pietgk/devac-core | 6 |
| `docNeedsRegeneration` | external | external | true | @pietgk/devac-core | 6 |
| `SeedWriter` | external | external | true | @pietgk/devac-core | 5 |
| `createLogger` | external | external | true | @pietgk/devac-core | 4 |
| `createRuleEngine` | external | external | true | @pietgk/devac-core | 4 |
| `fs.promises.readFile` | external | external | true | node:fs | 4 |
| `fs.readdir` | external | external | true | node:fs/promises | 3 |
| `glob` | external | external | true | glob | 3 |
| `generateC4Context` | external | external | true | @pietgk/devac-core | 3 |
| `fs.promises.access` | external | external | true | node:fs | 3 |
| `syncCIStatusToHub` | external | external | true | @pietgk/devac-core | 3 |
| `getCIStatusForContext` | external | external | true | @pietgk/devac-core | 3 |
| `findWorkspaceDir` | external | external | true | @pietgk/devac-core | 3 |
| `fs.mkdir` | external | external | true | node:fs/promises | 3 |
| `getWorkspaceStatus` | external | external | true | @pietgk/devac-core | 3 |
| `resetSemanticResolverFactory` | external | external | true | @pietgk/devac-core | 3 |
| `TypeScriptSemanticResolver.clearAllCaches` | external | external | true | @pietgk/devac-core | 3 |
| `shutdownDefaultPool` | external | external | true | @pietgk/devac-core | 3 |
| `fs.readFile` | external | external | true | node:fs/promises | 2 |
| `fs.mkdirSync` | external | external | true | node:fs | 2 |
| `fs.rmSync` | external | external | true | node:fs | 2 |
| `createSymbolAffectedAnalyzer` | external | external | true | @pietgk/devac-core | 2 |
| `TypeScriptParser` | external | external | true | @pietgk/devac-core | 2 |
| `fs.realpath` | external | external | true | node:fs/promises | 2 |
| `fs.writeFileSync` | external | external | true | node:fs | 2 |
| `generateC4Containers` | external | external | true | @pietgk/devac-core | 2 |
| `fs.unlink` | external | external | true | node:fs/promises | 2 |
| `fs.rm` | external | external | true | node:fs/promises | 2 |
| `gatherDiffs` | external | external | true | @pietgk/devac-core | 2 |
| `syncReviewsToHub` | external | external | true | @pietgk/devac-core | 2 |
| `getReviewsForContext` | external | external | true | @pietgk/devac-core | 2 |
| `syncIssuesToHub` | external | external | true | @pietgk/devac-core | 2 |
| `getIssuesForContext` | external | external | true | @pietgk/devac-core | 2 |
| `generateWorkspaceC4ContainersDoc` | external | external | true | @pietgk/devac-core | 2 |
| `generateWorkspaceC4ContextDoc` | external | external | true | @pietgk/devac-core | 2 |
| `getUnifiedRepoLikeC4FilePath` | external | external | true | @pietgk/devac-core | 2 |
| `aggregatePackageEffects` | external | external | true | @pietgk/devac-core | 2 |
| `getUnifiedLikeC4FilePath` | external | external | true | @pietgk/devac-core | 2 |
| `createEffectReader` | external | external | true | @pietgk/devac-core | 2 |
| `fs.promises.writeFile` | external | external | true | node:fs | 2 |
| `fs.promises.mkdir` | external | external | true | node:fs | 2 |
| `preprocessSql` | external | external | true | @pietgk/devac-core | 2 |
| `discoverWorkspace` | external | external | true | @pietgk/devac-core | 2 |
| `createWorkspaceManager` | external | external | true | @pietgk/devac-core | 2 |
| `setGlobalLogLevel` | external | external | true | @pietgk/devac-core | 2 |
| `getSocketPath` | external | external | true | @pietgk/devac-core | 1 |
| `net.createConnection` | external | external | true | node:net | 1 |
| `` | external | TODO | true | - | 1 |
| `fs.symlinkSync` | external | external | true | node:fs | 1 |
| `fs.readlinkSync` | external | external | true | node:fs | 1 |
| `fs.copyFileSync` | external | external | true | node:fs | 1 |
| `fs.lstatSync` | external | external | true | node:fs | 1 |
| `os.homedir` | external | external | true | node:os | 1 |
| `CSharpParser` | external | external | true | @pietgk/devac-core | 1 |
| `PythonParser` | external | external | true | @pietgk/devac-core | 1 |
| `discoverAllPackages` | external | external | true | @pietgk/devac-core | 1 |
| `computeFileHash` | external | external | true | @pietgk/devac-core | 1 |
| `getSemanticResolverFactory` | external | external | true | @pietgk/devac-core | 1 |
| `discoverDomainBoundaries` | external | external | true | @pietgk/devac-core | 1 |
| `exportContainersToPlantUML` | external | external | true | @pietgk/devac-core | 1 |
| `exportContextToPlantUML` | external | external | true | @pietgk/devac-core | 1 |
| `fs.stat` | external | external | true | node:fs/promises | 1 |
| `formatReviewAsMarkdown` | external | external | true | @pietgk/devac-core | 1 |
| `createSubIssues` | external | external | true | @pietgk/devac-core | 1 |
| `parseReviewResponse` | external | external | true | @pietgk/devac-core | 1 |
| `buildReviewPrompt` | external | external | true | @pietgk/devac-core | 1 |
| `formatReviews` | external | external | true | @pietgk/devac-core | 1 |
| `formatIssues` | external | external | true | @pietgk/devac-core | 1 |
| `formatCIStatus` | external | external | true | @pietgk/devac-core | 1 |
| `formatContext` | external | external | true | @pietgk/devac-core | 1 |
| `createCoverageValidator` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyUnifiedWorkspaceLikeC4` | external | external | true | @pietgk/devac-core | 1 |
| `generateUnifiedWorkspaceLikeC4` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyWorkspaceEffectsDoc` | external | external | true | @pietgk/devac-core | 1 |
| `generateWorkspaceEffectsDoc` | external | external | true | @pietgk/devac-core | 1 |
| `queryWorkspaceEffects` | external | external | true | @pietgk/devac-core | 1 |
| `computeWorkspaceSeedHash` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyUnifiedRepoLikeC4Doc` | external | external | true | @pietgk/devac-core | 1 |
| `generateUnifiedRepoLikeC4Doc` | external | external | true | @pietgk/devac-core | 1 |
| `generateAllRepoC4Docs` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyRepoEffectsDoc` | external | external | true | @pietgk/devac-core | 1 |
| `generateRepoEffectsDoc` | external | external | true | @pietgk/devac-core | 1 |
| `getRepoC4FilePaths` | external | external | true | @pietgk/devac-core | 1 |
| `computeRepoSeedHash` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyUnifiedLikeC4Doc` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyC4ContainersDoc` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyC4ContextDoc` | external | external | true | @pietgk/devac-core | 1 |
| `generateUnifiedLikeC4Doc` | external | external | true | @pietgk/devac-core | 1 |
| `generateAllC4Docs` | external | external | true | @pietgk/devac-core | 1 |
| `generateEmptyEffectsDoc` | external | external | true | @pietgk/devac-core | 1 |
| `generateEffectsDoc` | external | external | true | @pietgk/devac-core | 1 |
| `getC4FilePaths` | external | external | true | @pietgk/devac-core | 1 |
| `computeSeedHash` | external | external | true | @pietgk/devac-core | 1 |
| `hasSeed` | external | external | true | @pietgk/devac-core | 1 |
| `enrichDomainEffects` | external | external | true | @pietgk/devac-core | 1 |
| `buildInternalEdges` | external | external | true | @pietgk/devac-core | 1 |
| `buildNodeLookupMap` | external | external | true | @pietgk/devac-core | 1 |
| `findGitRoot` | external | external | true | @pietgk/devac-core | 1 |
| `createLintValidator` | external | external | true | @pietgk/devac-core | 1 |
| `buildPackageMap` | external | external | true | @pietgk/devac-core | 1 |
| `getRulesByProvider` | external | external | true | @pietgk/devac-core | 1 |
| `getRulesByDomain` | external | external | true | @pietgk/devac-core | 1 |
| `createTestValidator` | external | external | true | @pietgk/devac-core | 1 |
| `createTypecheckValidator` | external | external | true | @pietgk/devac-core | 1 |
| `pushValidationResultsToHub` | external | external | true | @pietgk/devac-core | 1 |
| `ValidationCoordinator` | external | external | true | @pietgk/devac-core | 1 |
| `fs.appendFile` | external | external | true | node:fs/promises | 1 |
| `formatCrossRepoNeed` | external | external | true | @pietgk/devac-core | 1 |
| `createCrossRepoDetector` | external | external | true | @pietgk/devac-core | 1 |
| `extractIssueNumber` | external | external | true | @pietgk/devac-core | 1 |
| `EventEmitter` | external | external | true | node:events | 1 |
| `createFileWatcher` | external | external | true | @pietgk/devac-core | 1 |
| `createRenameDetector` | external | external | true | @pietgk/devac-core | 1 |
| `createUpdateManager` | external | external | true | @pietgk/devac-core | 1 |
| `saveWorkspaceState` | external | external | true | @pietgk/devac-core | 1 |
| `coreFindWorkspaceHubDir` | external | external | true | @pietgk/devac-core | 1 |
| `Command` | external | external | true | commander | 1 |
| `defineConfig` | external | external | true | vitest/config | 1 |
| `afterAll` | external | external | true | vitest | 1 |
| `afterEach` | external | external | true | vitest | 1 |
| `beforeEach` | external | external | true | vitest | 1 |

## Other Patterns
<!-- Review these and categorize as needed -->
| Pattern | Method Call | Async | Count | Suggested Category |
|---------|-------------|-------|-------|-------------------|
| `lines.push` | yes | no | 423 | - |
| `option` | no | no | 292 | - |
| `console.log` | yes | no | 173 | ignore |
| `Date.now` | yes | no | 117 | - |
| `String` | no | no | 100 | - |
| `description` | no | no | 75 | - |
| `process.cwd` | yes | no | 69 | - |
| `action` | no | no | 69 | - |
| `process.exit` | yes | no | 66 | - |
| `formatOutput` | no | no | 63 | store? |
| `lower.includes` | yes | no | 59 | - |
| `JSON.stringify` | yes | no | 55 | - |
| `lines.join` | yes | no | 37 | - |
| `console.error` | yes | no | 37 | ignore |
| `Number.parseInt` | yes | no | 34 | - |
| `getWorkspaceHubDir` | no | yes | 31 | retrieve? |
| `program.command` | yes | no | 29 | - |
| `pool.shutdown` | yes | yes | 29 | - |
| `repeat` | no | no | 24 | - |
| `pool.initialize` | yes | yes | 23 | - |
| `git` | no | no | 23 | - |
| `join` | no | no | 21 | - |
| `result.filesWritten.push` | yes | no | 21 | - |
| `displayCommandResult` | no | no | 21 | - |
| `hub.close` | yes | yes | 19 | - |
| `hub.init` | yes | yes | 19 | - |
| `map` | no | no | 18 | - |
| `blockers.push` | yes | no | 12 | - |
| `errors.push` | yes | no | 12 | - |
| `workspace.command` | yes | no | 12 | - |
| _...and 672 more_ | | | | |

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| devac-cli | Container | typescript | - | TODO: Add description |
