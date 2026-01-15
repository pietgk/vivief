/**
 * Interaction Commands
 *
 * browser click <ref>
 * browser type <ref> <text> [--delay <ms>] [--clear]
 * browser fill <ref> <value>
 * browser select <ref> <value> [--by value|label|index]
 * browser scroll <direction> [--amount 500] [--ref <ref>]
 * browser hover <ref>
 */

import {
  type ScrollOptions,
  type SelectOptions,
  SessionManager,
  type TypeOptions,
  click,
  fill,
  hover,
  scroll,
  scrollIntoView,
  select,
  type as typeText,
} from "@pietgk/browser-core";
import type { Command } from "commander";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

/**
 * Get current page context
 */
function getCurrentPage() {
  const manager = SessionManager.getInstance();
  const session = manager.getCurrentSession();
  if (!session) {
    throw new Error("No active browser session. Start one with: browser session start");
  }
  const page = session.getCurrentPage();
  if (!page) {
    throw new Error("No active page in session");
  }
  return page;
}

interface TypeCommandOptions extends CommonOptions {
  delay?: string;
  clear?: boolean;
}

interface SelectCommandOptions extends CommonOptions {
  by?: "value" | "label" | "index";
}

interface ScrollCommandOptions extends CommonOptions {
  amount?: string;
  ref?: string;
}

/**
 * Register interaction commands
 */
export const registerInteractCommands: CommandRegister = (program: Command) => {
  // click
  program
    .command("click")
    .description("Click an element by ref")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const result = await click(page, ref);

        if (!result.success) {
          printError(result.error ?? "Click failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Clicked element: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // type
  program
    .command("type")
    .description("Type text into an element")
    .argument("<ref>", "Element ref from browser read")
    .argument("<text>", "Text to type")
    .option("--delay <ms>", "Delay between keystrokes in ms")
    .option("--clear", "Clear existing content first", false)
    .option("--json", "Output as JSON")
    .action(async (ref: string, text: string, options: TypeCommandOptions) => {
      try {
        const page = getCurrentPage();
        const typeOptions: TypeOptions = {
          clear: options.clear,
        };

        if (options.delay) {
          const delay = Number.parseInt(options.delay, 10);
          if (!Number.isNaN(delay) && delay >= 0) {
            typeOptions.delay = delay;
          }
        }

        const result = await typeText(page, ref, text, typeOptions);

        if (!result.success) {
          printError(result.error ?? "Type failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Typed text into element: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // fill
  program
    .command("fill")
    .description("Fill an input field with a value")
    .argument("<ref>", "Element ref from browser read")
    .argument("<value>", "Value to fill")
    .option("--json", "Output as JSON")
    .action(async (ref: string, value: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const result = await fill(page, ref, value);

        if (!result.success) {
          printError(result.error ?? "Fill failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Filled element: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // select
  program
    .command("select")
    .description("Select an option from a dropdown")
    .argument("<ref>", "Element ref of the select element")
    .argument("<value>", "Value, label, or index to select")
    .option("--by <method>", "How to match the option (value, label, index)", "value")
    .option("--json", "Output as JSON")
    .action(async (ref: string, value: string, options: SelectCommandOptions) => {
      try {
        const page = getCurrentPage();
        const selectOptions: SelectOptions = {
          by: options.by,
        };

        const result = await select(page, ref, value, selectOptions);

        if (!result.success) {
          printError(result.error ?? "Select failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Selected option in element: ${ref}`,
            selectedValues: result.selectedValues,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // scroll
  program
    .command("scroll")
    .description("Scroll the page in a direction")
    .argument("<direction>", "Scroll direction (up, down, left, right)")
    .option("--amount <pixels>", "Scroll amount in pixels", "500")
    .option("--ref <ref>", "Element ref to scroll into view instead of page scroll")
    .option("--json", "Output as JSON")
    .action(async (direction: string, options: ScrollCommandOptions) => {
      try {
        const page = getCurrentPage();

        // If ref is provided, scroll element into view
        if (options.ref) {
          const result = await scrollIntoView(page, options.ref);
          if (!result.success) {
            printError(result.error ?? "Scroll into view failed");
            process.exit(1);
          }

          printOutput(
            {
              message: `Scrolled element into view: ${options.ref}`,
            },
            options
          );
          return;
        }

        // Validate direction
        const validDirections = ["up", "down", "left", "right"];
        if (!validDirections.includes(direction)) {
          printError(`Invalid direction: ${direction}. Use: ${validDirections.join(", ")}`);
          process.exit(1);
        }

        const scrollOptions: ScrollOptions = {
          direction: direction as ScrollOptions["direction"],
        };

        if (options.amount) {
          const amount = Number.parseInt(options.amount, 10);
          if (!Number.isNaN(amount) && amount > 0) {
            scrollOptions.amount = amount;
          }
        }

        const result = await scroll(page, scrollOptions);

        if (!result.success) {
          printError(result.error ?? "Scroll failed");
          process.exit(1);
        }

        printOutput(
          {
            message: `Scrolled page ${direction}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // hover
  program
    .command("hover")
    .description("Hover over an element")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const result = await hover(page, ref);

        if (!result.success) {
          printError(result.error ?? "Hover failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Hovered over element: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
