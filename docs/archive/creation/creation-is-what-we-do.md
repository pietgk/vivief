# Creation Is What We Do (Archived)

> **Archived 2026-04-09.** "Everything is creation" thesis absorbed into [fractal-software-factory.md](../../contract/vision/fractal-software-factory.md) — the same retrieve→generate→evaluate pattern at every scale, with trust as the governing parameter.

> Original brainstorm: Four alternatives exploring the idea that EVERYTHING in vivief is creation.
>
> A counselor having a session = creating clinical insights. devac analyzing code = creating a code graph. A morning brief from emails = creating a summary. Writing a handler = creating code. Translating content = creating cultural adaptation. All creation. All `Contract → Create → Validate → Cache`.
>
> The only variable: how much trust the Contract places in the creator. Human = authoritative. AI = sandboxed or approval-gated. System = deterministic. The Contract decides.

---

## The Realization

Alternative 4 from vivief-concepts-creation.md showed that code, content, UI, and culture creation follow the same loop. But we stopped too soon. Look further:

| Activity | What's created | By whom | Governed by |
|----------|---------------|---------|-------------|
| Counselor runs a session | Session notes, mood assessment, treatment observations | Human (counselor) | Clinical workflow Contract |
| AI analyzes session | Themes, patterns, risk flags | AI | Clinical AI Contract (draft-only, human approves) |
| devac syncs a repo | Code graph datoms (nodes, edges, effects) | System | Extractor Contract (deterministic) |
| devac runs validation | Diagnostic datoms (errors, warnings) | System | Validator Contract (deterministic) |
| Morning brief generated | Summary of emails + agenda + priorities | AI | Brief Contract (what to include, what to redact) |
| User drags a card on a board | Status change datom | Human | Workflow Contract (valid transitions) |
| Counselor writes treatment plan | Treatment plan datoms | Human | Treatment Contract (evidence-based, regulatory) |
| AI suggests treatment adjustment | Draft treatment datoms | AI | Treatment Contract + approval gate |
| P2P peer sends datoms | Replicated datoms from another device | Remote system | Sync Contract (validate before accept) |

**Every single thing vivief does is creation.** The effectHandler formula `(state, intent) => (state', [intent'])` IS creation: you take existing state, apply an intent, and create new state. The only question is: **who creates, and how much does the Contract trust them?**

---

## Alternative 1: "Creation IS the Core Thesis"

> Replace "Everything is `(state, intent) => (state', [intent'])`" with "Everything is creation."

### The New Core Thesis

**Everything is creation, governed by Contracts, performed by actors with varying trust.**

The effectHandler formula doesn't go away — it's still the mechanical description. But the thesis shifts from a formula to an intent: **the platform exists to help humans, AI, and systems create things, with Contracts ensuring quality and trust.**

```
Creation = Actor + Intent + Contract + State → New State + Cache
```

| Component | What it is |
|-----------|-----------|
| **Actor** | Who creates: human (authoritative), AI (sandboxed), system (deterministic) |
| **Intent** | What they want to create: the effect |
| **Contract** | What "valid" means + how much trust the actor gets |
| **State** | Current datoms (via Projection) |
| **New State** | Created datoms (committed after validation) |
| **Cache** | Avoid re-creating if inputs + Contract unchanged |

### Trust as Contract property

The Contract doesn't just validate output — it determines **how the creation is treated**:

```typescript
interface CreationTrust {
  // Who is creating
  actor: "human" | "ai" | "system"

  // How much trust
  trust: "authoritative" | "sandboxed" | "approval-gated"

  // What that means
  commit: "immediate" | "draft-then-approve" | "sandbox-then-promote"
}
```

| Actor | Default Trust | Commit behavior |
|-------|--------------|-----------------|
| **Human** | Authoritative | Immediate commit. Contract validates but human has override with `:tx/why`. |
| **AI** | Approval-gated | Draft commit (`:tx/source :ai`, `:tx/status :pending`). Human approves before authoritative. |
| **AI (low-risk)** | Sandboxed | Commits to sandbox Projection. Visible to author only. Promoted after review. |
| **System** | Authoritative (deterministic) | Immediate commit. Contract validates. No override needed — deterministic = always correct for given inputs. |

**The counselor session example:**

```
Counselor speaks into voice recorder (Human, authoritative)
  → Contract: clinical workflow (must produce notes, may produce mood assessment)
  → Trust: authoritative — commits immediately
  → Created: session notes datoms, mood datoms
  → Cache: N/A (human creation is always fresh)

AI analyzes the session (AI, approval-gated)
  → Contract: clinical AI (must produce themes, must not produce diagnosis, max 3 risk flags)
  → Trust: approval-gated — drafts with :tx/status :pending
  → Created: theme datoms (draft), pattern datoms (draft), risk datoms (draft)
  → Cache: valid until session datoms change or Contract changes
  → Human approves → :tx/status changes to :committed
```

### The five concepts stay, creation becomes the thesis

The concepts don't change:
- **Datom** = what's created (facts)
- **Projection** = what the creator can see (scoped state)
- **Surface** = where creation happens and where results appear
- **Contract** = what valid creation looks like + trust level
- **effectHandler** = the creation mechanics (function or actor)

But the **framing** changes. Instead of "seven concepts that model the platform," it's "the platform is a creation engine, and these five concepts are how creation works."

### Assessment

**Strengths:** "Creation" is more intuitive than `(state, intent) => (state', [intent'])`. A counselor understands "I create session notes" better than "my effectHandler produces datoms." Trust as Contract property elegantly unifies the dual-loop's safety model (AI = draft) with the single creation pattern. The formula is still there — it's just not the thesis.

**Weaknesses:** "Everything is creation" is very broad. Deleting a datom (retraction) is creation? Reading data (Projection query) is creation? The thesis might be so general it loses explanatory power. Also, "creation" has positive connotations — error handling, failure recovery, and conflict resolution don't feel like "creation."

---

## Alternative 2: "The Creation Spectrum"

> Not all creation is equal. There's a spectrum from fully-trusted to fully-sandboxed, and the Contract positions each creation on it.

### The Spectrum

```
Fully Trusted ◄──────────────────────────────────────► Fully Sandboxed
     │                    │                    │                │
  Human               System              AI (gated)      AI (sandbox)
  override ok         deterministic       draft+approve    isolated env
  immediate           immediate           pending          invisible
  commit              commit              until review     until promote
```

Every creation has a position on this spectrum. The Contract sets it.

### Examples across the spectrum

**Fully trusted (human, authoritative):**
- Counselor writes session notes → immediate commit
- Developer deploys handler → immediate commit (Contract still validates, but human overrides)
- Cultural expert writes adapted content → immediate commit

**Trusted (system, deterministic):**
- devac extracts code graph → immediate commit (deterministic, always correct for inputs)
- Schema migration transforms datoms → immediate commit
- Cache serves previous creation → immediate (it's the same output)
- P2P peer validation accepts datoms → immediate (Contract validated incoming)

**Gated (AI, approval required):**
- AI suggests session themes → draft, counselor reviews
- AI generates treatment plan adjustment → draft, counselor reviews
- AI translates content → draft, cultural expert reviews
- AI writes handler code → draft, developer reviews
- Morning brief from emails → draft, user reviews before acting on it

**Sandboxed (AI, isolated):**
- AI experiments with new handler design → sandbox, invisible to production
- AI generates alternative cultural adaptations → sandbox, expert picks best
- AI proposes schema changes → sandbox, tested against existing data before promotion
- Speculative analysis (what-if scenarios) → sandbox, never commits unless promoted

### The Sandbox as Projection

A sandbox is not a separate system — it's a **Projection scope**:

```typescript
Projection({
  filter: { attribute: ':sandbox/*' },
  scope: 'sandbox:experiment-42',
  delivery: 'live'
})
```

Sandboxed creations commit to the datom store but under a sandbox namespace. Only the creator and reviewers can see them (via sandbox Projection). Promotion = re-assert the datoms without the sandbox namespace prefix. Rejection = retract the sandbox datoms.

```
// Sandboxed creation
[sandbox:exp42:recap:42  :session/themes  ["sleep", "anxiety"]  tx:90  true]

// After promotion (human approved)
[recap:42  :session/themes  ["sleep", "anxiety"]  tx:91  true]
// With provenance
[tx:91  :tx/promoted-from  sandbox:exp42  tx:91  true]
[tx:91  :tx/approved-by    :user/anna     tx:91  true]
```

### The Morning Brief example

```
Intent: :brief/creation-requested
Actor: AI (gated)
Contract: {
  creates: "brief",
  inputs: { attribute: [':email/*', ':calendar/*', ':task/*'] },
  produces: {
    required: [':brief/priorities', ':brief/schedule'],
    forbidden: [':email/body']  // Redaction: brief summarizes, never includes full email text
  },
  trust: "approval-gated",
  cache: {
    invalidateOn: { attribute: [':email/*', ':calendar/*'] },
    strategy: "content-addressed"
  }
}

Creation:
  AI reads today's emails, calendar, tasks via Projection
  → AI generates brief within Contract constraints
    → In-flight Contract validates: no full email bodies, no confidential calendar details
  → Brief committed as draft (:tx/status :pending)
    → Surface shows brief to user
      → User approves (or edits, then approves)
        → Brief promoted to :committed
          → Cached: if no new emails/calendar changes, tomorrow's brief generation can skip re-reading unchanged items
```

### The Counselor Session as creation spectrum

A single counseling session produces creations at multiple trust levels:

```
Session starts
  │
  ├── Human creates: voice notes (authoritative, immediate)
  ├── System creates: transcript from audio (deterministic, immediate)
  ├── AI creates: structured session notes (gated, draft → counselor approves)
  ├── AI creates: mood assessment (gated, draft → counselor approves)
  ├── AI creates: risk flag (gated, draft → counselor reviews urgently)
  ├── AI creates: pattern across sessions (gated, counselor reviews at leisure)
  ├── AI creates: treatment plan suggestion (sandboxed, counselor may promote)
  └── System creates: updated code graph of clinical data model (deterministic, immediate)
```

The same session. The same creation loop. Different trust levels per creation. The Contract governs each.

### Assessment

**Strengths:** The spectrum is intuitive and practical. Sandbox as Projection is elegant — no separate infrastructure, just scoped datoms. The morning brief example shows how trust + caching + redaction compose naturally. The counselor session shows multiple trust levels coexisting in one workflow.

**Weaknesses:** Four trust levels (trusted/deterministic/gated/sandboxed) might blur. What's the difference between "gated" and "sandboxed"? Both require human review. The distinction (gated = visible as draft, sandboxed = invisible until promoted) might be too subtle. Also, the spectrum metaphor suggests a continuous range, but in practice there are discrete trust policies.

---

## Alternative 3: "Creation Contexts"

> What if the variable isn't trust level but context? A creation context bundles: who creates, what Contract applies, what Projection is available, and how to cache.

### The Insight

When a counselor has a session, they're not thinking "I'm creating datoms with an authoritative trust level." They're in a **session context** — a mode of working that determines what's available, what's expected, and what happens with what they create.

Similarly, a developer writing a handler is in a **development context**. An AI generating a morning brief is in a **brief context**. A cultural expert adapting content is in a **cultural context**.

What if "context" is the organizing concept for creation?

### Creation Context

```typescript
interface CreationContext {
  // Identity
  name: string                        // "counseling-session", "code-development", "morning-brief"
  locale?: LocaleCode                 // Cultural context

  // Who can create in this context
  actors: {
    human: { trust: "authoritative", roles: Role[] }
    ai: { trust: "gated" | "sandboxed", contracts: ContractRef[] }
    system: { trust: "deterministic", handlers: HandlerRef[] }
  }

  // What's visible (the Projection for this context)
  projection: Projection

  // What can be created (the Contracts that apply)
  contracts: ContractRef[]

  // How creations are cached
  cache: CacheStrategy

  // How creations are surfaced
  surface: SurfaceMode                // What mode the creation shows up in
}
```

### The Contexts

**Counseling Session Context:**
```typescript
{
  name: "counseling-session",
  actors: {
    human: { trust: "authoritative", roles: [":role/counselor"] },
    ai: { trust: "gated", contracts: [":contract/clinical-ai"] },
    system: { trust: "deterministic", handlers: [":handler/transcribe"] }
  },
  projection: {
    filter: { entity: 'session:current', depth: 'refs' },
    scope: 'consented',
    delivery: 'live',
    freshness: 'in-flight'
  },
  contracts: [":contract/clinical-workflow", ":contract/no-diagnosis"],
  cache: { strategy: "content-addressed", invalidateOn: { attribute: ':session/*' } },
  surface: "canvas"  // Session notes in Canvas mode
}
```

**Code Development Context:**
```typescript
{
  name: "code-development",
  actors: {
    human: { trust: "authoritative", roles: [":role/developer"] },
    ai: { trust: "sandboxed", contracts: [":contract/behavior"] },
    system: { trust: "deterministic", handlers: [":handler/typecheck", ":handler/lint"] }
  },
  projection: {
    filter: { attribute: ':handler/*' },
    delivery: 'live'
  },
  contracts: [":contract/typescript", ":contract/lint", ":contract/test"],
  cache: { strategy: "content-addressed", invalidateOn: { attribute: ':handler/module-path' } },
  surface: "canvas"  // Code editor in Canvas mode
}
```

**Morning Brief Context:**
```typescript
{
  name: "morning-brief",
  actors: {
    human: { trust: "authoritative" },
    ai: { trust: "gated", contracts: [":contract/brief-format", ":contract/redaction"] },
    system: { trust: "deterministic", handlers: [":handler/calendar-sync"] }
  },
  projection: {
    filter: { attribute: [':email/*', ':calendar/*', ':task/*'] },
    delivery: 'snapshot'
  },
  contracts: [":contract/brief-format", ":contract/email-redaction"],
  cache: { strategy: "time-based", ttl: "1h" },
  surface: "card"  // Morning brief as Card
}
```

**Cultural Adaptation Context:**
```typescript
{
  name: "cultural-adaptation",
  locale: "nl",
  actors: {
    human: { trust: "authoritative", roles: [":role/cultural-expert"] },
    ai: { trust: "gated", contracts: [":contract/nl-therapy"] },
    system: { trust: "deterministic" }
  },
  projection: {
    filter: { attribute: ':post/*', world: 'world/nl' },
    delivery: 'live'
  },
  contracts: [":contract/nl-therapy", ":contract/wgbo"],
  cache: { strategy: "content-addressed", invalidateOn: { attribute: ':contract/nl-therapy' } },
  surface: "canvas"
}
```

### Creation Context as the "workspace" concept

A Creation Context IS what people call a "workspace" or "mode" — the thing that bundles your tools, your permissions, your view, and your rules. Opening a counseling session = entering the counseling-session Creation Context. Starting to code = entering the code-development Creation Context.

**Context switching** is explicit: change the Creation Context, change the Projection, change the Contracts, change the trust levels. The Surface morphs to match.

### The devac connection

devac already has this implicitly:
- `devac sync` = system creation in an extraction context
- `devac validate` = system creation in a validation context
- `devac-mcp` = AI creation in a query context
- `devac-worktree start` = human+AI creation in an issue context

Making Creation Context explicit would unify devac's modes with the counseling app's modes with the morning brief's mode.

### Assessment

**Strengths:** "Context" is intuitive. People already think in contexts — "I'm in a session," "I'm coding," "I'm doing my morning review." Context bundles everything (Projection, Contracts, trust, cache, Surface mode) into one switchable unit. Context switching is the UX — enter a context, everything configures.

**Weaknesses:** Is "Creation Context" a new concept? It looks like a saved Projection + Contract bundle + trust rules. If it's just a convenience wrapper, it's a pattern, not a concept. If it's first-class, we've added a 6th concept to the five. Also, "context" is an overloaded word in LLM-land (context window, context length) — naming collision risk.

---

## Alternative 4: "Creation and the Develop/Use/Live Dissolution"

> The develop/use blur doesn't go far enough. It's not just develop and use that blur — it's develop, use, live, maintain, adapt, and cache. They're all creation.

### The Dissolution

vivief-concepts §4.2 says: "Developing the app and using the app are the same activity when LLMs are involved." True. But there are more boundaries to dissolve:

| Traditional boundary | What it separates | How creation dissolves it |
|---------------------|-------------------|--------------------------|
| **Develop vs. Use** | Writing code vs. using the app | Both are creation with different Contracts |
| **Author vs. Read** | Writing content vs. consuming content | Both are creation — reading creates understanding, the AI that reads creates analysis |
| **Build vs. Run** | Compiling/deploying vs. executing | Build = system creation (cache the result). Run = creation in real-time. Same loop. |
| **Original vs. Translation** | Source content vs. translated content | Both are creation within cultural Contracts |
| **Fresh vs. Cached** | New computation vs. reused result | Cached = valid creation from the past. Fresh = new creation. Same loop, different cache outcome. |
| **Human vs. AI** | Manual creation vs. automated creation | Same loop, different trust in the Contract |
| **Online vs. Offline** | Connected creation vs. local creation | Same loop, P2P syncs creations when reconnected |
| **Live vs. Draft** | Production vs. staging | Same datoms, different Projection scope (sandbox vs. live) |

**After dissolution, only creation remains.** The Contract varies. The trust varies. The cache varies. The Projection varies. But the activity is always: take state, apply intent, create new state, validate, cache.

### What this means for the five concepts

The five concepts don't change. But their **relationship to each other** simplifies:

```
              ┌─── Datom: what's created ───┐
              │                              │
              │      ┌── Projection: ──┐     │
              │      │  what the        │     │
              │      │  creator sees    │     │
              │      └────────┬────────┘     │
              │               │               │
              │      ┌────────▼────────┐     │
              │      │   Contract:      │     │
              │      │   what valid     │     │
              │      │   creation       │     │
              │      │   looks like     │     │
              │      │   + trust level  │     │
              │      └────────┬────────┘     │
              │               │               │
              │      ┌────────▼────────┐     │
              │      │  effectHandler:  │     │
              │      │  the creation    │     │
              │      │  mechanics       │     │
              │      └────────┬────────┘     │
              │               │               │
              │      ┌────────▼────────┐     │
              │      │   Surface:       │     │
              │      │   where creation │     │
              │      │   happens and    │     │
              │      │   results appear │     │
              │      └─────────────────┘     │
              │                              │
              └──────────────────────────────┘
```

Every concept serves creation:
- **Datom** is the material of creation (facts in, facts out)
- **Projection** is the creator's view (what they can see and work with)
- **Contract** is the creation's spec (what valid output looks like, how much to trust the creator)
- **effectHandler** is the creation engine (the function/actor that does the work)
- **Surface** is the creation's studio and gallery (where you create and where you see results)

### The Cache as creation memory

Cache is not a separate concept — it's the system's **memory of previous creations**. The platform remembers what it created, under what conditions, and whether those conditions still hold.

```
Creation happens
  → Output datoms committed
    → Creation provenance recorded:
        :creation/inputs-hash    (what state was read)
        :creation/contract-hash  (what rules applied)
        :creation/actor          (who created)
        :creation/strategy       (authored/generated/adapted/derived/cached)
    → On next identical intent:
        if inputs-hash matches AND contract-hash matches:
          → return cached output (zero cost)
          → record :creation/cache-hit true, :creation/tokens-saved N
        else:
          → re-create (new cost)
```

**The counselor doesn't re-analyze a session that hasn't changed.** The developer doesn't re-compile code that hasn't been edited. The AI doesn't re-translate content whose source and Cultural Contract are unchanged. The morning brief doesn't re-read emails that arrived before yesterday's brief.

This is the same principle as Turborepo, Nix, or React's memoization — but applied to all creation across all domains.

### The Full Example: A Day in Creation

```
7:00  Morning Brief (AI creates, gated)
      → Contract: brief-format + email-redaction
      → AI reads emails + calendar via Projection
      → In-flight Contract validates: no full email bodies
      → Draft brief committed → User reviews → Approves
      → Cached: valid until new emails arrive

8:30  Code Review (Human + AI create, mixed trust)
      → Developer reads code (human creation: understanding)
      → AI suggests improvements (sandboxed creation)
      → Developer accepts some, rejects others (authoritative creation)
      → System runs tests (deterministic creation: pass/fail datoms)
      → All cached: unchanged code = unchanged test results

10:00 Counseling Session (Human + AI + System create)
      → Counselor speaks → System transcribes (deterministic, immediate)
      → Counselor types notes (authoritative, immediate)
      → AI proposes themes (gated, draft → counselor reviews)
      → AI flags risk (gated, draft → counselor reviews urgently)
      → All cached per-component: transcript cached until audio changes,
        themes cached until transcript changes

12:00 Content Adaptation (AI + Human create, cultural context)
      → AI adapts English article to Dutch (gated, Cultural Contract)
      → In-flight Contract: "use 'je' not 'u'" — validates mid-stream
      → Cultural expert reviews adaptation (authoritative)
      → Cached: valid until source article or Cultural Contract changes

14:00 Schema Evolution (System + Human create)
      → Developer adds new attribute to schema (authoritative)
      → Schema Contract validates (deterministic)
      → System migrates existing datoms (deterministic creation)
      → All downstream caches invalidated (Contract changed)
      → AI re-generates affected content (gated, re-validated)

16:00 Treatment Plan Review (Human + AI create)
      → AI synthesizes 8 sessions into treatment progress (gated)
      → Counselor reviews, edits, approves (authoritative)
      → Cached: valid until new session datoms
      → Next month: AI creates updated progress from cache + new sessions only
        (doesn't re-read the 8 sessions it already summarized)
```

Every line is creation. The loop is always the same. The variables: who creates, what Contract applies, how much trust, what's cached.

### Assessment

**Strengths:** Complete dissolution of artificial boundaries. "Everything is creation" is not just a thesis — this alternative shows it concretely across a full day. The cache-as-memory metaphor is strong: the platform remembers its previous creations and only re-creates when something changes. The five concepts are strengthened, not changed — each serves creation more clearly. The day-in-creation example makes the abstract concrete.

**Weaknesses:** "Reading is creation" is a stretch. When the counselor reads a client file, are they "creating understanding"? Philosophically yes, practically no — no datoms are committed. The dissolution might go too far, blurring useful distinctions. Also: "everything is creation" and "everything is an effectHandler" are isomorphic claims — if the insight is the same, the reframing doesn't add much. The real new thing here is **cache as structural concern** and **trust as Contract property** — the "everything is creation" framing is rhetoric more than architecture.

---

## Cross-Cutting Synthesis

### The strongest ideas across all four

| Idea | From | Power |
|------|------|-------|
| **Trust as Contract property** | Alt 1, 2 | Unifies dual-loop safety (AI = draft) with single creation pattern |
| **Sandbox as Projection scope** | Alt 2 | No separate infrastructure — sandbox is just scoped datoms |
| **Cache as creation memory** | Alt 1, 4 | Content-addressed, reactive invalidation, token savings |
| **Creation Context** | Alt 3 | Bundles Projection + Contract + trust + cache into switchable workspace |
| **Contract evolution cascades** | Alt 4 | When rules change, all affected cached creations invalidate |
| **The "day in creation" pattern** | Alt 4 | Concrete proof that all activities follow one loop |
| **In-flight cultural validation** | Content doc | Cultural Contracts validate AI mid-stream (from content brainstorm) |

### What should go into vivief-concepts

**Definitely:**
- Trust as Contract property (authoritative / gated / sandboxed) — this replaces §5 Dual-Loop's safety model with something more general
- Cache as structural concern with content-addressed invalidation — saves tokens, avoids redundant human effort
- Sandbox as Projection scope — elegant, no new infrastructure

**Probably:**
- Creation Context as named pattern (not new concept) — bundles workspace configuration
- "Everything is creation" as thesis reframing — makes the platform more accessible to non-developers

**Maybe:**
- Replacing §4+§5 with a Creation section — depends on whether the dual-loop's clinical safety significance needs to stay prominent
- "Reading is creation" — philosophically interesting, architecturally questionable

### The question for the next step

The current vivief-concepts has:
- §4: Three Actors (System, LLM, Human) — maps to trust levels
- §5: Dual-Loop Pattern — maps to gated AI creation
- §7: Development Flow — maps to code creation

These three sections describe the same thing from different angles. A "Creation" section could replace all three:
- Three creation strategies (system/AI/human) with trust levels
- One creation loop (not dual — one loop, any actor)
- Cache as structural concern
- Development flow = code creation = one instance of the universal loop

Shorter, more unified, more general. But: does it lose the clinical safety emphasis that the dual-loop provides?

---

*Version: brainstorm — 4 alternatives for "creation is what we do." Key insights: trust as Contract property (authoritative/gated/sandboxed), sandbox as Projection scope, cache as creation memory with content-addressed invalidation. The develop/use blur extends to develop/use/author/translate/analyze/cache — all creation, one loop, variable trust.*
