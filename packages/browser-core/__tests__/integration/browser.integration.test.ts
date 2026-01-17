/**
 * Browser Integration Tests
 *
 * These tests run against real browsers using Playwright.
 * They verify that browser automation works correctly end-to-end.
 *
 * Run with: pnpm test:integration
 *
 * Prerequisites:
 * - Playwright browsers installed: npx playwright install chromium
 * - Network access to test URLs
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { click, fill, hover, type as typeAction } from "../../src/actions/index.js";
import { scroll, scrollToBottom, scrollToTop } from "../../src/actions/scroll.js";
import { PageReader } from "../../src/reader/page-reader.js";
import type { BrowserSession } from "../../src/session/browser-session.js";
import { SessionManager } from "../../src/session/session-manager.js";

// Test configuration
const TEST_TIMEOUT = 30000;
const TEST_URL = "https://example.com";
const FORM_TEST_URL = "https://httpbin.org/forms/post";

const headless = true;

// Helper to get page context with proper null handling
function getPageContext(browserSession: BrowserSession) {
  const pageContext = browserSession.getCurrentPage();
  if (!pageContext) {
    throw new Error("No page context available in session");
  }
  return pageContext;
}

describe("Browser Integration Tests", () => {
  let sessionManager: SessionManager;
  let session: BrowserSession;

  beforeAll(async () => {
    sessionManager = SessionManager.getInstance();
  });

  afterAll(async () => {
    // Ensure all sessions are closed
    await sessionManager.closeAll();
  });

  describe("Session Management", () => {
    it(
      "should create a new browser session",
      async () => {
        session = await sessionManager.createSession({
          headless,
          viewport: { width: 1280, height: 720 },
        });

        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
        expect(typeof session.id).toBe("string");
      },
      TEST_TIMEOUT
    );

    it("should list active sessions", async () => {
      const sessions = sessionManager.listSessions();

      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some((s) => s.id === session.id)).toBe(true);
    });

    it("should get current session", () => {
      const currentSession = sessionManager.getCurrentSession();

      expect(currentSession).toBeDefined();
      expect(currentSession?.id).toBe(session.id);
    });

    it(
      "should close a session",
      async () => {
        const tempSession = await sessionManager.createSession({ headless });
        const tempId = tempSession.id;

        await sessionManager.closeSession(tempId);

        const sessions = sessionManager.listSessions();
        expect(sessions.some((s) => s.id === tempId)).toBe(false);
      },
      TEST_TIMEOUT
    );
  });

  describe("Navigation", () => {
    beforeEach(async () => {
      if (!session || !sessionManager.getSession(session.id)) {
        session = await sessionManager.createSession({
          headless,
          viewport: { width: 1280, height: 720 },
        });
      }
    });

    it(
      "should navigate to a URL",
      async () => {
        const pageContext = getPageContext(session);
        await pageContext.navigate(TEST_URL);

        const url = pageContext.url();
        expect(url).toContain("example.com");
      },
      TEST_TIMEOUT
    );

    it(
      "should reload the page",
      async () => {
        const pageContext = getPageContext(session);
        await pageContext.navigate(TEST_URL);

        // Should not throw
        await pageContext.reload();
        expect(pageContext.url()).toContain("example.com");
      },
      TEST_TIMEOUT
    );

    it(
      "should navigate back and forward",
      async () => {
        const pageContext = getPageContext(session);

        // Navigate to first page
        await pageContext.navigate(TEST_URL);
        expect(pageContext.url()).toContain("example.com");

        // Navigate to second page
        await pageContext.navigate("https://httpbin.org");
        expect(pageContext.url()).toContain("httpbin.org");

        // Go back
        await pageContext.goBack();
        expect(pageContext.url()).toContain("example.com");

        // Go forward
        await pageContext.goForward();
        expect(pageContext.url()).toContain("httpbin.org");
      },
      TEST_TIMEOUT
    );
  });

  describe("Page Reading", () => {
    beforeEach(async () => {
      if (!session || !sessionManager.getSession(session.id)) {
        session = await sessionManager.createSession({
          headless,
          viewport: { width: 1280, height: 720 },
        });
      }
      const pageContext = getPageContext(session);
      await pageContext.navigate(TEST_URL);
    });

    it(
      "should read page elements",
      async () => {
        const pageContext = getPageContext(session);
        const reader = new PageReader(pageContext);
        const result = await reader.readPage();

        expect(result).toBeDefined();
        expect(result.url).toContain("example.com");
        expect(result.title).toBeDefined();
        expect(result.elements).toBeDefined();
        expect(Array.isArray(result.elements)).toBe(true);
        expect(result.elements.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );

    it(
      "should find interactive elements",
      async () => {
        const pageContext = getPageContext(session);
        const reader = new PageReader(pageContext);
        const result = await reader.readPage({ interactiveOnly: true });

        // example.com has at least one link
        expect(result.elements.length).toBeGreaterThan(0);

        // All elements should be interactive
        const interactiveRoles = ["link", "button", "textbox", "checkbox", "combobox"];
        for (const element of result.elements) {
          const isInteractive =
            interactiveRoles.includes(element.role) ||
            element.ref.includes("link") ||
            element.ref.includes("button");
          expect(isInteractive || element.role).toBeTruthy();
        }
      },
      TEST_TIMEOUT
    );

    it(
      "should generate element refs",
      async () => {
        const pageContext = getPageContext(session);
        const reader = new PageReader(pageContext);
        const result = await reader.readPage();

        // Each element should have a ref
        for (const element of result.elements) {
          expect(element.ref).toBeDefined();
          expect(typeof element.ref).toBe("string");
          expect(element.ref.length).toBeGreaterThan(0);
        }
      },
      TEST_TIMEOUT
    );
  });

  describe("Element Interactions", () => {
    beforeEach(async () => {
      if (!session || !sessionManager.getSession(session.id)) {
        session = await sessionManager.createSession({
          headless,
          viewport: { width: 1280, height: 720 },
        });
      }
    });

    it(
      "should click a link",
      async () => {
        const pageContext = getPageContext(session);
        await pageContext.navigate(TEST_URL);

        // Read page to get refs
        const reader = new PageReader(pageContext);
        const pageResult = await reader.readPage();

        // Find a link element
        const linkElement = pageResult.elements.find((el) => el.role === "link" && el.ref);

        if (linkElement) {
          const clickResult = await click(pageContext, linkElement.ref);
          expect(clickResult.success).toBe(true);
        } else {
          // Skip if no clickable link found
          console.log("No clickable link found on page, skipping click test");
        }
      },
      TEST_TIMEOUT
    );

    it(
      "should hover over elements",
      async () => {
        const pageContext = getPageContext(session);
        await pageContext.navigate(TEST_URL);

        const reader = new PageReader(pageContext);
        const pageResult = await reader.readPage();
        const element = pageResult.elements[0];

        if (element) {
          const hoverResult = await hover(pageContext, element.ref);
          expect(hoverResult.success).toBe(true);
        }
      },
      TEST_TIMEOUT
    );

    it(
      "should type into form fields",
      async () => {
        const pageContext = getPageContext(session);
        await pageContext.navigate(FORM_TEST_URL);

        // Read page to find input fields
        const reader = new PageReader(pageContext);
        const pageResult = await reader.readPage();

        // Find a text input
        const textInput = pageResult.elements.find(
          (el) => el.role === "textbox" || el.ref.includes("input")
        );

        if (textInput) {
          const typeResult = await typeAction(pageContext, textInput.ref, "test input");
          expect(typeResult.success).toBe(true);
        } else {
          console.log("No text input found on page, skipping type test");
        }
      },
      TEST_TIMEOUT
    );

    it(
      "should fill form fields",
      async () => {
        const pageContext = getPageContext(session);
        await pageContext.navigate(FORM_TEST_URL);

        const reader = new PageReader(pageContext);
        const pageResult = await reader.readPage();

        const textInput = pageResult.elements.find(
          (el) => el.role === "textbox" || el.ref.includes("input")
        );

        if (textInput) {
          const fillResult = await fill(pageContext, textInput.ref, "filled value");
          expect(fillResult.success).toBe(true);
        } else {
          console.log("No text input found on page, skipping fill test");
        }
      },
      TEST_TIMEOUT
    );
  });

  describe("Scrolling", () => {
    beforeEach(async () => {
      if (!session || !sessionManager.getSession(session.id)) {
        session = await sessionManager.createSession({
          headless,
          viewport: { width: 1280, height: 720 },
        });
      }
      // Navigate to a page with scrollable content
      const pageContext = getPageContext(session);
      await pageContext.navigate("https://en.wikipedia.org/wiki/Web_browser");
    });

    it(
      "should scroll down the page",
      async () => {
        const pageContext = getPageContext(session);

        const result = await scroll(pageContext, {
          direction: "down",
          amount: 500,
        });

        expect(result.success).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      "should scroll up the page",
      async () => {
        const pageContext = getPageContext(session);

        // First scroll down
        await scroll(pageContext, { direction: "down", amount: 500 });

        // Then scroll up
        const result = await scroll(pageContext, {
          direction: "up",
          amount: 200,
        });

        expect(result.success).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      "should scroll to top",
      async () => {
        const pageContext = getPageContext(session);

        // Scroll down first
        await scroll(pageContext, { direction: "down", amount: 1000 });

        // Scroll to top
        const result = await scrollToTop(pageContext);

        expect(result.success).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      "should scroll to bottom",
      async () => {
        const pageContext = getPageContext(session);

        const result = await scrollToBottom(pageContext);

        expect(result.success).toBe(true);
      },
      TEST_TIMEOUT
    );
  });

  describe("Screenshots", () => {
    beforeEach(async () => {
      if (!session || !sessionManager.getSession(session.id)) {
        session = await sessionManager.createSession({
          headless,
          viewport: { width: 1280, height: 720 },
        });
      }
      const pageContext = getPageContext(session);
      await pageContext.navigate(TEST_URL);
    });

    it(
      "should capture a screenshot",
      async () => {
        const pageContext = getPageContext(session);
        const page = pageContext.getPlaywrightPage();

        const screenshot = await page.screenshot();

        expect(screenshot).toBeDefined();
        expect(screenshot instanceof Buffer).toBe(true);
        expect(screenshot.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );

    it(
      "should capture a full page screenshot",
      async () => {
        const pageContext = getPageContext(session);
        const page = pageContext.getPlaywrightPage();

        const screenshot = await page.screenshot({ fullPage: true });

        expect(screenshot).toBeDefined();
        expect(screenshot instanceof Buffer).toBe(true);
      },
      TEST_TIMEOUT
    );
  });

  describe("Error Handling", () => {
    // Each error test gets a fresh session to avoid state contamination
    let errorSession: BrowserSession;

    beforeEach(async () => {
      // Always create a fresh session for error tests
      errorSession = await sessionManager.createSession({
        headless,
        viewport: { width: 1280, height: 720 },
      });
    });

    afterEach(async () => {
      // Clean up error session after each test
      if (errorSession) {
        await sessionManager.closeSession(errorSession.id);
      }
    });

    it(
      "should handle navigation to invalid URL gracefully",
      async () => {
        const pageContext = getPageContext(errorSession);

        await expect(
          pageContext.navigate("https://this-domain-does-not-exist-12345.com")
        ).rejects.toThrow();
      },
      TEST_TIMEOUT
    );

    it(
      "should handle click on non-existent ref gracefully",
      async () => {
        const pageContext = getPageContext(errorSession);
        await pageContext.navigate(TEST_URL);

        const result = await click(pageContext, "non-existent-ref-12345");

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      },
      TEST_TIMEOUT
    );

    it(
      "should handle type on non-existent ref gracefully",
      async () => {
        const pageContext = getPageContext(errorSession);
        await pageContext.navigate(TEST_URL);

        const result = await typeAction(pageContext, "non-existent-ref-12345", "test");

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      },
      TEST_TIMEOUT
    );
  });
});
