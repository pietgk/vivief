/**
 * Tests for CSF3 Story Extractor
 */

import { describe, expect, it } from "vitest";
import {
  type A11yReferenceParameters,
  extractStories,
  isStoryFile,
} from "../src/parsers/story-extractor.js";

/** Type for a11yReference in node properties */
interface A11yReferenceNodeProps extends A11yReferenceParameters {
  isReferenceStory?: boolean;
}

describe("story-extractor", () => {
  const baseOptions = {
    repoName: "test-repo",
    packagePath: "packages/test",
    filePath: "src/stories/Test.stories.tsx",
    sourceFileHash: "abc123",
  };

  describe("isStoryFile", () => {
    it("should identify .stories.tsx files", () => {
      expect(isStoryFile("Button.stories.tsx")).toBe(true);
      expect(isStoryFile("src/components/Button.stories.tsx")).toBe(true);
    });

    it("should identify .stories.ts files", () => {
      expect(isStoryFile("Button.stories.ts")).toBe(true);
    });

    it("should identify .story.tsx files", () => {
      expect(isStoryFile("Button.story.tsx")).toBe(true);
    });

    it("should not identify regular tsx files", () => {
      expect(isStoryFile("Button.tsx")).toBe(false);
      expect(isStoryFile("stories.tsx")).toBe(false);
    });
  });

  describe("extractStories - basic CSF3", () => {
    it("should extract meta and stories from CSF3 format", () => {
      const content = `
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
  },
};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.meta).not.toBeNull();
      expect(result.meta?.title).toBe("Components/Button");
      expect(result.meta?.componentName).toBe("Button");
      expect(result.meta?.tags).toContain("autodocs");

      expect(result.stories).toHaveLength(2);
      expect(result.stories[0]?.name).toBe("Primary");
      expect(result.stories[1]?.name).toBe("Secondary");

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0]?.kind).toBe("story");
    });

    it("should detect play functions", () => {
      const content = `
const meta = { title: "Test/Component" };
export default meta;

export const WithPlayFunction = {
  play: async ({ canvasElement }) => {
    // interaction test
  },
};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.stories[0]?.hasPlayFunction).toBe(true);
    });

    it("should detect custom render functions", () => {
      const content = `
const meta = { title: "Test/Component" };
export default meta;

export const WithRender = {
  render: () => <div>Custom render</div>,
};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.stories[0]?.hasCustomRender).toBe(true);
    });
  });

  describe("extractStories - a11y parameters", () => {
    it("should extract disabled a11y rules from story parameters", () => {
      const content = `
const meta = { title: "Test/Component" };
export default meta;

export const WithDisabledRules = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: "color-contrast", enabled: false },
          { id: "image-alt", enabled: false },
        ],
      },
    },
  },
};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.stories[0]?.a11yParams?.disabledRules).toContain("color-contrast");
      expect(result.stories[0]?.a11yParams?.disabledRules).toContain("image-alt");
    });

    it("should detect a11y: { disable: true }", () => {
      const content = `
const meta = { title: "Test/Component" };
export default meta;

export const DisabledA11y = {
  parameters: {
    a11y: {
      disable: true,
    },
  },
};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.stories[0]?.a11yParams?.disabledRules).toContain("*");
    });
  });

  describe("extractStories - a11yReference parameters", () => {
    it("should extract a11yReference from meta-level parameters", () => {
      const content = `
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "A11y Violations/images/image-alt",
  parameters: {
    a11yReference: {
      ruleId: "image-alt",
      expectedViolations: ["image-alt"],
      wcag: ["1.1.1"],
      impact: "critical",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    },
  },
};

export default meta;

type Story = StoryObj;

export const Violation: Story = {
  render: () => <div dangerouslySetInnerHTML={{ __html: '<img src="test.png">' }} />,
  parameters: {
    a11yReference: {
      shouldViolate: true,
      ruleId: "image-alt",
      description: "Image without alt attribute",
    },
  },
};

export const Pass: Story = {
  render: () => <div dangerouslySetInnerHTML={{ __html: '<img src="test.png" alt="Test">' }} />,
  parameters: {
    a11yReference: {
      shouldViolate: false,
      ruleId: "image-alt",
      description: "Image with alt text",
    },
  },
};
`;

      const result = extractStories({ ...baseOptions, content });

      // Check meta-level a11yReference
      expect(result.meta?.a11yReference).not.toBeNull();
      expect(result.meta?.a11yReference?.ruleId).toBe("image-alt");
      expect(result.meta?.a11yReference?.expectedViolations).toContain("image-alt");
      expect(result.meta?.a11yReference?.wcag).toContain("1.1.1");
      expect(result.meta?.a11yReference?.impact).toBe("critical");

      // Check story-level a11yReference
      expect(result.stories).toHaveLength(2);

      const violationStory = result.stories.find((s) => s.name === "Violation");
      expect(violationStory?.a11yReference?.shouldViolate).toBe(true);
      expect(violationStory?.a11yReference?.ruleId).toBe("image-alt");
      expect(violationStory?.a11yReference?.description).toBe("Image without alt attribute");

      const passStory = result.stories.find((s) => s.name === "Pass");
      expect(passStory?.a11yReference?.shouldViolate).toBe(false);
      expect(passStory?.a11yReference?.ruleId).toBe("image-alt");

      // Check nodes have a11yReference in properties
      const violationNode = result.nodes.find((n) => n.name === "Violation");
      expect(violationNode?.properties?.a11yReference).toBeDefined();
      const a11yRef = violationNode?.properties?.a11yReference as A11yReferenceNodeProps;
      expect(a11yRef?.isReferenceStory).toBe(true);
      expect(a11yRef?.ruleId).toBe("image-alt");
      expect(a11yRef?.shouldViolate).toBe(true);
      expect(a11yRef?.wcag).toContain("1.1.1");
      expect(a11yRef?.impact).toBe("critical");
    });

    it("should handle stories without a11yReference", () => {
      const content = `
const meta = { title: "Regular/Component" };
export default meta;

export const Default = {
  args: {},
};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.meta?.a11yReference).toBeNull();
      expect(result.stories[0]?.a11yReference).toBeNull();
      expect(result.nodes[0]?.properties?.a11yReference).toBeUndefined();
    });

    it("should merge meta and story a11yReference properly", () => {
      const content = `
const meta = {
  title: "A11y/button-name",
  parameters: {
    a11yReference: {
      ruleId: "button-name",
      wcag: ["4.1.2"],
      impact: "critical",
    },
  },
};
export default meta;

export const Violation = {
  parameters: {
    a11yReference: {
      shouldViolate: true,
      ruleId: "button-name",
      description: "Button without accessible name",
    },
  },
};
`;

      const result = extractStories({ ...baseOptions, content });

      const node = result.nodes[0];
      const a11yRef = node?.properties?.a11yReference as A11yReferenceNodeProps;
      expect(a11yRef?.ruleId).toBe("button-name");
      expect(a11yRef?.shouldViolate).toBe(true);
      expect(a11yRef?.wcag).toContain("4.1.2");
      expect(a11yRef?.impact).toBe("critical");
      expect(a11yRef?.description).toBe("Button without accessible name");
    });
  });

  describe("extractStories - story ID generation", () => {
    it("should generate correct story IDs", () => {
      const content = `
const meta = { title: "vivief-ui/Atoms/Button" };
export default meta;

export const Primary = {};
export const PrimaryLarge = {};
`;

      const result = extractStories({ ...baseOptions, content });

      expect(result.stories[0]?.storyId).toBe("vivief-ui-atoms-button--primary");
      expect(result.stories[1]?.storyId).toBe("vivief-ui-atoms-button--primary-large");
    });
  });
});
