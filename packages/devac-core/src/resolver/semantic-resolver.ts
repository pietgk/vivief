/**
 * Semantic Resolver Module
 *
 * Resolves import references to their target exports within a package.
 * Builds an export index from TypeScript files and resolves cross-file imports.
 *
 * Based on DevAC v2.0 spec Section 6.5
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import { generateEntityId } from "../analyzer/entity-id-generator.js";
import { type Logger, createLogger } from "../utils/logger.js";

/**
 * Information about an exported symbol
 */
export interface ExportInfo {
  name: string;
  kind: "function" | "class" | "variable" | "interface" | "type" | "enum" | "default";
  filePath: string;
  entityId: string;
  isDefault: boolean;
  isReExport: boolean;
  originalFile?: string;
  originalName?: string;
}

/**
 * Reference to resolve
 */
export interface ImportRef {
  importPath: string;
  importedName: string;
  localName?: string;
  sourceFile: string;
}

/**
 * Resolved reference
 */
export interface ResolvedRef {
  ref: ImportRef;
  targetEntityId: string;
  targetFile: string;
  targetName: string;
}

/**
 * Resolution result for a package
 */
export interface ResolutionResult {
  total: number;
  resolved: number;
  unresolved: number;
  errors: Array<{ ref: ImportRef; error: string }>;
  timeMs: number;
}

/**
 * Export index interface
 */
export interface ExportIndex {
  exports: Map<string, ExportInfo[]>;
  fileExports: Map<string, ExportInfo[]>;
  hasExport(name: string): boolean;
  getExport(name: string): ExportInfo | undefined;
  getExportsFromFile(filePath: string): ExportInfo[];
  getDefaultExport(filePath: string): ExportInfo | undefined;
}

/**
 * Semantic resolver options
 */
export interface SemanticResolverOptions {
  repoName: string;
  branch?: string;
}

/**
 * Semantic resolver interface
 */
export interface SemanticResolver {
  buildExportIndex(packagePath: string): Promise<ExportIndex>;
  resolveRef(ref: ImportRef, index: ExportIndex): Promise<ResolvedRef | null>;
  resolvePackage(packagePath: string): Promise<ResolutionResult>;
  updateForFileChange(filePath: string, index: ExportIndex): Promise<ExportIndex>;
}

/**
 * Export index implementation
 */
class ExportIndexImpl implements ExportIndex {
  exports: Map<string, ExportInfo[]> = new Map();
  fileExports: Map<string, ExportInfo[]> = new Map();

  hasExport(name: string): boolean {
    return this.exports.has(name) && (this.exports.get(name)?.length ?? 0) > 0;
  }

  getExport(name: string): ExportInfo | undefined {
    const infos = this.exports.get(name);
    return infos?.[0];
  }

  getExportsFromFile(filePath: string): ExportInfo[] {
    return this.fileExports.get(filePath) ?? [];
  }

  getDefaultExport(filePath: string): ExportInfo | undefined {
    const fileExports = this.fileExports.get(filePath) ?? [];
    return fileExports.find((e) => e.isDefault);
  }

  addExport(info: ExportInfo): void {
    // Add to name-based index
    if (!this.exports.has(info.name)) {
      this.exports.set(info.name, []);
    }
    this.exports.get(info.name)?.push(info);

    // Add to file-based index
    if (!this.fileExports.has(info.filePath)) {
      this.fileExports.set(info.filePath, []);
    }
    this.fileExports.get(info.filePath)?.push(info);
  }

  removeExportsFromFile(filePath: string): void {
    const exports = this.fileExports.get(filePath) ?? [];

    for (const exp of exports) {
      const nameExports = this.exports.get(exp.name);
      if (nameExports) {
        const filtered = nameExports.filter((e) => e.filePath !== filePath);
        if (filtered.length === 0) {
          this.exports.delete(exp.name);
        } else {
          this.exports.set(exp.name, filtered);
        }
      }
    }

    this.fileExports.delete(filePath);
  }

  clone(): ExportIndexImpl {
    const cloned = new ExportIndexImpl();
    for (const [name, infos] of this.exports) {
      cloned.exports.set(name, [...infos]);
    }
    for (const [file, infos] of this.fileExports) {
      cloned.fileExports.set(file, [...infos]);
    }
    return cloned;
  }
}

/**
 * Semantic resolver implementation
 */
class SemanticResolverImpl implements SemanticResolver {
  private options: Required<SemanticResolverOptions>;
  private logger: Logger;

  constructor(options: SemanticResolverOptions) {
    this.options = {
      repoName: options.repoName,
      branch: options.branch ?? "base",
    };
    this.logger = createLogger({ prefix: "[SemanticResolver]" });
  }

  async buildExportIndex(packagePath: string): Promise<ExportIndex> {
    const index = new ExportIndexImpl();

    // Find all TypeScript files
    const files = await this.findTypeScriptFiles(packagePath);

    // Process each file to extract exports
    for (const filePath of files) {
      try {
        const exports = await this.extractExportsFromFile(filePath, packagePath);
        for (const exp of exports) {
          index.addExport(exp);
        }
      } catch (error) {
        this.logger.warn(`Failed to extract exports from ${filePath}`, error);
      }
    }

    // Second pass: resolve re-exports
    await this.resolveReExports(index, packagePath);

    return index;
  }

  async resolveRef(ref: ImportRef, index: ExportIndex): Promise<ResolvedRef | null> {
    // Check if it's an external dependency (no relative path)
    if (!this.isRelativeImport(ref.importPath)) {
      return null;
    }

    // Resolve the target file path
    const targetFile = this.resolveImportPath(ref.importPath, ref.sourceFile);
    if (!targetFile) {
      return null;
    }

    // Look up the export
    const isDefault = ref.importedName === "default";
    let exportInfo: ExportInfo | undefined;

    if (isDefault) {
      exportInfo = index.getDefaultExport(targetFile);
    } else {
      // Look for the export by name
      const exports = index.getExportsFromFile(targetFile);
      exportInfo = exports.find((e) => e.name === ref.importedName);

      // Also check global exports (in case of re-exports)
      if (!exportInfo) {
        exportInfo = index.getExport(ref.importedName);
      }
    }

    if (!exportInfo) {
      return null;
    }

    return {
      ref,
      targetEntityId: exportInfo.entityId,
      targetFile: exportInfo.filePath,
      targetName: exportInfo.name,
    };
  }

  async resolvePackage(packagePath: string): Promise<ResolutionResult> {
    const startTime = Date.now();

    // Build export index
    const index = await this.buildExportIndex(packagePath);

    // Find all import references
    const refs = await this.findAllImportRefs(packagePath);

    let resolved = 0;
    let unresolved = 0;
    const errors: Array<{ ref: ImportRef; error: string }> = [];

    // Resolve each ref
    for (const ref of refs) {
      try {
        const result = await this.resolveRef(ref, index);
        if (result) {
          resolved++;
        } else {
          unresolved++;
        }
      } catch (error) {
        errors.push({
          ref,
          error: error instanceof Error ? error.message : String(error),
        });
        unresolved++;
      }
    }

    return {
      total: refs.length,
      resolved,
      unresolved,
      errors,
      timeMs: Date.now() - startTime,
    };
  }

  async updateForFileChange(filePath: string, index: ExportIndex): Promise<ExportIndex> {
    const impl = index as ExportIndexImpl;
    const newIndex = impl.clone();

    // Remove old exports from this file
    newIndex.removeExportsFromFile(filePath);

    // Check if file still exists
    try {
      await fs.access(filePath);

      // Re-extract exports from the updated file
      const packagePath = path.dirname(filePath);
      const exports = await this.extractExportsFromFile(filePath, packagePath);

      for (const exp of exports) {
        newIndex.addExport(exp);
      }
    } catch {
      // File was deleted, exports already removed
    }

    return newIndex;
  }

  /**
   * Find all TypeScript files in a package
   */
  private async findTypeScriptFiles(packagePath: string): Promise<string[]> {
    const patterns = [path.join(packagePath, "**/*.ts"), path.join(packagePath, "**/*.tsx")];

    const ignorePatterns = [
      "**/node_modules/**",
      "**/.devac/**",
      "**/dist/**",
      "**/build/**",
      "**/*.d.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ];

    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        ignore: ignorePatterns,
        nodir: true,
        absolute: true,
      });
      files.push(...matches);
    }

    return [...new Set(files)];
  }

  /**
   * Extract exports from a TypeScript file
   */
  private async extractExportsFromFile(
    filePath: string,
    packagePath: string
  ): Promise<ExportInfo[]> {
    const content = await fs.readFile(filePath, "utf-8");
    const exports: ExportInfo[] = [];

    // Simple regex-based export extraction
    // For production, use ts-morph for accurate parsing

    // Helper to extract exports using regex
    const extractExports = (regex: RegExp, kind: ExportInfo["kind"]): void => {
      for (const match of content.matchAll(regex)) {
        const name = match[1];
        if (name) {
          exports.push(this.createExportInfo(name, kind, filePath, packagePath));
        }
      }
    };

    // Named exports: export const/let/var name
    extractExports(/export\s+(?:const|let|var)\s+(\w+)/g, "variable");

    // Function exports: export function name
    extractExports(/export\s+(?:async\s+)?function\s+(\w+)/g, "function");

    // Class exports: export class name
    extractExports(/export\s+(?:abstract\s+)?class\s+(\w+)/g, "class");

    // Interface exports: export interface name
    extractExports(/export\s+interface\s+(\w+)/g, "interface");

    // Type exports: export type name
    extractExports(/export\s+type\s+(\w+)/g, "type");

    // Enum exports: export enum name
    extractExports(/export\s+enum\s+(\w+)/g, "enum");

    // Default exports: export default
    const defaultExportRegex = /export\s+default\s+(?:class\s+(\w+)|function\s+(\w+)|(\w+))/g;
    for (const match of content.matchAll(defaultExportRegex)) {
      const name = match[1] || match[2] || match[3] || "default";
      const kind = match[1] ? "class" : match[2] ? "function" : "default";
      exports.push(this.createExportInfo(name, kind, filePath, packagePath, true));
    }

    // Re-exports: export { name } from "./module"
    const reExportRegex = /export\s*\{\s*([^}]+)\s*\}\s*from\s*["']([^"']+)["']/g;
    for (const match of content.matchAll(reExportRegex)) {
      const namesStr = match[1];
      const fromPath = match[2];
      if (!namesStr || !fromPath) continue;

      const names = namesStr.split(",").map((n) => n.trim());

      for (const nameSpec of names) {
        // Handle "name as alias" syntax
        const asMatch = nameSpec.match(/(\w+)\s+as\s+(\w+)/);
        if (asMatch?.[1] && asMatch[2]) {
          exports.push(
            this.createExportInfo(
              asMatch[2],
              "variable",
              filePath,
              packagePath,
              false,
              true,
              fromPath,
              asMatch[1]
            )
          );
        } else if (nameSpec) {
          exports.push(
            this.createExportInfo(
              nameSpec,
              "variable",
              filePath,
              packagePath,
              false,
              true,
              fromPath
            )
          );
        }
      }
    }

    // Barrel exports: export * from "./module"
    const barrelExportRegex = /export\s*\*\s*from\s*["']([^"']+)["']/g;
    for (const match of content.matchAll(barrelExportRegex)) {
      const barrelPath = match[1];
      if (!barrelPath) continue;
      // Mark for later resolution in resolveReExports
      exports.push({
        name: `__barrel__${barrelPath}`,
        kind: "variable",
        filePath,
        entityId: "",
        isDefault: false,
        isReExport: true,
        originalFile: barrelPath,
      });
    }

    return exports;
  }

  /**
   * Create an export info object
   */
  private createExportInfo(
    name: string,
    kind: ExportInfo["kind"],
    filePath: string,
    packagePath: string,
    isDefault = false,
    isReExport = false,
    originalFile?: string,
    originalName?: string
  ): ExportInfo {
    const relativePath = path.relative(packagePath, filePath);
    const entityId = generateEntityId({
      repo: this.options.repoName,
      packagePath: path.dirname(relativePath),
      kind,
      filePath: relativePath,
      scopedName: name,
    });

    return {
      name,
      kind,
      filePath,
      entityId,
      isDefault,
      isReExport,
      originalFile,
      originalName,
    };
  }

  /**
   * Resolve barrel re-exports (export * from)
   */
  private async resolveReExports(index: ExportIndexImpl, _packagePath: string): Promise<void> {
    // Find all barrel exports and resolve them
    const barrelExports: ExportInfo[] = [];

    for (const [, infos] of index.exports) {
      for (const info of infos) {
        if (info.name.startsWith("__barrel__")) {
          barrelExports.push(info);
        }
      }
    }

    // Remove barrel placeholders and add actual exports
    for (const barrel of barrelExports) {
      index.exports.delete(barrel.name);

      const originalPath = barrel.originalFile;
      if (!originalPath) continue;
      const resolvedPath = this.resolveImportPath(originalPath, barrel.filePath);

      if (resolvedPath) {
        const targetExports = index.getExportsFromFile(resolvedPath);
        for (const exp of targetExports) {
          if (!exp.isDefault) {
            const reExport: ExportInfo = {
              ...exp,
              filePath: barrel.filePath,
              isReExport: true,
              originalFile: resolvedPath,
              originalName: exp.name,
            };
            index.addExport(reExport);
          }
        }
      }
    }
  }

  /**
   * Find all import references in a package
   */
  private async findAllImportRefs(packagePath: string): Promise<ImportRef[]> {
    const files = await this.findTypeScriptFiles(packagePath);
    const refs: ImportRef[] = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf-8");

        // Named imports: import { a, b } from "./module"
        const namedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']([^"']+)["']/g;
        for (const match of content.matchAll(namedImportRegex)) {
          const namesStr = match[1];
          const importPath = match[2];
          if (!namesStr || !importPath) continue;

          const names = namesStr.split(",").map((n) => n.trim());

          for (const nameSpec of names) {
            const asMatch = nameSpec.match(/(\w+)\s+as\s+(\w+)/);
            if (asMatch?.[1] && asMatch[2]) {
              refs.push({
                importPath,
                importedName: asMatch[1],
                localName: asMatch[2],
                sourceFile: filePath,
              });
            } else if (nameSpec) {
              refs.push({
                importPath,
                importedName: nameSpec,
                sourceFile: filePath,
              });
            }
          }
        }

        // Default imports: import Name from "./module"
        const defaultImportRegex = /import\s+(\w+)\s+from\s*["']([^"']+)["']/g;
        for (const match of content.matchAll(defaultImportRegex)) {
          const localName = match[1];
          const importPath = match[2];
          if (!localName || !importPath) continue;
          refs.push({
            importPath,
            importedName: "default",
            localName,
            sourceFile: filePath,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to extract imports from ${filePath}`, error);
      }
    }

    return refs;
  }

  /**
   * Check if an import path is relative
   */
  private isRelativeImport(importPath: string): boolean {
    return importPath.startsWith("./") || importPath.startsWith("../");
  }

  /**
   * Resolve an import path to an absolute file path
   */
  private resolveImportPath(importPath: string, sourceFile: string): string | null {
    if (!this.isRelativeImport(importPath)) {
      return null;
    }

    const sourceDir = path.dirname(sourceFile);
    const basePath = path.resolve(sourceDir, importPath);

    // Try different extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

    for (const ext of extensions) {
      const fullPath = basePath + ext;
      // We don't actually check if file exists here for performance
      // The index lookup will handle missing files
      if (!basePath.endsWith(ext.replace("/", ""))) {
        return fullPath.replace(/\/index\.(ts|tsx)$/, "/index.$1");
      }
    }

    // Return with .ts extension by default
    return `${basePath}.ts`;
  }
}

/**
 * Create a new semantic resolver
 */
export function createSemanticResolver(options: SemanticResolverOptions): SemanticResolver {
  return new SemanticResolverImpl(options);
}
