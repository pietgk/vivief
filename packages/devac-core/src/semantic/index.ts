/**
 * Semantic Resolution Module
 *
 * Provides compiler-grade cross-file symbol resolution.
 * This is Pass 2 of the two-pass architecture:
 *
 * Pass 1 (Structural): Fast per-file parsing with Babel/ast/tree-sitter
 *   - Extracts nodes, edges, and unresolved external_refs
 *   - Speed: <50ms per file, parallelizable
 *
 * Pass 2 (Semantic): Cross-file resolution with ts-morph/Pyright/Roslyn
 *   - Resolves external_refs to actual entity_ids
 *   - Speed: 50-200ms per file, batched by package
 *
 * @module semantic
 */

export * from "./types.js";
export * from "./typescript-semantic.js";

import type { SemanticConfig, SemanticLanguage, SemanticResolver } from "./types.js";
import { defaultSemanticConfig } from "./types.js";
import { TypeScriptSemanticResolver } from "./typescript-semantic.js";

/**
 * Semantic Resolver Factory
 *
 * Creates and manages semantic resolvers for different languages.
 * Provides unified access to all language resolvers.
 */
export class SemanticResolverFactory {
  private resolvers = new Map<SemanticLanguage, SemanticResolver>();
  private config: SemanticConfig;

  constructor(config: Partial<SemanticConfig> = {}) {
    this.config = {
      ...defaultSemanticConfig,
      ...config,
      typescript: { ...defaultSemanticConfig.typescript, ...config.typescript },
      python: { ...defaultSemanticConfig.python, ...config.python },
      csharp: { ...defaultSemanticConfig.csharp, ...config.csharp },
    };

    this.initializeResolvers();
  }

  /**
   * Initialize all enabled resolvers
   */
  private initializeResolvers(): void {
    // TypeScript resolver (always available when enabled)
    if (this.config.typescript.enabled) {
      this.resolvers.set("typescript", new TypeScriptSemanticResolver(this.config.typescript));
    }

    // Python resolver (Pyright-based, Phase 2)
    // TODO: Implement PythonSemanticResolver

    // C# resolver (Roslyn-based, Phase 3)
    // TODO: Implement CSharpSemanticResolver
  }

  /**
   * Get resolver for a specific language
   */
  getResolver(language: SemanticLanguage): SemanticResolver | undefined {
    return this.resolvers.get(language);
  }

  /**
   * Get all available resolvers
   */
  getAvailableResolvers(): SemanticResolver[] {
    return Array.from(this.resolvers.values());
  }

  /**
   * Check if a resolver is available for a language
   */
  async isResolverAvailable(language: SemanticLanguage): Promise<boolean> {
    const resolver = this.resolvers.get(language);
    if (!resolver) {
      return false;
    }
    return resolver.isAvailable();
  }

  /**
   * Get resolver for a file based on extension
   */
  getResolverForFile(filePath: string): SemanticResolver | undefined {
    const ext = filePath.split(".").pop()?.toLowerCase();

    switch (ext) {
      case "ts":
      case "tsx":
      case "js":
      case "jsx":
      case "mts":
      case "cts":
      case "mjs":
      case "cjs":
        return this.resolvers.get("typescript");

      case "py":
      case "pyi":
        return this.resolvers.get("python");

      case "cs":
        return this.resolvers.get("csharp");

      default:
        return undefined;
    }
  }

  /**
   * Detect primary language of a package
   */
  detectPackageLanguage(packagePath: string): SemanticLanguage | undefined {
    // Check for language-specific config files
    const fs = require("node:fs");
    const path = require("node:path");

    // TypeScript indicators
    if (
      fs.existsSync(path.join(packagePath, "tsconfig.json")) ||
      fs.existsSync(path.join(packagePath, "package.json"))
    ) {
      return "typescript";
    }

    // Python indicators
    if (
      fs.existsSync(path.join(packagePath, "pyproject.toml")) ||
      fs.existsSync(path.join(packagePath, "setup.py")) ||
      fs.existsSync(path.join(packagePath, "requirements.txt"))
    ) {
      return "python";
    }

    // C# indicators
    if (fs.existsSync(path.join(packagePath, "*.csproj"))) {
      return "csharp";
    }

    return undefined;
  }

  /**
   * Clear caches for a specific package across all resolvers
   */
  clearPackageCache(packagePath: string): void {
    for (const resolver of this.resolvers.values()) {
      resolver.clearCache(packagePath);
    }
  }

  /**
   * Clear all caches across all resolvers
   */
  clearAllCaches(): void {
    for (const resolver of this.resolvers.values()) {
      resolver.clearCache("");
    }
  }
}

/**
 * Singleton factory instance for convenience
 */
let defaultFactory: SemanticResolverFactory | undefined;

/**
 * Get the default semantic resolver factory
 */
export function getSemanticResolverFactory(
  config?: Partial<SemanticConfig>
): SemanticResolverFactory {
  if (!defaultFactory || config) {
    defaultFactory = new SemanticResolverFactory(config);
  }
  return defaultFactory;
}

/**
 * Get a semantic resolver for a specific language
 */
export function getSemanticResolver(language: SemanticLanguage): SemanticResolver | undefined {
  return getSemanticResolverFactory().getResolver(language);
}

/**
 * Get a semantic resolver for a file based on extension
 */
export function getSemanticResolverForFile(filePath: string): SemanticResolver | undefined {
  return getSemanticResolverFactory().getResolverForFile(filePath);
}

/**
 * Reset the default factory (useful for testing)
 */
export function resetSemanticResolverFactory(): void {
  defaultFactory = undefined;
}
