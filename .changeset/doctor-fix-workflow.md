---
"@pietgk/devac-cli": patch
---

Fix doctor --fix to use workflow install-local command

- Changed version-check.ts to delegate fix commands to `devac workflow install-local`
- Updated formatters.ts to always show error details when fixes fail (not just with --verbose)

This eliminates duplicate CLI linking logic and provides better error visibility.
