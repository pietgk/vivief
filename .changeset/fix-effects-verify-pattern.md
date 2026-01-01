---
"@pietgk/devac-cli": patch
---

Fix effects verify parsing for patterns containing "Pattern"

The `devac effects verify` command was incorrectly skipping patterns that contained the word "Pattern" in their name (e.g., `issuePattern.test`). This was because the header row detection used `line.includes("Pattern")` which matched patterns, not just table headers.

Fixed by using a more specific regex `/^\|\s*Pattern\s*\|/` that only matches actual header rows starting with `| Pattern |`.
