/**
 * Query Repos Subcommand
 *
 * List all repositories registered with the hub.
 * Wraps the hub-list command functionality.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { Command } from "commander";
import { hubList } from "../hub-list.js";
import { formatOutput } from "../output-formatter.js";

/**
 * Register the repos subcommand under query
 */
export function registerQueryRepos(parent: Command): void {
  parent
    .command("repos")
    .description("List registered repositories")
    .option("--hub-dir <path>", "Hub directory path", path.join(os.homedir(), ".devac"))
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await hubList({
        hubDir: options.hubDir,
        json: options.json,
        verbose: options.verbose,
      });

      if (result.success) {
        if (options.json) {
          console.log(
            formatOutput({ repos: result.repos, count: result.repos.length }, { json: true })
          );
        } else {
          console.log(result.message);
          if (result.repos.length > 0) {
            console.log("");
            for (const repo of result.repos) {
              if (options.verbose) {
                console.log(`  ${repo.repoId}`);
                console.log(`    Path: ${repo.localPath}`);
                console.log(`    Status: ${repo.status}`);
                console.log(`    Packages: ${repo.packages}`);
                if (repo.lastSynced) {
                  console.log(`    Last Sync: ${repo.lastSynced}`);
                }
              } else {
                console.log(`  ${repo.repoId} (${repo.packages} packages)`);
              }
            }
          }
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });
}
