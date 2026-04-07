# Documentation Review

> Living quality review for vivief documentation. Maintained over time to stay grounded.

**Last review**: 2026-04-07
**Docs counted**: ~245 markdown files across 6 top-level folders
**Reviewed by**: Claude (Opus 4.6) + human review

---

## Executive Summary

The vivief documentation is **remarkably well-organized** for a project at this stage. The self-dogfooding structure (docs follow the same intent→contract→fact model as the platform), the dual-format Claude windows, and the ADR discipline with relevance overlay are standout qualities rarely seen even in mature open-source projects.

**Round 2 focus**: 15 new/modified docs since 2026-04-01 — primarily `intent/creation/` design docs (6 new), 2 new ADRs (0050, 0051), and fractal-software-factory vision + Claude window. Found 5 broken links in ADR-0050, one scribble-phase doc depended upon by near-lock docs, and strong v6 terminology consistency across all new content.

**Overall grade: A (maintained from round 1). New content is high quality; ADR-0050 link rot is the main hygiene issue.**

---

## Quality Scorecard

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Structure & organization | **A** | Creation-loop model is elegant and self-consistent |
| Cross-reference integrity | **A** | ADR-0050 broken links fixed 2026-04-07; ADR-0051 refs verified clean |
| Terminology consistency | **A-** | v6 concepts used consistently in all 15 new docs; new terms (aperture, intake, role) lack formal registry |
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
3. **ADR governance** — 51 Architecture Decision Records + a `RELEVANCE.md` overlay that tracks active (38), transitional (6), superseded (5), and context (1) status. Excellent for understanding which decisions still govern implementation.
4. **Comprehensive archive** — Full version history preserved: 12 concept versions (v1-v6 with reviews), 7 foundation versions, domain-specific archives. Nothing lost.
5. **Story arc** — Clean 7-phase narrative in `story/arc.md` + per-domain evolution logs in `story/evolution/`. Shows how DevAC became a platform vision.
6. **docs/README.md entry point** — "You want to..." routing table gets readers to the right document quickly.
7. **Concept crystallization** — v6 is tight: 5 concepts (Datom, Projection, Surface, Contract, effectHandler). Everything else (domain, bridge, artifact, slice, profile, skill) is explicitly a pattern, not a concept.
8. **18 Claude windows** — Full coverage: identity, 7 concepts (added fractal-software-factory), 4 architecture, 4 domains.
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
| 8 | ~~5 broken references in ADR-0050~~ | ~~High~~ | `contract/adr/0050-tech-stack.md` | **Fixed** 2026-04-07 — paths corrected to actual file locations |
| 9 | Scribble-phase doc depended upon | Medium | `intent/creation/high-level-concepts.md` | **Open** — referenced by effecthandler-roles.md and knowledge-acquisition.md but explicitly "scribble phase" |
| 10 | New terms lack formal registry | Low | Multiple `intent/creation/` docs | **Open** — aperture, intake, role, researcher, improver introduced without a terminology index |

---

## Broken References

### Round 1 (2026-04-01) — All Fixed

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

### Round 2 (2026-04-07) — All Fixed

All in `contract/adr/0050-tech-stack.md` (Context + References sections). Root cause: ADR-0050 was written assuming a `vision/brainstorms/` directory that was later reorganized into `archive/p2p/` and `contract/p2p/`.

| File | Broken Link | Correct Target | Status |
|------|-------------|----------------|--------|
| `contract/adr/0050-tech-stack.md` | `../vision/vivief-concepts-v6.md` | `../vivief-concepts-v6.md` | **Fixed** 2026-04-07 |
| `contract/adr/0050-tech-stack.md` | `../vision/vivief-concepts-v6-implementation-kb.md` | `../../archive/vivief-concepts/vivief-concepts-implementation-kb.md` (v6 version never created) | **Fixed** 2026-04-07 |
| `contract/adr/0050-tech-stack.md` | `../vision/brainstorms/vivief-p2p-lean-stack-adr.md` | `../../archive/p2p/vivief-p2p-lean-stack-adr.md` | **Fixed** 2026-04-07 |
| `contract/adr/0050-tech-stack.md` | `../vision/brainstorms/vivief-p2p-lean-stack-adr-v2.md` | `../p2p/lean-stack-v2.md` | **Fixed** 2026-04-07 |
| `contract/adr/0050-tech-stack.md` | `../vision/brainstorms/datom-data-world-v0.7.md` | `../../archive/datom-data-world/datom-data-world-v0.6.md` (v0.7 never created) | **Fixed** 2026-04-07 |

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
| Doc discoverability | 230+ docs invisible to devac — not in the code graph | Make docs first-class devac entities (see [intent/creation/doc-discovery.md](intent/creation/doc-discovery.md)) | Open — design exploration |

---

## What Could Be Trimmed

| What | Why | Recommendation |
|------|-----|----------------|
| Archive depth (50+ historical docs) | Comprehensive but overwhelming | Add "archive reading guide" to archive/README.md |
| `concepts-quick-ref.md` overlap | Duplicates content from foundation.md and CLAUDE.md | Scope explicitly as "DevAC concepts" or merge into fact/devac/ |
| ~~impl-kb.md distant phases (17-20)~~ | ~~May mislead about current priorities~~ | **Fixed** — labeled as "not near-term" and "revisit when triggers are met" |

---

## Recommendations

### Round 1 (2026-04-01) — All Complete

1. ~~**Fix 8 broken links** in `contract/concepts-quick-ref.md`~~ — Fixed
2. ~~**Fix `arch-query.md`** human-version to point to `query-layers.md`~~ — Fixed
3. ~~**Resolve `status-examples.md`** — removed reference (never existed)~~ — Fixed
4. ~~**Create a DevAC ↔ vivief bridge**~~ — bridge table added to `docs/README.md`
5. ~~**Add vivief platform pointer to CLAUDE.md**~~ — added under Project Overview
6. ~~**Scope `concepts-quick-ref.md`**~~ — retitled as "DevAC Domain Quick Reference"
7. ~~**Create documentation maintenance guide**~~ — added to `docs/README.md`
8. ~~**Add onboarding path**~~ — "New here?" flow added to `docs/README.md`
9. **Add last-reviewed dates** to documents — Ongoing
10. ~~**Trim or label impl-kb.md distant phases**~~ — labeled as "not near-term"

### Round 2 (2026-04-07)

11. ~~**Fix 5 broken links in ADR-0050**~~ — Fixed (paths corrected to actual locations)
12. **Mature `high-level-concepts.md`** — Either restructure into a proper design doc or remove references from effecthandler-roles.md (line 64) and knowledge-acquisition.md. Currently scribble-phase but depended upon.
13. **Consider a terminology registry** — New terms (aperture, intake, role, researcher, improver) are introduced cleanly but scattered across `intent/creation/` docs. A lightweight index (e.g., `intent/creation/glossary.md`) would help readers unfamiliar with the full doc set.
14. **Lock `knowledge-acquisition.md`** — Strongest new doc. Ready to move from intent/ to contract/ after high-level-concepts dependency is resolved.
15. **Lock `effecthandler-roles.md`** — Near-lock quality. Same high-level-concepts dependency as above.

---

## New Document Assessment (Round 2)

15 files added/modified since 2026-04-01. The `intent/creation/` cluster forms a coherent design family around knowledge acquisition, handler roles, and proactive improvement.

| Document | Maturity | Grade | Notes |
|----------|----------|-------|-------|
| `intent/creation/knowledge-acquisition.md` | Near-lock | **A** | Comprehensive. Sources, research depth, provenance model, freshness strategies. Strongest new doc. |
| `intent/creation/effecthandler-roles.md` | Near-lock | **A-** | Role as third dimension (alongside Level + Strategy). Clean role taxonomy. Depends on scribble-phase doc. |
| `intent/creation/linear-meets-vivief.md` | Brainstorm | **A-** | Maps Linear's vision to vivief. Introduces aperture + intake pattern. Well-grounded in v6. |
| `intent/creation/proactive-improvement.md` | Open | **B+** | Aggregation Contracts triggering improvement. Good concept, examples still pseudocode. |
| `intent/p2p/node-architecture.md` | Design | **A-** | Major 516-line brainstorm. Source for ADR-0051. 9 open questions remain. |
| `contract/adr/0051-tech-stack.md` | Proposed | **A** | Supersedes 0050. P2P node architecture, revised storage tiers, clear rationale. All refs verified. |
| `contract/adr/0050-tech-stack.md` | Superseded | **B+** | Good umbrella ADR. Had 5 broken links (now fixed). Correctly superseded by 0051. |
| `contract/vision/fractal-software-factory.md` | Locked | **A** | Clean vision doc with matching Claude window. Listed in INDEX.md. |
| `intent/creation/high-level-concepts.md` | Scribble | **C+** | Raw brainstorm notes. Referenced by better docs but too informal to serve as reference. |
| `intent/creation/doc-discovery.md` | Exploration | **B** | Product spec for making docs DevAC-visible. More roadmap than design concept. |

### Terminology Consistency

All v6 concepts (Datom, Projection, Surface, Contract, effectHandler) used correctly and consistently across all 15 new docs. No terminology conflicts detected.

New terms introduced cleanly but without formal definitions:
- **Aperture** — parameter on Projection controlling possibility flow (`linear-meets-vivief.md`)
- **Intake** — seventh pattern, unidirectional bridge for external signals (`linear-meets-vivief.md`)
- **Role** — third orthogonal dimension on effectHandlers (`effecthandler-roles.md`)
- **Researcher / Improver** — effectHandler roles (`knowledge-acquisition.md`, `proactive-improvement.md`)

### ADR Governance

- ADR README.md correctly lists 0050 (Superseded) and 0051 (Proposed)
- RELEVANCE.md correctly tracks 0050 as Superseded by 0051, 0051 as Active
- Updated counts: 38 Active, 6 Transitional, 5 Superseded (0046-0050), 1 Context

---

## Review History

| Date | Reviewer | Scope | Key Findings |
|------|----------|-------|-------------|
| 2026-04-07 | Claude (Opus 4.6) + human | Round 2: 15 new/modified docs since 2026-04-01 | Fixed 5 broken ADR-0050 links (stale `vision/brainstorms/` paths). 6 new intent/creation docs reviewed — knowledge-acquisition and effecthandler-roles near lock-ready. high-level-concepts.md is scribble-phase but depended upon (open issue). v6 terminology consistent across all new content. ADR-0051 governance correct. Grade: A maintained. |
| 2026-04-01 | Claude (Opus 4.6) + human | Full docs review (~230 files) | Found 9 broken refs, terminology bridge gap, 5 omissions, 3 trim candidates. All fixed same session. Grade: B+ → A. Remaining: full document index (open), last-reviewed dates (ongoing). |
| 2026-04-01 | Claude (Opus 4.6) + human | Holepunch → Iroh+MoQ stack correction | Replaced all Holepunch references (Hypercore, Protomux, Hyperbee, Hyperswarm, Pear/Bare, Keet) with Iroh + MoQ stack across 11 files. Archived session-keet-challenge.md. Updated datom/architecture.md to v0.8. Cold-tier indexing and peer discovery remain open questions. |
| 2026-04-01 | Claude (Opus 4.6) + human | Lens/Seal → Projection terminology cleanup | Updated 7→5 concept terminology across 10 active docs. Lens→Projection, Seal→Projection encryption. Key files: platform-v2.md (§2.2, §2.4 rewritten), challenge.md (staleness note + ~25 refs), arch-security.md, domain-counseling.md, story-arc.md, INDEX.md, concepts-vs-nats.md, content-translation.md, counseling evolution. Archive/ left as historical. |
