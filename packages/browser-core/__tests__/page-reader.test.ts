import type { Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageReader } from "../src/reader/page-reader.js";
import type { PageContext } from "../src/session/page-context.js";

// Create mock page and page context
const createMockPage = () => {
  const mockPage = {
    url: vi.fn().mockReturnValue("https://example.com/test"),
    title: vi.fn().mockResolvedValue("Test Page"),
    evaluate: vi.fn(),
    locator: vi.fn().mockReturnValue({
      textContent: vi.fn().mockResolvedValue("Element text"),
      inputValue: vi.fn().mockResolvedValue("input value"),
      evaluate: vi.fn().mockResolvedValue({ id: "test", class: "button" }),
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
    }),
  };
  return mockPage as unknown as Page;
};

const createMockPageContext = (mockPage: Page) => {
  const refMap = new Map<string, string>();
  let refVersion = 1;

  return {
    getPlaywrightPage: vi.fn().mockReturnValue(mockPage),
    invalidateRefs: vi.fn().mockImplementation(() => {
      refMap.clear();
      refVersion++;
    }),
    registerRef: vi.fn().mockImplementation((ref: string, selector: string) => {
      refMap.set(ref, selector);
    }),
    getRefVersion: vi.fn().mockImplementation(() => refVersion),
    getLocator: vi.fn().mockImplementation((ref: string) => {
      return mockPage.locator(refMap.get(ref) || ref);
    }),
    getSelector: vi.fn().mockImplementation((ref: string) => refMap.get(ref)),
  } as unknown as PageContext;
};

describe("PageReader", () => {
  let mockPage: Page;
  let mockPageContext: PageContext;
  let pageReader: PageReader;

  beforeEach(() => {
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockPage);
    pageReader = new PageReader(mockPageContext);
  });

  describe("readPage", () => {
    it("reads page with elements and generates refs", async () => {
      const mockElements = [
        {
          tag: "button",
          role: "button",
          name: "Submit",
          testId: "submit-btn",
          ariaLabel: undefined,
          selector: '[data-testid="submit-btn"]',
          isInteractive: true,
          isVisible: true,
          boundingBox: { x: 100, y: 200, width: 120, height: 40 },
          parentContext: "form",
        },
        {
          tag: "input",
          role: "textbox",
          name: "Email",
          testId: "email-input",
          ariaLabel: "Enter your email",
          selector: '[data-testid="email-input"]',
          isInteractive: true,
          isVisible: true,
          boundingBox: { x: 100, y: 100, width: 200, height: 30 },
          parentContext: "form",
        },
        {
          tag: "a",
          role: "link",
          name: "Sign Up",
          testId: undefined,
          ariaLabel: undefined,
          selector: "nav > a:nth-of-type(2)",
          isInteractive: true,
          isVisible: true,
          boundingBox: { x: 300, y: 50, width: 80, height: 20 },
          parentContext: "nav",
        },
      ];

      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(mockElements);

      const result = await pageReader.readPage();

      expect(result.url).toBe("https://example.com/test");
      expect(result.title).toBe("Test Page");
      expect(result.elements).toHaveLength(3);
      expect(result.refVersion).toBeDefined();
      expect(result.timestamp).toBeDefined();

      // Verify refs are generated correctly using hybrid strategy
      // testId takes priority
      expect(result.elements[0]?.ref).toBe("submit-btn");
      expect(result.elements[1]?.ref).toBe("email-input");
      // No testId, so should use role:name
      expect(result.elements[2]?.ref).toBe("link:sign_up");
    });

    it("invalidates existing refs before reading", async () => {
      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await pageReader.readPage();

      expect(mockPageContext.invalidateRefs).toHaveBeenCalled();
    });

    it("registers refs with page context", async () => {
      const mockElements = [
        {
          tag: "button",
          role: "button",
          name: "Click Me",
          testId: "click-btn",
          selector: '[data-testid="click-btn"]',
          isInteractive: true,
          isVisible: true,
        },
      ];

      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(mockElements);

      await pageReader.readPage();

      expect(mockPageContext.registerRef).toHaveBeenCalledWith(
        "click-btn",
        '[data-testid="click-btn"]'
      );
    });

    it("respects maxElements option", async () => {
      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await pageReader.readPage({ maxElements: 50 });

      expect(mockPage.evaluate).toHaveBeenCalled();
      const evaluateCall = (mockPage.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Check that maxElements parameter was passed (third argument in the array)
      expect(evaluateCall[1]?.[2]).toBe(50);
    });

    it("respects includeHidden option", async () => {
      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await pageReader.readPage({ includeHidden: true });

      const evaluateCall = (mockPage.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Check that includeHidden parameter was passed (second argument in the array)
      expect(evaluateCall[1]?.[1]).toBe(true);
    });

    it("respects interactiveOnly option", async () => {
      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await pageReader.readPage({ interactiveOnly: true });

      const evaluateCall = (mockPage.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Check that interactiveOnly parameter was passed (fourth argument in the array)
      expect(evaluateCall[1]?.[3]).toBe(true);
    });

    it("respects selector option", async () => {
      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await pageReader.readPage({ selector: "#main-content" });

      const evaluateCall = (mockPage.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Check that selector parameter was passed (first argument in the array)
      expect(evaluateCall[1]?.[0]).toBe("#main-content");
    });

    it("handles duplicate testIds by appending counter", async () => {
      const mockElements = [
        {
          tag: "button",
          role: "button",
          name: "Save",
          testId: "action-btn",
          selector: 'form:nth-of-type(1) [data-testid="action-btn"]',
          isInteractive: true,
          isVisible: true,
        },
        {
          tag: "button",
          role: "button",
          name: "Cancel",
          testId: "action-btn", // Duplicate testId
          selector: 'form:nth-of-type(2) [data-testid="action-btn"]',
          isInteractive: true,
          isVisible: true,
        },
      ];

      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(mockElements);

      const result = await pageReader.readPage();

      expect(result.elements[0]?.ref).toBe("action-btn");
      expect(result.elements[1]?.ref).toBe("action-btn_1");
    });

    it("uses aria-label when no testId", async () => {
      const mockElements = [
        {
          tag: "button",
          role: "button",
          name: "Close",
          testId: undefined,
          ariaLabel: "Close dialog",
          selector: '[aria-label="Close dialog"]',
          isInteractive: true,
          isVisible: true,
        },
      ];

      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(mockElements);

      const result = await pageReader.readPage();

      expect(result.elements[0]?.ref).toBe("close_dialog");
    });

    it("uses role:name when no testId or aria-label", async () => {
      const mockElements = [
        {
          tag: "a",
          role: "link",
          name: "Learn More",
          testId: undefined,
          ariaLabel: undefined,
          selector: "main > a",
          isInteractive: true,
          isVisible: true,
        },
      ];

      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(mockElements);

      const result = await pageReader.readPage();

      expect(result.elements[0]?.ref).toBe("link:learn_more");
    });

    it("falls back to role when no name available", async () => {
      const mockElements = [
        {
          tag: "div",
          role: "region",
          name: "",
          testId: undefined,
          ariaLabel: undefined,
          selector: "main > div",
          isInteractive: false,
          isVisible: true,
          parentContext: "main",
        },
      ];

      (mockPage.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(mockElements);

      const result = await pageReader.readPage();

      expect(result.elements[0]?.ref).toBe("main:region");
    });
  });

  describe("getText", () => {
    it("returns text content for ref", async () => {
      const text = await pageReader.getText("test-ref");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("test-ref");
      expect(text).toBe("Element text");
    });

    it("returns empty string when no text content", async () => {
      const mockLocator = {
        textContent: vi.fn().mockResolvedValue(null),
      };
      (mockPageContext.getLocator as ReturnType<typeof vi.fn>).mockReturnValue(mockLocator);

      const text = await pageReader.getText("empty-ref");

      expect(text).toBe("");
    });
  });

  describe("getValue", () => {
    it("returns input value for ref", async () => {
      const value = await pageReader.getValue("input-ref");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("input-ref");
      expect(value).toBe("input value");
    });
  });

  describe("getAttributes", () => {
    it("returns attributes for ref", async () => {
      const attrs = await pageReader.getAttributes("attr-ref");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("attr-ref");
      expect(attrs).toEqual({ id: "test", class: "button" });
    });
  });

  describe("exists", () => {
    it("returns true when element exists", async () => {
      const exists = await pageReader.exists("existing-ref");

      expect(exists).toBe(true);
    });

    it("returns false when element does not exist", async () => {
      const mockLocator = {
        count: vi.fn().mockResolvedValue(0),
      };
      (mockPageContext.getLocator as ReturnType<typeof vi.fn>).mockReturnValue(mockLocator);

      const exists = await pageReader.exists("missing-ref");

      expect(exists).toBe(false);
    });

    it("returns false on error", async () => {
      (mockPageContext.getLocator as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Locator error");
      });

      const exists = await pageReader.exists("error-ref");

      expect(exists).toBe(false);
    });
  });

  describe("isVisible", () => {
    it("returns true when element is visible", async () => {
      const visible = await pageReader.isVisible("visible-ref");

      expect(visible).toBe(true);
    });

    it("returns false when element is not visible", async () => {
      const mockLocator = {
        isVisible: vi.fn().mockResolvedValue(false),
      };
      (mockPageContext.getLocator as ReturnType<typeof vi.fn>).mockReturnValue(mockLocator);

      const visible = await pageReader.isVisible("hidden-ref");

      expect(visible).toBe(false);
    });

    it("returns false on error", async () => {
      (mockPageContext.getLocator as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Locator error");
      });

      const visible = await pageReader.isVisible("error-ref");

      expect(visible).toBe(false);
    });
  });
});
