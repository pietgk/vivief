#!/usr/bin/env node

/**
 * DevAC Eval CLI - Command line interface for the evaluation framework
 */

import { Command } from "commander";
import { VERSION } from "../version.js";
import { compareCommand } from "./commands/compare.js";
import { listCommand } from "./commands/list.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";
import { validateCommand } from "./commands/validate.js";

const program = new Command();

program
  .name("devac-eval")
  .description("DevAC Answer Quality Evaluation Framework")
  .version(VERSION);

// Run evaluation
program
  .command("run")
  .description("Run evaluation on a benchmark")
  .requiredOption("-b, --benchmark <name>", "Benchmark to run")
  .option("-m, --modes <modes>", "Modes to run (baseline,enhanced)", "baseline,enhanced")
  .option("-q, --questions <ids>", "Specific question IDs (comma-separated)")
  .option("--model <model>", "Model to use (sonnet, haiku, opus)")
  .option("-o, --output <dir>", "Output directory", "./results")
  .option("-v, --verbose", "Verbose output")
  .action(runCommand);

// Generate report
program
  .command("report <runId>")
  .description("Generate a report for an evaluation run")
  .option("-f, --format <format>", "Output format (markdown, json, table)", "markdown")
  .option("-o, --output <file>", "Output file (stdout if not specified)")
  .option("--results-dir <dir>", "Results directory", "./results")
  .action(reportCommand);

// Compare runs
program
  .command("compare <runId1> <runId2>")
  .description("Compare two evaluation runs")
  .option("-f, --format <format>", "Output format (markdown, json, table)", "markdown")
  .option("-o, --output <file>", "Output file (stdout if not specified)")
  .option("--results-dir <dir>", "Results directory", "./results")
  .action(compareCommand);

// List resources
program
  .command("list <type>")
  .description("List benchmarks, questions, or runs")
  .option("-b, --benchmark <name>", "Filter by benchmark (for questions)")
  .option("-l, --limit <n>", "Limit results", "10")
  .option("--results-dir <dir>", "Results directory", "./results")
  .action(listCommand);

// Validate questions
program
  .command("validate <path>")
  .description("Validate a benchmark questions file")
  .option("-f, --format <format>", "Output format (text, json)", "text")
  .action(validateCommand);

program.parse();
