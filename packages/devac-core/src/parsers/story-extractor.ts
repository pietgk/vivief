/**
 * CSF3 Story Extractor
 *
 * Parses Storybook Component Story Format 3 (CSF3) files to extract
 * story nodes with metadata for accessibility testing.
 *
 * CSF3 Structure:
 * - Default export: Meta object with title, component, args, parameters
 * - Named exports: Story objects with args, play functions, render functions
 *
 * Part of DevAC Accessibility Intelligence Layer (Issue #235)
 */

import { type ParserOptions, parse } from "@babel/parser";
// @ts-expect-error - @babel/traverse doesn't have proper ESM type declarations
import _traverse from "@babel/traverse";
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
import type { File as BabelFile, Node as BabelNode } from "@babel/types";
import * as t from "@babel/types";

import { generateEntityId } from "../analyzer/entity-id-generator.js";
import type { ParsedEdge, ParsedNode } from "../types/index.js";
import { createEdge, createNode } from "../types/index.js";

// Type for NodePath since @babel/traverse types aren't available
type NodePath<T = BabelNode> = {
  node: T;
  parent: BabelNode;
  parentPath: NodePath | null;
};

// ============================================================================
// Types
// ============================================================================

/**
 * Story meta extracted from default export
 */
export interface StoryMeta {
  /** Title hierarchy (e.g., "mindlerui/Atoms/Button") */
  title: string | null;
  /** Component name being tested */
  componentName: string | null;
  /** Default args */
  args: Record<string, unknown>;
  /** Accessibility parameters */
  a11yParams: A11yParameters | null;
  /** A11y reference parameters (for reference stories) */
  a11yReference: A11yReferenceParameters | null;
  /** Tags (e.g., ["autodocs", "skip-a11y"]) */
  tags: string[];
}

/**
 * Accessibility parameters from story meta or individual stories
 */
export interface A11yParameters {
  /** Disabled rules */
  disabledRules: string[];
  /** Custom configuration */
  config?: Record<string, unknown>;
}

/**
 * A11y Reference parameters for reference stories (from a11y-reference-storybook)
 * These stories demonstrate violations and passes for specific axe-core rules.
 */
export interface A11yReferenceParameters {
  /** The axe-core rule ID being tested */
  ruleId: string;
  /** Whether this story should trigger a violation */
  shouldViolate?: boolean;
  /** Expected violation rule IDs (for meta-level) */
  expectedViolations?: string[];
  /** WCAG criteria this rule addresses */
  wcag?: string[];
  /** Impact level of the rule */
  impact?: "critical" | "serious" | "moderate" | "minor";
  /** URL to Deque documentation */
  helpUrl?: string;
  /** Description of what this story demonstrates */
  description?: string;
}

/**
 * Extracted story
 */
export interface ExtractedStory {
  /** Export name (e.g., "Primary") */
  name: string;
  /** Generated story ID (e.g., "mindlerui-atoms-button--primary") */
  storyId: string;
  /** Whether story has a play function (interaction test) */
  hasPlayFunction: boolean;
  /** Whether story has a custom render function */
  hasCustomRender: boolean;
  /** Story-specific args */
  args: Record<string, unknown>;
  /** Story-specific a11y parameters */
  a11yParams: A11yParameters | null;
  /** Story-specific a11y reference parameters (for reference stories) */
  a11yReference: A11yReferenceParameters | null;
  /** Story tags */
  tags: string[];
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
}

/**
 * Result from story extraction
 */
export interface StoryExtractionResult {
  /** Meta from default export */
  meta: StoryMeta | null;
  /** Extracted stories */
  stories: ExtractedStory[];
  /** Nodes to add to parse result */
  nodes: ParsedNode[];
  /** Edges to add to parse result */
  edges: ParsedEdge[];
}

/**
 * Options for story extraction
 */
export interface StoryExtractorOptions {
  /** Repository name for entity IDs */
  repoName: string;
  /** Package path for entity IDs */
  packagePath: string;
  /** File path relative to package root */
  filePath: string;
  /** File content */
  content: string;
  /** Source file hash */
  sourceFileHash: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert title to kebab-case story ID prefix
 * "mindlerui/Atoms/Button" -> "mindlerui-atoms-button"
 */
function titleToIdPrefix(title: string): string {
  return title
    .split("/")
    .map((segment) => segment.toLowerCase().replace(/\s+/g, "-"))
    .join("-");
}

/**
 * Convert export name to kebab-case story suffix
 * "PrimaryLarge" -> "primary-large"
 */
function nameToIdSuffix(name: string): string {
  // Convert PascalCase/camelCase to kebab-case
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Generate story ID from title and export name
 * Format: {kebab-title}--{kebab-name}
 */
function generateStoryId(title: string, name: string): string {
  const prefix = titleToIdPrefix(title);
  const suffix = nameToIdSuffix(name);
  return `${prefix}--${suffix}`;
}

/**
 * Extract hierarchy parts from title
 */
function extractHierarchy(title: string): {
  namespace: string;
  category: string;
  component: string;
} {
  const parts = title.split("/");
  return {
    namespace: parts[0] || "",
    category: parts.length > 2 ? parts.slice(1, -1).join("/") : "",
    component: parts[parts.length - 1] || "",
  };
}

/**
 * Check if file is a Storybook story file
 */
export function isStoryFile(filePath: string): boolean {
  return /\.(stories|story)\.(ts|tsx|js|jsx|mjs)$/.test(filePath);
}

/**
 * Extract string value from AST node
 */
function getStringValue(node: BabelNode | null | undefined): string | null {
  if (!node) return null;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.quasis.length === 1) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/**
 * Extract array of strings from AST node
 */
function getStringArrayValue(node: BabelNode | null | undefined): string[] {
  if (!node || !t.isArrayExpression(node)) return [];
  return node.elements
    .map((el) => (t.isStringLiteral(el) ? el.value : null))
    .filter((v): v is string => v !== null);
}

/**
 * Extract a11y parameters from parameters.a11y
 */
function extractA11yParams(paramsNode: BabelNode | null | undefined): A11yParameters | null {
  if (!paramsNode || !t.isObjectExpression(paramsNode)) return null;

  // Find a11y property
  const a11yProp = paramsNode.properties.find(
    (p): p is t.ObjectProperty =>
      t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === "a11y"
  );

  if (!a11yProp || !t.isObjectExpression(a11yProp.value)) return null;

  const a11yObj = a11yProp.value;
  const disabledRules: string[] = [];

  // Look for config.rules or disable property
  for (const prop of a11yObj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : null;

    if (key === "disable" && t.isBooleanLiteral(prop.value) && prop.value.value) {
      // a11y: { disable: true } - all rules disabled
      return { disabledRules: ["*"] };
    }

    if (key === "config" && t.isObjectExpression(prop.value)) {
      // a11y: { config: { rules: [...] } }
      const rulesProp = prop.value.properties.find(
        (p): p is t.ObjectProperty =>
          t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === "rules"
      );

      if (rulesProp && t.isArrayExpression(rulesProp.value)) {
        for (const rule of rulesProp.value.elements) {
          if (!t.isObjectExpression(rule)) continue;

          // Each rule: { id: "rule-name", enabled: false }
          const idProp = rule.properties.find(
            (p): p is t.ObjectProperty =>
              t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === "id"
          );
          const enabledProp = rule.properties.find(
            (p): p is t.ObjectProperty =>
              t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === "enabled"
          );

          if (
            idProp &&
            t.isStringLiteral(idProp.value) &&
            enabledProp &&
            t.isBooleanLiteral(enabledProp.value) &&
            !enabledProp.value.value
          ) {
            disabledRules.push(idProp.value.value);
          }
        }
      }
    }
  }

  return disabledRules.length > 0 ? { disabledRules } : null;
}

/**
 * Extract a11yReference parameters from parameters.a11yReference
 * Used by reference stories generated by a11y-reference-storybook
 */
function extractA11yReferenceParams(
  paramsNode: BabelNode | null | undefined
): A11yReferenceParameters | null {
  if (!paramsNode || !t.isObjectExpression(paramsNode)) return null;

  // Find a11yReference property
  const a11yRefProp = paramsNode.properties.find(
    (p): p is t.ObjectProperty =>
      t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === "a11yReference"
  );

  if (!a11yRefProp || !t.isObjectExpression(a11yRefProp.value)) return null;

  const a11yRefObj = a11yRefProp.value;
  const result: A11yReferenceParameters = {
    ruleId: "",
  };

  for (const prop of a11yRefObj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : null;
    if (!key) continue;

    switch (key) {
      case "ruleId":
        result.ruleId = getStringValue(prop.value) || "";
        break;

      case "shouldViolate":
        if (t.isBooleanLiteral(prop.value)) {
          result.shouldViolate = prop.value.value;
        }
        break;

      case "expectedViolations":
        result.expectedViolations = getStringArrayValue(prop.value);
        break;

      case "wcag":
        result.wcag = getStringArrayValue(prop.value);
        break;

      case "impact": {
        const impactValue = getStringValue(prop.value);
        if (impactValue && ["critical", "serious", "moderate", "minor"].includes(impactValue)) {
          result.impact = impactValue as "critical" | "serious" | "moderate" | "minor";
        }
        break;
      }

      case "helpUrl":
        result.helpUrl = getStringValue(prop.value) || undefined;
        break;

      case "description":
        result.description = getStringValue(prop.value) || undefined;
        break;
    }
  }

  // Only return if we have at least a ruleId
  return result.ruleId ? result : null;
}

// ============================================================================
// Main Extractor
// ============================================================================

/**
 * Extract stories from a CSF3 file
 */
export function extractStories(options: StoryExtractorOptions): StoryExtractionResult {
  const { repoName, packagePath, filePath, content, sourceFileHash } = options;

  // Parse the file
  const parserOptions: ParserOptions = {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    errorRecovery: true,
  };

  let ast: BabelFile;
  try {
    ast = parse(content, parserOptions);
  } catch {
    return { meta: null, stories: [], nodes: [], edges: [] };
  }

  // Track extracted data
  // Use an object to hold meta so TypeScript can track mutations in closures
  const state: { meta: StoryMeta | null } = { meta: null };
  const stories: ExtractedStory[] = [];
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];

  // Collect variable declarations for resolving identifiers
  const variableDeclarations = new Map<string, BabelNode>();

  // First pass: collect all variable declarations
  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (t.isIdentifier(path.node.id) && path.node.init) {
        variableDeclarations.set(path.node.id.name, path.node.init);
      }
    },
  });

  // Second pass: find default export (meta)
  traverse(ast, {
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      const decl = path.node.declaration;

      // Handle: export default { title: "..." }
      if (t.isObjectExpression(decl)) {
        state.meta = extractMetaFromObject(decl);
      }

      // Handle: export default meta (where meta is a variable)
      if (t.isIdentifier(decl)) {
        // Find the variable declaration
        const initNode = variableDeclarations.get(decl.name);
        if (initNode) {
          if (t.isObjectExpression(initNode)) {
            state.meta = extractMetaFromObject(initNode);
          }
          // Handle: const meta = { ... } satisfies Meta<typeof X>
          if (t.isTSAsExpression(initNode) || t.isTSSatisfiesExpression(initNode)) {
            const expr = initNode.expression;
            if (t.isObjectExpression(expr)) {
              state.meta = extractMetaFromObject(expr);
            }
          }
        }
      }
    },
  });

  // Second pass: find named exports (stories)
  traverse(ast, {
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const decl = path.node.declaration;

      // Handle: export const Primary = { ... }
      if (t.isVariableDeclaration(decl)) {
        for (const declarator of decl.declarations) {
          if (!t.isIdentifier(declarator.id)) continue;

          const name = declarator.id.name;
          const init = declarator.init;

          // Skip non-story exports (like meta)
          if (name === "default" || name.startsWith("_")) continue;

          let storyObj: t.ObjectExpression | null = null;

          if (t.isObjectExpression(init)) {
            storyObj = init;
          }
          // Handle: export const Primary: StoryObj = { ... }
          if (t.isTSAsExpression(init) || t.isTSSatisfiesExpression(init)) {
            const expr = init.expression;
            if (t.isObjectExpression(expr)) {
              storyObj = expr;
            }
          }

          if (storyObj) {
            const story = extractStoryFromObject(
              name,
              storyObj,
              state.meta?.title || "Unknown",
              path.node
            );
            if (story) {
              stories.push(story);
            }
          }
        }
      }
    },
  });

  // Create nodes and edges for each story
  const timestamp = new Date().toISOString();
  // Capture meta values for use in loop (avoid TypeScript closure narrowing issues)
  const metaTitle = state.meta?.title || null;
  const metaComponentName = state.meta?.componentName || null;
  const metaA11yRules = state.meta?.a11yParams?.disabledRules || [];
  const metaA11yReference = state.meta?.a11yReference || null;
  const metaTags = state.meta?.tags || [];

  for (const story of stories) {
    const entityId = generateEntityId({
      repo: repoName,
      packagePath,
      kind: "story",
      filePath,
      scopedName: story.storyId,
    });
    const hierarchy = metaTitle
      ? extractHierarchy(metaTitle)
      : { namespace: "", category: "", component: "" };

    const storyNode = createNode({
      entity_id: entityId,
      name: story.name,
      qualified_name: story.storyId,
      kind: "story",
      file_path: filePath,
      start_line: story.startLine,
      end_line: story.endLine,
      start_column: 0,
      end_column: 0,
      is_exported: true,
      is_default_export: false,
      visibility: "public",
      is_async: false,
      is_generator: false,
      is_static: false,
      is_abstract: false,
      type_signature: null,
      documentation: null,
      decorators: [],
      type_parameters: [],
      properties: {
        // Story identification
        storyId: story.storyId,

        // Hierarchy from title
        namespace: hierarchy.namespace,
        category: hierarchy.category,
        componentName: hierarchy.component,

        // Story features
        hasPlayFunction: story.hasPlayFunction,
        hasCustomRender: story.hasCustomRender,

        // Accessibility
        a11yRulesDisabled: story.a11yParams?.disabledRules || metaA11yRules,
        tags: [...metaTags, ...story.tags],

        // A11y Reference (for reference stories from a11y-reference-storybook)
        ...(story.a11yReference || metaA11yReference
          ? {
              a11yReference: {
                // Story-level takes precedence over meta-level
                isReferenceStory: true,
                ruleId: story.a11yReference?.ruleId || metaA11yReference?.ruleId || "",
                shouldViolate: story.a11yReference?.shouldViolate,
                expectedViolations:
                  story.a11yReference?.expectedViolations || metaA11yReference?.expectedViolations,
                wcag: metaA11yReference?.wcag,
                impact: metaA11yReference?.impact,
                helpUrl: metaA11yReference?.helpUrl,
                description: story.a11yReference?.description,
              },
            }
          : {}),

        // Component reference (to be resolved later)
        testedComponentName: metaComponentName,
      },
      source_file_hash: sourceFileHash,
      branch: "base",
      is_deleted: false,
      updated_at: timestamp,
    });

    nodes.push(storyNode);

    // Create REFERENCES edge to component (unresolved) with test relationship
    if (metaComponentName) {
      edges.push(
        createEdge({
          source_entity_id: entityId,
          target_entity_id: `unresolved:${metaComponentName}`,
          edge_type: "REFERENCES",
          source_file_path: filePath,
          source_line: story.startLine,
          source_column: 0,
          source_file_hash: sourceFileHash,
          properties: {
            relationType: "tests",
          },
          branch: "base",
          is_deleted: false,
          updated_at: timestamp,
        })
      );
    }
  }

  return { meta: state.meta, stories, nodes, edges };
}

/**
 * Extract meta from object expression
 */
function extractMetaFromObject(obj: t.ObjectExpression): StoryMeta {
  const meta: StoryMeta = {
    title: null,
    componentName: null,
    args: {},
    a11yParams: null,
    a11yReference: null,
    tags: [],
  };

  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : null;
    if (!key) continue;

    switch (key) {
      case "title":
        meta.title = getStringValue(prop.value);
        break;

      case "component":
        if (t.isIdentifier(prop.value)) {
          meta.componentName = prop.value.name;
        }
        break;

      case "tags":
        meta.tags = getStringArrayValue(prop.value);
        break;

      case "parameters":
        meta.a11yParams = extractA11yParams(prop.value);
        meta.a11yReference = extractA11yReferenceParams(prop.value);
        break;
    }
  }

  return meta;
}

/**
 * Extract story from object expression
 */
function extractStoryFromObject(
  name: string,
  obj: t.ObjectExpression,
  title: string,
  exportNode: BabelNode
): ExtractedStory | null {
  const story: ExtractedStory = {
    name,
    storyId: generateStoryId(title, name),
    hasPlayFunction: false,
    hasCustomRender: false,
    args: {},
    a11yParams: null,
    a11yReference: null,
    tags: [],
    startLine: exportNode.loc?.start.line ?? 1,
    endLine: exportNode.loc?.end.line ?? 1,
  };

  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) && !t.isObjectMethod(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : null;
    if (!key) continue;

    switch (key) {
      case "play":
        story.hasPlayFunction = true;
        break;

      case "render":
        story.hasCustomRender = true;
        break;

      case "tags":
        if (t.isObjectProperty(prop)) {
          story.tags = getStringArrayValue(prop.value);
        }
        break;

      case "parameters":
        if (t.isObjectProperty(prop)) {
          story.a11yParams = extractA11yParams(prop.value);
          story.a11yReference = extractA11yReferenceParams(prop.value);
        }
        break;
    }
  }

  return story;
}

/**
 * Create a story extractor that can be used during parsing
 */
export function createStoryExtractor() {
  return {
    isStoryFile,
    extractStories,
  };
}
