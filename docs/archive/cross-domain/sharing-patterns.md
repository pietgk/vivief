# Intent: Cross-Domain Sharing Patterns

**Status**: Archived (2026-04-09) — folded into [contract/vision/bridging.md](../../contract/vision/bridging.md) cross-domain section

## Resolution

All open questions resolved via design interview:

1. **Cross-domain datom references**: Qualified entity IDs with domain prefix. A datom in the procurement domain referencing a DevAC entity uses the full qualified ID: `[:procurement/rule:42 :rule/validated-by :devac/fn:handleValidation tx:100 true]`. The entity ID carries its domain origin. Projection resolves cross-domain references when the user has access to both domains.

2. **Projections spanning domains**: Yes, governed by a cross-domain Projection Contract. The Projection Contract declares which domains are in scope. The user must have access to all referenced domains. This enables the "procurement improves code rules" self-referential loop.

3. **Contract composition**: The hypothesis table below is confirmed as the sharing model. Platform-level machinery (datom format, Projection mechanics, Surface rendering, Contract enforcement) is shared. Domain-specific concerns (attribute namespaces, effectHandlers, domain Contracts, bridge implementations) are isolated.

**Next**: Fold into `contract/vision/bridging.md` as a cross-domain section.

---

## Context

Vivief has three domains: DevAC, Counseling, Procurement. Each uses the same 5 concepts but with different attribute namespaces, effectHandlers, and domain-specific Contracts. The question: what's shared and what's domain-specific?

## Hypothesis

| Layer | Shared? | Notes |
|-------|---------|-------|
| Datom format (EAVT) | Yes | Universal — all domains write datoms |
| Projection mechanics | Yes | Query/access/delivery is concept-level |
| Surface rendering | Yes | 6 modes serve all domains |
| Contract enforcement | Yes | Enforcement machinery is universal |
| Attribute namespaces | No | `:session/*` (counseling) vs `:node/*` (devac) |
| effectHandlers | No | Domain-specific logic |
| Domain Contracts | No | Specific validation rules per domain |
| Bridge implementations | No | Each domain bridges different external systems |

## The procurement test

Procurement is explicitly planned to test this boundary. It exercises:
- Data extraction (different from code analysis or counseling)
- Schema discovery (self-improving pipelines)
- Multi-source integration (documents, APIs, web)

If the sharing pattern works cleanly for procurement, it validates the platform model.

## Open questions

- How does a datom from one domain reference an entity in another?
- Can a Projection span domains? Should it?
- How do domain-specific Contracts compose with platform Contracts?

## Related

- `intent/cross-domain/bridging.md` — Bridge pattern across domains
- `intent/cross-domain/content-translation.md` — Content and translation
- `contract/procurement/README.md` — Procurement domain overview
