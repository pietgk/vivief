/**
 * Effects Generator - Generate effects documentation with metadata
 *
 * Extends the CLI's effects init functionality with proper metadata headers
 * for change detection and verification tracking.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import { generateDocMetadataForMarkdown } from "./doc-metadata.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Store pattern detected in the codebase
 */
export interface StorePattern {
  /** Function/method call pattern (e.g., "db.insert") */
  pattern: string;
  /** Number of occurrences */
  count: number;
}

/**
 * Retrieve pattern detected in the codebase
 */
export interface RetrievePattern {
  /** Function/method call pattern (e.g., "db.query") */
  pattern: string;
  /** Number of occurrences */
  count: number;
}

/**
 * External call pattern detected in the codebase
 */
export interface ExternalPattern {
  /** Function/method call pattern (e.g., "axios.get") */
  pattern: string;
  /** Number of occurrences */
  count: number;
  /** Module name if available */
  module: string | null;
}

/**
 * Other patterns not categorized
 */
export interface OtherPattern {
  /** Function/method call pattern */
  pattern: string;
  /** Number of occurrences */
  count: number;
  /** Whether this is a method call */
  isMethod: boolean;
  /** Whether this is an async call */
  isAsync: boolean;
}

/**
 * Input data for generating effects documentation
 */
export interface EffectsDocData {
  /** Package name */
  packageName: string;
  /** Store operation patterns */
  storePatterns: StorePattern[];
  /** Retrieve operation patterns */
  retrievePatterns: RetrievePattern[];
  /** External call patterns */
  externalPatterns: ExternalPattern[];
  /** Other uncategorized patterns */
  otherPatterns: OtherPattern[];
}

/**
 * Options for generating effects documentation
 */
export interface GenerateEffectsDocOptions {
  /** Seed hash for change detection */
  seedHash: string;
  /** Whether effects have been verified */
  verified?: boolean;
  /** When verification was done */
  verifiedAt?: string;
  /** Package path */
  packagePath?: string;
  /** Maximum number of "other" patterns to include */
  maxOtherPatterns?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer operation type from pattern name
 */
function inferOperation(pattern: string, type: "store" | "retrieve"): string {
  const lower = pattern.toLowerCase();

  if (type === "store") {
    if (lower.includes("insert") || lower.includes("create") || lower.includes("add")) {
      return "insert";
    }
    if (lower.includes("update") || lower.includes("upsert")) {
      return "update";
    }
    if (lower.includes("delete") || lower.includes("remove")) {
      return "delete";
    }
    if (lower.includes("set") || lower.includes("put") || lower.includes("save")) {
      return "set";
    }
    return "write";
  }

  // retrieve
  if (lower.includes("get") || lower.includes("find") || lower.includes("fetch")) {
    return "get";
  }
  if (lower.includes("query") || lower.includes("select") || lower.includes("search")) {
    return "query";
  }
  if (lower.includes("list") || lower.includes("all")) {
    return "list";
  }
  return "read";
}

/**
 * Infer service name from module
 */
function inferService(module: string | null): string {
  if (!module) return "TODO";

  const lower = module.toLowerCase();

  // Common HTTP libraries
  if (lower.includes("axios") || lower.includes("fetch") || lower.includes("http")) {
    return "http-client";
  }

  // AWS services
  if (lower.includes("@aws-sdk") || lower.includes("aws-sdk")) {
    if (lower.includes("s3")) return "aws-s3";
    if (lower.includes("dynamodb")) return "aws-dynamodb";
    if (lower.includes("sqs")) return "aws-sqs";
    if (lower.includes("sns")) return "aws-sns";
    if (lower.includes("lambda")) return "aws-lambda";
    return "aws";
  }

  // Database clients
  if (lower.includes("mysql") || lower.includes("pg") || lower.includes("postgres")) {
    return "database";
  }
  if (lower.includes("redis") || lower.includes("memcached")) {
    return "cache";
  }
  if (lower.includes("mongodb") || lower.includes("mongoose")) {
    return "mongodb";
  }

  // Payment services
  if (lower.includes("stripe")) return "stripe";
  if (lower.includes("paypal")) return "paypal";

  // Email services
  if (lower.includes("sendgrid") || lower.includes("mailgun") || lower.includes("nodemailer")) {
    return "email";
  }

  return "external";
}

/**
 * Suggest a category for uncategorized patterns
 */
function suggestCategory(pattern: string): string {
  const lower = pattern.toLowerCase();

  // Console/logging
  if (lower.includes("console") || lower.includes("log") || lower.includes("debug")) {
    return "ignore";
  }

  // Assertions
  if (lower.includes("assert") || lower.includes("expect") || lower.includes("should")) {
    return "ignore";
  }

  // Store-like patterns
  if (
    lower.includes("save") ||
    lower.includes("write") ||
    lower.includes("set") ||
    lower.includes("put") ||
    lower.includes("insert") ||
    lower.includes("create")
  ) {
    return "store?";
  }

  // Retrieve-like patterns
  if (
    lower.includes("get") ||
    lower.includes("find") ||
    lower.includes("fetch") ||
    lower.includes("read") ||
    lower.includes("query")
  ) {
    return "retrieve?";
  }

  // Send-like patterns
  if (
    lower.includes("send") ||
    lower.includes("emit") ||
    lower.includes("publish") ||
    lower.includes("post") ||
    lower.includes("request")
  ) {
    return "send?";
  }

  return "-";
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate package effects markdown documentation with metadata
 *
 * @param data - Effects data from analysis
 * @param options - Generation options including seed hash
 * @returns Markdown content with embedded metadata
 */
export function generateEffectsDoc(
  data: EffectsDocData,
  options: GenerateEffectsDocOptions
): string {
  const { seedHash, verified = false, verifiedAt, packagePath, maxOtherPatterns = 30 } = options;

  // Generate metadata header
  const metadata = generateDocMetadataForMarkdown({
    seedHash,
    verified,
    verifiedAt,
    packagePath,
  });

  const date = new Date().toISOString().split("T")[0];
  const verifiedStatus = verified ? "✓" : "✗";

  const lines: string[] = [
    `# Package Effects: ${data.packageName}`,
    "",
    "<!--",
    "  This file defines effect mappings for this package.",
    "  Run `devac effects sync` to regenerate extraction rules.",
    "  Run `devac effects verify` to check for unmapped patterns.",
    "  Run `devac doc-sync` to regenerate after verification.",
    "  ",
    "  Review and refine the mappings below.",
    "-->",
    "",
    "## Metadata",
    `- **Package:** ${data.packageName}`,
    `- **Last Updated:** ${date}`,
    `- **Verified:** ${verifiedStatus}`,
    verified && verifiedAt ? `- **Verified At:** ${verifiedAt}` : "",
    "",
  ].filter(Boolean);

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
    for (const p of data.otherPatterns.slice(0, maxOtherPatterns)) {
      const suggested = suggestCategory(p.pattern);
      lines.push(
        `| \`${p.pattern}\` | ${p.isMethod ? "yes" : "no"} | ${p.isAsync ? "yes" : "no"} | ${p.count} | ${suggested} |`
      );
    }
    if (data.otherPatterns.length > maxOtherPatterns) {
      lines.push(`| _...and ${data.otherPatterns.length - maxOtherPatterns} more_ | | | | |`);
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

  // Prepend metadata to content
  return metadata + lines.join("\n");
}

/**
 * Generate a minimal effects doc for packages without effects
 *
 * @param packageName - Package name
 * @param options - Generation options including seed hash
 * @returns Minimal markdown content
 */
export function generateEmptyEffectsDoc(
  packageName: string,
  options: GenerateEffectsDocOptions
): string {
  const { seedHash, packagePath } = options;

  const metadata = generateDocMetadataForMarkdown({
    seedHash,
    verified: false,
    packagePath,
  });

  const date = new Date().toISOString().split("T")[0];

  const lines = [
    `# Package Effects: ${packageName}`,
    "",
    "<!--",
    "  This file defines effect mappings for this package.",
    "  No effects were detected during analysis.",
    "  Run `devac sync` first to extract effects.",
    "-->",
    "",
    "## Metadata",
    `- **Package:** ${packageName}`,
    `- **Last Updated:** ${date}`,
    "- **Verified:** ✗",
    "",
    "_No effects detected. Run `devac sync` first._",
    "",
  ];

  return metadata + lines.join("\n");
}
