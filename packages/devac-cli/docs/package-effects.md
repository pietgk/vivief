# Package Effects: @pietgk/devac-cli

<!--
  This file documents ALL effects in this package.
  Every FunctionCall is an effect - nothing is excluded.
  Use Group Type to filter when consuming (docs, diagrams).

  Run `devac effects verify` to check coverage.
  Run `devac effects sync` to generate extraction rules.
-->

## Metadata
- **Package:** @pietgk/devac-cli
- **Last Updated:** 2026-01-01
- **Total Patterns:** 509
- **Verified:** complete

## Effect Groups

Groups enable filtering at consumption time (docs, diagrams, audits):

| Group | Description | Patterns | Filter Use |
|-------|-------------|----------|------------|
| io:filesystem | File system operations | 24 | Architecture docs |
| io:database | DuckDB/seed operations | 47 | Data flow diagrams |
| workflow:hub | Hub federation | 31 | Workflow docs |
| workflow:context | Context discovery | 15 | Workflow docs |
| framework:cli | Commander.js patterns | 75 | Usually filtered |
| framework:test | Vitest patterns | 8 | Usually filtered |
| compute:format | Formatting functions | 35 | Usually filtered |
| compute:utility | Pure transformations | 89 | Usually filtered |
| logging:diagnostic | Console/logger output | 25 | Usually filtered |
| internal:state | Array/state mutations | 42 | Usually filtered |
| internal:control | Control flow patterns | 18 | Usually filtered |
| internal:app | Application-specific | 100+ | Context dependent |

---

## io:filesystem

File system operations - real I/O effects.

| Pattern | Count | Description |
|---------|-------|-------------|
| `fs.access` | 17 | Check file accessibility |
| `fs.readdir` | 2 | List directory contents |
| `fs.mkdir` | 2 | Create directory |
| `fs.rm` | 2 | Remove file/directory |
| `fs.stat` | 1 | Get file stats |
| `fs.writeFile` | 1 | Write file |
| `fs.appendFile` | 1 | Append to file |
| `fs.unlink` | 1 | Delete file |
| `fs.readFileSync` | 1 | Sync file read |
| `fs.existsSync` | 3 | Check file exists |
| `glob` | 3 | Find files by pattern |
| `readFile` | 1 | Read file async |
| `path.join` | 46 | Path construction |
| `path.resolve` | 40 | Resolve absolute path |
| `path.dirname` | 6 | Get directory name |
| `path.basename` | 4 | Get file name |
| `path.relative` | 1 | Get relative path |

---

## io:database

Database and seed operations.

| Pattern | Count | Description |
|---------|-------|-------------|
| `DuckDBPool` | 17 | Connection pool constructor |
| `pool.initialize` | 16 | Initialize pool |
| `pool.shutdown` | 17 | Shutdown pool |
| `conn.run` | 4 | Execute SQL |
| `conn.all` | 3 | Query all rows |
| `executeWithRecovery` | 4 | Query with retry |
| `SeedReader` | 6 | Seed reader constructor |
| `SeedWriter` | 5 | Seed writer constructor |
| `createSeedReader` | 6 | Create seed reader |
| `seedReader.querySeeds` | 7 | Query seeds |
| `seedReader.getEdgesByTarget` | 2 | Get incoming edges |
| `seedReader.getEdgesBySource` | 2 | Get outgoing edges |
| `seedReader.getNodesByFile` | 1 | Get nodes in file |
| `writer.writeFile` | 4 | Write seed file |
| `writer.updateResolvedRefs` | 1 | Update resolved refs |
| `reader.getExternalRefsByFile` | 1 | Get external refs |
| `reader.getFileHashes` | 1 | Get file hashes |
| `reader.getUnresolvedRefs` | 1 | Get unresolved refs |
| `reader.validateIntegrity` | 1 | Validate seed integrity |
| `queryMultiplePackages` | 6 | Cross-package query |

---

## workflow:hub

Hub federation operations.

| Pattern | Count | Description |
|---------|-------|-------------|
| `hub.init` | 22 | Initialize hub connection |
| `hub.close` | 22 | Close hub connection |
| `createCentralHub` | 16 | Create central hub |
| `CentralHub` | 6 | Hub constructor |
| `hub.listRepos` | 8 | List registered repos |
| `hub.registerRepo` | 2 | Register repository |
| `hub.unregisterRepo` | 1 | Unregister repository |
| `hub.refreshRepo` | 1 | Refresh single repo |
| `hub.refreshAll` | 1 | Refresh all repos |
| `hub.getStatus` | 1 | Get hub status |
| `hub.getDiagnostics` | 2 | Get diagnostics |
| `hub.getDiagnosticsSummary` | 1 | Get summary |
| `hub.getDiagnosticsCounts` | 1 | Get counts |
| `hub.getValidationErrors` | 1 | Get validation errors |
| `hub.getValidationCounts` | 1 | Get validation counts |
| `hub.getValidationSummary` | 1 | Get validation summary |
| `syncCIStatusToHub` | 2 | Sync CI status |
| `syncIssuesToHub` | 2 | Sync GitHub issues |
| `syncReviewsToHub` | 2 | Sync PR reviews |
| `pushValidationResultsToHub` | 1 | Push validation results |
| `hubInit` | 1 | Hub init command |
| `hubStatus` | 1 | Hub status command |
| `hubList` | 2 | Hub list command |
| `hubRegister` | 2 | Hub register command |
| `hubUnregister` | 2 | Hub unregister command |
| `hubRefresh` | 2 | Hub refresh command |
| `hubSyncCommand` | 2 | Hub sync command |
| `hubQueryCommand` | 1 | Hub query command |
| `hubDiagnosticsCommand` | 2 | Hub diagnostics command |
| `hubSummaryCommand` | 1 | Hub summary command |
| `hubErrorsCommand` | 1 | Hub errors command |

---

## workflow:context

Context discovery and workspace operations.

| Pattern | Count | Description |
|---------|-------|-------------|
| `discoverContext` | 8 | Discover workspace context |
| `discoverWorkspace` | 1 | Discover workspace |
| `discoverPackagesInRepo` | 3 | Find packages in repo |
| `discoverAllPackages` | 1 | Find all packages |
| `findWorkspaceDir` | 1 | Find workspace directory |
| `isWorkspaceDirectory` | 2 | Check if workspace |
| `isGitRepo` | 1 | Check if git repo |
| `getDefaultHubDir` | 24 | Get default hub directory |
| `getWorkspaceHubDir` | 10 | Get workspace hub dir |
| `detectWorktreeInfo` | 1 | Detect worktree info |
| `extractIssueNumber` | 1 | Extract issue from branch |
| `getCIStatusForContext` | 2 | Get CI status |
| `getIssuesForContext` | 2 | Get issues for context |
| `getReviewsForContext` | 2 | Get reviews for context |

---

## framework:cli

Commander.js CLI framework patterns.

| Pattern | Count | Description |
|---------|-------|-------------|
| `option` | 204 | CLI option definition |
| `description` | 49 | CLI description |
| `action` | 46 | CLI action handler |
| `program.command` | 22 | Command definition |
| `program.name` | 1 | Program name |
| `program.parse` | 1 | Parse arguments |
| `program.help` | 1 | Show help |
| `program.action` | 1 | Default action |
| `alias` | 4 | Command alias |
| `version` | 1 | Version info |
| `hook` | 1 | Command hook |
| `workspace.command` | 12 | Workspace subcommand |
| `hub.command` | 11 | Hub subcommand |
| `context.command` | 3 | Context subcommand |
| `registerStatusCommand` | 1 | Register status |
| `registerAnalyzeCommand` | 1 | Register analyze |
| `registerQueryCommand` | 1 | Register query |
| `registerVerifyCommand` | 1 | Register verify |
| `registerCleanCommand` | 1 | Register clean |
| `registerWatchCommand` | 1 | Register watch |
| `registerTypecheckCommand` | 1 | Register typecheck |
| `registerLintCommand` | 1 | Register lint |
| `registerTestCommand` | 1 | Register test |
| `registerCoverageCommand` | 1 | Register coverage |
| `registerValidateCommand` | 1 | Register validate |
| `registerAffectedCommand` | 1 | Register affected |
| `registerFindSymbolCommand` | 1 | Register find-symbol |
| `registerDepsCommand` | 1 | Register deps |
| `registerDependentsCommand` | 1 | Register dependents |
| `registerFileSymbolsCommand` | 1 | Register file-symbols |
| `registerCallGraphCommand` | 1 | Register call-graph |
| `registerContextCommand` | 1 | Register context |
| `registerMcpCommand` | 1 | Register mcp |
| `registerHubCommand` | 1 | Register hub |
| `registerWorkspaceCommand` | 1 | Register workspace |
| `registerDiagnosticsCommand` | 1 | Register diagnostics |

---

## framework:test

Test framework patterns (Vitest).

| Pattern | Count | Description |
|---------|-------|-------------|
| `beforeEach` | 1 | Before each test |
| `afterEach` | 1 | After each test |
| `afterAll` | 1 | After all tests |
| `defineConfig` | 1 | Vitest config |
| `shutdownDefaultPool` | 3 | Test cleanup |
| `TypeScriptSemanticResolver.clearAllCaches` | 3 | Clear caches |
| `resetSemanticResolverFactory` | 3 | Reset factory |

---

## logging:diagnostic

Logging and diagnostic output.

| Pattern | Count | Description |
|---------|-------|-------------|
| `console.log` | 155 | Info logging |
| `console.error` | 30 | Error logging |
| `logger.debug` | 8 | Debug logging |
| `logger.verbose` | 5 | Verbose logging |
| `logger.warn` | 3 | Warning logging |
| `this.logger.info` | 7 | Instance info |
| `this.logger.debug` | 6 | Instance debug |
| `this.logger.warn` | 6 | Instance warning |
| `this.logger.error` | 2 | Instance error |
| `allLogger.info` | 5 | All packages info |
| `allLogger.warn` | 2 | All packages warning |
| `createLogger` | 4 | Create logger |

---

## compute:format

Formatting and display functions.

| Pattern | Count | Description |
|---------|-------|-------------|
| `formatOutput` | 31 | Format CLI output |
| `displayCommandResult` | 21 | Display result |
| `formatMetric` | 4 | Format metrics |
| `formatValidationIssues` | 3 | Format issues |
| `formatDependencies` | 2 | Format deps |
| `formatSymbols` | 2 | Format symbols |
| `formatSummary` | 1 | Format summary |
| `formatBrief` | 1 | Brief format |
| `formatFull` | 1 | Full format |
| `formatOneLine` | 1 | One-line format |
| `formatInfo` | 1 | Format info |
| `formatContext` | 1 | Format context |
| `formatQueryResults` | 1 | Format query |
| `formatCoverageSummary` | 1 | Format coverage |
| `formatFilesBelowThreshold` | 1 | Format low coverage |
| `formatCallGraph` | 1 | Format call graph |
| `formatDiagnostics` | 1 | Format diagnostics |
| `formatCIStatus` | 1 | Format CI status |
| `formatIssues` | 1 | Format issues |
| `formatReviews` | 1 | Format reviews |
| `formatSyncResult` | 1 | Format sync result |
| `formatIssueSyncResult` | 1 | Format issue sync |
| `formatReviewSyncResult` | 1 | Format review sync |
| `formatReviewAsMarkdown` | 1 | Format review MD |
| `formatReviewPromptOutput` | 1 | Format prompt |
| `formatCrossRepoNeed` | 1 | Format cross-repo |
| `formatAsTable` | 1 | Table format |
| `formatAsCsv` | 1 | CSV format |
| `formatBytes` | 1 | Format bytes |
| `escapeCsvField` | 1 | Escape CSV |

---

## compute:utility

Pure transformation utilities.

| Pattern | Count | Description |
|---------|-------|-------------|
| `Date.now` | 73 | Get timestamp |
| `String` | 72 | String constructor |
| `JSON.stringify` | 30 | JSON encode |
| `Number.parseInt` | 20 | Parse integer |
| `Number.parseFloat` | 4 | Parse float |
| `repeat` | 14 | Repeat string |
| `Error` | 13 | Error constructor |
| `os.homedir` | 13 | Home directory |
| `join` | 12 | Join strings |
| `Map` | 7 | Map constructor |
| `Symbol` | 4 | Symbol constructor |
| `Object.keys` | 4 | Object keys |
| `Math.max` | 4 | Maximum |
| `Math.min` | 3 | Minimum |
| `Math.log` | 2 | Logarithm |
| `Math.floor` | 1 | Floor |
| `Math.sqrt` | 1 | Square root |
| `Set` | 4 | Set constructor |
| `Date` | 4 | Date constructor |
| `toISOString` | 4 | ISO date string |
| `Array.isArray` | 3 | Check array |
| `Array.from` | 2 | Array from iterable |
| `Promise` | 2 | Promise constructor |
| `setTimeout` | 2 | Set timeout |
| `Buffer.from` | 2 | Buffer from |
| `Object.defineProperty` | 2 | Define property |
| `Reflect.defineMetadata` | 2 | Define metadata |
| `Reflect.getMetadata` | 1 | Get metadata |
| `parseInt` | 1 | Parse int |
| `toLowerCase` | 1 | Lowercase |
| `trim` | 1 | Trim whitespace |
| `replace` | 1 | String replace |
| `slice` | 2 | Array slice |
| `reverse` | 1 | Array reverse |
| `map` | 2 | Array map |

---

## internal:state

Array and state mutation operations.

| Pattern | Count | Description |
|---------|-------|-------------|
| `lines.push` | 143 | Collect output lines |
| `lines.join` | 21 | Join lines |
| `errors.push` | 9 | Collect errors |
| `errors.join` | 2 | Join errors |
| `result.next.push` | 7 | Build result |
| `parts.push` | 7 | Build parts |
| `diagParts.push` | 7 | Build diagnostics |
| `details.push` | 5 | Build details |
| `healthParts.push` | 4 | Build health |
| `files.push` | 3 | Collect files |
| `widths.set` | 3 | Set column width |
| `widths.get` | 3 | Get column width |
| `activityParts.push` | 2 | Build activity |
| `this.items.push` | 1 | Add item |
| `result.push` | 1 | Add to result |
| `arr.push` | 1 | Array push |
| `allNodesPaths.push` | 1 | Collect paths |
| `allEdgesPaths.push` | 1 | Collect paths |
| `allRefsPaths.push` | 1 | Collect paths |
| `allEffectsPaths.push` | 1 | Collect paths |

---

## internal:control

Control flow and process operations.

| Pattern | Count | Description |
|---------|-------|-------------|
| `process.exit` | 39 | Exit process |
| `process.cwd` | 38 | Current directory |
| `process.on` | 3 | Process event |
| `catch` | 11 | Error catch |
| `then` | 10 | Promise then |
| `super` | 5 | Super call |
| `this.setState` | 3 | Set state |
| `thisCommand.optsWithGlobals` | 1 | Get options |
| `setGlobalLogLevel` | 2 | Set log level |
| `getSuggestion` | 1 | Get suggestion |
| `error` | 1 | Error handler |

---

## internal:app

Application-specific patterns - method calls on local variables and app-specific functions.

| Pattern | Count | Description |
|---------|-------|-------------|
| `lower.includes` | 12 | String includes check |
| `options.entityId.replace` | 8 | Replace entity ID |
| `columns.map` | 6 | Map columns |
| `manager.dispose` | 5 | Dispose manager |
| `headers.map` | 5 | Map headers |
| `repos.map` | 5 | Map repositories |
| `getWidth` | 4 | Get column width |
| `createErrorResult` | 4 | Create error result |
| `result.issues.filter` | 4 | Filter result issues |
| `options.kind.replace` | 4 | Replace kind option |
| `parser.parse` | 4 | Parse input |
| `options.edgeType.replace` | 4 | Replace edge type |
| `validator.validate` | 4 | Run validation |
| `syncResult.errors.join` | 3 | Join sync errors |
| `this.emitter.emit` | 3 | Emit event |
| `Throttle` | 3 | Throttle decorator |
| `toString` | 3 | Convert to string |
| `value.includes` | 3 | Value includes check |
| `originalMethod.apply` | 3 | Apply original method |
| `getReviewsForContext` | 2 | Get reviews for context |
| `mcpCommand` | 2 | MCP command |
| `email.includes` | 2 | Email includes check |
| `Buffer.from` | 2 | Create buffer |
| `TypeScriptParser` | 2 | TypeScript parser |
| `entry.isDirectory` | 2 | Check if directory |
| `cleanTempFiles` | 2 | Clean temp files |
| `map` | 2 | Array map |
| `contextCICommand` | 2 | Context CI command |
| `options.name.replace` | 2 | Replace name option |
| `activityParts.push` | 2 | Push activity part |
| `preprocessErrors.join` | 2 | Join preprocess errors |
| `Array.from` | 2 | Array from |
| `errors.join` | 2 | Join errors |
| `syncReviewsToHub` | 2 | Sync reviews to hub |
| `findTypeScriptFiles` | 2 | Find TS files |
| `groupBy` | 2 | Group by function |
| `createWorkspaceManager` | 2 | Create workspace manager |
| `event.refreshedRepos.join` | 2 | Join refreshed repos |
| `allLogger.warn` | 2 | Logger warning |
| `hubSyncCommand` | 2 | Hub sync command |
| `hub.getDiagnostics` | 2 | Get diagnostics |
| `setTimeout` | 2 | Set timeout |
| `parts.slice` | 2 | Slice parts |
| `hub.registerRepo` | 2 | Register repository |
| `Object.defineProperty` | 2 | Define property |
| `contextReviewCommand` | 2 | Context review command |
| `hubList` | 2 | Hub list command |
| `hubUnregister` | 2 | Hub unregister command |
| `this.logger.error` | 2 | Logger error |
| `useCallback` | 2 | React useCallback |
| `Reflect.defineMetadata` | 2 | Define metadata |
| `hubDiagnosticsCommand` | 2 | Hub diagnostics command |
| `syncIssuesToHub` | 2 | Sync issues to hub |
| `analyzer.analyzeFileChanges` | 2 | Analyze file changes |
| `preprocessSql` | 2 | Preprocess SQL |
| `manager.initialize` | 2 | Initialize manager |
| `getCIStatusForContext` | 2 | Get CI status |
| `runSemanticResolution` | 2 | Run semantic resolution |
| `statusCommand` | 2 | Status command |
| `Promise` | 2 | Promise constructor |
| `slice` | 2 | Array slice |
| `col.padEnd` | 2 | Pad column end |
| `hubRegister` | 2 | Hub register command |
| `getIssuesForContext` | 2 | Get issues for context |
| `padStart` | 2 | Pad string start |
| `setCount` | 2 | Set count |
| `entry.isFile` | 2 | Check if file |
| `gatherDiffs` | 2 | Gather diffs |
| `entry.name.endsWith` | 2 | Check name ends with |
| `options.filePath.replace` | 2 | Replace file path |
| `createSymbolAffectedAnalyzer` | 2 | Create symbol analyzer |
| `Math.log` | 2 | Math logarithm |
| `hubRefresh` | 2 | Hub refresh command |
| `packageMap.set` | 2 | Set package map |
| `controller.on` | 2 | Controller event |
| `countFilesAndSize` | 2 | Count files and size |
| `toFixed` | 2 | Number toFixed |
| `isWorkspaceDirectory` | 2 | Check workspace dir |
| `syncCIStatusToHub` | 2 | Sync CI status |
| `items.map` | 2 | Map items |
| `analyzeCommand` | 2 | Analyze command |
| `diagParts.join` | 2 | Join diagnostic parts |
| `Result` | 2 | Result constructor |
| `useState` | 2 | React useState |
| `healthParts.join` | 2 | Join health parts |
| `contextIssuesCommand` | 2 | Context issues command |
| `executeGetDependencies` | 1 | Execute get deps |
| `event.errors.join` | 1 | Join event errors |
| `escapeCsvField` | 1 | Escape CSV field |
| `createSubIssues` | 1 | Create sub-issues |
| `name.replace` | 1 | Replace name |
| `registerDiagnosticsCommand` | 1 | Register diagnostics |
| `registerWorkspaceCommand` | 1 | Register workspace |
| `dependentsCommand` | 1 | Dependents command |
| `formatReviewPromptOutput` | 1 | Format review prompt |
| `this.renameDetector.processEventBatch` | 1 | Process event batch |
| `head.replace` | 1 | Replace head |
| `trim` | 1 | String trim |
| `coordinator.validateQuick` | 1 | Quick validation |
| `reader.validateIntegrity` | 1 | Validate integrity |
| `existingHashes.get` | 1 | Get existing hash |
| `CSharpParser` | 1 | C# parser |
| `affectedCommand` | 1 | Affected command |
| `URLSearchParams` | 1 | URL search params |
| `buildUrl` | 1 | Build URL |
| `this.plugins.set` | 1 | Set plugin |
| `result.push` | 1 | Push result |
| `fns.reduce` | 1 | Reduce functions |
| `this.writeNotification` | 1 | Write notification |
| `this.log` | 1 | Instance log |
| `this.initializeCrossRepoDetection` | 1 | Init cross-repo detection |
| `this.users.push` | 1 | Push user |
| `decorators.reduceRight` | 1 | Reduce decorators |
| `this.users.get` | 1 | Get user |
| `keyExtractor` | 1 | Key extractor |
| `contextCommand` | 1 | Context command |
| `this.props.render` | 1 | Render props |
| `errorText.toLowerCase` | 1 | Lowercase error text |
| `hubInit` | 1 | Hub init command |
| `workspaceStatus` | 1 | Workspace status |
| `workspaceWatch` | 1 | Workspace watch |
| `rows.reduce` | 1 | Reduce rows |
| `allEdgesPaths.join` | 1 | Join edges paths |
| `edgesPath.replace` | 1 | Replace edges path |
| `createUpdateManager` | 1 | Create update manager |
| `this.setupEventHandlers` | 1 | Setup event handlers |
| `this.updateManager.dispose` | 1 | Dispose update manager |
| `this.renameDetector.clearPending` | 1 | Clear pending renames |
| `this.emitter.off` | 1 | Remove event listener |
| `hub.getValidationCounts` | 1 | Get validation counts |
| `hub.getValidationSummary` | 1 | Get validation summary |
| `this.readerPool.initialize` | 1 | Initialize reader pool |
| `createCrossRepoDetector` | 1 | Create cross-repo detector |
| `this.crossRepoDetector.analyzeExternalRefs` | 1 | Analyze external refs |
| `event.symbols.join` | 1 | Join symbols |
| `controller.stop` | 1 | Stop controller |
| `buildConfigOverrides` | 1 | Build config overrides |
| `hub.unregisterRepo` | 1 | Unregister repository |
| `validateCommand` | 1 | Validate command |
| `formatOneLine` | 1 | Format one line |
| `queryCommand` | 1 | Query command |
| `getSeverityIcon` | 1 | Get severity icon |
| `toLowerCase` | 1 | Lowercase string |
| `uniquePackagePaths.add` | 1 | Add unique path |
| `effectsPath.replace` | 1 | Replace effects path |
| `widths.map` | 1 | Map widths |
| `hub.getValidationErrors` | 1 | Get validation errors |
| `kind.toLowerCase` | 1 | Lowercase kind |
| `files.filter` | 1 | Filter files |
| `belowThreshold.sort` | 1 | Sort below threshold |
| `file.lines.toFixed` | 1 | Format file lines |
| `buildReviewPrompt` | 1 | Build review prompt |
| `createResults.filter` | 1 | Filter create results |
| `parseReviewResponse` | 1 | Parse review response |
| `cleanCommand` | 1 | Clean command |
| `formatBytes` | 1 | Format bytes |
| `formatCallGraph` | 1 | Format call graph |
| `reader.getUnresolvedRefs` | 1 | Get unresolved refs |
| `factory.getResolver` | 1 | Get resolver |
| `PythonParser` | 1 | Python parser |
| `issuePattern.test` | 1 | Test issue pattern |
| `innerFunction` | 1 | Inner function |
| `this.values.includes` | 1 | Values includes |
| `registerMcpCommand` | 1 | Register MCP |
| `applyConfigOverrides` | 1 | Apply config overrides |
| `React.useContext` | 1 | React useContext |
| `useMemo` | 1 | React useMemo |
| `React.forwardRef` | 1 | React forwardRef |
| `path.relative` | 1 | Relative path |
| `substring` | 1 | Get substring |
| `this.updateManager.processRename` | 1 | Process rename |
| `React.createContext` | 1 | Create context |
| `renderItem` | 1 | Render item |
| `this.users.forEach` | 1 | Iterate users |
| `compose` | 1 | Compose functions |
| `Reflect.getMetadata` | 1 | Get metadata |
| `EventEmitter` | 1 | Event emitter |
| `this.checkNeedsInitialAnalysis` | 1 | Check needs analysis |
| `this.context.repos.filter` | 1 | Filter context repos |
| `reader.getExternalRefsByFile` | 1 | Get external refs |
| `testCommand` | 1 | Test command |
| `circle.setColor` | 1 | Set circle color |
| `AsyncConnection` | 1 | Async connection |
| `parts.join` | 1 | Join parts |
| `this.items.findIndex` | 1 | Find item index |
| `contextResult.warnings.join` | 1 | Join warnings |
| `create` | 1 | Create function |
| `formatInfo` | 1 | Format info |
| `findCSharpFiles` | 1 | Find C# files |
| `sourceFiles.includes` | 1 | Source includes |
| `existingHashes.keys` | 1 | Get hash keys |
| `kind.replace` | 1 | Replace kind |
| `sql.trim` | 1 | Trim SQL |
| `result.controller.getTools` | 1 | Get controller tools |
| `reader.getFileHashes` | 1 | Get file hashes |
| `Math.floor` | 1 | Math floor |
| `hub.getStatus` | 1 | Get hub status |
| `nodesPath.replace` | 1 | Replace nodes path |
| `refsPath.replace` | 1 | Replace refs path |
| `strValue.slice` | 1 | Slice string value |
| `registerContextCommand` | 1 | Register context |
| `belowThreshold.slice` | 1 | Slice below threshold |
| `formatReviewSyncResult` | 1 | Format review sync |
| `analyzeAllPackages` | 1 | Analyze all packages |
| `getSemanticResolverFactory` | 1 | Get resolver factory |
| `formatContext` | 1 | Format context |
| `discoverAllPackages` | 1 | Discover all packages |
| `this.items.push` | 1 | Push item |
| `this.items.find` | 1 | Find item |
| `parseInt` | 1 | Parse integer |
| `DatabaseConnection` | 1 | Database connection |
| `super.validate` | 1 | Super validate |
| `Circle` | 1 | Circle constructor |
| `createTuple` | 1 | Create tuple |
| `decorator` | 1 | Decorator function |
| `padEnd` | 1 | Pad string end |
| `fileURLToPath` | 1 | File URL to path |
| `thisCommand.optsWithGlobals` | 1 | Get global options |
| `map.get` | 1 | Map get |
| `arr.push` | 1 | Array push |
| `executeGetDependents` | 1 | Execute get dependents |
| `lintCommand` | 1 | Lint command |
| `formatSummary` | 1 | Format summary |
| `allEdgesPaths.push` | 1 | Push edges path |
| `allNodesPaths.join` | 1 | Join nodes paths |
| `rows.map` | 1 | Map rows |
| `hubErrorsCommand` | 1 | Hub errors command |
| `findSymbolCommand` | 1 | Find symbol command |
| `fileSymbolsCommand` | 1 | File symbols command |
| `diagnosticsCommand` | 1 | Diagnostics command |
| `createCoverageValidator` | 1 | Create coverage validator |
| `formatCoverageSummary` | 1 | Format coverage summary |
| `formatFilesBelowThreshold` | 1 | Format files below threshold |
| `formatIssueSyncResult` | 1 | Format issue sync |
| `formatReviewAsMarkdown` | 1 | Format review markdown |
| `unresolvedRefs.map` | 1 | Map unresolved refs |
| `resolver.resolvePackage` | 1 | Resolve package |
| `analyzeSinglePackage` | 1 | Analyze single package |
| `reverse` | 1 | Array reverse |
| `this.items.get` | 1 | Get item |
| `items.forEach` | 1 | Iterate items |
| `connection.connect` | 1 | Connect |
| `TypeError` | 1 | Type error |
| `registerCleanCommand` | 1 | Register clean |
| `cells.join` | 1 | Join cells |
| `value.replace` | 1 | Replace value |
| `findRepoRoot` | 1 | Find repo root |
| `manager.getStats` | 1 | Get manager stats |
| `formatFull` | 1 | Format full |
| `getCurrentBranch` | 1 | Get current branch |
| `result.next.forEach` | 1 | Iterate next results |
| `saveWorkspaceState` | 1 | Save workspace state |
| `nextAction.toLowerCase` | 1 | Lowercase next action |
| `createFileWatcher` | 1 | Create file watcher |
| `dirName.split` | 1 | Split directory name |
| `createTestValidator` | 1 | Create test validator |
| `watchCommand` | 1 | Watch command |
| `coordinator.validateFull` | 1 | Full validation |
| `pushValidationResultsToHub` | 1 | Push validation results |
| `head.slice` | 1 | Slice head |
| `createTypecheckValidator` | 1 | Create typecheck validator |
| `setupQueryContext` | 1 | Setup query context |
| `formatAsTable` | 1 | Format as table |
| `values.join` | 1 | Join values |
| `WatchControllerImpl` | 1 | Watch controller impl |
| `value.padEnd` | 1 | Pad value end |
| `formatCrossRepoNeed` | 1 | Format cross-repo need |
| `severity.toUpperCase` | 1 | Uppercase severity |
| `map.set` | 1 | Map set |
| `createLintValidator` | 1 | Create lint validator |
| `this.fileWatcher.start` | 1 | Start file watcher |
| `createRenameDetector` | 1 | Create rename detector |
| `hub.getDiagnosticsCounts` | 1 | Get diagnostics counts |
| `hub.refreshAll` | 1 | Refresh all |
| `allNodesPaths.push` | 1 | Push nodes path |
| `allEffectsPaths.push` | 1 | Push effects path |
| `allEffectsPaths.join` | 1 | Join effects paths |
| `hubQueryCommand` | 1 | Hub query command |
| `errors.map` | 1 | Map errors |
| `formatDiagnostics` | 1 | Format diagnostics |
| `depsCommand` | 1 | Deps command |
| `logEvent` | 1 | Log event |
| `formatSyncResult` | 1 | Format sync result |
| `manager.on` | 1 | Manager event |
| `isGitRepo` | 1 | Check if git repo |
| `callGraphCommand` | 1 | Call graph command |
| `registerCallGraphCommand` | 1 | Register call graph |
| `registerFindSymbolCommand` | 1 | Register find symbol |
| `computeFileHash` | 1 | Compute file hash |
| `registerCoverageCommand` | 1 | Register coverage |
| `analyzePythonPackage` | 1 | Analyze Python package |
| `findPythonFiles` | 1 | Find Python files |
| `result.affectedFiles.map` | 1 | Map affected files |
| `Math.sqrt` | 1 | Math sqrt |
| `Album` | 1 | Album constructor |
| `this.items.set` | 1 | Set item |
| `this.connectionPool.set` | 1 | Set connection pool |
| `this.connectionPool.get` | 1 | Get connection pool |
| `FileHandle` | 1 | File handle |
| `file.read` | 1 | Read file |
| `value.every` | 1 | Value every |
| `registerQueryCommand` | 1 | Register query |
| `validator` | 1 | Validator function |
| `requiredParams.push` | 1 | Push required param |
| `fetch` | 1 | Fetch function |
| `r.json` | 1 | Response JSON |
| `UserService` | 1 | User service |
| `user.email.includes` | 1 | User email includes |
| `source.toUpperCase` | 1 | Uppercase source |
| `executeQuerySql` | 1 | Execute SQL query |
| `replace` | 1 | String replace |
| `activityParts.join` | 1 | Join activity parts |
| `detectWorktreeInfo` | 1 | Detect worktree info |
| `formatBrief` | 1 | Format brief |
| `buildPackageMap` | 1 | Build package map |
| `h.padEnd` | 1 | Pad header end |
| `executeGetAffected` | 1 | Execute get affected |
| `registerStatusCommand` | 1 | Register status |
| `registerTestCommand` | 1 | Register test |
| `ValidationCoordinator` | 1 | Validation coordinator |
| `allRefsPaths.push` | 1 | Push refs path |
| `formatQueryResults` | 1 | Format query results |
| `strValue.padEnd` | 1 | Pad string value end |
| `controller.initialize` | 1 | Initialize controller |
| `hubSummaryCommand` | 1 | Hub summary command |
| `this.readerPool.shutdown` | 1 | Shutdown reader pool |
| `value.toFixed` | 1 | Value toFixed |
| `coverageCommand` | 1 | Coverage command |
| `formatCIStatus` | 1 | Format CI status |
| `formatIssues` | 1 | Format issues |
| `workspaceInit` | 1 | Workspace init |
| `checkForChanges` | 1 | Check for changes |
| `manager.startWatch` | 1 | Start watch |
| `resolver.isAvailable` | 1 | Check resolver available |
| `result.resolvedRefs.map` | 1 | Map resolved refs |
| `registerFileSymbolsCommand` | 1 | Register file symbols |
| `analyzeCSharpPackage` | 1 | Analyze C# package |
| `result.changedSymbols.map` | 1 | Map changed symbols |
| `value.toUpperCase` | 1 | Value uppercase |
| `registerAffectedCommand` | 1 | Register affected |
| `registerAnalyzeCommand` | 1 | Register analyze |
| `Entity` | 1 | Entity constructor |
| `setIsEven` | 1 | Set is even |
| `useEffect` | 1 | React useEffect |
| `this.fileWatcher.on` | 1 | File watcher event |
| `this.updateManager.processFileChange` | 1 | Process file change |
| `this.checkForCrossRepoNeeds` | 1 | Check cross-repo needs |
| `extractIssueNumber` | 1 | Extract issue number |
| `controller.getStatus` | 1 | Get controller status |
| `verifyCommand` | 1 | Verify command |
| `typecheckCommand` | 1 | Typecheck command |
| `head.startsWith` | 1 | Head starts with |
| `isWatchActive` | 1 | Check watch active |
| `formatAsCsv` | 1 | Format as CSV |
| `registerLintCommand` | 1 | Register lint |
| `this.fileWatcher.stop` | 1 | Stop file watcher |
| `info.repos.map` | 1 | Map info repos |
| `bySeverity.get` | 1 | Get by severity |
| `getKindIcon` | 1 | Get kind icon |
| `keyFn` | 1 | Key function |
| `executeFindSymbol` | 1 | Execute find symbol |
| `trimmedSql.startsWith` | 1 | Trimmed SQL starts with |
| `createMCPController` | 1 | Create MCP controller |
| `hub.getDiagnosticsSummary` | 1 | Get diagnostics summary |
| `details.join` | 1 | Join details |
| `hub.refreshRepo` | 1 | Refresh repository |
| `allRefsPaths.join` | 1 | Join refs paths |
| `hubStatus` | 1 | Hub status command |
| `name.padEnd` | 1 | Pad name end |
| `formatReviews` | 1 | Format reviews |
| `analyzeTypeScriptPackage` | 1 | Analyze TypeScript |
| `plugin.install` | 1 | Install plugin |
| `this.items.entries` | 1 | Get item entries |
| `this.items.splice` | 1 | Splice items |
| `fn` | 1 | Function call |
| `this.connectionPool.has` | 1 | Check connection pool |
| `connection.query` | 1 | Query connection |
| `Validate` | 1 | Validate decorator |
| `this.data.reduce` | 1 | Reduce data |
| `registerDepsCommand` | 1 | Register deps |
| `discoverWorkspace` | 1 | Discover workspace |
| `findWorkspaceDir` | 1 | Find workspace dir |
| `registerHubCommand` | 1 | Register hub |
| `registerWatchCommand` | 1 | Register watch |
| `this.emitter.on` | 1 | Emitter on event |
| `Injectable` | 3 | Injectable decorator |
| `factory.detectPackageLanguage` | 1 | Detect package language |
| `Command` | 1 | Commander Command |
| `issuePattern.test` | 1 | Test issue pattern |

---

## Groups

Architectural grouping for C4 diagrams.

| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| @pietgk/devac-cli | Container | typescript | vivief | Command-line interface |
| commands | Component | typescript | @pietgk/devac-cli | CLI commands |
| hub | Component | typescript | @pietgk/devac-cli | Hub federation |
| workspace | Component | typescript | @pietgk/devac-cli | Workspace management |
| context | Component | typescript | @pietgk/devac-cli | Context discovery |
| utils | Component | typescript | @pietgk/devac-cli | Utility functions |
