/**
 * Semantic Resolution Configuration
 *
 * Provides Zod schema validation and type-safe configuration
 * for semantic resolvers.
 *
 * @module config/semantic-config
 */

import { z } from "zod";

/**
 * TypeScript resolver configuration schema
 */
export const TypeScriptConfigSchema = z.object({
  /** Enable TypeScript semantic resolution */
  enabled: z.boolean().default(true),

  /** Timeout per file in milliseconds (default: 30s) */
  timeoutMs: z.number().min(1000).max(300000).default(30000),

  /** Number of files to process in a batch (default: 50) */
  batchSize: z.number().min(1).max(500).default(50),

  /** Skip lib.d.ts checking for performance (default: true) */
  skipLibCheck: z.boolean().default(true),
});

/**
 * Python resolver configuration schema
 */
export const PythonConfigSchema = z.object({
  /** Enable Python semantic resolution */
  enabled: z.boolean().default(true),

  /** Path to pyright executable (optional, auto-detected via npx) */
  pyrightPath: z.string().optional(),
});

/**
 * C# resolver configuration schema
 */
export const CSharpConfigSchema = z.object({
  /** Enable C# semantic resolution */
  enabled: z.boolean().default(true),

  /** Path to dotnet executable (optional, auto-detected in PATH) */
  dotnetPath: z.string().optional(),
});

/**
 * Complete semantic configuration schema
 */
export const SemanticConfigSchema = z.object({
  /** TypeScript resolver configuration */
  typescript: TypeScriptConfigSchema.default({}),

  /** Python resolver configuration */
  python: PythonConfigSchema.default({}),

  /** C# resolver configuration */
  csharp: CSharpConfigSchema.default({}),
});

/**
 * Inferred TypeScript configuration type
 */
export type TypeScriptConfig = z.infer<typeof TypeScriptConfigSchema>;

/**
 * Inferred Python configuration type
 */
export type PythonConfig = z.infer<typeof PythonConfigSchema>;

/**
 * Inferred C# configuration type
 */
export type CSharpConfig = z.infer<typeof CSharpConfigSchema>;

/**
 * Inferred semantic configuration type
 */
export type SemanticConfigValidated = z.infer<typeof SemanticConfigSchema>;

/**
 * Parse and validate semantic configuration
 *
 * @param config - Raw configuration object
 * @returns Validated configuration with defaults applied
 * @throws ZodError if validation fails
 */
export function parseSemanticConfig(
  config: unknown
): SemanticConfigValidated {
  return SemanticConfigSchema.parse(config);
}

/**
 * Safely parse semantic configuration
 *
 * @param config - Raw configuration object
 * @returns Result object with success status and data/error
 */
export function safeParseSemanticConfig(config: unknown): z.SafeParseReturnType<
  unknown,
  SemanticConfigValidated
> {
  return SemanticConfigSchema.safeParse(config);
}

/**
 * Get default semantic configuration
 *
 * @returns Default configuration with all defaults applied
 */
export function getDefaultSemanticConfig(): SemanticConfigValidated {
  return SemanticConfigSchema.parse({});
}

/**
 * Merge partial configuration with defaults
 *
 * @param partial - Partial configuration to merge
 * @returns Complete configuration with defaults for missing values
 */
export function mergeSemanticConfig(
  partial: Partial<SemanticConfigValidated>
): SemanticConfigValidated {
  return SemanticConfigSchema.parse(partial);
}

/**
 * Environment variable configuration loader
 *
 * Loads configuration from environment variables with prefix DEVAC_SEMANTIC_
 *
 * Environment variables:
 * - DEVAC_SEMANTIC_TS_ENABLED: "true" | "false"
 * - DEVAC_SEMANTIC_TS_TIMEOUT_MS: number
 * - DEVAC_SEMANTIC_TS_BATCH_SIZE: number
 * - DEVAC_SEMANTIC_TS_SKIP_LIB_CHECK: "true" | "false"
 * - DEVAC_SEMANTIC_PY_ENABLED: "true" | "false"
 * - DEVAC_SEMANTIC_PY_PYRIGHT_PATH: string
 * - DEVAC_SEMANTIC_CS_ENABLED: "true" | "false"
 * - DEVAC_SEMANTIC_CS_DOTNET_PATH: string
 */
export function loadSemanticConfigFromEnv(): Partial<SemanticConfigValidated> {
  const config: Record<string, unknown> = {
    typescript: {},
    python: {},
    csharp: {},
  };

  const tsConfig = config.typescript as Record<string, unknown>;
  const pyConfig = config.python as Record<string, unknown>;
  const csConfig = config.csharp as Record<string, unknown>;

  // TypeScript config
  if (process.env.DEVAC_SEMANTIC_TS_ENABLED !== undefined) {
    tsConfig.enabled = process.env.DEVAC_SEMANTIC_TS_ENABLED === "true";
  }
  if (process.env.DEVAC_SEMANTIC_TS_TIMEOUT_MS !== undefined) {
    tsConfig.timeoutMs = parseInt(process.env.DEVAC_SEMANTIC_TS_TIMEOUT_MS, 10);
  }
  if (process.env.DEVAC_SEMANTIC_TS_BATCH_SIZE !== undefined) {
    tsConfig.batchSize = parseInt(process.env.DEVAC_SEMANTIC_TS_BATCH_SIZE, 10);
  }
  if (process.env.DEVAC_SEMANTIC_TS_SKIP_LIB_CHECK !== undefined) {
    tsConfig.skipLibCheck = process.env.DEVAC_SEMANTIC_TS_SKIP_LIB_CHECK === "true";
  }

  // Python config
  if (process.env.DEVAC_SEMANTIC_PY_ENABLED !== undefined) {
    pyConfig.enabled = process.env.DEVAC_SEMANTIC_PY_ENABLED === "true";
  }
  if (process.env.DEVAC_SEMANTIC_PY_PYRIGHT_PATH !== undefined) {
    pyConfig.pyrightPath = process.env.DEVAC_SEMANTIC_PY_PYRIGHT_PATH;
  }

  // C# config
  if (process.env.DEVAC_SEMANTIC_CS_ENABLED !== undefined) {
    csConfig.enabled = process.env.DEVAC_SEMANTIC_CS_ENABLED === "true";
  }
  if (process.env.DEVAC_SEMANTIC_CS_DOTNET_PATH !== undefined) {
    csConfig.dotnetPath = process.env.DEVAC_SEMANTIC_CS_DOTNET_PATH;
  }

  return config as Partial<SemanticConfigValidated>;
}

/**
 * Load configuration from environment and merge with defaults
 *
 * @returns Complete validated configuration
 */
export function loadSemanticConfig(): SemanticConfigValidated {
  const envConfig = loadSemanticConfigFromEnv();
  return mergeSemanticConfig(envConfig);
}
