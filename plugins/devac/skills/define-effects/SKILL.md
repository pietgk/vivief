# Define Effects Skill

Help developers create and maintain `docs/package-effects.md` - the source of truth for effect classification in a package.

## Foundational Principle

From `foundation.md`: **"Everything can be represented as effectHandlers"**

```
runCode() === handleEffects(extractEffects(code))
```

**DO:**
- Document ALL effects discovered by `devac effects init`
- Use Group Type to classify patterns (io:*, compute:*, framework:*, logging:*, workflow:*)
- Let consumers filter by group when generating docs or diagrams

**DON'T:**
- Exclude patterns as "not effects" - everything IS an effect
- Filter during documentation - filter at view/consumption time
- Create "Not Effects" or "Utility Patterns" sections

## Triggers

This skill activates when users ask about:
- "define effects"
- "create effect mappings"
- "document effects"
- "what effects does this package have"
- "map function calls to effects"
- "classify effects"

## Capabilities

### Effect Discovery
Analyze code to find patterns that represent effects:
- **Store**: Database writes, cache sets, file writes
- **Retrieve**: Database reads, cache gets, file reads
- **Send**: External API calls, message publishing, email sending
- **Request**: HTTP endpoints, message handlers

### Effect Classification
Help developers classify discovered patterns into meaningful effect categories with proper metadata.

### Verification
Compare documented effects against actual code to find gaps and stale mappings.

## Workflow

### Step 1: Initialize (First Time)
```bash
# Generate initial package-effects.md from AST analysis
devac effects init -p <package-path>
```

This creates a draft `docs/package-effects.md` with discovered patterns.

### Step 2: Review and Classify
Open `docs/package-effects.md` and:
1. Review each discovered pattern
2. Assign a Group Type to each pattern (io:*, compute:*, framework:*, logging:*, workflow:*)
3. Add meaningful metadata (provider, target, description)
4. Add any missing patterns (nothing should be removed - all code IS effects)

### Step 3: Verify
```bash
# Compare documented vs actual effects
devac effects verify -p <package-path>
```

Reports:
- **Unmapped patterns**: In code but not documented
- **Stale patterns**: Documented but no longer in code
- **Matched patterns**: Properly documented

### Step 4: Sync
```bash
# Generate TypeScript extraction rules
devac effects sync -p <package-path>
```

Generates `.devac/effect-mappings.ts` from the documentation.

## CLI Commands (Primary)

### `devac effects init`
Generate initial `docs/package-effects.md` from code analysis.
```bash
devac effects init -p packages/user-service
devac effects init -p packages/user-service --threshold 3
```

### `devac effects verify`
Check if documented effects match actual code patterns.
```bash
devac effects verify -p packages/user-service
devac effects verify -p packages/user-service --json
```

### `devac effects sync`
Generate `.devac/effect-mappings.ts` from documentation.
```bash
devac effects sync -p packages/user-service
```

### `devac effects list`
List all extracted effects in a package.
```bash
devac effects list -p packages/user-service
devac effects list -p packages/user-service --type Store
```

## File Format: `docs/package-effects.md`

```markdown
# Package Effects: @myorg/user-service

<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
-->

## Metadata
- **Package:** @myorg/user-service
- **Last Updated:** 2025-01-01
- **Verified:** true

## Store Operations
| Pattern | Store Type | Operation | Provider | Target |
|---------|------------|-----------|----------|--------|
| `userRepo.create` | database | insert | mysql | users |
| `userRepo.update` | database | update | mysql | users |
| `sessionCache.set` | cache | write | redis | sessions |

## Retrieve Operations
| Pattern | Retrieve Type | Operation | Provider | Target |
|---------|---------------|-----------|----------|--------|
| `userRepo.findById` | database | get | mysql | users |
| `sessionCache.get` | cache | read | redis | sessions |

## External Calls
| Pattern | Send Type | Service | Third Party |
|---------|-----------|---------|-------------|
| `stripeClient.*` | external | stripe | true |
| `sendgrid.send` | external | sendgrid | true |

## Request Handlers
| Class.Method | HTTP Method | Route | Framework |
|--------------|-------------|-------|-----------|
| `UserController.getUser` | GET | /users/:id | express |
| `UserController.createUser` | POST | /users | express |
```

## Example Interaction

**User:** "Help me define effects for the payment-service package"

**Response approach:**
1. Run `devac effects init -p packages/payment-service` to discover patterns
2. Review the generated `docs/package-effects.md`
3. Identify patterns that need classification (e.g., `stripeClient.charges.create`)
4. Add appropriate metadata (type: external, service: stripe, thirdParty: true)
5. Run `devac effects verify` to check for gaps
6. Run `devac effects sync` to generate extraction rules

**User:** "The verify command shows unmapped patterns"

**Response approach:**
1. Review the unmapped patterns from verify output
2. For each pattern:
   - Assign an appropriate Group Type (io:*, compute:*, framework:*, logging:*, workflow:*)
   - Add to `docs/package-effects.md` with metadata
3. Re-run verify to confirm all patterns are documented
4. Goal: 0 unmapped, 0 stale - complete coverage

## Integration with C4 Diagrams

Properly defined effects enable accurate C4 architecture diagrams:

```bash
# Generate C4 diagrams using effect data
devac c4 -p packages/user-service --level containers
```

Effects are classified and appear in diagrams:
- Store/Retrieve → Database components
- Send (external) → External systems
- Request → API boundaries

## Group Types

Use these standard group types for classification:

| Group | Description | Filter Use |
|-------|-------------|------------|
| `io:filesystem` | File system operations (fs.*, glob) | Architecture docs |
| `io:database` | Database operations (DuckDB, SQL) | Data flow diagrams |
| `io:network` | External calls, HTTP, subprocess | Integration docs |
| `compute:utility` | Pure transformations (path.*, JSON.*, Date.*) | Usually filtered |
| `compute:transform` | Data transformations | Internal only |
| `framework:cli` | CLI framework patterns (Commander.js) | Usually filtered |
| `framework:test` | Test framework patterns (Vitest, Jest) | Usually filtered |
| `logging:diagnostic` | Logging (console.*, logger.*) | Usually filtered |
| `workflow:hub` | Hub federation operations | Workflow docs |

When generating docs or diagrams, filter by group:
- **Architecture docs**: Show only `io:*` groups
- **Complete audit**: Show all groups
- **Workflow docs**: Show `workflow:*` groups

## Notes

- Start with `devac effects init` to get ALL patterns
- Assign Group Types to classify patterns (don't exclude anything)
- Run `devac effects verify` in CI to catch drift - goal is 0 unmapped
- The documentation is the source of truth, not the generated TypeScript
- Filter by Group when consuming, not when documenting
- Works well in conjunction with `/explain-package` skill
