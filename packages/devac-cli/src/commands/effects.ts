/**
 * Effects Command Implementation
 *
 * Queries effects extracted during analysis.
 * Supports developer-maintained effect documentation.
 * Part of DevAC v3.0 Foundation.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DuckDBPool,
  type QueryResult,
  createCentralHub,
  discoverPackagesInRepo,
  executeWithRecovery,
  queryMultiplePackages,
  setupQueryContext,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput, formatTable } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Check if a package has effects.parquet file
 */
async function hasEffectsParquet(packagePath: string): Promise<boolean> {
  const effectsPath = path.join(packagePath, ".devac", "seed", "base", "effects.parquet");
  try {
    await fs.promises.access(effectsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for effects command
 */
export interface EffectsCommandOptions {
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter by effect type */
  type?: string;
  /** Filter by file path */
  file?: string;
  /** Filter by source entity ID */
  entity?: string;
  /** Show only external calls */
  externalOnly?: boolean;
  /** Show only async calls */
  asyncOnly?: boolean;
  /** Maximum results to return */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from effects command
 */
export interface EffectsCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of effects found */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw effects data */
  effects?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Format effects for display
 */
function formatEffects(effects: unknown[], options: { json: boolean }): string {
  if (options.json) {
    return formatOutput({ effects, count: effects.length }, { json: true });
  }

  if (effects.length === 0) {
    return "No effects found";
  }

  const rows = effects.map((effect: unknown) => {
    const e = effect as Record<string, unknown>;
    const callee = (e.callee_name as string) || (e.target_resource as string) || "-";
    const location = `${e.source_file_path}:${e.source_line}`;
    return {
      "Effect Type": e.effect_type as string,
      Callee: callee,
      Location: location,
    };
  });

  return formatTable(rows, { columns: ["Effect Type", "Callee", "Location"] });
}

/**
 * Run effects command
 */
export async function effectsCommand(
  options: EffectsCommandOptions
): Promise<EffectsCommandResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    let result: QueryResult<unknown>;

    // Build SQL query with filters
    const conditions: string[] = [];
    if (options.type) {
      conditions.push(`effect_type = '${options.type.replace(/'/g, "''")}'`);
    }
    if (options.file) {
      conditions.push(
        `source_file_path LIKE '%${options.file.replace(/'/g, "''").replace(/%/g, "\\%")}%'`
      );
    }
    if (options.entity) {
      conditions.push(`source_entity_id = '${options.entity.replace(/'/g, "''")}'`);
    }
    if (options.externalOnly) {
      conditions.push("is_external = true");
    }
    if (options.asyncOnly) {
      conditions.push("is_async = true");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 100";

    if (options.hub) {
      // Hub mode: query all registered repos
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();

        if (repos.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ effects: [], count: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
            effects: [],
          };
        }

        // Discover packages with effects.parquet in each repo
        const packagePaths: string[] = [];
        for (const repo of repos) {
          const packages = await discoverPackagesInRepo(repo.localPath);
          for (const pkg of packages) {
            if (pkg.hasSeeds && (await hasEffectsParquet(pkg.path))) {
              packagePaths.push(pkg.path);
            }
          }
        }

        if (packagePaths.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ effects: [], count: 0 }, { json: true })
              : "No packages with effects found in registered repos (run 'devac analyze' first)",
            count: 0,
            timeMs: Date.now() - startTime,
            effects: [],
          };
        }

        const sql = `SELECT * FROM {effects} ${whereClause} ${limitClause}`;
        result = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      // Package mode: query single package
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());

      // Set up query context to create views for effects table
      await setupQueryContext(pool, { packagePath: pkgPath });

      const sql = `SELECT * FROM effects ${whereClause} ${limitClause}`;
      const queryStartTime = Date.now();
      result = await executeWithRecovery(pool, async (conn) => {
        const rows = await conn.all(sql);
        return {
          rows,
          rowCount: rows.length,
          timeMs: Date.now() - queryStartTime,
        };
      });
    }

    const effects = result.rows;
    const output = formatEffects(effects, { json: options.json ?? false });

    return {
      success: true,
      output,
      count: effects.length,
      timeMs: Date.now() - startTime,
      effects,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      count: 0,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Options for effects summary command
 */
export interface EffectsSummaryOptions {
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Group by field: type, file, entity */
  groupBy?: "type" | "file" | "entity";
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from effects summary command
 */
export interface EffectsSummaryResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw summary data */
  summary?: unknown[];
  /** Error message if failed */
  error?: string;
}

/**
 * Run effects summary command
 */
export async function effectsSummaryCommand(
  options: EffectsSummaryOptions
): Promise<EffectsSummaryResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    const groupBy = options.groupBy || "type";
    const groupField =
      groupBy === "type"
        ? "effect_type"
        : groupBy === "file"
          ? "source_file_path"
          : "source_entity_id";

    let result: QueryResult<unknown>;

    if (options.hub) {
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();

        if (repos.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ summary: [], total: 0 }, { json: true })
              : "No repositories registered in hub",
            timeMs: Date.now() - startTime,
            summary: [],
          };
        }

        // Discover packages with effects.parquet in each repo
        const packagePaths: string[] = [];
        for (const repo of repos) {
          const packages = await discoverPackagesInRepo(repo.localPath);
          for (const pkg of packages) {
            if (pkg.hasSeeds && (await hasEffectsParquet(pkg.path))) {
              packagePaths.push(pkg.path);
            }
          }
        }

        if (packagePaths.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ summary: [], total: 0 }, { json: true })
              : "No packages with effects found in registered repos (run 'devac analyze' first)",
            timeMs: Date.now() - startTime,
            summary: [],
          };
        }

        const sql = `SELECT ${groupField} as group_key, COUNT(*) as count FROM {effects} GROUP BY ${groupField} ORDER BY count DESC`;
        result = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());

      // Set up query context to create views for effects table
      await setupQueryContext(pool, { packagePath: pkgPath });

      const sql = `SELECT ${groupField} as group_key, COUNT(*) as count FROM effects GROUP BY ${groupField} ORDER BY count DESC`;
      const queryStartTime = Date.now();
      result = await executeWithRecovery(pool, async (conn) => {
        const rows = await conn.all(sql);
        return {
          rows,
          rowCount: rows.length,
          timeMs: Date.now() - queryStartTime,
        };
      });
    }

    const summary = result.rows as Array<{ group_key: string; count: number }>;
    const total = summary.reduce((acc: number, row) => acc + Number(row.count), 0);

    const output = options.json
      ? formatOutput({ summary, total }, { json: true })
      : formatEffectsSummary(summary, groupBy, total);

    return {
      success: true,
      output,
      timeMs: Date.now() - startTime,
      summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output = options.json
      ? formatOutput({ success: false, error: errorMessage }, { json: true })
      : `Error: ${errorMessage}`;

    return {
      success: false,
      output,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

function formatEffectsSummary(summary: unknown[], groupBy: string, total: number): string {
  if (summary.length === 0) {
    return "No effects found";
  }

  const lines = [`Effects Summary (grouped by ${groupBy})`, `Total: ${total}`, ""];
  for (const row of summary) {
    const r = row as Record<string, unknown>;
    lines.push(`  ${r.group_key}: ${r.count}`);
  }
  return lines.join("\n");
}

/**
 * Register the effects command with the CLI program
 */
export function registerEffectsCommand(program: Command): void {
  const effectsCmd = program
    .command("effects")
    .description("Query effects extracted during analysis");

  // effects list subcommand (also the default when no subcommand given)
  effectsCmd
    .command("list", { isDefault: true })
    .description("List effects (default command)")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-t, --type <type>", "Filter by effect type (FunctionCall, Store, etc.)")
    .option("-f, --file <path>", "Filter by file path")
    .option("-e, --entity <id>", "Filter by source entity ID")
    .option("--external-only", "Show only external calls")
    .option("--async-only", "Show only async calls")
    .option("-l, --limit <count>", "Maximum results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsCommand({
        packagePath,
        hub: options.hub,
        hubDir: options.hubDir,
        type: options.type,
        file: options.file,
        entity: options.entity,
        externalOnly: options.externalOnly,
        asyncOnly: options.asyncOnly,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // effects summary subcommand
  effectsCmd
    .command("summary")
    .description("Get summary statistics for effects")
    .option("-p, --package <path>", "Package path")
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-g, --group-by <field>", "Group by: type, file, entity", "type")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsSummaryCommand({
        packagePath,
        hub: options.hub,
        hubDir: options.hubDir,
        groupBy: options.groupBy as "type" | "file" | "entity",
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // effects init subcommand - create initial package-effects.md
  effectsCmd
    .command("init")
    .description("Create initial docs/package-effects.md from AST analysis")
    .option("-p, --package <path>", "Package path")
    .option("--min-count <n>", "Minimum occurrences to include", "3")
    .option("--output <path>", "Output file path", "docs/package-effects.md")
    .option("--force", "Overwrite existing file")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsInitCommand({
        packagePath,
        minCount: Number.parseInt(options.minCount, 10),
        outputPath: options.output,
        force: options.force,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}

/**
 * Options for effects init command
 */
export interface EffectsInitOptions {
  /** Package path */
  packagePath: string;
  /** Minimum occurrences to include a pattern */
  minCount: number;
  /** Output file path relative to package */
  outputPath: string;
  /** Overwrite existing file */
  force?: boolean;
}

/**
 * Result from effects init command
 */
export interface EffectsInitResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Path to created file */
  filePath?: string;
  /** Number of patterns discovered */
  patternCount?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Discover FunctionCall patterns and generate package-effects.md
 */
export async function effectsInitCommand(options: EffectsInitOptions): Promise<EffectsInitResult> {
  let pool: DuckDBPool | null = null;

  try {
    const pkgPath = path.resolve(options.packagePath);
    const outputFile = path.join(pkgPath, options.outputPath);

    // Check if file already exists
    if (!options.force) {
      try {
        await fs.promises.access(outputFile);
        return {
          success: false,
          output: `File already exists: ${outputFile}\nUse --force to overwrite.`,
          error: "File exists",
        };
      } catch {
        // File doesn't exist, continue
      }
    }

    // Initialize pool and query effects
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
    await setupQueryContext(pool, { packagePath: pkgPath });

    // Get package name from package.json
    let packageName = path.basename(pkgPath);
    try {
      const pkgJsonPath = path.join(pkgPath, "package.json");
      const pkgJson = JSON.parse(await fs.promises.readFile(pkgJsonPath, "utf-8"));
      packageName = pkgJson.name || packageName;
    } catch {
      // Use directory name as fallback
    }

    // Query FunctionCall patterns grouped by callee_name
    const sql = `
      SELECT
        callee_name,
        CAST(COUNT(*) AS INTEGER) as count,
        is_method_call,
        is_async,
        is_external,
        external_module
      FROM effects
      WHERE effect_type = 'FunctionCall'
      GROUP BY callee_name, is_method_call, is_async, is_external, external_module
      HAVING COUNT(*) >= ${options.minCount}
      ORDER BY count DESC
    `;

    const result = await executeWithRecovery(pool, async (conn) => {
      const rows = await conn.all(sql);
      return { rows, rowCount: rows.length, timeMs: 0 };
    });

    const patterns = result.rows as Array<{
      callee_name: string;
      count: number;
      is_method_call: boolean;
      is_async: boolean;
      is_external: boolean;
      external_module: string | null;
    }>;

    // Categorize patterns
    const storePatterns: Array<{ pattern: string; count: number }> = [];
    const retrievePatterns: Array<{ pattern: string; count: number }> = [];
    const externalPatterns: Array<{ pattern: string; count: number; module: string | null }> = [];
    const otherPatterns: Array<{
      pattern: string;
      count: number;
      isMethod: boolean;
      isAsync: boolean;
    }> = [];

    for (const p of patterns) {
      const callee = p.callee_name;

      // Heuristic categorization based on common naming patterns
      if (p.is_external && p.external_module) {
        externalPatterns.push({ pattern: callee, count: p.count, module: p.external_module });
      } else if (
        /\.(insert|create|put|set|save|write|push|add|store|update|upsert)$/i.test(callee)
      ) {
        storePatterns.push({ pattern: callee, count: p.count });
      } else if (/\.(find|get|read|fetch|query|select|scan|retrieve|load)$/i.test(callee)) {
        retrievePatterns.push({ pattern: callee, count: p.count });
      } else {
        otherPatterns.push({
          pattern: callee,
          count: p.count,
          isMethod: p.is_method_call,
          isAsync: p.is_async,
        });
      }
    }

    // Generate markdown content
    const content = generatePackageEffectsMarkdown({
      packageName,
      storePatterns,
      retrievePatterns,
      externalPatterns,
      otherPatterns,
    });

    // Ensure docs directory exists
    const docsDir = path.dirname(outputFile);
    await fs.promises.mkdir(docsDir, { recursive: true });

    // Write the file
    await fs.promises.writeFile(outputFile, content, "utf-8");

    const totalPatterns =
      storePatterns.length +
      retrievePatterns.length +
      externalPatterns.length +
      otherPatterns.length;

    return {
      success: true,
      output: [
        `Created: ${outputFile}`,
        "",
        `Discovered ${totalPatterns} patterns (min count: ${options.minCount}):`,
        `  - Store operations: ${storePatterns.length}`,
        `  - Retrieve operations: ${retrievePatterns.length}`,
        `  - External calls: ${externalPatterns.length}`,
        `  - Other patterns: ${otherPatterns.length}`,
        "",
        "Review and refine the mappings, then run:",
        `  devac effects verify -p ${options.packagePath}`,
      ].join("\n"),
      filePath: outputFile,
      patternCount: totalPatterns,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `Error: ${errorMessage}`,
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Generate the package-effects.md markdown content
 */
function generatePackageEffectsMarkdown(data: {
  packageName: string;
  storePatterns: Array<{ pattern: string; count: number }>;
  retrievePatterns: Array<{ pattern: string; count: number }>;
  externalPatterns: Array<{ pattern: string; count: number; module: string | null }>;
  otherPatterns: Array<{ pattern: string; count: number; isMethod: boolean; isAsync: boolean }>;
}): string {
  const date = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    `# Package Effects: ${data.packageName}`,
    "",
    "<!--",
    "  This file defines effect mappings for this package.",
    "  Run `devac effects sync` to regenerate extraction rules.",
    "  Run `devac effects verify` to check for unmapped patterns.",
    "  ",
    "  Generated by: devac effects init",
    "  Review and refine the mappings below.",
    "-->",
    "",
    "## Metadata",
    `- **Package:** ${data.packageName}`,
    `- **Last Updated:** ${date}`,
    "- **Verified:** ✗",
    "",
  ];

  // Store Operations
  lines.push("## Store Operations");
  lines.push("<!-- Pattern → Store effect mapping -->");
  if (data.storePatterns.length > 0) {
    lines.push("| Pattern | Store Type | Operation | Provider | Target | Count |");
    lines.push("|---------|------------|-----------|----------|--------|-------|");
    for (const p of data.storePatterns) {
      const op = inferOperation(p.pattern, "store");
      lines.push(`| \`${p.pattern}\` | database | ${op} | TODO | TODO | ${p.count} |`);
    }
  } else {
    lines.push("_No store patterns detected. Add manually if needed._");
  }
  lines.push("");

  // Retrieve Operations
  lines.push("## Retrieve Operations");
  lines.push("<!-- Pattern → Retrieve effect mapping -->");
  if (data.retrievePatterns.length > 0) {
    lines.push("| Pattern | Retrieve Type | Operation | Provider | Target | Count |");
    lines.push("|---------|---------------|-----------|----------|--------|-------|");
    for (const p of data.retrievePatterns) {
      const op = inferOperation(p.pattern, "retrieve");
      lines.push(`| \`${p.pattern}\` | database | ${op} | TODO | TODO | ${p.count} |`);
    }
  } else {
    lines.push("_No retrieve patterns detected. Add manually if needed._");
  }
  lines.push("");

  // External Calls
  lines.push("## External Calls");
  lines.push("<!-- Pattern → Send effect mapping -->");
  if (data.externalPatterns.length > 0) {
    lines.push("| Pattern | Send Type | Service | Third Party | Module | Count |");
    lines.push("|---------|-----------|---------|-------------|--------|-------|");
    for (const p of data.externalPatterns) {
      const service = inferService(p.module);
      lines.push(
        `| \`${p.pattern}\` | external | ${service} | true | ${p.module || "-"} | ${p.count} |`
      );
    }
  } else {
    lines.push("_No external call patterns detected. Add manually if needed._");
  }
  lines.push("");

  // Other Patterns (for reference)
  lines.push("## Other Patterns");
  lines.push("<!-- Review these and categorize as needed -->");
  if (data.otherPatterns.length > 0) {
    lines.push("| Pattern | Method Call | Async | Count | Suggested Category |");
    lines.push("|---------|-------------|-------|-------|-------------------|");
    for (const p of data.otherPatterns.slice(0, 30)) {
      // Limit to top 30
      const suggested = suggestCategory(p.pattern);
      lines.push(
        `| \`${p.pattern}\` | ${p.isMethod ? "yes" : "no"} | ${p.isAsync ? "yes" : "no"} | ${p.count} | ${suggested} |`
      );
    }
    if (data.otherPatterns.length > 30) {
      lines.push(`| _...and ${data.otherPatterns.length - 30} more_ | | | | |`);
    }
  } else {
    lines.push("_No other patterns detected._");
  }
  lines.push("");

  // Groups (placeholder)
  lines.push("## Groups");
  lines.push("<!-- Architectural grouping for C4 -->");
  lines.push("| Name | Group Type | Technology | Parent | Description |");
  lines.push("|------|------------|------------|--------|-------------|");
  lines.push(`| ${data.packageName} | Container | typescript | - | TODO: Add description |`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Infer operation type from pattern name
 */
function inferOperation(pattern: string, type: "store" | "retrieve"): string {
  const lower = pattern.toLowerCase();
  if (type === "store") {
    if (lower.includes("insert") || lower.includes("create") || lower.includes("add"))
      return "insert";
    if (lower.includes("update") || lower.includes("upsert")) return "update";
    if (lower.includes("delete") || lower.includes("remove")) return "delete";
    if (lower.includes("set") || lower.includes("put") || lower.includes("write")) return "write";
    return "write";
  }
  if (
    lower.includes("findmany") ||
    lower.includes("findall") ||
    lower.includes("query") ||
    lower.includes("select")
  )
    return "query";
  if (lower.includes("get") || lower.includes("find") || lower.includes("read")) return "get";
  if (lower.includes("scan")) return "scan";
  return "get";
}

/**
 * Infer service name from module path
 */
function inferService(module: string | null): string {
  if (!module) return "unknown";
  const lower = module.toLowerCase();
  if (lower.includes("stripe")) return "stripe";
  if (lower.includes("sendgrid")) return "sendgrid";
  if (lower.includes("aws-sdk") || lower.includes("@aws-sdk")) return "aws";
  if (lower.includes("axios") || lower.includes("fetch")) return "http";
  if (lower.includes("redis")) return "redis";
  if (lower.includes("prisma")) return "prisma";
  // Use last segment of module path
  const parts = module.split("/");
  return parts[parts.length - 1] || "unknown";
}

/**
 * Suggest a category for uncategorized patterns
 */
function suggestCategory(pattern: string): string {
  const lower = pattern.toLowerCase();
  if (lower.includes("log") || lower.includes("console") || lower.includes("debug"))
    return "logging";
  if (lower.includes("error") || lower.includes("throw") || lower.includes("exception"))
    return "error-handling";
  if (lower.includes("validate") || lower.includes("check") || lower.includes("assert"))
    return "validation";
  if (lower.includes("parse") || lower.includes("stringify") || lower.includes("serialize"))
    return "serialization";
  if (lower.includes("path") || lower.includes("file") || lower.includes("fs."))
    return "filesystem";
  if (lower.includes("date") || lower.includes("time")) return "datetime";
  if (
    lower.includes("push") ||
    lower.includes("pop") ||
    lower.includes("map") ||
    lower.includes("filter")
  )
    return "array-ops";
  return "-";
}
