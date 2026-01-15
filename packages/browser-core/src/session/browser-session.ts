/**
 * BrowserSession - Wraps Playwright Browser + BrowserContext
 *
 * Manages the browser lifecycle and provides PageContext instances.
 */

import { type Browser, type BrowserContext, chromium, firefox, webkit } from "playwright";
import type { SessionConfig, SessionInfo } from "../types/index.js";
import { DEFAULT_LIMITS } from "../types/index.js";
import { PageContext } from "./page-context.js";

export type BrowserType = "chromium" | "firefox" | "webkit";

export interface BrowserSessionOptions extends SessionConfig {
  /** Browser type (default: chromium) */
  browserType?: BrowserType;
}

export class BrowserSession {
  readonly id: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private currentPage: PageContext | null = null;
  private pages: Map<string, PageContext> = new Map();
  private pageCounter = 0;
  private readonly options: BrowserSessionOptions;
  private readonly startTime: number;
  private closed = false;

  private constructor(id: string, options: BrowserSessionOptions) {
    this.id = id;
    this.options = options;
    this.startTime = Date.now();
  }

  /**
   * Create a new browser session
   */
  static async create(id: string, options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    const session = new BrowserSession(id, options);
    await session.initialize();
    return session;
  }

  /**
   * Initialize the browser and context
   */
  private async initialize(): Promise<void> {
    const browserType = this.options.browserType || "chromium";
    const headless = this.options.headless !== false; // Default to headless

    // Launch browser
    const launcher =
      browserType === "firefox" ? firefox : browserType === "webkit" ? webkit : chromium;

    this.browser = await launcher.launch({
      headless,
    });

    // Create browser context with viewport
    const viewport = this.options.viewport || { width: 1280, height: 720 };

    this.context = await this.browser.newContext({
      viewport,
      userAgent: this.options.userAgent,
    });

    // Create initial page
    await this.newPage();
  }

  /**
   * Get session info
   */
  getInfo(): SessionInfo {
    return {
      id: this.id,
      startTime: this.startTime,
      currentUrl: this.currentPage?.url() || null,
      headless: this.options.headless !== false,
      pageCount: this.pages.size,
    };
  }

  /**
   * Check if session is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get the current active page
   */
  getCurrentPage(): PageContext | null {
    return this.currentPage;
  }

  /**
   * Get a page by ID
   */
  getPage(pageId: string): PageContext | undefined {
    return this.pages.get(pageId);
  }

  /**
   * List all pages in this session
   */
  listPages(): Array<{ id: string; url: string | null }> {
    return Array.from(this.pages.entries()).map(([id, page]) => ({
      id,
      url: page.url() || null,
    }));
  }

  /**
   * Create a new page in this session
   */
  async newPage(): Promise<PageContext> {
    if (this.closed) {
      throw new Error("Session is closed");
    }

    if (!this.context) {
      throw new Error("Browser context not initialized");
    }

    if (this.pages.size >= DEFAULT_LIMITS.maxPagesPerSession) {
      throw new Error(
        `Maximum pages per session (${DEFAULT_LIMITS.maxPagesPerSession}) reached. Close a page before opening a new one.`
      );
    }

    const playwrightPage = await this.context.newPage();
    const pageId = `page_${++this.pageCounter}`;
    const pageContext = new PageContext(pageId, playwrightPage);

    this.pages.set(pageId, pageContext);
    this.currentPage = pageContext;

    return pageContext;
  }

  /**
   * Close a specific page
   */
  async closePage(pageId?: string): Promise<void> {
    const id = pageId || this.currentPage?.id;
    if (!id) {
      return;
    }

    const page = this.pages.get(id);
    if (page) {
      await page.close();
      this.pages.delete(id);

      // Update current page if we closed it
      if (this.currentPage?.id === id) {
        this.currentPage = this.pages.size > 0 ? Array.from(this.pages.values())[0] || null : null;
      }
    }
  }

  /**
   * Switch to a different page
   */
  switchToPage(pageId: string): PageContext {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page '${pageId}' not found in session`);
    }
    this.currentPage = page;
    return page;
  }

  /**
   * Close the session and all pages
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Close all pages
    for (const page of this.pages.values()) {
      try {
        await page.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.pages.clear();
    this.currentPage = null;

    // Close context
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.context = null;
    }

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.browser = null;
    }
  }
}
