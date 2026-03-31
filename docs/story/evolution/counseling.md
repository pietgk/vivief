# Evolution: Counseling Platform Architecture

| Version | Date | Status | Key Change |
|---------|------|--------|------------|
| v1 (v0.6) | 2026-03-14 | Concept definition complete | Three primitives: Datom, Lens, Surface. Ready for prototyping. |
| v2 (v0.7) | 2026-03-15 | **Implementation-ready** | All MUST blockers resolved. Formal TypeScript API, PostgreSQL DDL, handler registration. |

## Key transitions

- **v1→v2**: From concept definition to implementation-ready spec. Added concrete TypeScript interfaces, database DDL, and a formal handler registration system. Resolved all blocking design questions.

## Role in vivief

The counseling platform was the catalyst that turned DevAC from a tool into a platform. When the same concepts (datom, projection, surface) applied naturally to counseling sessions, it proved the abstractions were universal.

The counseling app serves dual purpose: concrete product AND concept validator. If a concept can't elegantly model a counseling workflow, the concept needs refinement.

## Canonical document

`contract/counseling/platform-v2.md`

## Archives

v1 + architecture ideas in `archive/counseling/`.
