import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    // Disable built-in a11y checks — we test with scan-storybook
    a11y: { disable: true },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;
