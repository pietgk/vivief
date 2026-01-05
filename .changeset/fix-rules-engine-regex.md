---
"@pietgk/devac-core": patch
---

Fix rules engine regex patterns and add missing technology rules

- Remove `\(` from SQL patterns that prevented matching (callee names don't include parentheses)
- Add Kysely ORM rules for database operations (selectFrom, insertInto, updateTable, deleteFrom)
- Add tRPC API rules for procedure definitions (procedure.mutation, procedure.query)
- Remove overly restrictive `isExternal: true` from AWS service rules (DynamoDB, S3, SQS, SNS, etc.)
- Update documentation with correct patterns and new rules

Fixes #105
