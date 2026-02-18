# @pietgk/browser-cli

## 0.3.2

### Patch Changes

- Updated dependencies [be5e5fd]
  - @pietgk/devac-core@2.6.2

## 0.3.1

### Patch Changes

- @pietgk/devac-core@2.6.1

## 0.3.0

### Minor Changes

- 8d6bbb1: feat(browser-cli): add scan-storybook command for accessibility testing

  - Add `browser scan-storybook` command to scan Storybook stories for accessibility violations
  - Parallel scanning with configurable workers using Playwright and axe-core
  - Push violations to DevAC hub as unified diagnostics (source: "axe")
  - Filter stories by title pattern and exclude by tags
  - Support WCAG 2.0 A, AA, and WCAG 2.1 AA conformance levels

  feat(devac-core): add story extractor with a11yReference support

  - Extract CSF3 Storybook stories as "story" node kind
  - Parse `a11yReference` parameters for accessibility validation metadata
  - Support shouldViolate, expectedViolations, wcag, and impact fields

  feat(a11y-reference-storybook): new package for accessibility testing validation

  - Reference Storybook with intentional violations for each axe-core rule
  - Story generator that creates stories from axe-core rule fixtures
  - Rule manifest mapping rules to expected violations
  - CLI tool for generating stories: `a11y-stories generate`

### Patch Changes

- Updated dependencies [8d6bbb1]
  - @pietgk/devac-core@2.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [9656502]
  - @pietgk/browser-core@0.3.0

## 0.2.0

### Minor Changes

- 66396cd: Add browser automation packages for AI-assisted web interaction

  - **browser-core**: Playwright wrapper with element ref system, session management, and page reading
  - **browser-cli**: Command-line interface for browser automation
  - **browser-mcp**: MCP server exposing browser tools to AI assistants

### Patch Changes

- Updated dependencies [66396cd]
  - @pietgk/browser-core@0.2.0
