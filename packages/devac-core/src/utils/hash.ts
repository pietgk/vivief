/**
 * Hash Utilities
 *
 * Content hashing for file change detection.
 * Based on DevAC v2.0 spec Section 8.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

/**
 * Hash algorithm to use (SHA-256 per spec)
 */
const HASH_ALGORITHM = "sha256";

/**
 * Compute SHA-256 hash of a string
 *
 * @param content - String content to hash
 * @returns Hex-encoded hash
 */
export function computeStringHash(content: string): string {
  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(content, "utf8");
  return hash.digest("hex");
}

/**
 * Compute SHA-256 hash of a Buffer
 *
 * @param buffer - Buffer to hash
 * @returns Hex-encoded hash
 */
export function computeBufferHash(buffer: Buffer): string {
  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(buffer);
  return hash.digest("hex");
}

/**
 * Compute SHA-256 hash of a file
 *
 * @param filePath - Path to file
 * @returns Hex-encoded hash
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return computeBufferHash(content);
}

/**
 * Compute hashes for multiple files
 *
 * @param filePaths - Array of file paths
 * @returns Map of file path to hash
 */
export async function computeFileHashes(filePaths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const hash = await computeFileHash(filePath);
        results.set(filePath, hash);
      } catch {
        // Skip files that can't be read
      }
    })
  );

  return results;
}

/**
 * Generate a scope hash for entity ID generation
 *
 * Per spec Section 4.4:
 * scope_hash = sha256(filePath + scopedName + kind).slice(0, 8)
 *
 * @param filePath - Relative file path
 * @param scopedName - Scoped name of the symbol
 * @param kind - Node kind
 * @returns 8-character hex hash
 */
export function generateScopeHash(filePath: string, scopedName: string, kind: string): string {
  // Normalize inputs per spec
  const normalized = [filePath, scopedName, kind]
    .map((s) => s.normalize("NFC").trim())
    .join("\x00"); // Use null separator to avoid collisions

  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(normalized, "utf8");
  return hash.digest("hex").slice(0, 8);
}

/**
 * Check if a file has changed based on hash
 *
 * @param filePath - Path to file
 * @param expectedHash - Expected hash value
 * @returns true if file has changed (hash doesn't match)
 */
export async function hasFileChanged(filePath: string, expectedHash: string): Promise<boolean> {
  try {
    const currentHash = await computeFileHash(filePath);
    return currentHash !== expectedHash;
  } catch {
    // File doesn't exist or can't be read - consider it changed
    return true;
  }
}

/**
 * Find changed files by comparing current hashes to stored hashes
 *
 * @param filePaths - Files to check
 * @param storedHashes - Map of file path to stored hash
 * @returns Object with changed, added, and unchanged file lists
 */
export async function findChangedFiles(
  filePaths: string[],
  storedHashes: Map<string, string>
): Promise<{
  changed: string[];
  added: string[];
  removed: string[];
  unchanged: string[];
}> {
  const currentHashes = await computeFileHashes(filePaths);

  const changed: string[] = [];
  const added: string[] = [];
  const unchanged: string[] = [];

  for (const filePath of filePaths) {
    const currentHash = currentHashes.get(filePath);
    const storedHash = storedHashes.get(filePath);

    if (!currentHash) {
      // File couldn't be read, skip
      continue;
    }

    if (!storedHash) {
      added.push(filePath);
    } else if (currentHash !== storedHash) {
      changed.push(filePath);
    } else {
      unchanged.push(filePath);
    }
  }

  // Find removed files (in stored but not in current)
  const currentSet = new Set(filePaths);
  const removed: string[] = [];
  for (const filePath of storedHashes.keys()) {
    if (!currentSet.has(filePath)) {
      removed.push(filePath);
    }
  }

  return { changed, added, removed, unchanged };
}

/**
 * Generate a short hash for use in temporary file names
 *
 * @param length - Length of hash (default: 8)
 * @returns Random hex string
 */
export function generateRandomHash(length = 8): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

/**
 * Combine multiple hashes into a single hash
 *
 * Useful for creating a composite hash of multiple files.
 *
 * @param hashes - Array of hash strings
 * @returns Combined hash
 */
export function combineHashes(hashes: string[]): string {
  const hash = crypto.createHash(HASH_ALGORITHM);
  for (const h of hashes.sort()) {
    hash.update(h);
  }
  return hash.digest("hex");
}
