/**
 * Doc Metadata - Parse and generate documentation metadata
 *
 * Handles the metadata embedded in generated documentation files
 * to track seed hashes, generation timestamps, and verification status.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import { readFile, stat } from "node:fs/promises";

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata embedded in generated documentation files
 */
export interface DocMetadata {
  /** SHA-256 hash of the seed files used to generate this doc */
  seedHash: string;
  /** ISO 8601 timestamp when the doc was generated */
  generatedAt: string;
  /** Generator identifier (e.g., "doc-sync@1.0.0") */
  generator: string;
  /** Whether the effects have been verified via `effects verify` */
  verified: boolean;
  /** ISO 8601 timestamp when verification was last done */
  verifiedAt?: string;
  /** Package path that generated this doc */
  packagePath?: string;
}

/**
 * Options for generating metadata
 */
export interface GenerateMetadataOptions {
  /** SHA-256 hash of the seed files */
  seedHash: string;
  /** Whether effects have been verified */
  verified?: boolean;
  /** Timestamp of verification */
  verifiedAt?: string;
  /** Package path */
  packagePath?: string;
  /** Generator version override */
  generatorVersion?: string;
}

/**
 * Result of checking if a doc needs regeneration
 */
export interface RegenerationCheckResult {
  /** Whether the doc needs regeneration */
  needsRegeneration: boolean;
  /** Reason for regeneration */
  reason?: string;
  /** Current metadata if available */
  currentMetadata?: DocMetadata;
}

// ============================================================================
// Constants
// ============================================================================

/** Default generator name */
const GENERATOR_NAME = "doc-sync";

/** Generator version (should match package version) */
const GENERATOR_VERSION = "1.0.0";

/** Metadata comment markers */
const METADATA_START = "<!--";
const METADATA_END = "-->";

/** Metadata key prefix */
const METADATA_PREFIX = "devac:";

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse metadata from document content
 *
 * Looks for an HTML comment block at the start of the file with devac: prefixed keys.
 *
 * @param content - Document content
 * @returns Parsed metadata or null if not found
 */
export function parseDocMetadata(content: string): DocMetadata | null {
  // Find the first HTML comment
  const commentStart = content.indexOf(METADATA_START);
  if (commentStart === -1) {
    return null;
  }

  const commentEnd = content.indexOf(METADATA_END, commentStart);
  if (commentEnd === -1) {
    return null;
  }

  const commentContent = content.slice(commentStart + METADATA_START.length, commentEnd);

  // Parse key-value pairs
  const metadata: Partial<DocMetadata> = {};
  const lines = commentContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(METADATA_PREFIX)) {
      continue;
    }

    const colonIndex = trimmed.indexOf(":", METADATA_PREFIX.length);
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(METADATA_PREFIX.length, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    switch (key) {
      case "seed-hash":
        metadata.seedHash = value;
        break;
      case "generated-at":
        metadata.generatedAt = value;
        break;
      case "generator":
        metadata.generator = value;
        break;
      case "verified":
        metadata.verified = value.toLowerCase() === "true";
        break;
      case "verified-at":
        metadata.verifiedAt = value;
        break;
      case "package-path":
        metadata.packagePath = value;
        break;
    }
  }

  // Validate required fields
  if (!metadata.seedHash || !metadata.generatedAt || !metadata.generator) {
    return null;
  }

  return {
    seedHash: metadata.seedHash,
    generatedAt: metadata.generatedAt,
    generator: metadata.generator,
    verified: metadata.verified ?? false,
    verifiedAt: metadata.verifiedAt,
    packagePath: metadata.packagePath,
  };
}

/**
 * Parse metadata from a file
 *
 * @param filePath - Path to the document file
 * @returns Parsed metadata or null if not found
 */
export async function parseDocMetadataFromFile(filePath: string): Promise<DocMetadata | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return parseDocMetadata(content);
  } catch {
    return null;
  }
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate metadata comment block
 *
 * @param options - Metadata options
 * @returns HTML comment block with metadata
 */
export function generateDocMetadata(options: GenerateMetadataOptions): string {
  const {
    seedHash,
    verified = false,
    verifiedAt,
    packagePath,
    generatorVersion = GENERATOR_VERSION,
  } = options;

  const generatedAt = new Date().toISOString();
  const generator = `${GENERATOR_NAME}@${generatorVersion}`;

  const lines = [
    METADATA_START,
    `  ${METADATA_PREFIX}seed-hash: ${seedHash}`,
    `  ${METADATA_PREFIX}generated-at: ${generatedAt}`,
    `  ${METADATA_PREFIX}generator: ${generator}`,
    `  ${METADATA_PREFIX}verified: ${verified}`,
  ];

  if (verifiedAt) {
    lines.push(`  ${METADATA_PREFIX}verified-at: ${verifiedAt}`);
  }

  if (packagePath) {
    lines.push(`  ${METADATA_PREFIX}package-path: ${packagePath}`);
  }

  lines.push(METADATA_END);

  return lines.join("\n");
}

/**
 * Generate metadata for markdown files
 *
 * Adds a newline after the comment for proper markdown rendering.
 *
 * @param options - Metadata options
 * @returns Metadata block with trailing newline
 */
export function generateDocMetadataForMarkdown(options: GenerateMetadataOptions): string {
  return `${generateDocMetadata(options)}\n\n`;
}

/**
 * Generate metadata for PlantUML files
 *
 * Uses PlantUML comment syntax (single quotes).
 *
 * @param options - Metadata options
 * @returns PlantUML comment block with metadata
 */
export function generateDocMetadataForPlantUML(options: GenerateMetadataOptions): string {
  const {
    seedHash,
    verified = false,
    verifiedAt,
    packagePath,
    generatorVersion = GENERATOR_VERSION,
  } = options;

  const generatedAt = new Date().toISOString();
  const generator = `${GENERATOR_NAME}@${generatorVersion}`;

  const lines = [
    "' DevAC Generated Documentation",
    `' ${METADATA_PREFIX}seed-hash: ${seedHash}`,
    `' ${METADATA_PREFIX}generated-at: ${generatedAt}`,
    `' ${METADATA_PREFIX}generator: ${generator}`,
    `' ${METADATA_PREFIX}verified: ${verified}`,
  ];

  if (verifiedAt) {
    lines.push(`' ${METADATA_PREFIX}verified-at: ${verifiedAt}`);
  }

  if (packagePath) {
    lines.push(`' ${METADATA_PREFIX}package-path: ${packagePath}`);
  }

  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Check if a document needs regeneration
 *
 * @param docPath - Path to the document file
 * @param currentSeedHash - Current seed hash
 * @returns Check result with reason
 */
export async function docNeedsRegeneration(
  docPath: string,
  currentSeedHash: string
): Promise<RegenerationCheckResult> {
  // Check if file exists
  try {
    const fileStat = await stat(docPath);
    if (!fileStat.isFile()) {
      return {
        needsRegeneration: true,
        reason: "Document does not exist",
      };
    }
  } catch {
    return {
      needsRegeneration: true,
      reason: "Document does not exist",
    };
  }

  // Parse existing metadata
  const metadata = await parseDocMetadataFromFile(docPath);
  if (!metadata) {
    return {
      needsRegeneration: true,
      reason: "Document has no metadata",
    };
  }

  // Compare seed hashes
  if (metadata.seedHash !== currentSeedHash) {
    return {
      needsRegeneration: true,
      reason: "Seed hash changed",
      currentMetadata: metadata,
    };
  }

  return {
    needsRegeneration: false,
    currentMetadata: metadata,
  };
}

/**
 * Update document content with new metadata
 *
 * Replaces existing metadata block or prepends if none exists.
 *
 * @param content - Current document content
 * @param options - New metadata options
 * @returns Updated content with new metadata
 */
export function updateDocMetadata(content: string, options: GenerateMetadataOptions): string {
  const newMetadata = generateDocMetadataForMarkdown(options);

  // Check if there's an existing metadata block
  const commentStart = content.indexOf(METADATA_START);
  if (commentStart === -1) {
    // No existing metadata, prepend
    return newMetadata + content;
  }

  const commentEnd = content.indexOf(METADATA_END, commentStart);
  if (commentEnd === -1) {
    // Malformed comment, prepend
    return newMetadata + content;
  }

  // Find where content starts after metadata
  let contentStart = commentEnd + METADATA_END.length;

  // Skip any whitespace/newlines after the comment
  while (
    contentStart < content.length &&
    (content[contentStart] === "\n" || content[contentStart] === "\r")
  ) {
    contentStart++;
  }

  // Replace metadata
  return newMetadata + content.slice(contentStart);
}

/**
 * Strip metadata from document content
 *
 * @param content - Document content with metadata
 * @returns Content without metadata block
 */
export function stripDocMetadata(content: string): string {
  const commentStart = content.indexOf(METADATA_START);
  if (commentStart === -1) {
    return content;
  }

  const commentEnd = content.indexOf(METADATA_END, commentStart);
  if (commentEnd === -1) {
    return content;
  }

  // Find where content starts after metadata
  let contentStart = commentEnd + METADATA_END.length;

  // Skip any whitespace/newlines after the comment
  while (
    contentStart < content.length &&
    (content[contentStart] === "\n" || content[contentStart] === "\r")
  ) {
    contentStart++;
  }

  // Return content without metadata
  return content.slice(0, commentStart) + content.slice(contentStart);
}
