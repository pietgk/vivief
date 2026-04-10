---
topic: cross-domain-sharing
status: canonical
depends-on: [vivief-identity, concepts-datom, concepts-contract]
human-version: ../intent/cross-domain/sharing-patterns.md
last-verified: 2026-03-30
---

## Cross-Domain Sharing Patterns

Vivief domains share platform concept machinery but maintain independent data and
domain-specific logic. This document covers the sharing boundaries.

### What Is Shared vs Domain-Specific

| Layer | Shared? | Details |
|-------|---------|---------|
| Datom format `[E,A,V,Tx,Op]` | Universal | Every domain uses the same tuple structure |
| Projection mechanics | Universal | Query + scope + encryption + delivery |
| Surface rendering | Universal | Six modes work for any domain's Projections |
| Contract enforcement | Universal | Trust thresholds, escalation, validation |
| effectHandlers | **NOT shared** | Each domain has its own handlers |
| Attribute namespaces | **NOT shared** | `devac:kind`, `counseling:theme`, `procurement:source` |

The key insight: concepts are universal, but their instantiation is domain-specific.
A Datom is always `[E,A,V,Tx,Op]`, but the attributes and values are namespaced
per domain.

### Bridge Pattern

Bridges convert between external systems and datoms. Each bridge is an
effectHandler that translates:

```
External World           Bridge Handler           Datom World
─────────────           ──────────────           ───────────
Files on disk     →     file-bridge        →     file datoms
CMS content       →     cms-bridge         →     content datoms
External APIs     →     api-bridge         →     API response datoms
Git commits       →     git-bridge         →     commit/diff datoms
```

Bridges are domain-specific effectHandlers — a DevAC file-bridge understands
source code, while a procurement API-bridge understands data catalogs. They share
the bridge pattern but not the implementation.

### Attribute Namespaces

Each domain prefixes its attributes to prevent collisions:

```
devac:kind          → "function", "class", "variable"
devac:calls         → target entity reference
counseling:theme    → "career-transition", "burnout"
counseling:goal     → goal entity reference
procurement:source  → "api://data-provider.com/v2"
procurement:quality → 0.87
```

Shared platform attributes use no prefix:

```
name                → human-readable name
created-at          → timestamp
created-by          → identity
trust-score         → 0.0 to 1.0
```

### Cross-Domain Queries

When a query spans domains, it operates on the shared structure:

```typescript
// "Show me everything created by this identity across all domains"
store.findByAttribute("created-by", identityId);
// Returns devac datoms, counseling datoms, procurement datoms — all mixed

// "Show me high-trust datoms only"
store.findByAttribute("trust-score", score => score > 0.8);
```

Domain-specific Projections then filter and shape these results for their context.

### Content Translation

`intent/cross-domain/content-translation.md` explores how content moves between
domains. Example: a counselor's development goal creates DevAC tracking items;
procurement data quality issues feed into DevAC diagnostics.

Translation is always explicit — an effectHandler converts datoms from one
namespace to another, never implicit sharing. This preserves domain boundaries
while enabling intentional cross-pollination.

### The Procurement Test Case

Procurement is explicitly planned as the test case for cross-domain sharing:

- Does the bridge pattern work for external data sources at scale?
- Can procurement Contracts enforce data quality using the same machinery
  that counseling uses for privacy?
- Do attribute namespaces stay clean when three domains coexist?
- Where is the boundary between "platform concept" and "domain extension"?

These questions drive procurement's design — it exists partly to stress-test
the sharing model.

### Key Design Question

The central unresolved question: **what is the boundary between "platform concept"
and "domain-specific extension"?** Current answer: if it changes the five concepts
or adds a sixth, it belongs in the platform. If it instantiates concepts for a
user population, it is a domain. Composition patterns (bridge, artifact, slice,
profile, skill) help express domain needs without extending platform concepts.
