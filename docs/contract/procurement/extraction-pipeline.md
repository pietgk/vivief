# Procurement Extraction Pipeline — Phased Approach

> Schema-first for known sources (Phase 1), progressive discovery for unknown sources (Phase 2).

**Origin**: Design resolution merging two alternatives — [schema-first](../../archive/procurement/schema-first.md) (Alt A) and [hybrid-progressive](../../archive/procurement/hybrid-progressive.md) (Alt B).

**Related Documents**:
- [Procurement README](README.md) — Research synthesis and effect-system mapping
- [self-organizing-pipeline](../../intent/procurement/self-organizing-pipeline.md) — Full self-organizing vision (intent)
- [effecthandler-roles](../vision/effecthandler-roles.md) — Researcher role for extraction handlers
- [knowledge-acquisition](../vision/knowledge-acquisition.md) — Research depth model applies to extraction

---

## Decision

Schema-first is the MVP path. Hybrid-progressive is the evolution path. Both are correct at different maturity levels — this IS the deterministic-first progression.

## Phase 1: Schema-First (MVP)

Human-defined schemas, LLM-driven extraction, deterministic validation.

**How it works:**
1. Human defines a schema per source type (Swedish procurement, Norwegian, EU TED, generic)
2. Document classifier matches incoming docs to known schemas
3. Schema-driven extractor fills the template using LLM
4. Deterministic validator checks completeness and type correctness
5. Unknown document types fail to manual review (human creates schema)

**Properties:**
- High trust (schemas are explicit Contracts)
- High quality (human-crafted schemas)
- Low operational complexity
- Scales linearly (each new country needs manual schema work)
- Handles surprises poorly (unknown docs fail or get generic treatment)

**Vivief mapping:**
- Schemas = Contracts (Schema type)
- Extractor = effectHandler with Researcher role
- Validator = effectHandler with Validator role
- Classification = intent dispatch (two-phase: classify → route)
- Results = datoms with `:knowledge/source` provenance

## Phase 2: Progressive Discovery

Start schema-first for known sources, let the system propose schemas for unknown ones. Human approves before anything enters production.

**What Phase 2 adds:**
- **Fast path** (known schemas): identical to Phase 1
- **Discovery path** (unknown sources): unsupervised extraction → sample accumulation → schema clustering → proposal generation
- **Human gate**: all proposed schemas require human approval before promotion to known schemas
- **Feedback loop**: production data improves extraction via few-shot RAG; schema drift detection triggers re-evaluation

**Trigger for Phase 2:** Phase 1 works but doesn't scale — new countries/formats arrive faster than humans can write schemas.

**Properties:**
- Adapts sub-linearly to new sources (system reuses patterns)
- Handles surprises well (clusters new patterns naturally)
- Higher operational complexity
- Variable initial quality (emergent schemas need review)
- Human gate maintains trust

**Vivief mapping:**
- Schema proposals = `:contract/proposal-needed` intents
- Discovery path = Researcher effectHandler with Investigation depth
- Approval workflow = Contract amendment lifecycle
- Drift detection = Aggregation Contract watching extraction quality datoms

## What This Replaces

Both `schema-first.md` and `hybrid-progressive.md` intents are archived. The phased approach captures that both were correct — Alt A as the starting point, Alt B as the evolution. No A-vs-B choice needed; it's a maturity progression.

The NATS references in both originals are superseded by reactive subscription + MoQ (see [ADR-0051](../adr/0051-tech-stack.md)). The extraction pipeline uses vivief's standard transport, not a separate message broker.
