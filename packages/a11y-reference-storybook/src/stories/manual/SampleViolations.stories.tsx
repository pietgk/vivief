import type { Meta, StoryObj } from "@storybook/react";

/**
 * ## Sample Violations
 *
 * Hand-crafted examples demonstrating common accessibility violations.
 * These serve as a baseline test for scan-storybook functionality.
 */
const meta: Meta = {
  title: "Manual/Sample Violations",
  parameters: {
    docs: {
      description: {
        component: "Sample accessibility violations for testing scan-storybook",
      },
    },
  },
};

export default meta;

type Story = StoryObj;

/**
 * ❌ VIOLATION: Image without alt text
 *
 * Images must have alternate text for screen readers.
 */
export const ImageNoAlt: Story = {
  render: () => (
    <div>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img src="https://via.placeholder.com/150" />
      <p>This image has no alt attribute.</p>
    </div>
  ),
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

/**
 * ✅ PASS: Image with alt text
 *
 * Accessible image with descriptive alt text.
 */
export const ImageWithAlt: Story = {
  render: () => (
    <div>
      <img src="https://via.placeholder.com/150" alt="A gray placeholder image" />
      <p>This image has proper alt text.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "image-alt",
      shouldViolate: false,
      expectedViolations: [],
      wcag: ["wcag111", "wcag2a"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    },
  },
};

/**
 * ❌ VIOLATION: Button without accessible name
 *
 * Buttons must have discernible text.
 */
export const ButtonNoName: Story = {
  render: () => (
    <div>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
      <button type="button">
        <span aria-hidden="true">×</span>
      </button>
      <p>This button has no accessible name.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "button-name",
      shouldViolate: true,
      expectedViolations: ["button-name"],
      wcag: ["wcag412", "wcag2a"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
    },
  },
};

/**
 * ✅ PASS: Button with accessible name
 *
 * Accessible button with proper text content.
 */
export const ButtonWithName: Story = {
  render: () => (
    <div>
      <button type="button" aria-label="Close dialog">
        <span aria-hidden="true">×</span>
      </button>
      <p>This button has an aria-label providing its accessible name.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "button-name",
      shouldViolate: false,
      expectedViolations: [],
      wcag: ["wcag412", "wcag2a"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
    },
  },
};

/**
 * ❌ VIOLATION: Form input without label
 *
 * Form elements must have labels.
 */
export const InputNoLabel: Story = {
  render: () => (
    <div>
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
      <input type="text" placeholder="Enter your name" />
      <p>This input has no associated label.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "label",
      shouldViolate: true,
      expectedViolations: ["label"],
      wcag: ["wcag131", "wcag2a"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label",
    },
  },
};

/**
 * ✅ PASS: Form input with label
 *
 * Accessible form input with properly associated label.
 */
export const InputWithLabel: Story = {
  render: () => (
    <div>
      <label htmlFor="name-input">Your name</label>
      <input type="text" id="name-input" placeholder="Enter your name" />
      <p>This input has a properly associated label.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "label",
      shouldViolate: false,
      expectedViolations: [],
      wcag: ["wcag131", "wcag2a"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label",
    },
  },
};

/**
 * ❌ VIOLATION: Link without accessible name
 *
 * Links must have discernible text.
 */
export const LinkNoName: Story = {
  render: () => (
    <div>
      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid, jsx-a11y/anchor-has-content */}
      <a href="#" />
      <p>This link has no text or accessible name.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "link-name",
      shouldViolate: true,
      expectedViolations: ["link-name"],
      wcag: ["wcag244", "wcag412", "wcag2a"],
      impact: "serious",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/link-name",
    },
  },
};

/**
 * ✅ PASS: Link with accessible name
 *
 * Accessible link with proper text content.
 */
export const LinkWithName: Story = {
  render: () => (
    <div>
      <a href="#">Learn more about accessibility</a>
      <p>This link has proper text content.</p>
    </div>
  ),
  parameters: {
    a11yReference: {
      ruleId: "link-name",
      shouldViolate: false,
      expectedViolations: [],
      wcag: ["wcag244", "wcag412", "wcag2a"],
      impact: "serious",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/link-name",
    },
  },
};
