import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementFinder } from "../src/finder/element-finder.js";
import type { PageContext } from "../src/session/page-context.js";
import { ElementNotFoundError } from "../src/types/index.js";

const createMockLocator = (count = 1) => {
  const mockLocator = {
    count: vi.fn().mockResolvedValue(count),
    nth: vi.fn().mockReturnThis(),
    first: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    waitFor: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({
      tag: "button",
      role: "button",
      name: "Click Me",
      testId: "click-btn",
      ariaLabel: undefined,
      selector: '[data-testid="click-btn"]',
      isInteractive: true,
      isVisible: true,
      boundingBox: { x: 100, y: 200, width: 120, height: 40 },
    }),
  };
  return mockLocator;
};

const createMockPage = () => {
  const mockLocator = createMockLocator();

  const mockPage = {
    locator: vi.fn().mockReturnValue(mockLocator),
    getByText: vi.fn().mockReturnValue(mockLocator),
    getByRole: vi.fn().mockReturnValue(mockLocator),
    getByLabel: vi.fn().mockReturnValue(mockLocator),
    getByPlaceholder: vi.fn().mockReturnValue(mockLocator),
    getByTestId: vi.fn().mockReturnValue(mockLocator),
  };

  return { mockPage, mockLocator };
};

const createMockPageContext = (
  mockPage: ReturnType<typeof createMockPage>["mockPage"],
  mockLocator: ReturnType<typeof createMockPage>["mockLocator"]
) => {
  const refMap = new Map<string, string>();
  refMap.set("test-ref", '[data-testid="test-ref"]');

  return {
    getPlaywrightPage: vi.fn().mockReturnValue(mockPage),
    hasRef: vi.fn().mockImplementation((ref: string) => refMap.has(ref)),
    getLocator: vi.fn().mockReturnValue(mockLocator),
  } as unknown as PageContext;
};

describe("ElementFinder", () => {
  let mockPage: ReturnType<typeof createMockPage>["mockPage"];
  let mockLocator: ReturnType<typeof createMockPage>["mockLocator"];
  let mockPageContext: PageContext;
  let finder: ElementFinder;

  beforeEach(() => {
    const pageMocks = createMockPage();
    mockPage = pageMocks.mockPage;
    mockLocator = pageMocks.mockLocator;
    mockPageContext = createMockPageContext(mockPage, mockLocator);
    finder = new ElementFinder(mockPageContext);
  });

  describe("find", () => {
    it("finds elements by selector strategy", async () => {
      const result = await finder.find({ strategy: "selector", value: ".my-button" });

      expect(mockPage.locator).toHaveBeenCalledWith(".my-button");
      expect(result.count).toBe(1);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]?.ref).toBe("click-btn");
    });

    it("finds elements by text strategy", async () => {
      const result = await finder.find({ strategy: "text", value: "Click Me" });

      expect(mockPage.getByText).toHaveBeenCalledWith("Click Me", { exact: false });
      expect(result.count).toBe(1);
    });

    it("finds elements by role strategy", async () => {
      const result = await finder.find({ strategy: "role", value: "button", name: "Submit" });

      expect(mockPage.getByRole).toHaveBeenCalledWith("button", {
        name: "Submit",
        exact: false,
      });
      expect(result.count).toBe(1);
    });

    it("finds elements by label strategy", async () => {
      const result = await finder.find({ strategy: "label", value: "Email" });

      expect(mockPage.getByLabel).toHaveBeenCalledWith("Email", { exact: false });
      expect(result.count).toBe(1);
    });

    it("finds elements by ref strategy", async () => {
      const result = await finder.find({ strategy: "ref", value: "test-ref" });

      expect(mockPageContext.hasRef).toHaveBeenCalledWith("test-ref");
      expect(mockPageContext.getLocator).toHaveBeenCalledWith("test-ref");
      expect(result.count).toBe(1);
    });

    it("applies visibility filter by default", async () => {
      await finder.find({ strategy: "selector", value: ".button" });

      expect(mockLocator.filter).toHaveBeenCalledWith({ visible: true });
    });

    it("skips visibility filter when visible is false", async () => {
      await finder.find({ strategy: "selector", value: ".button", visible: false });

      expect(mockLocator.filter).not.toHaveBeenCalled();
    });

    it("waits for element when timeout specified", async () => {
      await finder.find({ strategy: "selector", value: ".loading", timeout: 5000 });

      expect(mockLocator.first).toHaveBeenCalled();
      expect(mockLocator.waitFor).toHaveBeenCalledWith({ timeout: 5000, state: "attached" });
    });

    it("returns empty result when wait times out", async () => {
      mockLocator.waitFor.mockRejectedValue(new Error("Timeout"));

      const result = await finder.find({
        strategy: "selector",
        value: ".never-appears",
        timeout: 1000,
      });

      expect(result.elements).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("throws for unknown strategy", async () => {
      await expect(
        finder.find({ strategy: "unknown" as "selector", value: "test" })
      ).rejects.toThrow("Unknown find strategy: unknown");
    });
  });

  describe("byRef", () => {
    it("returns element when ref exists", async () => {
      const result = await finder.byRef("test-ref");

      expect(result.count).toBe(1);
      expect(result.elements).toHaveLength(1);
    });

    it("returns empty result when ref does not exist", async () => {
      (mockPageContext.hasRef as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await finder.byRef("missing-ref");

      expect(result.count).toBe(0);
      expect(result.elements).toEqual([]);
    });

    it("returns empty result when element count is 0", async () => {
      mockLocator.count.mockResolvedValue(0);

      const result = await finder.byRef("test-ref");

      expect(result.count).toBe(0);
      expect(result.elements).toEqual([]);
    });
  });

  describe("bySelector", () => {
    it("finds elements by CSS selector", async () => {
      const result = await finder.bySelector("button.primary");

      expect(mockPage.locator).toHaveBeenCalledWith("button.primary");
      expect(result.count).toBe(1);
    });

    it("respects maxResults option", async () => {
      mockLocator.count.mockResolvedValue(10);

      await finder.bySelector(".many-elements", { maxResults: 3 });

      expect(mockLocator.nth).toHaveBeenCalledTimes(3);
    });
  });

  describe("byText", () => {
    it("finds elements by text content", async () => {
      const result = await finder.byText("Submit");

      expect(mockPage.getByText).toHaveBeenCalledWith("Submit", { exact: false });
      expect(result.count).toBe(1);
    });

    it("uses exact match when specified", async () => {
      await finder.byText("Submit", { exact: true });

      expect(mockPage.getByText).toHaveBeenCalledWith("Submit", { exact: true });
    });
  });

  describe("byRole", () => {
    it("finds elements by ARIA role", async () => {
      const result = await finder.byRole("button");

      expect(mockPage.getByRole).toHaveBeenCalledWith("button", {
        name: undefined,
        exact: false,
      });
      expect(result.count).toBe(1);
    });

    it("filters by accessible name", async () => {
      await finder.byRole("button", { name: "Submit" });

      expect(mockPage.getByRole).toHaveBeenCalledWith("button", {
        name: "Submit",
        exact: false,
      });
    });
  });

  describe("byLabel", () => {
    it("finds form elements by label text", async () => {
      const result = await finder.byLabel("Email Address");

      expect(mockPage.getByLabel).toHaveBeenCalledWith("Email Address", { exact: false });
      expect(result.count).toBe(1);
    });
  });

  describe("byPlaceholder", () => {
    it("finds elements by placeholder text", async () => {
      const result = await finder.byPlaceholder("Enter email");

      expect(mockPage.getByPlaceholder).toHaveBeenCalledWith("Enter email", { exact: false });
      expect(result.count).toBe(1);
    });
  });

  describe("byTestId", () => {
    it("finds elements by data-testid", async () => {
      const result = await finder.byTestId("submit-btn");

      expect(mockPage.getByTestId).toHaveBeenCalledWith("submit-btn");
      expect(result.count).toBe(1);
    });
  });

  describe("findFirst", () => {
    it("returns first matching element", async () => {
      const element = await finder.findFirst({ strategy: "selector", value: ".button" });

      expect(element.ref).toBe("click-btn");
    });

    it("throws ElementNotFoundError when no matches", async () => {
      mockLocator.count.mockResolvedValue(0);

      await expect(
        finder.findFirst({ strategy: "selector", value: ".nonexistent" })
      ).rejects.toThrow(ElementNotFoundError);
    });

    it("throws with helpful error message", async () => {
      mockLocator.count.mockResolvedValue(0);

      await expect(finder.findFirst({ strategy: "text", value: "Missing Text" })).rejects.toThrow(
        "Element with ref 'text:Missing Text' not found"
      );
    });
  });

  describe("element data extraction", () => {
    it("extracts element data correctly", async () => {
      const result = await finder.find({ strategy: "selector", value: "button" });

      expect(result.elements[0]).toMatchObject({
        tag: "button",
        role: "button",
        name: "Click Me",
        testId: "click-btn",
        isInteractive: true,
        isVisible: true,
      });
    });

    it("handles extraction failures gracefully", async () => {
      mockLocator.evaluate.mockRejectedValue(new Error("Element detached"));
      mockLocator.count.mockResolvedValue(1);

      const result = await finder.find({ strategy: "selector", value: ".detached" });

      expect(result.elements).toEqual([]);
    });
  });
});
