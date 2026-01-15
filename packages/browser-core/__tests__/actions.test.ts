/**
 * Tests for Action Modules
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { click, doubleClick, rightClick } from "../src/actions/click.js";
import { clear, fill } from "../src/actions/fill.js";
import { hover } from "../src/actions/hover.js";
import {
  scroll,
  scrollElement,
  scrollIntoView,
  scrollToBottom,
  scrollToTop,
} from "../src/actions/scroll.js";
import { select, selectMultiple } from "../src/actions/select.js";
import { press, type } from "../src/actions/type.js";
import type { PageContext } from "../src/session/page-context.js";

const createMockLocator = () => ({
  click: vi.fn().mockResolvedValue(undefined),
  dblclick: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  pressSequentially: vi.fn().mockResolvedValue(undefined),
  selectOption: vi.fn().mockResolvedValue(["selected-value"]),
  hover: vi.fn().mockResolvedValue(undefined),
  scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue(undefined),
});

const createMockPage = () => ({
  keyboard: {
    press: vi.fn().mockResolvedValue(undefined),
  },
  mouse: {
    wheel: vi.fn().mockResolvedValue(undefined),
  },
  evaluate: vi.fn().mockResolvedValue(undefined),
});

const createMockPageContext = (
  mockLocator: ReturnType<typeof createMockLocator>,
  mockPage: ReturnType<typeof createMockPage>
) => {
  return {
    getLocator: vi.fn().mockReturnValue(mockLocator),
    getPlaywrightPage: vi.fn().mockReturnValue(mockPage),
  } as unknown as PageContext;
};

describe("Click Actions", () => {
  let mockLocator: ReturnType<typeof createMockLocator>;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext;

  beforeEach(() => {
    mockLocator = createMockLocator();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockLocator, mockPage);
  });

  describe("click", () => {
    it("clicks element by ref", async () => {
      const result = await click(mockPageContext, "test-btn");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("test-btn");
      expect(mockLocator.click).toHaveBeenCalledWith({
        button: "left",
        timeout: 10000,
      });
      expect(result.success).toBe(true);
      expect(result.ref).toBe("test-btn");
    });

    it("passes custom options", async () => {
      await click(mockPageContext, "test-btn", {
        button: "middle",
        timeout: 5000,
      });

      expect(mockLocator.click).toHaveBeenCalledWith({
        button: "middle",
        timeout: 5000,
      });
    });

    it("returns error on failure", async () => {
      mockLocator.click.mockRejectedValue(new Error("Element not found"));

      const result = await click(mockPageContext, "missing-btn");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Element not found");
    });
  });

  describe("doubleClick", () => {
    it("double-clicks element by ref", async () => {
      const result = await doubleClick(mockPageContext, "test-btn");

      expect(mockLocator.dblclick).toHaveBeenCalledWith({
        button: "left",
        timeout: 10000,
      });
      expect(result.success).toBe(true);
    });

    it("returns error on failure", async () => {
      mockLocator.dblclick.mockRejectedValue(new Error("Timeout"));

      const result = await doubleClick(mockPageContext, "test-btn");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Timeout");
    });
  });

  describe("rightClick", () => {
    it("right-clicks element by ref", async () => {
      const result = await rightClick(mockPageContext, "context-menu-btn");

      expect(mockLocator.click).toHaveBeenCalledWith({
        button: "right",
        timeout: 10000,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Type Actions", () => {
  let mockLocator: ReturnType<typeof createMockLocator>;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext;

  beforeEach(() => {
    mockLocator = createMockLocator();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockLocator, mockPage);
  });

  describe("type", () => {
    it("types text into element", async () => {
      const result = await type(mockPageContext, "input-field", "Hello World");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("input-field");
      expect(mockLocator.pressSequentially).toHaveBeenCalledWith("Hello World", {
        delay: 0,
        timeout: 10000,
      });
      expect(result.success).toBe(true);
      expect(result.text).toBe("Hello World");
    });

    it("clears field before typing when clear option is set", async () => {
      await type(mockPageContext, "input-field", "New text", { clear: true });

      expect(mockLocator.clear).toHaveBeenCalled();
      expect(mockLocator.pressSequentially).toHaveBeenCalledWith("New text", {
        delay: 0,
        timeout: 10000,
      });
    });

    it("uses delay between keystrokes", async () => {
      await type(mockPageContext, "input-field", "Slow typing", { delay: 100 });

      expect(mockLocator.pressSequentially).toHaveBeenCalledWith("Slow typing", {
        delay: 100,
        timeout: 10000,
      });
    });

    it("returns error on failure", async () => {
      mockLocator.pressSequentially.mockRejectedValue(new Error("Element detached"));

      const result = await type(mockPageContext, "input-field", "text");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Element detached");
    });
  });

  describe("press", () => {
    it("presses keyboard key", async () => {
      const result = await press(mockPageContext, "Enter");

      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
      expect(result.success).toBe(true);
      expect(result.key).toBe("Enter");
    });

    it("returns error on failure", async () => {
      mockPage.keyboard.press.mockRejectedValue(new Error("Invalid key"));

      const result = await press(mockPageContext, "InvalidKey");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid key");
    });
  });
});

describe("Fill Actions", () => {
  let mockLocator: ReturnType<typeof createMockLocator>;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext;

  beforeEach(() => {
    mockLocator = createMockLocator();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockLocator, mockPage);
  });

  describe("fill", () => {
    it("fills input field with value", async () => {
      const result = await fill(mockPageContext, "email-input", "test@example.com");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("email-input");
      expect(mockLocator.fill).toHaveBeenCalledWith("test@example.com", {
        force: false,
        timeout: 10000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe("test@example.com");
    });

    it("supports force option", async () => {
      await fill(mockPageContext, "readonly-input", "forced value", { force: true });

      expect(mockLocator.fill).toHaveBeenCalledWith("forced value", {
        force: true,
        timeout: 10000,
      });
    });

    it("returns error on failure", async () => {
      mockLocator.fill.mockRejectedValue(new Error("Not an input element"));

      const result = await fill(mockPageContext, "div-element", "value");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not an input element");
    });
  });

  describe("clear", () => {
    it("clears input field", async () => {
      const result = await clear(mockPageContext, "text-input");

      expect(mockLocator.clear).toHaveBeenCalledWith({ timeout: 10000 });
      expect(result.success).toBe(true);
      expect(result.ref).toBe("text-input");
    });

    it("returns error on failure", async () => {
      mockLocator.clear.mockRejectedValue(new Error("Cannot clear"));

      const result = await clear(mockPageContext, "text-input");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot clear");
    });
  });
});

describe("Select Actions", () => {
  let mockLocator: ReturnType<typeof createMockLocator>;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext;

  beforeEach(() => {
    mockLocator = createMockLocator();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockLocator, mockPage);
  });

  describe("select", () => {
    it("selects option by value (default)", async () => {
      const result = await select(mockPageContext, "country-select", "us");

      expect(mockLocator.selectOption).toHaveBeenCalledWith({ value: "us" }, { timeout: 10000 });
      expect(result.success).toBe(true);
      expect(result.selectedValues).toEqual(["selected-value"]);
    });

    it("selects option by label", async () => {
      await select(mockPageContext, "country-select", "United States", { by: "label" });

      expect(mockLocator.selectOption).toHaveBeenCalledWith(
        { label: "United States" },
        { timeout: 10000 }
      );
    });

    it("selects option by index", async () => {
      await select(mockPageContext, "country-select", "2", { by: "index" });

      expect(mockLocator.selectOption).toHaveBeenCalledWith({ index: 2 }, { timeout: 10000 });
    });

    it("returns error for invalid index", async () => {
      const result = await select(mockPageContext, "select", "not-a-number", {
        by: "index",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid index");
    });

    it("returns error on failure", async () => {
      mockLocator.selectOption.mockRejectedValue(new Error("No such option"));

      const result = await select(mockPageContext, "select", "invalid");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No such option");
    });
  });

  describe("selectMultiple", () => {
    it("selects multiple options by value", async () => {
      mockLocator.selectOption.mockResolvedValue(["val1", "val2"]);

      const result = await selectMultiple(mockPageContext, "multi-select", ["val1", "val2"]);

      expect(mockLocator.selectOption).toHaveBeenCalledWith(
        [{ value: "val1" }, { value: "val2" }],
        { timeout: 10000 }
      );
      expect(result.success).toBe(true);
      expect(result.selectedValues).toEqual(["val1", "val2"]);
    });

    it("selects multiple options by label", async () => {
      await selectMultiple(mockPageContext, "multi-select", ["Option A", "Option B"], {
        by: "label",
      });

      expect(mockLocator.selectOption).toHaveBeenCalledWith(
        [{ label: "Option A" }, { label: "Option B" }],
        { timeout: 10000 }
      );
    });

    it("returns error for invalid index in array", async () => {
      const result = await selectMultiple(mockPageContext, "multi-select", ["1", "invalid"], {
        by: "index",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid index");
    });
  });
});

describe("Scroll Actions", () => {
  let mockLocator: ReturnType<typeof createMockLocator>;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext;

  beforeEach(() => {
    mockLocator = createMockLocator();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockLocator, mockPage);
  });

  describe("scroll", () => {
    it("scrolls page down", async () => {
      const result = await scroll(mockPageContext, { direction: "down" });

      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 500);
      expect(result.success).toBe(true);
      expect(result.direction).toBe("down");
      expect(result.amount).toBe(500);
    });

    it("scrolls page up", async () => {
      await scroll(mockPageContext, { direction: "up" });

      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, -500);
    });

    it("scrolls page left", async () => {
      await scroll(mockPageContext, { direction: "left" });

      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(-500, 0);
    });

    it("scrolls page right", async () => {
      await scroll(mockPageContext, { direction: "right" });

      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(500, 0);
    });

    it("uses custom scroll amount", async () => {
      await scroll(mockPageContext, { direction: "down", amount: 1000 });

      expect(mockPage.mouse.wheel).toHaveBeenCalledWith(0, 1000);
    });

    it("returns error on failure", async () => {
      mockPage.mouse.wheel.mockRejectedValue(new Error("Scroll failed"));

      const result = await scroll(mockPageContext, { direction: "down" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scroll failed");
    });
  });

  describe("scrollElement", () => {
    it("scrolls element by ref", async () => {
      const result = await scrollElement(mockPageContext, "scrollable-div", {
        direction: "down",
      });

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("scrollable-div");
      expect(mockLocator.evaluate).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("returns error on failure", async () => {
      mockLocator.evaluate.mockRejectedValue(new Error("Element not scrollable"));

      const result = await scrollElement(mockPageContext, "div", { direction: "down" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Element not scrollable");
    });
  });

  describe("scrollIntoView", () => {
    it("scrolls element into view", async () => {
      const result = await scrollIntoView(mockPageContext, "offscreen-element");

      expect(mockLocator.scrollIntoViewIfNeeded).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.ref).toBe("offscreen-element");
    });

    it("returns error on failure", async () => {
      mockLocator.scrollIntoViewIfNeeded.mockRejectedValue(new Error("Element detached"));

      const result = await scrollIntoView(mockPageContext, "missing-element");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Element detached");
    });
  });

  describe("scrollToTop", () => {
    it("scrolls page to top", async () => {
      const result = await scrollToTop(mockPageContext);

      expect(mockPage.evaluate).toHaveBeenCalledWith(
        "window.scrollTo({ top: 0, behavior: 'auto' })"
      );
      expect(result.success).toBe(true);
    });

    it("returns error on failure", async () => {
      mockPage.evaluate.mockRejectedValue(new Error("Evaluate failed"));

      const result = await scrollToTop(mockPageContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Evaluate failed");
    });
  });

  describe("scrollToBottom", () => {
    it("scrolls page to bottom", async () => {
      const result = await scrollToBottom(mockPageContext);

      expect(mockPage.evaluate).toHaveBeenCalledWith(
        "window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' })"
      );
      expect(result.success).toBe(true);
    });

    it("returns error on failure", async () => {
      mockPage.evaluate.mockRejectedValue(new Error("Page closed"));

      const result = await scrollToBottom(mockPageContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Page closed");
    });
  });
});

describe("Hover Action", () => {
  let mockLocator: ReturnType<typeof createMockLocator>;
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext;

  beforeEach(() => {
    mockLocator = createMockLocator();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockLocator, mockPage);
  });

  describe("hover", () => {
    it("hovers over element by ref", async () => {
      const result = await hover(mockPageContext, "tooltip-trigger");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("tooltip-trigger");
      expect(mockLocator.hover).toHaveBeenCalledWith({ timeout: 10000 });
      expect(result.success).toBe(true);
      expect(result.ref).toBe("tooltip-trigger");
    });

    it("uses custom timeout", async () => {
      await hover(mockPageContext, "element", { timeout: 5000 });

      expect(mockLocator.hover).toHaveBeenCalledWith({ timeout: 5000 });
    });

    it("returns error on failure", async () => {
      mockLocator.hover.mockRejectedValue(new Error("Element not visible"));

      const result = await hover(mockPageContext, "hidden-element");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Element not visible");
    });
  });
});
