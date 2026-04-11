# Vivief Concepts — Implementation Knowledge Base

> Compressed reference for implementation planning. All decisions from the v2 interview, concept-to-implementation mappings, and pointers to brainstorm depth.

---

## 1. Interview Decisions (Compressed)

### Branch 1: Foundation

| Decision | Resolution |
|----------|-----------|
| Core thesis | Creation is the why, formula `(state, effect) => (state', [effect'])` is the how, trust varies |
| Concept count | 5: Datom, Projection, Surface, Contract, effectHandler |
| Lens + Seal | Merged into Projection (query + access + encryption + delivery + freshness) |
| P2P | Infrastructure, not concept. Peer validation = Contract enforcement on incoming datoms |

### Branch 2: Contract & Trust

| Decision | Resolution |
|----------|-----------|
| Contract scope | Cross-cutting — peer concept AND constrains other concepts |
| Sub-types | 6 patterns: Schema, Projection, Render, Trust, Sync, Behavior |
| Modes | Guard (reject), Aggregation (derive), StateMachine (transitions) |
| Temporal points | Pre-commit, in-flight, post-commit |
| Trust strategies | Authoritative (human), gated (AI draft→approve), sandboxed (AI isolated→promote) |
| Redaction | Projection Contract (compute-access) vs Render Contract (display-access) |
| Security | Contract enforcement at bridge boundaries, not a separate layer |
| Detection | Instruction detection, behavioral validation, surface diffing = Guard/Aggregation Contracts |
| Defaults | Lifecycle: `:default` → `:domain-refined` → `:experience-refined` → `:locked` |

### Branch 3: Runtime & Streaming

| Decision | Resolution |
|----------|-----------|
| Actor runtime | Dedicated section, lightweight, for implementers. Concepts stay primary |
| Delivery modes | `snapshot`, `live`, `replay` — on Projection |
| Freshness | `committed`, `in-flight` — on Projection |
| Reactive subscription | = `delivery: "live"` (Projection capability, not separate store property) |

### Branch 4: Creation & Cache

| Decision | Resolution |
|----------|-----------|
| Creation loop | Single loop replaces dual-loop. Any actor, variable trust |
| Cache | Content-addressed with provenance. `inputs-hash + contract-hash → cached output` |
| Sandbox | Scoped Projection + gated promotion Contract. No separate infrastructure |
| Fix escalation | auto-fix → AI-fix (sandbox) → human-fix. StateMachine Contract for escalation |

### Branch 5: Content & Culture

| Decision | Resolution |
|----------|-----------|
| Content | = datoms. Content types = Schema Contracts. Not a new concept |
| Locale | Projection dimension with fallback chains |
| Cultural rules | In-flight Contracts (same mechanism as clinical guardrails) |
| Content worlds | Named pattern for deep adaptation (different structure per locale) |
| Translation | Creation — same loop, same trust levels |

---

## 2. Concept → Implementation Mapping

### 2.1 Datom

```
[Entity, Attribute, Value, Tx, Op]
```

**v2 additions:**
- `:tx/source` — provenance: who/what created this datom (`:human`, `:ai/opus-4`, `:system/devac`, `:web/scraped`)
- `:tx/trust-score` — 0.0–1.0, set at ingestion, used by trust-scoped Projection
- Schema as datoms (schema attributes are themselves datoms)
- Observability as datoms (LLM tokens, cost, latency)

### 2.2 Projection

```typescript
interface Projection {
  filter: DatomQuery
  sort: SortSpec
  group?: GroupSpec
  depth?: DepthSpec
  capability: CapabilityToken
  scope: "own" | "consented" | "all"
  decryptionKey?: DerivedKey
  delivery: "snapshot" | "live" | "replay"
  freshness?: "committed" | "in-flight"
  trustThreshold?: number  // v2: exclude datoms below this trust score
}
```

**v2 additions:**
- `trustThreshold` — filters out datoms where `:tx/trust-score < threshold`
- Trust-scoped context loading: LLM gets high-trust datoms only unless explicitly widened

### 2.3 Surface

Six render modes: Stream, Card, Canvas, Dialog, Board, Diagram.

**v2 additions:**
- Trust signal rendering: Render Contract can require visible provenance alongside untrusted content
- Example: "This content originated from web scraping (trust: 0.4)" badge on rendered output

### 2.4 Contract

Three modes × three temporal points × six sub-types.

**v2 additions:**
- **Security detection as Contracts**: instruction detection (Guard scanning for injection patterns), behavioral validation (Guard checking LLM output against expected patterns), surface diffing (Guard detecting unexpected state changes), trust scoring (Aggregation over `:tx/trust-score`)
- **Defaults lifecycle**: configuration points start as `:default` datoms, refine through `:domain-refined` → `:experience-refined` → `:locked`. Each transition is a datom assertion with provenance (`tx/why`)
- **Contract defaults as datoms**: the configuration IS the datom, refinement IS datom evolution, the tx log tracks when and why defaults changed

### 2.5 effectHandler

Two levels: function, actor. No v2 changes to the concept itself.

---

## 3. Implementation Order (Suggested)

| Phase | What | Depends on |
|-------|------|-----------|
| 1 | **Datom store** with `:tx/source` and `:tx/trust-score` attributes | — |
| 2 | **Schema Contract** — validates datom structure at commit | Phase 1 |
| 3 | **Projection** with delivery modes (snapshot first, then live) | Phase 1 |
| 4 | **Trust Contract** + trust-scoped Projection (`trustThreshold`) | Phase 1, 3 |
| 5 | **effectHandler** — function level first, actor level later | Phase 1, 3 |
| 6 | **Surface** with Render Contract (a11y validation) | Phase 3 |
| 7 | **Bridge pattern** — effectHandler + Contract at medium boundary | Phase 2, 5 |
| 8 | **Cache pattern** — content-addressed with provenance | Phase 1, 2, 5 |
| 9 | **In-flight Contract** validation (streaming guardrails) | Phase 2, 5 |
| 10 | **Contract defaults lifecycle** — `:default` → refinement tracking | Phase 2 |

**Rationale:** Datom store + Schema Contract first because everything depends on facts. Projection next because all reading goes through it. Trust early because it affects what actors see. Bridge and cache are patterns built on top of the primitives.

---

## 4. Key Patterns to Implement First

### Bridge (named pattern, not concept)

```
effectHandler (reads medium, produces datoms)  +  Contract (validates at boundary)
```

Every connection to an external medium follows this pattern. File sync, git integration, API calls, LLM context loading — all bridges.

### Sandbox

```
Projection (scoped namespace)  +  Contract (gated promotion)
```

No separate infrastructure. Sandbox datoms commit to the store under a namespace. Promotion = re-assert without prefix + `:tx/promoted-from`.

### Cache

```
datoms: [inputs-hash, contract-hash, actor, valid]  +  reactive invalidation
```

Content-addressed. If inputs-hash and contract-hash match: return cached. If Contract evolves: all affected caches invalidate.

### Trust Scoring

```
Aggregation Contract over :tx/trust-score
```

Computes trust for derived content from source trust scores. Default rule: `min(source_trusts)` (conservative). Refinable per domain.

---

## 5. Brainstorm Source Pointers

| Topic | Source file | Key sections |
|-------|------------|-------------|
| Bridge as universal pattern | `vivief-concepts-bridging.md` | §1 Core Pattern, §5 Alternatives |
| LLM as bridge participant | `vivief-concepts-bridging.md` | §3 LLM Bridge, §4 Three Eras |
| Non-developer users | `vivief-concepts-bridging.md` | §6 Non-Developer Users |
| File source taxonomy (9 types) | `vivief-concepts-bridging.md` | §7 File Sources |
| Security at bridge boundaries | `vivief-concepts-secure-bridging.md` | §3 Trust at Every Boundary |
| Detection layers as Contracts | `vivief-concepts-secure-bridging.md` | §6 Detection Layers |
| Memory injection defense | `vivief-concepts-secure-bridging.md` | §7 Injection Persistence |
| Contract defaults table | `vivief-concepts-secure-bridging.md` | §12 Contract Defaults |
| Intent → Gather → Create → Land | `vivief-concepts-bridging.md` | §1 (stays in brainstorm, not in v2) |
| Developer flow (bidirectional) | `vivief-concepts-developer-flow.md` | §2 Bidirectional Bridge |
| Creation thesis + trust spectrum | `vivief-concepts-creation-is-what-we-do.md` | Alt 2 |
| Hybrid C structure (v2 template) | `vivief-concepts-hybrid-c.md` | Full document |
| Content worlds + cultural contracts | `vivief-concepts-content.md` | Alt 3+4 |

---

## 6. Contract Defaults — Starting Configuration

These are the initial configuration points that ship as `:default` datoms. Each refines independently per domain and experience.

| # | Configuration point | Default value | Refinement direction |
|---|---|---|---|
| 1 | Trust score shape | Single number (0.0–1.0) | Clinical may need vector; add dimensions when single number proves insufficient |
| 2 | Human review threshold | All convention-changing writes | Clinical = all AI writes. Dev = only project-level. Auto-approve safe categories over time |
| 3 | Trust propagation rule | `min(source_trusts)` | Weighted average for dev tooling. Calibrate from incident data |
| 4 | P2P trust propagation | Peer trust = floor for content trust | Adjust as P2P usage patterns emerge |
| 5 | Trust evolution | No automatic increase | Known curated sources may earn trust with human approval |
| 6 | Detection Contract updates | New rule datoms via Schema evolution | Domain-specific rule sets. New attack patterns → new Guard rules |
| 7 | Capability-safety balance | Strict by default, relax explicitly | Track false-positive rate → relax where noise exceeds signal |

**The meta-pattern:** assert sensible default as datom, mark `:default`, let domain experience refine through normal datom evolution. Question is never lost — it's an explicit configuration point with provenance.

```
:default           → works without domain expertise
:domain-refined    → adapted for specific domain (clinical, dev, content)
:experience-refined → adjusted from actual usage data and incidents
:locked            → frozen after deliberate decision (with :tx/why)
```

---

*Version: implementation-kb — compressed reference from 20-question interview across 5 branches. All design decisions, concept-to-implementation mappings, suggested implementation order, key patterns, brainstorm pointers, and Contract defaults starting configuration. Use alongside vivief-concepts-v2.md for implementation planning.*
