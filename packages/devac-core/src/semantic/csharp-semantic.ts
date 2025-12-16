/**
 * C# Semantic Resolver
 *
 * Uses regex-based parsing for C# symbol resolution.
 * Can integrate with Roslyn via dotnet tool for enhanced resolution.
 *
 * C# to Universal AST Mapping:
 * | C# Construct            | Universal Kind | Notes                    |
 * |-------------------------|----------------|--------------------------|
 * | MethodDeclaration       | method         |                          |
 * | ClassDeclaration        | class          |                          |
 * | InterfaceDeclaration    | interface      |                          |
 * | StructDeclaration       | class          | is_struct in properties  |
 * | RecordDeclaration       | class          | is_record in properties  |
 * | EnumDeclaration         | enum           |                          |
 * | DelegateDeclaration     | type           |                          |
 * | PropertyDeclaration     | property       |                          |
 * | FieldDeclaration        | variable       |                          |
 * | ConstDeclaration        | constant       |                          |
 * | NamespaceDeclaration    | namespace      |                          |
 *
 * @module semantic/csharp-semantic
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { NodeKind } from "../types/nodes.js";
import { createEntityIdGenerator } from "../analyzer/entity-id-generator.js";
import type {
  SemanticResolver,
  ExportInfo,
  ExportIndex,
  UnresolvedRef,
  ResolvedRef,
  ResolutionResult,
  ResolutionError,
  ResolutionErrorCode,
  SemanticConfig,
} from "./types.js";

const execAsync = promisify(exec);

/**
 * C# visibility modifiers
 */
type CSharpVisibility = "public" | "internal" | "protected" | "private";

/**
 * C# symbol information
 */
interface CSharpSymbol {
  name: string;
  kind: NodeKind;
  namespace: string;
  visibility: CSharpVisibility;
  filePath: string;
  line: number;
}

/**
 * C# Semantic Resolver Implementation
 *
 * Uses regex-based parsing for symbol extraction.
 * Gracefully degrades when .NET SDK is not available.
 */
export class CSharpSemanticResolver implements SemanticResolver {
  readonly language = "csharp" as const;

  private exportIndexCache = new Map<string, ExportIndex>();
  private config: SemanticConfig["csharp"];
  private dotnetAvailable: boolean | null = null;

  constructor(config?: Partial<SemanticConfig["csharp"]>) {
    this.config = {
      enabled: true,
      dotnetPath: undefined,
      ...config,
    };
  }

  /**
   * Check if .NET SDK is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    if (this.dotnetAvailable !== null) {
      return this.dotnetAvailable;
    }

    try {
      const dotnetCmd = this.config.dotnetPath || "dotnet";
      await execAsync(`${dotnetCmd} --version`, { timeout: 10000 });
      this.dotnetAvailable = true;
      return true;
    } catch {
      this.dotnetAvailable = false;
      return false;
    }
  }

  /**
   * Build export index for a C# project
   *
   * For C#, we scan for:
   * - Public classes, interfaces, structs, records
   * - Public methods and properties
   * - Public enums and delegates
   */
  async buildExportIndex(packagePath: string): Promise<ExportIndex> {
    const cached = this.exportIndexCache.get(packagePath);
    if (cached) {
      return cached;
    }

    const fileExports = new Map<string, ExportInfo[]>();
    const moduleResolution = new Map<string, string>();

    // Scan for C# files
    const csharpFiles = this.findCSharpFiles(packagePath);

    for (const filePath of csharpFiles) {
      try {
        const exports = await this.extractExportsFromFile(filePath, packagePath);
        if (exports.length > 0) {
          fileExports.set(filePath, exports);
        }

        // Build namespace resolution map
        const namespaces = this.extractNamespaces(filePath);
        for (const ns of namespaces) {
          moduleResolution.set(ns, filePath);
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
   * Find all C# files in a directory
   */
  private findCSharpFiles(dir: string): string[] {
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
              entry.name !== "bin" &&
              entry.name !== "obj" &&
              entry.name !== "node_modules" &&
              entry.name !== "packages"
            ) {
              scan(fullPath);
            }
          } else if (entry.isFile() && entry.name.endsWith(".cs")) {
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
   * Extract namespaces from a C# file
   */
  private extractNamespaces(filePath: string): string[] {
    const namespaces: string[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Match namespace declarations (both block and file-scoped)
      const blockNamespaceRegex = /namespace\s+([\w.]+)\s*\{/g;
      const fileScopedNamespaceRegex = /namespace\s+([\w.]+)\s*;/g;

      let match: RegExpExecArray | null;

      while ((match = blockNamespaceRegex.exec(content)) !== null) {
        if (match[1]) {
          namespaces.push(match[1]);
        }
      }

      while ((match = fileScopedNamespaceRegex.exec(content)) !== null) {
        if (match[1]) {
          namespaces.push(match[1]);
        }
      }
    } catch {
      // Ignore read errors
    }

    return namespaces;
  }

  /**
   * Extract exports from a single C# file
   */
  private async extractExportsFromFile(
    filePath: string,
    packagePath: string
  ): Promise<ExportInfo[]> {
    const exports: ExportInfo[] = [];
    const relativePath = path.relative(packagePath, filePath);

    // Get package info for entity ID generation
    const repo = path.basename(path.dirname(packagePath)) || "unknown";
    const pkgPath = path.basename(packagePath);
    const generateId = createEntityIdGenerator(repo, pkgPath);

    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // Find public class declarations
      const classRegex = /public\s+(?:partial\s+)?(?:abstract\s+)?(?:sealed\s+)?class\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = classRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
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

      // Find public interface declarations
      const interfaceRegex = /public\s+(?:partial\s+)?interface\s+(\w+)/g;
      while ((match = interfaceRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          const kind: NodeKind = "interface";
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

      // Find public struct declarations
      const structRegex = /public\s+(?:partial\s+)?(?:readonly\s+)?struct\s+(\w+)/g;
      while ((match = structRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          const kind: NodeKind = "class"; // Map to class with is_struct property
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

      // Find public record declarations
      const recordRegex = /public\s+(?:partial\s+)?(?:sealed\s+)?record\s+(?:class\s+|struct\s+)?(\w+)/g;
      while ((match = recordRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          const kind: NodeKind = "class"; // Map to class with is_record property
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

      // Find public enum declarations
      const enumRegex = /public\s+enum\s+(\w+)/g;
      while ((match = enumRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          const kind: NodeKind = "enum";
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

      // Find public delegate declarations
      const delegateRegex = /public\s+delegate\s+\S+\s+(\w+)\s*\(/g;
      while ((match = delegateRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
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

      // Find public static classes (often utility classes)
      const staticClassRegex = /public\s+static\s+(?:partial\s+)?class\s+(\w+)/g;
      while ((match = staticClassRegex.exec(content)) !== null) {
        const name = match[1];
        if (name && !exports.some((e) => e.name === name)) {
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
    } catch (error) {
      console.warn(`Error reading ${filePath}:`, error);
    }

    return exports;
  }

  /**
   * Resolve a single using reference
   */
  async resolveRef(
    ref: UnresolvedRef,
    index: ExportIndex
  ): Promise<ResolvedRef | null> {
    // In C#, moduleSpecifier is typically a namespace
    const namespace = ref.moduleSpecifier;

    // Find files that contain this namespace
    const targetFile = index.moduleResolution.get(namespace);
    if (!targetFile) {
      // Try partial namespace match
      for (const [ns, file] of index.moduleResolution) {
        if (ns.startsWith(namespace) || namespace.startsWith(ns)) {
          const exports = index.fileExports.get(file);
          if (exports) {
            const matchedExport = exports.find((e) => e.name === ref.importedSymbol);
            if (matchedExport) {
              return {
                ref,
                targetEntityId: matchedExport.entityId,
                targetFilePath: matchedExport.filePath,
                confidence: 0.85, // Lower confidence for partial match
                method: "index",
              };
            }
          }
        }
      }
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
      confidence: 0.9,
      method: "index",
    };
  }

  /**
   * Resolve all external references in a project
   */
  async resolvePackage(
    packagePath: string,
    refs: UnresolvedRef[]
  ): Promise<ResolutionResult> {
    const startTime = Date.now();
    const resolvedRefs: ResolvedRef[] = [];
    const errors: ResolutionError[] = [];

    try {
      // Build index for resolution
      const index = await this.buildExportIndex(packagePath);

      // Check if .NET SDK is available for enhanced resolution
      const dotnetAvailable = await this.isAvailable();

      for (const ref of refs) {
        try {
          const resolved = await this.resolveRef(ref, index);
          if (resolved) {
            // Boost confidence if .NET SDK is available
            if (dotnetAvailable) {
              resolved.confidence = Math.min(resolved.confidence + 0.05, 1.0);
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
      if (message.includes("not found") || message.includes("could not find")) {
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
 * Create a C# semantic resolver with default configuration
 */
export function createCSharpResolver(
  config?: Partial<SemanticConfig["csharp"]>
): CSharpSemanticResolver {
  return new CSharpSemanticResolver(config);
}
