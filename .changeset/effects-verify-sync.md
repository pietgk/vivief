---
"@pietgk/devac-cli": minor
---

Add `devac effects verify` and `devac effects sync` commands for developer-maintained effect documentation.

**New Commands:**

- `devac effects verify` - Compares documented patterns in `docs/package-effects.md` against actual extracted effects. Reports unmapped patterns (in code but not documented) and stale patterns (documented but not in code).

- `devac effects sync` - Generates `.devac/effect-mappings.ts` from `docs/package-effects.md` for custom effect classification during analysis.

**Workflow:**
1. Run `devac effects init` to create initial `docs/package-effects.md`
2. Review and refine the documented patterns
3. Run `devac effects verify` to check for gaps
4. Run `devac effects sync` to generate TypeScript mappings
