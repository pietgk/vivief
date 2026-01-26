/**
 * Schema Generators - Derive SQL and Parquet from Zod
 *
 * These functions generate SQL CREATE TABLE statements and Parquet column orders
 * from Zod schemas, ensuring a single source of truth.
 */

import type { z } from "zod";

/**
 * Metadata about a column derived from Zod schema
 */
export interface ColumnMetadata {
  name: string;
  duckdbType: string;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  description?: string;
}

/**
 * Infer DuckDB type from a Zod type
 */
function inferDuckDBType(zodType: z.ZodTypeAny): {
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue?: string;
} {
  const def = zodType._def;

  // Handle ZodDefault wrapper
  if (def.typeName === "ZodDefault") {
    const inner = inferDuckDBType(def.innerType);
    const defaultVal = def.defaultValue();

    // Format default value for SQL
    let sqlDefault: string;
    if (defaultVal === null) {
      sqlDefault = "NULL";
    } else if (typeof defaultVal === "boolean") {
      sqlDefault = defaultVal ? "true" : "false";
    } else if (typeof defaultVal === "string") {
      sqlDefault = `'${defaultVal}'`;
    } else if (typeof defaultVal === "number") {
      sqlDefault = String(defaultVal);
    } else if (Array.isArray(defaultVal) && defaultVal.length === 0) {
      sqlDefault = "[]";
    } else if (typeof defaultVal === "object" && Object.keys(defaultVal).length === 0) {
      sqlDefault = "'{}'";
    } else {
      sqlDefault = `'${JSON.stringify(defaultVal)}'`;
    }

    return {
      type: inner.type,
      nullable: false, // Default implies not null
      hasDefault: true,
      defaultValue: sqlDefault,
    };
  }

  // Handle ZodNullable wrapper
  if (def.typeName === "ZodNullable") {
    const inner = inferDuckDBType(def.innerType);
    return { ...inner, nullable: true };
  }

  // Handle ZodOptional wrapper
  if (def.typeName === "ZodOptional") {
    const inner = inferDuckDBType(def.innerType);
    return { ...inner, nullable: true };
  }

  // Handle base types
  switch (def.typeName) {
    case "ZodString":
      return { type: "VARCHAR", nullable: false, hasDefault: false };

    case "ZodNumber": {
      // Check for integer refinement
      const checks = def.checks || [];
      const isInt = checks.some((c: { kind: string }) => c.kind === "int");
      return { type: isInt ? "INTEGER" : "DOUBLE", nullable: false, hasDefault: false };
    }

    case "ZodBoolean":
      return { type: "BOOLEAN", nullable: false, hasDefault: false };

    case "ZodArray": {
      const elementType = inferDuckDBType(def.type);
      return { type: `${elementType.type}[]`, nullable: false, hasDefault: false };
    }

    case "ZodRecord":
      return { type: "JSON", nullable: false, hasDefault: false };

    case "ZodEnum":
      // Enums are stored as VARCHAR in DuckDB
      return { type: "VARCHAR", nullable: false, hasDefault: false };

    case "ZodLiteral":
      // Literals are typically strings
      return { type: "VARCHAR", nullable: false, hasDefault: false };

    default:
      // Fallback for unknown types
      return { type: "VARCHAR", nullable: false, hasDefault: false };
  }
}

/**
 * Extract column metadata from a Zod object schema
 */
export function getColumnMetadata(schema: z.ZodObject<z.ZodRawShape>): ColumnMetadata[] {
  const shape = schema.shape;
  const columns: ColumnMetadata[] = [];

  for (const [name, zodType] of Object.entries(shape)) {
    const typeInfo = inferDuckDBType(zodType as z.ZodTypeAny);
    const description = (zodType as z.ZodTypeAny).description;

    columns.push({
      name,
      duckdbType: typeInfo.type,
      nullable: typeInfo.nullable,
      hasDefault: typeInfo.hasDefault,
      defaultValue: typeInfo.defaultValue,
      description,
    });
  }

  return columns;
}

/**
 * Generate SQL CREATE TABLE statement from Zod schema
 *
 * @param schema - Zod object schema
 * @param tableName - Name of the table to create
 * @param options - Optional configuration
 * @returns SQL CREATE TABLE statement
 */
export function zodToCreateTable(
  schema: z.ZodObject<z.ZodRawShape>,
  tableName: string,
  options?: {
    primaryKey?: string[];
    ifNotExists?: boolean;
  }
): string {
  const columns = getColumnMetadata(schema);
  const ifNotExists = options?.ifNotExists ?? true;
  const primaryKey = options?.primaryKey;

  const columnDefs = columns.map((col) => {
    let def = `  ${col.name} ${col.duckdbType}`;

    if (!col.nullable && !col.hasDefault) {
      def += " NOT NULL";
    } else if (!col.nullable && col.hasDefault) {
      def += ` NOT NULL DEFAULT ${col.defaultValue}`;
    } else if (col.hasDefault) {
      def += ` DEFAULT ${col.defaultValue}`;
    }

    return def;
  });

  // Add primary key if specified
  if (primaryKey && primaryKey.length > 0) {
    columnDefs.push(`  PRIMARY KEY (${primaryKey.join(", ")})`);
  }

  const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";
  return `CREATE TABLE ${ifNotExistsClause}${tableName} (\n${columnDefs.join(",\n")}\n)`;
}

/**
 * Get column names in order from a Zod schema
 * Useful for COPY TO PARQUET and INSERT statements
 */
export function zodToColumnNames(schema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.keys(schema.shape);
}

/**
 * Generate SQL INSERT statement with parameter placeholders
 */
export function zodToInsertSQL(schema: z.ZodObject<z.ZodRawShape>, tableName: string): string {
  const columns = zodToColumnNames(schema);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
}

/**
 * Generate VALUES clause for a single row using Zod schema field order
 * This ensures test data matches the production schema exactly
 */
export function zodToValuesRow<T extends Record<string, unknown>>(
  schema: z.ZodObject<z.ZodRawShape>,
  data: T
): string {
  const columns = zodToColumnNames(schema);
  const values = columns.map((col) => {
    const value = data[col];

    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string") {
      // Escape single quotes in strings
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "[]";
      }
      // Array of strings
      const items = value.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ");
      return `[${items}]`;
    }
    if (typeof value === "object") {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  });

  return `(${values.join(", ")})`;
}

/**
 * Validate that data matches the Zod schema
 * Throws an error if validation fails
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data, returning null on failure
 */
export function safeValidateData<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
