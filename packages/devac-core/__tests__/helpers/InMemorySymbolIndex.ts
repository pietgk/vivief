/**
 * In-memory symbol index implementation for testing
 *
 * This is a simple implementation suitable for unit tests.
 * The storage layer provides a more sophisticated implementation backed
 * by DuckDB for cross-repo queries in production.
 */

import { formatCanonicalURI, formatEntityID } from "../../src/uri/formatter.js";
import type {
  CanonicalURI,
  EntityID,
  SymbolIndex,
  SymbolIndexEntry,
  URIContext,
} from "../../src/uri/types.js";

export class InMemorySymbolIndex implements SymbolIndex {
  private readonly entries: SymbolIndexEntry[] = [];
  private readonly byEntityId = new Map<string, SymbolIndexEntry>();
  private readonly byURIString = new Map<string, SymbolIndexEntry>();
  private readonly byFile = new Map<string, SymbolIndexEntry[]>();
  private readonly byName = new Map<string, SymbolIndexEntry[]>();

  /**
   * Add an entry to the index
   */
  add(entry: SymbolIndexEntry): void {
    this.entries.push(entry);

    // Index by entity ID
    const entityIdStr = formatEntityID(entry.entityId);
    this.byEntityId.set(entityIdStr, entry);

    // Index by URI
    const uriStr = formatCanonicalURI(entry.uri);
    this.byURIString.set(uriStr, entry);

    // Index by file
    const fileKey = this.getFileKey(entry.uri);
    const fileEntries = this.byFile.get(fileKey) || [];
    fileEntries.push(entry);
    this.byFile.set(fileKey, fileEntries);

    // Index by name
    const nameEntries = this.byName.get(entry.name) || [];
    nameEntries.push(entry);
    this.byName.set(entry.name, nameEntries);
  }

  /**
   * Resolve a canonical URI to an entity ID
   */
  resolveURI(uri: CanonicalURI): EntityID | null {
    const uriStr = formatCanonicalURI(uri);
    const entry = this.byURIString.get(uriStr);
    return entry?.entityId || null;
  }

  /**
   * Get the canonical URI for an entity ID
   */
  getURI(entityId: EntityID): CanonicalURI | null {
    const entityIdStr = formatEntityID(entityId);
    const entry = this.byEntityId.get(entityIdStr);
    return entry?.uri || null;
  }

  /**
   * Find symbols by name pattern
   */
  findByName(pattern: string, _context?: URIContext): SymbolIndexEntry[] {
    // Simple pattern matching with * wildcard
    if (!pattern.includes("*")) {
      return this.byName.get(pattern) || [];
    }

    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);

    const results: SymbolIndexEntry[] = [];
    for (const [name, entries] of this.byName) {
      if (regex.test(name)) {
        results.push(...entries);
      }
    }

    return results;
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(uri: CanonicalURI): SymbolIndexEntry[] {
    const fileKey = this.getFileKey(uri);
    return this.byFile.get(fileKey) || [];
  }

  /**
   * Get all entries
   */
  getAll(): SymbolIndexEntry[] {
    return [...this.entries];
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.entries.length = 0;
    this.byEntityId.clear();
    this.byURIString.clear();
    this.byFile.clear();
    this.byName.clear();
  }

  private getFileKey(uri: CanonicalURI): string {
    return `${uri.repo}/${uri.package}/${uri.file || ""}`;
  }
}
