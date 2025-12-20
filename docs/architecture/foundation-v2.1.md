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
| **Issue** | A change request tied to a specific repo | `api-123` (repo-issue#) |
| **Entity** | A code symbol (function, class, etc.) | `repo:package:kind:hash` |
| **Seed** | Queryable extraction of a source of truth | `.devac/seed/nodes.parquet` |

### 2.3 Workspaces

| Concept | Definition |
|---------|------------|
| **Claude Session** | A Claude CLI session with a specific working directory |
| **Claude CWD** | Either a repo, a worktree, or the parent directory |
| **Session Scope** | From parent dir: can query/edit all repos. From repo/worktree: focused scope |

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

## 5. The Unified Pattern: Everything is an Effect Handler

### 5.1 Core Formula

```
effectHandler = (state, effect) => (state', [effect'])
```

**This is the entire pattern.** Everything maps to it:
- HTTP: Request effect → Response effect
- Actors: InvokeHandler effects
- State Machines: Event effect → Action effects
- Routing: Navigate effect → Render effects
- Deep Links: Navigate effect → Screen effects

### 5.2 Effects as Data

Effects are **immutable observations** about what happens. Two primitives:

1. **Effect** - A description of something to do (data, not function)
2. **Handler** - A function that processes effects and produces new effects

### 5.3 Effect Taxonomy by Semantic Role

```
┌─────────────────────────────────────────────────────────┐
│ DATA EFFECTS - Observations, Inputs, Outputs            │
├─────────────────────────────────────────────────────────┤
│ Event     │ Something happened                          │
│ Message   │ Communication payload                       │
│ Vision    │ High-level intent (from humans)             │
│ Question  │ Query for reasoning (from humans)           │
│ Answer    │ Reasoning result (from LLM)                 │
│ View      │ Presentation format (for humans)            │
│ Request   │ Asking for something                        │
│ Response  │ Answering a request                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DO EFFECTS - Actions                                    │
├─────────────────────────────────────────────────────────┤
│ FunctionCall │ Code execution                           │
│ Send         │ Transmit data                            │
│ Store        │ Persist data                             │
│ Retrieve     │ Fetch data                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ FLOW EFFECTS - Control Structures                       │
├─────────────────────────────────────────────────────────┤
│ Condition    │ Branching logic                          │
│ Loop         │ Iteration                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ GROUP EFFECTS - Organization Structures                 │
├─────────────────────────────────────────────────────────┤
│ System       │ Top-level system boundary                │
│ Container    │ Deployment unit                          │
│ Component    │ Code module                              │
│ File         │ Code file                                │
│ Class        │ Type definition                          │
└─────────────────────────────────────────────────────────┘
```

**Relationship**: Data triggers Do, Flow controls Do, Group contains all.

### 5.4 Effect Hierarchies

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

Hierarchies emerge through Rules that aggregate low-level effects.

### 5.5 State Categories

| Category | Examples | Storage |
|----------|----------|---------|
| **Code State** | Files, AST, symbols, edges | Seeds (Parquet) |
| **Issue State** | Open/closed, assigned, labels | GitHub API → Seed |
| **Worktree State** | Active worktrees, their issues | Convention-based discovery |
| **Validation State** | Last check results, pass/fail | Cache/seed |
| **PR State** | Draft/ready, checks, reviews | GitHub API → Seed |

### 5.6 Development Effects

| Effect | Trigger | Handler |
|--------|---------|---------|
| `FileChanged` | fs watch | Re-analyze, update seed |
| `IssueClaimed` | Human/LLM | Create worktree, branch |
| `ValidationFailed` | Check result | Block PR, notify |
| `PRMerged` | GitHub event | Clean worktree, update seeds |
| `ChangeRequested` | Human/LLM | Route to appropriate handler |

---

## 6. Change Requests

### 6.1 Types of Changes

Changes vary in complexity and risk:

| Type | Scope | Planning Needed | Example |
|------|-------|-----------------|---------|
| **Trivial** | Single file, obvious | None | Fix typo |
| **Simple** | Single package, clear | Minimal | Add validation |
| **Moderate** | Multiple packages | Some | New API endpoint |
| **Complex** | Multiple repos | Significant | Cross-cutting feature |
| **Architectural** | System-wide | Extensive | Change auth system |

### 6.2 Change Lifecycle

```
Request ──> Understand ──> Plan ──> Execute ──> Validate ──> Ship

Where:
- Understand: Query seeds to grasp scope and impact
- Plan: Design approach (deterministic for simple, LLM for complex)
- Execute: Make changes (LLM for code, human review)
- Validate: Run checks (deterministic)
- Ship: PR/merge flow
```

### 6.3 Validation Checks

All changes must pass validation before shipping:

| Check | What it Validates | Deterministic? |
|-------|-------------------|----------------|
| `type-check` | Types are consistent | Yes |
| `lint-check` | Code style/patterns | Yes |
| `test-check` | Tests pass | Yes |
| `build-check` | Compiles successfully | Yes |
| `doc-check` | Docs are current | Partially |
| `adr-check` | Decisions documented | Partially |
| `changelog-check` | Changes documented | Partially |
| `commit-check` | Commit format valid | Yes |
| `pr-check` | PR requirements met | Mostly |

### 6.4 Language Types by Pipeline

| Pipeline | Language Type | Who Creates | Who Consumes |
|----------|---------------|-------------|--------------|
| **Vision→View** | Natural (English, Given/When/Then) | Humans | LLMs, Systems |
| **Question→Answer** | Natural + Structured | Humans, LLMs | LLMs, Humans |
| **Query→Data** | Compiled (TypeScript, SQL) | Systems, LLMs | Systems |
| **View/Answer** | Presentation (Diagrams, Markdown) | Systems | Humans |

**Why this matters**: Each language type is optimized for its purpose:
- Natural language for human intent (intuition, domain knowledge)
- Compiled language for precision (types, execution)
- Presentation language for validation (visual understanding)

### 6.5 Linters as Executable Specs

A key insight: **turn human intent into machine-enforced guarantees**.

| Layer | Purpose | Example |
|-------|---------|---------|
| **AGENTS.md** | The "why" - intent, patterns, examples | "Use named exports for searchability" |
| **Lint Rules** | The "how" - executable guarantee | `no-default-export` rule blocks violations |

**Why linters matter for agents**:
- Agents use lint feedback to **self-heal** - iterate until clean
- "Lint green" becomes the definition of "done"
- Rules encode architecture, boundaries, conventions
- Same rules run in editor, pre-commit, CI, and agent loops

**Categories of agent-friendly rules**:
- **Searchability**: Named exports, consistent naming (grep-ability)
- **Predictability**: File organization conventions (glob-ability)
- **Boundaries**: Module access restrictions, layer separation
- **Safety**: Security patterns, input validation

---

## 7. Human/LLM/System Division of Labor

### 7.1 The Decision Matrix

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

### 7.2 Confidence Thresholds

When LLM proposes actions (rules, fixes, changes):

| Confidence | Action |
|------------|--------|
| **> 95%** | Auto-apply (log for review) |
| **80-95%** | Request human review (default accept) |
| **< 80%** | Manual review required |

### 7.3 Collaboration Patterns

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

### 7.4 Context Preservation

The challenge: LLM sessions are stateless, but development is contextual.

**Solutions**:
1. **Seeds**: Queryable state persists across sessions
2. **Issue context**: Markdown files capture issue details
3. **Worktree naming**: Convention-based discovery (`repo-issue#-slug`)
4. **Hub federation**: Cross-repo context always available

---

## 8. Static vs Runtime: Complementary Extraction

Two sources of truth that combine for complete understanding:

### 8.1 Static Extraction (AST Analysis)

**What it sees**: All code paths, all imports, all declarations
**What it captures**: Every possible behavior
**Strengths**: Complete, fast, works on untestable code
**Weaknesses**: Can't resolve dynamic calls, over-reports

### 8.2 Runtime Extraction (Test Execution)

**What it sees**: Only executed paths
**What it captures**: Actual behavior with real data
**Strengths**: Proves actual behavior, resolves dynamic calls
**Weaknesses**: Only sees tested paths, requires runnable tests

### 8.3 Gap Analysis

Comparing static and runtime extraction reveals:

| Finding | Static | Runtime | Meaning |
|---------|:------:|:-------:|---------|
| Both | ✓ | ✓ | **Validated** - code and tests aligned |
| Static only | ✓ | | **Investigate** - dead code or untested path? |
| Runtime only | | ✓ | **Missing rule** - dynamic code or wrapper gap |
| Neither | | | **Missing wrapper** - no effect captured |

### 8.4 Progressive Instrumentation

You don't need full instrumentation to get value:

| Level | What to Wrap | Effort | Value |
|-------|--------------|--------|-------|
| **Level 1** | Nothing (baseline) | 0% | Tests pass/fail only |
| **Level 2** | Boundaries only (tRPC, DB, APIs) | 20% | 50% value - C4 diagrams, high-level effects |
| **Level 3** | Full wrappers | 80% | 100% value - complete tracing |

---

## 9. Adaptability Principles

### 9.1 Why Adaptability Matters

LLM capabilities change rapidly. Our system must:
- Not assume current LLM limitations are permanent
- Allow human/LLM boundary to shift over time
- Keep deterministic parts stable regardless of LLM advances

### 9.2 Stability Layers

| Layer | Stability | Can Change |
|-------|-----------|------------|
| **Concepts** (this doc) | High | Rarely |
| **Data model** (seeds) | High | Add fields, not break |
| **Query interface** (SQL/MCP) | High | Extend, not break |
| **Workflow logic** | Medium | As LLMs improve |
| **Tool implementations** | Low | Frequently |

### 9.3 Future-Proofing

1. **Seeds are format-agnostic**: Could switch from Parquet to something else
2. **Effects are abstract**: Handler implementations can change
3. **Validation is pluggable**: New checks can be added
4. **Hub is optional**: Works without federation for simple cases

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **CWD** | Current working directory |
| **Data Effect** | Effect representing observations: Event, Message, Vision, Question, Answer |
| **Do Effect** | Effect representing actions: FunctionCall, Send, Store, Retrieve |
| **Effect** | Immutable data describing something that happened or should happen |
| **Effect Handler** | Function: `(state, effect) => (state', [effect'])` |
| **Effect Hierarchy** | Low-level effects composing into high-level effects |
| **Entity** | A code symbol with a unique ID |
| **Executable Spec** | Lint rule that enforces architectural intent automatically |
| **Flow Effect** | Effect for control: Condition, Loop |
| **Gap Analysis** | Comparing static vs runtime extraction to find missing coverage |
| **Group Effect** | Effect for organization: System, Container, Component, File, Class |
| **Handler** | A function that processes effects and produces new effects |
| **Hub** | Central aggregator for cross-repo queries |
| **MCP** | Model Context Protocol (LLM tool interface) |
| **Parent** | The workspace directory above repos |
| **Pipeline** | Data flow path (Vision→View, Question→Answer, Query→Data) |
| **Rule** | Pattern matcher that transforms/aggregates effects |
| **Seed** | Queryable extraction of a source of truth |
| **Sibling** | Another repo in the same workspace |
| **State** | Current snapshot of the system (hierarchy, actors, interfaces, data, questions) |
| **Static Extraction** | Getting effects from AST analysis (all possible paths) |
| **Runtime Extraction** | Getting effects from test execution (actual paths) |
| **Vision** | Why/What we're building (specs, intent, architecture) |
| **View** | How it's built (implementation, diagrams, tests) |
| **Worktree** | Git worktree for isolated development |
| **Workspace** | Directory containing multiple repos |

---

## 11. Design Principles

1. **Source of truth is sacred**: Seeds are derived, never authoritative
2. **Deterministic when possible**: Push complexity to the deterministic world
3. **Queryable state**: If you can't query it, you can't reason about it
4. **Effects over actions**: Model changes as effects, not imperative steps
5. **Federation over centralization**: Each repo is autonomous; hub aggregates
6. **Graceful degradation**: System works without optional components
7. **Human oversight**: LLMs propose, humans approve (for now)
8. **Adaptability**: Design for LLM capabilities to improve

---

## 12. What This Document Is

This is the **conceptual foundation** - the "why" and "what" of the DevAC system.

**This document defines:**
- Core concepts and terminology
- The effect handler pattern as unifying abstraction
- Division of labor between humans, LLMs, and systems
- Seeds as queryable state
- Vision ↔ View loop

**This document does NOT define:**
- Implementation details (those belong in code)
- API specifications (those belong in package docs)
- Step-by-step procedures (those belong in workflows)

**Next conceptual documents to create:**
1. **Effect Catalog**: All effect types and their semantics
2. **Rule Patterns**: How to write extraction and validation rules
3. **Workflow Specifications**: Detail the change request flows

---

## Key Sources

This document synthesizes concepts from:

**Core VVE System:**
- `packages/architecture/specs/334-vision-view-effect-system-v1.1.md` - Original VVE concept
- `packages/architecture/specs/334-vision-view-effect-system-v2.0.md` - Effect taxonomy, pipelines
- `packages/architecture/specs/UNIFIED-PATTERN.md` - Universal effect handler pattern

**Supporting Concepts:**
- `packages/architecture/specs/335-linters-as-rules.md` - Linters as executable specs
- `packages/architecture/specs/335-otel-overlap-analysis.md` - OTEL integration insights
- `packages/architecture/specs/335-planning-v2.1.md` - Shared Effect Store pattern
- `packages/architecture/specs/208-rules-interference-system.md` - Rules engine

**Implementation:**
- `vivief/` - DevAC implementation (DuckDB + Parquet seeds)

---

*Version: 2.1 - Fully integrated VVE v2.0 concepts + Linters as Executable Specs*
*This is the "why" and "what". Implementation details ("how") belong in code.*
