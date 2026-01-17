/**
 * Hover Action
 *
 * Hovers over an element by ref.
 */

import type { PageContext } from "../session/page-context.js";
import { DEFAULT_LIMITS } from "../types/index.js";

export interface HoverResult {
  success: boolean;
  ref: string;
  error?: string;
}

/**
 * Hover over an element by ref
 */
export async function hover(
  pageContext: PageContext,
  ref: string,
  options: { timeout?: number } = {}
): Promise<HoverResult> {
  try {
    const locator = pageContext.getLocator(ref);

    await locator.hover({
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
