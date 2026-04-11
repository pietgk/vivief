# Developer Flow & the Bidirectional Bridge

> Brainstorm document. Four alternatives for how the vivief concepts map to the concrete developer workflow, focused on where files live, how the bridge works, and what becomes simpler.
>
> The challenge: developers already have filesystem + git + GitHub. The maintenance burden of syncing user intent, LLM edits, and LLM config/memory/context is high. How does the datom layer make this SIMPLER rather than adding a 4th layer to sync?

---

## The Current Reality

### The developer flow today

```
Brainstorm → PRD → Issues → Branch → Code → PR → Review → Iterate → Merge → Changeset
```

### Where state lives today (scattered)

| State | Where it lives | Fragility |
|-------|---------------|-----------|
| Source code | Files on disk | Editor + compiler need this |
| Versions | Git (commits, branches) | Works well |
| Collaboration | GitHub (issues, PRs, reviews) | API + gh commands, slow, fragile |
| Code analysis | devac datoms (code graph, diagnostics) | `devac sync` bridges filesystem→datoms |
| LLM understanding | `.claude/memory/` markdown files | Lost on context compaction, not queryable |
| LLM work plans | `.claude/plans/` markdown files | Tied to one conversation, fragile |
| LLM todos | In-conversation tool | Lost when conversation ends |
| Intent tracking | Convention + prompts | "Read the issue" — manual, re-done every conversation |
| Review→fix link | Human memory | "Which review comment led to which code change?" — gone |

**Six different storage systems.** No queryable connection between them. When Claude's context compacts, it loses track of what it was doing. When a new conversation starts on the same issue, Claude re-reads everything from scratch. Review feedback and code fixes aren't linked — the relationship lives only in the developer's head.

### The maintenance burden

The developer currently maintains:
1. **CLAUDE.md** — instructions for AI (manually written, manually updated)
2. **Memory files** — AI's understanding (AI writes, but markdown, not queryable)
3. **Plan files** — AI's work plan (one per task, can't span conversations well)
4. **Git state** — branches, commits, pushes
5. **GitHub state** — issues, PRs, review comments, CI status
6. **devac state** — sync triggers, diagnostic queries

Each has its own sync cadence, failure modes, and staleness risk.

---

## The Core Insight

**Don't add the datom layer ON TOP. Use it to REPLACE the scattered state.**

```
TODAY:
  filesystem ──── git ──── GitHub ──── .claude/ ──── devac datoms
  (files)       (versions)  (collab)   (LLM state)  (analysis)
  5 systems, no queryable links between them

WITH DATOM LAYER AS GLUE:
  filesystem ──── git ──── GitHub
  (files)       (versions)  (collab)
       \           |          /
        \          |         /
         ▼         ▼        ▼
         ┌─────────────────────┐
         │    Datom Store       │
         │  intent + provenance │
         │  workflow state      │
         │  diagnostics         │
         │  LLM context         │
         └─────────────────────┘
  Bridge syncs events → datoms. Projection reconstructs context.
  .claude/memory and .claude/plans DISAPPEAR — they ARE datoms now.
```

**Things that disappear:**
- `.claude/memory/` files → memory IS datoms (queryable, observable, survives compaction)
- `.claude/plans/` markdown → plans ARE datoms with state machine tracking
- Manual "read the issue, understand context" → Projection auto-loads intent + history
- "What was I doing?" after context compaction → workflow datom persists
- Review comment → code fix link (manual) → review datom → fix datom (automatic)
- Scattered diagnostic state → unified in datom store (devac already does this)

**Things that stay:**
- Files on filesystem (editors, compilers need them)
- Git (versioning — it works)
- GitHub (collaboration — it's where teams are)
- devac sync (already bridges filesystem → datoms)

---

## Alternative 1: "Datoms as Glue" (Minimal Bridge)

> Change nothing the developer sees. Add only intent links, provenance, and workflow state as datoms. The datom layer is invisible infrastructure.

### The bridge

devac sync already bridges filesystem → code graph datoms. Extend it minimally:

| Event | Bridge action | Datoms produced |
|-------|--------------|-----------------|
| `devac-worktree start 42` | Read issue from GitHub | `[workflow:42 :workflow/intent issue:42 :workflow/state :started]` |
| File saved | On-save hook (optional) | `[file:X :file/changed-by :human :file/intent workflow:42]` |
| `devac sync` | Parse code | Code graph datoms (existing) + `[:tx/workflow workflow:42]` |
| `git commit` | Commit hook | `[commit:Y :commit/workflow workflow:42 :commit/files [...]]` |
| `gh pr create` | PR hook | `[pr:Z :pr/workflow workflow:42 :pr/state :open]` |
| PR review comment | Webhook or poll | `[review:W :review/pr pr:Z :review/file file:X :review/line 42]` |
| Code fix after review | Commit hook + heuristic | `[commit:Y2 :commit/fixes review:W]` |
| PR merged | Webhook | `[workflow:42 :workflow/state :merged]` |

### The developer flow mapped

```
1. Brainstorm
   Files: notes in markdown or Canvas datoms
   Bridge: none (if markdown) or native datoms (if Canvas)
   Datoms: [brainstorm:1 :brainstorm/topic "session-recap handler"]

2. PRD
   Files: markdown document
   Bridge: devac sync parses markdown → content datoms (optional)
   Datoms: [prd:1 :prd/brainstorm brainstorm:1 :prd/goals [...]]

3. Issues
   Files: GitHub issues (created via gh)
   Bridge: devac sync --issues (existing)
   Datoms: [issue:42 :issue/prd prd:1 :issue/title "..." :issue/acceptance [...]]

4. Branch + Worktree
   Files: git branch created, worktree set up
   Bridge: devac-worktree start 42 records workflow start
   Datoms: [workflow:42 :workflow/intent issue:42 :workflow/branch "issue-42-recap"
            :workflow/state :coding]

5. Code
   Files: source files on disk (developer + AI edit them)
   Bridge: devac sync on save/commit
   Datoms: code graph + [file:X :file/changed-by :ai :file/intent workflow:42]
   LLM context: Claude queries Projection(workflow:42) → gets intent, acceptance
                 criteria, prior changes, diagnostics. No re-reading issue from GitHub.

6. Validation (typecheck + lint)
   Files: compiler reads files
   Bridge: devac sync --validate (existing)
   Datoms: diagnostic datoms (existing) + [:diag/workflow workflow:42]
   Validation feedback: :validation/failed → auto-fix/AI-fix/human-fix

7. PR
   Files: git push + gh pr create
   Bridge: PR creation recorded
   Datoms: [pr:Z :pr/workflow workflow:42 :pr/state :open :pr/files [...]]

8. Review
   Files: GitHub review comments
   Bridge: poll or webhook → review datoms
   Datoms: [review:W :review/pr pr:Z :review/comment "..." :review/file file:X]
   LLM context: Claude queries Projection(pr:Z, delivery: live) → gets review
                 comments as they arrive. No manual gh api calls.

9. Iterate (fix review feedback)
   Files: edit source files
   Bridge: commit hook links fix to review
   Datoms: [commit:Y2 :commit/fixes review:W :commit/workflow workflow:42]
   This IS the validation feedback loop — review comment = error datom,
   fix = recursive creation.

10. Merge
    Files: git merge
    Bridge: merge event recorded
    Datoms: [workflow:42 :workflow/state :merged]
    Promotion: sandbox (branch) → authoritative (main)

11. Changeset (optional)
    Files: changeset file or release config
    Bridge: release event
    Datoms: [release:R :release/workflows [workflow:42, workflow:43]]
```

### What Claude's Projection looks like

When Claude starts a new conversation on the same issue:

```typescript
Projection({
  filter: { ref: 'workflow:42' },
  delivery: 'snapshot',
  depth: 'refs'  // Follow refs to issue, PR, reviews, diagnostics, commits
})
```

Returns: the intent (issue description + acceptance criteria), current state (coding/reviewing/merged), all diagnostics, all review comments, all commits with provenance. Claude has full context without re-reading files or calling `gh api`.

**After context compaction:** the workflow datom and its refs survive. Claude can reconstruct what it was doing from the datom store, not from conversation history.

### What becomes simpler

| Today | With datoms as glue |
|-------|-------------------|
| Claude reads issue via `gh api` every conversation | Projection loads intent from datoms |
| Claude loses context on compaction | Workflow datom persists, Projection reconstructs |
| Review→fix link is manual | Commit datom links to review datom |
| "What changed and why?" requires git log + GitHub | Projection(workflow:42) shows full history |
| `.claude/memory/` files, manually maintained | Memory IS datoms, queryable and observable |
| `.claude/plans/` tied to one conversation | Plan IS workflow datom with state machine |
| devac diagnostics disconnected from workflow | Diagnostics linked to workflow via `:diag/workflow` |

### The effectHandler-with-errors scenario

```
Developer: "Work on issue #42 — create session-recap handler"

Claude:
  1. Projection(workflow:42) → loads intent, acceptance criteria, prior context
  2. Creates handler file (filesystem)
     → Bridge records: [file:recap.ts :file/created-by :ai :file/intent workflow:42]
  3. devac sync --validate
     → TypeScript errors → diagnostic datoms linked to workflow:42
     → :validation/failed emitted
  4. Auto-fix: biome --fix resolves lint (system, deterministic)
     → Bridge records: [fix:1 :fix/diagnostic diag:lint :fix/by :system]
  5. AI-fix: Claude reads error datoms via Projection, edits file
     → Bridge records: [fix:2 :fix/diagnostic diag:ts-1 :fix/by :ai]
  6. Re-validate: passes
  7. Creates PR
     → Bridge records: [pr:Z :pr/workflow workflow:42]
  8. Reviewer comments: "Extract the theme parsing into a separate function"
     → Bridge records: [review:W :review/pr pr:Z :review/comment "..."]
  9. Claude reads review via Projection (not gh api)
     → Edits file → Bridge records: [fix:3 :fix/review review:W :fix/by :ai]
  10. Re-validate: passes → Reviewer approves → Merge
      → [workflow:42 :workflow/state :merged]
```

**Every step is creation. Every link is a datom. The full story is queryable.**

### Assessment

**Strengths:** Minimal change. Developer's tools unchanged. Bridge is mostly devac sync (existing) + lightweight hooks. The datom layer is invisible — developer doesn't need to know about it. Claude gets persistent, queryable context. Intent→code→review→fix chain is automatic.

**Weaknesses:** Lightweight hooks (on-save, commit hook) add friction if they're slow. The "heuristic" linking a commit to a review comment it fixes is imperfect. The bridge is still one-directional for most events (filesystem→datoms); the datom layer can't change files.

---

## Alternative 2: "Datoms as Memory" (Claude-Centric)

> Focus narrowly on solving the LLM context/memory problem. Every AI action produces provenance datoms. Claude's world is the datom store; files are the human's world.

### The insight

The biggest pain in the current stack isn't files or git or GitHub — it's **Claude's fragile context**. Memory files are markdown. Plans are markdown. Conversation context compacts and loses information. Every new conversation re-reads everything.

What if Claude's entire mental model was datoms?

### Claude's datom-native context

```
// What Claude knows about the current task
[context:C  :context/workflow   workflow:42              tx:100]
[context:C  :context/intent     "Create session-recap handler"]
[context:C  :context/approach   "XState machine for state transitions"]
[context:C  :context/blockers   "TypeScript error in theme extraction"]
[context:C  :context/decisions  [{what: "Use XState", why: "Behavior Contract"}]]

// What Claude has done
[action:A1  :action/context   context:C                  tx:101]
[action:A1  :action/type      :file-create]
[action:A1  :action/file      "session-recap.ts"]
[action:A1  :action/result    :success]

[action:A2  :action/context   context:C                  tx:102]
[action:A2  :action/type      :fix-error]
[action:A2  :action/diagnostic diag:ts-1]
[action:A2  :action/result    :partial  :action/remaining 1]

// What Claude should do next (plan as datoms)
[plan:P     :plan/context     context:C                  tx:103]
[plan:P     :plan/step        1  :plan/action "Fix remaining TS error"]
[plan:P     :plan/step        2  :plan/action "Add tests"]
[plan:P     :plan/step        3  :plan/action "Create PR"]
[plan:P     :plan/state       :step-1]  // StateMachine tracking progress
```

### New conversation, same issue

When Claude starts a new conversation:

```typescript
Projection({
  filter: { ref: 'workflow:42', type: ['context', 'action', 'plan'] },
  delivery: 'snapshot',
  depth: 'refs'
})
```

Returns: Claude's previous understanding, decisions, actions, current plan state. No re-reading files. No re-reading issue. No "let me look at what's been done."

### Context compaction survives

Today: context compacts → Claude gets a lossy summary → some decisions and reasoning lost.

With datom memory: context compacts → conversation summary may be lossy → but Claude's datom context has the FULL picture. On the next turn, Projection reconstructs.

### The bridge

Same as Alt 1 for file/git/GitHub events. The addition: **Claude itself writes context datoms** as part of its normal workflow.

Instead of:
```
[TodoWrite] Create plan
[Write] .claude/plans/plan.md
```

Claude does:
```
(state, :workflow/plan-requested) => {
  datoms: [
    [plan:P :plan/workflow workflow:42 :plan/step 1 :plan/action "..."],
    [plan:P :plan/step 2 :plan/action "..."],
    [plan:P :plan/state :step-1]
  ]
}
```

### The developer flow mapped

Same as Alt 1 for steps 1-11. The difference: at every step, Claude produces context datoms alongside its actions. The developer doesn't see these — they're Claude's internal state, stored as datoms instead of markdown files.

### What becomes simpler

| Today | With datoms as memory |
|-------|---------------------|
| `.claude/memory/` — flat markdown, not queryable | Context datoms — queryable, structured, observable |
| `.claude/plans/` — one per task, no state tracking | Plan datoms with StateMachine — tracks which step |
| Context compaction loses reasoning | Datom context survives compaction |
| New conversation = re-read everything | Projection loads prior context instantly |
| "Why did Claude make this decision?" — lost | Decision datoms with `:tx/why` chain |
| CLAUDE.md manually maintained | Project understanding as datoms, evolves naturally |

### Assessment

**Strengths:** Solves the most painful problem (LLM context fragility) without changing any developer-facing tools. Claude becomes dramatically better at multi-conversation tasks. The "memory" system is the datom store — no separate mechanism needed.

**Weaknesses:** Requires Claude to produce datoms (new capability/integration). The datom store needs to be accessible to Claude across conversations (MCP tool or similar). Doesn't help with the developer flow itself (git, GitHub, reviews) — those stay scattered.

---

## Alternative 3: "Workflow as StateMachine" (Process-Centric)

> The developer flow IS a Behavior Contract. Each step is a state. Transitions are effects. The state machine makes the process visible and enforceable.

### The state machine

```typescript
// Developer workflow as XState machine = Behavior Contract
const developerWorkflow = createMachine({
  id: 'developer-flow',
  initial: 'brainstorm',
  states: {
    brainstorm: {
      on: { CREATE_PRD: 'prd' }
    },
    prd: {
      on: { CREATE_ISSUES: 'issues' }
    },
    issues: {
      on: { START_WORK: 'coding' }
    },
    coding: {
      on: {
        VALIDATE: 'validating',
        CREATE_PR: 'pr_open'
      }
    },
    validating: {
      on: {
        PASS: 'coding',      // Back to coding (to create PR)
        FAIL: 'fixing'
      }
    },
    fixing: {
      on: {
        RETRY: 'validating',
        ESCALATE: 'coding'   // Back to human
      }
    },
    pr_open: {
      on: {
        REVIEW_REQUESTED: 'reviewing'
      }
    },
    reviewing: {
      on: {
        CHANGES_REQUESTED: 'fixing_review',
        APPROVED: 'approved'
      }
    },
    fixing_review: {
      on: {
        FIXED: 'reviewing'   // Back to review
      }
    },
    approved: {
      on: {
        MERGE: 'merged',
        CANCEL: 'cancelled'
      }
    },
    merged: { type: 'final' },
    cancelled: { type: 'final' }
  }
})
```

### The power: visibility

This state machine is a **Behavior Contract** visualized in Stately Studio. The team sees:
- Where every issue is in the flow
- What transitions are valid (can't merge without approval)
- Where bottlenecks are (10 issues stuck in "reviewing")
- How the fix cycle works (coding → validating → fixing → validating → ...)

It's also a **Surface (Diagram mode)** — the developer flow rendered as an interactive state machine.

### The bridge

At each state, the MEDIUM is different:

| State | Medium | Bridge |
|-------|--------|--------|
| brainstorm | Datoms (Canvas) or markdown files | Native or devac sync |
| prd | Datoms (Canvas) or markdown | Native or devac sync |
| issues | GitHub API | devac sync --issues |
| coding | Files on filesystem | devac sync |
| validating | Compiler + linter output | devac sync --validate |
| fixing | Files on filesystem | devac sync |
| pr_open | GitHub PR | devac sync --ci |
| reviewing | GitHub review comments | Bridge polls/webhook |
| merged | Git merge | Git hook |

The state machine doesn't care about the medium — it tracks the PROCESS. The bridge syncs medium-specific events into datom state transitions.

### The developer flow mapped

```
1. [workflow:42 :workflow/state :brainstorm]
   Developer takes notes. Optional: Canvas datoms.
   Transition: :workflow/prd-created

2. [workflow:42 :workflow/state :prd]
   Developer writes PRD. Markdown or Canvas.
   Transition: :workflow/issues-created
   Contract: PRD must have goals + scope before transition allowed

3. [workflow:42 :workflow/state :issues]
   Issues created in GitHub. Bridge syncs to datoms.
   Transition: :workflow/work-started { issue: 42 }

4. [workflow:42 :workflow/state :coding]
   Developer + AI write code in files.
   Bridge: devac sync records code graph + provenance.

5. [workflow:42 :workflow/state :validating]
   TypeScript + lint + tests run.
   Bridge: devac sync --validate records diagnostics.
   If pass → back to coding (ready for PR) or → pr_open
   If fail → fixing

6. [workflow:42 :workflow/state :fixing]
   Auto-fix → AI-fix → human-fix (escalation)
   Back to validating when done.

7. [workflow:42 :workflow/state :pr_open]
   gh pr create. Bridge records PR datom.
   Transition: :workflow/review-requested

8. [workflow:42 :workflow/state :reviewing]
   Human + AI review. Bridge records review datoms.
   If changes requested → fixing_review
   If approved → approved

9. [workflow:42 :workflow/state :fixing_review]
   Fix review feedback. Same as fixing but input = review datoms.
   Back to reviewing when done.

10. [workflow:42 :workflow/state :approved]
    Ready to merge.
    Transition: :workflow/merged

11. [workflow:42 :workflow/state :merged]
    Done. Promotion from sandbox (branch) to authoritative (main).
```

### What becomes simpler

| Today | With workflow as StateMachine |
|-------|------------------------------|
| Developer flow is convention | Flow is a Behavior Contract — visible, enforceable |
| "Where is this issue?" requires checking git + GitHub + CI | Projection(workflow:42) → current state |
| Invalid transitions possible (merge without tests) | Contract prevents invalid transitions |
| Bottleneck invisible | Diagram Surface shows where issues are stuck |
| Fix cycle (review feedback) is ad hoc | Fix cycle is explicit states in the machine |
| Process varies per developer | One machine, consistent across team |

### Assessment

**Strengths:** The developer flow becomes visible and enforceable. The state machine IS the Visual Triangle — Stately Studio shows the process. Contracts prevent mistakes (can't merge without approval). Bottlenecks are queryable. The fix cycle (both validation and review) is first-class.

**Weaknesses:** Developers may resist a formal state machine ("too rigid"). The medium question (where files live) is answered per-state, not centrally. Adding the state machine adds ceremony. And: the state machine tracks process, but doesn't solve the LLM context problem from Alt 2.

---

## Alternative 4: "Sandbox = Branch" (Git-Native)

> Map vivief concepts directly to git primitives. Branch = sandbox. PR = promotion. Review = Contract enforcement. Merge = authoritative commit. No new concepts — just a conceptual mapping.

### The mapping

| Vivief concept | Git/GitHub primitive |
|---------------|---------------------|
| **Sandbox Projection scope** | Git branch |
| **Sandboxed creation** | Commits on branch |
| **Gated promotion** | Pull request |
| **Contract enforcement** | CI checks + review requirements |
| **Human review** | PR review (approve/request changes) |
| **AI review** | AI review bot (Contract as code) |
| **Promotion** | Merge to main |
| **Rejection** | Close PR / delete branch |
| **Authoritative state** | Main branch |
| **Worktree** | Materialized sandbox workspace |
| **Replay** | `git log` / `git diff base...HEAD` |
| **Snapshot** | Current HEAD of branch |

### The bridge

Git events → datoms. This is event-driven, not polling:

```
git commit → commit hook → datom: [commit:Y :commit/branch "issue-42" :commit/files [...]]
git push → push hook → datom: [push:P :push/branch "issue-42" :push/commits [...]]
gh pr create → post-create hook → datom: [pr:Z :pr/branch "issue-42" :pr/state :open]
PR review → webhook → datom: [review:W :review/pr pr:Z :review/verdict :changes-requested]
PR merge → webhook → datom: [workflow:42 :workflow/state :merged]
CI run → webhook → datom: [ci:C :ci/pr pr:Z :ci/status :pass]
```

### P2P version control enters here

For P2P scenarios (offline development, team without GitHub):

| Git concept | Iroh + MoQ equivalent |
|-------------|----------------------|
| Repository | iroh-blobs (content-addressed file storage) |
| Branch | Named blob collection fork |
| Commit | iroh-blobs put (BLAKE3-verified) |
| Push/Pull | MoQ track replication via Iroh |
| PR | Sync Contract promotion proposal |
| Merge | Version vector-based multi-writer merge |

The Sync Contract specifies: how branches merge (CRDT for concurrent edits to same file, last-writer-wins for config, manual merge for conflicts).

### Where files live

```
LOCAL DEVELOPMENT:
  ~/ws/vivief/              ← main (authoritative)
  ~/ws/vivief-42-recap/     ← worktree (sandbox for issue 42)
  Files on filesystem. Git manages both.

P2P DEVELOPMENT:
  iroh-blobs://abc.../      ← main (authoritative, replicated)
  iroh-blobs://abc.../branches/issue-42/  ← sandbox
  Files in iroh-blobs. Materialized to filesystem for tooling.

DATOM STORE:
  .devac/central.duckdb     ← code graph, diagnostics, workflow state
  NOT source code. Source code stays in files/git/iroh-blobs.
```

### The developer flow mapped

```
1. Branch = sandbox
   git checkout -b issue-42-recap
   → datom: [sandbox:42 :sandbox/branch "issue-42-recap" :sandbox/intent issue:42]

2. Code in sandbox
   Edit files in worktree. devac sync produces code graph datoms.
   Every commit in the branch = sandboxed creation.
   → datom: [commit:Y :commit/sandbox sandbox:42 :commit/by :human]

3. Validate in sandbox
   TypeScript + lint + tests run against branch files.
   CI runs on push.
   → datom: [ci:C :ci/sandbox sandbox:42 :ci/status :fail :ci/errors [...]]

4. Fix in sandbox
   Validation feedback loop — all iteration happens in the branch.
   The mess stays in the branch. Main never sees it.
   → datom: [commit:Y2 :commit/sandbox sandbox:42 :commit/fixes ci:C]

5. PR = promotion proposal
   gh pr create = request to promote sandbox to authoritative.
   → datom: [promotion:P :promotion/from sandbox:42 :promotion/to :main :promotion/state :open]

6. Review = Contract enforcement on promotion
   Reviewer checks: does this code meet the Contract?
   CI checks: do automated Contracts pass?
   → datom: [review:W :review/promotion promotion:P :review/verdict :approved]

7. Merge = promotion
   PR merged = sandbox promoted to authoritative.
   → datom: [promotion:P :promotion/state :promoted]
   → datom: [sandbox:42 :sandbox/state :promoted]
   → git: branch merged to main, worktree can be cleaned

8. Reject = sandbox discarded
   PR closed = sandbox rejected.
   → datom: [sandbox:42 :sandbox/state :rejected]
   → git: branch deleted, worktree cleaned
```

### What becomes simpler

| Today | With sandbox = branch |
|-------|---------------------|
| Branch/PR/merge are git concepts, disconnected from vivief | Branch IS sandbox, PR IS promotion — same language |
| "Where is this issue?" = check git + GitHub separately | Projection(sandbox:42) → full state |
| CI checks are opaque | CI = Contract enforcement — same model as clinical Contracts |
| Worktree lifecycle is manual | Sandbox lifecycle is the concept model |
| P2P code sharing undefined | iroh-blobs replicates sandboxes via Sync Contract |

### Assessment

**Strengths:** Maps cleanly to what developers already know (branch, PR, merge). No new tools — just a conceptual lens. The vivief vocabulary (sandbox, promotion, Contract enforcement) maps 1:1 to git primitives. iroh-blobs path is clear. The bridge is event-driven (hooks, webhooks).

**Weaknesses:** Doesn't solve the LLM context problem (Alt 2). Doesn't make the workflow visible (Alt 3). The mapping is nice vocabulary but doesn't change what the developer DOES. Git-native means git's limitations (no partial promotion, no fine-grained sandbox scoping beyond branches).

---

## Synthesis: What Combines Best

Each alternative solves a different part of the problem:

| Alternative | Solves | Doesn't solve |
|-------------|--------|--------------|
| **Alt 1: Datoms as Glue** | Intent tracking, provenance, review→fix links | LLM context fragility |
| **Alt 2: Datoms as Memory** | LLM context, multi-conversation continuity | Developer workflow visibility |
| **Alt 3: Workflow as StateMachine** | Process visibility, transition enforcement | Where files live, LLM context |
| **Alt 4: Sandbox = Branch** | Conceptual mapping, P2P path, iroh-blobs | LLM context, process enforcement |

### The combination

**Alt 4 (vocabulary) + Alt 1 (glue) + Alt 2 (memory) + Alt 3 (optional formality)**

1. **Vocabulary from Alt 4:** Branch = sandbox. PR = gated promotion. Review = Contract enforcement. Merge = promotion. This gives the developer flow vivief language without changing tools.

2. **Glue from Alt 1:** Bridge (devac sync + hooks + webhooks) records intent, provenance, and workflow state as datoms. Every event linked to the workflow entity. Queryable.

3. **Memory from Alt 2:** Claude's context, plans, decisions, and actions stored as datoms. Survives compaction. Loads via Projection on new conversation. `.claude/memory/` and `.claude/plans/` disappear — they're datoms.

4. **State machine from Alt 3 (optional):** For teams that want process enforcement, the developer flow can be a Behavior Contract (StateMachine). For solo developers, it's just vocabulary + glue — no formality required.

### Where files live (final answer)

```
SOURCE CODE:      Filesystem (local) + Git (versions) + iroh-blobs (P2P)
DATOM STORE:      Intent, provenance, workflow state, diagnostics, LLM context
BRIDGE:           devac sync (filesystem→datoms) + hooks (git/GitHub→datoms)
                  Bidirectional: datoms can trigger effects (create branch, open PR)
```

**The datom store never stores source code.** It stores everything ABOUT the source code: what it does (code graph), whether it's valid (diagnostics), who changed it and why (provenance), where it is in the workflow (state), and what Claude knows about it (LLM context).

### The developer sees

```
Same editor. Same git. Same GitHub. Same devac.

What's different:
- Claude remembers what it was doing across conversations
- Claude loads context from datoms instead of re-reading everything
- Intent→code→review→fix chain is queryable
- "devac status" shows workflow state, not just diagnostics
- Optional: workflow state machine visible in Stately Studio
- P2P: iroh-blobs replicates sandboxes between devices
```

### The effectHandler-with-errors scenario (combined)

```
Developer: "Work on issue #42 — create session-recap handler"

Claude:
  Projection(workflow:42) → loads:
    - Issue intent + acceptance criteria (from GitHub bridge)
    - Prior context if any (from datom memory)
    - Current diagnostics (from devac sync)

  sandbox:42 = branch issue-42-recap (Alt 4 vocabulary)

  Creates handler file (filesystem)
    → Bridge: [file:recap.ts :file/created-by :ai :file/intent workflow:42] (Alt 1 glue)
    → Claude: [action:A1 :action/type :file-create :action/context context:C] (Alt 2 memory)

  Validates: TypeScript fails, lint warns
    → Bridge: diagnostic datoms + :validation/failed
    → Auto-fix: biome --fix (system, deterministic)
    → AI-fix: Claude reads error datoms, fixes in sandbox
      → Claude: [action:A2 :action/type :fix-error :action/diagnostic diag:ts-1] (memory)
    → Re-validate: passes

  Creates PR (gh pr create)
    → Bridge: [promotion:P :promotion/from sandbox:42 :promotion/to :main] (Alt 4)

  Review: "Extract theme parsing"
    → Bridge: [review:W :review/promotion promotion:P :review/comment "..."]
    → Claude reads review via Projection (not gh api)
    → Claude fixes + records: [action:A3 :action/type :fix-review :action/review review:W]

  Merge = promotion
    → [sandbox:42 :sandbox/state :promoted]
    → [workflow:42 :workflow/state :merged]

  Next conversation on a related issue:
    → Claude: Projection loads workflow:42 history
    → Knows: what was built, what decisions were made, what approach worked
    → No re-reading. No "let me look at the issue."
```

---

## Beyond Source Code: The File Creation Spectrum

Source code is the HARDEST case — it has compilers, type-checkers, linters, git, GitHub PRs, CI pipelines. But creation in vivief produces many kinds of files. The bridge pattern must generalize.

### The spectrum

| File type | Created by | Tools | Versioning | Validation | Bridge to datoms |
|-----------|-----------|-------|------------|------------|-----------------|
| **Source code** (TS, Python) | Developer, AI | Editor, compiler | Git | TypeScript, lint, test | devac sync (code graph) |
| **Markdown** (docs, specs, notes) | Author, AI | Editor | Git | Schema Contract (structure), editorial | Parse → content datoms |
| **Images** (PNG, SVG, photos) | Designer, AI gen | Design tool, DALL-E | Git (LFS) or iroh-blobs | Render Contract (dimensions, a11y alt-text) | Metadata datoms (dimensions, alt-text, provenance) |
| **SVG / Diagrams** | Designer, AI, likeC4 | Design tool, code gen | Git | Schema (valid SVG), visual regression | Parse → structure datoms |
| **Spreadsheets** (Excel, CSV) | Analyst, AI | Spreadsheet app | Git or cloud | Schema Contract (columns, types, ranges) | Parse → tabular datoms |
| **Documents** (Word, PDF) | Author, AI | Word processor | Cloud or iroh-blobs | Schema + editorial Contract | Metadata + extracted content datoms |
| **CAD files** | Engineer | CAD software | Specialized VCS | Dimensional Contracts, material constraints | Metadata + parameter datoms |
| **Config** (JSON, YAML, TOML) | Developer, AI | Editor | Git | Schema Contract (JSON Schema) | Parse → structured datoms |
| **Generated reports** (PDF, HTML) | System, AI | Template engine | Tx log (datom-native) | Render Contract | Native — report IS datoms rendered |

### The pattern

Every file-based creation follows the same bridge pattern:

```
File (native medium)  ←→  Bridge  ←→  Datoms (intent, provenance, metadata, validation)
```

What varies per file type:

| Dimension | Source code | Images | Spreadsheets | Documents |
|-----------|-----------|--------|-------------|-----------|
| **What lives in datoms** | Code graph, diagnostics, effects | Metadata, alt-text, dimensions | Schema, cell values (optional) | Structure, extracted text |
| **What stays as files** | Source files | Image files | Spreadsheet files | Document files |
| **Bridge** | devac sync (parser) | Metadata extractor | CSV/schema parser | Document parser |
| **Versioning** | Git | Git LFS / iroh-blobs | Git / cloud | Cloud / iroh-blobs |
| **Sandbox** | Git branch | Draft folder / iroh-blobs path | Draft sheet | Draft version |
| **Promotion** | PR merge | Publish / approve | Release dataset | Publish document |
| **Validation** | TypeScript, lint, test | Dimensions, a11y | Schema, range checks | Editorial, regulatory |
| **Cache** | Build output | Rendered variants (thumbnails) | Computed aggregates | Rendered PDF |

### Key insight: datoms never store the file content (usually)

For most file types, the datom store holds **metadata and provenance**, not the file itself:

```
[image:42     :image/path        "/assets/hero.png"           tx:10  true]
[image:42     :image/dimensions  "1920x1080"                  tx:10  true]
[image:42     :image/alt-text    "Session overview dashboard"  tx:10  true]
[image:42     :image/created-by  :ai/dall-e                   tx:10  true]
[image:42     :image/intent      workflow:42                   tx:10  true]
[image:42     :image/contract    :contract/hero-image          tx:10  true]

// The actual PNG lives on filesystem / iroh-blobs — NOT in the datom store
```

Exception: small structured content (config, short markdown, clinical notes) may live entirely as datoms if they're naturally datom-shaped.

### The Creation Loop applies identically

```
Source code:    Intent → Behavior Contract → Write code → TypeScript validates → Cache build
Image:          Intent → Render Contract → Generate image → Dimensions + a11y validate → Cache variants
Spreadsheet:    Intent → Schema Contract → Populate data → Schema validates → Cache aggregates
Document:       Intent → Editorial Contract → Write doc → Editorial + regulatory validate → Cache PDF
CAD:            Intent → Engineering Contract → Design part → Dimensional + material validate → Cache render
```

Same loop. Same trust strategies (human authoritative, AI gated/sandboxed). Same validation feedback (errors → fix → re-validate). Same cache (content-addressed, invalidate on input/Contract change).

The only variable: **what the bridge extracts** from the file into datoms.

### Where iroh-blobs fits across file types

| File type | Local storage | P2P replication |
|-----------|--------------|-----------------|
| Source code | Filesystem + Git | iroh-blobs (mirrors git) |
| Images | Filesystem | iroh-blobs (binary-friendly) |
| Spreadsheets | Filesystem | iroh-blobs |
| Documents | Filesystem | iroh-blobs |
| Clinical notes | Datom store (native) | Iroh (datom replication) |
| Config | Filesystem + Git | iroh-blobs |

iroh-blobs handles ALL file types — it's a P2P filesystem. Source code ALSO uses Git for its specialized versioning (branches, merges). Other file types can use iroh-blobs alone.

### The generalized bridge

```
┌─────────────────────────────────────────────────────────┐
│                    FILE WORLD                             │
│  Source code  │  Images  │  Docs  │  Spreadsheets  │ ... │
│  (filesystem + git + GitHub)  (filesystem + cloud/iroh-blobs) │
└──────┬──────────┬─────────┬──────────┬──────────────────┘
       │          │         │          │
       ▼          ▼         ▼          ▼
┌─────────────────────────────────────────────────────────┐
│                    BRIDGE LAYER                           │
│  devac sync  │ metadata  │ doc     │ schema              │
│  (code graph)│ extractor │ parser  │ parser              │
│              │           │         │                     │
│  + git hooks + file watchers + webhooks + cloud sync     │
└──────┬──────────┬─────────┬──────────┬──────────────────┘
       │          │         │          │
       ▼          ▼         ▼          ▼
┌─────────────────────────────────────────────────────────┐
│                    DATOM STORE                            │
│  Intent  │  Provenance  │  Metadata  │  Validation       │
│  Workflow state  │  LLM context  │  Cache validity        │
│                                                          │
│  Queryable. Survives context compaction. Observable.      │
└─────────────────────────────────────────────────────────┘
```

---

## What This Means for the Vision Document

The vision document needs a **Creation Workspace** section in §3 (Creation) addressing:

1. **Creation produces artifacts.** An artifact is a datom cluster with provenance — the named output of a creation cycle. Source code, images, documents, spreadsheets, clinical notes are all artifacts.
2. **Artifacts live in their native medium.** Files stay on filesystem/git/iroh-blobs. Datoms store everything ABOUT the artifact: intent, provenance, metadata, validation state, cache validity. Small structured content may be datom-native.
3. **The bridge connects media to datoms.** Each file type has a bridge (parser, extractor, sync) that produces datoms from files. Bridges are bidirectional: datoms can trigger effects that create/modify files.
4. **Git mapping for source code.** Branch = sandbox. PR = gated promotion. Review = Contract enforcement. Merge = promotion. This is the most complex case — other file types use simpler variants.
5. **LLM context as datoms.** AI memory, plans, and decisions stored as datoms — survives compaction, loads via Projection.
6. **iroh-blobs for P2P.** All file types replicate via iroh-blobs. Source code additionally uses Git for specialized versioning.
5. **P2P path:** iroh-blobs replicates sandboxes. Sync Contract resolves conflicts.

---

*Version: brainstorm — 4 alternatives for developer flow mapping + file creation spectrum. Key insight: datom layer as intent-and-provenance glue, not another copy of files. Combined approach: Alt 4 vocabulary + Alt 1 glue + Alt 2 memory + Alt 3 optional formality. Generalized beyond source code: images, SVGs, CAD, spreadsheets, documents all follow the same bridge pattern. Files stay in native medium. Datoms store metadata, provenance, validation, intent, LLM context. iroh-blobs for P2P across all file types.*
