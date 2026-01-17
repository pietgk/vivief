/**
 * Interaction Commands
 *
 * browser click <ref>
 * browser double-click <ref>
 * browser right-click <ref>
 * browser type <ref> <text> [--delay <ms>] [--clear]
 * browser fill <ref> <value>
 * browser select <ref> <value> [--by value|label|index]
 * browser scroll <direction> [--amount 500] [--ref <ref>]
 * browser scroll-into-view <ref>
 * browser hover <ref>
 * browser get-text <ref>
 * browser get-value <ref>
 * browser wait <condition> [value] [--timeout <ms>]
 */

import {
  ElementFinder,
  type ScrollOptions,
  type SelectOptions,
  type TypeOptions,
  type WaitCondition,
  click,
  doubleClick,
  fill,
  hover,
  rightClick,
  scroll,
  scrollIntoView,
  select,
  type as typeText,
} from "@pietgk/browser-core";
import type { Command } from "commander";
import { getCurrentPage } from "./shared.js";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

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

interface WaitCommandOptions extends CommonOptions {
  timeout?: string;
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

  // double-click
  program
    .command("double-click")
    .description("Double-click an element by ref")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const result = await doubleClick(page, ref);

        if (!result.success) {
          printError(result.error ?? "Double-click failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Double-clicked element: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // right-click
  program
    .command("right-click")
    .description("Right-click an element by ref")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const result = await rightClick(page, ref);

        if (!result.success) {
          printError(result.error ?? "Right-click failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Right-clicked element: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // scroll-into-view
  program
    .command("scroll-into-view")
    .description("Scroll an element into the visible viewport")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const result = await scrollIntoView(page, ref);

        if (!result.success) {
          printError(result.error ?? "Scroll into view failed");
          process.exit(1);
        }

        printOutput(
          {
            ref,
            message: `Scrolled element into view: ${ref}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // get-text
  program
    .command("get-text")
    .description("Get the text content of an element")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const finder = new ElementFinder(page);

        const findResult = await finder.byRef(ref);
        if (findResult.count === 0) {
          printError(`Element not found: ${ref}`);
          process.exit(1);
        }

        const locator = page.getLocator(ref);
        const text = await locator.textContent();

        if (options.json) {
          printOutput(
            {
              ref,
              text: text ?? "",
            },
            options
          );
        } else {
          console.log(text ?? "");
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // get-value
  program
    .command("get-value")
    .description("Get the input value of a form element")
    .argument("<ref>", "Element ref from browser read")
    .option("--json", "Output as JSON")
    .action(async (ref: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const finder = new ElementFinder(page);

        const findResult = await finder.byRef(ref);
        if (findResult.count === 0) {
          printError(`Element not found: ${ref}`);
          process.exit(1);
        }

        const locator = page.getLocator(ref);
        const value = await locator.inputValue();

        if (options.json) {
          printOutput(
            {
              ref,
              value,
            },
            options
          );
        } else {
          console.log(value);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // wait
  program
    .command("wait")
    .description("Wait for a condition before proceeding")
    .argument(
      "<condition>",
      "Wait condition (selector, text, visible, hidden, navigation, networkIdle)"
    )
    .argument("[value]", "Selector, text, or ref depending on condition")
    .option("--timeout <ms>", "Maximum wait time in ms", "30000")
    .option("--json", "Output as JSON")
    .action(async (condition: string, value: string | undefined, options: WaitCommandOptions) => {
      try {
        const page = getCurrentPage();
        const timeout = options.timeout ? Number.parseInt(options.timeout, 10) : 30000;

        const validConditions = [
          "selector",
          "text",
          "visible",
          "hidden",
          "navigation",
          "networkIdle",
        ];
        if (!validConditions.includes(condition)) {
          printError(`Invalid condition: ${condition}. Use: ${validConditions.join(", ")}`);
          process.exit(1);
        }

        // Build the wait condition
        let waitCondition: WaitCondition;
        switch (condition) {
          case "selector":
            if (!value) {
              printError("Selector value required for selector wait");
              process.exit(1);
            }
            waitCondition = { type: "selector", selector: value };
            break;
          case "text":
            if (!value) {
              printError("Text value required for text wait");
              process.exit(1);
            }
            waitCondition = { type: "text", text: value };
            break;
          case "visible":
            if (!value) {
              printError("Element ref required for visible wait");
              process.exit(1);
            }
            waitCondition = { type: "visible", ref: value };
            break;
          case "hidden":
            if (!value) {
              printError("Element ref required for hidden wait");
              process.exit(1);
            }
            waitCondition = { type: "hidden", ref: value };
            break;
          case "navigation":
            waitCondition = { type: "navigation" };
            break;
          case "networkIdle":
            waitCondition = { type: "networkIdle" };
            break;
          default:
            printError(`Unknown condition: ${condition}`);
            process.exit(1);
        }

        await page.wait(waitCondition, { timeout });

        printOutput(
          {
            condition,
            value: value ?? null,
            message: `Wait condition met: ${condition}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
