# Knowledge Acquisition

> How the creation loop acquires knowledge: sources as effectHandlers, research as a role, context composition via Projection.

**Status**: Proposed — pending validation spike (first Researcher effectHandler implementation).

**Origin**: Design interview on how vivief discovers, retrieves, synthesizes, and attributes knowledge ([archived intent](../../archive/creation/knowledge-acquisition.md)).

**Related Documents**:
- [effecthandler-roles.md](effecthandler-roles.md) — Role as attribute, deterministic-first maturity
- [creation-loop-extensions.md](creation-loop-extensions.md) — Aperture-based intent routing, context-as-fractal
- [docs-as-creation-artifacts.md](docs-as-creation-artifacts.md) — Making docs a queryable source
- [concepts-effecthandler Claude window](../../claude/concepts-effecthandler.md) — effectHandler definition, strategies, skills
- [concepts-creation-loop Claude window](../../claude/concepts-creation-loop.md) — Creation formula, fix strategies, compounding flywheel

---

## Summary

Knowledge acquisition decomposes into three concerns:

| Concern | What it does | Vivief concept |
|---------|-------------|----------------|
| **Sources** | Where knowledge lives (docs, code graph, web, peers) | effectHandlers that expose knowledge |
| **Research** | Queries sources, evaluates relevance, synthesizes answers | effectHandler with Researcher role |
| **Context composition** | Selects which knowledge datoms are in scope | Projection |

Flow: `Researcher queries Sources → produces knowledge datoms → Projection selects relevant datoms → consuming effectHandler works with that context`

Documents are **sources**, not Researchers. Research is the act of querying, evaluating, and synthesizing.

## The Researcher Role

Researcher is an effectHandler role — not a new concept. The effectHandler signature is unchanged:

```
handler(state, intent) => { datoms: [...], intents: [...] }
```

See [effecthandler-roles.md](effecthandler-roles.md) for the full role model: attribute → Contract → pattern maturity.

## Knowledge Sources: Open Set

A knowledge source is any effectHandler that retrieves knowledge and produces datoms. Sources are an **open set** — new sources plug in as new effectHandlers.

| Source | Medium | Example |
|--------|--------|---------|
| Datom store | Local structured data | Code graph, effects, Contracts |
| Documents | Local files | docs/, CLAUDE.md, markdown |
| Git history | Local VCS | Commits, blame, branches |
| Web | Internet | Search engines, specific URLs |
| MCP tools | Protocol | Any MCP-connected service |
| Human | Conversation | Ask the user, interview |
| Peer | P2P network | Other vivief instances |

**Security:** Access to sources is governed by Contracts. A Researcher only sees sources its trust level and access Contracts permit.

## Two-Phase Dispatch

When a `:knowledge/requested` intent enters the creation loop:

1. **Classification** — cheap/fast effectHandler categorizes: what kind of knowledge is needed?
2. **Source selection** — based on classification + available sources (filtered by access Contracts), select which Researcher effectHandlers to invoke, in what order, with what depth budget.

Maps to intent dispatch in [creation-loop-extensions.md](creation-loop-extensions.md): `categorize => template(prompt) => [effectHandler(prompt)]`

Classification produces auditable datoms — why a source was chosen is traceable.

## Research Depth: Estimate + Escalation

Research depth is set during classification. The Researcher can **escalate** if confidence is low — mirroring fix strategies: `auto-fix → AI-fix → human-fix`.

| Depth | Budget | Sources | Example |
|-------|--------|---------|---------|
| **Lookup** | Milliseconds, single source | Datom store only | "What type does `parseNode` return?" |
| **Search** | Seconds, 1-3 sources | Datom store + docs + git | "How does the validation pipeline work?" |
| **Research** | Minutes, multiple sources | All internal + web | "What accessibility standards apply?" |
| **Investigation** | Extended, iterative | All sources, multi-pass | "Design the P2P cold-tier indexing strategy" |

A **max-depth Contract** governs how far escalation can go.

## Source Composition

Multiple sources compose using existing multi-agent primitives (Sequential, Parallel, Loop):

- **Lookup** → single source, no composition
- **Search** → parallel across 1-3 sources, merge
- **Research** → parallel first pass, then sequential refinement
- **Investigation** → loop (research → evaluate → identify gaps → research again)

Contradiction resolution, source ranking, confidence merging, and deduplication are handled by existing vivief concepts: trust scores, datom identity, `min()` calculation.

## Context Composition

Context composition is how research results become available to consuming effectHandlers. This operates through Projection — the same concept used everywhere in vivief.

A session's context is a Projection with session scope: it selects which knowledge datoms are visible at the current aperture setting. Progressive disclosure (frontmatter → full content) maps directly to Projection's delivery modes.

The Researcher produces synthesis datoms that enter the session context. The consuming effectHandler's Projection naturally surfaces them. The Researcher does not touch the consumer's Projection.

### Open Questions (from session-harness exploration)

1. How does progressive disclosure interact with aperture? Does widening aperture also deepen disclosure?
2. What manages session context — is it an effectHandler itself, or infrastructure below the handler level?
3. How do context-fragment organizers relate to D2TS operators?

## Provenance: Progressive Datom Attributes

Every answer traces back to its origins. Provenance uses progressive maturity:

**Level 1 — Attribution (always):** Every research datom carries `:knowledge/source` (which effectHandler) and `:knowledge/origin` (specific reference: URL, file path, entity ID, commit SHA).

**Level 2 — Chain (free):** When `:knowledge/origin` is a datom entity ID, provenance chains form structurally. Researcher A uses Researcher B's output → A's datom origin points to B's datom entity. No separate provenance graph — datoms referencing datoms.

**Level 3 — Verification (one attribute):** For P2P trust with cryptographic proof: add `:knowledge/content-hash`. Three attributes on the same datom = "this content existed at this origin at this time."

Each level is governed by a progressively stricter Contract.

## Freshness: Source-Level Strategy

Different sources decay at different rates:

| Strategy | Detection | Sources |
|----------|-----------|---------|
| **Tx-based** | Compare Tx to current state hash | Datom store, git |
| **Time-based** | TTL from `:knowledge/retrieved-at` | Web, human answers |
| **Event-based** | Invalidate on specific event | Docs (file change), Contracts (amendment) |

The Researcher checks freshness before reusing cached knowledge.

## Output Shape

The Researcher produces two kinds of datoms:

- **Source datoms** — raw knowledge from each source, carrying `:knowledge/source` and `:knowledge/origin`
- **Synthesis datom** — the composed answer, carrying `:research/synthesis` with provenance chains to source datoms

Quick answer: read the synthesis. Deep dive: follow provenance chains.

## Quality: Behavior Contract

A Behavior Contract on the Researcher role defines "best, most correct, up-to-date":

1. **Source diversity** — for depth tiers above lookup, query multiple source types
2. **Freshness check** — cached knowledge must pass source's freshness strategy before reuse
3. **Contradiction disclosure** — if sources contradict, synthesis must disclose (not silently pick one)
4. **Provenance completeness** — every claim must link to at least one source datom
5. **Confidence signal** — synthesis carries confidence score reflecting source agreement and coverage

## Cross-Domain: Contract-Parameterized

The Researcher role is domain-agnostic. Domains parameterize through Contracts:

- Different **sources** available (access Contracts per domain)
- Different **default depth** (Counseling may default deeper for clinical safety)
- Different **quality Contracts** (Counseling requires higher source diversity)
- Different **freshness strategies** (Procurement pricing needs TTL of hours, not days)

Same mechanism everywhere. Domains configure, not specialize.

## Proactive Improvement

Proactive improvement fits the creation loop via **Aggregation Contracts**:

- An Aggregation Contract watches session interactions (N prompts, N tool calls, N sessions)
- Threshold met → produces `:improvement/review-requested`
- Intent enters the creation loop like any other
- An effectHandler (which may use the Researcher role) processes it

Proactive and reactive improvement both produce intents for the same creation loop. They differ only in trigger — failure vs. aggregation threshold.
