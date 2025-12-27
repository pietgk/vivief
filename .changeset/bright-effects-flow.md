---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

Add Effect Store, Rules Engine, and C4 Generator (Priority 6)

- Add `EffectWriter` and `EffectReader` for effect storage in Parquet format
- Add `effects` view to query context and hub query federation
- Add `@package` syntax support for effects queries (e.g., `effects@cli`)
- Add Rules Engine with 25+ builtin patterns for common domains:
  - Database (DynamoDB, SQL, Prisma)
  - Payment (Stripe)
  - Auth (JWT, bcrypt, Cognito)
  - HTTP (fetch, axios)
  - Messaging (SQS, SNS, EventBridge)
  - Storage (S3, filesystem)
  - Observability (console, Datadog)
- Add C4 diagram generator from domain effects with PlantUML export
- Add domain boundary discovery with cohesion scoring
