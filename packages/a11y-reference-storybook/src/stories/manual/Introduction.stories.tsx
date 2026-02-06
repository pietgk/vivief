import type { Meta, StoryObj } from "@storybook/react";

/**
 * # A11y Reference Storybook
 *
 * This Storybook contains intentional accessibility violations for testing
 * the `scan-storybook` command. Each rule from axe-core has corresponding
 * stories that demonstrate both **violations** and **passes**.
 *
 * ## Structure
 *
 * - `_generated/` - Auto-generated stories from axe-core fixtures
 * - `manual/` - Hand-crafted stories for edge cases and realistic components
 *
 * ## Story Parameters
 *
 * Each story includes `a11yReference` parameters:
 *
 * ```ts
 * parameters: {
 *   a11yReference: {
 *     ruleId: 'image-alt',
 *     shouldViolate: true,
 *     expectedViolations: ['image-alt'],
 *     wcag: ['wcag111', 'wcag2a'],
 *     impact: 'critical',
 *     helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
 *   },
 * }
 * ```
 *
 * ## Usage
 *
 * ```bash
 * # Start this Storybook
 * pnpm --filter @pietgk/a11y-reference-storybook storybook
 *
 * # Scan with browser-cli
 * browser scan-storybook --url http://localhost:6007
 * ```
 */
const meta: Meta = {
  title: "Introduction",
  parameters: {
    docs: {
      description: {
        component: "Welcome to the A11y Reference Storybook",
      },
    },
  },
};

export default meta;

type Story = StoryObj;

/**
 * Welcome to the A11y Reference Storybook!
 *
 * This is a test ground for accessibility validation. Stories here
 * intentionally contain violations to verify that `scan-storybook`
 * detects them correctly.
 */
export const Welcome: Story = {
  render: () => (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>A11y Reference Storybook</h1>
      <p>
        This Storybook contains intentional accessibility violations for testing purposes. Each
        axe-core rule has corresponding stories demonstrating both violations and passes.
      </p>

      <h2>How to Use</h2>
      <ol>
        <li>
          Run <code>a11y-stories generate</code> to create stories from axe-core fixtures
        </li>
        <li>
          Start this Storybook with <code>pnpm storybook</code>
        </li>
        <li>
          Scan with <code>browser scan-storybook --url http://localhost:6007</code>
        </li>
        <li>
          Compare results against <code>a11y-rule-manifest.json</code>
        </li>
      </ol>

      <h2>Story Categories</h2>
      <ul>
        <li>
          <strong>A11y Violations/</strong> - Generated stories with intentional violations
        </li>
        <li>
          <strong>Manual/</strong> - Hand-crafted edge cases and realistic examples
        </li>
      </ul>
    </div>
  ),
};
