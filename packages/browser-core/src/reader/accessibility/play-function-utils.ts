/**
 * Play Function Utilities - Reusable a11y test patterns for Storybook
 *
 * Provides utilities for testing accessibility in Storybook play functions.
 * Designed to work with @storybook/test and axe-core.
 *
 * Part of DevAC Phase 2: Runtime Detection (Issue #235)
 */

import type { Page } from "playwright";
import {
  type A11yViolation,
  type AxeScanOptions,
  type AxeScanResult,
  AxeScanner,
} from "./axe-scanner.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for runAxeCheck
 */
export interface AxeCheckOptions extends AxeScanOptions {
  /** Throw an error if violations are found (default: true) */
  throwOnViolations?: boolean;

  /** Minimum impact level to report (default: "minor") */
  minImpact?: "critical" | "serious" | "moderate" | "minor";

  /** Custom error message prefix */
  errorPrefix?: string;
}

/**
 * Options for keyboard navigation testing
 */
export interface KeyboardNavOptions {
  /** Starting element selector (default: first focusable) */
  startSelector?: string;

  /** Delay between key presses in ms (default: 100) */
  delay?: number;

  /** Whether to run axe check after navigation (default: true) */
  runAxeCheck?: boolean;

  /** Axe check options */
  axeOptions?: AxeScanOptions;
}

/**
 * Key sequence for keyboard navigation
 */
export type KeySequence = string | { key: string; modifiers?: string[] };

/**
 * Result of keyboard navigation test
 */
export interface KeyboardNavResult {
  /** Whether navigation completed successfully */
  success: boolean;

  /** Focus path during navigation (selectors or accessible names) */
  focusPath: string[];

  /** Any violations found during navigation */
  violations?: A11yViolation[];

  /** Error message if navigation failed */
  error?: string;
}

/**
 * Options for focus trap testing
 */
export interface FocusTrapOptions {
  /** Container selector for the focus trap */
  containerSelector: string;

  /** Number of Tab presses to verify trap (default: 10) */
  tabCount?: number;

  /** Delay between key presses in ms (default: 50) */
  delay?: number;
}

/**
 * Result of focus trap test
 */
export interface FocusTrapResult {
  /** Whether focus stayed within container */
  success: boolean;

  /** Elements that received focus */
  focusedElements: string[];

  /** Element that broke the trap (if any) */
  escapedTo?: string;

  /** Error message if test failed */
  error?: string;
}

// ============================================================================
// Axe Check Utilities
// ============================================================================

/**
 * Run an axe-core accessibility check on the page
 *
 * @example
 * ```typescript
 * // In a Storybook play function
 * export const Default: Story = {
 *   play: async ({ canvasElement }) => {
 *     // ...interact with the story...
 *     await runAxeCheck(page, canvasElement, "after-interaction");
 *   }
 * };
 * ```
 */
export async function runAxeCheck(
  page: Page,
  canvasElement: HTMLElement | string,
  stepName: string,
  options: AxeCheckOptions = {}
): Promise<AxeScanResult> {
  const {
    throwOnViolations = true,
    minImpact = "minor",
    errorPrefix = "Accessibility violation",
    ...axeOptions
  } = options;

  // Get selector for the canvas element
  const selector =
    typeof canvasElement === "string"
      ? canvasElement
      : canvasElement.id
        ? `#${canvasElement.id}`
        : "[data-testid='storybook-root']";

  const scanner = new AxeScanner(page);
  const result = await scanner.scan({
    ...axeOptions,
    selector,
    contextLabel: stepName,
  });

  // Filter violations by impact level
  const impactOrder = ["critical", "serious", "moderate", "minor"];
  const minImpactIndex = impactOrder.indexOf(minImpact);
  const filteredViolations = result.violations.filter((v) => {
    const violationIndex = impactOrder.indexOf(v.impact);
    return violationIndex <= minImpactIndex;
  });

  if (throwOnViolations && filteredViolations.length > 0) {
    const violationMessages = filteredViolations
      .map((v) => `- [${v.impact}] ${v.ruleName}: ${v.cssSelector}`)
      .join("\n");

    throw new Error(
      `${errorPrefix} in "${stepName}":\n${violationMessages}\n\nTotal: ${filteredViolations.length} violation(s)`
    );
  }

  return result;
}

/**
 * Assert no accessibility violations exist
 *
 * @example
 * ```typescript
 * const result = await scanner.scan();
 * assertNoViolations(result, "Button story");
 * ```
 */
export function assertNoViolations(result: AxeScanResult, context: string): void {
  if (result.violations.length > 0) {
    const violationMessages = result.violations
      .map((v) => `- [${v.impact}] ${v.ruleName}: ${v.cssSelector}`)
      .join("\n");

    throw new Error(
      `Accessibility violations in "${context}":\n${violationMessages}\n\nTotal: ${result.violations.length} violation(s)`
    );
  }
}

// ============================================================================
// Keyboard Navigation Utilities
// ============================================================================

/**
 * Test keyboard navigation through a sequence of keys
 *
 * @example
 * ```typescript
 * // Test Tab → Enter → Escape flow
 * const result = await testKeyboardNavigation(page, ["Tab", "Tab", "Enter", "Escape"]);
 * expect(result.success).toBe(true);
 * ```
 */
export async function testKeyboardNavigation(
  page: Page,
  keys: KeySequence[],
  options: KeyboardNavOptions = {}
): Promise<KeyboardNavResult> {
  const { startSelector, delay = 100, runAxeCheck: shouldRunAxe = true, axeOptions } = options;

  const focusPath: string[] = [];
  let violations: A11yViolation[] = [];

  try {
    // Focus starting element if specified
    if (startSelector) {
      await page.click(startSelector);
      await page.waitForTimeout(delay);
    }

    // Record initial focus
    const initialFocus = await getFocusedElementInfo(page);
    focusPath.push(initialFocus);

    // Navigate through keys
    for (const key of keys) {
      const keyString = typeof key === "string" ? key : key.key;
      const modifiers = typeof key === "object" ? key.modifiers : undefined;

      if (modifiers && modifiers.length > 0) {
        await page.keyboard.press(`${modifiers.join("+")}+${keyString}`);
      } else {
        await page.keyboard.press(keyString);
      }

      await page.waitForTimeout(delay);

      // Record focus after key press
      const currentFocus = await getFocusedElementInfo(page);
      focusPath.push(currentFocus);
    }

    // Run axe check if requested
    if (shouldRunAxe) {
      const scanner = new AxeScanner(page);
      const result = await scanner.scan({
        ...axeOptions,
        contextLabel: "after-keyboard-navigation",
      });
      violations = result.violations;
    }

    return {
      success: true,
      focusPath,
      violations: violations.length > 0 ? violations : undefined,
    };
  } catch (error) {
    return {
      success: false,
      focusPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get information about the currently focused element
 */
async function getFocusedElementInfo(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) {
      return "body";
    }

    // Try to get accessible name
    const accessibleName =
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby") ||
      (el as HTMLElement).innerText?.slice(0, 30) ||
      el.tagName.toLowerCase();

    // Try to get a useful identifier
    const testId = el.getAttribute("data-testid");
    const id = el.id;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();

    if (testId) return `[data-testid="${testId}"]`;
    if (id) return `#${id}`;
    return `${role}:${accessibleName}`;
  });
}

/**
 * Test that Tab key cycles through expected elements
 *
 * @example
 * ```typescript
 * await testTabOrder(page, ["#first-input", "#second-input", "#submit-button"]);
 * ```
 */
export async function testTabOrder(
  page: Page,
  expectedOrder: string[],
  options: Omit<KeyboardNavOptions, "startSelector"> = {}
): Promise<KeyboardNavResult> {
  const { delay = 100 } = options;
  const focusPath: string[] = [];

  try {
    // Click on body to start from a neutral position
    await page.click("body");
    await page.waitForTimeout(delay);

    // Tab through elements
    for (let i = 0; i < expectedOrder.length; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(delay);

      // Check if focused element matches expected
      const expected = expectedOrder[i] ?? "";
      const isFocused = await page.evaluate((selector: string) => {
        return document.activeElement?.matches(selector) ?? false;
      }, expected);

      const currentFocus = await getFocusedElementInfo(page);
      focusPath.push(currentFocus);

      if (!isFocused) {
        return {
          success: false,
          focusPath,
          error: `Expected focus on "${expected}" at step ${i + 1}, but found "${currentFocus}"`,
        };
      }
    }

    return {
      success: true,
      focusPath,
    };
  } catch (error) {
    return {
      success: false,
      focusPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Focus Trap Utilities
// ============================================================================

/**
 * Test that focus is trapped within a container (e.g., modal dialog)
 *
 * @example
 * ```typescript
 * // Open modal, then test focus trap
 * await page.click("#open-modal-button");
 * const result = await testFocusTrap(page, { containerSelector: "[role='dialog']" });
 * expect(result.success).toBe(true);
 * ```
 */
export async function testFocusTrap(
  page: Page,
  options: FocusTrapOptions
): Promise<FocusTrapResult> {
  const { containerSelector, tabCount = 10, delay = 50 } = options;

  const focusedElements: string[] = [];

  try {
    // Verify container exists
    const containerExists = await page.$(containerSelector);
    if (!containerExists) {
      return {
        success: false,
        focusedElements,
        error: `Container not found: ${containerSelector}`,
      };
    }

    // Tab through elements
    for (let i = 0; i < tabCount; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(delay);

      // Check if focus is still within container
      const focusInfo = await page.evaluate((selector) => {
        const container = document.querySelector(selector);
        const focused = document.activeElement;

        if (!container || !focused) {
          return { inside: false, element: "unknown" };
        }

        const inside = container.contains(focused);
        const element =
          focused.getAttribute("data-testid") ||
          focused.id ||
          focused.getAttribute("aria-label") ||
          focused.tagName.toLowerCase();

        return { inside, element };
      }, containerSelector);

      focusedElements.push(focusInfo.element);

      if (!focusInfo.inside) {
        return {
          success: false,
          focusedElements,
          escapedTo: focusInfo.element,
          error: `Focus escaped to "${focusInfo.element}" after ${i + 1} Tab presses`,
        };
      }
    }

    return {
      success: true,
      focusedElements,
    };
  } catch (error) {
    return {
      success: false,
      focusedElements,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test that Escape key dismisses a modal/dialog
 *
 * @example
 * ```typescript
 * await page.click("#open-modal");
 * await testEscapeDismisses(page, "[role='dialog']");
 * ```
 */
export async function testEscapeDismisses(
  page: Page,
  containerSelector: string,
  options: { delay?: number } = {}
): Promise<{ success: boolean; error?: string }> {
  const { delay = 100 } = options;

  try {
    // Verify container exists before pressing Escape
    const beforeExists = await page.$(containerSelector);
    if (!beforeExists) {
      return {
        success: false,
        error: `Container not found before Escape: ${containerSelector}`,
      };
    }

    // Press Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(delay);

    // Verify container is gone
    const afterExists = await page.$(containerSelector);
    if (afterExists) {
      // Check if it's now hidden
      const isVisible = await page.isVisible(containerSelector);
      if (isVisible) {
        return {
          success: false,
          error: `Container still visible after Escape: ${containerSelector}`,
        };
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Composite Test Utilities
// ============================================================================

/**
 * Run a comprehensive accessibility test suite for a component
 *
 * @example
 * ```typescript
 * const result = await runA11yTestSuite(page, {
 *   containerSelector: "#my-component",
 *   testKeyboard: true,
 *   testFocusTrap: false,
 * });
 * ```
 */
export async function runA11yTestSuite(
  page: Page,
  options: {
    containerSelector?: string;
    testKeyboard?: boolean;
    shouldTestFocusTrap?: boolean;
    focusTrapSelector?: string;
    keySequence?: KeySequence[];
    axeOptions?: AxeScanOptions;
  } = {}
): Promise<{
  axeResult: AxeScanResult;
  keyboardResult?: KeyboardNavResult;
  focusTrapResult?: FocusTrapResult;
  overallSuccess: boolean;
}> {
  const {
    containerSelector,
    testKeyboard = true,
    shouldTestFocusTrap = false,
    focusTrapSelector,
    keySequence = ["Tab", "Tab", "Tab", "Enter"],
    axeOptions,
  } = options;

  // Run axe check
  const scanner = new AxeScanner(page);
  const axeResult = await scanner.scan({
    ...axeOptions,
    selector: containerSelector,
    contextLabel: "initial-state",
  });

  let keyboardResult: KeyboardNavResult | undefined;
  let focusTrapResult: FocusTrapResult | undefined;

  // Run keyboard navigation test if requested
  if (testKeyboard) {
    keyboardResult = await testKeyboardNavigation(page, keySequence, {
      startSelector: containerSelector,
      runAxeCheck: false, // Already ran axe check
    });
  }

  // Run focus trap test if requested
  if (shouldTestFocusTrap && focusTrapSelector) {
    focusTrapResult = await testFocusTrap(page, {
      containerSelector: focusTrapSelector,
    });
  }

  // Determine overall success
  const overallSuccess =
    axeResult.violations.length === 0 &&
    (keyboardResult?.success ?? true) &&
    (focusTrapResult?.success ?? true);

  return {
    axeResult,
    keyboardResult,
    focusTrapResult,
    overallSuccess,
  };
}
