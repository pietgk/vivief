/**
 * @pietgk/browser-core
 *
 * Browser automation core engine wrapping Playwright.
 * Provides session management, page reading, element interaction,
 * and screenshot capabilities for AI agent consumption.
 */

// Version
export { VERSION } from "./version.js";

// Types
export type {
  // Session
  SessionConfig,
  SessionInfo,
  // Element refs
  ElementRef,
  PageContent,
  // Actions
  ClickOptions,
  TypeOptions,
  FillOptions,
  SelectOptions,
  ScrollOptions,
  WaitOptions,
  WaitCondition,
  // Navigation
  NavigateOptions,
  // Screenshot
  ScreenshotOptions,
  ScreenshotResult,
  // Find
  FindStrategy,
  FindOptions,
  FindResult,
  // JavaScript
  EvaluateOptions,
  EvaluateResult,
  // Resource limits
  ResourceLimits,
} from "./types/index.js";

// Constants
export { DEFAULT_LIMITS } from "./types/index.js";

// Errors
export {
  BrowserError,
  StaleElementRefError,
  ElementNotFoundError,
  SessionNotFoundError,
  SessionLimitError,
  NavigationError,
  TimeoutError,
} from "./types/index.js";

// Session management
export { SessionManager, type SessionManagerConfig } from "./session/index.js";
export { BrowserSession, type BrowserSessionOptions, type BrowserType } from "./session/index.js";
export { PageContext, type PageState } from "./session/index.js";

// Page reading
export { PageReader, type ReadPageOptions } from "./reader/index.js";
export {
  generateRef,
  createElementRef,
  isInteractiveElement,
  buildSelector,
  getParentContext,
  type RawElementData,
} from "./reader/index.js";

// Actions
export {
  click,
  doubleClick,
  rightClick,
  type,
  press,
  fill,
  clear,
  select,
  selectMultiple,
  scroll,
  scrollElement,
  scrollIntoView,
  scrollToTop,
  scrollToBottom,
  hover,
  type ClickResult,
  type TypeResult,
  type FillResult,
  type SelectResult,
  type ScrollResult,
  type HoverResult,
} from "./actions/index.js";

// Element finder
export { ElementFinder } from "./finder/index.js";

// Screenshot
export { ScreenshotManager, type ScreenshotManagerConfig } from "./screenshot/index.js";
