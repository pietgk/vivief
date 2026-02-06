# Scan Storybook in CI/CD

This guide explains how to integrate Storybook accessibility scanning into your CI/CD pipeline.

## GitHub Actions

### Basic Workflow

```yaml
name: Accessibility

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  a11y-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Build Storybook
        run: pnpm build-storybook

      - name: Serve Storybook
        run: |
          npx http-server storybook-static -p 6006 &
          sleep 5

      - name: Run accessibility scan
        run: browser scan-storybook --json > a11y-results.json

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: a11y-results
          path: a11y-results.json

      - name: Check for violations
        run: |
          VIOLATIONS=$(jq '.summary.totalViolations' a11y-results.json)
          CRITICAL=$(jq '.summary.criticalCount' a11y-results.json)

          if [ "$CRITICAL" -gt 0 ]; then
            echo "::error::$CRITICAL critical accessibility violations found"
            exit 1
          fi

          echo "Total violations: $VIOLATIONS (0 critical)"
```

### Fail on Thresholds

Configure the workflow to fail when violations exceed thresholds:

```yaml
- name: Check violation thresholds
  run: |
    CRITICAL=$(jq '.summary.criticalCount' a11y-results.json)
    SERIOUS=$(jq '.summary.seriousCount' a11y-results.json)
    TOTAL=$(jq '.summary.totalViolations' a11y-results.json)

    echo "Violations: $TOTAL total ($CRITICAL critical, $SERIOUS serious)"

    # Fail on any critical violations
    if [ "$CRITICAL" -gt 0 ]; then
      echo "::error::$CRITICAL critical violations - build failed"
      exit 1
    fi

    # Fail if serious violations exceed threshold
    if [ "$SERIOUS" -gt 5 ]; then
      echo "::error::$SERIOUS serious violations (threshold: 5) - build failed"
      exit 1
    fi

    # Warn on total violations
    if [ "$TOTAL" -gt 20 ]; then
      echo "::warning::$TOTAL total violations (threshold: 20)"
    fi
```

### PR Comments

Post a summary comment on pull requests:

```yaml
- name: Post PR comment
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const results = JSON.parse(fs.readFileSync('a11y-results.json', 'utf8'));
      const { summary } = results;

      const emoji = summary.criticalCount > 0 ? '🚨' :
                    summary.seriousCount > 0 ? '⚠️' : '✅';

      const body = `## ${emoji} Accessibility Scan Results

      | Metric | Count |
      |--------|-------|
      | Stories scanned | ${summary.scannedStories} |
      | Passed | ${summary.passedStories} |
      | Failed | ${summary.failedStories} |
      | Total violations | ${summary.totalViolations} |
      | Critical | ${summary.criticalCount} |
      | Serious | ${summary.seriousCount} |
      | Moderate | ${summary.moderateCount} |
      | Minor | ${summary.minorCount} |

      ${summary.topIssues.length > 0 ? `
      **Top Issues:**
      ${summary.topIssues.slice(0, 5).map(i => `- \`${i.ruleId}\`: ${i.count} occurrences`).join('\n')}
      ` : ''}
      `;

      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body
      });
```

### Caching

Speed up CI runs by caching Playwright browsers:

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      playwright-${{ runner.os }}-

- name: Install Playwright browsers
  run: npx playwright install chromium --with-deps
```

## GitLab CI

```yaml
a11y-scan:
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  stage: test
  script:
    - npm ci
    - npm run build-storybook
    - npx http-server storybook-static -p 6006 &
    - sleep 5
    - browser scan-storybook --json > a11y-results.json
    - |
      CRITICAL=$(jq '.summary.criticalCount' a11y-results.json)
      if [ "$CRITICAL" -gt 0 ]; then
        echo "Critical violations found: $CRITICAL"
        exit 1
      fi
  artifacts:
    paths:
      - a11y-results.json
    reports:
      junit: a11y-results.xml
```

## CircleCI

```yaml
version: 2.1

jobs:
  a11y-scan:
    docker:
      - image: mcr.microsoft.com/playwright:v1.40.0-focal
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Build Storybook
          command: npm run build-storybook
      - run:
          name: Start Storybook server
          command: npx http-server storybook-static -p 6006
          background: true
      - run:
          name: Wait for Storybook
          command: sleep 5
      - run:
          name: Run accessibility scan
          command: browser scan-storybook --json > a11y-results.json
      - store_artifacts:
          path: a11y-results.json
      - run:
          name: Check critical violations
          command: |
            CRITICAL=$(jq '.summary.criticalCount' a11y-results.json)
            if [ "$CRITICAL" -gt 0 ]; then
              echo "Critical violations: $CRITICAL"
              exit 1
            fi

workflows:
  test:
    jobs:
      - a11y-scan
```

## Best Practices

### 1. Start with Warnings, Move to Errors

Don't block deployments immediately. Start by tracking violations:

```yaml
# Phase 1: Track violations (no failures)
- name: Report violations
  run: |
    TOTAL=$(jq '.summary.totalViolations' a11y-results.json)
    echo "::notice::$TOTAL accessibility violations found"

# Phase 2: Fail on critical only
- name: Check critical violations
  run: |
    CRITICAL=$(jq '.summary.criticalCount' a11y-results.json)
    if [ "$CRITICAL" -gt 0 ]; then exit 1; fi

# Phase 3: Enforce thresholds
- name: Enforce thresholds
  run: |
    TOTAL=$(jq '.summary.totalViolations' a11y-results.json)
    if [ "$TOTAL" -gt "${{ vars.A11Y_THRESHOLD }}" ]; then exit 1; fi
```

### 2. Use Repository Variables for Thresholds

Set thresholds via repository variables for easy adjustment:

```yaml
env:
  A11Y_CRITICAL_THRESHOLD: ${{ vars.A11Y_CRITICAL_THRESHOLD || '0' }}
  A11Y_SERIOUS_THRESHOLD: ${{ vars.A11Y_SERIOUS_THRESHOLD || '10' }}
  A11Y_TOTAL_THRESHOLD: ${{ vars.A11Y_TOTAL_THRESHOLD || '50' }}
```

### 3. Exclude Known Issues Temporarily

Use tags to skip stories with known issues:

```yaml
- name: Scan with exclusions
  run: browser scan-storybook --exclude-tags "a11y-known-issue,wip" --json > a11y-results.json
```

Track known issues separately and fix them over time.

### 4. Parallel Execution

For large Storybooks, increase workers:

```yaml
- name: Fast scan
  run: browser scan-storybook --workers 8 --json > a11y-results.json
```

### 5. Scheduled Full Scans

Run comprehensive scans on a schedule, quick scans on PRs:

```yaml
# PR workflow - quick scan of changed stories
on: pull_request

jobs:
  quick-scan:
    steps:
      - name: Scan changed components
        run: |
          CHANGED=$(git diff --name-only origin/main | grep '\.stories\.' | head -1)
          FILTER=$(dirname $CHANGED | xargs -I{} basename {})
          browser scan-storybook --filter "$FILTER/*" --json > results.json

# Scheduled workflow - full scan
on:
  schedule:
    - cron: "0 2 * * *" # 2 AM daily

jobs:
  full-scan:
    steps:
      - name: Full accessibility scan
        run: browser scan-storybook --json > results.json
```

## Monitoring Trends

Track accessibility trends over time by storing results:

```yaml
- name: Store metrics
  run: |
    DATE=$(date +%Y-%m-%d)
    TOTAL=$(jq '.summary.totalViolations' a11y-results.json)
    CRITICAL=$(jq '.summary.criticalCount' a11y-results.json)

    # Append to metrics file
    echo "$DATE,$TOTAL,$CRITICAL" >> a11y-metrics.csv

- name: Commit metrics
  run: |
    git config user.name github-actions
    git config user.email github-actions@github.com
    git add a11y-metrics.csv
    git commit -m "chore: update a11y metrics" || true
    git push
```

## See Also

- [Getting Started Guide](./scan-storybook-getting-started.md)
- [ADR-0045: Accessibility Intelligence Layer](../adr/0045-accessibility-intelligence-layer.md)
