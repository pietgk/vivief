---
"@pietgk/devac-cli": minor
---

Add `devac sync` command to streamline analyze + register workflow

- New `devac sync` command combines package analysis and hub registration
- Supports `--analyze-only`, `--register-only`, `--force`, and `--dry-run` flags
- Uses `--if-changed` optimization by default for faster incremental syncs
- **Breaking**: `devac hub register` no longer auto-analyzes packages (use `devac sync` instead)
- Status command now recommends `devac sync` in "Next Steps"
