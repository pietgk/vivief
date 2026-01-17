/**
 * Page Reading Commands
 *
 * browser read [--selector <css>] [--json] [--interactive-only]
 */

import { PageReader, type ReadPageOptions } from "@pietgk/browser-core";
import type { Command } from "commander";
import { getCurrentPage } from "./shared.js";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

interface ReadOptions extends CommonOptions {
  selector?: string;
  interactiveOnly?: boolean;
  maxElements?: string;
}

/**
 * Register read commands
 */
export const registerReadCommands: CommandRegister = (program: Command) => {
  // read
  program
    .command("read")
    .description("Read the current page and get element refs")
    .option("--selector <css>", "CSS selector to scope reading")
    .option("--interactive-only", "Only include interactive elements", false)
    .option("--max-elements <count>", "Maximum elements to return")
    .option("--json", "Output as JSON")
    .action(async (options: ReadOptions) => {
      try {
        const pageContext = getCurrentPage();
        const reader = new PageReader(pageContext);

        const readOptions: ReadPageOptions = {
          selector: options.selector,
          interactiveOnly: options.interactiveOnly,
        };

        if (options.maxElements) {
          const maxElements = Number.parseInt(options.maxElements, 10);
          if (!Number.isNaN(maxElements) && maxElements > 0) {
            readOptions.maxElements = maxElements;
          }
        }

        const content = await reader.readPage(readOptions);

        if (options.json) {
          printOutput(
            {
              url: content.url,
              title: content.title,
              elements: content.elements.map((el) => ({
                ref: el.ref,
                role: el.role,
                name: el.name,
                tag: el.tag,
                testId: el.testId,
                isInteractive: el.isInteractive,
              })),
              elementCount: content.elements.length,
              refVersion: content.refVersion,
            },
            options
          );
        } else {
          console.log(`Page: ${content.title}`);
          console.log(`URL: ${content.url}`);
          console.log(`Elements (${content.elements.length}):`);
          console.log("");

          for (const el of content.elements) {
            const interactive = el.isInteractive ? "[interactive]" : "";
            const name = el.name ? `: "${el.name}"` : "";
            console.log(`  ${el.ref} - ${el.tag} (${el.role}${name}) ${interactive}`);
          }
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
