# Vivief Platform Concepts — V4 "The Contract"

> Intermediate exploration: what if Contract is not one of seven — but the ONE?
> Goal: see what happens when every concept is expressed as a kind of Contract.

---

## Core Thesis

**Everything is a contract.**

The challenge document kept arriving at the same place: Rules are Contracts. State machines are Contracts. Protocols are Contracts. Access control is a Contract. Schema is a Contract. Even the datom model itself — `[E, A, V, Tx, Op]` — is a Contract about what a fact looks like.

What if we take this seriously? Not "Contract is one of seven concepts" but "Contract is the meta-concept, and the other six are Contract specializations."

```
Contract
  ├── Schema Contract    → Datom (what a fact looks like)
  ├── Query Contract     → Lens (what you're allowed to see)
  ├── Render Contract    → Surface (how it should look)
  ├── Trust Contract     → Seal (who holds which keys)
  ├── Sync Contract      → P2P (how facts replicate)
  └── Behavior Contract  → effectHandler (how state transitions)
```

**The radical claim:** There is one concept. It has six faces.

---

## The Six Faces of Contract

### Face 1: Schema Contract (Datom)

A Schema Contract declares what facts can exist.

```
[:schema/client-name  :schema/type        :text                tx:1  true]
[:schema/client-name  :schema/required     true                 tx:1  true]
[:schema/client-name  :schema/attribute    :client/name         tx:1  true]
[:schema/session-mood :schema/type        :keyword             tx:1  true]
[:schema/session-mood :schema/enum        [:calm :anxious :mixed :elevated]  tx:1  true]
```

This IS the datom model — schema-as-datoms. But now it's explicitly a Contract: "any datom with attribute `:client/name` must have a text value." Violating this Contract is the same as any other Contract violation. The schema validation that runs on every commit is Contract enforcement.

**What this reframing gives us:** Schema evolution is Contract evolution. Adding an attribute = asserting a new Schema Contract. Making a field required = tightening a Contract. Schema migration = a handler that transforms datoms to satisfy a new Contract version.

### Face 2: Query Contract (Lens)

A Query Contract declares what subset of facts an observer can see. This is the Lens — but explicitly framed as a Contract between the observer and the store.

```typescript
interface QueryContract {
  // What this observer is allowed to query
  filter: DatomQuery
  depth: "own" | "refs" | "all"

  // Capability proof (the observer must present this to construct the query)
  capability: CapabilityToken

  // What the store promises in return
  delivery: "snapshot" | "live"    // One-shot or continuous
  freshness: "committed" | "in-flight"  // Only committed datoms or also streaming?
}
```

**The authorization gap solved.** The challenge identified that Lens + Seal authorization is underspecified. As a Query Contract, it's explicit: the observer presents a capability token, the Contract specifies what they can see and how. No capability = no query. This is open-webui's `AccessGrant` pattern, but declarative and composable.

**Streaming as a Contract term.** "This observer can see in-flight LLM tokens" is a freshness term in the Query Contract. Not all observers get streaming — it's a granted capability. The AI safety implication: you can grant a Surface access to the token stream for rendering, but deny the audit log access until commit (so the audit trail only contains final values).

### Face 3: Render Contract (Surface)

A Render Contract declares how facts should be presented. This is the Surface — but framed as a Contract between the data and the renderer.

```typescript
interface RenderContract {
  mode: "stream" | "card" | "canvas" | "dialog" | "board" | "diagram"

  // What this Surface must render
  required: AttributeKw[]        // Must show these if present
  forbidden: AttributeKw[]       // Must never render these (redaction)

  // Accessibility contract
  a11y: {
    wcag: "2.1-AA" | "2.1-AAA"
    keyboard: boolean
    screenReader: boolean
  }

  // Testing contract (Storybook connection)
  stories?: StoryDefinition[]    // Fixture datoms for testing this Surface
}
```

**Storybook as Contract verification.** A Storybook story is a test case for a Render Contract. `Story = Surface(QueryContract(fixture-datoms))` verifies that the Surface satisfies its Render Contract — required fields shown, forbidden fields hidden, a11y requirements met.

**The a11y Contract is explicit.** Not an afterthought — it's a term in every Render Contract. axe scanning (via devac's browser-core) validates the a11y term. Violations are Contract violations, tracked in the same datom log as any other violation.

**Redaction.** A Render Contract can forbid rendering certain attributes — even if the Query Contract allows reading them. "The AI observer can read `:client/ssn` for analysis but must never render it in a Surface." This is a new capability that falls naturally out of separating Query Contracts from Render Contracts.

### Face 4: Trust Contract (Seal)

A Trust Contract declares the cryptographic boundaries. This is the Seal — but framed as a Contract between participants about who can decrypt what.

```typescript
interface TrustContract {
  // Key derivation rules
  masterKey: "passphrase → PBKDF2 → HKDF"
  derivation: {
    pattern: "per-entity" | "per-attribute-namespace" | "per-session"
    algorithm: "HKDF-SHA256"
  }

  // Role definitions (who holds which keys)
  roles: {
    owner: { derives: "all" }
    scopedUser: { derives: "own-entity-only" }
    ai: { derives: "consented-entities-only", constraint: "read-only + draft-write" }
    system: { derives: "none", sees: "E + A + Tx (metadata only)" }
  }

  // Consent protocol
  consent: {
    grant: "datom assertion with why-chain"
    revoke: "datom retraction → key rotation effect"
    audit: "all consent decisions queryable via QueryContract"
  }
}
```

**Consent as Contract.** "Client Maria consents to AI analysis of her session data" is a Trust Contract term. It specifies: what entities, what attributes, what operations, why, and how to revoke. The consent datom IS the Contract assertion.

### Face 5: Sync Contract (P2P)

A Sync Contract declares how facts replicate between peers. This is P2P — but framed as a Contract between peers about what they accept and how they resolve conflicts.

```typescript
interface SyncContract {
  // What this peer accepts
  validation: BehaviorContract[]    // Contracts applied to incoming datoms

  // Conflict resolution strategy (per attribute type)
  resolution: {
    text: "crdt-yjs"               // Text attributes merge via CRDT
    scalar: "last-writer-wins"     // Numbers, keywords, booleans
    ref: "manual-merge"            // References surfaced to human
  }

  // Replication scope
  scope: {
    push: DatomQuery               // What this peer shares
    pull: DatomQuery               // What this peer wants
  }

  // Claim protocol (who does expensive work)
  claim: {
    pattern: ":effect/claimed-by"
    timeout: "30s"                 // Unclaimed after timeout
  }
}
```

**Conflict resolution specified.** The challenge identified that P2P sync's conflict strategy was underspecified. As a Sync Contract, it's explicit: text uses CRDTs, scalars use last-writer-wins, references require human merge. Each attribute type's resolution strategy is a Contract term.

**The claim pattern formalized.** The consumer-groups gap from the NATS analysis becomes a Sync Contract term. Before running expensive AI analysis, a device asserts a claim datom. Other devices see the claim via their Query Contract (live delivery) and skip. Timeout handles crashed claimants.

### Face 6: Behavior Contract (effectHandler)

A Behavior Contract declares how state transitions work. This is the effectHandler — but framed as a Contract that the handler implementation must satisfy.

```typescript
interface BehaviorContract {
  // What effects this handler accepts
  accepts: EffectType[]

  // What it must produce
  produces: {
    required: AttributeKw[]     // Must commit these datoms
    forbidden: AttributeKw[]    // Must never commit these
  }

  // Valid state transitions (XState machine definition)
  stateMachine?: {
    states: StateDefinition[]
    transitions: TransitionDefinition[]
    // The machine IS the Contract — design in Stately Studio
  }

  // Aggregation rules (subsumes devac Rules)
  aggregates?: {
    from: DatomQuery           // Low-level pattern
    to: EffectType             // Higher-level derived effect
  }

  // Actor runtime requirements
  runtime?: {
    lifecycle: "stateless" | "persistent"
    interruptible: boolean
    timeout?: Duration
  }
}
```

**The handler is an implementation of a Behavior Contract.** Write the Contract first (in Stately Studio for complex handlers, as a schema for simple ones). Then write the handler that satisfies it. The Contract is the spec, the test, and the runtime guard — all one thing.

**Contract-driven development, literally.** The development flow `Contract → Handler → Verify → Gate → Live` is not a methodology choice — it's the only way to register a handler. No Behavior Contract = no handler registration. The dispatcher rejects uncontracted handlers.

---

## The Development Flow — Contract All The Way Down

```
1. Schema Contract   → Define what facts can exist
2. Behavior Contract → Define what transitions are valid (XState machine)
3. Query Contract    → Define who sees what
4. Trust Contract    → Define who decrypts what
5. Render Contract   → Define how it looks (including a11y)
6. Sync Contract     → Define how it replicates

Then: implement handlers that satisfy Behavior Contracts.
Then: implement Surfaces that satisfy Render Contracts.
Then: Storybook stories verify Render Contracts.
Then: XState Studio visualizes Behavior Contracts.
Then: likeC4 visualizes Behavior Contract hierarchies as C4 diagrams.
```

**Everything is designed as a Contract before it's implemented.** This is the most opinionated version — it says the Contract is not just important, it's the organizing principle for the entire platform.

---

## The Visual Triangle — Contracts Made Visible

| Tool | Contract Type | What it visualizes |
|------|--------------|-------------------|
| **Stately Studio / XState** | Behavior Contract (state machine) | Handler transitions, valid states |
| **Storybook** | Render Contract (stories) | Surface output for given data |
| **likeC4** | Behavior Contract hierarchy (aggregation) | C4 architecture at zoom levels |
| **axe / browser scan** | Render Contract (a11y terms) | Accessibility compliance |

All four tools are **Contract verifiers**. They make Contracts visible and testable. This is the visual triangle from the challenge document — but now it's not "Surfaces over datoms" but "Contracts made visible."

---

## What Changed

| Aspect | v1.2 (7 peers) | v4 Contract-first |
|--------|-----------------|-------------------|
| Concept count | 7 equal concepts | 1 meta-concept, 6 faces |
| Contract | One of seven | The organizing principle |
| Schema | Datom property | Schema Contract |
| Authorization | Lens + Seal hint | Query Contract (explicit capability) |
| Streaming | Surface concern | Query Contract term (freshness) |
| Conflict resolution | P2P underspecified | Sync Contract (per-type strategy) |
| a11y | Not in concepts | Render Contract term |
| Development flow | Methodology | Structural requirement |
| XState connection | effectHandler footnote | Behavior Contract = state machine |

---

## The Trade-off

**Gained:** Every gap from the challenge document has an explicit answer as a Contract term. Authorization, streaming, conflict resolution, a11y, observability, composition — all specified. The visual tools (XState, Storybook, likeC4) are Contract verifiers, not separate concerns. Development is genuinely contract-first — you can't register a handler without a Behavior Contract.

**Lost:** The beautiful simplicity of "7 concepts that fit on one page." When everything is a Contract, the word loses specificity. "Contract" stops meaning "validation rule" and starts meaning "any declarative specification" — which is so broad it might mean nothing. The other concepts (Datom, Lens, Surface, Seal, P2P, effectHandler) have distinct identities that are useful for communication. "The Datom model" is more evocative than "the Schema Contract face of the meta-Contract."

**The risk:** Over-abstraction. When everything is X, nothing is X. The power of the original 7-concept model is that each concept has a clear, graspable identity. A counselor can understand "Surface renders your data." Can they understand "the Render Contract face of the meta-Contract renders your data"?

**The crazy beautiful part:** Redaction. A Render Contract can say "never render `:client/ssn`" even though the Query Contract allows reading it. This separation of "what you can compute on" from "what you can display" is genuinely new and powerful for privacy. The AI can analyze the SSN for fraud detection but the Surface physically cannot render it. This falls naturally out of having separate Query and Render Contracts.

**The question:** Is "everything is a Contract" a genuine insight about the system's structure, or is it a semantic game that replaces one word with another? The test: does this framing make new things possible (like redaction) or just rename existing things?

---

*Version: exploration-v4-contract-first — 1 meta-concept (Contract) with 6 faces: Schema, Query, Render, Trust, Sync, Behavior. Contract is THE organizing principle. All visual tools are Contract verifiers. Redaction as new capability from Query/Render Contract separation.*
