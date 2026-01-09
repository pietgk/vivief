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
  CallResolutionError,
  CallResolutionResult,
  ExportIndex,
  ExportInfo,
  ExtendsResolutionError,
  ExtendsResolutionResult,
  LocalSymbol,
  LocalSymbolIndex,
  ResolutionError,
  ResolutionErrorCode,
  ResolutionResult,
  ResolvedCallEdge,
  ResolvedExtendsEdge,
  ResolvedRef,
  SemanticConfig,
  SemanticResolver,
  UnresolvedCallEdge,
  UnresolvedExtendsEdge,
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
  private localSymbolIndexCache = new Map<string, LocalSymbolIndex>();
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
      instance.localSymbolIndexCache.clear();
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
   * Resolve CALLS edges to actual entity IDs
   *
   * This method resolves unresolved CALLS edges (target_entity_id = 'unresolved:xxx')
   * to actual entity IDs by matching callee names against:
   * 1. Local symbols (functions in the same file)
   * 2. Exported symbols from the export index
   */
  async resolveCallEdges(
    packagePath: string,
    calls: UnresolvedCallEdge[]
  ): Promise<CallResolutionResult> {
    const startTime = Date.now();
    const resolvedCalls: ResolvedCallEdge[] = [];
    const errors: CallResolutionError[] = [];

    try {
      // Build indices with timeout
      const [exportIndex, localIndex] = await Promise.all([
        withTimeout(
          this.buildExportIndex(packagePath),
          this.config.timeoutMs,
          `Building export index for ${packagePath}`
        ),
        withTimeout(
          this.buildLocalSymbolIndex(packagePath),
          this.config.timeoutMs,
          `Building local symbol index for ${packagePath}`
        ),
      ]);

      // Process calls in batches
      const batches = this.batchArray(calls, this.config.batchSize);

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (call) => {
            try {
              const resolved = this.resolveCall(call, exportIndex, localIndex);
              if (resolved) {
                resolvedCalls.push(resolved);
              }
            } catch (error) {
              errors.push({
                call,
                error: error instanceof Error ? error.message : String(error),
                code: this.categorizeError(error),
              });
            }
          })
        );
      }
    } catch (error) {
      // If building indices fails, all calls are errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorCode = this.categorizeError(error);

      for (const call of calls) {
        errors.push({
          call,
          error: errorMsg,
          code: errorCode,
        });
      }
    }

    const timeMs = Date.now() - startTime;

    return {
      total: calls.length,
      resolved: resolvedCalls.length,
      unresolved: calls.length - resolvedCalls.length,
      resolvedCalls,
      errors,
      timeMs,
      packagePath,
    };
  }

  /**
   * Resolve EXTENDS edges to actual entity IDs
   *
   * This method resolves unresolved EXTENDS edges (target_entity_id = 'unresolved:xxx')
   * to actual entity IDs by matching target names against:
   * 1. Local symbols (classes/interfaces in the same file)
   * 2. Exported symbols from the export index
   */
  async resolveExtendsEdges(
    packagePath: string,
    extendsEdges: UnresolvedExtendsEdge[]
  ): Promise<ExtendsResolutionResult> {
    const startTime = Date.now();
    const resolvedExtends: ResolvedExtendsEdge[] = [];
    const errors: ExtendsResolutionError[] = [];

    try {
      // Build indices with timeout (reuses cached indices if available)
      const [exportIndex, localIndex] = await Promise.all([
        withTimeout(
          this.buildExportIndex(packagePath),
          this.config.timeoutMs,
          `Building export index for ${packagePath}`
        ),
        withTimeout(
          this.buildLocalSymbolIndex(packagePath),
          this.config.timeoutMs,
          `Building local symbol index for ${packagePath}`
        ),
      ]);

      // Process extends edges in batches
      const batches = this.batchArray(extendsEdges, this.config.batchSize);

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (ext) => {
            try {
              const resolved = this.resolveExtends(ext, exportIndex, localIndex);
              if (resolved) {
                resolvedExtends.push(resolved);
              }
            } catch (error) {
              errors.push({
                extends: ext,
                error: error instanceof Error ? error.message : String(error),
                code: this.categorizeError(error),
              });
            }
          })
        );
      }
    } catch (error) {
      // If building indices fails, all extends are errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorCode = this.categorizeError(error);

      for (const ext of extendsEdges) {
        errors.push({
          extends: ext,
          error: errorMsg,
          code: errorCode,
        });
      }
    }

    const timeMs = Date.now() - startTime;

    return {
      total: extendsEdges.length,
      resolved: resolvedExtends.length,
      unresolved: extendsEdges.length - resolvedExtends.length,
      resolvedExtends,
      errors,
      timeMs,
      packagePath,
    };
  }

  /**
   * Build index of local (non-exported) symbols for each file
   * This includes all functions, methods, and classes defined in each file
   */
  private async buildLocalSymbolIndex(packagePath: string): Promise<LocalSymbolIndex> {
    const cached = this.localSymbolIndexCache.get(packagePath);
    if (cached) {
      return cached;
    }

    // Detect repo ID using git config (handles worktrees)
    const { repoId } = await detectRepoId(packagePath);

    const project = this.getProject(packagePath);
    const sourceFiles = project.getSourceFiles();

    const fileSymbols = new Map<string, LocalSymbol[]>();

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();

      // Skip node_modules
      if (filePath.includes("node_modules")) {
        continue;
      }

      try {
        const symbols = this.extractLocalSymbolsFromFile(sourceFile, packagePath, filePath, repoId);

        if (symbols.length > 0) {
          fileSymbols.set(filePath, symbols);
        }
      } catch (error) {
        // Log but continue - don't let one file break the whole index
        console.warn(`Failed to extract local symbols from ${filePath}:`, error);
      }
    }

    const index: LocalSymbolIndex = {
      fileSymbols,
      builtAt: new Date(),
    };

    this.localSymbolIndexCache.set(packagePath, index);
    return index;
  }

  /**
   * Extract all local symbols (functions, methods, classes) from a file
   */
  private extractLocalSymbolsFromFile(
    sourceFile: SourceFile,
    packagePath: string,
    filePath: string,
    repoId: string
  ): LocalSymbol[] {
    const symbols: LocalSymbol[] = [];
    const relativePath = path.relative(packagePath, filePath);

    // Use provided repo ID (detected from git) and package path
    const pkgPath = path.basename(packagePath);
    const generateId = createEntityIdGenerator(repoId, pkgPath);

    // Traverse all nodes in the file to find function-like declarations
    sourceFile.forEachDescendant((node) => {
      // Function declarations
      if (Node.isFunctionDeclaration(node)) {
        const name = node.getName();
        if (name) {
          const kind = getNodeKind(node);
          const entityId = generateId(kind, relativePath, name);
          symbols.push({ name, kind, entityId, filePath });
        }
      }
      // Arrow functions assigned to variables
      else if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();
        if (initializer && Node.isArrowFunction(initializer)) {
          const name = node.getName();
          const kind: NodeKind = "function";
          const entityId = generateId(kind, relativePath, name);
          symbols.push({ name, kind, entityId, filePath });
        }
      }
      // Methods in classes
      else if (Node.isMethodDeclaration(node)) {
        const name = node.getName();
        const kind = getNodeKind(node);
        const entityId = generateId(kind, relativePath, name);
        symbols.push({ name, kind, entityId, filePath });
      }
      // Classes
      else if (Node.isClassDeclaration(node)) {
        const name = node.getName();
        if (name) {
          const kind = getNodeKind(node);
          const entityId = generateId(kind, relativePath, name);
          symbols.push({ name, kind, entityId, filePath });
        }
      }
      // Interfaces (needed for EXTENDS resolution)
      else if (Node.isInterfaceDeclaration(node)) {
        const name = node.getName();
        if (name) {
          const kind = getNodeKind(node);
          const entityId = generateId(kind, relativePath, name);
          symbols.push({ name, kind, entityId, filePath });
        }
      }
    });

    return symbols;
  }

  /**
   * Resolve a single CALLS edge
   */
  private resolveCall(
    call: UnresolvedCallEdge,
    exportIndex: ExportIndex,
    localIndex: LocalSymbolIndex
  ): ResolvedCallEdge | null {
    const { calleeName, sourceFilePath } = call;

    // Extract just the function name (ignore method chains like 'obj.method')
    const simpleCalleeName = this.extractSimpleCalleeName(calleeName);
    if (!simpleCalleeName) {
      return null;
    }

    // 1. Try to find in same file (local function) - highest priority
    const localSymbols = localIndex.fileSymbols.get(sourceFilePath);
    if (localSymbols) {
      const localMatch = localSymbols.find(
        (s) => s.name === simpleCalleeName && (s.kind === "function" || s.kind === "method")
      );
      if (localMatch) {
        return {
          call,
          targetEntityId: localMatch.entityId,
          targetFilePath: localMatch.filePath,
          confidence: 1.0,
          method: "local",
        };
      }

      // Also check for class matches (for constructor calls like `new MyClass()`)
      const classMatch = localSymbols.find(
        (s) => s.name === simpleCalleeName && s.kind === "class"
      );
      if (classMatch) {
        return {
          call,
          targetEntityId: classMatch.entityId,
          targetFilePath: classMatch.filePath,
          confidence: 1.0,
          method: "local",
        };
      }
    }

    // 2. Try to find in exports (imported function from another file)
    for (const [exportFilePath, exports] of exportIndex.fileExports) {
      // Skip same file - we already checked local symbols
      if (exportFilePath === sourceFilePath) {
        continue;
      }

      const exportMatch = exports.find(
        (e) => e.name === simpleCalleeName && (e.kind === "function" || e.kind === "method")
      );
      if (exportMatch) {
        return {
          call,
          targetEntityId: exportMatch.entityId,
          targetFilePath: exportMatch.filePath,
          confidence: 0.9,
          method: "index",
        };
      }

      // Also check for class matches
      const classMatch = exports.find((e) => e.name === simpleCalleeName && e.kind === "class");
      if (classMatch) {
        return {
          call,
          targetEntityId: classMatch.entityId,
          targetFilePath: classMatch.filePath,
          confidence: 0.9,
          method: "index",
        };
      }
    }

    // Could not resolve
    return null;
  }

  /**
   * Resolve a single EXTENDS edge
   */
  private resolveExtends(
    ext: UnresolvedExtendsEdge,
    exportIndex: ExportIndex,
    localIndex: LocalSymbolIndex
  ): ResolvedExtendsEdge | null {
    const { targetName, sourceFilePath, sourceKind } = ext;

    if (!targetName) {
      return null;
    }

    // Determine what kinds we're looking for
    // Classes can extend classes, interfaces can extend interfaces
    const targetKinds: NodeKind[] = sourceKind === "class" ? ["class"] : ["interface"];

    // 1. Try to find in same file (local class/interface) - highest priority
    const localSymbols = localIndex.fileSymbols.get(sourceFilePath);
    if (localSymbols) {
      const localMatch = localSymbols.find(
        (s) => s.name === targetName && targetKinds.includes(s.kind)
      );
      if (localMatch) {
        return {
          extends: ext,
          targetEntityId: localMatch.entityId,
          targetFilePath: localMatch.filePath,
          confidence: 1.0,
          method: "local",
        };
      }
    }

    // 2. Try to find in exports (imported class/interface from another file)
    for (const [exportFilePath, exports] of exportIndex.fileExports) {
      // Skip same file - we already checked local symbols
      if (exportFilePath === sourceFilePath) {
        continue;
      }

      const exportMatch = exports.find(
        (e) => e.name === targetName && targetKinds.includes(e.kind)
      );
      if (exportMatch) {
        return {
          extends: ext,
          targetEntityId: exportMatch.entityId,
          targetFilePath: exportMatch.filePath,
          confidence: 0.9,
          method: "index",
        };
      }
    }

    // Could not resolve
    return null;
  }

  /**
   * Extract the simple function/method name from a callee string
   * Examples:
   * - "foo" -> "foo"
   * - "obj.method" -> "method"
   * - "this.method" -> "method"
   * - "module.submodule.func" -> "func"
   */
  private extractSimpleCalleeName(calleeName: string): string | null {
    if (!calleeName) {
      return null;
    }

    // Handle method chains - take the last part
    const parts = calleeName.split(".");
    const simpleName = parts[parts.length - 1];

    // Check if we have a valid name
    if (!simpleName) {
      return null;
    }

    // Filter out some common built-ins we can't resolve
    const builtIns = new Set([
      "log",
      "warn",
      "error",
      "info",
      "debug", // console methods
      "stringify",
      "parse", // JSON methods
      "push",
      "pop",
      "shift",
      "unshift",
      "slice",
      "splice",
      "map",
      "filter",
      "reduce",
      "forEach",
      "find",
      "some",
      "every", // Array methods
      "toString",
      "valueOf",
      "hasOwnProperty", // Object methods
    ]);

    if (builtIns.has(simpleName)) {
      return null;
    }

    return simpleName;
  }

  /**
   * Clear cached data for a package
   */
  clearCache(packagePath: string): void {
    this.projectCache.delete(packagePath);
    this.exportIndexCache.delete(packagePath);
    this.localSymbolIndexCache.delete(packagePath);
  }

  /**
   * Clear all cached data
   */
  clearAllCaches(): void {
    this.projectCache.clear();
    this.exportIndexCache.clear();
    this.localSymbolIndexCache.clear();
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
