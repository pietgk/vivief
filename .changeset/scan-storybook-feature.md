---
"@pietgk/browser-cli": minor
"@pietgk/devac-core": minor
"@pietgk/a11y-reference-storybook": minor
---

feat(browser-cli): add scan-storybook command for accessibility testing

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
