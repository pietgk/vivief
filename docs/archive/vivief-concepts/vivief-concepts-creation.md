# Creation as Universal Pattern

> Brainstorm document. Four alternative ways to unify code creation, content creation, UI component creation, and world/culture creation under one conceptual pattern.
>
> Triggered by: code, content, UI components, and world-locale-culture definitions are similar in many ways. All have schema. All have creation flows. All can be created by humans or AI. All benefit from caching. All are governed by Contracts.

---

## The Observation

Look at what "creation" looks like across four domains:

| | Code | Content | UI Component | World/Culture |
|---|---|---|---|---|
| **What's created** | Handler module, function, type | Page, post, block, media | React component, story, style | Locale rules, cultural norms, adapted content |
| **Schema** | TypeScript types, effect schemas | Content type (fields, required, enum) | Props interface, a11y requirements | Cultural Contract (norms, legal, linguistic) |
| **Creation by** | Developer, AI (Copilot) | Author, AI (generator) | Designer, AI (component gen) | Cultural expert, AI (adaptation) |
| **Validation** | Type-check, lint, test, Contract | Editorial review, schema check | Visual regression, a11y scan, Storybook | Cultural review, regulatory check |
| **Cache/reuse** | Build cache, compiled output | Published version, CDN | Storybook build, design tokens | Approved translations, cached adaptations |
| **Governed by** | Behavior Contract | Schema Contract + editorial rules | Render Contract | Cultural Contract |
| **Develop/use blur** | LLM writes handler = handler processes data | LLM writes content = content serves users | LLM generates component = component renders | LLM adapts culture = culture constrains AI |

**Every row has the same shape.** Schema defines what's valid. An actor creates it (human or AI). A Contract validates it. A cache avoids re-creation. A Surface makes it visible. The domains differ only in what Contract type applies and what "valid" means.

---

## Alternative 1: "Contract → Create → Validate → Cache"

> The simplest. Creation is just the effectHandler pattern with explicit caching.

### The Pattern

Every creation — code, content, UI, culture — follows one loop:

```
1. Contract defines what's valid
2. Actor creates (human types, AI generates, system derives)
3. Contract validates the creation
4. If valid: commit as datoms + cache the result
5. Surface makes it visible
```

This is already the development flow from vivief-concepts §7.1: `Contract → Handler → Verify → Gate → Live`. The insight: this isn't a "development" flow — it's the **universal creation flow**. Content creation follows it. UI creation follows it. Cultural adaptation follows it.

### Applied to each domain

**Code creation:**
```
Behavior Contract: "session-recap handler must accept :effect/voice-input, produce :session/themes"
  → Developer writes handler (or AI generates it)
    → Contract validates: type-check, lint, test
      → Commit handler datoms + cache compiled module
        → Surface: Stately Studio shows state machine, devac shows in code graph
```

**Content creation:**
```
Schema Contract: "blog post must have title (text), body (richtext), status (draft|published)"
  → Author writes post (or AI generates it)
    → Contract validates: schema check, editorial rules
      → Commit content datoms + cache rendered output
        → Surface: Canvas mode for editing, Card mode for reading
```

**UI component creation:**
```
Render Contract: "session-card must show :session/date, :session/mood, must be WCAG 2.1-AA"
  → Designer builds component (or AI generates it)
    → Contract validates: Storybook stories pass, axe scan passes
      → Commit component datoms + cache built assets
        → Surface: Storybook catalog, live app rendering
```

**Cultural adaptation:**
```
Cultural Contract: "Dutch therapy content must use 'je', reference huisarts pathway, comply with WGBO"
  → Cultural expert writes content (or AI adapts within Contract)
    → Contract validates: cultural rules, regulatory compliance
      → Commit cultural datoms + cache approved translations
        → Surface: locale-specific rendering
```

### Caching

Caching is memoization of effectHandler output. If:
- The input datoms haven't changed (same state)
- The Contract hasn't changed (same rules)
- The handler hasn't changed (same logic)

...then the output datoms are still valid. Skip re-creation, use the cached result.

```
[creation:42   :creation/inputs-hash    "sha256:abc..."     tx:50  true]
[creation:42   :creation/contract-hash  "sha256:def..."     tx:50  true]
[creation:42   :creation/handler-hash   "sha256:ghi..."     tx:50  true]
[creation:42   :creation/output         [datom-refs...]     tx:50  true]
[creation:42   :creation/valid          true                 tx:50  true]
```

When any input, Contract, or handler changes, `:creation/valid` is retracted. The creation re-runs. This is content-addressable creation — like Nix or Turborepo, but for everything in the platform.

**Token savings.** The most expensive creations are AI-generated. If an LLM produced a session recap and the session datoms haven't changed, the recap is still valid. Don't burn tokens regenerating it. The cache knows.

### Assessment

**Strengths:** No new concepts. Just a named pattern (`Contract → Create → Validate → Cache`) applied uniformly. Caching is elegant — content-addressable, based on input/Contract/handler hashes. The develop/use blur is strengthened: all creation is one pattern.

**Weaknesses:** "Caching is just hash comparison" oversimplifies. An AI-generated cultural adaptation might be "valid" by its Contract but stale because therapeutic best practices evolved. The cache doesn't capture semantic staleness — only structural change. Also, the pattern is so general it might not add much: "things are created, validated, and cached" is true of every system.

---

## Alternative 2: "Artifact — What Gets Created"

> Name what's created. An Artifact is a datom cluster produced by a creation event, with provenance and cache validity.

### The Insight

In vivief, we name the data (Datom), the query (Projection), the renderer (Surface), the rules (Contract), and the logic (effectHandler). But we don't name **what gets created**. A handler module, a blog post, a React component, a cultural adaptation — they're all "datoms." But they have a shape that's worth naming: they were created by someone, validated against something, and can be reused until something changes.

### Artifact

An **Artifact** is a cluster of datoms that:
1. Was **created** by an actor (human, AI, or system) in a specific creation event
2. Was **validated** against one or more Contracts
3. Has **provenance** — who created it, when, why, from what inputs
4. Has **validity** — is the cached version still good?

```typescript
interface Artifact {
  // What was created
  entity: EntityId                    // The root entity of this Artifact
  datoms: DatomRef[]                  // All datoms produced in the creation event

  // Provenance (the Why chain applied to creation)
  createdBy: ActorId                  // Human, AI, or system
  createdAt: TxId
  inputs: DatomRef[]                  // What state was read during creation
  contract: ContractRef               // What Contract(s) validated it
  method: "authored" | "generated" | "adapted" | "derived" | "cached"

  // Cache validity
  inputsHash: Hash                    // Hash of all input datoms
  contractHash: Hash                  // Hash of the Contract version
  valid: boolean                      // Still valid? Or needs re-creation?
}
```

### The four domains as Artifact types

| Artifact Type | Created By | Contract | Cache Invalidation |
|---------------|-----------|----------|-------------------|
| **Code Artifact** (handler module) | Developer / AI | Behavior Contract | Source change, dependency change, Contract change |
| **Content Artifact** (page, post) | Author / AI | Schema Contract + editorial rules | Content edit, schema evolution |
| **Component Artifact** (UI component) | Designer / AI | Render Contract (a11y, stories) | Design change, a11y rule change, dependency change |
| **Culture Artifact** (locale adaptation) | Cultural expert / AI | Cultural Contract | Source content change, cultural norm change, regulatory change |

### The Artifact lifecycle

```
Intent (effect)
  → effectHandler creates Artifact
    → Contract validates Artifact
      → Artifact committed as datoms with provenance
        → Artifact cached (inputsHash + contractHash)
          → Surface renders Artifact
            → Reactive subscription: when inputs change, Artifact.valid = false
              → Re-creation triggered (or human notified)
```

**Reactive cache invalidation.** The Store Actor monitors an Artifact's input datoms via reactive subscription. When any input datom changes, the Artifact's `:artifact/valid` datom is retracted. This triggers re-creation — or surfaces the staleness to a human.

### The develop/use blur deepens

```
Developer creates Code Artifact       → effectHandler runs in production
Author creates Content Artifact        → Surface renders for users
Designer creates Component Artifact    → Surface uses component to render
Expert creates Culture Artifact        → Contract validates AI output in that culture

AI creates Code Artifact               → Same path. Same Contract. Same cache.
AI creates Content Artifact            → Same path. Human reviews draft.
AI generates Component Artifact        → Same path. Storybook verifies.
AI adapts Culture Artifact             → Same path. Cultural expert reviews.
```

The only difference between human and AI creation is the `:creation/method` — "authored" vs "generated" vs "adapted". The Contract, cache, and Surface are identical.

### Caching example: LLM token savings

```
Session datoms: [session:42, :session/transcript, "...", tx:80, true]
                [session:42, :session/duration, 50, tx:80, true]

AI creates recap Artifact:
  [artifact:recap:42  :artifact/type        :content            tx:81  true]
  [artifact:recap:42  :artifact/created-by   :ai/opus-4         tx:81  true]
  [artifact:recap:42  :artifact/inputs-hash  "sha256:abc..."    tx:81  true]
  [artifact:recap:42  :artifact/contract     :contract/recap    tx:81  true]
  [artifact:recap:42  :artifact/valid        true                tx:81  true]
  [recap:42           :session/themes        ["sleep", "anxiety"]  tx:81  true]
  [recap:42           :session/mood          :anxious            tx:81  true]

Later: someone queries "generate recap for session:42"
  → effectHandler checks: does a valid Artifact exist?
  → artifact:recap:42 has :artifact/valid true
  → inputsHash matches current session datoms
  → Return cached datoms. Zero LLM tokens burned.

Later: session transcript is edited (tx:90 adds new content)
  → Reactive subscription fires: session:42 inputs changed
  → artifact:recap:42 :artifact/valid retracted
  → Next request triggers re-creation (new LLM call)
```

### Assessment

**Strengths:** Names something real. "Artifact" gives vocabulary to what gets created. Provenance is built-in (who, when, why, how). Cache invalidation is reactive (via subscription to inputs). The same model works for code, content, UI, and culture. LLM token savings are concrete.

**Weaknesses:** Is "Artifact" a new concept or just a pattern? It doesn't change the five concepts — it's a cluster of datoms with conventions (provenance attributes, cache hashes). The `:artifact/valid` reactive invalidation pattern adds complexity. And "Artifact" might be confused with "build artifact" — it has CI/CD connotations that might narrow thinking.

---

## Alternative 3: "Creation Contract — The Unified Spec"

> What if a Creation Contract unifies all the Contract sub-types (Schema, Render, Behavior, Cultural) under one pattern: "how to create a valid thing"?

### The Insight

Look at what each Contract sub-type actually specifies:

| Contract Type | What it really says |
|---------------|-------------------|
| Schema Contract | "To create a valid client datom, it must have `:client/name` (text) and `:client/status` (keyword)" |
| Behavior Contract | "To create a valid handler, it must accept these effects and produce these datoms" |
| Render Contract | "To create a valid Surface, it must show these fields and pass WCAG 2.1-AA" |
| Cultural Contract | "To create valid Dutch therapy content, it must use 'je' and reference huisarts" |

Every Contract is answering the same question: **"What does it take to create a valid X?"** The X varies (datom, handler, Surface, cultural content), but the pattern is identical: define inputs, define constraints, define what "valid" means.

### The Creation Contract

```typescript
interface CreationContract {
  // What is being created
  creates: ArtifactType         // "code" | "content" | "component" | "culture" | "schema" | ...

  // Input specification
  requires: {
    inputs: DatomQuery          // What state must be available
    capabilities: CapabilityToken[]  // What permissions the creator needs
  }

  // Output specification
  produces: {
    required: AttributeKw[]     // Must produce these datoms
    forbidden: AttributeKw[]    // Must never produce these
    schema?: SchemaSpec         // Structural validation
    stateMachine?: XStateMachineDefinition  // Valid transitions (for code)
  }

  // Validation specification
  validates: {
    pre: ContractRef[]          // Run before creation starts
    inflight: ContractRef[]     // Run during creation (streaming AI)
    post: ContractRef[]         // Run after creation completes
  }

  // Cache specification
  cache: {
    strategy: "content-addressed" | "time-based" | "manual"
    invalidateOn: DatomQuery    // What changes invalidate the cache
    ttl?: Duration              // Optional time-to-live
  }

  // Cultural specification (optional)
  culture?: {
    locale: LocaleCode
    norms: ContractRef          // Cultural norms Contract
    adaptation: "literal" | "adapted" | "original"
  }
}
```

### Applied to each domain

**Code Creation Contract:**
```typescript
{
  creates: "code",
  requires: { inputs: { attribute: ':effect/session-recap' } },
  produces: {
    required: [':session/themes', ':session/mood'],
    forbidden: [':session/diagnosis'],
    stateMachine: sessionRecapMachine
  },
  validates: {
    pre: [':contract/typescript', ':contract/lint'],
    inflight: [],
    post: [':contract/test', ':contract/coverage']
  },
  cache: {
    strategy: "content-addressed",
    invalidateOn: { attribute: ':handler/module-path' }
  }
}
```

**Content Creation Contract:**
```typescript
{
  creates: "content",
  requires: { inputs: { attribute: ':post/*' } },
  produces: {
    required: [':post/title', ':post/body', ':post/status'],
    schema: postSchema
  },
  validates: {
    pre: [':contract/schema'],
    inflight: [':contract/editorial-guidelines'],
    post: [':contract/seo-check']
  },
  cache: {
    strategy: "content-addressed",
    invalidateOn: { attribute: ':post/*' }
  }
}
```

**Component Creation Contract:**
```typescript
{
  creates: "component",
  produces: {
    required: [':component/render', ':component/props-interface'],
  },
  validates: {
    pre: [':contract/typescript'],
    inflight: [],
    post: [':contract/storybook-stories', ':contract/axe-a11y', ':contract/visual-regression']
  },
  cache: {
    strategy: "content-addressed",
    invalidateOn: { attribute: ':component/*' }
  }
}
```

**Culture Creation Contract:**
```typescript
{
  creates: "culture",
  requires: { inputs: { attribute: ':post/*' }, capabilities: [':cap/cultural-author'] },
  produces: {
    required: [':post/title', ':post/body'],
    forbidden: [':diagnosis/*']
  },
  validates: {
    pre: [':contract/schema'],
    inflight: [':contract/nl-therapy-norms'],
    post: [':contract/wgbo-compliance']
  },
  cache: {
    strategy: "content-addressed",
    invalidateOn: { attribute: ':contract/nl-therapy-norms' }
  },
  culture: {
    locale: 'nl',
    norms: ':contract/nl-therapy-norms',
    adaptation: 'adapted'
  }
}
```

### The unification

Notice: all four Creation Contracts have the same shape. The `creates` field varies, the specific Contracts vary, but the structure is identical. This means:

1. **One dispatcher pattern handles all creation** — resolve the Creation Contract, execute the effectHandler, validate, cache.
2. **One cache pattern handles all reuse** — content-addressed, invalidate on input/Contract change.
3. **One Surface pattern shows all creation status** — "this Artifact is valid/stale/invalid" displayed the same way for code, content, components, and culture.
4. **One AI pattern generates all types** — the AI receives the Creation Contract as context, generates within its constraints, in-flight validation catches violations.

### Assessment

**Strengths:** Maximum unification. All creation is one pattern with one interface. The `cache` field makes caching a first-class concern of every creation. The `culture` field elegantly adds locale/cultural concerns without making them a separate system. AI generation gets a clean interface — pass the Creation Contract, get valid output.

**Weaknesses:** Overloading. A Creation Contract for a simple blog post and a Creation Contract for a complex handler state machine look the same structurally but are very different in practice. The `stateMachine` field only makes sense for code; the `culture` field only makes sense for content. The interface might be so general that it doesn't guide implementation. Also: is this really different from "Contract + effectHandler + cache attributes"? It might be renaming, not simplifying.

---

## Alternative 4: "The Creation Loop — Replacing the Dual Loop"

> What if the dual-loop (human + AI) is the wrong abstraction? Replace it with a Creation Loop that unifies all creation.

### The Insight

vivief-concepts §5 describes the **Dual-Loop Pattern**: human loop (synchronous, authoritative) and AI loop (asynchronous, draft-only). But this misses something:

- The **system** also creates — derived datoms, aggregated effects, cached compilations, schema migrations.
- **Caching** is a form of creation — the system "creates" by remembering a previous creation's output.
- The human and AI don't just create differently — they create the **same things** through the same flow.

What if instead of "human loop + AI loop," we have one **Creation Loop** that any actor (human, AI, system) can enter?

### The Creation Loop

```
     ┌─────────────────────────────────────────────────┐
     │                                                   │
     ▼                                                   │
  Intent ──→ Contract ──→ Create ──→ Validate ──→ Cache  │
     │          │            │           │          │     │
     │      (defines      (human,    (Contract   (hash   │
     │       what's       AI, or    enforces)   inputs)  │
     │       valid)      system)                  │     │
     │          │            │           │         ▼     │
     │          │            │           │      Reuse ───┘
     │          │            │           │      (if valid)
     │          │            │           │
     │          ▼            ▼           ▼
     │      Surface      Surface     Surface
     │     (Contract     (creation   (violations
     │      visible)     visible)     visible)
     └─────────────────────────────────────────────────
              (when inputs change or Contract evolves)
```

**One loop. Any actor. Any domain.**

| Step | Code | Content | UI Component | Culture |
|------|------|---------|-------------|---------|
| **Intent** | `:effect/create-handler` | `:effect/create-post` | `:effect/create-component` | `:effect/adapt-culture` |
| **Contract** | Behavior Contract | Schema Contract | Render Contract | Cultural Contract |
| **Create** | Developer/AI writes code | Author/AI writes content | Designer/AI builds component | Expert/AI adapts content |
| **Validate** | Type-check, lint, test | Schema, editorial | Stories, a11y, visual | Cultural norms, legal |
| **Cache** | Build output, compiled module | Published version | Storybook build | Approved adaptation |
| **Reuse** | Import cached module | Serve cached page | Render cached component | Use cached translation |
| **Invalidate** | Source changed | Content edited | Design changed | Norms updated |

### The three creation actors (replacing three actors)

The current vivief-concepts §4 has three actors: System, LLM, Human. In the Creation Loop, they're three **creation strategies**:

| Strategy | When | Creation behavior | Validation |
|----------|------|-------------------|------------|
| **System creates** | Derivation, aggregation, schema migration | Deterministic. Always same output for same input. | Always passes if inputs are correct. |
| **AI creates** | Generation, adaptation, summarization | Probabilistic. May produce different outputs. Marked `:tx/source :ai`. | In-flight + post-commit validation. Human reviews if confidence < threshold. |
| **Human creates** | Authoring, designing, expert judgment | Authoritative. Final say. | Post-commit validation (Contract still enforces, but human can override with `:tx/why`). |

**Caching changes per strategy:**
- System creations: always cacheable (deterministic).
- AI creations: cacheable if inputs + Contract unchanged. But may be "re-creatable for improvement" — the AI might produce a better version with a newer model.
- Human creations: cacheable until human edits. The cache IS the human's last version.

### The Cache as First-Class Concern

The cache isn't an optimization — it's a **structural part of the Creation Loop**. Every creation produces:

```
[creation:X  :creation/inputs-hash     "sha256:..."    tx:N  true]
[creation:X  :creation/contract-hash   "sha256:..."    tx:N  true]
[creation:X  :creation/actor           :ai/opus-4      tx:N  true]
[creation:X  :creation/strategy        :generated      tx:N  true]
[creation:X  :creation/valid           true             tx:N  true]
[creation:X  :creation/tokens-saved    0                tx:N  true]  // first time
```

On cache hit:
```
[creation:X  :creation/tokens-saved    1500             tx:M  true]  // saved 1500 tokens
```

Over time, Projection queries can answer: "How many LLM tokens has caching saved this week?" "Which Artifacts are most frequently re-created?" "Which Contracts cause the most cache invalidations?"

### The Creation Loop replaces §4 + §5

Current vivief-concepts:
- §4 Three Actors and the Develop/Use Blur
- §5 The Dual-Loop Pattern

Replaced by:
- **§4 The Creation Loop** — one loop for all creation (code, content, UI, culture)
- Three creation strategies (system, AI, human) instead of three actors
- Cache as structural concern, not optimization
- Observability of creation (tokens saved, invalidation frequency)

The develop/use blur is **absorbed** — it's no longer a separate insight because the Creation Loop makes no distinction between developing and using. Writing a handler and writing a blog post are the same loop with different Contracts.

### The deepest implication: Contract evolution as creation

When a Contract changes (e.g., a new cultural norm is added to the Dutch therapy Contract), all cached creations validated against the old Contract become potentially invalid. This triggers:

```
Contract evolves (tx:N)
  → All Artifacts with :creation/contract-hash matching old Contract are invalidated
    → Re-creation triggered for each
      → AI re-generates within new Contract constraints
        → Human reviews critical ones (confidence < threshold)
          → Cache updated with new Contract hash
```

**Contract evolution cascades through all creation domains.** A regulatory change in Dutch therapy law → Cultural Contract updates → All Dutch therapy content Artifacts invalidated → AI re-adapts → Cultural experts review. The same mechanism: a TypeScript version upgrade → type-check Contract updates → All code Artifacts invalidated → System re-compiles → Tests run.

### Assessment

**Strengths:** Maximum conceptual simplification. One loop replaces two sections (§4 + §5). The develop/use blur is dissolved rather than explained. Caching is structural, not an afterthought — and observability of cache (tokens saved) is built in. Contract evolution cascading through all creation is powerful.

**Weaknesses:** The dual-loop pattern has clinical significance — the human loop is synchronous/authoritative and the AI loop is asynchronous/draft-only. Collapsing them into "creation strategies" might lose the safety property that AI never directly mutates authoritative state. The `:tx/source :ai` + `:tx/status :pending` pattern needs to survive inside the Creation Loop, not be abstracted away. Also: "cache invalidation" is one of the two hard problems in CS. Making it structural makes the hard problem unavoidable rather than optional.

---

## Cross-Cutting Synthesis

### What all four alternatives reveal

The user's observation is correct: **code, content, UI components, and world/culture creation ARE the same activity.** They all follow:

```
Contract → Create (by any actor) → Validate → Cache/Reuse → Surface
```

The differences are:
- What Contract type applies (Behavior, Schema, Render, Cultural)
- What "valid" means (passes tests, editorial review, a11y scan, cultural norms)
- How caching works (deterministic = always cache, probabilistic = cache with invalidation)

### The strongest ideas from each alternative

| Alternative | Strongest idea |
|-------------|---------------|
| **1** | `Contract → Create → Validate → Cache` as named pattern. Simple, no new concepts. |
| **2** | **Artifact** as named pattern for "datom cluster with provenance and cache validity." Gives vocabulary. |
| **3** | **Creation Contract** unifies all Contract sub-types under "how to create a valid X." The `cache` field makes caching a Contract concern. |
| **4** | **Creation Loop replaces dual-loop.** Three creation strategies (system/AI/human). Cache as structural. Contract evolution cascades. |

### What might combine into the vivief concepts

**Minimal (from Alt 1):** Just name the pattern. `Contract → Create → Validate → Cache` is already what vivief does. Make it explicit that this applies to content, culture, and UI — not just code.

**Medium (from Alt 2 + 3):** Add Artifact as a named pattern (not a concept) and cache attributes to Contracts. Every Contract can optionally specify cache strategy and invalidation triggers.

**Maximum (from Alt 4):** Replace the dual-loop with the Creation Loop. Absorb §4 (three actors) and §5 (dual loop) into one section. Make caching structural. Add creation observability (tokens saved, invalidation frequency).

### The question for the next step

How far to push unification?

- If code/content/UI/culture creation is truly the same, the Creation Loop (Alt 4) is the right frame.
- If the dual-loop's safety property (AI = draft-only, human = authoritative) must remain prominent, keep the dual-loop but add the creation pattern as a cross-cutting concern.
- If simplicity wins, just name the pattern (Alt 1) and let implementations figure out caching.

The test: does the Creation Loop make vivief-concepts shorter and cleaner, or longer and more abstract?

---

*Version: brainstorm — 4 alternatives for unifying creation across code, content, UI, and culture. Key insight: all creation follows `Contract → Create → Validate → Cache`. Strongest ideas: Artifact as named pattern, Creation Contract with cache spec, Creation Loop replacing dual-loop. The develop/use blur dissolves when all creation is one pattern.*
