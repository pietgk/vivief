/**
 * Effects Command Implementation
 *
 * Queries effects extracted during analysis.
 * Supports developer-maintained effect documentation.
 * Part of DevAC v3.0 Foundation.
 */

import * as fs from "node:fs";
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
import { getWorkspaceHubDir } from "../utils/workspace-discovery.js";
import { formatOutput, formatTable } from "./output-formatter.js";

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
      const hubDir = await getWorkspaceHubDir();
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
      const hubDir = await getWorkspaceHubDir();
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
    .option("-g, --group-by <field>", "Group by: type, file, entity", "type")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsSummaryCommand({
        packagePath,
        hub: options.hub,
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

  // effects verify subcommand - compare documented vs actual effects
  effectsCmd
    .command("verify")
    .description("Verify documented effects against actual extracted effects")
    .option("-p, --package <path>", "Package path")
    .option("-f, --file <path>", "Path to package-effects.md", "docs/package-effects.md")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsVerifyCommand({
        packagePath,
        effectsFile: options.file,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // effects sync subcommand - generate effect-mappings.ts from package-effects.md
  effectsCmd
    .command("sync")
    .description("Generate .devac/effect-mappings.ts from docs/package-effects.md")
    .option("-p, --package <path>", "Package path")
    .option("-f, --file <path>", "Path to package-effects.md", "docs/package-effects.md")
    .option(
      "-o, --output <path>",
      "Output path for effect-mappings.ts",
      ".devac/effect-mappings.ts"
    )
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const packagePath = options.package ? path.resolve(options.package) : process.cwd();
      const result = await effectsSyncCommand({
        packagePath,
        effectsFile: options.file,
        outputPath: options.output,
        json: options.json,
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

/**
 * Options for effects verify command
 */
export interface EffectsVerifyOptions {
  /** Package path */
  packagePath: string;
  /** Path to package-effects.md file */
  effectsFile: string;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from effects verify command
 */
export interface EffectsVerifyResult {
  /** Whether verification passed (no gaps) */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Patterns in code but not documented */
  unmappedPatterns: Array<{ pattern: string; count: number }>;
  /** Patterns documented but not in code */
  stalePatterns: string[];
  /** Patterns that match */
  matchedPatterns: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Documented pattern from package-effects.md
 */
interface DocumentedPattern {
  pattern: string;
  section: string;
}

/**
 * Parse package-effects.md to extract documented patterns
 */
function parsePackageEffectsMarkdown(content: string): DocumentedPattern[] {
  const patterns: DocumentedPattern[] = [];
  const lines = content.split("\n");

  let currentSection = "";

  for (const line of lines) {
    // Track section headers
    if (line.startsWith("## ")) {
      currentSection = line.replace("## ", "").trim();
      continue;
    }

    // Skip non-table lines
    if (!line.startsWith("|") || line.includes("---")) {
      continue;
    }

    // Skip header rows (e.g., "| Pattern | Count | Description |")
    // Check for "| Pattern " at start to avoid skipping patterns like "issuePattern.test"
    if (line.match(/^\|\s*Pattern\s*\|/)) {
      continue;
    }

    // Extract pattern from table row: | `pattern` | ... |
    const patternMatch = line.match(/\|\s*`([^`]+)`\s*\|/);
    if (patternMatch?.[1]) {
      patterns.push({
        pattern: patternMatch[1],
        section: currentSection,
      });
    }
  }

  return patterns;
}

/**
 * Verify documented effects against actual extracted effects
 */
export async function effectsVerifyCommand(
  options: EffectsVerifyOptions
): Promise<EffectsVerifyResult> {
  let pool: DuckDBPool | null = null;

  try {
    const pkgPath = path.resolve(options.packagePath);
    const effectsFile = path.join(pkgPath, options.effectsFile);

    // Check if package-effects.md exists
    let effectsContent: string;
    try {
      effectsContent = await fs.promises.readFile(effectsFile, "utf-8");
    } catch {
      return {
        success: false,
        output: options.json
          ? JSON.stringify({ success: false, error: `File not found: ${effectsFile}` })
          : `Error: File not found: ${effectsFile}\nRun 'devac effects init' first to create it.`,
        unmappedPatterns: [],
        stalePatterns: [],
        matchedPatterns: [],
        error: "File not found",
      };
    }

    // Parse documented patterns
    const documentedPatterns = parsePackageEffectsMarkdown(effectsContent);
    const documentedSet = new Set(documentedPatterns.map((p) => p.pattern));

    // Initialize pool and query actual effects
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();
    await setupQueryContext(pool, { packagePath: pkgPath });

    // Query all unique callee patterns with counts
    const sql = `
      SELECT
        callee_name,
        CAST(COUNT(*) AS INTEGER) as count
      FROM effects
      WHERE effect_type = 'FunctionCall'
        AND callee_name IS NOT NULL
      GROUP BY callee_name
      ORDER BY count DESC
    `;

    const result = await executeWithRecovery(pool, async (conn) => {
      const rows = await conn.all(sql);
      return { rows, rowCount: rows.length, timeMs: 0 };
    });

    const actualPatterns = result.rows as Array<{ callee_name: string; count: number }>;
    const actualSet = new Set(actualPatterns.map((p) => p.callee_name));

    // Find unmapped patterns (in code but not documented)
    const unmappedPatterns = actualPatterns
      .filter((p) => !documentedSet.has(p.callee_name))
      .map((p) => ({ pattern: p.callee_name, count: p.count }));

    // Find stale patterns (documented but not in code)
    const stalePatterns = documentedPatterns
      .filter((p) => !actualSet.has(p.pattern))
      .map((p) => p.pattern);

    // Find matched patterns
    const matchedPatterns = documentedPatterns
      .filter((p) => actualSet.has(p.pattern))
      .map((p) => p.pattern);

    // Determine success
    const hasGaps = unmappedPatterns.length > 0 || stalePatterns.length > 0;

    // Format output
    let output: string;
    if (options.json) {
      output = JSON.stringify(
        {
          success: !hasGaps,
          documented: documentedPatterns.length,
          actual: actualPatterns.length,
          matched: matchedPatterns.length,
          unmappedCount: unmappedPatterns.length,
          staleCount: stalePatterns.length,
          unmappedPatterns: unmappedPatterns.slice(0, 20),
          stalePatterns,
        },
        null,
        2
      );
    } else {
      output = formatVerifyOutput({
        effectsFile,
        documentedCount: documentedPatterns.length,
        actualCount: actualPatterns.length,
        matchedCount: matchedPatterns.length,
        unmappedPatterns,
        stalePatterns,
      });
    }

    return {
      success: !hasGaps,
      output,
      unmappedPatterns,
      stalePatterns,
      matchedPatterns,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? JSON.stringify({ success: false, error: errorMessage })
        : `Error: ${errorMessage}`,
      unmappedPatterns: [],
      stalePatterns: [],
      matchedPatterns: [],
      error: errorMessage,
    };
  } finally {
    if (pool) {
      await pool.shutdown();
    }
  }
}

/**
 * Format verify command output
 */
function formatVerifyOutput(data: {
  effectsFile: string;
  documentedCount: number;
  actualCount: number;
  matchedCount: number;
  unmappedPatterns: Array<{ pattern: string; count: number }>;
  stalePatterns: string[];
}): string {
  const lines: string[] = [
    `Effects Verification: ${data.effectsFile}`,
    "",
    "Summary:",
    `  Documented patterns: ${data.documentedCount}`,
    `  Actual patterns:     ${data.actualCount}`,
    `  Matched:             ${data.matchedCount}`,
    `  Unmapped:            ${data.unmappedPatterns.length}`,
    `  Stale:               ${data.stalePatterns.length}`,
    "",
  ];

  if (data.unmappedPatterns.length === 0 && data.stalePatterns.length === 0) {
    lines.push("✓ All patterns verified!");
  } else {
    if (data.unmappedPatterns.length > 0) {
      lines.push("⚠ Unmapped patterns (in code but not documented):");
      const topUnmapped = data.unmappedPatterns.slice(0, 15);
      for (const p of topUnmapped) {
        lines.push(`  - ${p.pattern} (${p.count} occurrences)`);
      }
      if (data.unmappedPatterns.length > 15) {
        lines.push(`  ... and ${data.unmappedPatterns.length - 15} more`);
      }
      lines.push("");
    }

    if (data.stalePatterns.length > 0) {
      lines.push("⚠ Stale patterns (documented but not in code):");
      for (const p of data.stalePatterns) {
        lines.push(`  - ${p}`);
      }
      lines.push("");
    }

    lines.push("To update documentation, edit the package-effects.md file.");
  }

  return lines.join("\n");
}

/**
 * Options for effects sync command
 */
export interface EffectsSyncOptions {
  /** Package path */
  packagePath: string;
  /** Path to package-effects.md file */
  effectsFile: string;
  /** Output path for effect-mappings.ts */
  outputPath: string;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from effects sync command
 */
export interface EffectsSyncResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Path to generated file */
  filePath?: string;
  /** Number of mappings generated */
  mappingCount?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Effect mapping extracted from package-effects.md
 */
interface EffectMapping {
  pattern: string;
  effectType: "Store" | "Retrieve" | "Send" | "FunctionCall";
  category: string;
  provider?: string;
  target?: string;
  operation?: string;
  isExternal?: boolean;
  service?: string;
}

/**
 * Parse package-effects.md to extract full effect mappings
 */
function parsePackageEffectsMappings(content: string): EffectMapping[] {
  const mappings: EffectMapping[] = [];
  const lines = content.split("\n");

  let currentSection = "";

  for (const line of lines) {
    // Track section headers
    if (line.startsWith("## ")) {
      currentSection = line.replace("## ", "").trim();
      continue;
    }

    // Skip non-table lines
    if (!line.startsWith("|") || line.includes("---")) {
      continue;
    }

    // Skip header rows (e.g., "| Pattern | Count | Description |")
    // Check for "| Pattern " at start to avoid skipping patterns like "issuePattern.test"
    if (line.match(/^\|\s*Pattern\s*\|/)) {
      continue;
    }

    // Parse table cells
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 2) continue;

    // Extract pattern from first cell (remove backticks)
    const firstCell = cells[0];
    if (!firstCell) continue;

    const patternMatch = firstCell.match(/`([^`]+)`/);
    if (!patternMatch?.[1]) continue;

    const pattern = patternMatch[1];

    // Map section to effect type
    if (currentSection === "Store Operations") {
      mappings.push({
        pattern,
        effectType: "Store",
        category: "store",
        provider: cells[3] && cells[3] !== "TODO" ? cells[3] : undefined,
        target: cells[4] && cells[4] !== "TODO" ? cells[4] : undefined,
        operation: cells[2] || undefined,
      });
    } else if (currentSection === "Retrieve Operations") {
      mappings.push({
        pattern,
        effectType: "Retrieve",
        category: "retrieve",
        provider: cells[3] && cells[3] !== "TODO" ? cells[3] : undefined,
        target: cells[4] && cells[4] !== "TODO" ? cells[4] : undefined,
        operation: cells[2] || undefined,
      });
    } else if (currentSection === "External Calls") {
      mappings.push({
        pattern,
        effectType: "Send",
        category: "external",
        isExternal: true,
        service: cells[2] || undefined,
      });
    }
    // Skip "Other Patterns" section - these are not mapped yet
  }

  return mappings;
}

/**
 * Generate TypeScript effect mappings file
 */
function generateEffectMappingsTs(mappings: EffectMapping[], packageName: string): string {
  const date = new Date().toISOString().split("T")[0];

  const lines: string[] = [
    "/**",
    ` * Effect Mappings for ${packageName}`,
    " *",
    " * Generated by: devac effects sync",
    ` * Generated on: ${date}`,
    " *",
    " * This file defines custom effect classifications for this package.",
    " * It is read during analysis to enhance effect extraction.",
    " */",
    "",
    'import type { EffectMapping } from "@pietgk/devac-core";',
    "",
    "export const effectMappings: EffectMapping[] = [",
  ];

  for (const mapping of mappings) {
    const props: string[] = [`    pattern: "${mapping.pattern}"`];
    props.push(`    effectType: "${mapping.effectType}"`);
    props.push(`    category: "${mapping.category}"`);

    if (mapping.provider) {
      props.push(`    provider: "${mapping.provider}"`);
    }
    if (mapping.target) {
      props.push(`    target: "${mapping.target}"`);
    }
    if (mapping.operation) {
      props.push(`    operation: "${mapping.operation}"`);
    }
    if (mapping.isExternal) {
      props.push("    isExternal: true");
    }
    if (mapping.service) {
      props.push(`    service: "${mapping.service}"`);
    }

    lines.push("  {");
    lines.push(`${props.join(",\n")},`);
    lines.push("  },");
  }

  lines.push("];");
  lines.push("");
  lines.push("export default effectMappings;");
  lines.push("");

  return lines.join("\n");
}

/**
 * Sync package-effects.md to .devac/effect-mappings.ts
 */
export async function effectsSyncCommand(options: EffectsSyncOptions): Promise<EffectsSyncResult> {
  try {
    const pkgPath = path.resolve(options.packagePath);
    const effectsFile = path.join(pkgPath, options.effectsFile);
    const outputFile = path.join(pkgPath, options.outputPath);

    // Check if package-effects.md exists
    let effectsContent: string;
    try {
      effectsContent = await fs.promises.readFile(effectsFile, "utf-8");
    } catch {
      return {
        success: false,
        output: options.json
          ? JSON.stringify({ success: false, error: `File not found: ${effectsFile}` })
          : `Error: File not found: ${effectsFile}\nRun 'devac effects init' first to create it.`,
        error: "File not found",
      };
    }

    // Parse mappings from markdown
    const mappings = parsePackageEffectsMappings(effectsContent);

    if (mappings.length === 0) {
      return {
        success: false,
        output: options.json
          ? JSON.stringify({ success: false, error: "No mappings found in package-effects.md" })
          : `Error: No mappings found in ${effectsFile}\nAdd patterns to the Store, Retrieve, or External Calls sections.`,
        error: "No mappings found",
      };
    }

    // Get package name
    let packageName = path.basename(pkgPath);
    try {
      const pkgJsonPath = path.join(pkgPath, "package.json");
      const pkgJson = JSON.parse(await fs.promises.readFile(pkgJsonPath, "utf-8"));
      packageName = pkgJson.name || packageName;
    } catch {
      // Use directory name as fallback
    }

    // Generate TypeScript content
    const tsContent = generateEffectMappingsTs(mappings, packageName);

    // Ensure .devac directory exists
    const devacDir = path.dirname(outputFile);
    await fs.promises.mkdir(devacDir, { recursive: true });

    // Write the file
    await fs.promises.writeFile(outputFile, tsContent, "utf-8");

    const output = options.json
      ? JSON.stringify(
          {
            success: true,
            filePath: outputFile,
            mappingCount: mappings.length,
            mappings: mappings.map((m) => ({ pattern: m.pattern, effectType: m.effectType })),
          },
          null,
          2
        )
      : [
          `Generated: ${outputFile}`,
          "",
          `Synced ${mappings.length} effect mappings:`,
          `  - Store operations: ${mappings.filter((m) => m.effectType === "Store").length}`,
          `  - Retrieve operations: ${mappings.filter((m) => m.effectType === "Retrieve").length}`,
          `  - External calls: ${mappings.filter((m) => m.effectType === "Send").length}`,
          "",
          "The effect mappings will be used during the next 'devac analyze' run.",
        ].join("\n");

    return {
      success: true,
      output,
      filePath: outputFile,
      mappingCount: mappings.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: options.json
        ? JSON.stringify({ success: false, error: errorMessage })
        : `Error: ${errorMessage}`,
      error: errorMessage,
    };
  }
}
