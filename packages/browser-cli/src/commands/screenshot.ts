/**
 * Screenshot Command
 *
 * browser screenshot [--full-page] [--name <name>] [--selector <css>]
 */

import { ScreenshotManager, type ScreenshotOptions, SessionManager } from "@pietgk/browser-core";
import type { Command } from "commander";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

interface ScreenshotCommandOptions extends CommonOptions {
  fullPage?: boolean;
  name?: string;
  selector?: string;
}

/**
 * Register screenshot command
 */
export const registerScreenshotCommands: CommandRegister = (program: Command) => {
  program
    .command("screenshot")
    .description("Take a screenshot of the current page")
    .option("--full-page", "Capture full scrollable page", false)
    .option("--name <name>", "Custom filename (without extension)")
    .option("--selector <css>", "CSS selector to capture specific element")
    .option("--json", "Output as JSON")
    .action(async (options: ScreenshotCommandOptions) => {
      try {
        const manager = SessionManager.getInstance();
        const session = manager.getCurrentSession();

        if (!session) {
          printError("No active browser session. Start one with: browser session start");
          process.exit(1);
        }

        const page = session.getCurrentPage();
        if (!page) {
          printError("No active page in session");
          process.exit(1);
        }

        const screenshotManager = new ScreenshotManager(page);
        const screenshotOptions: ScreenshotOptions = {
          fullPage: options.fullPage,
          name: options.name,
          selector: options.selector,
        };

        const result = await screenshotManager.capture(session.id, screenshotOptions);

        if (options.json) {
          printOutput(
            {
              path: result.path,
              width: result.width,
              height: result.height,
              message: `Screenshot saved: ${result.path}`,
            },
            options
          );
        } else {
          console.log(`Screenshot saved: ${result.path}`);
          console.log(`Dimensions: ${result.width}x${result.height}`);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
