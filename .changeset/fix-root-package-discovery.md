---
"@pietgk/devac-core": patch
---

Fix package discovery to include root package in workspaces

When analyzing repositories with workspace configurations (pnpm/npm/yarn) or fallback patterns (packages/*, apps/*, etc.), the root package was being excluded from discovery. This caused the main application code in repos like React Native apps to never be analyzed.

**Before:** Only workspace packages were discovered, missing root `package.json`
**After:** Root package is always included first if `package.json` exists

This fix ensures:
- Root package is discovered alongside workspace packages
- No duplicates when workspace patterns match root directory
- Backward compatible - repos without root `package.json` work as before
