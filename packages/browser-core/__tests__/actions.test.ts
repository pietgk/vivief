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
  clear: vi.fn().mockResolvedValue(undefined),
  pressSequentially: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  selectOption: vi.fn().mockResolvedValue(["option1"]),
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

const createMockPageContext = () => {
  const mockLocator = createMockLocator();
  const mockPage = createMockPage();

  return {
    getLocator: vi.fn().mockReturnValue(mockLocator),
    getPlaywrightPage: vi.fn().mockReturnValue(mockPage),
    mockLocator,
    mockPage,
  } as unknown as PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };
};

describe("click actions", () => {
  let pageContext: PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };

  beforeEach(() => {
    pageContext = createMockPageContext();
  });

  describe("click", () => {
    it("clicks element by ref", async () => {
      const result = await click(pageContext, "submit-btn");

      expect(result.success).toBe(true);
      expect(result.ref).toBe("submit-btn");
      expect(pageContext.getLocator).toHaveBeenCalledWith("submit-btn");
      expect(pageContext.mockLocator.click).toHaveBeenCalled();
    });

    it("uses specified button", async () => {
      await click(pageContext, "test-ref", { button: "right" });

      expect(pageContext.mockLocator.click).toHaveBeenCalledWith(
        expect.objectContaining({ button: "right" })
      );
    });

    it("returns error on failure", async () => {
      pageContext.mockLocator.click.mockRejectedValue(new Error("Element not found"));

      const result = await click(pageContext, "missing-ref");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Element not found");
    });
  });

  describe("doubleClick", () => {
    it("double-clicks element by ref", async () => {
      const result = await doubleClick(pageContext, "test-ref");

      expect(result.success).toBe(true);
      expect(pageContext.mockLocator.dblclick).toHaveBeenCalled();
    });
  });

  describe("rightClick", () => {
    it("right-clicks element by ref", async () => {
      const result = await rightClick(pageContext, "context-menu-trigger");

      expect(result.success).toBe(true);
      expect(pageContext.mockLocator.click).toHaveBeenCalledWith(
        expect.objectContaining({ button: "right" })
      );
    });
  });
});

describe("type actions", () => {
  let pageContext: PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };

  beforeEach(() => {
    pageContext = createMockPageContext();
  });

  describe("type", () => {
    it("types text into element", async () => {
      const result = await type(pageContext, "input-ref", "Hello World");

      expect(result.success).toBe(true);
      expect(result.text).toBe("Hello World");
      expect(pageContext.mockLocator.pressSequentially).toHaveBeenCalledWith(
        "Hello World",
        expect.any(Object)
      );
    });

    it("clears before typing when requested", async () => {
      await type(pageContext, "input-ref", "New text", { clear: true });

      expect(pageContext.mockLocator.clear).toHaveBeenCalled();
      expect(pageContext.mockLocator.pressSequentially).toHaveBeenCalled();
    });

    it("uses delay option", async () => {
      await type(pageContext, "input-ref", "slow", { delay: 50 });

      expect(pageContext.mockLocator.pressSequentially).toHaveBeenCalledWith(
        "slow",
        expect.objectContaining({ delay: 50 })
      );
    });
  });

  describe("press", () => {
    it("presses a keyboard key", async () => {
      const result = await press(pageContext, "Enter");

      expect(result.success).toBe(true);
      expect(result.key).toBe("Enter");
      expect(pageContext.mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
    });
  });
});

describe("fill actions", () => {
  let pageContext: PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };

  beforeEach(() => {
    pageContext = createMockPageContext();
  });

  describe("fill", () => {
    it("fills input field", async () => {
      const result = await fill(pageContext, "email-input", "test@example.com");

      expect(result.success).toBe(true);
      expect(result.value).toBe("test@example.com");
      expect(pageContext.mockLocator.fill).toHaveBeenCalledWith(
        "test@example.com",
        expect.any(Object)
      );
    });

    it("uses force option", async () => {
      await fill(pageContext, "input-ref", "value", { force: true });

      expect(pageContext.mockLocator.fill).toHaveBeenCalledWith(
        "value",
        expect.objectContaining({ force: true })
      );
    });
  });

  describe("clear", () => {
    it("clears input field", async () => {
      const result = await clear(pageContext, "input-ref");

      expect(result.success).toBe(true);
      expect(pageContext.mockLocator.clear).toHaveBeenCalled();
    });
  });
});

describe("select actions", () => {
  let pageContext: PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };

  beforeEach(() => {
    pageContext = createMockPageContext();
  });

  describe("select", () => {
    it("selects by value (default)", async () => {
      const result = await select(pageContext, "dropdown-ref", "option1");

      expect(result.success).toBe(true);
      expect(result.selectedValues).toEqual(["option1"]);
      expect(pageContext.mockLocator.selectOption).toHaveBeenCalledWith(
        { value: "option1" },
        expect.any(Object)
      );
    });

    it("selects by label", async () => {
      await select(pageContext, "dropdown-ref", "Option Label", { by: "label" });

      expect(pageContext.mockLocator.selectOption).toHaveBeenCalledWith(
        { label: "Option Label" },
        expect.any(Object)
      );
    });

    it("selects by index", async () => {
      await select(pageContext, "dropdown-ref", "2", { by: "index" });

      expect(pageContext.mockLocator.selectOption).toHaveBeenCalledWith(
        { index: 2 },
        expect.any(Object)
      );
    });

    it("returns error for invalid index", async () => {
      const result = await select(pageContext, "dropdown-ref", "not-a-number", { by: "index" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid index");
    });
  });

  describe("selectMultiple", () => {
    it("selects multiple options", async () => {
      const result = await selectMultiple(pageContext, "multi-select", ["opt1", "opt2"]);

      expect(result.success).toBe(true);
      expect(pageContext.mockLocator.selectOption).toHaveBeenCalled();
    });
  });
});

describe("scroll actions", () => {
  let pageContext: PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };

  beforeEach(() => {
    pageContext = createMockPageContext();
  });

  describe("scroll", () => {
    it("scrolls down", async () => {
      const result = await scroll(pageContext, { direction: "down", amount: 300 });

      expect(result.success).toBe(true);
      expect(result.direction).toBe("down");
      expect(result.amount).toBe(300);
      expect(pageContext.mockPage.mouse.wheel).toHaveBeenCalledWith(0, 300);
    });

    it("scrolls up", async () => {
      await scroll(pageContext, { direction: "up", amount: 200 });

      expect(pageContext.mockPage.mouse.wheel).toHaveBeenCalledWith(0, -200);
    });

    it("scrolls left", async () => {
      await scroll(pageContext, { direction: "left", amount: 100 });

      expect(pageContext.mockPage.mouse.wheel).toHaveBeenCalledWith(-100, 0);
    });

    it("scrolls right", async () => {
      await scroll(pageContext, { direction: "right" });

      expect(pageContext.mockPage.mouse.wheel).toHaveBeenCalledWith(500, 0);
    });

    it("uses default amount of 500", async () => {
      const result = await scroll(pageContext, { direction: "down" });

      expect(result.amount).toBe(500);
    });
  });

  describe("scrollElement", () => {
    it("scrolls element by ref", async () => {
      const result = await scrollElement(pageContext, "scrollable-container", {
        direction: "down",
      });

      expect(result.success).toBe(true);
      expect(pageContext.getLocator).toHaveBeenCalledWith("scrollable-container");
      expect(pageContext.mockLocator.evaluate).toHaveBeenCalled();
    });
  });

  describe("scrollIntoView", () => {
    it("scrolls element into view", async () => {
      const result = await scrollIntoView(pageContext, "off-screen-element");

      expect(result.success).toBe(true);
      expect(pageContext.mockLocator.scrollIntoViewIfNeeded).toHaveBeenCalled();
    });
  });

  describe("scrollToTop", () => {
    it("scrolls to top of page", async () => {
      const result = await scrollToTop(pageContext);

      expect(result.success).toBe(true);
      expect(pageContext.mockPage.evaluate).toHaveBeenCalled();
    });
  });

  describe("scrollToBottom", () => {
    it("scrolls to bottom of page", async () => {
      const result = await scrollToBottom(pageContext);

      expect(result.success).toBe(true);
      expect(pageContext.mockPage.evaluate).toHaveBeenCalled();
    });
  });
});

describe("hover action", () => {
  let pageContext: PageContext & {
    mockLocator: ReturnType<typeof createMockLocator>;
    mockPage: ReturnType<typeof createMockPage>;
  };

  beforeEach(() => {
    pageContext = createMockPageContext();
  });

  it("hovers over element", async () => {
    const result = await hover(pageContext, "tooltip-trigger");

    expect(result.success).toBe(true);
    expect(result.ref).toBe("tooltip-trigger");
    expect(pageContext.mockLocator.hover).toHaveBeenCalled();
  });

  it("returns error on failure", async () => {
    pageContext.mockLocator.hover.mockRejectedValue(new Error("Hover failed"));

    const result = await hover(pageContext, "missing-ref");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Hover failed");
  });
});
