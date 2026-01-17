/**
 * Session Module
 *
 * Provides browser session management:
 * - SessionManager: Singleton for managing all sessions
 * - BrowserSession: Wraps Playwright browser + context
 * - PageContext: Wraps Playwright page with element ref tracking
 */

export { SessionManager, type SessionManagerConfig } from "./session-manager.js";
export { BrowserSession, type BrowserSessionOptions, type BrowserType } from "./browser-session.js";
export { PageContext, type PageState } from "./page-context.js";
