/**
 * Rules Command Implementation
 *
 * Runs the Rules Engine on effects to produce domain effects.
 * Part of DevAC v3.0 Foundation.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  type CodeEffect,
  type DomainEffect,
  DuckDBPool,
  type QueryResult,
  type Rule,
  type RuleEngineResult,
  builtinRules,
  createCentralHub,
  createRuleEngine,
  createSeedReader,
  getRulesByDomain,
  getRulesByProvider,
  queryMultiplePackages,
} from "@pietgk/devac-core";
import type { Command } from "commander";
import { formatOutput, formatTable } from "./output-formatter.js";

function getDefaultHubDir(): string {
  return path.join(os.homedir(), ".devac");
}

/**
 * Options for rules run command
 */
export interface RulesRunOptions {
  /** Package path (for package mode) */
  packagePath?: string;
  /** Use hub mode for federated queries */
  hub?: boolean;
  /** Hub directory (default: ~/.devac) */
  hubDir?: string;
  /** Filter output by domain */
  domain?: string;
  /** Maximum effects to process */
  limit?: number;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from rules run command
 */
export interface RulesRunResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of domain effects produced */
  count: number;
  /** Time taken in milliseconds */
  timeMs: number;
  /** Raw domain effects data */
  domainEffects?: DomainEffect[];
  /** Rule statistics */
  ruleStats?: Record<string, number>;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for rules list command
 */
export interface RulesListOptions {
  /** Filter by domain */
  domain?: string;
  /** Filter by provider */
  provider?: string;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result from rules list command
 */
export interface RulesListResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Formatted output */
  output: string;
  /** Number of rules */
  count: number;
  /** Raw rules data */
  rules?: Rule[];
}

/**
 * Format domain effects for display
 */
function formatDomainEffects(effects: DomainEffect[], options: { json: boolean }): string {
  if (options.json) {
    return formatOutput({ domainEffects: effects, count: effects.length }, { json: true });
  }

  if (effects.length === 0) {
    return "No domain effects produced";
  }

  const rows = effects.map((effect) => ({
    Domain: effect.domain,
    Action: effect.action,
    Rule: effect.ruleName,
    Location: `${effect.filePath}:${effect.startLine}`,
  }));

  return formatTable(rows, { columns: ["Domain", "Action", "Rule", "Location"] });
}

/**
 * Format rule statistics for display
 */
function formatRuleStats(result: RuleEngineResult, options: { json: boolean }): string {
  if (options.json) {
    const stats: Record<string, number> = {};
    for (const [ruleId, count] of result.ruleStats) {
      stats[ruleId] = count;
    }
    return formatOutput(
      {
        matchedCount: result.matchedCount,
        unmatchedCount: result.unmatchedCount,
        processTimeMs: result.processTimeMs,
        ruleStats: stats,
      },
      { json: true }
    );
  }

  const lines = [
    "Rules Engine Statistics",
    `  Matched: ${result.matchedCount}`,
    `  Unmatched: ${result.unmatchedCount}`,
    `  Process Time: ${result.processTimeMs}ms`,
    "",
    "Rule Matches:",
  ];

  const sortedStats = [...result.ruleStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0);

  if (sortedStats.length === 0) {
    lines.push("  No rules matched");
  } else {
    for (const [ruleId, count] of sortedStats) {
      lines.push(`  ${ruleId}: ${count}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format rules list for display
 */
function formatRulesList(rules: Rule[], options: { json: boolean }): string {
  if (options.json) {
    return formatOutput({ rules, count: rules.length }, { json: true });
  }

  if (rules.length === 0) {
    return "No rules found";
  }

  const rows = rules.map((rule) => ({
    ID: rule.id,
    Name: rule.name,
    Domain: rule.emit.domain,
    Action: rule.emit.action,
    Priority: String(rule.priority ?? 0),
  }));

  return formatTable(rows, { columns: ["ID", "Name", "Domain", "Action", "Priority"] });
}

/**
 * Run rules command - process effects through rules engine
 */
export async function rulesRunCommand(options: RulesRunOptions): Promise<RulesRunResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Query effects from seeds
    let effectsResult: QueryResult<unknown>;

    const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 1000";

    if (options.hub) {
      // Hub mode: query all registered repos
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();
        const packagePaths = repos.map((r) => r.localPath);

        if (packagePaths.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ domainEffects: [], count: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
            domainEffects: [],
          };
        }

        const sql = `SELECT * FROM {effects} ${limitClause}`;
        effectsResult = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      // Package mode: query single package
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());
      const seedReader = createSeedReader(pool, pkgPath);

      const sql = `SELECT * FROM effects ${limitClause}`;
      effectsResult = await seedReader.querySeeds(sql);
    }

    // Run rules engine on effects
    const engine = createRuleEngine({ rules: builtinRules });
    const result = engine.process(effectsResult.rows as CodeEffect[]);

    // Filter by domain if requested
    let domainEffects = result.domainEffects;
    if (options.domain) {
      domainEffects = domainEffects.filter(
        (e) => e.domain.toLowerCase() === options.domain?.toLowerCase()
      );
    }

    const output = formatDomainEffects(domainEffects, { json: options.json ?? false });

    // Convert Map to Record for result
    const ruleStats: Record<string, number> = {};
    for (const [ruleId, count] of result.ruleStats) {
      ruleStats[ruleId] = count;
    }

    return {
      success: true,
      output,
      count: domainEffects.length,
      timeMs: Date.now() - startTime,
      domainEffects,
      ruleStats,
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
 * Run rules stats command - show rule match statistics
 */
export async function rulesStatsCommand(options: RulesRunOptions): Promise<RulesRunResult> {
  const startTime = Date.now();
  let pool: DuckDBPool | null = null;

  try {
    pool = new DuckDBPool({ memoryLimit: "256MB" });
    await pool.initialize();

    // Query effects from seeds
    let effectsResult: QueryResult<unknown>;

    const limitClause = options.limit ? `LIMIT ${options.limit}` : "";

    if (options.hub) {
      const hubDir = options.hubDir || getDefaultHubDir();
      const hub = createCentralHub({ hubDir, readOnly: true });

      try {
        await hub.init();
        const repos = await hub.listRepos();
        const packagePaths = repos.map((r) => r.localPath);

        if (packagePaths.length === 0) {
          return {
            success: true,
            output: options.json
              ? formatOutput({ matchedCount: 0, unmatchedCount: 0 }, { json: true })
              : "No repositories registered in hub",
            count: 0,
            timeMs: Date.now() - startTime,
          };
        }

        const sql = `SELECT * FROM {effects} ${limitClause}`;
        effectsResult = await queryMultiplePackages(pool, packagePaths, sql);
      } finally {
        await hub.close();
      }
    } else {
      const pkgPath = options.packagePath
        ? path.resolve(options.packagePath)
        : path.resolve(process.cwd());
      const seedReader = createSeedReader(pool, pkgPath);

      const sql = `SELECT * FROM effects ${limitClause}`;
      effectsResult = await seedReader.querySeeds(sql);
    }

    // Run rules engine
    const engine = createRuleEngine({ rules: builtinRules });
    const result = engine.process(effectsResult.rows as CodeEffect[]);

    const output = formatRuleStats(result, { json: options.json ?? false });

    // Convert Map to Record
    const ruleStats: Record<string, number> = {};
    for (const [ruleId, count] of result.ruleStats) {
      ruleStats[ruleId] = count;
    }

    return {
      success: true,
      output,
      count: result.matchedCount,
      timeMs: Date.now() - startTime,
      ruleStats,
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
 * Run rules list command - list available rules
 */
export function rulesListCommand(options: RulesListOptions): RulesListResult {
  let rules: Rule[] = [...builtinRules];

  // Filter by domain
  if (options.domain) {
    rules = getRulesByDomain(options.domain);
  }

  // Filter by provider
  if (options.provider) {
    rules = getRulesByProvider(options.provider);
  }

  const output = formatRulesList(rules, { json: options.json ?? false });

  return {
    success: true,
    output,
    count: rules.length,
    rules,
  };
}

/**
 * Register the rules command with the CLI program
 */
export function registerRulesCommand(program: Command): void {
  const rulesCmd = program
    .command("rules")
    .description("Run rules engine on effects to produce domain effects");

  // Default rules run command
  rulesCmd
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-d, --domain <domain>", "Filter by domain (e.g., Payment, Auth)")
    .option("-l, --limit <count>", "Maximum effects to process", "1000")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await rulesRunCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        hub: options.hub,
        hubDir: options.hubDir,
        domain: options.domain,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });

  // rules list subcommand
  rulesCmd
    .command("list")
    .description("List available builtin rules")
    .option("-d, --domain <domain>", "Filter by domain")
    .option("--provider <provider>", "Filter by provider")
    .option("--json", "Output as JSON")
    .action((options) => {
      const result = rulesListCommand({
        domain: options.domain,
        provider: options.provider,
        json: options.json,
      });

      console.log(result.output);
    });

  // rules stats subcommand
  rulesCmd
    .command("stats")
    .description("Show rule match statistics")
    .option("-p, --package <path>", "Package path", process.cwd())
    .option("--hub", "Query all registered repos via Hub")
    .option("--hub-dir <path>", "Hub directory", getDefaultHubDir())
    .option("-l, --limit <count>", "Maximum effects to process")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const result = await rulesStatsCommand({
        packagePath: options.package ? path.resolve(options.package) : undefined,
        hub: options.hub,
        hubDir: options.hubDir,
        limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
        json: options.json,
      });

      console.log(result.output);
      if (!result.success) {
        process.exit(1);
      }
    });
}
