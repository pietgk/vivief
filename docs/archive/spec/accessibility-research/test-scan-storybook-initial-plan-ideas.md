# Testing Plan: scan-storybook Command

## Context

The `browser scan-storybook` command has been implemented (commit `05af5ab`). It:
- Discovers stories from Storybook's `/index.json` endpoint
- Runs parallel accessibility scans using Playwright and axe-core
- Supports story filtering by pattern and tag exclusion
- Pushes results to DevAC hub as unified diagnostics

**User Request**: Extend planning to cover testing strategies with alternatives from simple to extensive, including manual verification guidance, with pros/cons analysis.

---

## Testing Alternatives

### Option A: Unit Tests Only (Simple)

**Scope**: Test pure functions in isolation with mocked dependencies

**Files to test**:
- `story-discovery.ts` - `filterStories()`, `parseTagsString()`, `matchesFilter()`
- `parallel-scanner.ts` - `calculateSummary()`, `mapWcagLevel()`
- `hub-writer.ts` - `detectRepoId()`

**Approach**:
```typescript
// story-discovery.test.ts
describe("filterStories", () => {
  it("includes stories matching filter pattern", () => { ... });
  it("excludes stories with excluded tags", () => { ... });
  it("handles wildcard patterns", () => { ... });
});

describe("parseTagsString", () => {
  it("splits comma-separated tags", () => { ... });
  it("returns empty array for undefined input", () => { ... });
});
```

**Pros**:
- Fast to implement (~2 hours)
- Fast to run (<1s)
- No external dependencies
- Good for regression testing pure logic

**Cons**:
- Doesn't test Playwright integration
- Doesn't test AxeScanner usage
- Doesn't catch real-world issues
- No confidence in end-to-end flow

**Effort**: XS (1 day)

---

### Option B: Unit + Integration Tests with Mocks (Moderate)

**Scope**: Add integration tests that mock Playwright and AxeScanner

**Additional tests**:
- `parallel-scanner.test.ts` - Mock Playwright browser/page, mock AxeScanner
- `scan-storybook.test.ts` - Mock all dependencies, test command orchestration
- `hub-writer.test.ts` - Mock HubClient, test diagnostic conversion

**Approach**:
```typescript
// parallel-scanner.test.ts
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

vi.mock("@pietgk/browser-core", () => ({
  AxeScanner: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue({ violations: [] }),
  })),
}));

describe("scanStoriesInParallel", () => {
  it("launches browser with correct headless option", async () => { ... });
  it("creates correct number of pages for workers", async () => { ... });
  it("reports progress correctly", async () => { ... });
});
```

**Pros**:
- Tests component integration
- Fast execution (~5s)
- Catches most logic errors
- Follows existing browser-core patterns

**Cons**:
- Mocks may drift from real behavior
- Doesn't test actual accessibility detection
- Complex mock setup maintenance

**Effort**: S (2-3 days)

---

### Option C: Integration Tests with Test Storybook (Extensive)

**Scope**: Create a minimal test Storybook fixture with intentional accessibility issues

**Additional components**:
1. Test fixture: `packages/browser-cli/__fixtures__/test-storybook/`
   - 5-10 stories with known accessibility violations
   - Stories covering pass/fail/error scenarios

2. Integration tests that:
   - Start the test Storybook
   - Run `scan-storybook` against it
   - Assert violations are detected correctly

**Fixture structure**:
```
__fixtures__/test-storybook/
├── .storybook/
│   ├── main.ts
│   └── preview.ts
├── src/
│   ├── Button.stories.tsx        # Passes a11y
│   ├── BadImage.stories.tsx      # Missing alt text (critical)
│   ├── BadForm.stories.tsx       # Missing labels (serious)
│   ├── LowContrast.stories.tsx   # Contrast issues (moderate)
│   ├── SkipThis.stories.tsx      # Has a11y-skip tag
│   └── ErrorStory.stories.tsx    # Throws during render
├── package.json
└── index.html
```

**Test approach**:
```typescript
// scan-storybook.integration.test.ts
describe("scan-storybook integration", () => {
  let storybookProcess: ChildProcess;

  beforeAll(async () => {
    storybookProcess = await startTestStorybook();
    await waitForStorybook("http://localhost:6007");
  });

  afterAll(() => storybookProcess.kill());

  it("detects image-alt violation in BadImage story", async () => {
    const result = await runScanStorybook({
      url: "http://localhost:6007",
      filter: "BadImage/*",
    });
    expect(result.summary.totalViolations).toBeGreaterThan(0);
    expect(result.results[0].violations).toContainEqual(
      expect.objectContaining({ ruleId: "image-alt" })
    );
  });

  it("skips stories with a11y-skip tag", async () => {
    const result = await runScanStorybook({
      url: "http://localhost:6007",
      excludeTags: "a11y-skip",
    });
    expect(result.results).not.toContainEqual(
      expect.objectContaining({ storyTitle: expect.stringContaining("SkipThis") })
    );
  });
});
```

**Pros**:
- Tests real accessibility detection
- High confidence in results
- Catches integration issues
- Can be used for manual testing too
- Documents expected behavior

**Cons**:
- Slower tests (~30s-1min)
- Requires Storybook + React dependencies in fixtures
- More setup/maintenance
- May be flaky in CI

**Effort**: M (1 week)

---

### Option D: Use mindlerui Storybook Directly (Practical)

**Scope**: Run tests against the existing mindlerui Storybook (400+ stories)

**Approach**:
- Use mindlerui's Storybook as the test target
- Focus on smoke tests and known patterns
- Compare results against baseline

**Pros**:
- No fixture creation needed
- Real-world stories
- Validates performance at scale

**Cons**:
- External dependency (mindlerui must be available)
- Results change as mindlerui changes
- Harder to test specific scenarios
- May be in different repo

**Effort**: S (2-3 days for setup, but ongoing maintenance)

---

## Recommended Approach

**Phase 1 (Now)**: Option A + B (Unit + Mocked Integration)
- Implement unit tests for pure functions
- Add mocked integration tests for scanner
- Provides 80% confidence with low effort

**Phase 2 (Later)**: Option C (Test Fixture)
- Create minimal test Storybook fixture
- Add true integration tests
- Provides remaining 20% confidence

---

## Manual Testing & Verification Guide

### Prerequisites
1. Build the browser-cli package:
   ```bash
   pnpm -F @pietgk/browser-cli build
   ```

2. Have a Storybook running (mindlerui or any):
   ```bash
   # In mindlerui repo:
   pnpm storybook
   ```

### Basic Verification

**Test 1: Help output**
```bash
browser scan-storybook --help
```
Expected: Shows all options with descriptions

**Test 2: Basic scan**
```bash
browser scan-storybook --url http://localhost:6006 --workers 2
```
Expected: Shows progress, summary with pass rate, violations by severity

**Test 3: JSON output**
```bash
browser scan-storybook --url http://localhost:6006 --json | jq '.summary'
```
Expected: Valid JSON with summary object

**Test 4: Filter by pattern**
```bash
browser scan-storybook --url http://localhost:6006 --filter "Button/*"
```
Expected: Only scans Button stories

**Test 5: Exclude tags**
```bash
browser scan-storybook --url http://localhost:6006 --exclude-tags "a11y-skip,wip"
```
Expected: Skips stories with those tags

**Test 6: Headed mode**
```bash
browser scan-storybook --url http://localhost:6006 --headed --workers 1
```
Expected: Browser window visible during scan

**Test 7: Hub integration**
```bash
browser scan-storybook --url http://localhost:6006 --repo-id "test/repo"
```
Expected: Shows "Hub: Pushed X diagnostics to test/repo"

**Test 8: Error handling**
```bash
browser scan-storybook --url http://localhost:9999  # Wrong port
```
Expected: Clear error message about connection failure

### Validation Checklist

- [ ] Stories are discovered from /index.json
- [ ] Parallel scanning works (multiple workers)
- [ ] Violations are detected (if any exist in target Storybook)
- [ ] Progress updates show during scan
- [ ] Summary shows correct counts
- [ ] JSON output is valid and complete
- [ ] Filtering by pattern works
- [ ] Tag exclusion works
- [ ] Exit code is 1 when violations found, 0 otherwise
- [ ] Hub push works (when hub is available)

### Common Issues

1. **"Storybook index.json not found"**
   - Storybook version < 7 doesn't have /index.json
   - Check: `curl http://localhost:6006/index.json`

2. **Timeout errors**
   - Increase timeout: `--timeout 60000`
   - Reduce workers: `--workers 1`

3. **Memory issues with many stories**
   - Reduce workers
   - Filter to subset of stories

---

## Files to Create/Modify

### New Test Files
- `packages/browser-cli/__tests__/scan-storybook/story-discovery.test.ts`
- `packages/browser-cli/__tests__/scan-storybook/parallel-scanner.test.ts`
- `packages/browser-cli/__tests__/scan-storybook/hub-writer.test.ts`
- `packages/browser-cli/__tests__/scan-storybook/scan-storybook.test.ts`

### Future (Phase 2)
- `packages/browser-cli/__fixtures__/test-storybook/` (entire directory)
- `packages/browser-cli/__tests__/scan-storybook/integration.test.ts`

---

## Verification

After implementing tests:
```bash
# Run all tests
pnpm -F @pietgk/browser-cli test

# Run only scan-storybook tests
pnpm -F @pietgk/browser-cli test scan-storybook

# With coverage
pnpm -F @pietgk/browser-cli test --coverage
```
