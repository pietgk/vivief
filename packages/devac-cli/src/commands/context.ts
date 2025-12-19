/**
 * Context Command
 *
 * Discovers and displays cross-repository context.
 */

import { discoverContext, formatContext } from "@pietgk/devac-core";
import type { DiscoveryOptions, RepoContext } from "@pietgk/devac-core";

export interface ContextOptions {
  /** Current working directory */
  cwd: string;
  /** Output format */
  format?: "text" | "json";
  /** Discovery options */
  discovery?: DiscoveryOptions;
}

export interface ContextResult {
  success: boolean;
  context?: RepoContext;
  formatted?: string;
  error?: string;
}

/**
 * Discover and display context
 */
export async function contextCommand(options: ContextOptions): Promise<ContextResult> {
  try {
    const context = await discoverContext(options.cwd, options.discovery);

    if (options.format === "json") {
      return {
        success: true,
        context,
      };
    }

    return {
      success: true,
      context,
      formatted: formatContext(context),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
