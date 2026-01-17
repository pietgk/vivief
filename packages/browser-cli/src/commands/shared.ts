/**
 * Shared CLI Utilities
 *
 * Common functions used across multiple CLI commands
 */

import { type PageContext, SessionManager } from "@pietgk/browser-core";

/**
 * Get the current page context from the active session
 * @throws Error if no session or page is active
 */
export function getCurrentPage(): PageContext {
  const manager = SessionManager.getInstance();
  const session = manager.getCurrentSession();
  if (!session) {
    throw new Error("No active browser session. Start one with: browser session start");
  }
  const page = session.getCurrentPage();
  if (!page) {
    throw new Error("No active page in session");
  }
  return page;
}

/**
 * Get the current session (without requiring a page)
 * @throws Error if no session is active
 */
export function getCurrentSession() {
  const manager = SessionManager.getInstance();
  const session = manager.getCurrentSession();
  if (!session) {
    throw new Error("No active browser session. Start one with: browser session start");
  }
  return session;
}

/**
 * Get the session manager instance
 */
export function getSessionManager() {
  return SessionManager.getInstance();
}
