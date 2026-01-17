import { describe, expect, it } from "vitest";
import {
  BrowserError,
  DEFAULT_LIMITS,
  ElementNotFoundError,
  NavigationError,
  SessionLimitError,
  SessionNotFoundError,
  StaleElementRefError,
  TimeoutError,
} from "../src/index.js";

describe("browser-core types", () => {
  describe("DEFAULT_LIMITS", () => {
    it("has expected default values", () => {
      expect(DEFAULT_LIMITS.maxConcurrentSessions).toBe(3);
      expect(DEFAULT_LIMITS.maxPagesPerSession).toBe(10);
      expect(DEFAULT_LIMITS.maxElementRefs).toBe(1000);
      expect(DEFAULT_LIMITS.sessionTimeout).toBe(300_000);
      expect(DEFAULT_LIMITS.navigationTimeout).toBe(30_000);
      expect(DEFAULT_LIMITS.actionTimeout).toBe(10_000);
      expect(DEFAULT_LIMITS.screenshotMaxSize).toBe(5_242_880);
    });
  });

  describe("Error classes", () => {
    it("BrowserError has correct properties", () => {
      const error = new BrowserError("Test error", "TEST_CODE");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("BrowserError");
      expect(error).toBeInstanceOf(Error);
    });

    it("StaleElementRefError has correct message and code", () => {
      const error = new StaleElementRefError("button:Submit");
      expect(error.message).toContain("button:Submit");
      expect(error.message).toContain("no longer valid");
      expect(error.code).toBe("STALE_ELEMENT_REF");
      expect(error.name).toBe("StaleElementRefError");
    });

    it("ElementNotFoundError has correct message and code", () => {
      const error = new ElementNotFoundError("ref_123");
      expect(error.message).toContain("ref_123");
      expect(error.message).toContain("not found");
      expect(error.code).toBe("ELEMENT_NOT_FOUND");
      expect(error.name).toBe("ElementNotFoundError");
    });

    it("SessionNotFoundError has correct message and code", () => {
      const error = new SessionNotFoundError("sess_abc");
      expect(error.message).toContain("sess_abc");
      expect(error.code).toBe("SESSION_NOT_FOUND");
      expect(error.name).toBe("SessionNotFoundError");
    });

    it("SessionLimitError has correct message and code", () => {
      const error = new SessionLimitError(3);
      expect(error.message).toContain("3");
      expect(error.message).toContain("Maximum");
      expect(error.code).toBe("SESSION_LIMIT");
      expect(error.name).toBe("SessionLimitError");
    });

    it("NavigationError has correct message and code", () => {
      const error = new NavigationError("https://example.com", "timeout");
      expect(error.message).toContain("https://example.com");
      expect(error.message).toContain("timeout");
      expect(error.code).toBe("NAVIGATION_ERROR");
      expect(error.name).toBe("NavigationError");
    });

    it("TimeoutError has correct message and code", () => {
      const error = new TimeoutError("Navigation", 30000);
      expect(error.message).toContain("Navigation");
      expect(error.message).toContain("30000ms");
      expect(error.code).toBe("TIMEOUT");
      expect(error.name).toBe("TimeoutError");
    });
  });
});
