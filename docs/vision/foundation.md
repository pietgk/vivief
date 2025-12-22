# DevAC Conceptual Foundation

> A unified development workflow where humans and LLMs collaborate through queryable state, deterministic effects, and adaptive change handling.

---

## 1. The Problem We're Solving

Software development involves many moving parts: code, tests, docs, issues, PRs, CI/CD, repos. These create:

1. **Scattered state** - Truth lives in many places (Git, GitHub, CI logs, code AST)
2. **Implicit knowledge** - Relationships between code/issues/PRs exist but aren't queryable
3. **Context fragmentation** - Humans and LLMs lose context switching between repos and tools
4. **Validation burden** - Multiple checks (type, lint, test) run independently without coordination
5. **Change complexity** - Simple changes are easy; complex multi-repo changes require careful orchestration

**Our thesis**: By making all relevant state queryable and modeling development as state machines with effects, we enable humans and LLMs to collaborate productively on changes of any complexity.

**The Core Equivalence**:
```
runCode() === handleEffects(extractEffects(code))
```
If Effects capture complete semantics, understanding effects = understanding code.

---

## 2. Core Concepts

### 2.1 Topology

| Concept | Definition | Example |
|---------|------------|---------|
| **Workspace** | A directory containing multiple sibling repos | `~/ws/` |
| **Repo** | A git repository with its own history | `~/ws/api/` |
| **Sibling Repo** | Another repo in the same workspace | `api` and `web` are siblings |
| **Parent Directory** | The workspace directory (one level above repos) | If in `~/ws/api/`, parent is `~/ws/` |
| **Worktree** | A git worktree - isolated working directory sharing repo history | `~/ws/api-123-auth/` |

### 2.2 Identity

| Concept | Definition | Format |
|---------|------------|--------|
| **issueId** | A change request with source and origin repo | `ghapi-123` → `gh:mindler/api:123` |
| **Entity** | A code symbol (function, class, etc.) | `repo:package:kind:hash` |
| **Seed** | Queryable extraction of a source of truth | `.devac/seed/nodes.parquet` |

**issueId Format**: `{source}{originRepo}-{number}`
- GitHub: `ghapi-123`, `ghmonorepo-3.0-789`
- Jira: `PROJ-456`
- Linear: `ABC-789`

Parse by splitting on **last `-`** to extract number (handles repos with dashes/digits like `monorepo-3.0`).

The canonical form expands to URN-style: `gh:mindler/api:123` (owner resolved from git remote).

### 2.3 Workspaces

| Concept | Definition |
|---------|------------|
| **Claude Session** | A Claude CLI session with a specific working directory |
| **Claude CWD** | Either a repo, a worktree, or the parent directory |
| **Session Scope** | From parent dir: can query/edit all repos. From repo/worktree: focused scope |

### 2.4 Workspace Topology & Issue-Based Development

Development often spans multiple repositories. DevAC uses **convention over configuration** to discover and group related work.

#### Parent Directory Workflow

When working on multi-repo changes, start Claude in the **parent directory** (workspace):

```
~/ws/                          ← Claude starts HERE
  ├── api-ghapi-123-auth/     # Issue ghapi-123 repo api worktree
  ├── web-ghapi-123-auth/     # Issue ghapi-123 repo web worktree  
  ├── api/                    # Main repo with the issue
  ├── web/                    # Main repo
  └── shared/                 # Sibling repo
```

From the parent directory, Claude can query and edit all repos naturally, eliminating the need for multi-session orchestration.

#### Worktree Naming Convention

Worktrees follow the pattern `{worktreeRepo}-{issueId}-{slug}`:

| Component | Purpose | Example |
|-----------|---------|---------|
| `worktreeRepo` | Repo this worktree belongs to | `shared` |
| `issueId` | Issue identifier (source + origin repo + number) | `ghapi-123` |
| `slug` | Human-readable description | `auth` |

**Examples:**
- `api-ghapi-123-auth` — Worktree of `api` for GitHub issue #123 from `api`
- `shared-ghapi-123-auth` — Worktree of `shared` for the **same** issue (from `api`)
- `web-ghmonorepo-3.0-789-fix` — Worktree of `web` for issue #789 from `monorepo-3.0`

The worktree's repo (`shared`) may differ from the issue's origin repo (`api`). This enables cross-repo work on the same issue.

#### Context Discovery Rules

**Rule 1: Sibling Discovery**
Context always includes all sibling repos in the same parent directory.

**Rule 2: Issue Grouping**
When in a worktree matching `{worktreeRepo}-{issueId}-{slug}`:
- Extract issueId (e.g., `ghapi-123`)
- Group all worktrees with the same issueId
- Include their corresponding main repos

**Example**: In `shared-ghapi-123-auth/`, context includes:
- All `*-ghapi-123-*` worktrees (same issue across repos)
- Their main repos (`api/`, `shared/`)
- Other siblings (`web/`)

#### Cross-Repo Commands

From parent directory or any repo:
```bash
git -C api-123-auth status          # Git operations
npm --prefix api-123-auth test      # npm operations
```

This pattern enables single-session, multi-repo development.

---

## 3. Vision ↔ View: The Core Loop

Development is a continuous loop between intent and implementation:

```
Vision ↔ View Loop
- Vision = Why (Specs, Intent, Architecture)
- View = What/Where/When/How (Implementation, Diagrams, Tests)
- Iterate through validation to improve both
```

```
Vision/Specs ──implement──> Code
     ↑                        │
     │                    extract
  validate                    │
     │                        ↓
Diagrams/Views <──present── Effects
```

### 3.1 Three Pipelines

The system operates through three distinct pipelines:

| Pipeline | Territory | Flow | Purpose |
|----------|-----------|------|---------|
| **Vision→View** | Human | Intent → Implement → Visualize → Validate | Express and verify intent |
| **Question→Answer** | Collaborative | Ask → Reason → Data → Answer | Bridge understanding gaps |
| **Query→Data** | System | Query → Extract → Transform → Return | Deterministic data retrieval |

### 3.2 The Two Worlds

Development splits into two fundamentally different domains:

**Deterministic World (Systems Handle)**
- **Extraction**: AST parsing, dependency graphs, type information
- **Validation**: Type-check, lint-check, test-check, build-check
- **State queries**: "What functions call X?", "What files changed?"
- **Transformations**: Formatting, import sorting, simple refactors
- **Diagram generation**: Effects → C4, sequence diagrams

**Non-Deterministic World (Humans/LLMs Handle)**
- **Intent interpretation**: Understanding what a vague request means
- **Design decisions**: Architecture, API design, naming
- **Problem solving**: Debugging, root cause analysis
- **Pattern recognition**: Identifying architectural patterns
- **Rule proposal**: Suggesting new extraction/validation rules

**The boundary principle**: Push as much as possible into the deterministic world, freeing humans/LLMs to focus on what they do best.

---

## 4. Seeds: Making Everything Queryable

### 4.1 What Seeds Are

A **seed** is a queryable representation of a source of truth, stored in an appropriate format.

| Source of Truth | Seed Format | Query Type |
|-----------------|-------------|------------|
| Code (AST) | Parquet (graph) | "Find all callers of X" |
| GitHub Issues | JSON/Parquet | "What issues are assigned to me?" |
| CI/CD Config | YAML → Parquet | "What jobs run on PR?" |
| Documentation | Vector store | "Find docs about auth" |
| Analytics | BigQuery/Parquet | "What's the error rate?" |
| Infrastructure | Cloud API → Parquet | "What services exist?" |

### 4.2 Seed Properties

1. **Derived**: Seeds are computed from sources of truth, never authoritative
2. **Regenerable**: Can always be rebuilt from source
3. **Versioned**: Can be committed to repos (enabling reproducibility)
4. **Delta-aware**: Track what changed since last extraction
5. **Federated**: Can query across multiple repos via hub

### 4.3 The Hub

The **hub** aggregates seeds across the workspace, enabling cross-repo queries:

```
Repo A seeds ─┐
              ├──> Hub (DuckDB) ──> "Find all callers of User.login across all repos"
Repo B seeds ─┘
```

---

## 5. Effects: The Universal Abstraction

### 5.1 Core Formula

```
effectHandler = (state, effect) => (state', [effect'])
```

**This is the entire pattern.** Everything maps to it:
- HTTP: Request effect → Response effect
- Actors: InvokeHandler effects
- State Machines: Event effect → Action effects
- Routing: Navigate effect → Render effects
- Code Analysis: AST → FunctionCall effects → Architecture understanding

### 5.2 Effects as Data

Effects are **immutable observations** about what happens. Two primitives:

1. **Effect** - A description of something to do (data, not function)
2. **Handler** - A function that processes effects and produces new effects

### 5.3 Code Effects (Understanding Code)

Code effects describe **what code does** - extracted from static and runtime analysis. These enable documentation, diagrams, and architectural understanding.

#### Data Effects - What Happens

| Effect | Description | Example |
|--------|-------------|---------|
| `FunctionCall` | Code execution | `userService.getUser()` calls `db.query()` |
| `Store` | Data persistence | `INSERT INTO users` |
| `Retrieve` | Data fetching | `SELECT * FROM users` |
| `Send` | External communication | `HTTP POST to stripe.com` |
| `Request` | Asking for something | API request |
| `Response` | Answering a request | API response |

#### Flow Effects - Control Structures

| Effect | Description | Example |
|--------|-------------|---------|
| `Condition` | Branching logic | `if (user.isAdmin)` |
| `Loop` | Iteration | `for each order in orders` |

#### Group Effects - Organization

| Effect | Description | Use |
|--------|-------------|-----|
| `System` | Top-level boundary | C4 System Context |
| `Container` | Deployment unit | C4 Container diagram |
| `Component` | Code module | C4 Component diagram |
| `File` | Code file | File-level analysis |
| `Class` | Type definition | Class diagrams |

**Relationship**: Data effects describe behavior, Flow effects control execution, Group effects provide structure.

### 5.4 Workflow Effects (Development Process)

Workflow effects describe **development activity** - triggering pipelines and coordinating work.

| Effect | Trigger | Handler |
|--------|---------|---------|
| `FileChanged` | Filesystem watch | Re-analyze, update seed |
| `SeedUpdated` | Extraction complete | Refresh hub, notify dependents |
| `ValidationResult` | Check complete | Pass/fail with diagnostics |
| `IssueClaimed` | Human/LLM action | Create worktree, branch |
| `PRMerged` | GitHub event | Clean worktree, update seeds |
| `ChangeRequested` | Human/LLM action | Route to appropriate handler |

**Validation as Workflow Effects**:

| Check | Produces | Deterministic? |
|-------|----------|----------------|
| `type-check` | `ValidationResult { pass, diagnostics }` | Yes |
| `lint-check` | `ValidationResult { pass, violations }` | Yes |
| `test-check` | `ValidationResult { pass, failures }` | Yes |
| `build-check` | `ValidationResult { pass, errors }` | Yes |

### 5.5 Effect Hierarchies

Effects form natural hierarchies - low-level compose into high-level:

| Level | Examples | Use |
|-------|----------|-----|
| **Low-level** (boundaries) | DBQuery, HTTPRequest, EmailSend | Sequence diagrams, detailed tracing |
| **High-level** (composed) | ChargePayment, AuthenticateUser, ProcessOrder | C4 diagrams, architecture docs |

```
High-Level: ChargePayment
    ├── DBQuery (user lookup)
    ├── HTTPRequest (stripe.com)
    └── EmailSend (receipt)
```

Hierarchies emerge through **Rules** that aggregate low-level effects.

### 5.6 Rules: Effect Aggregation

**Rules** transform low-level effects into high-level effects. They are the bridge between raw extraction and architectural understanding.

```
Rule: "tRPC Service Detection"
Input:  FunctionCall { name: "router.procedure" } + File { path: "*/routers/*" }
Output: Actor { name: "UserService", type: "tRPC" }
```

#### Why Rules Matter

1. **Bridge Extraction to Understanding**: AST gives symbols; Rules give meaning
2. **Enable Views**: C4 diagrams need Actors, Containers - inferred by Rules
3. **Human/LLM Collaboration Point**: LLMs propose rules, humans validate, systems execute
4. **Customization**: Different codebases have different conventions

#### Rule Properties

| Property | Description |
|----------|-------------|
| **Pattern** | What low-level effects to match |
| **Context** | What state conditions must hold |
| **Output** | What high-level effect to emit |
| **Confidence** | How certain the rule is (for LLM-proposed rules) |

#### What Rules Enable

- Automatic C4 diagram generation (actors, containers, components)
- Domain effect discovery (ChargePayment from DBQuery + HTTPRequest)
- Architecture drift detection (rules that SHOULD match but don't)
- Convention enforcement (naming patterns, file organization)

---

## 6. Effect Store

The **Effect Store** is a conceptual model for how effects flow through the system.

### 6.1 Conceptual Model

```
┌─────────────────────────────────────────────────────────┐
│                   EFFECT STORE                          │
├─────────────────────────────────────────────────────────┤
│  Effect Stream (append-only log)                        │
│  ├── Effect 1: FileChanged { path: "..." }              │
│  ├── Effect 2: FunctionCall { name: "..." }             │
│  ├── Effect 3: Store { table: "users" }                 │
│  └── ... (immutable, ordered)                           │
│                                                         │
│  Accumulated State                                      │
│  ├── hierarchy: [System, Container, Component]          │
│  ├── actors: { UserService, PaymentService }            │
│  ├── interfaces: [getUser, createPayment]               │
│  └── data: { ... extracted values ... }                 │
└─────────────────────────────────────────────────────────┘
```

### 6.2 How Pipelines Interact

- **Query→Data** writes effects to the stream, updates State
- **Vision→View** reads State to generate diagrams, validate intent
- **Question→Answer** reads State to reason, may trigger more queries

### 6.3 When Is Effect Store Needed?

| Use Case | Effect Store Needed? | Alternative |
|----------|---------------------|-------------|
| Current state queries | No | Seeds (Parquet) |
| Temporal queries ("when did this change?") | Yes, helps | Git diff + re-extract |
| Debugging extraction | Yes, helps | Verbose logging |
| Cross-pipeline coordination | Yes, helps | Seeds + invalidation signals |
| Audit trail | Yes, helps | Git history |

### 6.4 Seeds as MVP Implementation

**Seeds (Parquet files)** are the practical implementation of Accumulated State:
- Query current state efficiently
- Federate across repos via Hub
- Incremental updates via content-hash

The full Effect Stream (append-only log) is optional - implement when temporal queries become important.

---

## 7. Extraction Completeness

Two sources of truth combine for complete understanding:

**Static Extraction** (AST Analysis): Sees all code paths, all imports, all declarations. Complete but may over-report (dead code appears live).

**Runtime Extraction** (Test Execution): Sees only executed paths with real data. Precise but incomplete (only tested paths).

**Gap Analysis** reveals understanding quality:

| Finding | Static | Runtime | Meaning |
|---------|:------:|:-------:|---------|
| Both | ✓ | ✓ | **Validated** - code and tests aligned |
| Static only | ✓ | | **Investigate** - dead code or untested? |
| Runtime only | | ✓ | **Missing rule** - dynamic behavior |
| Neither | | | **Missing extraction** - no coverage |

This principle guides quality: validated paths are trusted, gaps require human judgment. Start with static extraction (works immediately), add runtime extraction for higher confidence.

---

## 8. Change Requests

### 8.1 Types of Changes

Changes vary in complexity and risk:

| Type | Scope | Planning Needed | Example |
|------|-------|-----------------|---------|
| **Trivial** | Single file, obvious | None | Fix typo |
| **Simple** | Single package, clear | Minimal | Add validation |
| **Moderate** | Multiple packages | Some | New API endpoint |
| **Complex** | Multiple repos | Significant | Cross-cutting feature |
| **Architectural** | System-wide | Extensive | Change auth system |

### 8.2 Change Lifecycle

```
Request ──> Understand ──> Plan ──> Execute ──> Validate ──> Ship

Where:
- Understand: Query seeds to grasp scope and impact
- Plan: Design approach (deterministic for simple, LLM for complex)
- Execute: Make changes (LLM for code, human review)
- Validate: Run checks (deterministic)
- Ship: PR/merge flow
```

### 8.3 Language Types by Pipeline

| Pipeline | Language Type | Who Creates | Who Consumes |
|----------|---------------|-------------|--------------|
| **Vision→View** | Natural (English, Given/When/Then) | Humans | LLMs, Systems |
| **Question→Answer** | Natural + Structured | Humans, LLMs | LLMs, Humans |
| **Query→Data** | Compiled (TypeScript, SQL) | Systems, LLMs | Systems |
| **View/Answer** | Presentation (Diagrams, Markdown) | Systems | Humans |

### 8.4 Linters as Executable Specs

A key insight: **turn human intent into machine-enforced guarantees**.

| Layer | Purpose | Example |
|-------|---------|---------|
| **AGENTS.md** | The "why" - intent, patterns, examples | "Use named exports for searchability" |
| **Lint Rules** | The "how" - executable guarantee | `no-default-export` rule blocks violations |

**Why linters matter for agents**:
- Agents use lint feedback to **self-heal** - iterate until clean
- "Lint green" becomes the definition of "done"
- Rules encode architecture, boundaries, conventions

---

## 9. Human/LLM/System Division of Labor

### 9.1 The Decision Matrix

| Task | System | LLM | Human |
|------|:------:|:---:|:-----:|
| AST Parsing | ✓ | | |
| Effect Collection | ✓ | | |
| Gap Detection | ✓ | | |
| Diagram Generation | ✓ | | |
| Pattern Recognition | | ✓ | |
| Rule Proposal | | ✓ | |
| Documentation Generation | | ✓ | |
| Vision Definition | | | ✓ |
| Rule Validation | | | ✓ |
| Architecture Review | | | ✓ |
| Convention Setting | | | ✓ |

### 9.2 Confidence Thresholds

When LLM proposes actions (rules, fixes, changes):

| Confidence | Action |
|------------|--------|
| **> 95%** | Auto-apply (log for review) |
| **80-95%** | Request human review (default accept) |
| **< 80%** | Manual review required |

### 9.3 Collaboration Patterns

**Pattern 1: Human Intent → LLM Execution → System Validation**
```
Human: "Add auth to the API"
LLM: Queries seeds, designs, implements
System: Type-check, test, lint
Human: Reviews, approves
```

**Pattern 2: System Alert → LLM Triage → Human Decision**
```
System: Test failure detected
LLM: Analyzes, proposes fixes
Human: Chooses approach
LLM: Implements fix
```

**Pattern 3: LLM Initiative → Human Approval**
```
LLM: Notices code smell while working
LLM: Proposes refactor
Human: Approves or defers
```

### 9.4 Context Preservation

The challenge: LLM sessions are stateless, but development is contextual.

**Solutions**:
1. **Seeds**: Queryable state persists across sessions
2. **Issue context**: Markdown files capture issue details
3. **Worktree naming**: Convention-based discovery (`repo-issue#-slug`)
4. **Hub federation**: Cross-repo context always available

---

## 10. Design Principles

1. **Source of truth is sacred**: Seeds are derived, never authoritative
2. **Deterministic when possible**: Push complexity to the deterministic world
3. **Queryable state**: If you can't query it, you can't reason about it
4. **Effects over actions**: Model changes as effects, not imperative steps
5. **Federation over centralization**: Each repo is autonomous; hub aggregates
6. **Graceful degradation**: System works without optional components
7. **Human oversight**: LLMs propose, humans approve (for now)
8. **Adaptability**: Design for LLM capabilities to improve
9. **Convention over configuration**: Discover structure, don't require registration

---

## 11. Adaptability Principles

### 11.1 Why Adaptability Matters

LLM capabilities change rapidly. Our system must:
- Not assume current LLM limitations are permanent
- Allow human/LLM boundary to shift over time
- Keep deterministic parts stable regardless of LLM advances

### 11.2 Stability Layers

| Layer | Stability | Can Change |
|-------|-----------|------------|
| **Concepts** (this doc) | High | Rarely |
| **Data model** (seeds) | High | Add fields, not break |
| **Query interface** (SQL/MCP) | High | Extend, not break |
| **Workflow logic** | Medium | As LLMs improve |
| **Tool implementations** | Low | Frequently |

### 11.3 Future-Proofing

1. **Seeds are format-agnostic**: Could switch from Parquet to something else
2. **Effects are abstract**: Handler implementations can change
3. **Validation is pluggable**: New checks can be added
4. **Hub is optional**: Works without federation for simple cases

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Code Effect** | Effect describing code behavior: FunctionCall, Store, Retrieve, Send |
| **Context** | The set of repos/worktrees relevant to current work |
| **Context Discovery** | Convention-based detection of related repos and worktrees |
| **CWD** | Current working directory |
| **Effect** | Immutable data describing something that happened or should happen |
| **Effect Handler** | Function: `(state, effect) => (state', [effect'])` |
| **Effect Hierarchy** | Low-level effects composing into high-level effects |
| **Effect Store** | Conceptual model: append-only Effect Stream + accumulated State |
| **Entity** | A code symbol with a unique ID |
| **Executable Spec** | Lint rule that enforces architectural intent automatically |
| **Flow Effect** | Effect for control: Condition, Loop |
| **Gap Analysis** | Comparing static vs runtime extraction to find missing coverage |
| **Group Effect** | Effect for organization: System, Container, Component, File, Class |
| **Handler** | A function that processes effects and produces new effects |
| **Hub** | Central aggregator for cross-repo queries |
| **Issue Grouping** | Collecting all worktrees for the same issueId |
| **issueId** | Identifier for an issue: `{source}{originRepo}-{number}`. Examples: `ghapi-123` (GitHub), `PROJ-456` (Jira). Parse by splitting on last `-`. |
| **MCP** | Model Context Protocol (LLM tool interface) |
| **Parent Directory** | The workspace directory above repos; enables multi-repo work |
| **Pipeline** | Data flow path (Vision→View, Question→Answer, Query→Data) |
| **Rule** | Pattern matcher that transforms/aggregates effects |
| **Runtime Extraction** | Getting effects from test execution (actual paths) |
| **Seed** | Queryable extraction of a source of truth |
| **Sibling** | Another repo in the same workspace |
| **State** | Current snapshot of the system (hierarchy, actors, interfaces, data) |
| **Static Extraction** | Getting effects from AST analysis (all possible paths) |
| **ValidationResult** | Workflow effect from checks: pass/fail with diagnostics |
| **Vision** | Why/What we're building (specs, intent, architecture) |
| **View** | How it's built (implementation, diagrams, tests) |
| **Workflow Effect** | Effect describing development activity: FileChanged, SeedUpdated |
| **Worktree** | Git worktree for isolated development, named `{worktreeRepo}-{issueId}-{slug}` |
| **Workspace** | Directory containing multiple repos |

---

## 13. What This Document Is

This is the **conceptual foundation** - the "why" and "what" of the DevAC system.

**This document defines:**
- Core concepts and terminology
- The effect handler pattern as unifying abstraction
- Code Effects (understanding code) and Workflow Effects (development process)
- Rules as the bridge from extraction to understanding
- Division of labor between humans, LLMs, and systems
- Seeds as queryable state
- Vision ↔ View loop
- Workspace topology and issue-based development

**This document does NOT define:**
- Implementation details (see [foundation-how.md](./foundation-how.md))
- API specifications (those belong in package docs)
- Step-by-step procedures (those belong in workflows)

---

*Version: 3.0 - Restructured with Code/Workflow Effects, Rules as foundational, Effect Store clarified*
*This is the "why" and "what". Implementation details ("how") belong in foundation-how.md.*
