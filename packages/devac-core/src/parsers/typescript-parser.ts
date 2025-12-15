/**
 * TypeScript/JavaScript Parser
 *
 * Fast AST parsing using @babel/parser without type checking.
 * Extracts nodes, edges, and external references.
 *
 * Based on DevAC v2.0 spec and ported from v1.0 structural-parser.ts
 */

import { type ParserOptions, parse } from "@babel/parser";
// @ts-expect-error - @babel/traverse doesn't have proper ESM type declarations
import _traverse from "@babel/traverse";
// Handle ESM/CommonJS interop - in ESM the function is at .default
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
import type { File as BabelFile, Node as BabelNode } from "@babel/types";
import * as t from "@babel/types";

// Type for NodePath since @babel/traverse types aren't available
type NodePath<T = BabelNode> = {
  node: T;
  parent: BabelNode;
  parentPath: NodePath | null;
};

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

import { generateEntityId } from "../analyzer/entity-id-generator.js";
import type { NodeKind, ParsedEdge, ParsedNode } from "../types/index.js";
import { createEdge, createExternalRef, createNode } from "../types/index.js";
import { computeStringHash } from "../utils/hash.js";
import type { LanguageParser, ParserConfig, StructuralParseResult } from "./parser-interface.js";
import {
  type ScopeContext,
  createScopeContext,
  generateScopedName,
  popScope,
  pushScope,
} from "./scoped-name-generator.js";

// ============================================================================
// Babel Parser Configuration
// ============================================================================

const PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  plugins: [
    "typescript",
    "jsx",
    "decorators-legacy",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "exportDefaultFrom",
    "exportNamespaceFrom",
    "dynamicImport",
    "nullishCoalescingOperator",
    "optionalChaining",
    "optionalCatchBinding",
    "numericSeparator",
    "bigInt",
    "objectRestSpread",
    "asyncGenerators",
  ],
  errorRecovery: true,
};

// ============================================================================
// TypeScript Parser Implementation
// ============================================================================

/**
 * TypeScript/JavaScript language parser
 */
export class TypeScriptParser implements LanguageParser {
  readonly language = "typescript";
  readonly extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  readonly version = "2.0.0";

  /**
   * Parse a source file
   */
  async parse(filePath: string, config: ParserConfig): Promise<StructuralParseResult> {
    const source = await readFile(filePath, "utf-8");
    return this.parseContent(source, filePath, config);
  }

  /**
   * Parse source code content directly
   */
  async parseContent(
    content: string,
    filePath: string,
    config: ParserConfig
  ): Promise<StructuralParseResult> {
    const startTime = performance.now();
    const sourceFileHash = computeStringHash(content);

    // Initialize result
    const result: StructuralParseResult = {
      nodes: [],
      edges: [],
      externalRefs: [],
      sourceFileHash,
      filePath,
      parseTimeMs: 0,
      warnings: [],
    };

    // Parse AST
    let ast: BabelFile;
    try {
      ast = parse(content, PARSER_OPTIONS);
    } catch (error) {
      result.warnings.push(
        `Parse error: ${error instanceof Error ? error.message : String(error)}`
      );
      result.parseTimeMs = performance.now() - startTime;
      return result;
    }

    // Create parser context
    const ctx = new ParserContext(filePath, config, sourceFileHash, result);

    // Create file node
    const fileNode = ctx.createFileNode(content);
    result.nodes.push(fileNode);

    // Extract nodes and relationships from AST
    this.extractFromAST(ast, ctx, fileNode.entity_id);

    result.parseTimeMs = performance.now() - startTime;
    return result;
  }

  /**
   * Check if this parser can handle a given file
   */
  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Extract nodes and relationships from Babel AST
   */
  private extractFromAST(ast: BabelFile, ctx: ParserContext, fileEntityId: string): void {
    traverse(ast, {
      // ========================================================================
      // Classes
      // ========================================================================
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      ClassDeclaration: (nodePath: any) => {
        this.handleClass(nodePath, ctx, fileEntityId);
      },

      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      ClassExpression: (nodePath: any) => {
        // Handle class expressions assigned to variables
        const parent = nodePath.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          this.handleClassExpression(nodePath, parent.id.name, ctx, fileEntityId);
        }
      },

      // ========================================================================
      // Functions
      // ========================================================================
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      FunctionDeclaration: (nodePath: any) => {
        this.handleFunction(nodePath, ctx, fileEntityId);
      },

      // Arrow functions and function expressions (const x = () => {})
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      VariableDeclarator: (nodePath: any) => {
        const node = nodePath.node;
        if (!t.isIdentifier(node.id)) return;

        if (t.isArrowFunctionExpression(node.init) || t.isFunctionExpression(node.init)) {
          this.handleArrowFunction(nodePath, ctx, fileEntityId);
        }
      },

      // ========================================================================
      // Imports
      // ========================================================================
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      ImportDeclaration: (nodePath: any) => {
        this.handleImport(nodePath, ctx, fileEntityId);
      },

      // Dynamic imports: import('module')
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      CallExpression: (nodePath: any) => {
        if (t.isImport(nodePath.node.callee)) {
          this.handleDynamicImport(nodePath, ctx, fileEntityId);
        }
      },

      // ========================================================================
      // Exports
      // ========================================================================
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      ExportNamedDeclaration: (nodePath: any) => {
        this.handleNamedExport(nodePath, ctx, fileEntityId);
      },

      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      ExportDefaultDeclaration: (nodePath: any) => {
        this.handleDefaultExport(nodePath, ctx, fileEntityId);
      },

      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      ExportAllDeclaration: (nodePath: any) => {
        this.handleExportAll(nodePath, ctx, fileEntityId);
      },

      // ========================================================================
      // TypeScript specific
      // ========================================================================
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      TSInterfaceDeclaration: (nodePath: any) => {
        this.handleInterface(nodePath, ctx, fileEntityId);
      },

      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      TSTypeAliasDeclaration: (nodePath: any) => {
        this.handleTypeAlias(nodePath, ctx, fileEntityId);
      },

      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      TSEnumDeclaration: (nodePath: any) => {
        this.handleEnum(nodePath, ctx, fileEntityId);
      },
    });
  }

  // ==========================================================================
  // Handler Methods
  // ==========================================================================

  private handleClass(
    nodePath: NodePath<t.ClassDeclaration>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    if (!node.id) return;

    const className = node.id.name;
    const scopedName = generateScopedName(
      { name: className, kind: "class", isTopLevel: true },
      ctx.scopeContext
    );

    const classNode = ctx.createNode({
      name: className,
      kind: "class",
      scopedName,
      node,
      isExported: this.isExported(nodePath),
      isDefaultExport: this.isDefaultExport(nodePath),
      isAbstract: node.abstract ?? false,
    });

    ctx.result.nodes.push(classNode);

    // CONTAINS edge: File → Class
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, classNode.entity_id, node));

    // Process class members
    pushScope(ctx.scopeContext, className);

    for (const member of node.body.body) {
      if (t.isClassMethod(member)) {
        this.handleClassMethod(member, ctx, classNode.entity_id, className);
      } else if (t.isClassProperty(member)) {
        this.handleClassProperty(member, ctx, classNode.entity_id, className);
      }
    }

    popScope(ctx.scopeContext);

    // Handle extends
    if (node.superClass && t.isIdentifier(node.superClass)) {
      ctx.result.edges.push(
        ctx.createEdge({
          sourceEntityId: classNode.entity_id,
          targetEntityId: `unresolved:${node.superClass.name}`,
          edgeType: "EXTENDS",
          node,
        })
      );
    }
  }

  private handleClassExpression(
    nodePath: NodePath<t.ClassExpression>,
    name: string,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    const scopedName = generateScopedName(
      { name, kind: "class", isTopLevel: true },
      ctx.scopeContext
    );

    const classNode = ctx.createNode({
      name,
      kind: "class",
      scopedName,
      node,
      isExported: false,
      isDefaultExport: false,
    });

    ctx.result.nodes.push(classNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, classNode.entity_id, node));
  }

  private handleClassMethod(
    node: t.ClassMethod,
    ctx: ParserContext,
    classEntityId: string,
    className: string
  ): void {
    if (!t.isIdentifier(node.key)) return;

    const methodName = node.key.name;
    const kind: NodeKind =
      node.kind === "constructor"
        ? "method"
        : node.kind === "get"
          ? "property"
          : node.kind === "set"
            ? "property"
            : "method";

    const scopedName = generateScopedName(
      {
        name: methodName,
        kind: node.static ? "static_method" : "method",
        isTopLevel: false,
        parentName: className,
      },
      ctx.scopeContext
    );

    const methodNode = ctx.createNode({
      name: methodName,
      kind,
      scopedName,
      node,
      isExported: false,
      isStatic: node.static ?? false,
      isAsync: node.async ?? false,
      isGenerator: node.generator ?? false,
    });

    ctx.result.nodes.push(methodNode);

    // CONTAINS edge: Class → Method
    ctx.result.edges.push(ctx.createContainsEdge(classEntityId, methodNode.entity_id, node));
  }

  private handleClassProperty(
    node: t.ClassProperty,
    ctx: ParserContext,
    classEntityId: string,
    className: string
  ): void {
    if (!t.isIdentifier(node.key)) return;

    const propName = node.key.name;
    const scopedName = generateScopedName(
      {
        name: propName,
        kind: node.static ? "static_property" : "property",
        isTopLevel: false,
        parentName: className,
      },
      ctx.scopeContext
    );

    const propNode = ctx.createNode({
      name: propName,
      kind: "property",
      scopedName,
      node,
      isExported: false,
      isStatic: node.static ?? false,
    });

    ctx.result.nodes.push(propNode);
    ctx.result.edges.push(ctx.createContainsEdge(classEntityId, propNode.entity_id, node));
  }

  private handleFunction(
    nodePath: NodePath<t.FunctionDeclaration>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    if (!node.id) return;

    const funcName = node.id.name;
    const scopedName = generateScopedName(
      { name: funcName, kind: "function", isTopLevel: true },
      ctx.scopeContext
    );

    const funcNode = ctx.createNode({
      name: funcName,
      kind: "function",
      scopedName,
      node,
      isExported: this.isExported(nodePath),
      isDefaultExport: this.isDefaultExport(nodePath),
      isAsync: node.async ?? false,
      isGenerator: node.generator ?? false,
    });

    ctx.result.nodes.push(funcNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, funcNode.entity_id, node));
  }

  private handleArrowFunction(
    nodePath: NodePath<t.VariableDeclarator>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    if (!t.isIdentifier(node.id)) return;

    const funcName = node.id.name;
    const funcExpr = node.init as t.ArrowFunctionExpression | t.FunctionExpression;

    const scopedName = generateScopedName(
      {
        name: funcName,
        kind: "arrow",
        isTopLevel: true,
        variableName: funcName,
      },
      ctx.scopeContext
    );

    const funcNode = ctx.createNode({
      name: funcName,
      kind: "function",
      scopedName,
      node,
      isExported: this.isVariableExported(nodePath),
      isAsync: funcExpr.async ?? false,
    });

    ctx.result.nodes.push(funcNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, funcNode.entity_id, node));
  }

  private handleImport(
    nodePath: NodePath<t.ImportDeclaration>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    const moduleSpecifier = node.source.value;
    const isTypeOnly = node.importKind === "type";

    for (const specifier of node.specifiers) {
      let importedSymbol: string;
      let localAlias: string | null = null;
      let importStyle: "named" | "default" | "namespace" = "named";

      if (t.isImportSpecifier(specifier)) {
        importedSymbol = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value;
        if (specifier.local.name !== importedSymbol) {
          localAlias = specifier.local.name;
        }
        importStyle = "named";
      } else if (t.isImportDefaultSpecifier(specifier)) {
        importedSymbol = "default";
        localAlias = specifier.local.name;
        importStyle = "default";
      } else if (t.isImportNamespaceSpecifier(specifier)) {
        importedSymbol = "*";
        localAlias = specifier.local.name;
        importStyle = "namespace";
      } else {
        continue;
      }

      // Check for type-only import on specifier (TypeScript)
      const specifierIsTypeOnly =
        t.isImportSpecifier(specifier) &&
        (specifier as t.ImportSpecifier & { importKind?: string }).importKind === "type";

      const ref = createExternalRef({
        source_entity_id: fileEntityId,
        module_specifier: moduleSpecifier,
        imported_symbol: importedSymbol,
        local_alias: localAlias,
        import_style: importStyle,
        is_type_only: isTypeOnly || specifierIsTypeOnly,
        source_file_path: ctx.filePath,
        source_line: node.loc?.start.line ?? 1,
        source_column: node.loc?.start.column ?? 0,
        source_file_hash: ctx.sourceFileHash,
        branch: ctx.config.branch,
      });

      ctx.result.externalRefs.push(ref);
    }

    // Side-effect import: import 'module'
    if (node.specifiers.length === 0) {
      const ref = createExternalRef({
        source_entity_id: fileEntityId,
        module_specifier: moduleSpecifier,
        imported_symbol: "*",
        import_style: "side_effect",
        is_type_only: false,
        source_file_path: ctx.filePath,
        source_line: node.loc?.start.line ?? 1,
        source_column: node.loc?.start.column ?? 0,
        source_file_hash: ctx.sourceFileHash,
        branch: ctx.config.branch,
      });

      ctx.result.externalRefs.push(ref);
    }
  }

  private handleDynamicImport(
    nodePath: NodePath<t.CallExpression>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    const arg = node.arguments[0];

    if (t.isStringLiteral(arg)) {
      const ref = createExternalRef({
        source_entity_id: fileEntityId,
        module_specifier: arg.value,
        imported_symbol: "*",
        import_style: "dynamic",
        is_type_only: false,
        source_file_path: ctx.filePath,
        source_line: node.loc?.start.line ?? 1,
        source_column: node.loc?.start.column ?? 0,
        source_file_hash: ctx.sourceFileHash,
        branch: ctx.config.branch,
      });

      ctx.result.externalRefs.push(ref);
    }
  }

  private handleNamedExport(
    nodePath: NodePath<t.ExportNamedDeclaration>,
    ctx: ParserContext,
    _fileEntityId: string
  ): void {
    const node = nodePath.node;

    // Re-export: export { X } from './other'
    if (node.source) {
      const moduleSpecifier = node.source.value;

      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier)) {
          const localName = t.isIdentifier(specifier.local)
            ? specifier.local.name
            : (specifier.local as t.StringLiteral).value;
          const exportedName = t.isIdentifier(specifier.exported)
            ? specifier.exported.name
            : (specifier.exported as t.StringLiteral).value;

          const ref = createExternalRef({
            source_entity_id: `reexport:${ctx.filePath}:${exportedName}`,
            module_specifier: moduleSpecifier,
            imported_symbol: localName,
            import_style: "named",
            is_type_only: node.exportKind === "type",
            source_file_path: ctx.filePath,
            source_line: node.loc?.start.line ?? 1,
            source_column: node.loc?.start.column ?? 0,
            source_file_hash: ctx.sourceFileHash,
            branch: ctx.config.branch,
            is_reexport: true,
            export_alias: exportedName !== localName ? exportedName : null,
          });

          ctx.result.externalRefs.push(ref);
        }
      }
    }
  }

  private handleDefaultExport(
    _nodePath: NodePath<t.ExportDefaultDeclaration>,
    _ctx: ParserContext,
    _fileEntityId: string
  ): void {
    // Default exports are handled by marking nodes with isDefaultExport
    // The actual node is created in handleClass, handleFunction, etc.
  }

  private handleExportAll(
    nodePath: NodePath<t.ExportAllDeclaration>,
    ctx: ParserContext,
    _fileEntityId: string
  ): void {
    const node = nodePath.node;

    if (node.source) {
      const ref = createExternalRef({
        source_entity_id: `reexport:${ctx.filePath}:*`,
        module_specifier: node.source.value,
        imported_symbol: "*",
        import_style: "namespace",
        is_type_only: node.exportKind === "type",
        source_file_path: ctx.filePath,
        source_line: node.loc?.start.line ?? 1,
        source_column: node.loc?.start.column ?? 0,
        source_file_hash: ctx.sourceFileHash,
        branch: ctx.config.branch,
        is_reexport: true,
      });

      ctx.result.externalRefs.push(ref);
    }
  }

  private handleInterface(
    nodePath: NodePath<t.TSInterfaceDeclaration>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    const name = node.id.name;

    const scopedName = generateScopedName(
      { name, kind: "class", isTopLevel: true },
      ctx.scopeContext
    );

    const interfaceNode = ctx.createNode({
      name,
      kind: "interface",
      scopedName,
      node,
      isExported: this.isExported(nodePath),
    });

    ctx.result.nodes.push(interfaceNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, interfaceNode.entity_id, node));

    // Handle extends
    if (node.extends) {
      for (const ext of node.extends) {
        if (t.isIdentifier(ext.expression)) {
          ctx.result.edges.push(
            ctx.createEdge({
              sourceEntityId: interfaceNode.entity_id,
              targetEntityId: `unresolved:${ext.expression.name}`,
              edgeType: "EXTENDS",
              node,
            })
          );
        }
      }
    }
  }

  private handleTypeAlias(
    nodePath: NodePath<t.TSTypeAliasDeclaration>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    const name = node.id.name;

    const scopedName = generateScopedName(
      { name, kind: "variable", isTopLevel: true },
      ctx.scopeContext
    );

    const typeNode = ctx.createNode({
      name,
      kind: "type",
      scopedName,
      node,
      isExported: this.isExported(nodePath),
    });

    ctx.result.nodes.push(typeNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, typeNode.entity_id, node));
  }

  private handleEnum(
    nodePath: NodePath<t.TSEnumDeclaration>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;
    const name = node.id.name;

    const scopedName = generateScopedName(
      { name, kind: "variable", isTopLevel: true },
      ctx.scopeContext
    );

    const enumNode = ctx.createNode({
      name,
      kind: "enum",
      scopedName,
      node,
      isExported: this.isExported(nodePath),
    });

    ctx.result.nodes.push(enumNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, enumNode.entity_id, node));

    // Create enum members
    for (const member of node.members) {
      if (t.isIdentifier(member.id)) {
        const memberScopedName = `${name}.${member.id.name}`;
        const memberNode = ctx.createNode({
          name: member.id.name,
          kind: "enum_member",
          scopedName: memberScopedName,
          node: member,
          isExported: false,
        });

        ctx.result.nodes.push(memberNode);
        ctx.result.edges.push(
          ctx.createContainsEdge(enumNode.entity_id, memberNode.entity_id, member)
        );
      }
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private isExported(nodePath: NodePath): boolean {
    const parent = nodePath.parent;
    return t.isExportNamedDeclaration(parent) || t.isExportDefaultDeclaration(parent);
  }

  private isDefaultExport(nodePath: NodePath): boolean {
    return t.isExportDefaultDeclaration(nodePath.parent);
  }

  private isVariableExported(nodePath: NodePath<t.VariableDeclarator>): boolean {
    const varDecl = nodePath.parentPath;
    if (!varDecl || !t.isVariableDeclaration(varDecl.node)) return false;

    const parent = varDecl.parent;
    return t.isExportNamedDeclaration(parent);
  }
}

// ============================================================================
// Parser Context
// ============================================================================

class ParserContext {
  readonly scopeContext: ScopeContext;

  constructor(
    readonly filePath: string,
    readonly config: ParserConfig,
    readonly sourceFileHash: string,
    readonly result: StructuralParseResult
  ) {
    this.scopeContext = createScopeContext();
  }

  /**
   * Create a file node
   */
  createFileNode(content: string): ParsedNode {
    const loc = content.split("\n").length;
    const _language = this.detectLanguage();

    const entityId = generateEntityId({
      repo: this.config.repoName,
      packagePath: this.config.packagePath,
      kind: "module",
      filePath: this.filePath,
      scopedName: this.filePath,
    });

    return createNode({
      entity_id: entityId,
      name: path.basename(this.filePath),
      qualified_name: this.filePath,
      kind: "module",
      file_path: this.filePath,
      start_line: 1,
      end_line: loc,
      start_column: 0,
      end_column: 0,
      is_exported: true,
      source_file_hash: this.sourceFileHash,
      branch: this.config.branch,
    });
  }

  /**
   * Create a node from AST information
   */
  createNode(opts: {
    name: string;
    kind: NodeKind;
    scopedName: string;
    node: BabelNode;
    isExported?: boolean;
    isDefaultExport?: boolean;
    isAbstract?: boolean;
    isStatic?: boolean;
    isAsync?: boolean;
    isGenerator?: boolean;
  }): ParsedNode {
    const loc = opts.node.loc;

    const entityId = generateEntityId({
      repo: this.config.repoName,
      packagePath: this.config.packagePath,
      kind: opts.kind,
      filePath: this.filePath,
      scopedName: opts.scopedName,
    });

    return createNode({
      entity_id: entityId,
      name: opts.name,
      qualified_name: opts.scopedName,
      kind: opts.kind,
      file_path: this.filePath,
      start_line: loc?.start.line ?? 1,
      end_line: loc?.end.line ?? 1,
      start_column: loc?.start.column ?? 0,
      end_column: loc?.end.column ?? 0,
      is_exported: opts.isExported ?? false,
      is_default_export: opts.isDefaultExport ?? false,
      is_abstract: opts.isAbstract ?? false,
      is_static: opts.isStatic ?? false,
      is_async: opts.isAsync ?? false,
      is_generator: opts.isGenerator ?? false,
      source_file_hash: this.sourceFileHash,
      branch: this.config.branch,
      properties: {
        language: "typescript",
      },
    });
  }

  /**
   * Create a CONTAINS edge
   */
  createContainsEdge(sourceId: string, targetId: string, node: BabelNode): ParsedEdge {
    return createEdge({
      source_entity_id: sourceId,
      target_entity_id: targetId,
      edge_type: "CONTAINS",
      source_file_path: this.filePath,
      source_line: node.loc?.start.line ?? 1,
      source_column: node.loc?.start.column ?? 0,
      source_file_hash: this.sourceFileHash,
      branch: this.config.branch,
    });
  }

  /**
   * Create a generic edge
   */
  createEdge(opts: {
    sourceEntityId: string;
    targetEntityId: string;
    edgeType: ParsedEdge["edge_type"];
    node: BabelNode;
    properties?: Record<string, unknown>;
  }): ParsedEdge {
    return createEdge({
      source_entity_id: opts.sourceEntityId,
      target_entity_id: opts.targetEntityId,
      edge_type: opts.edgeType,
      source_file_path: this.filePath,
      source_line: opts.node.loc?.start.line ?? 1,
      source_column: opts.node.loc?.start.column ?? 0,
      source_file_hash: this.sourceFileHash,
      branch: this.config.branch,
      properties: opts.properties ?? {},
    });
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(): string {
    const ext = path.extname(this.filePath).toLowerCase();
    switch (ext) {
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        return "javascript";
      default:
        return "unknown";
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a TypeScript parser instance
 */
export function createTypeScriptParser(): TypeScriptParser {
  return new TypeScriptParser();
}
