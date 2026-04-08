# Documentation Review

> Living quality review for vivief documentation. Maintained over time to stay grounded.

**Last review**: 2026-04-08
**Docs counted**: ~291 markdown files across 6 top-level folders
**Reviewed by**: Claude (Opus 4.6) + human review

---

## Executive Summary

The vivief documentation is **remarkably well-organized** for a project at this stage. The self-dogfooding structure (docs follow the same intent→contract→fact model as the platform), the dual-format Claude windows, and the ADR discipline with relevance overlay are standout qualities rarely seen even in mature open-source projects.

**Round 2 focus**: 15 new/modified docs since 2026-04-01 — primarily `intent/creation/` design docs (6 new), 2 new ADRs (0050, 0051), and fractal-software-factory vision + Claude window. Found 5 broken links in ADR-0050, one scribble-phase doc depended upon by near-lock docs, and strong v6 terminology consistency across all new content.

**Round 3 focus**: Complete intent triage — all 34 intent files inventoried and assigned to one of 6 action buckets (Promote, Design, Consolidate, Update, Park, Archive). Dependency tree mapped across 6 key decisions. 8 stale-tech files flagged, 5 consolidation targets identified. After immediate actions: 34 → ~13 active intents.

**Overall grade: A (maintained). Intent organization upgraded from implicit to structured triage. No new hygiene issues.**

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
| 9 | ~~Scribble-phase doc depended upon~~ | ~~Medium~~ | `intent/creation/high-level-concepts.md` | **Fixed** 2026-04-07 — archived; refs repointed to `creation-loop-extensions.md`; orphaned ideas extracted to `session-harness.md` and `multi-agent-primitives.md` |
| 10 | ~~New terms lack formal registry~~ | ~~Low~~ | Multiple `intent/creation/` docs | **Fixed** 2026-04-07 — terms defined at source docs (aperture/intake in `creation-loop-extensions.md`, role in `effecthandler-roles.md`) |

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
| Doc discoverability | 290+ docs invisible to devac — not in the code graph | Make docs first-class devac entities (see [archive/brainstorms/doc-discovery.md](archive/brainstorms/doc-discovery.md)) | Archived — concept explored, not yet actionable |

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

11. ~~**Fix 5 broken links in ADR-0050**~~ — Fixed
12. ~~**Mature `high-level-concepts.md`**~~ — Archived. Refs repointed to `creation-loop-extensions.md`. Orphaned ideas extracted to `session-harness.md` and `multi-agent-primitives.md`.
13. ~~**Consider a terminology registry**~~ — Terms defined at their source docs. No separate glossary.
14. **Lock `knowledge-acquisition.md`** — Ready to move from intent/ to contract/ in next plan.
15. **Lock `effecthandler-roles.md`** — Ready to move from intent/ to contract/ in next plan.
16. **Brainstorm `proactive-improvement.md`** — Open questions documented (Aggregation Contract schema, approval workflow, Researcher↔Improver handoff). Karpathy autoresearch reference added for future brainstorm.

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

## Round 3: Intent Triage (2026-04-08)

34 intent files across 9 topic areas. Every file gets exactly one action verb — no "keep exploring."

### Triage Framework

| Category | Symbol | What happens next |
|----------|--------|-------------------|
| **PROMOTE** | ↑ | Ready for contract. Write contract, archive intent. |
| **DESIGN** | ✎ | Needs focused interview to resolve open questions, then promote. |
| **CONSOLIDATE** | ⇒ | Overlaps with another doc. Merge into stronger doc, archive weaker. |
| **UPDATE** | ↻ | Valid reasoning but stale tech refs. Fix refs, then re-assess. |
| **PARK** | ■ | Blocked or too early. Leave with explicit "revisit when X" trigger. |
| **ARCHIVE** | × | Superseded or completed. Move to `archive/`. |

### Complete Intent Inventory

#### creation/ (11 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `knowledge-acquisition.md` | 14KB | **↑ PROMOTE** | Write contract (pair with effecthandler-roles) | — |
| `effecthandler-roles.md` | 6.4KB | **↑ PROMOTE** | Write contract (pair with knowledge-acquisition) | — |
| `proactive-improvement.md` | 8.6KB | **✎ DESIGN** | Interview: resolve schema shape, approval workflow, Researcher↔Improver handoff | Roles, Knowledge Acq |
| `creation-is-what-we-do.md` | 29KB | **⇒ CONSOLIDATE** | Thesis absorbed into `fractal-software-factory.md`. Archive with attribution. | — |
| `developer-flow.md` | 40KB | **↻ UPDATE** | Fix stale Hypercore ref, then interview on bidirectional bridge design | — |
| `creation-loop-experiments.md` | 3.2KB | **■ PARK** | Revisit when aperture exists in code | Aperture implementation |
| `creation-review.md` | 2.5KB | **× ARCHIVE** | Tracking doc, all items resolved. No remaining design content. | — |
| `multi-agent-primitives.md` | 3KB | **■ PARK** | Revisit when first multi-handler creation loop runs | effectHandler composition |
| `session-harness.md` | 2.4KB | **⇒ CONSOLIDATE** | Fold into knowledge-acquisition contract §3 (context composition) | Knowledge Acq promotion |
| `chicken-and-egg.md` | 1.4KB | **× ARCHIVE** | Meta-observation, insight internalized in docs lifecycle model | — |
| `morning-brief-intent.md` | 2.5KB | **■ PARK** | Revisit after knowledge-acquisition contract exists | Knowledge Acq promotion |

#### procurement/ (7 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `primitives.md` | 17KB | **✎ DESIGN** | Interview: vivief-level concept or procurement-domain-specific? | — |
| `schema-first.md` | 4.9KB | **⇒ CONSOLIDATE** | Resolve A/B with hybrid-progressive → single phased procurement contract section | — |
| `hybrid-progressive.md` | 4.7KB | **⇒ CONSOLIDATE** | Same — merge with schema-first into phased approach | — |
| `self-organizing-pipeline.md` | 5.4KB | **↻ UPDATE** | Replace NATS refs (19+) with reactive subscription + MoQ | — |
| `agentic-catalog.md` | 7.8KB | **↻ UPDATE** | Replace NATS refs (3). Maps to effectHandler + Researcher role. | Roles promotion |
| `ducklake-vivief.md` | 21KB | **■ PARK** | Revisit when DatomStore reaches warm-tier indexing | DatomStore |
| `investor-pitches.md` | 19KB | **■ PARK** | Business positioning. Revisit when fundraising becomes active. | — |

#### p2p/ (4 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `node-architecture.md` | 29KB | **× ARCHIVE** | Core decisions in ADR-0051. Extract remaining open Qs into thin intents first. | — |
| `peer-discovery.md` | 2.9KB | **✎ DESIGN** | Ready for spike. No blocking dependencies. | — |
| `cold-tier-indexing.md` | 2.2KB | **✎ DESIGN** | Can design now. Spike blocked on DatomStore warm tier. | DatomStore warm tier |
| `webrtc-signaling.md` | 48KB | **× ARCHIVE** | Entirely Protomux-based (superseded by MoQ). Start fresh intent if needed. | — |

#### security/ (3 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `security-architecture.md` | 20KB | **✎ DESIGN** | Interview: sandbox as Contract enforcement vs separate layer | Bridge pattern decision |
| `secure-bridging.md` | 37KB | **⇒ CONSOLIDATE** | Fold thesis into security-architecture.md as a chapter | — |
| `containers-vpn.md` | 826B | **■ PARK** | Deployment-level concern (Phase 4+). Revisit when deployment model is designed. | — |

#### cross-domain/ (3 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `bridging.md` | 28KB | **✎ DESIGN** | Interview: is bridge the 7th pattern or composition of existing? | v6 concepts (locked) |
| `content-translation.md` | 24KB | **■ PARK** | Requires multi-domain validation. Revisit when second domain is active. | 2nd domain |
| `sharing-patterns.md` | 1.7KB | **✎ DESIGN** | Procurement is test case. Resolve when procurement work begins. | Procurement domain |

#### datom/ (2 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `query-architecture.md` | 64KB | **✎ DESIGN** | Extract un-contracted decisions, remove duplicative content vs contract/datom/ | DatomStore work |
| `virtual-projections-spike.md` | 26KB | **✎ DESIGN** | Concrete spike definition. Ready for spike planning when DatomStore L1 exists. | DatomStore L1 |

#### counseling/ (2 files)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `architecture-explorations.md` | 43KB | **⇒ CONSOLIDATE** | Stale Holepunch refs. v4a/v4b/v4c pre-date ADR-0051. Extract unique decisions, archive. | — |
| `concepts-vs-nats.md` | 9KB | **↑ PROMOTE** | Analysis complete. Conclusions ARE the current architecture. Promote as ADR-0051 evidence. | — |

#### local-llm/ (1 file)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `vivief-local-llm-intent.md` | 25KB | **✎ DESIGN** | Interview: model selection (E2B vs E4B), task taxonomy, trust tier integration | Roles, Trust tiers |

#### concepts-challenge/ (1 file)

| File | Size | Triage | Next Action | Depends On |
|------|------|--------|-------------|------------|
| `challenge.md` | 28KB | **■ PARK** | Reference doc, not design. Revisit when concepts change. | — |

### Triage Summary

| Category | Count | Immediate reduction |
|----------|-------|-------------------|
| **↑ PROMOTE** | 3 | −3 intents (become contracts) |
| **✎ DESIGN** | 10 | 0 (still active, need interviews) |
| **⇒ CONSOLIDATE** | 6 | −6 intents (merge into targets) |
| **↻ UPDATE** | 3 | 0 (fix refs, then re-assess) |
| **■ PARK** | 8 | −8 from active attention (explicit triggers) |
| **× ARCHIVE** | 4 | −4 intents (move to archive/) |
| **Total** | **34** | **−21 from active burden → ~13 need attention** |

### Staleness Report

8 files reference outdated technology:

| File | Stale Tech | Current Tech | Severity |
|------|-----------|-------------|----------|
| `p2p/webrtc-signaling.md` | Protomux throughout | MoQ | **Critical** — archive whole file |
| `counseling/architecture-explorations.md` | Hypercore/Hyperbee/Hyperswarm | Iroh + MoQ | **Medium** — archive after extraction |
| `creation/developer-flow.md` | Single Hypercore ref | Iroh + MoQ | **Low** — quick fix |
| `procurement/self-organizing-pipeline.md` | NATS (19+ refs) | Reactive subscription + MoQ | **Medium** — architecture valid, refs wrong |
| `procurement/agentic-catalog.md` | NATS (3 refs) | Reactive subscription + MoQ | **Low** — few refs |
| `procurement/schema-first.md` | NATS in diagram | Reactive subscription | **Low** |
| `procurement/hybrid-progressive.md` | NATS in diagram | Reactive subscription | **Low** |
| `procurement/investor-pitches.md` | "NATS + Ollama" MVP | Current stack | **Low** — business doc |

### Consolidation Map

| Merge Target | Absorbed | Rationale |
|-------------|----------|-----------|
| `security-architecture.md` | ← `secure-bridging.md` | One security model, not two. Bridging security is a chapter within security architecture. |
| Knowledge-acquisition contract | ← `session-harness.md` | Session harness = "Projection with session scope" = context composition (§3). |
| Procurement contract (phased) | ← `schema-first.md` + `hybrid-progressive.md` | A/B alternatives → single phased approach (Phase 1: schema-first, Phase 2: progressive). |
| Archive (with attribution) | ← `creation-is-what-we-do.md` | "Everything is creation" thesis already in `fractal-software-factory.md`. |
| Archive (after extraction) | ← `architecture-explorations.md` | v4a/v4b/v4c pre-date ADR-0051 + `platform-v2.md`. Extract unique decisions first. |

### Decision Tree

Decisions form a DAG — some unlock many others. Resolve top-down by tier.

#### Tier 0 — Already Decided (contracts exist)

These are settled. No action needed.

- P2P node architecture → ADR-0051 (accepted 2026-04-07)
- Creation loop extensions (aperture, intake) → `contract/vision/creation-loop-extensions.md`
- Fractal software factory → `contract/vision/fractal-software-factory.md`
- NATS replacement → reactive subscription + Iroh/MoQ (v6)
- v6 concepts: Datom, Projection, Surface, Contract, effectHandler

#### Tier 1 — Unlock Everything Else (resolve first)

**Decision 1: effectHandler Roles as 3rd dimension** (`effecthandler-roles.md`)

> **Recommended**: Promote. Roles are an attribute `[:handler/roles #{...}]` following deterministic-first maturity (freeform → Contract-governed → infrastructure). Already interview-resolved. Enables intent-to-handler matching without hardcoding dispatch.
>
> **Challenging alternative**: Roles are freeform tags (`handler/tag/*`), not a formal "dimension." If only 3-4 roles ever materialize, calling it a dimension overpromises. Tags scale without commitment and don't imply the same architectural weight as Level and Strategy.
>
> **Why the alternative might be better**: Avoids premature formalization. The deterministic-first path already handles freeform → formal naturally. Starting with "dimension" may lock in formality before the pattern proves it needs it.
>
> **Resolution**: Promote but soften "3rd dimension" to "attribute with optional Contract formalization." The deterministic-first maturity path already covers the freeform → governed progression.

**Decision 2: Knowledge Acquisition model** (`knowledge-acquisition.md`)

> **Recommended**: Promote. Three-concern decomposition (Sources as effectHandlers, Researcher as role, Context composition via Projection) is clean, complete, and the most mature intent doc. Creates foundation for proactive-improvement, session-harness, and morning-brief.
>
> **Challenging alternative**: Defer until a Researcher effectHandler actually exists in code. Specs that run ahead of implementation tend to drift. The contract might lock decisions that feel different once you build the first Researcher.
>
> **Why the alternative might be better**: Every v6 concept was validated through DevAC implementation first. Promoting a contract for something with zero implementation breaks that pattern.
>
> **Resolution**: Promote as "proposed contract, pending validation spike." The contract maturity path (proposed → accepted → implemented) already supports this. The spike becomes the next step after promotion.

**Decision 3: Schema-first vs Hybrid-progressive** (`schema-first.md` + `hybrid-progressive.md`)

> **Recommended**: Hybrid-progressive (Alt B). Start schema-first for known Swedish procurement portals, let the system propose schemas for unknown sources. Matches deterministic-first: start with what you know, let the system suggest extensions.
>
> **Challenging alternative**: Pure schema-first (Alt A). Simpler, faster to build. The MVP contract already uses schema-driven extraction with Pydantic. Adding schema discovery before the first schema even works is YAGNI.
>
> **Why the alternative might be better**: You have a working schema-first MVP. Hybrid adds complexity before the first path produces value. Build what works, then evolve.
>
> **Resolution**: Lock schema-first as the MVP path (it already is). Document hybrid-progressive as the Phase 2 evolution. Write as a single phased section in the procurement contract. Archive both intent files.

#### Tier 2 — Unlocked by Tier 1

**Decision 4: Proactive improvement mechanism** (`proactive-improvement.md`)
*Depends on: Roles + Knowledge Acquisition (Tier 1)*

> **Recommended**: Aggregation Contract watching session interaction datoms triggers improvement. No new concept — just an Aggregation Contract sub-type. Three timescales (reactive/proactive/evolutionary) map to hot/warm/cold tiers.
>
> **Challenging alternative**: Skip the Aggregation Contract abstraction. Simple "after N interactions, review the session" effectHandler with a counter. Zero new infrastructure. Same outcome.
>
> **Why the alternative might be better**: Simpler by an order of magnitude. A counter-based effectHandler achieves the same outcome today. The Aggregation Contract is an abstraction waiting for a pattern that doesn't yet exist.
>
> **Resolution**: Both are correct at different maturity levels. Simple effectHandler = Day 1 implementation. Aggregation Contract = formalization when the pattern proves useful across multiple handlers. This IS the deterministic-first path. Document both as Phase 1 and Phase 2.

**Decision 5: Bridge as pattern** (`cross-domain/bridging.md`)
*Depends on: v6 concepts (locked)*

> **Recommended**: Bridge IS the 7th pattern (alongside the 6 documented in v6). Bidirectional generalization of intake (already introduced in `creation-loop-extensions.md`). The creation lifecycle `Intent → Gather → Create → Land` always crosses boundaries.
>
> **Challenging alternative**: Bridge is infrastructure, not a pattern. Intake (unidirectional) is the pattern. Bridge = two intakes facing each other. Fewer concepts is always better.
>
> **Why the alternative might be better**: If bridge = intake + outbound handler, no new pattern is needed. Adding a 7th pattern after deliberately trimming to 6 reverses the simplification discipline that made v6 strong.
>
> **Resolution**: Needs interview. The test: does "outbound bridge" have a consistent shape (validate → transform → write → confirm)? If yes, it's a pattern. If outbound varies wildly per destination, it's infrastructure. The answer determines whether bridge is named or decomposed.

**Decision 6: Security model** (`security-architecture.md` + `secure-bridging.md`)
*Depends on: Bridge decision, Contract enforcement (locked in v6)*

> **Recommended**: Security IS Contract enforcement at bridge boundaries. The sandbox is a Contract property, not a separate concept. Every bridge boundary has a trust level; every crossing needs validation. This unifies security with the existing concept model.
>
> **Challenging alternative**: Security needs its own enforcement layer that wraps Contracts. A Contract can declare what should happen, but runtime enforcement (process isolation, capability restriction, network filtering) is infrastructure that sits below the concept layer. Saying "security is just Contracts" may create a false sense of safety.
>
> **Why the alternative might be better**: Real security cannot be purely declarative. `containerd` doesn't care about your Contract schema — it needs actual cgroup limits and seccomp profiles. The runtime enforcement layer is a thing, whether or not you model it as a Contract.
>
> **Resolution**: Both are true at different abstraction levels. Contract declares security policy (what). Infrastructure enforces it (how). The contract doc should specify both: the declarative model (Contract properties for trust, isolation, capability) AND the enforcement infrastructure (sandbox runtime, network policies). Consolidate `secure-bridging.md` into `security-architecture.md` to cover both layers.

#### Tier 3 — Implementation-Gated

These decisions cannot be fully resolved until implementation reaches specific milestones.

| Decision | Intent File | Gate | Can Design Now? |
|----------|------------|------|-----------------|
| Datom query specifics | `query-architecture.md` | DatomStore work begins | Yes — extract un-contracted decisions |
| Virtual projections spike | `virtual-projections-spike.md` | DatomStore L1 exists | Yes — spike plan ready |
| Local LLM tier | `vivief-local-llm-intent.md` | effectHandler trust tiers | Partially — model research done |
| Peer discovery spike | `peer-discovery.md` | MoQ relay available | Yes — spike plan ready |
| Cold-tier indexing | `cold-tier-indexing.md` | DatomStore warm tier | Partially — 4 candidates evaluated |

### Priority Queue

**Immediate (this session or next):**

1. **Promote** `knowledge-acquisition.md` + `effecthandler-roles.md` → write contracts
2. **Archive** `creation-review.md`, `chicken-and-egg.md`, `webrtc-signaling.md`, `node-architecture.md` (extract remaining open Qs first)
3. **Promote** `concepts-vs-nats.md` → evidence doc supporting ADR-0051, then archive

**This week:**

4. **Consolidate** `session-harness.md` into knowledge-acquisition contract
5. **Resolve** schema-first vs hybrid-progressive → write single phased procurement contract section
6. **Consolidate** `secure-bridging.md` into `security-architecture.md`
7. **Archive** `creation-is-what-we-do.md` with attribution to `fractal-software-factory.md`

**Next 2 weeks:**

8. **Design interview**: `proactive-improvement.md` — resolve 3 open questions
9. **Design interview**: `bridging.md` — is bridge a pattern or infrastructure?
10. **Update**: procurement intents — fix NATS references in `self-organizing-pipeline.md` and `agentic-catalog.md`
11. **Design interview**: `security-architecture.md` — sandbox model after consolidation

**When implementation reaches milestones:**

12. `peer-discovery.md` spike — when MoQ relay is available
13. `query-architecture.md` trim — when DatomStore work begins
14. `virtual-projections-spike.md` — when DatomStore L1 exists
15. `local-llm` interview — when effectHandler trust tiers are implemented
16. `developer-flow.md` interview — when bidirectional bridge concept needed

**Parked with triggers:**

| Intent | Trigger |
|--------|---------|
| `creation-loop-experiments.md` | Aperture exists in code |
| `multi-agent-primitives.md` | First multi-handler creation loop runs |
| `morning-brief-intent.md` | Knowledge-acquisition contract exists |
| `ducklake-vivief.md` | DatomStore reaches warm-tier indexing |
| `investor-pitches.md` | Fundraising becomes active |
| `content-translation.md` | Second domain is active |
| `containers-vpn.md` | Deployment model is designed |
| `challenge.md` | Concepts change (reference doc) |

### Round 3 Recommendations

Continuing from Round 2's #16:

17. **Execute immediate promotions** — `knowledge-acquisition.md` and `effecthandler-roles.md` are R2-approved. Write contracts now. (Priority 1)
18. **Archive 4 completed/superseded intents** — `creation-review.md`, `chicken-and-egg.md`, `webrtc-signaling.md`, `node-architecture.md`. Extract open questions from `node-architecture.md` before archiving. (Priority 2)
19. **Promote `concepts-vs-nats.md`** — Analysis conclusions are the current architecture. Promote as evidence, then archive. (Priority 3)
20. **Execute 5 consolidations** — session-harness, schema-first+hybrid-progressive, secure-bridging, creation-is-what-we-do, architecture-explorations. Each reduces file count and increases coherence. (Priority 4-7)
21. **Fix stale tech refs in 3 medium-severity files** — `self-organizing-pipeline.md` (NATS), `agentic-catalog.md` (NATS), `developer-flow.md` (Hypercore). Low-severity files can wait. (Priority 10)
22. **Schedule 3 design interviews** — proactive-improvement, bridging, security-architecture. Each resolves blocking questions for downstream decisions. (Priority 8-9, 11)
23. **Use this triage table as the living intent tracker** — update triage categories as files are promoted/archived/consolidated. Goal: no intent stays DESIGN for more than 2 review cycles without either promoting or parking.

### Updated Quality Scorecard

| Dimension | Grade | Change | Notes |
|-----------|-------|--------|-------|
| Structure & organization | **A** | — | Creation-loop model self-consistent |
| Cross-reference integrity | **A** | — | No new broken links |
| Terminology consistency | **A-** | — | v6 terms consistent; aperture/intake/role defined at source |
| Claude usability | **A** | — | 18 windows, fast context loading |
| Human usability | **A-** | — | Routing table + onboarding path |
| DevAC implementation accuracy | **A** | — | fact/ docs track codebase |
| Platform vision clarity | **A** | — | v6 crystallized |
| Archive & history | **A** | — | Full v1-v6 concept history |
| Contributor guidance | **B+** | — | Maintenance guide + Claude window guide |
| **Intent organization** | **A-** | **New** | 34 files triaged with action verbs, dependency tree, priority queue. Upgraded from implicit to structured. |

---

## Review History

| Date | Reviewer | Scope | Key Findings |
|------|----------|-------|-------------|
| 2026-04-08 | Claude (Opus 4.6) + human | Round 3: Intent triage — complete inventory of all 34 intent files | 34 intents triaged into 6 action buckets: 3 promote, 11 design, 5 consolidate, 2 update, 8 park, 5 archive. 6-decision dependency tree mapped (Tiers 0-3). 8 stale-tech files flagged. 5 consolidation targets identified. After immediate actions: active burden 34 → ~13. Grade: A maintained. |
| 2026-04-07 | Claude (Opus 4.6) + human | Round 2 fix: resolve open issues from review | Archived high-level-concepts.md, split linear-meets-vivief.md into locked creation-loop-extensions.md (contract) + experiments (intent). Created docs-as-creation-artifacts.md vision doc. Accepted ADR-0051. Established vision↔ADR convention. Created thin intent docs for session-harness and multi-agent-primitives. Tightened proactive-improvement.md with open questions + autoresearch reference. All review issues resolved. |
| 2026-04-07 | Claude (Opus 4.6) + human | Round 2: 15 new/modified docs since 2026-04-01 | Fixed 5 broken ADR-0050 links (stale `vision/brainstorms/` paths). 6 new intent/creation docs reviewed — knowledge-acquisition and effecthandler-roles near lock-ready. high-level-concepts.md is scribble-phase but depended upon (open issue). v6 terminology consistent across all new content. ADR-0051 governance correct. Grade: A maintained. |
| 2026-04-01 | Claude (Opus 4.6) + human | Full docs review (~230 files) | Found 9 broken refs, terminology bridge gap, 5 omissions, 3 trim candidates. All fixed same session. Grade: B+ → A. Remaining: full document index (open), last-reviewed dates (ongoing). |
| 2026-04-01 | Claude (Opus 4.6) + human | Holepunch → Iroh+MoQ stack correction | Replaced all Holepunch references (Hypercore, Protomux, Hyperbee, Hyperswarm, Pear/Bare, Keet) with Iroh + MoQ stack across 11 files. Archived session-keet-challenge.md. Updated datom/architecture.md to v0.8. Cold-tier indexing and peer discovery remain open questions. |
| 2026-04-01 | Claude (Opus 4.6) + human | Lens/Seal → Projection terminology cleanup | Updated 7→5 concept terminology across 10 active docs. Lens→Projection, Seal→Projection encryption. Key files: platform-v2.md (§2.2, §2.4 rewritten), challenge.md (staleness note + ~25 refs), arch-security.md, domain-counseling.md, story-arc.md, INDEX.md, concepts-vs-nats.md, content-translation.md, counseling evolution. Archive/ left as historical. |
