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
  /** Get the closest parent function (FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, ClassMethod) */
  getFunctionParent(): NodePath | null;
};

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

import { generateEntityId } from "../analyzer/entity-id-generator.js";
import type { NodeKind, ParsedEdge, ParsedNode } from "../types/index.js";
import {
  createEdge,
  createExternalRef,
  createFunctionCallEffect,
  createNode,
} from "../types/index.js";
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
// JSDoc Extraction Utilities
// ============================================================================

/**
 * Extract JSDoc/documentation comment from a Babel AST node
 *
 * Looks for leading block comments that follow JSDoc format (/** ... *\/)
 * and cleans up the comment text for storage.
 *
 * @param node - The AST node to extract documentation from
 * @param parentNode - Optional parent node to check (for exported declarations)
 */
function extractDocumentation(node: BabelNode, parentNode?: BabelNode | null): string | null {
  // Type for node with comments
  type NodeWithComments = BabelNode & { leadingComments?: Array<{ type: string; value: string }> };

  // First try the node itself
  let comments = (node as NodeWithComments).leadingComments;

  // If no comments on the node and we have a parent, check if it's an export declaration
  // When you have `export function foo()`, the JSDoc is attached to the ExportDeclaration
  if ((!comments || comments.length === 0) && parentNode) {
    if (t.isExportNamedDeclaration(parentNode) || t.isExportDefaultDeclaration(parentNode)) {
      comments = (parentNode as NodeWithComments).leadingComments;
    }
  }

  if (!comments || comments.length === 0) {
    return null;
  }

  // Find the last block comment (JSDoc style) before the declaration
  // We look for the last one because multiple comments may precede a declaration
  // and the JSDoc is typically the one immediately before
  const jsDocComment = [...comments]
    .reverse()
    .find((c) => c.type === "CommentBlock" && c.value.startsWith("*"));

  if (!jsDocComment) {
    return null;
  }

  // Clean up the JSDoc comment
  return cleanJSDocComment(jsDocComment.value);
}

/**
 * Clean up JSDoc comment text
 *
 * Removes leading asterisks and normalizes whitespace while preserving
 * the meaningful content.
 */
function cleanJSDocComment(value: string): string | null {
  // The value comes without the outer /* */ markers
  // Split into lines and process each
  const lines = value.split("\n");

  const cleanedLines = lines.map((line) => {
    // Remove leading whitespace and asterisk
    const cleaned = line.replace(/^\s*\*\s?/, "");
    // Also handle trailing whitespace
    return cleaned.trimEnd();
  });

  // Remove empty leading/trailing lines
  while (cleanedLines.length > 0 && cleanedLines[0]?.trim() === "") {
    cleanedLines.shift();
  }
  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1]?.trim() === "") {
    cleanedLines.pop();
  }

  const result = cleanedLines.join("\n").trim();

  // Return null if the cleaned comment is empty
  return result.length > 0 ? result : null;
}

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
      effects: [],
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

      // Call expressions: function calls, method calls
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      CallExpression: (nodePath: any) => {
        // Dynamic imports: import('module')
        if (t.isImport(nodePath.node.callee)) {
          this.handleDynamicImport(nodePath, ctx, fileEntityId);
        }

        // Handle CALLS edges for all call expressions
        this.handleCallExpression(nodePath, ctx, fileEntityId);
      },

      // New expressions: constructor calls (new X())
      // biome-ignore lint/suspicious/noExplicitAny: Babel traverse callback types are untyped
      NewExpression: (nodePath: any) => {
        this.handleNewExpression(nodePath, ctx, fileEntityId);
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
      parentNode: nodePath.parent,
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

    // Register for CALLS edge lookups
    ctx.registerNodeEntity(node, methodNode.entity_id);
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
      parentNode: nodePath.parent,
      isExported: this.isExported(nodePath),
      isDefaultExport: this.isDefaultExport(nodePath),
      isAsync: node.async ?? false,
      isGenerator: node.generator ?? false,
    });

    ctx.result.nodes.push(funcNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, funcNode.entity_id, node));

    // Register for CALLS edge lookups
    ctx.registerNodeEntity(node, funcNode.entity_id);
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

    // For arrow functions, JSDoc is attached to VariableDeclaration (parent of VariableDeclarator)
    // We need to extract from the parent node
    const varDecl = nodePath.parentPath;
    const documentation =
      ctx.config.includeDocumentation && varDecl?.node ? extractDocumentation(varDecl.node) : null;

    const funcNode = ctx.createNode({
      name: funcName,
      kind: "function",
      scopedName,
      node,
      isExported: this.isVariableExported(nodePath),
      isAsync: funcExpr.async ?? false,
      documentation,
    });

    ctx.result.nodes.push(funcNode);
    ctx.result.edges.push(ctx.createContainsEdge(fileEntityId, funcNode.entity_id, node));

    // Register the actual function expression for CALLS edge lookups
    ctx.registerNodeEntity(funcExpr, funcNode.entity_id);
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

  /**
   * Handle call expressions to create CALLS edges and FunctionCallEffects
   */
  private handleCallExpression(
    nodePath: NodePath<t.CallExpression>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;

    // Skip dynamic imports - they're handled separately
    if (t.isImport(node.callee)) {
      return;
    }

    // Find the enclosing function to get the source entity
    const enclosingFunction = nodePath.getFunctionParent();
    let sourceEntityId: string;

    if (enclosingFunction) {
      // Look up the entity ID for this function
      const funcEntityId = ctx.getNodeEntityId(enclosingFunction.node);
      if (funcEntityId) {
        sourceEntityId = funcEntityId;
      } else {
        // Function not registered (e.g., inline arrow in argument)
        // Use file as the source
        sourceEntityId = fileEntityId;
      }
    } else {
      // Top-level call (module initialization)
      sourceEntityId = fileEntityId;
    }

    // Extract callee name
    const calleeName = this.extractCalleeName(node.callee);
    if (!calleeName) {
      return; // Can't determine callee (e.g., computed call like arr[0]())
    }

    // Create target entity ID
    // For unresolved references, prefix with "unresolved:"
    const targetEntityId = `unresolved:${calleeName}`;

    // Determine if this is a method call (obj.method())
    const isMethodCall = t.isMemberExpression(node.callee);

    // Determine if this is a constructor call (new X())
    const isConstructor = t.isNewExpression(nodePath.parent);

    // Determine if this is an async call (parent is AwaitExpression)
    const isAsync = t.isAwaitExpression(nodePath.parent);

    // Create CALLS edge
    ctx.result.edges.push(
      ctx.createEdge({
        sourceEntityId,
        targetEntityId,
        edgeType: "CALLS",
        node,
        properties: {
          callee: calleeName,
          argumentCount: node.arguments.length,
        },
      })
    );

    // Create FunctionCallEffect
    const effect = createFunctionCallEffect({
      source_entity_id: sourceEntityId,
      source_file_path: ctx.filePath,
      source_line: node.loc?.start.line ?? 1,
      source_column: node.loc?.start.column ?? 0,
      branch: ctx.config.branch,
      callee_name: calleeName,
      target_entity_id: targetEntityId,
      callee_qualified_name: calleeName,
      is_method_call: isMethodCall,
      is_async: isAsync,
      is_constructor: isConstructor,
      argument_count: node.arguments.length,
      is_external: false, // Will be resolved during edge resolution
      external_module: null,
    });

    ctx.result.effects.push(effect);
  }

  /**
   * Handle new expressions to create CALLS edges and FunctionCallEffects for constructor calls
   */
  private handleNewExpression(
    nodePath: NodePath<t.NewExpression>,
    ctx: ParserContext,
    fileEntityId: string
  ): void {
    const node = nodePath.node;

    // Find the enclosing function to get the source entity
    const enclosingFunction = nodePath.getFunctionParent();
    let sourceEntityId: string;

    if (enclosingFunction) {
      const funcEntityId = ctx.getNodeEntityId(enclosingFunction.node);
      if (funcEntityId) {
        sourceEntityId = funcEntityId;
      } else {
        sourceEntityId = fileEntityId;
      }
    } else {
      sourceEntityId = fileEntityId;
    }

    // Extract callee name (the constructor being called)
    const calleeName = this.extractCalleeName(node.callee);
    if (!calleeName) {
      return;
    }

    const targetEntityId = `unresolved:${calleeName}`;

    // Determine if this is an async call (parent is AwaitExpression)
    const isAsync = t.isAwaitExpression(nodePath.parent);

    // Create CALLS edge for constructor
    ctx.result.edges.push(
      ctx.createEdge({
        sourceEntityId,
        targetEntityId,
        edgeType: "CALLS",
        node,
        properties: {
          callee: calleeName,
          argumentCount: node.arguments.length,
          isConstructor: true,
        },
      })
    );

    // Create FunctionCallEffect for constructor call
    const effect = createFunctionCallEffect({
      source_entity_id: sourceEntityId,
      source_file_path: ctx.filePath,
      source_line: node.loc?.start.line ?? 1,
      source_column: node.loc?.start.column ?? 0,
      branch: ctx.config.branch,
      callee_name: calleeName,
      target_entity_id: targetEntityId,
      callee_qualified_name: calleeName,
      is_method_call: false,
      is_async: isAsync,
      is_constructor: true,
      argument_count: node.arguments.length,
      is_external: false,
      external_module: null,
    });

    ctx.result.effects.push(effect);
  }

  /**
   * Extract a readable name from a callee expression
   *
   * Examples:
   * - Identifier: foo() → "foo"
   * - Member expression: obj.method() → "obj.method"
   * - Chained: a.b.c() → "a.b.c"
   * - Call chain: foo().bar() → "bar" (the immediate call)
   */
  private extractCalleeName(callee: t.Expression | t.V8IntrinsicIdentifier): string | null {
    if (t.isIdentifier(callee)) {
      return callee.name;
    }

    // Handle super() calls
    if (t.isSuper(callee)) {
      return "super";
    }

    if (t.isMemberExpression(callee)) {
      // Get the property name
      let property: string;
      if (t.isIdentifier(callee.property)) {
        property = callee.property.name;
      } else if (t.isStringLiteral(callee.property)) {
        property = callee.property.value;
      } else {
        // Computed property we can't resolve statically
        return null;
      }

      // Get the object part
      const objectName = this.extractObjectName(callee.object);
      if (objectName) {
        return `${objectName}.${property}`;
      }

      // If object is complex (call result, etc.), just use the property
      return property;
    }

    if (t.isCallExpression(callee)) {
      // Chained call like foo()() - return null as we can't know the callee
      return null;
    }

    // Other cases (TaggedTemplateExpression, etc.)
    return null;
  }

  /**
   * Extract object name from member expression object
   */
  private extractObjectName(object: t.Expression | t.Super): string | null {
    if (t.isIdentifier(object)) {
      return object.name;
    }

    if (t.isThisExpression(object)) {
      return "this";
    }

    if (t.isSuper(object)) {
      return "super";
    }

    if (t.isMemberExpression(object)) {
      const objName = this.extractObjectName(object.object);
      if (objName && t.isIdentifier(object.property)) {
        return `${objName}.${object.property.name}`;
      }
    }

    return null;
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
      parentNode: nodePath.parent,
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
      parentNode: nodePath.parent,
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
      parentNode: nodePath.parent,
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

  /**
   * Maps AST node start positions to entity IDs.
   * Used to look up the entity ID of an enclosing function/method for CALLS edges.
   * Key format: "line:column"
   */
  readonly nodeToEntityId: Map<string, string> = new Map();

  constructor(
    readonly filePath: string,
    readonly config: ParserConfig,
    readonly sourceFileHash: string,
    readonly result: StructuralParseResult
  ) {
    this.scopeContext = createScopeContext();
  }

  /**
   * Register an AST node's location to its entity ID
   */
  registerNodeEntity(node: BabelNode, entityId: string): void {
    if (node.loc) {
      const key = `${node.loc.start.line}:${node.loc.start.column}`;
      this.nodeToEntityId.set(key, entityId);
    }
  }

  /**
   * Get entity ID for an AST node by its location
   */
  getNodeEntityId(node: BabelNode): string | undefined {
    if (node.loc) {
      const key = `${node.loc.start.line}:${node.loc.start.column}`;
      return this.nodeToEntityId.get(key);
    }
    return undefined;
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
    parentNode?: BabelNode | null;
    isExported?: boolean;
    isDefaultExport?: boolean;
    isAbstract?: boolean;
    isStatic?: boolean;
    isAsync?: boolean;
    isGenerator?: boolean;
    documentation?: string | null;
  }): ParsedNode {
    const loc = opts.node.loc;

    const entityId = generateEntityId({
      repo: this.config.repoName,
      packagePath: this.config.packagePath,
      kind: opts.kind,
      filePath: this.filePath,
      scopedName: opts.scopedName,
    });

    // Extract documentation if not explicitly provided and config allows
    const documentation =
      opts.documentation !== undefined
        ? opts.documentation
        : this.config.includeDocumentation
          ? extractDocumentation(opts.node, opts.parentNode)
          : null;

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
      documentation,
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
