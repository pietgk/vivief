/**
 * Query SQL Subcommand
 *
 * Execute raw SQL queries against seed files.
 * Supports @package syntax for multi-package queries.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { queryCommand } from "../query.js";
import type { QueryOptions, QueryResult } from "../types.js";

export interface QuerySqlOptions extends QueryOptions {}
export interface QuerySqlResult extends QueryResult {}

/**
 * Register the sql subcommand under query
 */
export function registerQuerySql(parent: Command): void {
  parent
    .command("sql <sql>")
    .description("Execute SQL query against seed files")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("-f, --format <type>", "Output format (json, csv, table)", "json")
    .option("-l, --limit <n>", "Limit results")
    .option("--json", "Output as JSON (shorthand for --format json)")
    .action(async (sql, options) => {
      const format = options.json ? "json" : options.format;

      // Apply limit to SQL if specified
      let processedSql = sql;
      if (options.limit && !sql.toLowerCase().includes("limit")) {
        processedSql = `${sql} LIMIT ${options.limit}`;
      }

      const result = await queryCommand({
        sql: processedSql,
        packagePath: path.resolve(options.package),
        format,
      });

      if (result.success) {
        switch (format) {
          case "csv":
            console.log(result.csv);
            break;
          case "table":
            console.log(result.table);
            break;
          default: {
            // BigInt values from DuckDB COUNT(*) need to be converted for JSON serialization
            const bigIntReplacer = (_key: string, value: unknown) =>
              typeof value === "bigint" ? Number(value) : value;
            console.log(JSON.stringify(result.rows, bigIntReplacer, 2));
          }
        }

        if (result.timeMs !== undefined) {
          console.error(`\n(${result.rowCount} rows, ${result.timeMs}ms)`);
        }
      } else {
        console.error(`✗ Query failed: ${result.error}`);
        process.exit(1);
      }
    });
}
