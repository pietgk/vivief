/**
 * Type Action
 *
 * Types text into an element by ref or selector.
 */

import type { PageContext } from "../session/page-context.js";
import type { TypeOptions } from "../types/index.js";
import { DEFAULT_LIMITS } from "../types/index.js";

export interface TypeResult {
  success: boolean;
  ref: string;
  text: string;
  error?: string;
}

/**
 * Type text into an element by ref
 *
 * Unlike fill(), this simulates actual key presses and can be used
 * for text inputs, contenteditable elements, and custom input handlers.
 */
export async function type(
  pageContext: PageContext,
  ref: string,
  text: string,
  options: TypeOptions = {}
): Promise<TypeResult> {
  try {
    const locator = pageContext.getLocator(ref);

    // Clear existing content if requested
    if (options.clear) {
      await locator.clear({ timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout });
    }

    // Type the text with optional delay between keystrokes
    await locator.pressSequentially(text, {
      delay: options.delay ?? 0,
      timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout,
    });

    return {
      success: true,
      ref,
      text,
    };
  } catch (error) {
    return {
      success: false,
      ref,
      text,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Press a keyboard key
 */
export async function press(
  pageContext: PageContext,
  key: string
): Promise<{ success: boolean; key: string; error?: string }> {
  try {
    const page = pageContext.getPlaywrightPage();
    await page.keyboard.press(key);

    return {
      success: true,
      key,
    };
  } catch (error) {
    return {
      success: false,
      key,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
