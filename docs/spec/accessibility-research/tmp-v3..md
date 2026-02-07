# DevAC Reference Storybooks - Implementation Plan

## Goal

Create reference storybooks for DevAC that:
1. Detect close to 90% of all WCAG accessibility issues
2. Supply verified knowledge to LLMs on how to solve accessibility issues with examples

---

## System Architecture Diagrams

### Current DevAC Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CURRENT DEVAC FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

  YOUR SOURCE CODE                    ANALYSIS                      OUTPUT
  ───────────────                    ─────────                     ───────

  ┌──────────────┐                 ┌─────────────┐              ┌──────────────┐
  │  .ts/.tsx    │                 │  TypeScript │              │    Seeds     │
  │  files       │────────────────▶│   Parser    │─────────────▶│  (Parquet)   │
  │              │                 │             │              │              │
  └──────────────┘                 └─────────────┘              └──────┬───────┘
                                         │                            │
                                         │ extracts:                  │
                                         │ • nodes (functions,        │
                                         │   classes, jsx_component,  │
                                         │   story, html_element)     │
                                         │ • edges (calls, imports)   │
                                         │ • potentialA11yIssue       │
                                         │ • ariaProps                │
                                         ▼                            │
  ┌──────────────┐                 ┌─────────────┐                    │
  │  .stories.   │                 │   Story     │                    │
  │  tsx files   │────────────────▶│  Extractor  │────────────────────┤
  │              │                 │             │                    │
  └──────────────┘                 └─────────────┘                    │
                                         │                            │
                                         │ extracts:                  │
                                         │ • storyId                  │
                                         │ • hasPlayFunction          │
                                         │ • a11yRulesDisabled        │
                                         │ • tags                     │
                                         ▼                            ▼
                                                              ┌──────────────┐
                    ┌──────────────────────────────────────────│     Hub      │
                    │                                          │   (DuckDB)   │
                    │                                          └──────┬───────┘
                    │                                                 │
                    ▼                                                 │
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         VALIDATION PIPELINE                              │
  │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐     │
  │  │    tsc     │   │   eslint   │   │    test    │   │    wcag    │     │
  │  │ validator  │   │ validator  │   │ validator  │   │ validator  │     │
  │  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘     │
  │        │                │                │                │            │
  │        └────────────────┴────────────────┴────────────────┘            │
  │                                   │                                    │
  │                                   ▼                                    │
  │                        ┌──────────────────┐                            │
  │                        │    Unified       │                            │
  │                        │  Diagnostics     │                            │
  │                        │  (source: tsc,   │                            │
  │                        │   eslint, test,  │                            │
  │                        │   wcag)          │                            │
  │                        └──────────────────┘                            │
  └─────────────────────────────────────────────────────────────────────────┘
```

### Proposed: Adding Runtime A11y Scanning

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROPOSED: RUNTIME A11Y INTEGRATION                       │
└─────────────────────────────────────────────────────────────────────────────┘

                              STATIC ANALYSIS                RUNTIME ANALYSIS
                              ───────────────               ─────────────────

  ┌──────────────┐           ┌─────────────┐              ┌─────────────────┐
  │  .stories.   │           │   Story     │              │  Storybook      │
  │  tsx files   │──────────▶│  Extractor  │              │  Dev Server     │
  │              │           │             │              │  (localhost)    │
  └──────────────┘           └──────┬──────┘              └────────┬────────┘
                                    │                              │
                                    │                              │
                                    ▼                              ▼
                             ┌─────────────┐              ┌─────────────────┐
                             │   Seeds     │              │  scan-storybook │
                             │  (nodes +   │              │  (Playwright +  │
                             │  properties)│              │   axe-core)     │
                             └──────┬──────┘              └────────┬────────┘
                                    │                              │
                                    │                              │
                                    ▼                              ▼
                      ┌──────────────────────────────────────────────────────┐
                      │              UNIFIED DIAGNOSTICS                     │
                      │  ┌────────────────┐      ┌────────────────┐          │
                      │  │ source: "wcag" │      │ source: "axe"  │          │
                      │  │ (static)       │      │ (runtime)      │          │
                      │  └────────────────┘      └────────────────┘          │
                      └──────────────────────────────────────────────────────┘
                                              │
                                              ▼
                               ┌──────────────────────────┐
                               │     MCP Query Tools      │
                               │  • query_sql             │
                               │  • status_all_diagnostics│
                               │  • query_symbol          │
                               └──────────────────────────┘
```

### Reference Storybook Validation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  REFERENCE STORYBOOK VALIDATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

  GENERATION PHASE                    ANALYSIS PHASE                VALIDATION
  ────────────────                   ──────────────                ──────────

  ┌──────────────┐
  │  axe-core    │
  │  test        │
  │  fixtures    │
  └──────┬───────┘
         │
         │ extract HTML
         ▼
  ┌──────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Generate   │     │  Reference  │     │   Seeds     │     │  Expected   │
  │   Stories    │────▶│  Stories    │────▶│  with a11y  │────▶│  Violations │
  │   Script     │     │  (.tsx)     │     │  Reference  │     │  (from      │
  └──────────────┘     └─────────────┘     │  metadata   │     │  properties)│
                                           └──────┬──────┘     └──────┬──────┘
                                                  │                   │
                                                  │                   │
                       ┌─────────────┐            │                   │
                       │  Storybook  │            │                   │
                       │  Dev Server │            │                   │
                       └──────┬──────┘            │                   │
                              │                   │                   │
                              ▼                   │                   │
                       ┌─────────────┐            │                   │
                       │    scan-    │            │                   │
                       │  storybook  │            │                   │
                       └──────┬──────┘            │                   │
                              │                   │                   │
                              ▼                   │                   │
                       ┌─────────────┐            │                   │
                       │   Unified   │            │                   │
                       │ Diagnostics │            │                   │
                       │(source:axe) │            │                   │
                       └──────┬──────┘            │                   │
                              │                   │                   │
                              │                   │                   │
                              ▼                   ▼                   ▼
                       ┌─────────────────────────────────────────────────┐
                       │              SQL VALIDATION QUERY               │
                       │                                                 │
                       │   JOIN seeds.stories ON unified_diagnostics    │
                       │   WHERE a11yReference.expectedRules            │
                       │   COMPARE expected vs detected                 │
                       │                                                 │
                       │   OUTPUT: Coverage Report                       │
                       │   • Rules tested: 72                            │
                       │   • Detected correctly: 71                      │
                       │   • False negatives: 1                          │
                       │   • Coverage: 98.6%                             │
                       └─────────────────────────────────────────────────┘
```

---

## Architectural Decision 1: A11y Validation Command

### The Question

How should a11y validation be triggered? Three options:

```
Option A:  devac a11y validate --storybook <url>     (Separate command)
Option B:  devac sync --validate                     (Integrated, always runs)
Option C:  devac sync --validate [--a11y|--no-a11y]  (Integrated, opt-in/out)
```

### Option A: Separate `devac a11y validate` Command

```
┌────────────────────────────────────────────────────────────────┐
│  devac sync --validate          devac a11y validate           │
│  ─────────────────────          ───────────────────           │
│  • tsc                          • scan-storybook              │
│  • eslint                       • compare to expectations     │
│  • test                         • coverage report             │
│  • wcag (static)                                              │
└────────────────────────────────────────────────────────────────┘
```

| Pros | Cons |
|------|------|
| ✓ Clear separation of concerns | ✗ Another command to learn |
| ✓ A11y-specific flags (--storybook url, --headed, --workers) | ✗ Users might forget to run it |
| ✓ Can run independently | ✗ Inconsistent with sync --validate pattern |
| ✓ Doesn't slow down regular validation | ✗ More code to maintain |
| ✓ Different execution context (needs browser vs pure Node) | ✗ Duplicates some infrastructure |
| ✓ Explicit intent: "I want a11y validation now" | |

### Option B: Integrated into `devac sync --validate` (Always Runs)

```
┌────────────────────────────────────────────────────────────────┐
│  devac sync --validate                                         │
│  ─────────────────────                                         │
│  • tsc                                                         │
│  • eslint                                                      │
│  • test                                                        │
│  • wcag (static)                                               │
│  • axe (runtime) ← NEW: requires running Storybook            │
└────────────────────────────────────────────────────────────────┘
```

| Pros | Cons |
|------|------|
| ✓ Single command for all validation | ✗ Requires Storybook running (not always available) |
| ✓ Consistent with existing patterns | ✗ Much slower (needs browser) |
| ✓ Can't forget to run it | ✗ Fails if no Storybook (breaks existing workflow) |
| ✓ All diagnostics in one run | ✗ Mixes static analysis with runtime scanning |
| | ✗ Can't validate without browser |

### Option C: Integrated with Opt-in Flag

```
┌────────────────────────────────────────────────────────────────┐
│  devac sync --validate                (default: no a11y)      │
│  devac sync --validate --a11y         (includes a11y scan)    │
│  devac sync --validate --no-a11y      (explicit skip)         │
└────────────────────────────────────────────────────────────────┘
```

| Pros | Cons |
|------|------|
| ✓ Consistent command structure | ✗ Yet another flag to remember |
| ✓ Opt-in so doesn't break workflow | ✗ Still mixes static/runtime conceptually |
| ✓ Can default off locally, on in CI | ✗ Needs Storybook URL somehow (env var? flag?) |
| ✓ Progressive enhancement | ✗ Complex flag combinations |

### Recommendation: Option A (Separate Command)

**Rationale:**
1. **Different execution contexts**: Static validation runs in Node, a11y validation needs browser + running Storybook
2. **Different failure modes**: Missing Storybook shouldn't fail normal validation
3. **Explicit is better**: Users know they're running a11y validation
4. **Simpler mental model**: `sync` = analysis, `a11y validate` = a11y testing
5. **Aligns with `browser scan-storybook`**: Already have browser commands separate

**However**, we should also consider:
- The command could be `browser scan-storybook --validate-coverage` (extend existing)
- Or keep it simple: just use SQL queries after scan-storybook runs

---

## Architectural Decision 2: Story Generation Approach

### The Question

How should reference stories be generated from axe-core fixtures?

```
Option A:  pnpm run generate-stories              (Package script)
Option B:  devac sync (auto-detects axe-core)     (Part of sync)
Option C:  devac a11y generate                    (DevAC command)
```

### Conceptual Difference: Code Analysis vs Code Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CODE ANALYSIS (what devac sync does)                     │
│                                                                             │
│    YOUR CODE                    devac sync                    DERIVED DATA  │
│    ─────────                   ──────────                    ────────────  │
│    ┌─────────┐                 ┌─────────┐                   ┌─────────┐   │
│    │ .ts     │ ───────────────▶│ analyze │──────────────────▶│ seeds   │   │
│    │ .tsx    │                 │         │                   │(parquet)│   │
│    └─────────┘                 └─────────┘                   └─────────┘   │
│                                                                             │
│    • Input: Your source files                                               │
│    • Output: Derived analysis data (not committed)                          │
│    • Idempotent: Same code → same seeds                                     │
│    • Direction: Source → Derived                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│               CODE GENERATION (what story generation does)                  │
│                                                                             │
│    EXTERNAL DATA              generate                       YOUR CODE      │
│    ─────────────             ────────                       ─────────      │
│    ┌─────────┐               ┌─────────┐                   ┌─────────┐     │
│    │axe-core │ ─────────────▶│ generate│──────────────────▶│.stories │     │
│    │fixtures │               │         │                   │  .tsx   │     │
│    └─────────┘               └─────────┘                   └─────────┘     │
│                                                                             │
│    • Input: External dependency (axe-core)                                  │
│    • Output: Source files (committed to git)                                │
│    • One-time or version-bump: Run when axe-core updates                   │
│    • Direction: External → Source                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Option A: Package Script (Separate from DevAC)

```bash
cd packages/storybook-axe-core
pnpm run generate-stories
```

| Pros | Cons |
|------|------|
| ✓ Clear separation: generation ≠ analysis | ✗ Outside DevAC ecosystem |
| ✓ Stories are source code (committed to git) | ✗ Manual step to remember |
| ✓ Run once, version controlled result | ✗ Stories can drift from axe-core version |
| ✓ Doesn't slow down normal sync | ✗ Different tooling pattern |
| ✓ Conceptually correct: generating source files | |
| ✓ Simple: just a script | |

### Option B: Part of `devac sync`

```
devac sync detects axe-core → generates stories → analyzes them → seeds
```

| Pros | Cons |
|------|------|
| ✓ Automatic - stories always up to date | ✗ **Conceptually wrong**: sync generates source files? |
| ✓ Single command | ✗ Much slower sync |
| ✓ Consistent "devac does everything" | ✗ Writes to source directory (side effect) |
| | ✗ axe-core fixtures aren't "your code" |
| | ✗ What about git status? Unexpected changes |
| | ✗ Conflates analysis with generation |

### Option C: Separate DevAC Command `devac a11y generate`

```bash
devac a11y generate --from axe-core --output packages/storybook-axe-core/src/stories
```

| Pros | Cons |
|------|------|
| ✓ Part of DevAC tooling | ✗ Growing command surface |
| ✓ Clear purpose | ✗ Still mixes analysis tool with code gen |
| ✓ Consistent with having a11y namespace | ✗ When would you run this? |
| ✓ Could support multiple generators | ✗ Adds maintenance burden |

### Option D: Hybrid - Package Script with DevAC Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          HYBRID APPROACH                                    │
│                                                                             │
│  1. Generate stories (package script - one time)                            │
│     cd packages/storybook-axe-core && pnpm run generate                     │
│                                                                             │
│  2. Commit generated stories to git                                         │
│     git add src/stories && git commit -m "Update axe-core reference"        │
│                                                                             │
│  3. DevAC sync analyzes stories like any other code                         │
│     devac sync                                                              │
│                                                                             │
│  4. DevAC validates coverage (existing scan-storybook + SQL)                │
│     browser scan-storybook --url http://localhost:6006                      │
│     devac query sql "SELECT ... coverage query ..."                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Pros | Cons |
|------|------|
| ✓ Correct separation of concerns | ✗ Multiple steps for full workflow |
| ✓ Stories are version-controlled source | ✗ Manual regeneration on axe-core bump |
| ✓ DevAC focuses on analysis (its strength) | |
| ✓ No new DevAC commands needed | |
| ✓ Uses existing browser scan-storybook | |
| ✓ SQL queries for validation (flexible) | |

### Recommendation: Option D (Hybrid)

**Rationale:**
1. **Conceptual clarity**: Code generation ≠ code analysis
2. **DevAC's core value**: Analysis, not generation
3. **Version control**: Stories should be committed (reproducible)
4. **Simplicity**: Use existing tools, add SQL queries
5. **Flexibility**: Can regenerate when axe-core updates

**Challenge to Option B (sync with generation):**
- If sync generates stories, what happens on `git status`? Unexpected changes
- If stories are gitignored, how do you version them?
- What if axe-core version differs between machines?
- Sync should be read-only on source files

---

## Complete System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE REFERENCE STORYBOOK SYSTEM                      │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────────────────┐
  │ PHASE 1: GENERATION (One-time / on axe-core update)                       │
  │                                                                           │
  │   axe-core/test/fixtures ──▶ generate-stories.ts ──▶ .stories.tsx files  │
  │                                                            │              │
  │                                                            ▼              │
  │                                                      git commit           │
  └───────────────────────────────────────────────────────────────────────────┘
                                                               │
                                                               ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ PHASE 2: ANALYSIS (On every devac sync)                                   │
  │                                                                           │
  │   .stories.tsx ──▶ story-extractor ──▶ seeds (with a11yReference props)  │
  │                          │                                                │
  │                          │ extracts:                                      │
  │                          │ • storyId                                      │
  │                          │ • a11yReference.shouldViolate                  │
  │                          │ • a11yReference.expectedRules                  │
  │                          │ • a11yReference.fixExample                     │
  │                          ▼                                                │
  │                      Hub (seeds table)                                    │
  └───────────────────────────────────────────────────────────────────────────┘
                                                               │
                                                               ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ PHASE 3: RUNTIME SCANNING (On demand)                                     │
  │                                                                           │
  │   Storybook server ──▶ browser scan-storybook ──▶ unified_diagnostics    │
  │   (localhost:6006)          │                        (source: axe)        │
  │                             │                                             │
  │                             │ scans each story:                           │
  │                             │ • navigates to iframe                       │
  │                             │ • runs axe-core                             │
  │                             │ • extracts violations                       │
  │                             ▼                                             │
  │                         Hub (diagnostics table)                           │
  └───────────────────────────────────────────────────────────────────────────┘
                                                               │
                                                               ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ PHASE 4: VALIDATION (After scanning)                                      │
  │                                                                           │
  │   SELECT                                                                  │
  │     s.name,                                                               │
  │     s.properties->>'a11yReference.expectedRules' as expected,             │
  │     d.code as detected                                                    │
  │   FROM nodes s                                                            │
  │   LEFT JOIN unified_diagnostics d ON ...                                  │
  │   WHERE s.kind = 'story'                                                  │
  │     AND s.properties->>'a11yReference.isReferenceStory' = 'true'          │
  │                                                                           │
  │   ┌─────────────────────────────────────────────────────────────────┐     │
  │   │ Coverage Report                                                 │     │
  │   │ ═══════════════                                                 │     │
  │   │ Rules tested: 72                                                │     │
  │   │ Correctly detected: 71                                          │     │
  │   │ False negatives: 1 (landmark-no-duplicate-main - page-level)   │     │
  │   │ Coverage: 98.6%                                                 │     │
  │   └─────────────────────────────────────────────────────────────────┘     │
  └───────────────────────────────────────────────────────────────────────────┘
                                                               │
                                                               ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ PHASE 5: LLM KNOWLEDGE (Available anytime via MCP)                        │
  │                                                                           │
  │   MCP query_sql ──▶ fix examples from story properties                   │
  │                                                                           │
  │   {                                                                       │
  │     "rule": "image-alt",                                                  │
  │     "wcag": "1.1.1",                                                      │
  │     "fix": {                                                              │
  │       "before": "<img src='x.png' />",                                    │
  │       "after": "<img src='x.png' alt='Description' />"                    │
  │     }                                                                     │
  │   }                                                                       │
  └───────────────────────────────────────────────────────────────────────────┘
```

---

## Key Insight: Leverage Existing DevAC Infrastructure

DevAC already has substantial accessibility infrastructure:

| Component | Location | What It Does |
|-----------|----------|--------------|
| **TypeScript Parser** | `devac-core/src/parsers/` | Extracts `potentialA11yIssue`, `ariaProps`, `isInteractive` |
| **WcagValidator** | `devac-core/src/validation/` | 5 WCAG rules for static analysis |
| **Story Extractor** | `devac-core/src/parsers/story-extractor.ts` | Parses CSF3, captures `a11yRulesDisabled`, `tags`, extensible properties |
| **Unified Diagnostics** | Hub table | Stores both `source: "wcag"` (static) and `source: "axe"` (runtime) |
| **scan-storybook** | `browser-cli/src/commands/` | Parallel scanning, axe-core integration, hub push |
| **AxeScanner** | `browser-core/src/reader/accessibility/` | Runtime scanning with WCAG mapping |

### Why This Simplifies Everything

1. **No new effect types** - ADR-0045 explicitly uses unified_diagnostics
2. **Story node properties are extensible** - Store `a11yReference` metadata in existing JSON field
3. **SQL queries validate coverage** - Cross-reference stories against detections via existing MCP
4. **Existing commands work** - `browser scan-storybook` + `devac query sql`

---

## Implementation Plan

### Phase 1: Extend Static Detection (2 weeks)

Add WCAG rules to WcagValidator using existing parser output:

| New Rule | WCAG | Checks |
|----------|------|--------|
| wcag-form-label | 1.3.1 | `htmlFor`/`id` pairing |
| wcag-heading-order | 1.3.1 | h1 → h2 → h3 sequence |
| wcag-semantic-elements | 1.3.1 | div with role vs semantic |
| wcag-aria-hidden-focus | 4.1.2 | focusable inside aria-hidden |
| wcag-list-structure | 1.3.1 | ul/ol contains only li |
| wcag-image-alt | 1.1.1 | img has alt attribute |
| wcag-link-name | 2.4.4 | a has accessible name |
| wcag-table-headers | 1.3.1 | th has scope |

**Files to modify:**
- `devac-core/src/validation/wcag-rules.ts`
- `devac-core/src/validation/wcag-analyzer.ts`

### Phase 2: Reference Storybook Package (3 weeks)

```
packages/storybook-axe-core/
├── package.json
├── .storybook/
├── scripts/
│   └── generate-from-axe-fixtures.ts
└── src/stories/
    └── (generated .stories.tsx files)
```

**Story format with a11yReference metadata:**

```typescript
const meta: Meta = {
  title: "A11y Reference/Images/image-alt",
  tags: ["a11y-reference"],
  parameters: {
    a11yReference: {
      ruleId: "image-alt",
      wcagCriterion: "1.1.1",
      wcagLevel: "A",
      impact: "critical",
    },
  },
};

export const Violation: StoryObj = {
  parameters: {
    a11yReference: {
      shouldViolate: true,
      expectedRules: ["image-alt"],
      fixExample: {
        before: "<img src=\"test.png\" />",
        after: "<img src=\"test.png\" alt=\"Description\" />",
      }
    }
  },
  render: () => <div dangerouslySetInnerHTML={{ __html: `<img src="test.png" />` }} />,
};
```

### Phase 3: Story Extractor Enhancement (1 week)

Extend `story-extractor.ts` to capture `a11yReference`:

```typescript
if (parameters.a11yReference) {
  storyProperties.a11yReference = {
    isReferenceStory: true,
    shouldViolate: parameters.a11yReference.shouldViolate ?? false,
    expectedRules: parameters.a11yReference.expectedRules ?? [],
    fixExample: parameters.a11yReference.fixExample,
  };
}
```

### Phase 4: Validation Queries (1 week)

SQL query to validate coverage:

```sql
WITH reference_stories AS (
  SELECT
    name, qualified_name,
    JSON_EXTRACT(properties, '$.a11yReference.shouldViolate') as should_violate,
    JSON_EXTRACT(properties, '$.a11yReference.expectedRules') as expected_rules
  FROM nodes
  WHERE kind = 'story'
    AND JSON_EXTRACT(properties, '$.a11yReference.isReferenceStory') = true
),
detected AS (
  SELECT file_path, code as rule_id
  FROM unified_diagnostics
  WHERE source = 'axe'
)
SELECT
  r.name,
  r.should_violate,
  r.expected_rules,
  d.rule_id as detected,
  CASE
    WHEN r.should_violate AND d.rule_id IS NOT NULL THEN 'PASS'
    WHEN NOT r.should_violate AND d.rule_id IS NULL THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM reference_stories r
LEFT JOIN detected d ON d.file_path LIKE '%' || r.qualified_name || '%';
```

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1 | 2 weeks | 8+ new WCAG rules in WcagValidator |
| 2 | 3 weeks | storybook-axe-core package with generated stories |
| 3 | 1 week | Story extractor captures a11yReference |
| 4 | 1 week | SQL validation queries, coverage report |

**Total: 7 weeks**

---

## Success Criteria

- [ ] 8+ new WCAG rules detecting static issues
- [ ] 72 axe-core rules with violation + pass stories
- [ ] a11yReference metadata captured in story node properties
- [ ] SQL query validates detection accuracy
- [ ] scan-storybook detects 100% of generated violations
- [ ] Fix examples queryable via MCP for LLM consumption

---

## Why This Approach

| Principle | How We Apply It |
|-----------|-----------------|
| **Simple commands** | Use existing `devac sync`, `browser scan-storybook`, `devac query sql` |
| **Separation of concerns** | Generation is package script, analysis is devac sync |
| **Leverage existing** | Unified diagnostics, story extractor, MCP tools |
| **No new tables** | Store in existing story properties JSON |
| **Consistent patterns** | Follows ADR-0045 decisions |
