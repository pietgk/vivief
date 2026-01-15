/**
 * Scroll Action
 *
 * Scrolls the page or a specific element.
 */

import type { PageContext } from "../session/page-context.js";
import type { ScrollOptions } from "../types/index.js";

export interface ScrollResult {
  success: boolean;
  direction: ScrollOptions["direction"];
  amount: number;
  error?: string;
}

/**
 * Scroll the page in a direction
 */
export async function scroll(
  pageContext: PageContext,
  options: ScrollOptions
): Promise<ScrollResult> {
  try {
    const page = pageContext.getPlaywrightPage();
    const amount = options.amount ?? 500;

    const deltaX =
      options.direction === "left" ? -amount : options.direction === "right" ? amount : 0;
    const deltaY = options.direction === "up" ? -amount : options.direction === "down" ? amount : 0;

    await page.mouse.wheel(deltaX, deltaY);

    return {
      success: true,
      direction: options.direction,
      amount,
    };
  } catch (error) {
    return {
      success: false,
      direction: options.direction,
      amount: options.amount ?? 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scroll a specific element by ref
 */
export async function scrollElement(
  pageContext: PageContext,
  ref: string,
  options: ScrollOptions
): Promise<ScrollResult> {
  try {
    const locator = pageContext.getLocator(ref);
    const amount = options.amount ?? 500;

    const deltaX =
      options.direction === "left" ? -amount : options.direction === "right" ? amount : 0;
    const deltaY = options.direction === "up" ? -amount : options.direction === "down" ? amount : 0;

    await locator.evaluate(
      (el, { dx, dy }) => {
        el.scrollBy(dx, dy);
      },
      { dx: deltaX, dy: deltaY }
    );

    return {
      success: true,
      direction: options.direction,
      amount,
    };
  } catch (error) {
    return {
      success: false,
      direction: options.direction,
      amount: options.amount ?? 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(
  pageContext: PageContext,
  ref: string,
  _options: { behavior?: "auto" | "smooth" } = {}
): Promise<{ success: boolean; ref: string; error?: string }> {
  try {
    const locator = pageContext.getLocator(ref);

    await locator.scrollIntoViewIfNeeded();

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
 * Scroll to top of page
 */
export async function scrollToTop(
  pageContext: PageContext
): Promise<{ success: boolean; error?: string }> {
  try {
    const page = pageContext.getPlaywrightPage();

    await page.evaluate("window.scrollTo({ top: 0, behavior: 'auto' })");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scroll to bottom of page
 */
export async function scrollToBottom(
  pageContext: PageContext
): Promise<{ success: boolean; error?: string }> {
  try {
    const page = pageContext.getPlaywrightPage();

    await page.evaluate("window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' })");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
