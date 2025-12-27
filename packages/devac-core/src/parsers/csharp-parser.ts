/**
 * C# Language Parser
 *
 * Uses tree-sitter-c-sharp for parsing C# source files.
 * Based on DevAC v2.0 spec Phase 6 requirements.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

// @ts-ignore - tree-sitter type issues
import Parser from "tree-sitter";
// @ts-ignore - tree-sitter-c-sharp type issues
import CSharp from "tree-sitter-c-sharp";

import { generateEntityId as generateEntityIdBase } from "../analyzer/entity-id-generator.js";
import type {
  NodeKind,
  ParsedEdge,
  ParsedExternalRef,
  ParsedNode,
  Visibility,
} from "../types/index.js";
import { createEdge, createExternalRef, createNode } from "../types/index.js";
import { computeStringHash } from "../utils/hash.js";

/**
 * Helper to generate entity ID with the correct object format
 */
function genEntityId(ctx: ParseContext, kind: string, scopedName: string): string {
  return generateEntityIdBase({
    repo: ctx.config.repoName,
    packagePath: ctx.config.packagePath,
    kind,
    filePath: ctx.filePath,
    scopedName,
  });
}
import type { LanguageParser, ParserConfig, StructuralParseResult } from "./parser-interface.js";
import { createEmptyParseResult } from "./parser-interface.js";

// ============================================================================
// Types
// ============================================================================

interface ParseContext {
  config: ParserConfig;
  filePath: string;
  sourceFileHash: string;
  currentNamespace: string | null;
  currentNamespaceId: string | null;
  currentContainerId: string | null;
  currentContainerName: string | null;
  currentMethodId: string | null;
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  externalRefs: ParsedExternalRef[];
  warnings: string[];
}

type SyntaxNode = Parser.SyntaxNode;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get text content of a node safely
 */
function getNodeText(node: SyntaxNode | null | undefined): string {
  return node?.text ?? "";
}

/**
 * Get child node by field name
 */
function getChildByField(node: SyntaxNode, fieldName: string): SyntaxNode | null {
  return node.childForFieldName(fieldName);
}

/**
 * Find first child of specific type
 */
function findChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
  for (const child of node.children) {
    if (child.type === type) {
      return child;
    }
  }
  return null;
}

/**
 * Find all children of specific type
 */
function findChildrenByType(node: SyntaxNode, type: string): SyntaxNode[] {
  return node.children.filter((child) => child.type === type);
}

/**
 * Get all modifier nodes from a declaration node
 * In tree-sitter-c-sharp, modifiers are individual 'modifier' children, not a 'modifiers' group
 */
function getModifiers(node: SyntaxNode): SyntaxNode[] {
  return node.children.filter((child) => child.type === "modifier");
}

/**
 * Check if a declaration node has a specific modifier
 */
function hasModifier(node: SyntaxNode, modifier: string): boolean {
  const modifiers = getModifiers(node);
  return modifiers.some((m) => m.text === modifier);
}

/**
 * Get visibility from a declaration node
 */
function getVisibility(node: SyntaxNode): Visibility {
  const modifiers = getModifiers(node);

  for (const mod of modifiers) {
    switch (mod.text) {
      case "public":
        return "public";
      case "private":
        return "private";
      case "protected":
        return "protected";
      case "internal":
        return "internal";
    }
  }
  return "internal"; // C# default
}

/**
 * Extract type parameters from a generic type declaration
 */
function extractTypeParameters(node: SyntaxNode): string[] {
  const typeParams: string[] = [];
  const typeParamList = findChildByType(node, "type_parameter_list");
  if (typeParamList) {
    for (const param of typeParamList.namedChildren) {
      if (param.type === "type_parameter") {
        typeParams.push(getNodeText(param));
      }
    }
  }
  return typeParams;
}

/**
 * Extract type constraints from a generic declaration
 */
function extractTypeConstraints(node: SyntaxNode): Record<string, string[]> {
  const constraints: Record<string, string[]> = {};
  const constraintClauses = findChildrenByType(node, "type_parameter_constraints_clause");

  for (const clause of constraintClauses) {
    // The first identifier in the clause is the type parameter name
    const nameNode = findChildByType(clause, "identifier");
    const name = getNodeText(nameNode);
    if (name) {
      constraints[name] = [];
      // Constraints are type_parameter_constraint children
      const constraintNodes = findChildrenByType(clause, "type_parameter_constraint");
      for (const constraint of constraintNodes) {
        constraints[name].push(getNodeText(constraint));
      }
    }
  }

  return constraints;
}

/**
 * Extract attributes from an attribute list
 */
function extractAttributes(node: SyntaxNode): string[] {
  const attributes: string[] = [];
  const attrLists = findChildrenByType(node, "attribute_list");

  for (const attrList of attrLists) {
    for (const attr of attrList.namedChildren) {
      if (attr.type === "attribute") {
        const nameNode = getChildByField(attr, "name");
        const name = getNodeText(nameNode);
        if (name) {
          // Remove "Attribute" suffix if present
          const cleanName = name.replace(/Attribute$/, "");
          attributes.push(cleanName);
        }
      }
    }
  }

  return attributes;
}

/**
 * Build qualified name for a symbol
 */
function buildQualifiedName(ctx: ParseContext, name: string): string {
  if (ctx.currentContainerName) {
    return ctx.currentNamespace
      ? `${ctx.currentNamespace}.${ctx.currentContainerName}.${name}`
      : `${ctx.currentContainerName}.${name}`;
  }
  return ctx.currentNamespace ? `${ctx.currentNamespace}.${name}` : name;
}

// ============================================================================
// Node Visitors
// ============================================================================

/**
 * Visit a namespace declaration
 */
function visitNamespaceDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const entityId = genEntityId(ctx, "namespace", name);

  const nsNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: name,
    kind: "namespace",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    is_exported: true,
    branch: ctx.config.branch,
  });

  ctx.nodes.push(nsNode);

  // Store namespace context for children
  const previousNamespace = ctx.currentNamespace;
  const previousNamespaceId = ctx.currentNamespaceId;
  ctx.currentNamespace = name;
  ctx.currentNamespaceId = entityId;

  // Visit children (the declaration body)
  const body = findChildByType(node, "declaration_list");
  if (body) {
    visitChildren(body, ctx);
  }

  // Restore context
  ctx.currentNamespace = previousNamespace;
  ctx.currentNamespaceId = previousNamespaceId;
}

/**
 * Visit a file-scoped namespace declaration (C# 10+)
 */
function visitFileScopedNamespace(node: SyntaxNode, ctx: ParseContext): void {
  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const entityId = genEntityId(ctx, "namespace", name);

  const nsNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: name,
    kind: "namespace",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    is_exported: true,
    branch: ctx.config.branch,
  });

  ctx.nodes.push(nsNode);
  ctx.currentNamespace = name;
  ctx.currentNamespaceId = entityId;
}

/**
 * Visit a using directive
 */
function visitUsingDirective(node: SyntaxNode, ctx: ParseContext): void {
  const isStatic = findChildByType(node, "static") !== null;
  const _isGlobal = findChildByType(node, "global") !== null;

  // Check for alias - in tree-sitter-c-sharp, an alias looks like:
  // using_directive { identifier("Alias"), "=", qualified_name(...) }
  // The name field returns the alias, and qualified_name is the target
  const hasEquals = node.children.some((c) => c.type === "=" || c.text === "=");
  const nameField = getChildByField(node, "name");
  const qualifiedNameNode = findChildByType(node, "qualified_name");

  let alias: string | null = null;
  let moduleSpecifier: string;

  if (hasEquals && nameField && qualifiedNameNode) {
    // This is an alias: using Alias = Namespace.Name;
    alias = getNodeText(nameField);
    moduleSpecifier = getNodeText(qualifiedNameNode);
  } else {
    // Regular using: using Namespace.Name;
    // or: using static Namespace.Type;
    const identifierNode = findChildByType(node, "identifier");
    moduleSpecifier = getNodeText(qualifiedNameNode) || getNodeText(identifierNode);
  }

  if (!moduleSpecifier) return;

  // Determine the source entity - use file-level pseudo entity
  const sourceEntityId = genEntityId(ctx, "module", ctx.filePath);

  const externalRef = createExternalRef({
    source_entity_id: sourceEntityId,
    source_file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    module_specifier: moduleSpecifier,
    imported_symbol: isStatic ? "*" : moduleSpecifier.split(".").pop() || "*",
    local_alias: alias,
    is_type_only: false,
    import_style: "named",
  });

  ctx.externalRefs.push(externalRef);
}

/**
 * Visit a class declaration
 */
function visitClassDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  visitTypeDeclaration(node, ctx, "class", {});
}

/**
 * Visit a struct declaration
 */
function visitStructDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  visitTypeDeclaration(node, ctx, "class", { isStruct: true });
}

/**
 * Visit a record declaration
 */
function visitRecordDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  const isStruct = findChildByType(node, "struct") !== null;
  visitTypeDeclaration(node, ctx, "class", { isRecord: true, isStruct });
}

/**
 * Visit an interface declaration
 */
function visitInterfaceDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  visitTypeDeclaration(node, ctx, "interface", {});
}

/**
 * Visit an enum declaration
 */
function visitEnumDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const attributes = extractAttributes(node);
  const qualifiedName = buildQualifiedName(ctx, name);

  const entityId = genEntityId(ctx, "enum", qualifiedName);

  const enumNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "enum",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    decorators: attributes,
    branch: ctx.config.branch,
  });

  ctx.nodes.push(enumNode);

  // Add CONTAINS edge from namespace
  if (ctx.currentNamespaceId) {
    addContainsEdge(ctx, ctx.currentNamespaceId, entityId, node);
  }

  // Visit enum members
  const body = findChildByType(node, "enum_member_declaration_list");
  if (body) {
    for (const member of body.namedChildren) {
      if (member.type === "enum_member_declaration") {
        visitEnumMember(member, ctx, entityId, qualifiedName);
      }
    }
  }
}

/**
 * Visit an enum member
 */
function visitEnumMember(
  node: SyntaxNode,
  ctx: ParseContext,
  parentId: string,
  parentQualifiedName: string
): void {
  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const qualifiedName = `${parentQualifiedName}.${name}`;

  const entityId = genEntityId(ctx, "enum_member", qualifiedName);

  const memberNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "enum_member",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    is_exported: true,
    branch: ctx.config.branch,
  });

  ctx.nodes.push(memberNode);
  addContainsEdge(ctx, parentId, entityId, node);
}

/**
 * Generic type declaration visitor
 */
function visitTypeDeclaration(
  node: SyntaxNode,
  ctx: ParseContext,
  kind: NodeKind,
  properties: Record<string, unknown>
): void {
  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const typeParams = extractTypeParameters(node);
  const typeConstraints = extractTypeConstraints(node);
  const attributes = extractAttributes(node);
  const qualifiedName = ctx.currentNamespace ? `${ctx.currentNamespace}.${name}` : name;

  const entityId = genEntityId(ctx, kind, qualifiedName);

  const typeNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind,
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    is_abstract: hasModifier(node, "abstract"),
    is_static: hasModifier(node, "static"),
    type_parameters: typeParams,
    decorators: attributes,
    properties: {
      ...properties,
      isSealed: hasModifier(node, "sealed"),
      isPartial: hasModifier(node, "partial"),
      typeConstraints: Object.keys(typeConstraints).length > 0 ? typeConstraints : undefined,
    },
    branch: ctx.config.branch,
  });

  ctx.nodes.push(typeNode);

  // Add CONTAINS edge from namespace
  if (ctx.currentNamespaceId) {
    addContainsEdge(ctx, ctx.currentNamespaceId, entityId, node);
  }

  // Add decorator edges
  for (const attr of attributes) {
    addDecoratesEdge(ctx, attr, entityId, node);
  }

  // Handle base types
  const baseList = findChildByType(node, "base_list");
  if (baseList) {
    visitBaseList(baseList, ctx, entityId, kind);
  }

  // Visit members
  const previousContainerId = ctx.currentContainerId;
  const previousContainerName = ctx.currentContainerName;
  ctx.currentContainerId = entityId;
  ctx.currentContainerName = qualifiedName;

  const body = findChildByType(node, "declaration_list");
  if (body) {
    visitChildren(body, ctx);
  }

  // Handle record positional parameters as properties
  if (properties.isRecord) {
    const paramList = findChildByType(node, "parameter_list");
    if (paramList) {
      visitRecordParameters(paramList, ctx, entityId, qualifiedName);
    }
  }

  ctx.currentContainerId = previousContainerId;
  ctx.currentContainerName = previousContainerName;
}

/**
 * Visit record positional parameters (treated as properties)
 */
function visitRecordParameters(
  paramList: SyntaxNode,
  ctx: ParseContext,
  parentId: string,
  parentQualifiedName: string
): void {
  for (const param of paramList.namedChildren) {
    if (param.type === "parameter") {
      const nameNode = getChildByField(param, "name");
      const typeNode = getChildByField(param, "type");
      const name = getNodeText(nameNode);
      const typeName = getNodeText(typeNode);

      if (!name) continue;

      const qualifiedName = `${parentQualifiedName}.${name}`;
      const entityId = genEntityId(ctx, "property", qualifiedName);

      const propNode = createNode({
        entity_id: entityId,
        name,
        qualified_name: qualifiedName,
        kind: "property",
        file_path: ctx.filePath,
        source_file_hash: ctx.sourceFileHash,
        start_line: param.startPosition.row + 1,
        end_line: param.endPosition.row + 1,
        start_column: param.startPosition.column,
        end_column: param.endPosition.column,
        type_signature: typeName || null,
        is_exported: true,
        visibility: "public",
        branch: ctx.config.branch,
      });

      ctx.nodes.push(propNode);
      addContainsEdge(ctx, parentId, entityId, param);
    }
  }
}

/**
 * Visit base type list
 */
function visitBaseList(
  node: SyntaxNode,
  ctx: ParseContext,
  typeId: string,
  typeKind: NodeKind
): void {
  let isFirstBase = true;

  for (const baseType of node.namedChildren) {
    if (
      baseType.type === "simple_base_type" ||
      baseType.type === "generic_name" ||
      baseType.type === "identifier" ||
      baseType.type === "qualified_name"
    ) {
      const baseName = getNodeText(baseType);

      // For classes, first base could be a class (EXTENDS) or interface (IMPLEMENTS)
      // For interfaces, all bases are interfaces (EXTENDS)
      // Convention: interface names typically start with "I"
      const isInterface =
        baseName.startsWith("I") &&
        baseName.length > 1 &&
        baseName.charAt(1) === baseName.charAt(1).toUpperCase();

      const edgeType =
        (typeKind === "interface" || isInterface) &&
        !(typeKind === "class" && isFirstBase && !isInterface)
          ? typeKind === "interface"
            ? "EXTENDS"
            : "IMPLEMENTS"
          : "EXTENDS";

      // Create a placeholder target ID for the base type
      const targetId = genEntityId(ctx, isInterface ? "interface" : "class", baseName);

      const edge = createEdge({
        source_entity_id: typeId,
        target_entity_id: targetId,
        edge_type: edgeType,
        source_file_path: ctx.filePath,
        source_file_hash: ctx.sourceFileHash,
        source_line: baseType.startPosition.row + 1,
        source_column: baseType.startPosition.column,
        properties: { targetName: baseName },
        branch: ctx.config.branch,
      });

      ctx.edges.push(edge);
      isFirstBase = false;
    }
  }
}

/**
 * Visit a method declaration
 */
function visitMethodDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  if (!ctx.currentContainerId) return;

  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const returnTypeNode = getChildByField(node, "type") || getChildByField(node, "returns");
  const returnType = getNodeText(returnTypeNode);
  const typeParams = extractTypeParameters(node);
  const attributes = extractAttributes(node);

  const qualifiedName = `${ctx.currentContainerName}.${name}`;

  const entityId = genEntityId(ctx, "method", qualifiedName);

  const methodNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "method",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    is_async: hasModifier(node, "async"),
    is_static: hasModifier(node, "static"),
    is_abstract: hasModifier(node, "abstract"),
    type_signature: returnType || null,
    type_parameters: typeParams,
    decorators: attributes,
    properties: {
      isVirtual: hasModifier(node, "virtual"),
      isOverride: hasModifier(node, "override"),
      isSealed: hasModifier(node, "sealed"),
      isExtern: hasModifier(node, "extern"),
    },
    branch: ctx.config.branch,
  });

  ctx.nodes.push(methodNode);
  addContainsEdge(ctx, ctx.currentContainerId, entityId, node);

  // Add decorator edges
  for (const attr of attributes) {
    addDecoratesEdge(ctx, attr, entityId, node);
  }

  // Visit parameters
  const paramList = getChildByField(node, "parameters");
  if (paramList) {
    visitParameters(paramList, ctx, entityId, qualifiedName);
  }

  // Visit method body to extract CALLS edges
  const previousMethodId = ctx.currentMethodId;
  ctx.currentMethodId = entityId;

  const body = findChildByType(node, "block");
  if (body) {
    visitMethodBody(body, ctx);
  }

  // Also check for expression body (arrow expression)
  const arrowBody = findChildByType(node, "arrow_expression_clause");
  if (arrowBody) {
    visitMethodBody(arrowBody, ctx);
  }

  ctx.currentMethodId = previousMethodId;
}

/**
 * Visit a constructor declaration
 */
function visitConstructorDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  if (!ctx.currentContainerId) return;

  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const attributes = extractAttributes(node);

  const qualifiedName = `${ctx.currentContainerName}.${name}`;

  const entityId = genEntityId(ctx, "method", `${qualifiedName}.ctor`);

  const ctorNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "method",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    is_static: hasModifier(node, "static"),
    decorators: attributes,
    properties: {
      isConstructor: true,
    },
    branch: ctx.config.branch,
  });

  ctx.nodes.push(ctorNode);
  addContainsEdge(ctx, ctx.currentContainerId, entityId, node);

  // Visit constructor body to extract CALLS edges
  const previousMethodId = ctx.currentMethodId;
  ctx.currentMethodId = entityId;

  const body = findChildByType(node, "block");
  if (body) {
    visitMethodBody(body, ctx);
  }

  // Check for constructor initializer (base() or this() calls)
  const initializer = findChildByType(node, "constructor_initializer");
  if (initializer) {
    visitConstructorInitializer(initializer, ctx);
  }

  ctx.currentMethodId = previousMethodId;
}

/**
 * Visit method parameters
 */
function visitParameters(
  paramList: SyntaxNode,
  ctx: ParseContext,
  methodId: string,
  methodQualifiedName: string
): void {
  let isFirstParam = true;

  for (const param of paramList.namedChildren) {
    if (param.type === "parameter") {
      const nameNode = getChildByField(param, "name");
      const typeNode = getChildByField(param, "type");
      const name = getNodeText(nameNode);
      const typeName = getNodeText(typeNode);

      if (!name) continue;

      // Check if this is an extension method (first param has 'this' modifier)
      // In tree-sitter-c-sharp, the 'this' keyword is a 'modifier' child of the parameter
      const isThis = hasModifier(param, "this");

      if (isThis && isFirstParam) {
        // Mark the method as an extension method
        const methodNode = ctx.nodes.find((n) => n.entity_id === methodId);
        if (methodNode) {
          methodNode.properties = {
            ...methodNode.properties,
            isExtension: true,
          };
        }
      }

      const qualifiedName = `${methodQualifiedName}.${name}`;
      const entityId = genEntityId(ctx, "parameter", qualifiedName);

      const paramNode = createNode({
        entity_id: entityId,
        name,
        qualified_name: qualifiedName,
        kind: "parameter",
        file_path: ctx.filePath,
        source_file_hash: ctx.sourceFileHash,
        start_line: param.startPosition.row + 1,
        end_line: param.endPosition.row + 1,
        start_column: param.startPosition.column,
        end_column: param.endPosition.column,
        type_signature: typeName || null,
        branch: ctx.config.branch,
      });

      ctx.nodes.push(paramNode);

      // Add PARAMETER_OF edge
      const edge = createEdge({
        source_entity_id: entityId,
        target_entity_id: methodId,
        edge_type: "PARAMETER_OF",
        source_file_path: ctx.filePath,
        source_file_hash: ctx.sourceFileHash,
        source_line: param.startPosition.row + 1,
        source_column: param.startPosition.column,
        branch: ctx.config.branch,
      });
      ctx.edges.push(edge);

      isFirstParam = false;
    }
  }
}

/**
 * Visit a property declaration
 */
function visitPropertyDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  if (!ctx.currentContainerId) return;

  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const typeNode = getChildByField(node, "type");
  const typeName = getNodeText(typeNode);
  const attributes = extractAttributes(node);

  const qualifiedName = `${ctx.currentContainerName}.${name}`;

  const entityId = genEntityId(ctx, "property", qualifiedName);

  const propNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "property",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    is_static: hasModifier(node, "static"),
    is_abstract: hasModifier(node, "abstract"),
    type_signature: typeName || null,
    decorators: attributes,
    properties: {
      isVirtual: hasModifier(node, "virtual"),
      isOverride: hasModifier(node, "override"),
    },
    branch: ctx.config.branch,
  });

  ctx.nodes.push(propNode);
  addContainsEdge(ctx, ctx.currentContainerId, entityId, node);

  // Add decorator edges
  for (const attr of attributes) {
    addDecoratesEdge(ctx, attr, entityId, node);
  }
}

/**
 * Visit a field declaration
 */
function visitFieldDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  if (!ctx.currentContainerId) return;

  const typeNode = getChildByField(node, "type");
  const typeName = getNodeText(typeNode);
  const attributes = extractAttributes(node);

  // Field can have multiple declarators
  const declaration = findChildByType(node, "variable_declaration");
  if (!declaration) return;

  for (const declarator of declaration.namedChildren) {
    if (declarator.type === "variable_declarator") {
      const nameNode =
        getChildByField(declarator, "name") || findChildByType(declarator, "identifier");
      const name = getNodeText(nameNode);
      if (!name) continue;

      const qualifiedName = `${ctx.currentContainerName}.${name}`;

      const entityId = genEntityId(ctx, "variable", qualifiedName);

      const fieldNode = createNode({
        entity_id: entityId,
        name,
        qualified_name: qualifiedName,
        kind: "variable",
        file_path: ctx.filePath,
        source_file_hash: ctx.sourceFileHash,
        start_line: declarator.startPosition.row + 1,
        end_line: declarator.endPosition.row + 1,
        start_column: declarator.startPosition.column,
        end_column: declarator.endPosition.column,
        visibility: getVisibility(node),
        is_exported: hasModifier(node, "public"),
        is_static: hasModifier(node, "static"),
        type_signature: typeName || null,
        decorators: attributes,
        properties: {
          isReadonly: hasModifier(node, "readonly"),
          isConst: hasModifier(node, "const"),
          isVolatile: hasModifier(node, "volatile"),
        },
        branch: ctx.config.branch,
      });

      ctx.nodes.push(fieldNode);
      addContainsEdge(ctx, ctx.currentContainerId, entityId, node);
    }
  }
}

/**
 * Visit an event declaration
 */
function visitEventDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  if (!ctx.currentContainerId) return;

  const typeNode = getChildByField(node, "type");
  const typeName = getNodeText(typeNode);
  const attributes = extractAttributes(node);

  // Get event name - could be in different places depending on event style
  const declaration = findChildByType(node, "variable_declaration");
  let name: string | null = null;

  if (declaration) {
    const declarator = findChildByType(declaration, "variable_declarator");
    if (declarator) {
      const nameNode =
        getChildByField(declarator, "name") || findChildByType(declarator, "identifier");
      name = getNodeText(nameNode);
    }
  } else {
    const nameNode = getChildByField(node, "name");
    name = getNodeText(nameNode);
  }

  if (!name) return;

  const qualifiedName = `${ctx.currentContainerName}.${name}`;

  const entityId = genEntityId(ctx, "property", qualifiedName);

  const eventNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "property",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    is_static: hasModifier(node, "static"),
    type_signature: typeName || null,
    decorators: attributes,
    properties: {
      isEvent: true,
    },
    branch: ctx.config.branch,
  });

  ctx.nodes.push(eventNode);
  addContainsEdge(ctx, ctx.currentContainerId, entityId, node);
}

/**
 * Visit a delegate declaration
 */
function visitDelegateDeclaration(node: SyntaxNode, ctx: ParseContext): void {
  const nameNode = getChildByField(node, "name");
  const name = getNodeText(nameNode);
  if (!name) return;

  const returnTypeNode = getChildByField(node, "type");
  const returnType = getNodeText(returnTypeNode);
  const typeParams = extractTypeParameters(node);
  const attributes = extractAttributes(node);

  const qualifiedName = buildQualifiedName(ctx, name);

  const entityId = genEntityId(ctx, "type", qualifiedName);

  const delegateNode = createNode({
    entity_id: entityId,
    name,
    qualified_name: qualifiedName,
    kind: "type",
    file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    start_column: node.startPosition.column,
    end_column: node.endPosition.column,
    visibility: getVisibility(node),
    is_exported: hasModifier(node, "public"),
    type_signature: returnType || null,
    type_parameters: typeParams,
    decorators: attributes,
    properties: {
      isDelegate: true,
    },
    branch: ctx.config.branch,
  });

  ctx.nodes.push(delegateNode);

  if (ctx.currentNamespaceId) {
    addContainsEdge(ctx, ctx.currentNamespaceId, entityId, node);
  }
}

/**
 * Visit method body recursively to find invocation expressions
 */
function visitMethodBody(node: SyntaxNode, ctx: ParseContext): void {
  for (const child of node.children) {
    if (child.type === "invocation_expression") {
      visitInvocationExpression(child, ctx);
    } else if (child.type === "object_creation_expression") {
      visitObjectCreationExpression(child, ctx);
    }
    // Recursively visit all children
    visitMethodBody(child, ctx);
  }
}

/**
 * Visit an invocation expression to create CALLS edge
 */
function visitInvocationExpression(node: SyntaxNode, ctx: ParseContext): void {
  // Get the source entity (caller)
  const sourceEntityId = ctx.currentMethodId || genEntityId(ctx, "module", ctx.filePath);

  // Extract callee name from the invocation
  const calleeName = extractCalleeName(node);
  if (!calleeName) return;

  // Create target entity ID with unresolved prefix
  const targetEntityId = `unresolved:${calleeName}`;

  // Count arguments
  const argList = findChildByType(node, "argument_list");
  const argumentCount = argList
    ? argList.namedChildren.filter((c) => c.type === "argument").length
    : 0;

  // Create CALLS edge
  const edge = createEdge({
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    edge_type: "CALLS",
    source_file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    source_line: node.startPosition.row + 1,
    source_column: node.startPosition.column,
    properties: {
      callee: calleeName,
      argumentCount,
    },
    branch: ctx.config.branch,
  });

  ctx.edges.push(edge);
}

/**
 * Visit an object creation expression (new Foo()) to create CALLS edge
 */
function visitObjectCreationExpression(node: SyntaxNode, ctx: ParseContext): void {
  const sourceEntityId = ctx.currentMethodId || genEntityId(ctx, "module", ctx.filePath);

  // Get the type being instantiated
  const typeNode = getChildByField(node, "type");
  const typeName = getNodeText(typeNode);
  if (!typeName) return;

  // Create target entity ID for constructor
  const targetEntityId = `unresolved:${typeName}`;

  // Count arguments
  const argList = findChildByType(node, "argument_list");
  const argumentCount = argList
    ? argList.namedChildren.filter((c) => c.type === "argument").length
    : 0;

  // Create CALLS edge for constructor
  const edge = createEdge({
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    edge_type: "CALLS",
    source_file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    source_line: node.startPosition.row + 1,
    source_column: node.startPosition.column,
    properties: {
      callee: `new ${typeName}`,
      argumentCount,
    },
    branch: ctx.config.branch,
  });

  ctx.edges.push(edge);
}

/**
 * Visit constructor initializer (base() or this() calls)
 */
function visitConstructorInitializer(node: SyntaxNode, ctx: ParseContext): void {
  const sourceEntityId = ctx.currentMethodId || genEntityId(ctx, "module", ctx.filePath);

  // Check if it's base() or this()
  const baseKeyword = findChildByType(node, "base");
  const thisKeyword = findChildByType(node, "this");

  let calleeName: string;
  if (baseKeyword) {
    calleeName = "base";
  } else if (thisKeyword) {
    calleeName = "this";
  } else {
    return;
  }

  const targetEntityId = `unresolved:${calleeName}`;

  // Count arguments
  const argList = findChildByType(node, "argument_list");
  const argumentCount = argList
    ? argList.namedChildren.filter((c) => c.type === "argument").length
    : 0;

  const edge = createEdge({
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    edge_type: "CALLS",
    source_file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    source_line: node.startPosition.row + 1,
    source_column: node.startPosition.column,
    properties: {
      callee: calleeName,
      argumentCount,
    },
    branch: ctx.config.branch,
  });

  ctx.edges.push(edge);
}

/**
 * Extract callee name from an invocation expression
 */
function extractCalleeName(node: SyntaxNode): string | null {
  // The function/method being called is the first child (before argument_list)
  // It could be:
  // - identifier: foo()
  // - member_access_expression: obj.Method()
  // - generic_name: Foo<T>()
  // - qualified_name: Namespace.Foo()

  const firstChild = node.children[0];
  if (!firstChild) return null;

  switch (firstChild.type) {
    case "identifier":
      return getNodeText(firstChild);

    case "generic_name": {
      const nameNode = findChildByType(firstChild, "identifier");
      return getNodeText(nameNode);
    }

    case "member_access_expression": {
      return extractMemberAccessName(firstChild);
    }

    case "qualified_name":
      return getNodeText(firstChild);

    default:
      // For other complex expressions, try to get the text
      return getNodeText(firstChild) || null;
  }
}

/**
 * Extract name from member access expression (obj.Method)
 */
function extractMemberAccessName(node: SyntaxNode): string {
  const nameNode = getChildByField(node, "name");
  const memberName = getNodeText(nameNode);

  const expressionNode = getChildByField(node, "expression");
  if (!expressionNode) return memberName;

  // Get object/namespace name
  let objectName: string | null = null;

  switch (expressionNode.type) {
    case "identifier":
      objectName = getNodeText(expressionNode);
      break;

    case "this_expression":
      objectName = "this";
      break;

    case "base_expression":
      objectName = "base";
      break;

    case "member_access_expression":
      objectName = extractMemberAccessName(expressionNode);
      break;

    case "invocation_expression":
      // Chained call like foo().bar() - just use the method name
      return memberName;

    default:
      objectName = getNodeText(expressionNode);
  }

  if (objectName) {
    return `${objectName}.${memberName}`;
  }

  return memberName;
}

/**
 * Add a CONTAINS edge
 */
function addContainsEdge(
  ctx: ParseContext,
  parentId: string,
  childId: string,
  node: SyntaxNode
): void {
  const edge = createEdge({
    source_entity_id: parentId,
    target_entity_id: childId,
    edge_type: "CONTAINS",
    source_file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    source_line: node.startPosition.row + 1,
    source_column: node.startPosition.column,
    branch: ctx.config.branch,
  });
  ctx.edges.push(edge);
}

/**
 * Add a DECORATES edge
 */
function addDecoratesEdge(
  ctx: ParseContext,
  decoratorName: string,
  targetId: string,
  node: SyntaxNode
): void {
  const decoratorId = genEntityId(ctx, "decorator", decoratorName);

  const edge = createEdge({
    source_entity_id: decoratorId,
    target_entity_id: targetId,
    edge_type: "DECORATES",
    source_file_path: ctx.filePath,
    source_file_hash: ctx.sourceFileHash,
    source_line: node.startPosition.row + 1,
    source_column: node.startPosition.column,
    properties: { decoratorName },
    branch: ctx.config.branch,
  });
  ctx.edges.push(edge);
}

/**
 * Visit children of a node
 */
function visitChildren(node: SyntaxNode, ctx: ParseContext): void {
  for (const child of node.namedChildren) {
    visitNode(child, ctx);
  }
}

/**
 * Main node visitor dispatcher
 */
function visitNode(node: SyntaxNode, ctx: ParseContext): void {
  switch (node.type) {
    case "namespace_declaration":
      visitNamespaceDeclaration(node, ctx);
      break;
    case "file_scoped_namespace_declaration":
      visitFileScopedNamespace(node, ctx);
      // Continue visiting siblings (file-scoped namespace doesn't have a body block)
      break;
    case "using_directive":
      visitUsingDirective(node, ctx);
      break;
    case "class_declaration":
      visitClassDeclaration(node, ctx);
      break;
    case "struct_declaration":
      visitStructDeclaration(node, ctx);
      break;
    case "record_declaration":
    case "record_struct_declaration":
      visitRecordDeclaration(node, ctx);
      break;
    case "interface_declaration":
      visitInterfaceDeclaration(node, ctx);
      break;
    case "enum_declaration":
      visitEnumDeclaration(node, ctx);
      break;
    case "delegate_declaration":
      visitDelegateDeclaration(node, ctx);
      break;
    case "method_declaration":
      visitMethodDeclaration(node, ctx);
      break;
    case "constructor_declaration":
      visitConstructorDeclaration(node, ctx);
      break;
    case "property_declaration":
      visitPropertyDeclaration(node, ctx);
      break;
    case "field_declaration":
      visitFieldDeclaration(node, ctx);
      break;
    case "event_declaration":
    case "event_field_declaration":
      visitEventDeclaration(node, ctx);
      break;
    default:
      // For other nodes, continue visiting children
      visitChildren(node, ctx);
      break;
  }
}

// ============================================================================
// CSharpParser Implementation
// ============================================================================

/**
 * C# language parser using tree-sitter
 */
export class CSharpParser implements LanguageParser {
  readonly language = "csharp";
  readonly extensions = [".cs"];
  readonly version = "1.0.0";

  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(CSharp as unknown as Parser.Language);
  }

  /**
   * Check if this parser can handle a given file
   */
  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parse a source file
   */
  async parse(filePath: string, config: ParserConfig): Promise<StructuralParseResult> {
    const content = await readFile(filePath, "utf-8");
    return this.parseContent(content, filePath, config);
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

    // Handle empty content
    if (!content.trim()) {
      return createEmptyParseResult(filePath, sourceFileHash);
    }

    // Parse with tree-sitter
    const tree = this.parser.parse(content);

    // Create parse context
    const ctx: ParseContext = {
      config,
      filePath,
      sourceFileHash,
      currentNamespace: null,
      currentNamespaceId: null,
      currentContainerId: null,
      currentContainerName: null,
      currentMethodId: null,
      nodes: [],
      edges: [],
      externalRefs: [],
      warnings: [],
    };

    // Visit the AST
    try {
      visitChildren(tree.rootNode, ctx);
    } catch (error) {
      ctx.warnings.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
    }

    const parseTimeMs = performance.now() - startTime;

    return {
      nodes: ctx.nodes,
      edges: ctx.edges,
      externalRefs: ctx.externalRefs,
      sourceFileHash,
      filePath,
      parseTimeMs,
      warnings: ctx.warnings,
    };
  }
}

/**
 * Factory function to create a CSharpParser
 */
export function createCSharpParser(): CSharpParser {
  return new CSharpParser();
}
