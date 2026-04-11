# DevAC Issue-Hub & Total Flow Enhancement Plan (v2)

## Design Decisions (Confirmed)

1. **Command name:** `devac context`
2. **Discovery scope:** Sibling directories in same parent (convention)
3. **LLM review:** Both modes - default markdown output, opt-in `--create-sub-issues`
4. **State management:** MCP server in-memory + DuckDB temp tables (no JSON files)
5. **CI status:** Wrap `gh` CLI
6. **Avoid:** JSON state files that need syncing
7. **NEW: Unified worktree + context** - integrate devac-worktree into the context concept

---

## Context Discovery Rules (Refined)

### Rule 1: Always Include Siblings
Context = current repo + all sibling repos in parent directory

### Rule 2: Issue Grouping (when in worktree)
When cwd matches `{repo}-{issue#}-{slug}`:
- Group all worktrees with same issue number
- Include their corresponding main repos

### Examples

**Example A: In a regular repo**
```
~/projects/
  ├── api/          ← cwd
  ├── web/
  └── shared/
  
Context: [api, web, shared]
```

**Example B: In an issue worktree**
```
~/projects/
  ├── api-123-auth/     ← cwd (issue 123)
  ├── web-123-auth/     (issue 123)
  ├── api/              (main)
  ├── web/              (main)
  └── shared/           (sibling)
  
Context: {
  issueNumber: 123,
  worktrees: [api-123-auth, web-123-auth],
  mainRepos: [api, web],
  siblings: [shared]
}
```

---

## Unified Workflow: devac-worktree + context

### Current devac-worktree Commands

| Command | Description |
|---------|-------------|
| `start <issue>` | Create worktree, install deps, launch Claude |
| `list` | List active worktrees |
| `status` | Show worktrees + issue/PR state |
| `resume <issue>` | Resume work on existing worktree |
| `clean <issue>` | Remove worktree after PR merged |
| `clean-merged` | Clean all merged worktrees |

### Enhanced with Context Awareness

| Command | Enhancement |
|---------|-------------|
| `start <issue>` | Show context (related worktrees) on start |
| `start <issue> --also <repo>` | Create worktree in sibling repo for same issue |
| `status` | Show ALL worktrees for current issue across repos |
| `status --ci` | Include CI status for all PRs |
| `status --review` | Include LLM review summary |

### New Context Commands (integrated)

```bash
# Context discovery (works anywhere)
devac context                    # Show current context
devac context query <sql>        # Query across all context repos

# Issue-specific (when in worktree)
devac context ci                 # CI status for all issue PRs
devac context review             # LLM review of all issue changes
devac context review --create-sub-issues

# Cross-repo worktree management
devac worktree start 123 --also web --also shared
devac worktree status            # Shows all 123 worktrees
```

---

## Total Flow: Complete Issue Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  1. START ISSUE                                                  │
│  ─────────────────                                               │
│  devac worktree start 123                                        │
│  → Creates api-123-feature worktree                              │
│  → Shows context: "Found siblings: web, shared"                  │
│  → Suggests: "Run 'devac worktree start 123 --also web'          │
│               if changes needed there"                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. WORK (with context-aware tools)                              │
│  ─────────────────────────────────                               │
│  devac context query "SELECT * FROM nodes WHERE..."              │
│  → Queries across api-123-feature + web + shared seeds           │
│                                                                  │
│  devac analyze --context                                         │
│  → Analyzes with awareness of cross-repo dependencies            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. CHECK STATUS                                                 │
│  ──────────────────                                              │
│  devac worktree status                                           │
│  → Issue #123: Add authentication                                │
│    api-123-feature: PR #45 ✓ passing                             │
│    web-123-feature: PR #46 ⏳ pending                             │
│                                                                  │
│  devac context ci                                                │
│  → Detailed CI status for all PRs                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. REVIEW                                                       │
│  ────────                                                        │
│  devac context review                                            │
│  → LLM reviews all changes across worktrees                      │
│  → Outputs markdown with findings                                │
│  → Suggests sub-issues for follow-up                             │
│                                                                  │
│  devac context review --create-sub-issues                        │
│  → Creates GitHub issues linked to #123                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. CLEANUP                                                      │
│  ──────────                                                      │
│  devac worktree clean 123                                        │
│  → Checks all PRs merged                                         │
│  → Cleans all worktrees for issue 123                            │
│  → "Cleaned: api-123-feature, web-123-feature"                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Human-in-Control Throughout

| Principle | Implementation |
|-----------|----------------|
| **Suggest, don't force** | `start` suggests `--also` repos, doesn't auto-create |
| **Show before act** | `status` shows context before any action |
| **Opt-in mutations** | `--create-sub-issues` required, not default |
| **Graceful degradation** | Works without seeds, CI, or gh CLI |
| **Transparent discovery** | Always explains what was found and why |

---

## Watch Mode Integration

### The Problem
When editing in `web-123-auth`, you might use a function from `shared` that doesn't exist yet.
Watch mode can detect this via seeds and prompt: "This needs changes in shared. Create worktree?"

### Watch Mode Enhancement

```typescript
// Enhanced WatchController events
interface WatchController {
  // ... existing ...
  on(event: "cross-repo-need", handler: (event: CrossRepoNeedEvent) => void): void;
}

interface CrossRepoNeedEvent {
  sourceRepo: string           // "web-123-auth"
  targetRepo: string           // "shared"
  reason: string               // "Unresolved import: shared/auth/utils"
  symbols: string[]            // ["validateToken", "AuthConfig"]
  suggestion: string           // "devac worktree start 123 --also shared"
}
```

### Detection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  File saved in web-123-auth                                      │
│  ─────────────────────────────                                   │
│  import { validateToken } from "@shared/auth"  ← NEW IMPORT      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Watch mode detects unresolved external ref                      │
│  ──────────────────────────────────────────                      │
│  Seed analysis: external_refs table shows is_resolved = false    │
│  Target: "shared" repo (sibling in context)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Prompt user (non-blocking notification)                         │
│  ───────────────────────────────────────                         │
│  💡 Unresolved import from "shared": validateToken               │
│     No worktree exists for issue #123 in shared                  │
│     → Run: devac worktree start 123 --also shared                │
└─────────────────────────────────────────────────────────────────┘
```

### Keep It Simple

1. **Detection only** - watch mode detects and logs, doesn't auto-create
2. **Single-repo watch** - each watch instance monitors one repo
3. **Context-aware prompts** - knows about issue number and sibling repos
4. **File-based notifications** - append to `~/.devac/notifications.log` for async pickup

---

## Multi-Claude Session Architecture: Parent Directory Approach

### The Insight
Instead of multiple Claude sessions (one per repo), start Claude in the **parent directory** where all repos live.

```
~/ws/                          ← Claude starts HERE
  ├── api-123-auth/           # Issue 123 worktree
  ├── web-123-auth/           # Issue 123 worktree
  ├── api/                    # Main repo
  ├── web/                    # Main repo
  └── shared/                 # Main repo
```

### Why This Works

| Concern | Status |
|---------|--------|
| **IDE** | ✓ Already works - VSCode projects, Zed handles repo switching |
| **Cross-repo edits** | ✓ Claude can edit `api-123-auth/src/...` and `web-123-auth/src/...` naturally |
| **Single session** | ✓ No multi-tab orchestration, no session commands needed |
| **Context unified** | ✓ All repos visible, `devac context` aggregates seeds |

### Git/npm Operations from Parent Dir

```bash
# Git - use -C flag
git -C api-123-auth status
git -C api-123-auth add . && git -C api-123-auth commit -m "feat: add auth"

# npm - use --prefix or cd
npm --prefix api-123-auth install
npm --prefix api-123-auth test

# Or Claude can: cd api-123-auth && npm test && cd ..
```

### CLAUDE.md Convention for Parent Directory

Option A: **Aggregate child CLAUDE.md files**
```
~/ws/CLAUDE.md reads:
  @api/CLAUDE.md
  @web/CLAUDE.md
  @shared/CLAUDE.md
```

Option B: **Workspace-level CLAUDE.md**
```
~/ws/CLAUDE.md contains:
  - Workspace overview
  - Links to repo-specific docs
  - Cross-repo conventions
```

**Recommendation:** Option B - explicit workspace config (you already have this in ~/ws/CLAUDE.md)

### Simplified Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. START ISSUE                                                  │
│  ─────────────────                                               │
│  cd ~/ws                                                         │
│  devac worktree start 123 --repos api,web                        │
│  → Creates api-123-auth/, web-123-auth/                          │
│  → Writes issue context to ~/.devac/issues/123.md                │
│                                                                  │
│  claude                                                          │
│  → Starts in ~/ws, sees everything                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. WORK (single Claude, cross-repo naturally)                   │
│  ─────────────────────────────────────────────                   │
│  Human: "Implement auth in api and update web to use it"         │
│                                                                  │
│  Claude edits:                                                   │
│    api-123-auth/src/auth/validateToken.ts                        │
│    web-123-auth/src/hooks/useAuth.ts                             │
│                                                                  │
│  Claude runs:                                                    │
│    git -C api-123-auth add . && git -C api-123-auth commit ...   │
│    git -C web-123-auth add . && git -C web-123-auth commit ...   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. STATUS (unified view)                                        │
│  ────────────────────────                                        │
│  devac context status                                            │
│  → Issue #123: Add authentication                                │
│    api-123-auth: PR #45 ✓ passing                                │
│    web-123-auth: PR #46 ⏳ pending                                │
└─────────────────────────────────────────────────────────────────┘
```

### What This Eliminates

| Removed | Why Not Needed |
|---------|----------------|
| `devac session` commands | Single Claude session |
| Terminal tab orchestration | No multi-tab needed |
| Session state management | No sessions to track |
| Cross-repo notifications | Claude sees everything |

### What This Simplifies

| Before | After |
|--------|-------|
| `devac session start 123` | `devac worktree start 123 --repos api,web` then `claude` |
| Switch between terminal tabs | Just work in one Claude |
| Coordinate what each Claude knows | Claude knows everything |

### Running Commands from Parent Directory

**Verified patterns that work:**

```bash
# From ~/ws (parent directory)

# Option 1: npm --prefix (recommended)
npm --prefix api-123-auth run typecheck
npm --prefix api-123-auth run test
npm --prefix api-123-auth run build

# Option 2: git -C
git -C api-123-auth status
git -C api-123-auth add . && git -C api-123-auth commit -m "feat: auth"

# Option 3: Subshell with cd
(cd api-123-auth && npm test)
```

**What works:**
| Command | Pattern | Works? |
|---------|---------|--------|
| `npm run typecheck` | `npm --prefix repo run typecheck` | ✓ |
| `npm run test` | `npm --prefix repo run test` | ✓ |
| `npm run build` | `npm --prefix repo run build` | ✓ |
| `npm run lint` | `npm --prefix repo run lint` | ✓ |
| `git status` | `git -C repo status` | ✓ |
| `git commit` | `git -C repo commit` | ✓ |
| Turbo commands | `npm --prefix repo run <turbo-script>` | ✓ |

**What doesn't work:**
- Running typecheck across ALL repos simultaneously (each has different config)
- Glob patterns like `biome check .` from parent (relative to cwd)
- Direct tool invocations without --prefix

**Conclusion:** Parent directory workflow is viable. Claude just needs to use `--prefix` or `-C` flags.

### Edge Cases

**Q: What if I'm already in a repo, not parent?**
A: `devac context` detects and shows siblings. Suggest moving to parent for cross-repo work.

**Q: What about single-repo issues?**
A: Start Claude in that repo directly (existing behavior). Parent-dir is for multi-repo.

**Q: Watch mode?**
A: Run per-repo watchers, or watch from parent with repo-specific paths.

---

## Architecture

### Core Types (devac-core)

```typescript
// packages/devac-core/src/context/types.ts

interface RepoContext {
  // Always present
  currentDir: string
  repos: RepoInfo[]           // All repos in context
  
  // Present when in issue worktree
  issueNumber?: number
  worktrees?: WorktreeInfo[]  // Issue-specific worktrees
}

interface RepoInfo {
  path: string
  name: string
  hasSeeds: boolean
  isWorktree: boolean
  issueNumber?: number        // If it's a worktree
}

interface WorktreeInfo extends RepoInfo {
  issueNumber: number
  mainRepoPath: string        // Path to original repo
  branch: string
  prNumber?: number
  prUrl?: string
}
```

### MCP Server Context Cache

```typescript
// packages/devac-mcp/src/server.ts

class DevacMCPServer {
  // Cache keyed by parent directory (context root)
  private contextCache: Map<string, RepoContext> = new Map()
  
  async getContext(cwd: string): Promise<RepoContext> {
    const parentDir = path.dirname(cwd)
    
    if (!this.contextCache.has(parentDir)) {
      const context = await discoverContext(cwd)
      this.contextCache.set(parentDir, context)
    }
    return this.contextCache.get(parentDir)!
  }
}
```

---

## Implementation Plan

### Phase 1: Context Discovery (devac-core)

**File: `packages/devac-core/src/context/discovery.ts`**

```typescript
export async function discoverContext(cwd: string): Promise<RepoContext> {
  const parentDir = path.dirname(cwd)
  const siblings = await fs.readdir(parentDir)
  
  // Classify each sibling
  const repos: RepoInfo[] = []
  for (const name of siblings) {
    const fullPath = path.join(parentDir, name)
    if (await isGitRepo(fullPath)) {
      repos.push(await classifyRepo(fullPath))
    }
  }
  
  // Check if we're in an issue worktree
  const issueNumber = extractIssueNumber(path.basename(cwd))
  
  if (issueNumber) {
    // Group worktrees for this issue
    const worktrees = repos
      .filter(r => r.issueNumber === issueNumber)
      .map(r => enrichWorktreeInfo(r))
    
    return { currentDir: cwd, repos, issueNumber, worktrees }
  }
  
  return { currentDir: cwd, repos }
}

// Pattern: {repo}-{issue#}-{slug}
export function extractIssueNumber(dirName: string): number | null {
  const match = dirName.match(/^(.+)-(\d+)-(.+)$/)
  return match ? parseInt(match[2], 10) : null
}

export function extractRepoName(dirName: string): string {
  const match = dirName.match(/^(.+)-\d+-(.+)$/)
  return match ? match[1] : dirName
}
```

### Phase 2: Federated Queries (devac-core)

**File: `packages/devac-core/src/context/query.ts`**

```typescript
export class ContextQueryExecutor {
  constructor(private pool: DuckDBPool) {}
  
  async query(context: RepoContext, sql: string): Promise<QueryResult> {
    // Build UNION ALL across all repos with seeds
    const reposWithSeeds = context.repos.filter(r => r.hasSeeds)
    
    if (reposWithSeeds.length === 0) {
      throw new Error("No repos with seeds in context")
    }
    
    // Create unified view
    const unionSql = reposWithSeeds
      .map(r => `SELECT *, '${r.name}' as _repo FROM read_parquet('${r.path}/.devac/seed/base/nodes.parquet')`)
      .join(" UNION ALL ")
    
    return this.pool.query(`WITH context_nodes AS (${unionSql}) ${sql}`)
  }
}
```

### Phase 3: Enhanced devac-worktree

**File: `packages/devac-worktree/src/commands/start.ts`**

```typescript
// Enhance existing start command
export async function start(issueNumber: number, options: StartOptions) {
  // ... existing worktree creation logic ...
  
  // NEW: Show context after creation
  const context = await discoverContext(worktreePath)
  
  console.log(`\nContext discovered:`)
  console.log(`  Siblings: ${context.repos.filter(r => !r.isWorktree).map(r => r.name).join(", ")}`)
  
  // Suggest --also if siblings exist
  const mainRepos = context.repos.filter(r => !r.isWorktree)
  if (mainRepos.length > 1) {
    console.log(`\n💡 Tip: Need changes in other repos?`)
    for (const repo of mainRepos) {
      if (repo.name !== extractRepoName(path.basename(worktreePath))) {
        console.log(`   devac worktree start ${issueNumber} --also ${repo.name}`)
      }
    }
  }
}

// NEW: --also option
export async function startWithAlso(issueNumber: number, alsoRepos: string[]) {
  // Create worktree in current repo
  await start(issueNumber, {})
  
  // Create worktrees in --also repos
  for (const repoName of alsoRepos) {
    const repoPath = path.join(path.dirname(process.cwd()), repoName)
    await createWorktreeInRepo(repoPath, issueNumber)
  }
}
```

**File: `packages/devac-worktree/src/commands/status.ts`**

```typescript
// Enhance existing status command
export async function status(options: StatusOptions) {
  const context = await discoverContext(process.cwd())
  
  if (context.issueNumber && context.worktrees) {
    // Show all worktrees for this issue
    console.log(`Issue #${context.issueNumber}:`)
    
    for (const wt of context.worktrees) {
      const ciStatus = options.ci ? await getCIStatus(wt) : null
      console.log(`  ${wt.name}: ${formatStatus(wt, ciStatus)}`)
    }
  } else {
    // Show regular repo context
    console.log(`Context: ${context.repos.map(r => r.name).join(", ")}`)
  }
}
```

### Phase 4: CLI Context Commands

**File: `packages/devac-cli/src/commands/context.ts`**

```typescript
export const contextCommand = new Command("context")
  .description("Show and query current context")
  .action(async () => {
    const context = await discoverContext(process.cwd())
    displayContext(context)
  })

contextCommand.command("query <sql>")
  .description("Query across all repos in context")
  .action(async (sql) => {
    const context = await discoverContext(process.cwd())
    const executor = new ContextQueryExecutor(pool)
    const result = await executor.query(context, sql)
    console.log(formatQueryResult(result))
  })

contextCommand.command("ci")
  .description("Check CI status for all PRs in context")
  .action(async () => {
    const context = await discoverContext(process.cwd())
    const statuses = await getCIStatusForContext(context)
    displayCIStatus(statuses)
  })

contextCommand.command("review")
  .option("--model <model>", "LLM model", "gpt-4")
  .option("--focus <area>", "Focus: security, performance, tests")
  .option("--create-sub-issues", "Create GitHub sub-issues")
  .action(async (options) => {
    const context = await discoverContext(process.cwd())
    const result = await runLLMReview(context, options)
    
    // Always output markdown first
    console.log(formatReviewAsMarkdown(result))
    
    // Optionally create sub-issues
    if (options.createSubIssues && result.suggestedSubIssues.length > 0) {
      const confirmed = await confirm("Create these sub-issues?")
      if (confirmed) {
        await createSubIssues(result.suggestedSubIssues, context.issueNumber!)
      }
    }
  })
```

### Phase 5: CI Status (Issue #16)

**File: `packages/devac-core/src/context/ci-status.ts`**

```typescript
interface CIStatus {
  repo: string
  prNumber?: number
  prUrl?: string
  status: "passing" | "failing" | "pending" | "no-pr" | "unknown"
  checks?: CheckStatus[]
}

export async function getCIStatusForContext(context: RepoContext): Promise<CIStatus[]> {
  const results: CIStatus[] = []
  
  const reposToCheck = context.worktrees ?? context.repos
  
  for (const repo of reposToCheck) {
    try {
      // Use gh cli
      const { stdout } = await execa("gh", [
        "pr", "status", "--json", "state,statusCheckRollup,url"
      ], { cwd: repo.path })
      
      const prData = JSON.parse(stdout)
      results.push(parsePRStatus(repo.name, prData))
    } catch {
      results.push({ repo: repo.name, status: "unknown" })
    }
  }
  
  return results
}
```

### Phase 6: LLM Review

**File: `packages/devac-core/src/context/review.ts`**

```typescript
interface ReviewResult {
  summary: string
  findings: Finding[]
  suggestedSubIssues: SubIssueSuggestion[]
}

export async function runLLMReview(
  context: RepoContext,
  options: { model: string; focus?: string }
): Promise<ReviewResult> {
  // Gather diffs from all worktrees/repos
  const diffs = await gatherDiffs(context)
  
  // Build review prompt
  const prompt = buildReviewPrompt(diffs, options.focus)
  
  // Run via gh copilot or similar
  const response = await runLLM(options.model, prompt)
  
  return parseReviewResponse(response)
}

async function gatherDiffs(context: RepoContext): Promise<Map<string, string>> {
  const diffs = new Map<string, string>()
  
  const repos = context.worktrees ?? context.repos
  for (const repo of repos) {
    const { stdout } = await execa("git", ["diff", "main...HEAD"], { cwd: repo.path })
    if (stdout.trim()) {
      diffs.set(repo.name, stdout)
    }
  }
  
  return diffs
}
```

---

## Files to Create/Modify

### New Files

| Path | Purpose |
|------|---------|
| `packages/devac-core/src/context/types.ts` | Context type definitions |
| `packages/devac-core/src/context/discovery.ts` | Context discovery logic |
| `packages/devac-core/src/context/query.ts` | Federated query execution |
| `packages/devac-core/src/context/ci-status.ts` | GitHub Actions status |
| `packages/devac-core/src/context/review.ts` | LLM review integration |
| `packages/devac-core/src/context/cross-repo-detector.ts` | Unresolved import detection |
| `packages/devac-core/src/context/index.ts` | Module exports |
| `packages/devac-cli/src/commands/context.ts` | CLI context commands |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/devac-worktree/src/commands/start.ts` | Add context display, --also flag |
| `packages/devac-worktree/src/commands/status.ts` | Show issue-wide status, --ci flag |
| `packages/devac-worktree/src/commands/clean.ts` | Clean all worktrees for issue |
| `packages/devac-core/src/watcher/update-manager.ts` | Emit cross-repo-need events |
| `packages/devac-mcp/src/server.ts` | Add contextCache, context tools |
| `packages/devac-mcp/src/tools/index.ts` | Register context tools |
| `packages/devac-cli/src/index.ts` | Add context command |
| `packages/devac-cli/src/commands/watch.ts` | Add cross-repo notification handler |

---

## Implementation Phases

### Phase 0: Claude Configuration Cleanup
**Goal:** Clean, focused CLAUDE.md optimized for parent-dir workflow

- [ ] Audit current ~/ws/CLAUDE.md - identify outdated/experimental content
- [ ] Audit ~/.claude/ directory - clean up old configs
- [ ] Audit repo-specific CLAUDE.md files (vivief, etc.)
- [ ] Design clean CLAUDE.md structure for parent-dir workflow:
  - Workspace overview
  - Cross-repo conventions (git -C, npm --prefix patterns)
  - Links to repo-specific docs
  - devac context/worktree usage
- [ ] Document the `--prefix` and `-C` patterns Claude should use
- [ ] Remove experimental/outdated instructions that no longer apply

**Key questions to answer during cleanup:**
- What's in CLAUDE.md that's no longer relevant?
- What conventions should Claude know for parent-dir work?
- How do we keep repo-specific knowledge accessible but not cluttering?

### Phase 1: Foundation (v1)
**Goal:** Context discovery and basic integration

- [ ] Context types and discovery (`devac-core/src/context/`)
- [ ] `devac context` CLI command
- [ ] `devac worktree start --also` flag
- [ ] `devac worktree status` with issue-wide view
- [ ] MCP server context caching

### Phase 2: Cross-Repo Intelligence (v1.1)
**Goal:** Watch mode detects cross-repo needs

- [ ] Cross-repo detector (unresolved imports to sibling repos)
- [ ] `cross-repo-need` event in watch controller
- [ ] Console prompts with actionable suggestions
- [ ] Optional file-based notifications (`~/.devac/notifications.log`)

### Phase 3: CI & Review (v1.2)
**Goal:** Total flow integration

- [ ] `devac context ci` - GitHub Actions status via `gh` CLI
- [ ] `devac context review` - LLM review with diffs
- [ ] `--create-sub-issues` flag for follow-up work

### Phase 4: Parent Directory Workflow (v2)
**Goal:** Single Claude for multi-repo issues

- [ ] `devac worktree start 123 --repos api,web` - create multiple worktrees at once
- [ ] Document parent-dir workflow in devac docs
- [ ] Ensure `git -C` and `npm --prefix` patterns work smoothly
- [ ] `devac context` works from parent dir (aggregates all child repos)

---

## Testing Strategy

1. **Unit tests** - Context discovery with mock filesystem
2. **Integration tests** - Fixture worktree structures  
3. **E2E tests** - Real worktree creation and context queries
4. **Watch mode tests** - Cross-repo detection with fixture imports

---

## Success Criteria

### Phase 0 (Claude Config Cleanup)
- [ ] ~/ws/CLAUDE.md is clean and focused
- [ ] Parent-dir workflow patterns documented
- [ ] Repo-specific CLAUDE.md files reviewed and trimmed
- [ ] Claude knows to use `--prefix` and `-C` flags

### v1 (Foundation)
- [ ] `devac context` discovers siblings in any repo
- [ ] `devac context` groups issue worktrees when in one
- [ ] `devac worktree start --also` creates worktrees in multiple repos
- [ ] `devac worktree status` shows all PRs for issue
- [ ] No JSON state files - all convention-based

### v1.1 (Cross-Repo Intelligence)
- [ ] Watch mode detects unresolved imports to sibling repos
- [ ] Prompts suggest `devac worktree start --also <repo>`
- [ ] Detection is non-blocking (console log only)

### v1.2 (Total Flow)
- [ ] `devac context ci` shows CI status for all issue PRs
- [ ] `devac context review` outputs actionable markdown
- [ ] Sub-issues can be created from review findings

### v2 (Parent Directory Workflow)
- [ ] `devac worktree start 123 --repos api,web` creates worktrees in multiple repos
- [ ] Claude started from parent dir (`~/ws`) sees all repos naturally
- [ ] `devac context` from parent dir aggregates all child repo seeds
- [ ] No session orchestration needed - single Claude, cross-repo editing works
