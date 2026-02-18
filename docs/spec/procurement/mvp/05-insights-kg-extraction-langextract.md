# Insights: Knowledge Graph Extraction & LangExtract
### What a PhD researcher's failures teach us about our pipeline design

---

**Source:** Fabio Yáñez Romero, *"Why LLMs Fail at Knowledge Graph Extraction (And What Works Instead)"*, Towards AI, January 2026.
https://pub.towardsai.net/why-llms-fail-at-knowledge-graph-extraction-and-what-works-instead-dcb029f35f5b

**Context:** This document maps insights from the article against our extraction pipeline architecture (effect-based, TypeScript-first, DuckLake lakehouse) and evaluates Google's LangExtract as a potential component.

---

## 1. What the article confirms about our architecture

The article identifies five core problems with LLM-based extraction from a PhD researcher working on legal documents. We already address most of them, sometimes under different names.

### Entity disambiguation / coreference fragmentation

**Article's finding:** Even within a single paragraph, GPT-5 identifies "Party A," "the plaintiff," and "the aforementioned party" as three separate entities referring to the same organisation. The resulting graph is unusable without extensive post-processing.

**Our architecture:** This is exactly what our diagnostics-as-effects feedback loop handles. When the validator detects fragmented or duplicate entities, it generates a structured diagnostic (`"vendor_name appears as both 'Skanska AB' and 'the contractor' — likely same entity"`) that feeds back to the LLM for re-extraction with context. We didn't call it coreference resolution, but the mechanism is equivalent — and arguably better, because it's iterative and self-correcting rather than a one-shot post-processing step.

**Status:** ✅ Covered. Consider adding explicit coreference diagnostics to the YAML rule set.

### Pipeline error propagation (90% × 90% = 81%)

**Article's finding:** The traditional NLP pipeline — NER → relation extraction → coreference resolution — compounds errors at each stage. A 90% accurate entity recogniser feeding a 90% accurate relation extractor yields only 81% overall accuracy, and that's before coreference.

**Our architecture:** This is precisely why we designed for single-pass LLM extraction with Zod schemas rather than chained specialist models. The LLM generates the complete structured output in one pass, avoiding the compounding failure of sequential stages. The article independently arrives at the same conclusion: end-to-end models that generate the graph in one step outperform chained specialists.

**Status:** ✅ Covered. Our approach is the article's recommended solution.

### Discriminative vs. generative tradeoff

**Article's finding:** Fine-tuned discriminative models (BERT-based) achieve better accuracy for structured extraction and can run on modest hardware. But they're domain-locked and require training data. Generative models are flexible but less accurate.

**Our architecture:** This maps directly to our teacher-student distillation pattern — but with a lifecycle that the article doesn't describe. We start generative (teacher LLM labels data), distill to discriminative (fine-tuned student model handles volume), and keep the teacher for fallback on edge cases. The article presents this as a binary choice; we treat it as a progression.

**Status:** ✅ Covered, and our lifecycle approach goes further.

### Rule-based augmentation

**Article's finding:** Logical rules like "if Entity A employs Entity B, then Entity A is an organisation" codify domain knowledge without hallucination risk. Multi-hop rules ("if case A violates article 5, and article 5 belongs to regulation R, then case A also violates regulation R") increase graph connectivity.

**Our architecture:** Our four rule types (validity, quality, abstraction, anomaly) and the YAML rule engine already cover this space. The article's examples would be abstraction rules in our taxonomy. The multi-hop inference example is exactly the kind of thing our DuckDB-evaluated rules can express:

```yaml
- id: regulation-violation-transitive
  type: abstraction
  match: |
    EXISTS (
      SELECT 1 FROM violations v
      JOIN articles a ON v.article_id = a.id
      WHERE a.regulation_id = :regulation_id
    )
  infer: "case violates parent regulation"
```

**Status:** ✅ Covered. The article validates our rule engine design.

---

## 2. What the article adds to our thinking

Three ideas that sharpen or extend our current architecture.

### 2a. Asserted vs. Augmented — a provenance layer we should formalise

**The insight:** The article draws a clean line between the *asserted* graph (only what's explicitly stated in the source text — verifiable ground truth) and the *augmented* graph (inferred relationships, taxonomic hierarchies, rule-based deductions). The asserted graph is the non-negotiable foundation; augmentation builds on top of it.

**Why this matters for us:** We've been doing this implicitly — extraction produces raw data, rules and diagnostics add inferred data — but we haven't formalised the boundary. Making it explicit has concrete benefits:

- **Different validation severity.** An error in the asserted layer means we misread the source document. An error in the augmented layer means our inference logic is wrong. These need different diagnostic types and different escalation paths.
- **Audit trail clarity.** For procurement compliance, knowing which facts came from the document vs. which were inferred is the difference between a finding and a suspicion.
- **Debugging.** When a downstream query returns unexpected results, provenance tells you whether to fix the extractor or the rules.

**Concrete implementation:**

```typescript
type ProvenanceSource =
  | { kind: 'asserted'; span: SourceSpan }
  | { kind: 'inferred:taxonomic'; rule_id: string }
  | { kind: 'inferred:rule'; rule_id: string; inputs: string[] }
  | { kind: 'inferred:link-prediction'; confidence: number };

interface ExtractedField<T> {
  value: T;
  confidence: number;
  provenance: ProvenanceSource;
}
```

In the effect system, this becomes two distinct effect types:

```
Extract effects → asserted layer (ground truth from document)
Augment effects → augmented layer (inferred, linked, enriched)
```

DuckLake stores both, with a `provenance` column that makes the distinction queryable.

### 2b. Source context preservation — provenance spans

**The insight:** The article proposes creating nodes that represent text spans (sentences, paragraphs, documents) and linking extracted entities back to their source locations. Not just metadata on the entity, but queryable provenance that lets you trace any extracted field back to exactly where it came from.

**Why this matters for us:** When our diagnostician fires `"vendor_name is null but 'Skanska AB' appears on page 2"`, it's already reasoning about source locations — but we haven't designed for systematic provenance storage. This would make diagnostics richer and audit trails automatic.

**Concrete implementation:** Alongside the extracted `contracts` table in DuckLake, a `provenance_spans` table:

```sql
CREATE TABLE lake.procurement.provenance_spans (
  field_path VARCHAR,      -- 'contracts.vendor_name'
  record_id VARCHAR,       -- FK to contracts
  source_doc VARCHAR,      -- document identifier
  page INTEGER,
  char_offset INTEGER,
  char_length INTEGER,
  source_text VARCHAR,     -- the actual text span
  extraction_pass INTEGER  -- which extraction pass found this
);
```

This is also exactly what LangExtract does natively (character-level source grounding) — which brings us to section 3.

### 2c. Topic clustering as bridge entities

**The insight:** Extracted data often produces disconnected clusters with no connecting paths. Topic-based clustering creates bridge nodes that connect related entities — either via predefined categories or automated community detection (as in GraphRAG).

**Why this matters for us:** We described this as "effect-stream abstraction" — lifting individual documents into named procurement processes. The article frames it more concretely: you need explicit bridge entities to make the data traversable.

**Nuance for our architecture:** Since we use a relational lakehouse (DuckLake) rather than a graph database, the connectivity problem manifests differently. We don't need bridge *nodes* — we need bridge *tables* or *views*. A `procurement_processes` table that groups related contracts, awards, and evaluations into named processes serves the same function:

```sql
CREATE TABLE lake.procurement.processes AS
SELECT
  process_id,
  process_type,  -- 'competitive_tender', 'direct_award', etc.
  array_agg(DISTINCT contract_id) as contracts,
  array_agg(DISTINCT vendor_id) as vendors,
  min(publication_date) as start_date,
  max(award_date) as end_date
FROM lake.procurement.contracts
GROUP BY process_id, process_type;
```

This is our abstraction rules doing double duty: they classify documents into process types *and* create the connective tissue that makes the data queryable.

**Status:** Partially covered by our effect-stream abstraction concept. Worth making more explicit in the implementation architecture.

---

## 3. LangExtract: what it is and what it could add

### What LangExtract is

[Google LangExtract](https://github.com/google/langextract) (Apache 2.0, released July 2025, 17k GitHub stars) is a Python library for LLM-powered structured extraction from unstructured text. It sits in the same space as our Vercel AI SDK + Zod pipeline but with a different design philosophy.

**Core capabilities:**

| Feature | Description |
|---------|-------------|
| **Source grounding** | Every extraction maps to exact character offsets in the source text. This is its killer feature — built-in provenance at the character level. |
| **Few-shot schema definition** | Define extraction tasks via 3-5 examples rather than formal schemas. The library infers the output structure from examples. |
| **Multi-pass extraction** | Configurable `extraction_passes` parameter — run the LLM over the same text multiple times for higher recall. Each pass can find entities missed by previous passes. |
| **Long document handling** | Automatic text chunking with parallel processing. Handles the needle-in-a-haystack problem for large documents. |
| **Multi-model support** | Gemini (native), OpenAI, and Ollama (local). Provider plugin system for custom backends. |
| **Controlled generation** | Uses Gemini's native structured output mode for schema-enforced results (similar to our Zod + `generateObject()`). |
| **Interactive visualisation** | Generates HTML files showing extractions highlighted in source text. Useful for debugging and stakeholder demos. |

### How it compares to our current stack

| Aspect | Our pipeline (Vercel AI SDK + Zod) | LangExtract |
|--------|-------------------------------------|-------------|
| **Language** | TypeScript | Python |
| **Schema definition** | Zod schemas (formal, type-safe) | Few-shot examples (flexible, inferred) |
| **Source grounding** | Not built in (we'd need to add it) | Native, character-level |
| **Multi-pass** | Not designed for it | Built in, configurable |
| **Chunking strategy** | Manual (Jina Reader handles some) | Automatic with `max_char_buffer` |
| **Visualisation** | None built in | Interactive HTML |
| **Effect system integration** | Native (shared types with vivief) | Would need a NATS wrapper |
| **Provider flexibility** | Any via Vercel AI SDK | Gemini-native, others via plugins |

### Where LangExtract fits in our architecture

LangExtract is **Python-only**, which means it can't be the core of our TypeScript-first pipeline. But it maps naturally to the **Python specialist services** tier we defined in the tech stack document — alongside sentence-transformers and the training pipeline.

**The strongest case for LangExtract is source grounding.** Our section 2b above (provenance spans) is something we'd need to build from scratch in TypeScript. LangExtract gives it to us for free — every extraction comes with character offsets. For the document parsing use case (scanned PDFs, complex legal documents), running LangExtract as a NATS service that returns extractions *with provenance* could save significant development effort.

**Proposed integration pattern:**

```
┌──────────────────────────────────┐
│  TypeScript Pipeline (core)       │
│                                   │
│  Simple docs → Vercel AI SDK      │
│  + Zod schemas (fast, typed)      │
│                                   │
│  Complex docs → NATS request to:  │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Python: LangExtract Service      │
│                                   │
│  - Few-shot extraction            │
│  - Multi-pass for recall          │
│  - Character-level provenance     │
│  - Returns ExtractedField<T>      │
│    with SourceSpan provenance     │
└──────────────────────────────────┘
```

The TypeScript pipeline handles the 80% of documents that are straightforward — structured procurement portals, standardised forms. LangExtract handles the 20% that are messy — scanned PDFs, free-text legal documents, documents where source grounding matters for audit.

**NATS service wrapper:**

```python
# langextract_service.py
import nats
import langextract as lx
import json

# Pre-defined few-shot examples per document type
EXAMPLES = {
    "contract_award": [...],
    "tender_notice": [...],
    "evaluation_report": [...],
}

async def handle_extract(msg):
    request = json.loads(msg.data)
    doc_type = request["doc_type"]
    text = request["text"]

    result = lx.extract(
        text_or_documents=text,
        prompt_description=request.get("prompt", f"Extract {doc_type} entities"),
        examples=EXAMPLES[doc_type],
        model_id=request.get("model", "gemma2:2b"),  # local via Ollama
        model_url="http://localhost:11434",
        extraction_passes=request.get("passes", 2),
    )

    # Return extractions with provenance spans
    extractions = []
    for doc in result.documents:
        for ext in doc.extractions:
            extractions.append({
                "class": ext.extraction_class,
                "text": ext.extraction_text,
                "attributes": ext.attributes,
                "provenance": {
                    "kind": "asserted",
                    "char_offset": ext.start_offset,
                    "char_length": ext.end_offset - ext.start_offset,
                    "source_text": ext.extraction_text,
                }
            })

    await msg.respond(json.dumps({"extractions": extractions}).encode())
```

### What LangExtract doesn't do (that we still need)

LangExtract is an **extractor**, not a pipeline. It doesn't provide:

- Validation or rule evaluation (our Zod + YAML rule engine)
- Diagnostics feedback loop (our diagnostician)
- Effect routing or orchestration (our NATS-based effect system)
- Schema evolution or discovery (our Nessie/DuckLake workflow)
- Teacher-student distillation (our training pipeline)
- Lakehouse storage (our DuckLake integration)

It's a very good extraction component that we'd wrap as a service, not a replacement for our architecture.

### Multi-pass extraction — a technique worth adopting

One LangExtract feature that's independently valuable regardless of whether we use the library: **multi-pass extraction**. Running the LLM over the same text multiple times with the same prompt catches entities missed in earlier passes. Each pass has a slightly different attention pattern, so the union of passes has higher recall than any single pass.

We could implement this in our TypeScript extractor without LangExtract:

```typescript
async function multiPassExtract<T>(
  text: string,
  schema: ZodSchema<T>,
  passes: number = 2
): Promise<{ results: T[]; merged: T }> {
  const results = await Promise.all(
    Array.from({ length: passes }, () =>
      generateObject({ model: ollama('llama3.1:8b'), schema, prompt: text })
    )
  );
  return { results, merged: mergeExtractions(results) };
}
```

The merge step needs domain-specific logic (deduplicate entities, union relationships, take highest-confidence values), but the pattern is simple and the recall improvement is real.

---

## 4. Summary of actionable items

| Insight | Source | Action | Priority |
|---------|--------|--------|----------|
| Formalise asserted vs. augmented provenance | Article | Add `ProvenanceSource` type to effect system, tag every extracted field | High — affects schema design |
| Source span preservation | Article + LangExtract | Add `provenance_spans` table to DuckLake schema, capture character offsets | High — enables audit trail |
| Coreference diagnostics | Article | Add explicit coreference/dedup rules to YAML rule set | Medium — improves extraction quality |
| Multi-pass extraction | LangExtract | Implement in TypeScript extractor, configurable passes per doc type | Medium — improves recall |
| LangExtract as Python service | LangExtract | Add to Python specialist tier for complex docs with source grounding | Low (MVP) / High (Phase 2) |
| Bridge tables for connectivity | Article | Make `procurement_processes` view explicit in DuckLake schema | Medium — enables cross-document queries |
| Interactive provenance visualisation | LangExtract | Consider for stakeholder demos and debugging (HTML export) | Low — nice to have |

---

## 5. Key quote from the article

> "Error propagation explains why modern approaches favour end-to-end models that generate the graph in one step."

This validates our core architectural decision. We arrived at the same conclusion from the effect system side (single-pass structured extraction with Zod schemas), and the article arrives at it from the NLP pipeline failure analysis side. Two independent paths to the same answer.

The article's most useful contribution isn't a new technique — it's the **asserted/augmented distinction** as a first-class design concept. Every extraction system eventually discovers it needs provenance. Building it in from the start, with typed provenance sources and character-level source spans, avoids the painful retrofit later.
