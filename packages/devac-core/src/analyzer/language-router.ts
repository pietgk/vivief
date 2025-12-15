/**
 * Language Router
 *
 * Routes files to appropriate language parsers based on file extension.
 * Based on DevAC v2.0 spec Section 9.
 */

import * as path from "node:path";
import type { LanguageParser, ParserFactory } from "../parsers/parser-interface.js";

/**
 * Language router for directing files to appropriate parsers
 */
export class LanguageRouter {
  private parsers: Map<string, LanguageParser> = new Map();
  private extensionMap: Map<string, string> = new Map();
  private factories: Map<string, ParserFactory> = new Map();

  /**
   * Register a parser for a language
   *
   * @param parser - Parser instance to register
   */
  registerParser(parser: LanguageParser): void {
    this.parsers.set(parser.language, parser);

    for (const ext of parser.extensions) {
      const normalizedExt = this.normalizeExtension(ext);
      this.extensionMap.set(normalizedExt, parser.language);
    }
  }

  /**
   * Register a parser factory (lazy initialization)
   *
   * @param language - Language identifier
   * @param extensions - File extensions
   * @param factory - Factory function to create parser
   */
  registerParserFactory(language: string, extensions: string[], factory: ParserFactory): void {
    this.factories.set(language, factory);

    for (const ext of extensions) {
      const normalizedExt = this.normalizeExtension(ext);
      this.extensionMap.set(normalizedExt, language);
    }
  }

  /**
   * Get the parser for a file
   *
   * @param filePath - File path
   * @returns Parser instance or null if no parser handles this file type
   */
  getParser(filePath: string): LanguageParser | null {
    const ext = this.normalizeExtension(path.extname(filePath));
    const language = this.extensionMap.get(ext);

    if (!language) {
      return null;
    }

    // Check if parser is already instantiated
    let parser = this.parsers.get(language);

    if (!parser) {
      // Try to create from factory
      const factory = this.factories.get(language);
      if (factory) {
        parser = factory();
        this.parsers.set(language, parser);
      }
    }

    return parser ?? null;
  }

  /**
   * Check if a file can be parsed
   *
   * @param filePath - File path to check
   * @returns true if a parser exists for this file type
   */
  canParse(filePath: string): boolean {
    const ext = this.normalizeExtension(path.extname(filePath));
    return this.extensionMap.has(ext);
  }

  /**
   * Get the language for a file
   *
   * @param filePath - File path
   * @returns Language identifier or null
   */
  getLanguage(filePath: string): string | null {
    const ext = this.normalizeExtension(path.extname(filePath));
    return this.extensionMap.get(ext) ?? null;
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Get all registered languages
   */
  getRegisteredLanguages(): string[] {
    const languages = new Set<string>();
    for (const lang of this.parsers.keys()) {
      languages.add(lang);
    }
    for (const lang of this.factories.keys()) {
      languages.add(lang);
    }
    return Array.from(languages);
  }

  /**
   * Get parser by language name
   *
   * @param language - Language identifier
   * @returns Parser instance or null
   */
  getParserByLanguage(language: string): LanguageParser | null {
    let parser = this.parsers.get(language);

    if (!parser) {
      const factory = this.factories.get(language);
      if (factory) {
        parser = factory();
        this.parsers.set(language, parser);
      }
    }

    return parser ?? null;
  }

  /**
   * Normalize file extension (lowercase with leading dot)
   */
  private normalizeExtension(ext: string): string {
    const normalized = ext.toLowerCase();
    return normalized.startsWith(".") ? normalized : `.${normalized}`;
  }

  /**
   * Get statistics about registered parsers
   */
  getStats(): {
    languages: number;
    extensions: number;
    instantiated: number;
  } {
    return {
      languages: this.getRegisteredLanguages().length,
      extensions: this.extensionMap.size,
      instantiated: this.parsers.size,
    };
  }

  /**
   * Clear all registered parsers
   */
  clear(): void {
    this.parsers.clear();
    this.extensionMap.clear();
    this.factories.clear();
  }
}

/**
 * Default file extension to language mapping
 */
export const DEFAULT_EXTENSION_MAP: Record<string, string> = {
  // TypeScript
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",

  // JavaScript
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",

  // Python
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",

  // C#
  ".cs": "csharp",

  // Java
  ".java": "java",

  // Go
  ".go": "go",

  // Rust
  ".rs": "rust",

  // Ruby
  ".rb": "ruby",

  // PHP
  ".php": "php",

  // Swift
  ".swift": "swift",

  // Kotlin
  ".kt": "kotlin",
  ".kts": "kotlin",

  // Scala
  ".scala": "scala",

  // C/C++
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
};

/**
 * Create a default language router
 */
export function createLanguageRouter(): LanguageRouter {
  return new LanguageRouter();
}

/**
 * Singleton router instance
 */
let defaultRouter: LanguageRouter | null = null;

/**
 * Get the default language router instance
 */
export function getDefaultRouter(): LanguageRouter {
  if (!defaultRouter) {
    defaultRouter = createLanguageRouter();
  }
  return defaultRouter;
}

/**
 * Reset the default router (for testing)
 */
export function resetDefaultRouter(): void {
  if (defaultRouter) {
    defaultRouter.clear();
  }
  defaultRouter = null;
}
