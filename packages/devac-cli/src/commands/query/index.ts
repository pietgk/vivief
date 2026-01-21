/**
 * Query Command Umbrella
 *
 * Consolidates all query operations under a single `devac query` command.
 * Part of DevAC v4.0 Three Commands Reorganization.
 */

import type { Command } from "commander";
import { registerQueryAffected } from "./affected.js";
import { registerQueryC4 } from "./c4.js";
import { registerQueryCallGraph } from "./call-graph.js";
import { registerQueryContext } from "./context.js";
import { registerQueryDependents } from "./dependents.js";
import { registerQueryDeps } from "./deps.js";
import { registerQueryEffects } from "./effects.js";
import { registerQueryFile } from "./file.js";
import { registerQueryRepos } from "./repos.js";
import { registerQueryRules } from "./rules.js";
import { registerQuerySchema } from "./schema.js";
import { registerQuerySql } from "./sql.js";
import { registerQuerySymbol } from "./symbol.js";

/**
 * Register the query command umbrella with all subcommands
 */
export function registerQueryCommand(program: Command): void {
  const query = program
    .command("query")
    .description("Query the code graph")
    .action(() => {
      // Show help when no subcommand is provided
      query.help();
    });

  // Default: raw SQL (as a subcommand)
  registerQuerySql(query);

  // Subcommands
  registerQuerySymbol(query);
  registerQueryDeps(query);
  registerQueryDependents(query);
  registerQueryFile(query);
  registerQueryCallGraph(query);
  registerQueryAffected(query);
  registerQueryEffects(query);
  registerQueryRepos(query);
  registerQueryC4(query);
  registerQueryContext(query);
  registerQueryRules(query);
  registerQuerySchema(query);
}

// Re-export subcommand types for programmatic use
export type { QuerySqlOptions, QuerySqlResult } from "./sql.js";
