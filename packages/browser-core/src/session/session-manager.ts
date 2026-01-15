/**
 * SessionManager - Singleton for managing browser sessions
 *
 * Provides centralized management of all browser sessions,
 * enforces resource limits, and tracks the "current" session
 * for convenience in MCP/CLI usage.
 */

import type { SessionInfo } from "../types/index.js";
import { DEFAULT_LIMITS, SessionLimitError, SessionNotFoundError } from "../types/index.js";
import { BrowserSession, type BrowserSessionOptions } from "./browser-session.js";

export interface SessionManagerConfig {
  /** Maximum concurrent sessions (default: 3) */
  maxConcurrentSessions?: number;
  /** Default headless mode (default: true) */
  defaultHeadless?: boolean;
  /** Session timeout in ms (default: 300000) */
  sessionTimeout?: number;
}

export class SessionManager {
  private static instance: SessionManager | null = null;

  private sessions: Map<string, BrowserSession> = new Map();
  private sessionCounter = 0;
  private currentSessionId: string | null = null;
  private config: Required<SessionManagerConfig>;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  private constructor(config: SessionManagerConfig = {}) {
    this.config = {
      maxConcurrentSessions: config.maxConcurrentSessions ?? DEFAULT_LIMITS.maxConcurrentSessions,
      defaultHeadless: config.defaultHeadless ?? true,
      sessionTimeout: config.sessionTimeout ?? DEFAULT_LIMITS.sessionTimeout,
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config?: SessionManagerConfig): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(config);
    }
    return SessionManager.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static async resetInstance(): Promise<void> {
    if (SessionManager.instance) {
      await SessionManager.instance.closeAll();
      SessionManager.instance = null;
    }
  }

  /**
   * Create a new browser session
   */
  async createSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    // Check limit
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new SessionLimitError(this.config.maxConcurrentSessions);
    }

    // Generate session ID
    const sessionId = `session_${++this.sessionCounter}_${Date.now()}`;

    // Apply defaults
    const sessionOptions: BrowserSessionOptions = {
      headless: options.headless ?? this.config.defaultHeadless,
      ...options,
    };

    // Create session
    const session = await BrowserSession.create(sessionId, sessionOptions);
    this.sessions.set(sessionId, session);

    // Set as current session
    this.currentSessionId = sessionId;

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Get the current active session
   */
  getCurrentSession(): BrowserSession | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) || null;
  }

  /**
   * Get current session or throw if none
   */
  requireCurrentSession(): BrowserSession {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error("No active browser session. Call browser_session_start first.");
    }
    return session;
  }

  /**
   * Set the current session
   */
  setCurrentSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new SessionNotFoundError(sessionId);
    }
    this.currentSessionId = sessionId;
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => session.getInfo());
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId?: string): Promise<void> {
    const id = sessionId || this.currentSessionId;
    if (!id) {
      return;
    }

    const session = this.sessions.get(id);
    if (session) {
      await session.close();
      this.sessions.delete(id);

      // Update current session if we closed it
      if (this.currentSessionId === id) {
        this.currentSessionId =
          this.sessions.size > 0 ? Array.from(this.sessions.keys())[0] || null : null;
      }
    }
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    this.stopCleanupInterval();

    const closePromises = Array.from(this.sessions.values()).map(async (session) => {
      try {
        await session.close();
      } catch {
        // Ignore errors during cleanup
      }
    });

    await Promise.all(closePromises);
    this.sessions.clear();
    this.currentSessionId = null;
  }

  /**
   * Start the cleanup interval for timed-out sessions
   */
  private startCleanupInterval(): void {
    // Check every minute for timed-out sessions
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupTimedOutSessions();
    }, 60 * 1000);
  }

  /**
   * Stop the cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Clean up sessions that have exceeded the timeout
   */
  private cleanupTimedOutSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      const info = session.getInfo();
      const age = now - info.startTime;

      if (age > this.config.sessionTimeout) {
        // Session has timed out - close it
        this.closeSession(sessionId).catch(() => {
          // Ignore cleanup errors
        });
      }
    }
  }
}
