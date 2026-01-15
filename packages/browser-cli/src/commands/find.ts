/**
 * Find and Eval Commands
 *
 * browser find --selector <css>
 * browser find --text <text>
 * browser find --role <role> [--name <name>]
 * browser eval <script>
 */

import { ElementFinder, SessionManager } from "@pietgk/browser-core";
import type { Command } from "commander";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

interface FindOptions extends CommonOptions {
  selector?: string;
  text?: string;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  testId?: string;
}

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

/**
 * Register find and eval commands
 */
export const registerFindCommands: CommandRegister = (program: Command) => {
  // find
  program
    .command("find")
    .description("Find elements using various strategies")
    .option("--selector <css>", "Find by CSS selector")
    .option("--text <text>", "Find by text content")
    .option("--role <role>", "Find by ARIA role")
    .option("--name <name>", "For role strategy: accessible name filter")
    .option("--label <text>", "Find by label text")
    .option("--placeholder <text>", "Find by placeholder text")
    .option("--test-id <id>", "Find by data-testid attribute")
    .option("--json", "Output as JSON")
    .action(async (options: FindOptions) => {
      try {
        const page = getCurrentPage();
        const finder = new ElementFinder(page);

        let result: Awaited<ReturnType<typeof finder.bySelector>> | undefined;
        let strategy: string;

        if (options.selector) {
          strategy = "selector";
          result = await finder.bySelector(options.selector);
        } else if (options.text) {
          strategy = "text";
          result = await finder.byText(options.text);
        } else if (options.role) {
          strategy = "role";
          result = await finder.byRole(options.role as Parameters<typeof finder.byRole>[0], {
            name: options.name,
          });
        } else if (options.label) {
          strategy = "label";
          result = await finder.byLabel(options.label);
        } else if (options.placeholder) {
          strategy = "placeholder";
          result = await finder.byPlaceholder(options.placeholder);
        } else if (options.testId) {
          strategy = "testId";
          result = await finder.byTestId(options.testId);
        } else {
          printError(
            "Must specify at least one find strategy: --selector, --text, --role, --label, --placeholder, or --test-id"
          );
          process.exit(1);
        }

        if (!result || result.count === 0) {
          if (options.json) {
            printOutput(
              {
                found: false,
                elements: [],
                message: `No elements found with ${strategy}`,
              },
              options
            );
          } else {
            console.log(`No elements found with ${strategy}`);
          }
          return;
        }

        if (options.json) {
          printOutput(
            {
              found: true,
              elements: result.elements.map((el) => ({
                ref: el.ref,
                role: el.role,
                name: el.name,
                tag: el.tag,
              })),
              count: result.count,
            },
            options
          );
        } else {
          console.log(`Found ${result.count} element(s):`);
          for (const el of result.elements) {
            const name = el.name ? `: "${el.name}"` : "";
            console.log(`  ${el.ref} - ${el.tag} (${el.role}${name})`);
          }
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // eval
  program
    .command("eval")
    .description("Execute JavaScript in the page context")
    .argument("<script>", "JavaScript code to execute")
    .option("--json", "Output as JSON")
    .action(async (script: string, options: CommonOptions) => {
      try {
        const page = getCurrentPage();
        const playwrightPage = page.getPlaywrightPage();
        const result = await playwrightPage.evaluate(script);

        if (options.json) {
          printOutput({ result }, options);
        } else {
          console.log("Result:", result);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
