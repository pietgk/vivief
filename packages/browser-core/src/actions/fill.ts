/**
 * Fill Action
 *
 * Fills an input field with a value (clears first).
 * Unlike type(), this is instant and doesn't simulate individual key presses.
 */

import type { PageContext } from "../session/page-context.js";
import type { FillOptions } from "../types/index.js";
import { DEFAULT_LIMITS } from "../types/index.js";

export interface FillResult {
  success: boolean;
  ref: string;
  value: string;
  error?: string;
}

/**
 * Fill an input field by ref
 *
 * This clears the existing content and sets the value directly.
 * Triggers input/change events.
 */
export async function fill(
  pageContext: PageContext,
  ref: string,
  value: string,
  options: FillOptions = {}
): Promise<FillResult> {
  try {
    const locator = pageContext.getLocator(ref);

    await locator.fill(value, {
      force: options.force ?? false,
      timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout,
    });

    return {
      success: true,
      ref,
      value,
    };
  } catch (error) {
    return {
      success: false,
      ref,
      value,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Clear an input field by ref
 */
export async function clear(
  pageContext: PageContext,
  ref: string,
  options: { timeout?: number } = {}
): Promise<{ success: boolean; ref: string; error?: string }> {
  try {
    const locator = pageContext.getLocator(ref);

    await locator.clear({
      timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout,
    });

    return {
      success: true,
      ref,
    };
  } catch (error) {
    return {
      success: false,
      ref,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
