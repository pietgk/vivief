/**
 * Query Adapter Utilities
 *
 * Generate MCP tool definitions and CLI options from Zod schemas.
 * Single source of truth for query definitions used by both CLI and MCP.
 */

import type { z } from "zod";
import type { QueryDefinition } from "./types.js";

// ============================================================================
// MCP Adapter
// ============================================================================

/**
 * JSON Schema for MCP tool input
 */
export interface McpInputSchema {
  type: "object";
  properties: Record<string, McpPropertySchema>;
  required?: string[];
}

/**
 * JSON Schema property definition for MCP
 */
export interface McpPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: McpPropertySchema;
  minimum?: number;
  maximum?: number;
}

/**
 * MCP Tool definition
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: McpInputSchema;
}

/**
 * Convert Zod schema to JSON Schema for MCP
 */
export function zodToJsonSchema(schema: z.ZodType): McpInputSchema {
  // Get the shape from the schema if it's an object
  const properties: Record<string, McpPropertySchema> = {};
  const required: string[] = [];

  // Handle ZodObject
  if ("shape" in schema && typeof schema.shape === "object") {
    const shape = schema.shape as Record<string, z.ZodType>;

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const prop = zodTypeToJsonSchema(fieldSchema);
      properties[key] = prop;

      // Check if field is required (not optional, not default)
      if (!isOptional(fieldSchema)) {
        required.push(key);
      }
    }
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Convert a single Zod type to JSON Schema property
 */
function zodTypeToJsonSchema(schema: z.ZodType): McpPropertySchema {
  const description = schema.description;

  // Handle wrapped types (optional, default, etc.)
  const unwrapped = unwrapSchema(schema);

  // Handle specific Zod types
  if ("_def" in unwrapped) {
    const def = unwrapped._def as Record<string, unknown>;

    // ZodString
    if (def.typeName === "ZodString") {
      return { type: "string", description };
    }

    // ZodNumber
    if (def.typeName === "ZodNumber") {
      const prop: McpPropertySchema = { type: "number", description };
      if (def.checks && Array.isArray(def.checks)) {
        for (const check of def.checks as Array<{ kind: string; value: number }>) {
          if (check.kind === "min") prop.minimum = check.value;
          if (check.kind === "max") prop.maximum = check.value;
        }
      }
      return prop;
    }

    // ZodBoolean
    if (def.typeName === "ZodBoolean") {
      return { type: "boolean", description };
    }

    // ZodEnum
    if (def.typeName === "ZodEnum") {
      return {
        type: "string",
        enum: def.values as string[],
        description,
      };
    }

    // ZodArray
    if (def.typeName === "ZodArray") {
      return {
        type: "array",
        items: zodTypeToJsonSchema(def.type as z.ZodType),
        description,
      };
    }

    // ZodLiteral
    if (def.typeName === "ZodLiteral") {
      const value = def.value;
      if (typeof value === "string") {
        return { type: "string", enum: [value], description };
      }
      if (typeof value === "number") {
        return { type: "number", description };
      }
      if (typeof value === "boolean") {
        return { type: "boolean", description };
      }
    }
  }

  // Default fallback
  return { type: "string", description };
}

/**
 * Unwrap optional, default, and other wrapper types
 */
function unwrapSchema(schema: z.ZodType): z.ZodType {
  if ("_def" in schema) {
    const def = schema._def as Record<string, unknown>;

    // ZodOptional
    if (def.typeName === "ZodOptional" && def.innerType) {
      return unwrapSchema(def.innerType as z.ZodType);
    }

    // ZodDefault
    if (def.typeName === "ZodDefault" && def.innerType) {
      return unwrapSchema(def.innerType as z.ZodType);
    }

    // ZodNullable
    if (def.typeName === "ZodNullable" && def.innerType) {
      return unwrapSchema(def.innerType as z.ZodType);
    }
  }

  return schema;
}

/**
 * Check if a schema is optional (has default or is marked optional)
 */
function isOptional(schema: z.ZodType): boolean {
  if ("_def" in schema) {
    const def = schema._def as Record<string, unknown>;

    if (def.typeName === "ZodOptional") return true;
    if (def.typeName === "ZodDefault") return true;

    // Recurse through wrappers
    if (def.innerType) {
      return isOptional(def.innerType as z.ZodType);
    }
  }

  return false;
}

/**
 * Get default value from a Zod schema
 */
export function getDefaultValue(schema: z.ZodType): unknown {
  if ("_def" in schema) {
    const def = schema._def as Record<string, unknown>;

    if (def.typeName === "ZodDefault") {
      if (typeof def.defaultValue === "function") {
        return (def.defaultValue as () => unknown)();
      }
      return def.defaultValue;
    }

    // Recurse through optional wrapper
    if (def.typeName === "ZodOptional" && def.innerType) {
      return getDefaultValue(def.innerType as z.ZodType);
    }
  }

  return undefined;
}

/**
 * Convert a query definition to an MCP tool definition
 */
export function toMcpTool<TParams extends z.ZodType, TResult>(
  def: QueryDefinition<TParams, TResult>
): McpToolDefinition {
  return {
    name: def.name,
    description: def.description,
    inputSchema: zodToJsonSchema(def.params),
  };
}

/**
 * Generate MCP tools from all query definitions
 */
export function generateMcpTools(
  definitions: QueryDefinition<z.ZodType, unknown>[]
): McpToolDefinition[] {
  return definitions.map(toMcpTool);
}

// ============================================================================
// CLI Adapter
// ============================================================================

/**
 * CLI option definition
 */
export interface CliOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
  choices?: string[];
  required: boolean;
  argName?: string;
}

/**
 * CLI command definition
 */
export interface CliCommandDefinition {
  name: string;
  description: string;
  options: CliOption[];
  arguments?: Array<{ name: string; description?: string; required: boolean }>;
}

/**
 * Convert a query definition to CLI command options
 */
export function toCliCommand<TParams extends z.ZodType, TResult>(
  def: QueryDefinition<TParams, TResult>
): CliCommandDefinition {
  const options: CliOption[] = [];
  const args: Array<{ name: string; description?: string; required: boolean }> = [];

  // Get the shape from the Zod schema
  if ("shape" in def.params && typeof def.params.shape === "object") {
    const shape = def.params.shape as Record<string, z.ZodType>;

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const opt = zodToCliOption(key, fieldSchema);
      if (opt) {
        options.push(opt);
      }
    }
  }

  return {
    name: def.name.replace(/_/g, "-"), // symbol_find -> symbol-find
    description: def.description,
    options,
    arguments: args.length > 0 ? args : undefined,
  };
}

/**
 * Convert a Zod field to a CLI option
 */
function zodToCliOption(key: string, schema: z.ZodType): CliOption | null {
  const description = schema.description ?? "";
  const unwrapped = unwrapSchema(schema);
  const required = !isOptional(schema);
  const defaultValue = getDefaultValue(schema);

  // Convert camelCase to kebab-case for flag names
  const flagName = key.replace(/([A-Z])/g, "-$1").toLowerCase();

  // Get type info
  if ("_def" in unwrapped) {
    const def = unwrapped._def as Record<string, unknown>;

    // Boolean -> flag (no argument)
    if (def.typeName === "ZodBoolean") {
      return {
        flags: `--${flagName}`,
        description,
        defaultValue,
        required,
      };
    }

    // Enum -> choices
    if (def.typeName === "ZodEnum") {
      return {
        flags: `-${flagName.charAt(0)}, --${flagName} <value>`,
        description,
        defaultValue,
        choices: def.values as string[],
        required,
        argName: "value",
      };
    }

    // Number -> numeric argument
    if (def.typeName === "ZodNumber") {
      return {
        flags: `--${flagName} <number>`,
        description,
        defaultValue,
        required,
        argName: "number",
      };
    }

    // String -> string argument
    if (def.typeName === "ZodString") {
      return {
        flags: `--${flagName} <value>`,
        description,
        defaultValue,
        required,
        argName: "value",
      };
    }

    // Array -> can be specified multiple times
    if (def.typeName === "ZodArray") {
      return {
        flags: `--${flagName} <value...>`,
        description,
        defaultValue,
        required,
        argName: "value",
      };
    }
  }

  // Default to string option
  return {
    flags: `--${flagName} <value>`,
    description,
    defaultValue,
    required,
    argName: "value",
  };
}

/**
 * Generate CLI commands from all query definitions
 */
export function generateCliCommands(
  definitions: QueryDefinition<z.ZodType, unknown>[]
): CliCommandDefinition[] {
  return definitions.map(toCliCommand);
}
