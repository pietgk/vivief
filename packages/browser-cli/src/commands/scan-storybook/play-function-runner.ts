/**
 * Play Function Runner
 *
 * Navigates to Storybook story iframes and waits for stories to render.
 * Play functions are executed automatically by Storybook when the story loads.
 */

import type { Page } from "playwright";

/**
 * Options for navigating to a story
 */
export interface NavigateToStoryOptions {
  /** Timeout for navigation and rendering in milliseconds */
  timeout: number;
  /** Additional wait time after story renders (for play functions) */
  extraWaitMs?: number;
}

/**
 * Navigate to a Storybook story's iframe URL and wait for it to render
 *
 * Storybook automatically executes play functions when stories load,
 * so we just need to navigate and wait for the story to be ready.
 *
 * @param page - Playwright page
 * @param storybookUrl - Base URL of Storybook
 * @param storyId - Story ID (e.g., "button--primary")
 * @param options - Navigation options
 */
export async function navigateToStory(
  page: Page,
  storybookUrl: string,
  storyId: string,
  options: NavigateToStoryOptions
): Promise<void> {
  const { timeout, extraWaitMs = 500 } = options;

  // Build the iframe URL for the story
  // Storybook iframe URL format: /iframe.html?id=<storyId>&viewMode=story
  const baseUrl = storybookUrl.replace(/\/$/, "");
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;

  // Navigate to the story
  await page.goto(storyUrl, {
    waitUntil: "domcontentloaded",
    timeout,
  });

  // Wait for the story root element to be present
  // Storybook uses either #storybook-root or #root depending on version
  try {
    await page.waitForSelector("#storybook-root, #root, [data-story-root]", {
      state: "attached",
      timeout: timeout / 2,
    });
  } catch {
    // Some stories may have custom root elements, continue anyway
  }

  // Wait for network to settle (play functions may fetch data)
  try {
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(5000, timeout / 3),
    });
  } catch {
    // Network idle timeout is acceptable - some stories never reach it
  }

  // Extra wait for play functions and animations to complete
  if (extraWaitMs > 0) {
    await page.waitForTimeout(extraWaitMs);
  }

  // Wait for any loading indicators to disappear
  try {
    await page.waitForSelector(".sb-preparing-story, .sb-loader, [data-loading]", {
      state: "hidden",
      timeout: Math.min(2000, timeout / 4),
    });
  } catch {
    // No loading indicator found or already hidden
  }
}

/**
 * Check if a story has a play function by looking at the URL or metadata
 *
 * Note: This is a heuristic - we can't reliably detect play functions
 * without running the story. The actual play function execution happens
 * automatically when Storybook loads the story.
 *
 * @param storyId - Story ID
 * @returns True if the story might have a play function (always true for safety)
 */
export function mightHavePlayFunction(_storyId: string): boolean {
  // We can't reliably detect play functions from the story ID alone
  // Always assume there might be a play function and wait accordingly
  return true;
}
