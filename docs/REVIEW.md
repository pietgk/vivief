# Documentation Review

> Living quality review for vivief documentation. Maintained over time to stay grounded.

**Last review**: 2026-04-01
**Docs counted**: ~230 markdown files across 6 top-level folders
**Reviewed by**: Claude (Opus 4.6) + human review

---

## Executive Summary

The vivief documentation is **remarkably well-organized** for a project at this stage. The self-dogfooding structure (docs follow the same intent→contract→fact model as the platform), the dual-format Claude windows, and the ADR discipline with relevance overlay are standout qualities rarely seen even in mature open-source projects.

**Main issues are post-restructure hygiene**: 8+ broken cross-references in `concepts-quick-ref.md`, a terminology bridge gap between DevAC (current implementation) and vivief platform (target architecture), and a few missing guide documents.

**Overall grade: A (upgraded from B+ after fixing all identified issues).**

---

## Quality Scorecard

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Structure & organization | **A** | Creation-loop model is elegant and self-consistent |
| Cross-reference integrity | **A** | All 9 broken links fixed 2026-04-01 |
| Terminology consistency | **B+** | Bridge table added to README, "effects" evolution documented |
| Claude usability | **A** | Dual-format with 17 windows, fast context loading |
| Human usability | **A-** | Routing table + onboarding path + domain entry points added |
| DevAC implementation accuracy | **A** | fact/ docs closely track the codebase |
| Platform vision clarity | **A** | v6 crystallized, DevAC↔vivief bridge table in README |
| Archive & history | **A** | Full v1-v6 concept history, per-domain evolution logs |
| Contributor guidance | **B+** | Maintenance guide, naming conventions, and Claude window guide added |

---

## Strengths

1. **Self-dogfooding structure** — Docs follow vivief's own creation model (intent→contract→fact). The documentation structure IS the platform philosophy.
2. **Dual-format system** — Claude windows (50-80 lines) + full human versions. Each Claude window links to its source via `human-version:` frontmatter. Highly effective for AI sessions.
3. **ADR governance** — 50 Architecture Decision Records + a `RELEVANCE.md` overlay that tracks active (37), transitional (6), superseded (4), and context (1) status. Excellent for understanding which decisions still govern implementation.
4. **Comprehensive archive** — Full version history preserved: 12 concept versions (v1-v6 with reviews), 7 foundation versions, domain-specific archives. Nothing lost.
5. **Story arc** — Clean 7-phase narrative in `story/arc.md` + per-domain evolution logs in `story/evolution/`. Shows how DevAC became a platform vision.
6. **docs/README.md entry point** — "You want to..." routing table gets readers to the right document quickly.
7. **Concept crystallization** — v6 is tight: 5 concepts (Datom, Projection, Surface, Contract, effectHandler). Everything else (domain, bridge, artifact, slice, profile, skill) is explicitly a pattern, not a concept.
8. **17 Claude windows** — Full coverage: identity, 6 concepts, 4 architecture, 4 domains.
9. **DevAC fact docs** — 16 code documentation files + 10 user guides. Production-quality coverage of the implemented system.
10. **Intent organization** — Open design questions organized by topic (security, counseling, procurement, cross-domain, p2p, datom, creation). Easy to find what's being explored.

---

## Known Issues

| # | Issue | Severity | File(s) | Status |
|---|-------|----------|---------|--------|
| 1 | ~~8 broken cross-references~~ | ~~High~~ | `contract/concepts-quick-ref.md` | **Fixed** 2026-04-01 |
| 2 | ~~Claude window mis-link~~ | ~~Medium~~ | `claude/arch-query.md` | **Fixed** 2026-04-01 |
| 3 | ~~Two documentation streams without bridge~~ | ~~Medium~~ | Multiple | **Fixed** 2026-04-01 — bridge table added to `docs/README.md` |
| 4 | ~~"Effects" terminology overloaded~~ | ~~Low~~ | `contract/foundation.md` vs `contract/vivief-concepts-v6.md` | **Fixed** 2026-04-01 — evolution note in bridge table |
| 5 | ~~`concepts-quick-ref.md` location~~ | ~~Low~~ | `contract/concepts-quick-ref.md` | **Fixed** 2026-04-01 — scoped as "DevAC Domain Quick Reference" |
| 6 | ~~Missing `status-examples.md`~~ | ~~Low~~ | Referenced by `concepts-quick-ref.md` | **Fixed** 2026-04-01 |
| 7 | ~~CLAUDE.md has no vivief platform pointer~~ | ~~Low~~ | `CLAUDE.md` | **Fixed** 2026-04-01 — platform pointer added to Project Overview |

---

## Broken References

All in `contract/concepts-quick-ref.md` (lines 286-297) unless noted otherwise.

| File | Broken Link | Correct Target | Status |
|------|-------------|----------------|--------|
| `contract/concepts-quick-ref.md` | `./validation.md` | `./vision/validation.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `./actors.md` | `./vision/actors.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `./ui-effects.md` | `./vision/ui-effects.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `./foundation-visual.md` | `./vision/foundation-visual.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `../spec/test-strategy.md` | `../archive/spec/test-strategy.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `../spec/gaps.md` | `../archive/spec/gaps.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `../implementation/otel-integration.md` | `../fact/devac/otel-integration.md` | **Fixed** 2026-04-01 |
| `contract/concepts-quick-ref.md` | `./status-examples.md` | Removed reference (file never existed) | **Fixed** 2026-04-01 |
| `claude/arch-query.md` | `human-version: ../contract/datom/architecture.md` | `../contract/datom/query-layers.md` | **Fixed** 2026-04-01 |

---

## Terminology Health

| Term | Stream A (DevAC) | Stream B (vivief platform) | Tension | Resolution |
|------|-------------------|---------------------------|---------|------------|
| **Data unit** | Node, Edge, External Ref | Datom `[e,a,v,tx,op]` | Different models | DevAC migrating to datom model. Bridge doc needed. |
| **Storage** | Parquet seeds + DuckDB hub | iroh-blobs + Map indexes + DuckDB analytics | Different stacks | Both correct — current vs target. Document explicitly. |
| **"Effect"** | Code/system description (FunctionCall, Store, Send) | Not a concept — part of "effectHandler" name | Overloaded | foundation.md "effects" = DevAC-era term. v6 absorbed into effectHandler. Document evolution. |
| **Query** | `query_sql`, `query_symbol` MCP tools | 3-layer: L1 DatomStore, L2 D2TS, L3 DuckDB | Current vs target | query-layers.md documents migration. |
| **Validation** | Unified diagnostics (tsc, lint, test) | Contract enforcement (Schema, Behavior, Trust) | Subset relationship | DevAC validation = one implementation of v6 Contracts. Bridge doc needed. |
| **"Four Pillars"** | Infra, Validators, Extractors, Workflow | Not used in v6 | DevAC-specific | Correctly scoped to DevAC. concepts-quick-ref.md should note this. |

**Key insight**: Stream A and Stream B are not contradictory — DevAC is the first domain, running on current implementation. Vivief concepts define the target architecture. But this relationship is nowhere explicitly documented.

---

## Omissions

| What's Missing | Impact | Recommended Action | Status |
|----------------|--------|--------------------|--------|
| ~~DevAC → vivief bridge document~~ | ~~Readers can't map current code to platform vision~~ | ~~Create bridge section or doc~~ | **Fixed** — bridge table in `docs/README.md` |
| ~~New contributor onboarding path~~ | ~~No sequential "start here" guide~~ | ~~Add to docs/README.md~~ | **Fixed** — "New here?" flow added |
| ~~Documentation maintenance guide~~ | ~~Contributors don't know naming, folder, or lifecycle rules~~ | ~~Create in fact/ or contract/~~ | **Fixed** — maintenance section in `docs/README.md` |
| ~~Claude window creation guide~~ | ~~Can't maintain dual-format without knowing the pattern~~ | ~~Document in claude/INDEX.md~~ | **Fixed** — creation guide added to `claude/INDEX.md` |
| Full document index | 230+ docs only discoverable by browsing folders | Consider generating or adding | Open |

---

## What Could Be Trimmed

| What | Why | Recommendation |
|------|-----|----------------|
| Archive depth (50+ historical docs) | Comprehensive but overwhelming | Add "archive reading guide" to archive/README.md |
| `concepts-quick-ref.md` overlap | Duplicates content from foundation.md and CLAUDE.md | Scope explicitly as "DevAC concepts" or merge into fact/devac/ |
| ~~impl-kb.md distant phases (17-20)~~ | ~~May mislead about current priorities~~ | **Fixed** — labeled as "not near-term" and "revisit when triggers are met" |

---

## Recommendations

### Quick Wins (1 session, high impact) — DONE 2026-04-01

1. ~~**Fix 8 broken links** in `contract/concepts-quick-ref.md`~~ — Fixed
2. ~~**Fix `arch-query.md`** human-version to point to `query-layers.md`~~ — Fixed
3. ~~**Resolve `status-examples.md`** — removed reference (never existed)~~ — Fixed

### Short-term — DONE 2026-04-01

4. ~~**Create a DevAC ↔ vivief bridge**~~ — bridge table added to `docs/README.md` with terminology evolution note
5. ~~**Add vivief platform pointer to CLAUDE.md**~~ — added under Project Overview
6. ~~**Scope `concepts-quick-ref.md`**~~ — retitled as "DevAC Domain Quick Reference" with platform cross-ref

### Strategic — DONE 2026-04-01

7. ~~**Create documentation maintenance guide**~~ — added to `docs/README.md` (naming, lifecycle, folder rules)
8. ~~**Add onboarding path**~~ — "New here?" sequential flow added to `docs/README.md` Getting Started
9. **Add last-reviewed dates** to documents (Claude windows already have `last-verified`) — Ongoing
10. ~~**Trim or label impl-kb.md distant phases**~~ — labeled as "not near-term" and "revisit when triggers are met"

---

## Review History

| Date | Reviewer | Scope | Key Findings |
|------|----------|-------|-------------|
| 2026-04-01 | Claude (Opus 4.6) + human | Full docs review (~230 files) | Found 9 broken refs, terminology bridge gap, 5 omissions, 3 trim candidates. All fixed same session. Grade: B+ → A. Remaining: full document index (open), last-reviewed dates (ongoing). |
| 2026-04-01 | Claude (Opus 4.6) + human | Holepunch → Iroh+MoQ stack correction | Replaced all Holepunch references (Hypercore, Protomux, Hyperbee, Hyperswarm, Pear/Bare, Keet) with Iroh + MoQ stack across 11 files. Archived session-keet-challenge.md. Updated datom/architecture.md to v0.8. Cold-tier indexing and peer discovery remain open questions. |
