/**
 * Navigation Commands
 *
 * browser navigate <url> [--wait-until load|domcontentloaded|networkidle]
 * browser reload [--wait-until ...]
 * browser back
 * browser forward
 */

import type { NavigateOptions } from "@pietgk/browser-core";
import type { Command } from "commander";
import { getCurrentPage } from "./shared.js";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

interface NavigateCommandOptions extends CommonOptions {
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

/**
 * Register navigation commands
 */
export const registerNavigateCommands: CommandRegister = (program: Command) => {
  // navigate
  program
    .command("navigate")
    .description("Navigate to a URL")
    .argument("<url>", "URL to navigate to")
    .option(
      "--wait-until <state>",
      "Wait until state (load, domcontentloaded, networkidle, commit)",
      "load"
    )
    .option("--json", "Output as JSON")
    .action(async (url: string, options: NavigateCommandOptions) => {
      try {
        const page = getCurrentPage();
        const navOptions: NavigateOptions = {
          waitUntil: options.waitUntil,
        };

        await page.navigate(url, navOptions);

        printOutput(
          {
            url: page.url(),
            title: await page.title(),
            message: `Navigated to: ${url}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // reload
  program
    .command("reload")
    .description("Reload the current page")
    .option(
      "--wait-until <state>",
      "Wait until state (load, domcontentloaded, networkidle, commit)",
      "load"
    )
    .option("--json", "Output as JSON")
    .action(async (options: NavigateCommandOptions) => {
      try {
        const page = getCurrentPage();
        const navOptions: NavigateOptions = {
          waitUntil: options.waitUntil,
        };

        await page.reload(navOptions);

        printOutput(
          {
            url: page.url(),
            title: await page.title(),
            message: "Page reloaded",
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // back
  program
    .command("back")
    .description("Go back in browser history")
    .option("--json", "Output as JSON")
    .action(async (options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        await page.goBack();

        printOutput(
          {
            url: page.url(),
            message: "Navigated back",
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // forward
  program
    .command("forward")
    .description("Go forward in browser history")
    .option("--json", "Output as JSON")
    .action(async (options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        await page.goForward();

        printOutput(
          {
            url: page.url(),
            message: "Navigated forward",
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
