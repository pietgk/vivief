import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/stories/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    // NOTE: Do NOT add @storybook/addon-a11y here —
    // we want scan-storybook to be the a11y runner, not the built-in addon
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    check: false,
    reactDocgen: "react-docgen-typescript",
  },
  docs: {
    autodocs: true,
  },
};

export default config;
