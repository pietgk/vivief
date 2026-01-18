---
"@pietgk/devac-cli": patch
"@pietgk/devac-core": patch
---

Fix logger output in hook mode for clean JSON output

- Add `setGlobalLogLevel("silent")` at start of `status --inject` command
- Modify logger `shouldLog()` to respect global log level dynamically
- Ensures hook JSON output is not polluted with PackageManager debug logs
