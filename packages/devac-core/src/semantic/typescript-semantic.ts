/**
 * TypeScript Semantic Resolver
 *
 * Uses ts-morph for accurate cross-file symbol resolution.
 * Scoped to package level for optimal performance.
 *
 * TypeScript to Universal AST Mapping:
 * | TypeScript Construct      | Universal Kind | Notes                    |
 * |---------------------------|----------------|--------------------------|
 * | FunctionDeclaration       | function       |                          |
 * | ArrowFunctionExpression   | function       | is_arrow in properties   |
 * | MethodDeclaration         | method         |                          |
 * | ClassDeclaration          | class          |                          |
 * | InterfaceDeclaration      | interface      |                          |
 * | TypeAliasDeclaration      | type           |                          |
 * | EnumDeclaration           | enum           |                          |
 * | VariableDeclaration       | variable       | const -> constant        |
 * | PropertyDeclaration       | property       |                          |
 * | NamespaceDeclaration      | namespace      |                          |
 *
 * @module semantic/typescript-semantic
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  type ExportedDeclarations,
  Node,
  Project,
  type SourceFile,
  VariableDeclarationKind,
} from "ts-morph";

import { createEntityIdGenerator } from "../analyzer/entity-id-generator.js";
import type { NodeKind } from "../types/nodes.js";
import { detectRepoId } from "../utils/git.js";
import type {
  ExportIndex,
  ExportInfo,
  ResolutionError,
  ResolutionErrorCode,
  ResolutionResult,
  ResolvedRef,
  SemanticConfig,
  SemanticResolver,
  UnresolvedRef,
} from "./types.js";

/**
 * Timeout wrapper for async operations
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: ${errorMessage}`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

/**
 * Map ts-morph node to universal NodeKind
 */
function getNodeKind(node: Node): NodeKind {
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node)) {
    return "function";
  }
  if (Node.isMethodDeclaration(node)) {
    return "method";
  }
  if (Node.isClassDeclaration(node)) {
    return "class";
  }
  if (Node.isInterfaceDeclaration(node)) {
    return "interface";
  }
  if (Node.isTypeAliasDeclaration(node)) {
    return "type";
  }
  if (Node.isEnumDeclaration(node)) {
    return "enum";
  }
  if (Node.isEnumMember(node)) {
    return "enum_member";
  }
  if (Node.isVariableDeclaration(node)) {
    // Check if const
    const varStmt = node.getParent()?.getParent();
    if (Node.isVariableStatement(varStmt)) {
      const declKind = varStmt.getDeclarationKind();
      if (declKind === VariableDeclarationKind.Const) {
        return "constant";
      }
    }
    return "variable";
  }
  if (Node.isPropertyDeclaration(node) || Node.isPropertySignature(node)) {
    return "property";
  }
  if (Node.isModuleDeclaration(node)) {
    return "namespace";
  }
  if (Node.isSourceFile(node)) {
    return "module";
  }

  return "unknown";
}

/**
 * Get the name of a node if it has one
 */
function getNodeName(node: Node): string | undefined {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isModuleDeclaration(node)
  ) {
    return node.getName();
  }
  if (Node.isVariableDeclaration(node)) {
    return node.getName();
  }
  if (Node.isPropertyDeclaration(node) || Node.isPropertySignature(node)) {
    return node.getName();
  }
  if (Node.isEnumMember(node)) {
    return node.getName();
  }
  if (Node.isMethodDeclaration(node)) {
    return node.getName();
  }
  return undefined;
}

/**
 * TypeScript Semantic Resolver Implementation
 *
 * Uses ts-morph for accurate symbol resolution.
 * Projects are scoped to package level for performance.
 */
export class TypeScriptSemanticResolver implements SemanticResolver {
  readonly language = "typescript" as const;

  /** Track all instances for global cache clearing (used in tests) */
  private static allInstances = new Set<TypeScriptSemanticResolver>();

  private projectCache = new Map<string, Project>();
  private exportIndexCache = new Map<string, ExportIndex>();
  private config: SemanticConfig["typescript"];

  constructor(config?: Partial<SemanticConfig["typescript"]>) {
    this.config = {
      enabled: true,
      timeoutMs: 30000,
      batchSize: 50,
      skipLibCheck: true,
      ...config,
    };
    TypeScriptSemanticResolver.allInstances.add(this);
  }

  /**
   * Clear ALL caches across ALL instances (for testing)
   * This prevents stale AST data from leaking between tests
   */
  static clearAllCaches(): void {
    for (const instance of TypeScriptSemanticResolver.allInstances) {
      instance.projectCache.clear();
      instance.exportIndexCache.clear();
    }
  }

  /**
   * Check if TypeScript resolution is available
   * ts-morph is bundled, so always available
   */
  async isAvailable(): Promise<boolean> {
    return this.config.enabled;
  }

  /**
   * Get or create a ts-morph Project for a package
   * Projects are scoped to package level for optimal performance
   */
  private getProject(packagePath: string): Project {
    const cached = this.projectCache.get(packagePath);
    if (cached) {
      return cached;
    }

    const tsconfigPath = path.join(packagePath, "tsconfig.json");
    const hasTsConfig = fs.existsSync(tsconfigPath);

    const project = new Project({
      tsConfigFilePath: hasTsConfig ? tsconfigPath : undefined,
      skipAddingFilesFromTsConfig: false,
      compilerOptions: {
        skipLibCheck: this.config.skipLibCheck,
        skipDefaultLibCheck: this.config.skipLibCheck,
        // Allow JavaScript files
        allowJs: true,
        // Don't emit
        noEmit: true,
      },
    });

    // If no tsconfig, add source files manually
    if (!hasTsConfig) {
      project.addSourceFilesAtPaths([
        path.join(packagePath, "**/*.ts"),
        path.join(packagePath, "**/*.tsx"),
        path.join(packagePath, "!**/node_modules/**"),
      ]);
    }

    this.projectCache.set(packagePath, project);
    return project;
  }

  /**
   * Build export index for a package
   * Indexes all exported symbols for fast lookup
   */
  async buildExportIndex(packagePath: string): Promise<ExportIndex> {
    const cached = this.exportIndexCache.get(packagePath);
    if (cached) {
      return cached;
    }

    // Detect repo ID using git config (handles worktrees)
    const { repoId } = await detectRepoId(packagePath);

    const project = this.getProject(packagePath);
    const sourceFiles = project.getSourceFiles();

    const fileExports = new Map<string, ExportInfo[]>();
    const moduleResolution = new Map<string, string>();

    // Extract exports from each file
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();

      // Skip node_modules
      if (filePath.includes("node_modules")) {
        continue;
      }

      try {
        const exports = await this.extractExportsFromFile(
          sourceFile,
          packagePath,
          filePath,
          repoId
        );

        if (exports.length > 0) {
          fileExports.set(filePath, exports);
        }

        // Map relative paths to absolute for module resolution
        const relativePath = path.relative(packagePath, filePath);
        const withoutExt = relativePath.replace(/\.(tsx?|jsx?)$/, "");

        // Map various specifier patterns
        moduleResolution.set(`./${withoutExt}`, filePath);
        moduleResolution.set(`./${relativePath}`, filePath);

        // Handle index files
        if (path.basename(withoutExt) === "index") {
          const dir = path.dirname(withoutExt);
          moduleResolution.set(`./${dir}`, filePath);
        }
      } catch (error) {
        // Log but continue - don't let one file break the whole index
        console.warn(`Failed to extract exports from ${filePath}:`, error);
      }
    }

    const index: ExportIndex = {
      packagePath,
      fileExports,
      moduleResolution,
      builtAt: new Date(),
    };

    this.exportIndexCache.set(packagePath, index);
    return index;
  }

  /**
   * Extract exports from a single source file
   */
  private async extractExportsFromFile(
    sourceFile: SourceFile,
    packagePath: string,
    filePath: string,
    repoId: string
  ): Promise<ExportInfo[]> {
    const exports: ExportInfo[] = [];
    const relativePath = path.relative(packagePath, filePath);

    // Use provided repo ID (detected from git) and package path
    const pkgPath = path.basename(packagePath);
    const generateId = createEntityIdGenerator(repoId, pkgPath);

    try {
      // Get all exported declarations using ts-morph's API
      const exportedDeclarations = sourceFile.getExportedDeclarations();

      for (const [name, declarations] of exportedDeclarations) {
        for (const declaration of declarations) {
          const kind = getNodeKind(declaration);
          const declName = getNodeName(declaration) || name;

          // Generate entity ID matching structural parsing
          const entityId = generateId(kind, relativePath, declName);

          // Check if type-only export
          const isTypeOnly =
            Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration);

          // Check if default export
          const isDefault = name === "default";

          // Check if re-export
          const originalFile = this.getOriginalFile(declaration);

          exports.push({
            name: declName,
            kind,
            filePath,
            entityId,
            isDefault,
            isTypeOnly,
            originalFilePath: originalFile !== filePath ? originalFile : undefined,
          });
        }
      }
    } catch (error) {
      console.warn(`Error extracting exports from ${filePath}:`, error);
    }

    return exports;
  }

  /**
   * Get the original file for a declaration (for re-exports)
   */
  private getOriginalFile(declaration: ExportedDeclarations): string {
    const sourceFile = declaration.getSourceFile();
    return sourceFile.getFilePath();
  }

  /**
   * Resolve a single import reference
   */
  async resolveRef(ref: UnresolvedRef, index: ExportIndex): Promise<ResolvedRef | null> {
    // Try to resolve the module specifier to a file
    const targetFile = this.resolveModuleSpecifier(ref.moduleSpecifier, ref.sourceFilePath, index);

    if (!targetFile) {
      return null;
    }

    // Get exports from the target file
    const exports = index.fileExports.get(targetFile);
    if (!exports) {
      return null;
    }

    // Find the matching export
    let matchedExport: ExportInfo | undefined;

    if (ref.isDefault) {
      matchedExport = exports.find((e) => e.isDefault);
    } else if (ref.isNamespace) {
      // For namespace imports, we resolve to the module itself
      matchedExport = exports.find((e) => e.kind === "module");
    } else {
      matchedExport = exports.find((e) => e.name === ref.importedSymbol);
    }

    if (!matchedExport) {
      return null;
    }

    return {
      ref,
      targetEntityId: matchedExport.entityId,
      targetFilePath: matchedExport.filePath,
      confidence: 1.0,
      method: "compiler",
    };
  }

  /**
   * Resolve a module specifier to a file path
   */
  private resolveModuleSpecifier(
    specifier: string,
    fromFile: string,
    index: ExportIndex
  ): string | null {
    // Skip external packages (node_modules)
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      return null;
    }

    // Try direct mapping from index
    const direct = index.moduleResolution.get(specifier);
    if (direct) {
      return direct;
    }

    // Try resolving relative to source file
    const sourceDir = path.dirname(fromFile);
    const resolved = path.resolve(sourceDir, specifier);

    // Try with various extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (index.fileExports.has(withExt)) {
        return withExt;
      }
    }

    // Try the exact path
    if (index.fileExports.has(resolved)) {
      return resolved;
    }

    return null;
  }

  /**
   * Resolve all external references in a package
   */
  async resolvePackage(packagePath: string, refs: UnresolvedRef[]): Promise<ResolutionResult> {
    const startTime = Date.now();
    const resolvedRefs: ResolvedRef[] = [];
    const errors: ResolutionError[] = [];

    try {
      // Build export index with timeout
      const index = await withTimeout(
        this.buildExportIndex(packagePath),
        this.config.timeoutMs,
        `Building export index for ${packagePath}`
      );

      // Process refs in batches
      const batches = this.batchArray(refs, this.config.batchSize);

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (ref) => {
            try {
              const resolved = await this.resolveRef(ref, index);
              if (resolved) {
                resolvedRefs.push(resolved);
              }
            } catch (error) {
              errors.push({
                ref,
                error: error instanceof Error ? error.message : String(error),
                code: this.categorizeError(error),
              });
            }
          })
        );
      }
    } catch (error) {
      // If building index fails, all refs are errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorCode = this.categorizeError(error);

      for (const ref of refs) {
        errors.push({
          ref,
          error: errorMsg,
          code: errorCode,
        });
      }
    }

    const timeMs = Date.now() - startTime;

    return {
      total: refs.length,
      resolved: resolvedRefs.length,
      unresolved: refs.length - resolvedRefs.length,
      resolvedRefs,
      errors,
      timeMs,
      packagePath,
    };
  }

  /**
   * Clear cached data for a package
   */
  clearCache(packagePath: string): void {
    this.projectCache.delete(packagePath);
    this.exportIndexCache.delete(packagePath);
  }

  /**
   * Clear all cached data
   */
  clearAllCaches(): void {
    this.projectCache.clear();
    this.exportIndexCache.clear();
  }

  /**
   * Batch an array into chunks
   */
  private batchArray<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }

  /**
   * Categorize an error for reporting
   */
  private categorizeError(error: unknown): ResolutionErrorCode {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("timeout")) {
        return "TIMEOUT";
      }
      if (message.includes("cannot find module") || message.includes("module not found")) {
        return "MODULE_NOT_FOUND";
      }
      if (message.includes("parse") || message.includes("syntax")) {
        return "PARSE_ERROR";
      }
      if (message.includes("circular")) {
        return "CIRCULAR_DEPENDENCY";
      }
    }
    return "INTERNAL_ERROR";
  }
}

/**
 * Create a TypeScript semantic resolver with default configuration
 */
export function createTypeScriptResolver(
  config?: Partial<SemanticConfig["typescript"]>
): TypeScriptSemanticResolver {
  return new TypeScriptSemanticResolver(config);
}
