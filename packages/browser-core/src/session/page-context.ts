/**
 * PageContext - Wraps Playwright Page with browser-core API
 *
 * Provides navigation, element ref management, and page operations.
 * Element refs are invalidated on navigation.
 */

import type { Locator, Page } from "playwright";
import type {
  NavigateOptions,
  ScreenshotOptions,
  ScreenshotResult,
  WaitCondition,
  WaitOptions,
} from "../types/index.js";
import {
  DEFAULT_LIMITS,
  NavigationError,
  StaleElementRefError,
  TimeoutError,
} from "../types/index.js";

export interface PageState {
  id: string;
  url: string | null;
  title: string | null;
  isLoading: boolean;
  refVersion: number;
}

export class PageContext {
  readonly id: string;
  private readonly page: Page;
  private elementRefMap: Map<string, string> = new Map(); // ref -> selector
  private refVersion = 0;
  private isNavigating = false;

  constructor(id: string, page: Page) {
    this.id = id;
    this.page = page;

    // Listen for navigation events to invalidate refs
    this.page.on("framenavigated", (frame) => {
      if (frame === this.page.mainFrame()) {
        this.invalidateRefs();
      }
    });
  }

  /**
   * Get the underlying Playwright page (for internal use)
   */
  getPlaywrightPage(): Page {
    return this.page;
  }

  /**
   * Get current page state
   */
  async getState(): Promise<PageState> {
    return {
      id: this.id,
      url: this.page.url() || null,
      title: await this.page.title(),
      isLoading: this.isNavigating,
      refVersion: this.refVersion,
    };
  }

  /**
   * Get current URL
   */
  url(): string {
    return this.page.url();
  }

  /**
   * Get page title
   */
  async title(): Promise<string> {
    return await this.page.title();
  }

  // ================== Navigation ==================

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    this.isNavigating = true;
    try {
      const response = await this.page.goto(url, {
        waitUntil: options.waitUntil || "load",
        timeout: options.timeout || DEFAULT_LIMITS.navigationTimeout,
      });

      if (!response) {
        throw new NavigationError(url, "No response received");
      }

      if (!response.ok() && response.status() >= 400) {
        throw new NavigationError(url, `HTTP ${response.status()}`);
      }
    } catch (error) {
      if (error instanceof NavigationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new NavigationError(url, message);
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Reload the current page
   */
  async reload(options: NavigateOptions = {}): Promise<void> {
    this.isNavigating = true;
    try {
      await this.page.reload({
        waitUntil: options.waitUntil || "load",
        timeout: options.timeout || DEFAULT_LIMITS.navigationTimeout,
      });
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Go back in history
   */
  async goBack(options: NavigateOptions = {}): Promise<void> {
    this.isNavigating = true;
    try {
      await this.page.goBack({
        waitUntil: options.waitUntil || "load",
        timeout: options.timeout || DEFAULT_LIMITS.navigationTimeout,
      });
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Go forward in history
   */
  async goForward(options: NavigateOptions = {}): Promise<void> {
    this.isNavigating = true;
    try {
      await this.page.goForward({
        waitUntil: options.waitUntil || "load",
        timeout: options.timeout || DEFAULT_LIMITS.navigationTimeout,
      });
    } finally {
      this.isNavigating = false;
    }
  }

  // ================== Wait Conditions ==================

  /**
   * Wait for a condition
   */
  async wait(condition: WaitCondition, options: WaitOptions = {}): Promise<void> {
    const timeout = options.timeout || DEFAULT_LIMITS.navigationTimeout;

    try {
      switch (condition.type) {
        case "selector":
          await this.page.waitForSelector(condition.selector, { timeout });
          break;

        case "text":
          await this.page.waitForSelector(`text=${condition.text}`, { timeout });
          break;

        case "visible": {
          const selector = this.getSelector(condition.ref);
          await this.page.waitForSelector(selector, { state: "visible", timeout });
          break;
        }

        case "hidden": {
          const selector = this.getSelector(condition.ref);
          await this.page.waitForSelector(selector, { state: "hidden", timeout });
          break;
        }

        case "navigation":
          await this.page.waitForNavigation({ timeout });
          break;

        case "networkIdle":
          await this.page.waitForLoadState("networkidle", { timeout });
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("timeout") || message.includes("Timeout")) {
        throw new TimeoutError(`Wait for ${condition.type}`, timeout);
      }
      throw error;
    }
  }

  // ================== Element Ref Management ==================

  /**
   * Invalidate all element refs (called on navigation)
   */
  invalidateRefs(): void {
    this.elementRefMap.clear();
    this.refVersion++;
  }

  /**
   * Register an element ref with its selector
   */
  registerRef(ref: string, selector: string): void {
    this.elementRefMap.set(ref, selector);
  }

  /**
   * Get the selector for a ref
   */
  getSelector(ref: string): string {
    const selector = this.elementRefMap.get(ref);
    if (!selector) {
      throw new StaleElementRefError(ref);
    }
    return selector;
  }

  /**
   * Check if a ref is valid
   */
  hasRef(ref: string): boolean {
    return this.elementRefMap.has(ref);
  }

  /**
   * Get current ref version
   */
  getRefVersion(): number {
    return this.refVersion;
  }

  /**
   * Get locator for a ref
   */
  getLocator(ref: string): Locator {
    const selector = this.getSelector(ref);
    return this.page.locator(selector);
  }

  /**
   * Get all registered refs
   */
  getRegisteredRefs(): string[] {
    return Array.from(this.elementRefMap.keys());
  }

  // ================== Basic Actions (delegated from actions module) ==================

  /**
   * Click an element by ref
   */
  async click(ref: string): Promise<void> {
    const locator = this.getLocator(ref);
    await locator.click({ timeout: DEFAULT_LIMITS.actionTimeout });
  }

  /**
   * Type text into an element
   */
  async type(
    ref: string,
    text: string,
    options: { delay?: number; clear?: boolean } = {}
  ): Promise<void> {
    const locator = this.getLocator(ref);
    if (options.clear) {
      await locator.clear();
    }
    await locator.pressSequentially(text, {
      delay: options.delay || 0,
      timeout: DEFAULT_LIMITS.actionTimeout,
    });
  }

  /**
   * Fill an input field (clears first)
   */
  async fill(ref: string, value: string): Promise<void> {
    const locator = this.getLocator(ref);
    await locator.fill(value, { timeout: DEFAULT_LIMITS.actionTimeout });
  }

  /**
   * Select a dropdown option
   */
  async select(ref: string, value: string): Promise<void> {
    const locator = this.getLocator(ref);
    await locator.selectOption(value, { timeout: DEFAULT_LIMITS.actionTimeout });
  }

  /**
   * Scroll the page or an element
   */
  async scroll(
    direction: "up" | "down" | "left" | "right",
    amount = 500,
    ref?: string
  ): Promise<void> {
    const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0;
    const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0;

    if (ref) {
      const locator = this.getLocator(ref);
      await locator.evaluate(
        (el, { dx, dy }) => {
          el.scrollBy(dx, dy);
        },
        { dx: deltaX, dy: deltaY }
      );
    } else {
      await this.page.mouse.wheel(deltaX, deltaY);
    }
  }

  /**
   * Hover over an element
   */
  async hover(ref: string): Promise<void> {
    const locator = this.getLocator(ref);
    await locator.hover({ timeout: DEFAULT_LIMITS.actionTimeout });
  }

  /**
   * Press a key or key combination
   */
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  // ================== JavaScript Execution ==================

  /**
   * Execute JavaScript in the page context
   */
  async evaluate<T>(script: string, ...args: unknown[]): Promise<T> {
    // Wrap the script in a function if it's not already
    const fn = new Function(...args.map((_, i) => `arg${i}`), script);
    return await this.page.evaluate(fn as () => T, ...args);
  }

  // ================== Screenshot ==================

  /**
   * Take a screenshot
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    const timestamp = Date.now();
    const filename = options.name || `screenshot_${timestamp}`;

    // Determine path (will be handled by ScreenshotManager in full implementation)
    const path = `/tmp/browser-screenshots/${this.id}/${filename}.png`;

    // Ensure directory exists
    await this.page.evaluate(() => {
      // This is a placeholder - actual file handling done by ScreenshotManager
    });

    const screenshotOptions: Parameters<Page["screenshot"]>[0] = {
      path,
      fullPage: options.fullPage || false,
      type: "png",
    };

    if (options.selector) {
      const locator = this.page.locator(options.selector);
      await locator.screenshot(screenshotOptions);
      // Get dimensions from buffer
      return {
        path,
        width: 0, // Would need to parse PNG header
        height: 0,
        timestamp,
      };
    }

    if (options.clip) {
      screenshotOptions.clip = options.clip;
    }

    await this.page.screenshot(screenshotOptions);

    const viewport = this.page.viewportSize();
    return {
      path,
      width: viewport?.width || 0,
      height: viewport?.height || 0,
      timestamp,
    };
  }

  // ================== Cleanup ==================

  /**
   * Close the page
   */
  async close(): Promise<void> {
    this.invalidateRefs();
    await this.page.close();
  }
}
