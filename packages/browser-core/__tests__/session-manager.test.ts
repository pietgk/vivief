import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionLimitError, SessionManager, SessionNotFoundError } from "../src/index.js";

// Mock Playwright
vi.mock("playwright", () => {
  const mockPage = {
    url: vi.fn().mockReturnValue("about:blank"),
    title: vi.fn().mockResolvedValue("Test Page"),
    goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
    reload: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    locator: vi.fn().mockReturnValue({
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
    }),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    evaluate: vi.fn().mockResolvedValue(undefined),
    mainFrame: vi.fn().mockReturnValue({}),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
    firefox: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
    webkit: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

describe("SessionManager", () => {
  beforeEach(async () => {
    // Reset singleton before each test
    await SessionManager.resetInstance();
  });

  afterEach(async () => {
    // Clean up after each test
    await SessionManager.resetInstance();
  });

  describe("getInstance", () => {
    it("returns singleton instance", () => {
      const instance1 = SessionManager.getInstance();
      const instance2 = SessionManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("accepts configuration on first call", () => {
      const manager = SessionManager.getInstance({ maxConcurrentSessions: 5 });
      expect(manager).toBeDefined();
    });
  });

  describe("createSession", () => {
    it("creates a new browser session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session_/);
      expect(manager.getSessionCount()).toBe(1);
    });

    it("sets the created session as current", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createSession();

      expect(manager.getCurrentSession()).toBe(session);
    });

    it("respects headless option", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createSession({ headless: false });

      const info = session.getInfo();
      expect(info.headless).toBe(false);
    });

    it("throws SessionLimitError when limit reached", async () => {
      const manager = SessionManager.getInstance({ maxConcurrentSessions: 2 });

      await manager.createSession();
      await manager.createSession();

      await expect(manager.createSession()).rejects.toThrow(SessionLimitError);
    });
  });

  describe("getSession", () => {
    it("returns session by ID", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createSession();

      const retrieved = manager.getSession(session.id);
      expect(retrieved).toBe(session);
    });

    it("throws SessionNotFoundError for invalid ID", () => {
      const manager = SessionManager.getInstance();

      expect(() => manager.getSession("invalid_id")).toThrow(SessionNotFoundError);
    });
  });

  describe("getCurrentSession", () => {
    it("returns null when no sessions", () => {
      const manager = SessionManager.getInstance();
      expect(manager.getCurrentSession()).toBeNull();
    });

    it("returns the most recently created session", async () => {
      const manager = SessionManager.getInstance();
      await manager.createSession();
      const session2 = await manager.createSession();

      expect(manager.getCurrentSession()).toBe(session2);
    });
  });

  describe("requireCurrentSession", () => {
    it("throws when no current session", () => {
      const manager = SessionManager.getInstance();

      expect(() => manager.requireCurrentSession()).toThrow("No active browser session");
    });

    it("returns current session when exists", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createSession();

      expect(manager.requireCurrentSession()).toBe(session);
    });
  });

  describe("listSessions", () => {
    it("returns empty array when no sessions", () => {
      const manager = SessionManager.getInstance();
      expect(manager.listSessions()).toEqual([]);
    });

    it("returns info for all sessions", async () => {
      const manager = SessionManager.getInstance();
      await manager.createSession();
      await manager.createSession();

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toHaveProperty("id");
      expect(sessions[0]).toHaveProperty("startTime");
      expect(sessions[0]).toHaveProperty("headless");
    });
  });

  describe("closeSession", () => {
    it("closes and removes session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createSession();

      await manager.closeSession(session.id);

      expect(manager.getSessionCount()).toBe(0);
      expect(manager.hasSession(session.id)).toBe(false);
    });

    it("updates current session when closing current", async () => {
      const manager = SessionManager.getInstance();
      const session1 = await manager.createSession();
      const session2 = await manager.createSession();

      // session2 is current
      expect(manager.getCurrentSession()).toBe(session2);

      await manager.closeSession(session2.id);

      // session1 should now be current
      expect(manager.getCurrentSession()).toBe(session1);
    });

    it("closes current session when no ID provided", async () => {
      const manager = SessionManager.getInstance();
      await manager.createSession();

      await manager.closeSession();

      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe("closeAll", () => {
    it("closes all sessions", async () => {
      const manager = SessionManager.getInstance();
      await manager.createSession();
      await manager.createSession();
      await manager.createSession();

      await manager.closeAll();

      expect(manager.getSessionCount()).toBe(0);
      expect(manager.getCurrentSession()).toBeNull();
    });
  });

  describe("setCurrentSession", () => {
    it("changes current session", async () => {
      const manager = SessionManager.getInstance();
      const session1 = await manager.createSession();
      await manager.createSession();

      manager.setCurrentSession(session1.id);

      expect(manager.getCurrentSession()).toBe(session1);
    });

    it("throws for invalid session ID", () => {
      const manager = SessionManager.getInstance();

      expect(() => manager.setCurrentSession("invalid")).toThrow(SessionNotFoundError);
    });
  });
});
