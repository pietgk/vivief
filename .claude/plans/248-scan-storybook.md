# Plan: feat(browser-cli): Add scan-storybook command

> **Issue:** [#248](https://github.com/mindlercare/vivief/issues/248)
> **Status:** COMPLETE
> **Created:** 2026-02-03

## Summary

Implement `browser scan-storybook` command that scans Storybook stories for accessibility violations using AxeScanner (already exists in browser-core) and pushes results to DevAC hub.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    scan-storybook.ts (Main Command)             │
│  - CLI options parsing                                          │
│  - Orchestrates workflow                                        │
│  - Console output formatting                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ story-discovery │  │ parallel-scanner│  │   hub-writer    │
│                 │  │                 │  │                 │
│ Fetch /index.json│  │ Worker pool    │  │ Batch push to   │
│ Filter stories  │  │ AxeScanner     │  │ DevAC hub       │
│ Parse tags      │  │ Play functions │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ play-function-  │
                    │ runner.ts       │
                    │                 │
                    │ Navigate to     │
                    │ story iframe,   │
                    │ wait for ready  │
                    └─────────────────┘
```

## Files to Create/Modify

### New Files
```
packages/browser-cli/src/commands/
├── scan-storybook.ts              # Main command + registration
└── scan-storybook/
    ├── types.ts                   # Shared types for scan-storybook
    ├── story-discovery.ts         # Fetch /index.json, filter stories
    ├── parallel-scanner.ts        # Worker pool with AxeScanner
    ├── play-function-runner.ts    # Execute play functions via iframe
    └── hub-writer.ts              # Batch write results to hub
```

### Files to Modify
```
packages/browser-cli/src/commands/index.ts  # Add export for registerScanStorybookCommand
packages/browser-cli/src/index.ts           # Register scan-storybook command
```

## Implementation Details

### 1. types.ts - Shared Types

```typescript
export interface ScanStorybookOptions {
  url: string;              // Storybook URL (default: http://localhost:6006)
  workers: number;          // Parallel workers (default: 4)
  timeout: number;          // Timeout per story in ms (default: 30000)
  wcag: "wcag2a" | "wcag2aa" | "wcag21aa";  // WCAG level (default: wcag21aa)
  filter?: string;          // Filter stories by title pattern
  excludeTags?: string[];   // Skip stories with these tags
  headed: boolean;          // Visible browser window
  json: boolean;            // Output JSON
  hub: boolean;             // Push to hub (default: true, --no-hub disables)
  repoId?: string;          // Repository ID (auto-detected)
}

export interface StoryEntry {
  id: string;               // e.g., "button--primary"
  title: string;            // e.g., "Components/Button"
  name: string;             // e.g., "Primary"
  importPath: string;       // e.g., "./src/Button.stories.tsx"
  tags: string[];           // e.g., ["autodocs", "a11y-skip"]
}

export interface StoryScanResult {
  storyId: string;
  storyTitle: string;
  status: "pass" | "fail" | "error" | "skipped";
  violations: A11yViolation[];
  timeMs: number;
  error?: string;
}

export interface ScanSummary {
  totalStories: number;
  scannedStories: number;
  skippedStories: number;
  passedStories: number;
  failedStories: number;
  errorStories: number;
  totalViolations: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  totalTimeMs: number;
}
```

### 2. story-discovery.ts - Fetch and Filter Stories

**Key functions:**
- `fetchStoryIndex(url: string): Promise<StoryEntry[]>` - Fetch `/index.json`
- `filterStories(stories, options): StoryEntry[]` - Apply filter/exclude-tags

**Storybook index.json format (v7+):**
```json
{
  "v": 5,
  "entries": {
    "button--primary": {
      "id": "button--primary",
      "title": "Components/Button",
      "name": "Primary",
      "importPath": "./src/Button.stories.tsx",
      "tags": ["autodocs"]
    }
  }
}
```

### 3. parallel-scanner.ts - Worker Pool

**Pattern:** Use p-limit or similar to limit concurrent page contexts

```typescript
export async function scanStoriesInParallel(
  stories: StoryEntry[],
  options: ScanStorybookOptions,
  onProgress: (completed: number, total: number) => void
): Promise<StoryScanResult[]>
```

**Implementation:**
1. Launch single browser with `BrowserSession.create({ headed })`
2. Create worker pool with `p-limit(options.workers)`
3. Each worker: create page, navigate to story, run play function, scan with AxeScanner
4. Collect all results

### 4. play-function-runner.ts - Execute Play Functions

**Strategy:** Navigate to story's iframe URL and wait for story to render

```typescript
export async function navigateToStory(
  page: Page,
  storybookUrl: string,
  storyId: string,
  timeout: number
): Promise<void>
```

**URL pattern:** `${storybookUrl}/iframe.html?id=${storyId}&viewMode=story`

**Wait strategy:**
1. Wait for `#storybook-root` or `#root` element
2. Wait for network idle (play functions may fetch data)
3. Wait for any loading spinners to disappear

### 5. hub-writer.ts - Batch Push to Hub

**Uses existing:** `pushBatchAxeDiagnosticsToHub` from devac-core

```typescript
export async function pushResultsToHub(
  results: StoryScanResult[],
  repoId: string
): Promise<{ pushed: number }>
```

### 6. scan-storybook.ts - Main Command

**Registration pattern following existing commands:**

```typescript
export const registerScanStorybookCommand: CommandRegister = (program) => {
  program
    .command("scan-storybook")
    .description("Scan Storybook stories for accessibility violations")
    .option("-u, --url <url>", "Storybook URL", "http://localhost:6006")
    .option("-w, --workers <n>", "Parallel workers", "4")
    .option("-t, --timeout <ms>", "Timeout per story", "30000")
    .option("--wcag <level>", "WCAG level (wcag2a, wcag2aa, wcag21aa)", "wcag21aa")
    .option("--filter <pattern>", "Filter stories by title")
    .option("--exclude-tags <tags>", "Skip stories with these tags (comma-separated)")
    .option("--headed", "Visible browser window", false)
    .option("--json", "Output as JSON", false)
    .option("--no-hub", "Skip hub push")
    .option("--repo-id <id>", "Repository ID (auto-detected from git)")
    .action(async (options) => {
      // Implementation
    });
};
```

**Console output format:**
```
Accessibility Scan Complete
============================
Stories: 292/295 scanned (3 skipped)
Pass Rate: 87.3%

Violations: 47
  Critical: 2
  Serious:  12
  Moderate: 28
  Minor:    5

Time: 45.2s

Top Issues:
  - color-contrast: 18
  - button-name: 8
  - image-alt: 6
```

## WCAG Level Mapping

| CLI Option | AxeScanner wcagLevel |
|------------|---------------------|
| wcag2a     | "A"                 |
| wcag2aa    | "AA"                |
| wcag21aa   | "AA" (with 2.1 rules) |

Note: axe-core uses tags like "wcag2a", "wcag21aa" for filtering. The AxeScanner already handles this via `wcagLevel` option.

## Error Handling

1. **Storybook not running:** Clear error message with URL tried
2. **Story timeout:** Mark story as "error", continue with others
3. **Network errors:** Retry once, then mark as error
4. **Hub push failure:** Log warning, don't fail entire scan

## Dependencies

Already available (no new packages needed):
- `@pietgk/browser-core` - AxeScanner, BrowserSession
- `@pietgk/devac-core` - pushBatchAxeDiagnosticsToHub, CentralHub
- `commander` - CLI framework (already in browser-cli)

May need to add:
- `p-limit` - Concurrency limiter for worker pool

## Testing Strategy

1. **Unit tests:** Story discovery parsing, filter logic
2. **Integration tests:** Mock Storybook server, verify scan flow
3. **Manual verification:** Test against real Storybook (mindlerui)

## Verification

```bash
# 1. Start Storybook in mindlerui or app
cd ~/ws/mindlerui && pnpm storybook

# 2. Run scan from browser-cli
cd ~/ws/vivief-248-featbrowser-cli-add-scan-storybook
pnpm -F browser-cli build
pnpm -F browser-cli exec browser scan-storybook --url http://localhost:6006

# 3. Verify hub results
devac query sql "SELECT COUNT(*) FROM unified_diagnostics WHERE source = 'axe'"
```

## Implementation Order

1. [x] Create `types.ts` with shared types
2. [x] Create `story-discovery.ts` - fetch and filter stories
3. [x] Create `play-function-runner.ts` - navigate to story iframe
4. [x] Create `parallel-scanner.ts` - worker pool with AxeScanner
5. [x] Create `hub-writer.ts` - batch push results
6. [x] Create `scan-storybook.ts` - main command
7. [x] Update `commands/index.ts` and `index.ts` to register command
8. [x] Write tests (added in review phase)
9. [x] Manual verification (documented in review phase)

## Additional Implementation (Review Phase)

10. [x] Create test files for scan-storybook modules
    - `story-discovery.test.ts` - 25 tests for fetch, filter, parse functions
    - `parallel-scanner.test.ts` - 8 tests for calculateSummary
    - `hub-writer.test.ts` - 6 tests for detectRepoId
11. [x] Add coverage thresholds to vitest configs
12. [x] Create documentation guides
    - `docs/guides/scan-storybook-getting-started.md`
    - `docs/guides/scan-storybook-ci-cd.md`
13. [x] Update ADR-0045 with sections 7 (scan-storybook) and 8 (a11y-reference-storybook)
14. [x] Update CLAUDE.md with scan-storybook command documentation
