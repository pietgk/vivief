# A11y Reference Storybook

Reference Storybook for accessibility testing — contains intentional violations for each axe-core rule to verify that `scan-storybook` detects them correctly.

## Purpose

This package provides:

1. **Reference Stories**: A Storybook where every axe-core rule has at least one story that triggers the violation and one that passes
2. **Rule Manifest**: A JSON file mapping rules to their stories and expected results
3. **CLI Tool**: Generate stories automatically from axe-core's own test fixtures
4. **Coverage Validation**: Verify that `scan-storybook` detects all expected violations

## Installation

```bash
pnpm install
```

## Usage

### Generate Stories

```bash
# Generate stories from axe-core rules and fixtures
pnpm generate

# Or use the CLI directly
a11y-stories generate --output src/stories/_generated
```

### Run Storybook

```bash
# Start Storybook (port 6007 to avoid conflicts with app Storybooks)
pnpm storybook

# Build for CI
pnpm build-storybook
```

### Scan with browser-cli

```bash
# Scan all stories for accessibility violations
browser scan-storybook --url http://localhost:6007

# Compare results against the manifest
# (Results should match a11y-rule-manifest.json)
```

## Directory Structure

```
packages/a11y-reference-storybook/
├── .storybook/
│   ├── main.ts           # Storybook config (no a11y addon)
│   └── preview.ts        # Preview settings
├── src/
│   ├── commands/         # CLI commands
│   │   ├── generate.ts   # Generate stories from axe-core
│   │   ├── types.ts      # Type definitions
│   │   └── index.ts      # Command exports
│   ├── stories/
│   │   ├── _generated/   # Auto-generated stories (from axe-core fixtures)
│   │   └── manual/       # Hand-crafted edge cases
│   ├── index.ts          # CLI entry point
│   └── version.ts        # Version info
├── a11y-rule-manifest.json   # Generated manifest of all rules
├── package.json
└── README.md
```

## Story Format

Each story includes `a11yReference` parameters:

```tsx
export const Violation: StoryObj = {
  render: () => <img src="test.png" />,
  parameters: {
    a11yReference: {
      ruleId: "image-alt",
      shouldViolate: true,
      expectedViolations: ["image-alt"],
      wcag: ["wcag111", "wcag2a"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    },
  },
};
```

## Manifest Format

The `a11y-rule-manifest.json` maps every rule to its stories:

```json
{
  "generatedAt": "2026-02-03T...",
  "axeCoreVersion": "4.10.0",
  "rules": [
    {
      "ruleId": "image-alt",
      "description": "Images must have alternate text",
      "wcag": ["wcag2a", "wcag111"],
      "impact": "critical",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      "category": "component",
      "stories": {
        "violations": ["ImageNoAlt", "InputImageNoAlt"],
        "passes": ["ImageWithAlt", "DecorativeImage"]
      }
    }
  ],
  "summary": {
    "totalRules": 95,
    "componentLevel": 72,
    "pageLevel": 23,
    "storiesGenerated": 280
  }
}
```

## Integration with scan-storybook

The expected workflow:

1. Generate reference stories: `pnpm generate`
2. Build Storybook: `pnpm build-storybook`
3. Run scan-storybook: `browser scan-storybook --url http://localhost:6007`
4. Compare results against `a11y-rule-manifest.json`
5. Report coverage: which rules were detected, which were missed

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Build the CLI |
| `pnpm generate` | Generate stories from axe-core |
| `pnpm storybook` | Start Storybook dev server |
| `pnpm build-storybook` | Build static Storybook |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type check the code |

## License

MIT
