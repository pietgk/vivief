# Plan: doc-sync - Generate Documentation from Code Analysis

> **Issue:** [#83](https://github.com/grop/vivief/issues/83)
> **Status:** IN_PROGRESS
> **Created:** 2026-01-04

## From Issue

### Core Idea
Create a `devac doc-sync` command that generates documentation artifacts from code analysis, specifically:
1. `docs/package-effects.md` - Effects documentation per package
2. `docs/c4/` - C4 PlantUML diagrams at package, repo, and workspace levels

### Federated Documentation Structure
```
workspace/
  docs/
    workspace-effects.md
    c4/                      # Workspace-level C4 diagrams

repo/
  docs/
    repo-effects.md
    c4/                      # Repo-level C4 diagrams

package/
  docs/
    package-effects.md
    c4/                      # Package-level C4 diagrams
```

### Current Status of Effects Infrastructure

| Component | Status |
|-----------|--------|
| Effects schema/types | Complete |
| SeedWriter for effects.parquet | Complete |
| EffectReader for querying | Complete |
| devac c4 command (package + hub modes) | Complete |
| MCP tools (query_effects, run_rules, generate_c4) | Complete |
| **Parser effects extraction** | **NOT IMPLEMENTED** |

The parsers currently return `effects: []` - empty arrays. The entire effects infrastructure is ready but waiting for parser implementation.

### Future Vision
- Make C4 PlantUML files browsable in markdown with legends
- Link between effects, diagrams, and source code
- Fully browsable documentation explaining system architecture

## Foundational Concepts

### 1. Review Validation Loop (Package-Level)

The effects system includes a **review validation loop** at the package level:
- Effects are extracted and stored in `effects.parquet`
- A review/verification step validates effects against actual code
- Changes to code trigger re-validation
- This keeps effects accurate and reviewed

**This concept must extend to documentation:**
- Documentation is generated from reviewed/validated effects
- Documentation changes require re-review when underlying effects change
- Package owners are responsible for their effects accuracy

### 2. Federated Approach

Documentation follows the same federated model as seeds:
- **Package level**: Each package owns its effects and documentation
- **Repo level**: Aggregates from packages, no duplication
- **Workspace level**: Queries hub, references repo docs

Benefits:
- Clear ownership at package level
- No stale documentation through aggregation
- Incremental updates possible

### 3. Git-Based Change Detection

Documentation regeneration is triggered by **git-based change detection**, not timestamps:

**Key insight**: Both seeds and docs are checked into git. This gives us:
- Base seeds = committed, stable
- Delta seeds = uncommitted changes (working state)
- Generated docs = committed alongside seeds

**Change detection strategy:**

| Trigger Context | Detection Method | Action |
|-----------------|------------------|--------|
| Pre-commit hook | `git diff --cached` on seed files | Regenerate docs for changed packages |
| Manual run | `git status` + delta seed presence | Regenerate docs needing update |
| CI/Push | Compare seed file hashes to doc metadata | Validate docs are in sync |

**Doc metadata tracking:**
Each generated doc includes a header with:
```markdown
<!-- Generated from: commit abc123, package @scope/name -->
<!-- Seed hash: sha256:... -->
```

This allows:
- Verification that docs match committed seeds
- Detection of stale docs (seed changed, docs not regenerated)
- No reliance on filesystem timestamps

```
Code Change → Parser → Seed Update → Git Stage → Doc-Sync → Stage Docs → Commit
                                         ↓
                                  Review Validation
```

## Implementation Plan

### Phase 1: Parser Effects Extraction (Foundation)

Before doc-sync can work, parsers must extract effects during AST traversal.

**Task 1.1: Define Effects Extraction Patterns**
- Identify effect types to extract: FunctionCall, Store, Retrieve, Send, Request, Response
- Define what triggers each effect type in TypeScript/Python/C# code
- Create pattern matching rules for common frameworks (Express, FastAPI, etc.)
- Document patterns for review validation

**Task 1.2: Implement TypeScript Parser Effects**
- Modify TypeScript parser to extract function calls with external indicators
- Identify I/O operations (file, network, database)
- Detect async/await patterns for external calls
- Track store operations (Redux, Zustand patterns)
- Include source location for review traceability

**Task 1.3: Implement Python Parser Effects**
- Similar implementation for Python AST
- Handle requests library, SQLAlchemy, etc.
- Framework detection (FastAPI, Flask endpoints)

**Task 1.4: Implement C# Parser Effects**
- Handle HttpClient calls
- Entity Framework operations
- Controller action detection

**Task 1.5: Effects Review Validation Integration**
- Ensure extracted effects go through validation
- Package-level approval workflow for effects
- Track review status in seed metadata

### Phase 2: doc-sync Command

**Task 2.1: Create Command Structure**
```
devac doc-sync [options]
  --package <name>    # Sync docs for specific package
  --repo <path>       # Sync docs for specific repo
  --workspace         # Sync docs for entire workspace
  --effects           # Generate effects documentation
  --c4                # Generate C4 diagrams
  --all               # Generate all documentation (default)
  --force             # Regenerate even if seeds unchanged
  --check             # Verify docs are in sync (CI mode, no writes)
  --staged            # Only process packages with staged seed changes
```

**Task 2.2: Git-Based Change Detection**
- Use `git diff` to detect seed file changes (staged and unstaged)
- Check for delta seed presence (indicates working changes)
- Hash seed file contents for stable comparison
- Store seed hash in generated documentation metadata
- Report status: in-sync, needs-update, missing

Detection logic:
```
1. For each package:
   a. Get current seed hash (base + delta merged if delta exists)
   b. Read seed hash from existing docs (if any)
   c. If hashes differ → needs regeneration
   d. If no docs exist → needs generation
   e. If hashes match → in-sync
```

**Task 2.3: Package-Level Documentation**
- Read effects from package seed (base + delta merged, must be reviewed/validated)
- Generate `docs/package-effects.md` with categorized effects
- Generate `docs/c4/` with package-scope C4 diagrams
- Include in doc header:
  - Generation metadata (seed hash, commit context)
  - Review status
- Stage generated docs alongside seed changes

**Task 2.4: Repo-Level Documentation**
- Aggregate effects from all packages in repo
- Generate `docs/repo-effects.md` (references package docs)
- Generate `docs/c4/` with repo-scope C4 diagrams
- Track aggregate seed hash for change detection

**Task 2.5: Workspace-Level Documentation**
- Query hub for all repo effects
- Generate `docs/workspace-effects.md`
- Generate `docs/c4/` with full workspace C4 diagrams
- Track combined seed hash for change detection

**Task 2.6: Integration with Git Workflow**
- Pre-commit hook support: `devac doc-sync --staged`
- CI check mode: `devac doc-sync --check` (fails if docs out of sync)
- Post-merge hook support for catching upstream changes

### Phase 3: Documentation Quality & Maintainability

**Task 3.1: Effects Markdown Format**
- Group effects by domain (Payment, Auth, Database, etc.)
- Include source file references with line numbers
- Add navigation links between related effects
- Show review/validation status per effect
- Include generation metadata header

**Task 3.2: C4 Diagram Enhancement**
- Generate all C4 levels (Context, Container, Component)
- Include legends
- Cross-reference with effects documentation
- Link back to source code

**Task 3.3: Index Generation**
- Create index files linking all documentation
- Navigation between package → repo → workspace views
- Show sync status per package

**Task 3.4: Validation Status Display**
- Indicate which effects have been reviewed
- Show last review date
- Highlight unreviewed effects for attention

## Dependencies

- Existing seed infrastructure (base + delta seeds)
- Effects schema and types
- C4 generation logic (already in MCP tools)
- Rules engine for domain classification
- Review validation workflow (existing)
- Git integration for change detection

## Risks & Considerations

1. **Parser complexity** - Extracting meaningful effects requires understanding framework patterns
2. **Review bottleneck** - Effects must be reviewed before docs are generated; need efficient workflow
3. **Accuracy** - Effects detection may have false positives/negatives; review loop catches these
4. **Hash stability** - Seed hashing must be deterministic (same content = same hash)
5. **Merge conflicts** - Generated docs may conflict on merge; consider `.gitattributes` strategies

## Maintainability Guarantees

1. **No orphaned documentation** - Docs always generated from seeds, never manual
2. **Git-based change detection** - Regenerate only when seed content changes (via hash comparison)
3. **Review chain** - Documentation reflects reviewed effects only
4. **Clear ownership** - Package owners responsible for their effects accuracy
5. **Federated aggregation** - Higher levels reference lower levels, no duplication
6. **Commit-level integrity** - Docs and seeds always in sync within a commit
7. **CI validation** - `--check` mode ensures docs never drift in main branch

## Success Criteria

- [ ] Parsers extract meaningful effects during analysis
- [ ] Effects go through review validation before documentation generation
- [ ] `devac doc-sync` uses git-based change detection (no timestamps)
- [ ] `devac doc-sync` tracks seed hashes in generated doc metadata
- [ ] `devac doc-sync --check` validates docs are in sync (for CI)
- [ ] `devac doc-sync --staged` works with pre-commit hooks
- [ ] `devac doc-sync` generates documentation at all levels
- [ ] Generated docs accurately reflect reviewed codebase architecture
- [ ] C4 diagrams render correctly in PlantUML viewers
- [ ] Documentation is navigable and cross-referenced
- [ ] Documentation shows review/validation status
- [ ] System remains maintainable with clear ownership model
