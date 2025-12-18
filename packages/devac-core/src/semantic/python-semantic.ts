/**
 * Python Semantic Resolver
 *
 * Uses Pyright for accurate cross-file symbol resolution in Python.
 * Pyright provides JSON output with symbol information that we parse
 * to resolve imports.
 *
 * Python to Universal AST Mapping:
 * | Python Construct        | Universal Kind | Notes                    |
 * |-------------------------|----------------|--------------------------|
 * | FunctionDef             | function       |                          |
 * | AsyncFunctionDef        | function       | is_async in properties   |
 * | ClassDef                | class          |                          |
 * | MethodDef (in class)    | method         |                          |
 * | Assignment (module)     | variable       |                          |
 * | Constant assignment     | constant       |                          |
 * | TypeAlias               | type           |                          |
 *
 * @module semantic/python-semantic
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

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

const execAsync = promisify(exec);

/**
 * Pyright symbol information from JSON output
 * @planned Used for enhanced Pyright integration in future versions
 */
// biome-ignore lint/correctness/noUnusedVariables: Planned for enhanced Pyright integration
interface PyrightSymbol {
  name: string;
  kind: string;
  filePath: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Pyright diagnostic output
 */
interface PyrightDiagnostic {
  file: string;
  severity: string;
  message: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Pyright JSON output format
 */
interface PyrightOutput {
  version: string;
  generalDiagnostics: PyrightDiagnostic[];
  summary: {
    filesAnalyzed: number;
    errorCount: number;
    warningCount: number;
    informationCount: number;
  };
}

/**
 * Pyright hover response with symbol info
 * @planned Used for enhanced Pyright integration in future versions
 */
// biome-ignore lint/correctness/noUnusedVariables: Planned for enhanced Pyright integration
interface PyrightHoverInfo {
  contents: {
    kind: string;
    value: string;
  };
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Pyright definition response
 * @planned Used for enhanced Pyright integration in future versions
 */
// biome-ignore lint/correctness/noUnusedVariables: Planned for enhanced Pyright integration
interface PyrightDefinition {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Map Pyright symbol kind to universal NodeKind
 * @planned Used for enhanced Pyright integration in future versions
 */
// biome-ignore lint/correctness/noUnusedVariables: Planned for enhanced Pyright integration
function mapPyrightKindToNodeKind(pyrightKind: string): NodeKind {
  switch (pyrightKind.toLowerCase()) {
    case "function":
    case "method":
      return "function";
    case "class":
      return "class";
    case "variable":
      return "variable";
    case "constant":
      return "constant";
    case "module":
      return "module";
    case "typealias":
      return "type";
    case "property":
      return "property";
    default:
      return "unknown";
  }
}

/**
 * Python Semantic Resolver Implementation
 *
 * Uses Pyright for accurate symbol resolution.
 * Gracefully degrades when Pyright is not available.
 */
export class PythonSemanticResolver implements SemanticResolver {
  readonly language = "python" as const;

  private exportIndexCache = new Map<string, ExportIndex>();
  private config: SemanticConfig["python"];
  private pyrightAvailable: boolean | null = null;

  constructor(config?: Partial<SemanticConfig["python"]>) {
    this.config = {
      enabled: true,
      pyrightPath: undefined,
      ...config,
    };
  }

  /**
   * Check if Pyright is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    if (this.pyrightAvailable !== null) {
      return this.pyrightAvailable;
    }

    try {
      const pyrightCmd = this.config.pyrightPath || "npx pyright";
      await execAsync(`${pyrightCmd} --version`, { timeout: 30000 });
      this.pyrightAvailable = true;
      return true;
    } catch {
      this.pyrightAvailable = false;
      return false;
    }
  }

  /**
   * Build export index for a Python package
   *
   * For Python, we scan for:
   * - Module-level function and class definitions
   * - __all__ exports
   * - Public symbols (not starting with _)
   */
  async buildExportIndex(packagePath: string): Promise<ExportIndex> {
    const cached = this.exportIndexCache.get(packagePath);
    if (cached) {
      return cached;
    }

    // Detect repo ID using git config (handles worktrees)
    const { repoId } = await detectRepoId(packagePath);

    const fileExports = new Map<string, ExportInfo[]>();
    const moduleResolution = new Map<string, string>();

    // Scan for Python files
    const pythonFiles = this.findPythonFiles(packagePath);

    for (const filePath of pythonFiles) {
      try {
        const exports = await this.extractExportsFromFile(filePath, packagePath, repoId);
        if (exports.length > 0) {
          fileExports.set(filePath, exports);
        }

        // Build module resolution map
        const relativePath = path.relative(packagePath, filePath);
        const modulePath = this.filePathToModulePath(relativePath);

        moduleResolution.set(modulePath, filePath);

        // Handle __init__.py as package import
        if (path.basename(filePath) === "__init__.py") {
          const packageDir = path.dirname(relativePath);
          const packageModule = packageDir.replace(/\//g, ".");
          moduleResolution.set(packageModule, filePath);
        }
      } catch (error) {
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
   * Find all Python files in a directory
   */
  private findPythonFiles(dir: string): string[] {
    const files: string[] = [];

    const scan = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          // Skip common non-source directories
          if (entry.isDirectory()) {
            if (
              !entry.name.startsWith(".") &&
              entry.name !== "__pycache__" &&
              entry.name !== "node_modules" &&
              entry.name !== "venv" &&
              entry.name !== ".venv" &&
              entry.name !== "env"
            ) {
              scan(fullPath);
            }
          } else if (
            entry.isFile() &&
            (entry.name.endsWith(".py") || entry.name.endsWith(".pyi"))
          ) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore permission errors
      }
    };

    scan(dir);
    return files;
  }

  /**
   * Convert file path to Python module path
   */
  private filePathToModulePath(relativePath: string): string {
    // Remove .py or .pyi extension
    let modulePath = relativePath.replace(/\.pyi?$/, "");

    // Convert path separators to dots
    modulePath = modulePath.replace(/[/\\]/g, ".");

    // Remove __init__ suffix
    if (modulePath.endsWith(".__init__")) {
      modulePath = modulePath.slice(0, -9);
    }

    return modulePath;
  }

  /**
   * Extract exports from a single Python file
   *
   * Uses simple regex-based parsing for reliability.
   * For accurate results, Pyright analysis can be used.
   */
  private async extractExportsFromFile(
    filePath: string,
    packagePath: string,
    repoId: string
  ): Promise<ExportInfo[]> {
    const exports: ExportInfo[] = [];
    const relativePath = path.relative(packagePath, filePath);

    // Use provided repo ID (detected from git) and package path
    const pkgPath = path.basename(packagePath);
    const generateId = createEntityIdGenerator(repoId, pkgPath);

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const _lines = content.split("\n");

      // Track __all__ if defined
      let allExports: string[] | null = null;
      const allMatch = content.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
      if (allMatch?.[1]) {
        allExports = allMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/['"]/g, ""))
          .filter((s) => s.length > 0);
      }

      // Find function definitions
      const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(/gm;
      for (const match of content.matchAll(funcRegex)) {
        const name = match[1];
        if (name && this.isPublicSymbol(name, allExports)) {
          const kind: NodeKind = "function";
          exports.push({
            name,
            kind,
            filePath,
            entityId: generateId(kind, relativePath, name),
            isDefault: false,
            isTypeOnly: false,
          });
        }
      }

      // Find class definitions
      const classRegex = /^class\s+(\w+)\s*[:(]/gm;
      for (const match of content.matchAll(classRegex)) {
        const name = match[1];
        if (name && this.isPublicSymbol(name, allExports)) {
          const kind: NodeKind = "class";
          exports.push({
            name,
            kind,
            filePath,
            entityId: generateId(kind, relativePath, name),
            isDefault: false,
            isTypeOnly: false,
          });
        }
      }

      // Find module-level assignments (simple pattern)
      const assignRegex = /^([A-Z_][A-Z0-9_]*)\s*=/gm;
      for (const match of content.matchAll(assignRegex)) {
        const name = match[1];
        if (name && this.isPublicSymbol(name, allExports)) {
          const kind: NodeKind = "constant";
          exports.push({
            name,
            kind,
            filePath,
            entityId: generateId(kind, relativePath, name),
            isDefault: false,
            isTypeOnly: false,
          });
        }
      }

      // Find type aliases (TypeAlias or simple assignment with type annotation)
      const typeAliasRegex = /^(\w+):\s*TypeAlias\s*=/gm;
      for (const match of content.matchAll(typeAliasRegex)) {
        const name = match[1];
        if (name && this.isPublicSymbol(name, allExports)) {
          const kind: NodeKind = "type";
          exports.push({
            name,
            kind,
            filePath,
            entityId: generateId(kind, relativePath, name),
            isDefault: false,
            isTypeOnly: true,
          });
        }
      }
    } catch (error) {
      console.warn(`Error reading ${filePath}:`, error);
    }

    return exports;
  }

  /**
   * Check if a symbol is public (should be exported)
   */
  private isPublicSymbol(name: string, allExports: string[] | null): boolean {
    // If __all__ is defined, only those symbols are public
    if (allExports !== null) {
      return allExports.includes(name);
    }

    // Otherwise, symbols not starting with _ are public
    return !name.startsWith("_");
  }

  /**
   * Resolve a single import reference
   */
  async resolveRef(ref: UnresolvedRef, index: ExportIndex): Promise<ResolvedRef | null> {
    // Convert Python import to file lookup
    const moduleSpecifier = ref.moduleSpecifier;

    // Handle relative imports
    let modulePath = moduleSpecifier;
    if (moduleSpecifier.startsWith(".")) {
      // Relative import - resolve from source file location
      const sourceDir = path.dirname(ref.sourceFilePath);
      const dots = moduleSpecifier.match(/^\.+/)?.[0].length || 1;
      const relativeParts = moduleSpecifier.slice(dots).split(".");

      let baseDir = sourceDir;
      for (let i = 1; i < dots; i++) {
        baseDir = path.dirname(baseDir);
      }

      modulePath = path.relative(index.packagePath, path.join(baseDir, ...relativeParts));
      modulePath = modulePath.replace(/[/\\]/g, ".");
    }

    // Find the target file
    const targetFile = index.moduleResolution.get(modulePath);
    if (!targetFile) {
      return null;
    }

    // Get exports from target file
    const exports = index.fileExports.get(targetFile);
    if (!exports) {
      return null;
    }

    // Find matching export
    const matchedExport = exports.find((e) => e.name === ref.importedSymbol);
    if (!matchedExport) {
      return null;
    }

    return {
      ref,
      targetEntityId: matchedExport.entityId,
      targetFilePath: matchedExport.filePath,
      confidence: 0.9, // Slightly lower than TypeScript since we use regex
      method: "index",
    };
  }

  /**
   * Run Pyright analysis on package and parse JSON output
   * Used for enhanced symbol resolution when Pyright is available
   */
  async runPyrightAnalysis(packagePath: string): Promise<PyrightOutput | null> {
    if (!(await this.isAvailable())) {
      return null;
    }

    try {
      const pyrightCmd = this.config.pyrightPath || "npx pyright";
      const { stdout } = await execAsync(`${pyrightCmd} --outputjson "${packagePath}"`, {
        timeout: 60000, // 60s timeout for full analysis
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      });

      const output = JSON.parse(stdout) as PyrightOutput;
      return output;
    } catch (error) {
      // Pyright may exit with non-zero on type errors, but still provide useful output
      if (error && typeof error === "object" && "stdout" in error) {
        try {
          const stdout = (error as { stdout: string }).stdout;
          if (stdout?.trim().startsWith("{")) {
            return JSON.parse(stdout) as PyrightOutput;
          }
        } catch {
          // Ignore parse errors
        }
      }
      console.warn(`Pyright analysis failed for ${packagePath}:`, error);
      return null;
    }
  }

  /**
   * Resolve all external references in a package
   */
  async resolvePackage(packagePath: string, refs: UnresolvedRef[]): Promise<ResolutionResult> {
    const startTime = Date.now();
    const resolvedRefs: ResolvedRef[] = [];
    const errors: ResolutionError[] = [];

    try {
      // Build index for resolution
      const index = await this.buildExportIndex(packagePath);

      // Try Pyright-enhanced resolution if available
      const pyrightAvailable = await this.isAvailable();

      for (const ref of refs) {
        try {
          const resolved = await this.resolveRef(ref, index);
          if (resolved) {
            // Boost confidence if Pyright is available for validation
            if (pyrightAvailable) {
              resolved.confidence = 0.95;
            }
            resolvedRefs.push(resolved);
          }
        } catch (error) {
          errors.push({
            ref,
            error: error instanceof Error ? error.message : String(error),
            code: this.categorizeError(error),
          });
        }
      }
    } catch (error) {
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

    return {
      total: refs.length,
      resolved: resolvedRefs.length,
      unresolved: refs.length - resolvedRefs.length,
      resolvedRefs,
      errors,
      timeMs: Date.now() - startTime,
      packagePath,
    };
  }

  /**
   * Clear cached data for a package
   */
  clearCache(packagePath: string): void {
    this.exportIndexCache.delete(packagePath);
  }

  /**
   * Clear all cached data
   */
  clearAllCaches(): void {
    this.exportIndexCache.clear();
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
      if (message.includes("module not found") || message.includes("no module named")) {
        return "MODULE_NOT_FOUND";
      }
      if (message.includes("syntax") || message.includes("parse")) {
        return "PARSE_ERROR";
      }
    }
    return "INTERNAL_ERROR";
  }
}

/**
 * Create a Python semantic resolver with default configuration
 */
export function createPythonResolver(
  config?: Partial<SemanticConfig["python"]>
): PythonSemanticResolver {
  return new PythonSemanticResolver(config);
}
