/**
 * Click Action
 *
 * Clicks an element by ref or selector.
 */

import type { PageContext } from "../session/page-context.js";
import type { ClickOptions } from "../types/index.js";
import { DEFAULT_LIMITS } from "../types/index.js";

export interface ClickResult {
  success: boolean;
  ref: string;
  error?: string;
}

/**
 * Click an element by ref
 */
export async function click(
  pageContext: PageContext,
  ref: string,
  options: ClickOptions = {}
): Promise<ClickResult> {
  try {
    const locator = pageContext.getLocator(ref);

    await locator.click({
      button: options.button || "left",
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

/**
 * Double-click an element by ref
 */
export async function doubleClick(
  pageContext: PageContext,
  ref: string,
  options: ClickOptions = {}
): Promise<ClickResult> {
  try {
    const locator = pageContext.getLocator(ref);

    await locator.dblclick({
      button: options.button || "left",
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

/**
 * Right-click an element by ref (convenience wrapper)
 */
export async function rightClick(
  pageContext: PageContext,
  ref: string,
  options: Omit<ClickOptions, "button"> = {}
): Promise<ClickResult> {
  return click(pageContext, ref, { ...options, button: "right" });
}
