/**
 * Browser Core Types
 *
 * Core type definitions for browser automation.
 */

// ================== Session Types ==================

export interface SessionConfig {
  /** Run in headless mode (default: true) */
  headless?: boolean;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Navigation timeout in ms (default: 30000) */
  timeout?: number;
  /** User agent string override */
  userAgent?: string;
}

export interface SessionInfo {
  /** Unique session identifier */
  id: string;
  /** Session start timestamp */
  startTime: number;
  /** Current page URL or null if no page */
  currentUrl: string | null;
  /** Whether running in headless mode */
  headless: boolean;
  /** Number of pages in session */
  pageCount: number;
}

// ================== Element Reference Types (Hybrid Strategy) ==================

/**
 * Element reference for interacting with page elements.
 *
 * Refs are generated using a hybrid strategy:
 * 1. testId - data-testid attribute (most deterministic)
 * 2. ariaLabel - aria-label attribute
 * 3. role:name - Semantic ref from ARIA role + accessible name
 * 4. fallback - Context-aware sequential ref (e.g., form_1:button_2)
 */
export interface ElementRef {
  /** Primary identifier (best available: testId > ariaLabel > role:name > fallback) */
  ref: string;
  /** data-testid attribute if present */
  testId?: string;
  /** aria-label attribute if present */
  ariaLabel?: string;
  /** ARIA role (button, textbox, link, etc.) */
  role: string;
  /** Accessible name */
  name: string;
  /** HTML tag name */
  tag: string;
  /** Computed CSS selector (internal use for Playwright) */
  selector: string;
  /** Whether element is interactive (clickable, editable) */
  isInteractive: boolean;
  /** Whether element is visible on page */
  isVisible: boolean;
  /** Optional bounding box for element position */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Page content from reading the accessibility tree.
 */
export interface PageContent {
  /** Current page URL */
  url: string;
  /** Page title */
  title: string;
  /** List of element refs */
  elements: ElementRef[];
  /** Ref version - increments on navigation (detects stale refs) */
  refVersion: number;
  /** Timestamp when content was read */
  timestamp: number;
}

// ================== Action Types ==================

export interface ClickOptions {
  /** Mouse button (default: left) */
  button?: "left" | "right" | "middle";
  /** Number of clicks (default: 1) */
  clickCount?: number;
  /** Keyboard modifiers */
  modifiers?: Array<"Alt" | "Control" | "Meta" | "Shift">;
  /** Action timeout in ms */
  timeout?: number;
}

export interface TypeOptions {
  /** Delay between keystrokes in ms */
  delay?: number;
  /** Clear existing content before typing */
  clear?: boolean;
  /** Action timeout in ms */
  timeout?: number;
}

export interface FillOptions {
  /** Force fill even if element is not editable */
  force?: boolean;
  /** Action timeout in ms */
  timeout?: number;
}

export interface SelectOptions {
  /** Select by value, label, or index */
  by?: "value" | "label" | "index";
  /** Action timeout in ms */
  timeout?: number;
}

export interface ScrollOptions {
  /** Scroll direction */
  direction: "up" | "down" | "left" | "right";
  /** Scroll amount in pixels (default: 500) */
  amount?: number;
  /** Action timeout in ms */
  timeout?: number;
}

export interface WaitOptions {
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

export type WaitCondition =
  | { type: "selector"; selector: string }
  | { type: "text"; text: string }
  | { type: "visible"; ref: string }
  | { type: "hidden"; ref: string }
  | { type: "navigation" }
  | { type: "networkIdle" };

// ================== Navigation Types ==================

export interface NavigateOptions {
  /** When to consider navigation complete */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Navigation timeout in ms */
  timeout?: number;
}

// ================== Screenshot Types ==================

export interface ScreenshotOptions {
  /** Capture full scrollable page (default: false) */
  fullPage?: boolean;
  /** CSS selector to capture specific element */
  selector?: string;
  /** Custom filename (without extension) */
  name?: string;
  /** Clip region */
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ScreenshotResult {
  /** Path to saved screenshot file */
  path: string;
  /** Screenshot width in pixels */
  width: number;
  /** Screenshot height in pixels */
  height: number;
  /** Timestamp when screenshot was taken */
  timestamp: number;
}

// ================== Find Types ==================

export type FindStrategy = "ref" | "selector" | "text" | "role" | "label";

export interface FindOptions {
  /** Search strategy */
  strategy: FindStrategy;
  /** Search value */
  value: string;
  /** For role strategy - accessible name filter */
  name?: string;
  /** Only find visible elements */
  visible?: boolean;
  /** Timeout for finding element */
  timeout?: number;
}

export interface FindResult {
  /** Found element refs */
  elements: ElementRef[];
  /** Number of elements found */
  count: number;
}

// ================== JavaScript Execution Types ==================

export interface EvaluateOptions {
  /** Arguments to pass to the script */
  args?: unknown[];
}

export interface EvaluateResult<T = unknown> {
  /** Returned value from script */
  value: T;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ================== Resource Limits ==================

export const DEFAULT_LIMITS = {
  /** Maximum concurrent browser sessions */
  maxConcurrentSessions: 3,
  /** Maximum pages per session */
  maxPagesPerSession: 10,
  /** Maximum element refs per page */
  maxElementRefs: 1000,
  /** Session timeout in ms (5 minutes) */
  sessionTimeout: 300_000,
  /** Navigation timeout in ms (30 seconds) */
  navigationTimeout: 30_000,
  /** Action timeout in ms (10 seconds) */
  actionTimeout: 10_000,
  /** Maximum screenshot file size in bytes (5MB) */
  screenshotMaxSize: 5_242_880,
} as const;

export type ResourceLimits = typeof DEFAULT_LIMITS;

// ================== Error Types ==================

export class BrowserError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "BrowserError";
  }
}

export class StaleElementRefError extends BrowserError {
  constructor(ref: string) {
    super(
      `Element ref '${ref}' is no longer valid (page navigated). Call browser_read_page to get new refs.`,
      "STALE_ELEMENT_REF"
    );
    this.name = "StaleElementRefError";
  }
}

export class ElementNotFoundError extends BrowserError {
  constructor(ref: string) {
    super(`Element with ref '${ref}' not found`, "ELEMENT_NOT_FOUND");
    this.name = "ElementNotFoundError";
  }
}

export class SessionNotFoundError extends BrowserError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

export class SessionLimitError extends BrowserError {
  constructor(limit: number) {
    super(
      `Maximum concurrent sessions (${limit}) reached. Close a session before starting a new one.`,
      "SESSION_LIMIT"
    );
    this.name = "SessionLimitError";
  }
}

export class NavigationError extends BrowserError {
  constructor(url: string, reason: string) {
    super(`Failed to navigate to '${url}': ${reason}`, "NAVIGATION_ERROR");
    this.name = "NavigationError";
  }
}

export class TimeoutError extends BrowserError {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`, "TIMEOUT");
    this.name = "TimeoutError";
  }
}
