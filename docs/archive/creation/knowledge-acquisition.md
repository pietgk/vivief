# Intent: Knowledge Acquisition (Archived)

**Status**: Archived — promoted to [contract/vision/knowledge-acquisition.md](../../contract/vision/knowledge-acquisition.md) on 2026-04-09.

## The Problem

Vivief needs to answer questions using the best, most correct, up-to-date knowledge available — and trace every answer back to its origins. Knowledge lives in many places: the code graph, documentation, git history, the web, MCP-connected services, other vivief instances, and humans. The platform needs a coherent model for how it discovers, retrieves, synthesizes, and attributes knowledge across all these sources.

The question is not "which tool do we use to search" but: **how does the creation loop acquire knowledge, and how does that knowledge carry proof of where it came from?**

## Three Distinct Concerns

Knowledge acquisition decomposes into three concerns that must stay separate:

| Concern | What it does | Vivief concept |
|---------|-------------|----------------|
| **Sources** | Where knowledge lives. Docs, code graph, web, peers. | effectHandlers that expose knowledge |
| **Research** | Queries sources, evaluates relevance, synthesizes answers. | effectHandler with Researcher role |
| **Context composition** | Selects which knowledge datoms are in scope for the next handler. | Projection |

Flow: `Researcher queries Sources → produces knowledge datoms → Projection selects relevant datoms → consuming effectHandler works with that context`

Documents (claude windows, intent/, contract/) are **sources**, not Researchers. A well-organized source with progressive disclosure makes the Researcher's job easier, but the source is not performing research. Research is the act of querying, evaluating, and synthesizing.

## The Researcher: An effectHandler Role

Researcher is not a new concept or pattern. It is an **effectHandler role** — what certain effectHandlers do: produce datoms from knowledge sources. The effectHandler signature is unchanged:

```
handler(state, intent) => { datoms: [...], intents: [...] }
```

### Role as a First-Class Attribute

Roles formalize what effectHandlers (and humans) are good at. Humans have roles (Counselor, Developer, Organiser). effectHandlers have roles (Researcher, Improver, Validator). An effectHandler can have one or more roles.

Role follows the deterministic-first maturity path — the same thing at three zoom levels:

| Maturity | What it is | Example |
|----------|-----------|---------|
| **Attribute** (always) | `[:handler/roles #{:researcher :developer}]` — set-valued datom attribute. Zero ceremony. | Day one: tag a handler as `:researcher` |
| **Contract** (earned) | A Behavior Contract declares what a Researcher must do: cite sources, check freshness, disclose contradictions. | When trust needs to increase |
| **Pattern** (recognized) | effectHandler + role attribute + role-specific Contract + role-specific Projection = recognizable shape. | When the combination recurs and stabilizes |

These are not three different mechanisms. They are the same mechanism observed at different levels of formalization. The attribute is always there. The Contract emerges. The pattern is what we call the stable shape.

## Knowledge Sources: Open Set

A knowledge source is any effectHandler that retrieves knowledge and produces datoms. Sources are an **open set** — new sources plug in as new effectHandlers. The set is not bounded.

Starting taxonomy (not a boundary):

| Source | Medium | Example |
|--------|--------|---------|
| Datom store | Local structured data | Code graph, effects, Contracts |
| Documents | Local files | docs/, CLAUDE.md, markdown |
| Git history | Local VCS | Commits, blame, branches |
| Web | Internet | Search engines, specific URLs |
| MCP tools | Protocol | Any MCP-connected service |
| Human | Conversation | Ask the user, interview |
| Peer | P2P network | Other vivief instances |

**Security:** Access to sources is governed by Contracts. A Researcher effectHandler only sees sources (tools) that its trust level and access Contracts permit. Which source-effectHandlers are made available defines the research surface — analogous to how LLM tool availability works.

## Two-Phase Dispatch

When a `:knowledge/requested` intent enters the creation loop, dispatch happens in two phases:

1. **Classification** — a cheap/fast effectHandler (local model or deterministic rules) categorizes the intent: what kind of knowledge is needed? Code structure? Current state? External reference?
2. **Source selection** — based on classification + available sources (filtered by access Contracts), select which Researcher effectHandlers to invoke, in what order, with what depth budget.

This maps to the intent dispatch model defined in [creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md): `categorize => template(prompt) => [effectHandler(prompt)]`

Classification produces auditable datoms — why a source was chosen is traceable, unlike opaque LLM tool selection.

## Research Depth: Estimate + Escalation

Research depth is an attribute of the intent, set during classification — but the Researcher can **escalate** if confidence is low. This mirrors fix strategies: `auto-fix → AI-fix → human-fix`.

| Depth | Budget | Sources | Example |
|-------|--------|---------|---------|
| **Lookup** | Milliseconds, single source | Datom store only | "What type does `parseNode` return?" |
| **Search** | Seconds, 1-3 sources | Datom store + docs + git | "How does the validation pipeline work?" |
| **Research** | Minutes, multiple sources | All internal + web | "What accessibility standards apply?" |
| **Investigation** | Extended, iterative | All sources, multi-pass | "Design the P2P cold-tier indexing strategy" |

Classification sets the initial depth. If the Researcher's result confidence is low, it escalates to the next tier. A **max-depth Contract** governs how far escalation can go — a lookup question can't silently consume an investigation budget.

## Source Composition

When multiple sources are selected, they compose using the existing **multi-agent primitives** (Sequential, Parallel, Loop). No research-specific composition mechanism needed.

Typical composition by depth:

- **Lookup** → single source, no composition
- **Search** → parallel across 1-3 sources, merge
- **Research** → parallel first pass, then sequential refinement based on gaps
- **Investigation** → loop (research → evaluate → identify gaps → research again)

Apparent "research-specific needs" (contradiction resolution, source ranking, confidence merging, deduplication) are already handled by existing vivief concepts: trust scores resolve contradictions, datom identity handles deduplication, `min()` calculation merges confidence.

## Provenance: Progressive Datom Attributes

Every answer traces back to its origins. Provenance uses the same progressive maturity as Roles — the same datom, progressively richer attributes:

**Level 1 — Attribution (always):** Every research datom carries `:knowledge/source` (which source effectHandler) and `:knowledge/origin` (specific reference: URL, file path, entity ID, commit SHA).

**Level 2 — Chain (free):** When `:knowledge/origin` is a datom entity ID (not just a URL), provenance chains form structurally. Researcher A uses Researcher B's output → A's datom origin points to B's datom entity. No separate provenance graph — datoms referencing datoms. Query chains with the existing dependency tools.

**Level 3 — Verification (one more attribute):** When P2P trust demands cryptographic proof, add `:knowledge/content-hash`. Three attributes on the same datom: `[:knowledge/origin, :knowledge/retrieved-at, :knowledge/content-hash]` = "this content existed at this origin at this time."

Each level is governed by a progressively stricter Contract. Level 2 is free if level 1 uses entity references. Level 3 is one attribute on top of level 2.

## Freshness: Source-Level Strategy

Different sources decay at different rates. Freshness is a strategy declared per source type:

| Strategy | Detection | Sources |
|----------|-----------|---------|
| **Tx-based** | Compare Tx to current state hash | Datom store, git |
| **Time-based** | TTL from `:knowledge/retrieved-at` | Web, human answers |
| **Event-based** | Invalidate when a specific event occurs | Docs (on file change), Contracts (on amendment) |

The Researcher checks freshness **before** reusing cached knowledge. If stale, re-retrieve. This is the same escalation pattern: cached result → stale check → re-retrieve if needed.

## Output Shape: Synthesis + Sources

The Researcher produces **two kinds of datoms**, linked by provenance:

- **Source datoms** — raw knowledge retrieved from each source, each carrying `:knowledge/source` and `:knowledge/origin`
- **Synthesis datom** — the composed answer, carrying `:research/synthesis` with provenance chains to source datoms

Two consumption paths:

1. **Quick answer** — read the synthesis datom
2. **Deep dive** — follow provenance chains from synthesis to source datoms

The synthesis datom IS the Researcher's contribution to context composition. The consuming effectHandler's Projection naturally surfaces it. The Researcher doesn't touch the consumer's Projection.

## Quality: Behavior Contract

"Best, most correct, up-to-date" is defined by a Behavior Contract on the Researcher role:

1. **Source diversity** — for depth tiers above lookup, query multiple source types
2. **Freshness check** — cached knowledge must pass the source's freshness strategy before reuse
3. **Contradiction disclosure** — if sources contradict, the synthesis must disclose the contradiction (not silently pick one)
4. **Provenance completeness** — every claim in the synthesis must link to at least one source datom
5. **Confidence signal** — the synthesis must carry a confidence score reflecting source agreement and coverage

This is a Contract, not an algorithm. It declares what "good and correct" means. Any implementation (LLM, code, hybrid) must satisfy it.

## Learning: The Flywheel Is Sufficient

The Researcher improves over time through the creation loop's existing flywheel:

```
Research execution → effect datoms → patterns emerge → Contracts formalize → classification becomes rule-based → LLM re-enters only for novel question types
```

No dedicated learning mechanism needed. The deterministic-first path IS the learning mechanism: what starts as LLM judgment becomes deterministic rules as patterns stabilize.

## Cross-Domain: Contract-Parameterized

The Researcher role is domain-agnostic. Domains (DevAC, Counseling, Procurement) parameterize it through their Contracts:

- Different **sources** available (access Contracts per domain)
- Different **default depth** (Counseling may default deeper for clinical safety)
- Different **quality Contracts** (Counseling requires higher source diversity for clinical decisions)
- Different **freshness strategies** (Procurement pricing needs TTL of hours, not days)

Same Researcher mechanism everywhere. Domains configure, not specialize.

## Improve: Session-Wide, Not Researcher-Specific

Proactive improvement (Hermes-style harness patterns) fits the creation loop via **Aggregation Contracts**:

- An Aggregation Contract watches session interactions: after N prompts, N tool calls, or N sessions
- When threshold is met, it produces `:improvement/review-requested`
- This intent enters the creation loop like any other
- An effectHandler (which may use the Researcher role) processes it — researches what happened, synthesizes improvement opportunities
- Those may become `:rule/proposal-needed` (new Contracts) or `:skill/creation-requested` (new skills)

Proactive and reactive improvement both produce intents that enter the same creation loop. They differ only in trigger — failure vs. aggregation threshold. Improve is session-wide: it applies to all interactions, not just research.

## Options Mapping

Every research mechanism maps to effectHandler + Researcher role + wrapper:

| Mechanism | Vivief mapping |
|-----------|---------------|
| MCP tools that search | Source effectHandlers exposed via MCP (thin wrapper) |
| Skills with search descriptions | Researcher skills — LLM-implemented effectHandlers with Researcher role |
| CLI commands in CLAUDE.md | Source effectHandlers exposed via CLI (thin wrapper) |
| Dedicated research agents | Researcher actors — stateful effectHandlers using multi-agent primitives |
| Optimized search algorithms | Code-implemented source effectHandlers — deterministic, trust 1.0, specialized |

Thin wrappers (MCP, CLI) adapt protocol. Thick wrappers (skills) compose effectHandlers. The existing exposure pattern applies unchanged.

## Related Documents

- [creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md) — aperture-based intent routing, context-as-fractal model, DevAC as wide-aperture Projection
- [docs-as-creation-artifacts.md](../../contract/vision/docs-as-creation-artifacts.md) — making docs a queryable source for the Researcher
- [concepts-effecthandler](../../claude/concepts-effecthandler.md) — effectHandler definition, implementation strategies, skills
- [concepts-creation-loop](../../claude/concepts-creation-loop.md) — the creation formula, fix strategies, compounding flywheel
- [concepts-fractal-software-factory](../../claude/concepts-fractal-software-factory.md) — fractal retrieve → generate → evaluate at every scale
