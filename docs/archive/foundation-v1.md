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

## 3. The Two Worlds

Development splits into two fundamentally different domains:

### 3.1 Deterministic World (Systems Handle)

Things that can be computed, verified, or extracted programmatically:

- **Extraction**: AST parsing, dependency graphs, type information
- **Validation**: Type-check, lint-check, test-check, build-check
- **State queries**: "What functions call X?", "What files changed?", "What PRs are open?"
- **Transformations**: Formatting, import sorting, simple refactors

### 3.2 Non-Deterministic World (Humans/LLMs Handle)

Things requiring judgment, creativity, or contextual understanding:

- **Intent interpretation**: Understanding what a vague request means
- **Design decisions**: Architecture, API design, naming
- **Problem solving**: Debugging, root cause analysis
- **Prioritization**: What to work on, when to ship
- **Communication**: PR descriptions, commit messages, documentation

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

## 5. State Machine Model

### 5.1 Core Formula

```
effectHandler = (state, effect) => (state', [effect'])
```

Everything in development can be modeled as:
- **State**: Current snapshot (code, issues, PRs, seeds, worktrees)
- **Effects**: Events that trigger transitions (file change, PR merged, test failed)
- **Handlers**: Logic that produces new state and potentially more effects

### 5.2 State Categories

| Category | Examples | Storage |
|----------|----------|---------|
| **Code State** | Files, AST, symbols, edges | Seeds (Parquet) |
| **Issue State** | Open/closed, assigned, labels | GitHub API → Seed |
| **Worktree State** | Active worktrees, their issues | `~/.devac/worktrees.json` |
| **Validation State** | Last check results, pass/fail | Cache/seed |
| **PR State** | Draft/ready, checks, reviews | GitHub API → Seed |

### 5.3 Effect Types

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

---

## 7. Human/LLM Collaboration Model

### 7.1 Roles

| Actor | Strengths | Weaknesses |
|-------|-----------|------------|
| **Human** | Judgment, priorities, approval, intent | Slow, context-limited |
| **LLM** | Speed, breadth, consistency, exploration | No ground truth, may hallucinate |
| **System** | Determinism, scale, precision | No creativity |

### 7.2 Collaboration Patterns

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

### 7.3 Context Preservation

The challenge: LLM sessions are stateless, but development is contextual.

**Solutions**:
1. **Seeds**: Queryable state persists across sessions
2. **Issue context**: Markdown files capture issue details
3. **Worktree state**: Tracks which issues are active where
4. **Hub federation**: Cross-repo context always available

---

## 8. Adaptability Principles

### 8.1 Why Adaptability Matters

LLM capabilities change rapidly. Our system must:
- Not assume current LLM limitations are permanent
- Allow human/LLM boundary to shift over time
- Keep deterministic parts stable regardless of LLM advances

### 8.2 Stability Layers

| Layer | Stability | Can Change |
|-------|-----------|------------|
| **Concepts** (this doc) | High | Rarely |
| **Data model** (seeds) | High | Add fields, not break |
| **Query interface** (SQL/MCP) | High | Extend, not break |
| **Workflow logic** | Medium | As LLMs improve |
| **Tool implementations** | Low | Frequently |

### 8.3 Future-Proofing

1. **Seeds are format-agnostic**: Could switch from Parquet to something else
2. **Effects are abstract**: Handler implementations can change
3. **Validation is pluggable**: New checks can be added
4. **Hub is optional**: Works without federation for simple cases

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **CWD** | Current working directory |
| **Effect** | An event that triggers state change |
| **Entity** | A code symbol with a unique ID |
| **Hub** | Central aggregator for cross-repo queries |
| **MCP** | Model Context Protocol (LLM tool interface) |
| **Parent** | The workspace directory above repos |
| **Seed** | Queryable extraction of a source of truth |
| **Sibling** | Another repo in the same workspace |
| **State** | Current snapshot of the system |
| **Worktree** | Git worktree for isolated development |
| **Workspace** | Directory containing multiple repos |

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

---

## Next Steps

This document defines the conceptual foundation. The next steps would be:

1. **State machine diagrams**: Visualize the effect flows
2. **Seed schemas**: Define the data models for each seed type
3. **MCP tool catalog**: Document all queryable operations
4. **Workflow specifications**: Detail the change request flows
5. **Integration patterns**: How to connect new sources of truth

---

*This is the "why" and "what" - the foundation. Implementation details ("how") belong in code and package documentation.*
