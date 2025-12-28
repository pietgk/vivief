---
"@pietgk/devac-core": minor
---

Add API decorator extraction and M2M call detection for v0.5.0

**API Decorator Extraction:**
- Extract `@Route`, `@Get`, `@Post`, `@Put`, `@Delete` decorators from tsoa, NestJS, and Express
- Create `RequestEffect` records with route patterns, HTTP methods, and framework detection
- Combine class-level route prefixes with method-level routes

**M2M URL Pattern Detection:**
- Detect HTTP client calls: `m2mClient`, `axios`, `fetch`, `got`, `superagent`
- Extract URL patterns from string literals and template literals
- Create `SendEffect` records with M2M service name detection
- Added "m2m" to `send_type` enum for machine-to-machine calls

**Cross-Repo M2M Tracking:**
- New `findM2MConnections()` method on `CentralHub` for querying M2M calls across registered repos
- Match Send effects to Request effects by service name and route pattern
- New `M2MConnection` and `M2MQueryResult` types exported from hub module

This improves DevAC effectiveness score from 60-65% to an estimated 75-80%.
