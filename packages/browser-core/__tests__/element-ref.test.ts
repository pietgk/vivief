import { describe, expect, it } from "vitest";
import {
  type RawElementData,
  buildSelector,
  createElementRef,
  generateRef,
  getParentContext,
  isInteractiveElement,
} from "../src/reader/element-ref.js";

describe("element-ref", () => {
  describe("generateRef", () => {
    it("prioritizes testId when present", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Submit",
        testId: "submit-btn",
        ariaLabel: "Submit form",
        selector: '[data-testid="submit-btn"]',
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("submit-btn");
    });

    it("uses aria-label when no testId", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Close",
        testId: undefined,
        ariaLabel: "Close Dialog",
        selector: '[aria-label="Close Dialog"]',
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("close_dialog");
    });

    it("uses role:name when no testId or aria-label", () => {
      const data: RawElementData = {
        tag: "a",
        role: "link",
        name: "Learn More",
        testId: undefined,
        ariaLabel: undefined,
        selector: "a",
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("link:learn_more");
    });

    it("uses role-only with parent context when no name", () => {
      const data: RawElementData = {
        tag: "div",
        role: "region",
        name: "",
        testId: undefined,
        ariaLabel: undefined,
        selector: "div",
        isInteractive: false,
        isVisible: true,
        parentContext: "main",
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("main:region");
    });

    it("falls back to tag with parent context when no role", () => {
      const data: RawElementData = {
        tag: "span",
        role: "",
        name: "",
        testId: undefined,
        ariaLabel: undefined,
        selector: "span",
        isInteractive: false,
        isVisible: true,
        parentContext: "header",
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("header:span");
    });

    it("makes refs unique by appending counter", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Submit",
        testId: "submit-btn",
        selector: '[data-testid="submit-btn"]',
        isInteractive: true,
        isVisible: true,
      };

      const usedRefs = new Set(["submit-btn"]);
      const ref = generateRef(data, usedRefs);

      expect(ref).toBe("submit-btn_1");
    });

    it("increments counter for multiple duplicates", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Action",
        testId: "action-btn",
        selector: '[data-testid="action-btn"]',
        isInteractive: true,
        isVisible: true,
      };

      const usedRefs = new Set(["action-btn", "action-btn_1", "action-btn_2"]);
      const ref = generateRef(data, usedRefs);

      expect(ref).toBe("action-btn_3");
    });

    it("sanitizes special characters in refs", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Submit Form!",
        testId: "Submit @Form #123",
        selector: "button",
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("submit_form_123");
    });

    it("collapses multiple underscores", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Test",
        testId: "test___multiple___underscores",
        selector: "button",
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("test_multiple_underscores");
    });

    it("removes leading and trailing underscores", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Test",
        testId: "_leading_trailing_",
        selector: "button",
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      expect(ref).toBe("leading_trailing");
    });

    it("ignores aria-label if too long (> 50 chars)", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Submit",
        testId: undefined,
        ariaLabel:
          "This is a very long aria label that exceeds the maximum length limit of fifty characters",
        selector: "button",
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      // Should skip aria-label and use role:name
      expect(ref).toBe("button:submit");
    });

    it("ignores name if too long (> 30 chars) in role:name", () => {
      const data: RawElementData = {
        tag: "a",
        role: "link",
        name: "This is a name that is way too long for the ref",
        testId: undefined,
        ariaLabel: undefined,
        selector: "a",
        isInteractive: true,
        isVisible: true,
      };

      const ref = generateRef(data, new Set());

      // Should skip role:name and use fallback
      expect(ref).toBe("link");
    });
  });

  describe("createElementRef", () => {
    it("creates ElementRef from raw data", () => {
      const data: RawElementData = {
        tag: "button",
        role: "button",
        name: "Submit",
        testId: "submit-btn",
        ariaLabel: "Submit form",
        selector: '[data-testid="submit-btn"]',
        isInteractive: true,
        isVisible: true,
        boundingBox: { x: 100, y: 200, width: 120, height: 40 },
      };

      const elementRef = createElementRef(data, "submit-btn");

      expect(elementRef).toEqual({
        ref: "submit-btn",
        testId: "submit-btn",
        ariaLabel: "Submit form",
        role: "button",
        name: "Submit",
        tag: "button",
        selector: '[data-testid="submit-btn"]',
        isInteractive: true,
        isVisible: true,
        boundingBox: { x: 100, y: 200, width: 120, height: 40 },
      });
    });

    it("defaults role to generic when not provided", () => {
      const data: RawElementData = {
        tag: "div",
        role: "",
        name: "",
        selector: "div",
        isInteractive: false,
        isVisible: true,
      };

      const elementRef = createElementRef(data, "div_1");

      expect(elementRef.role).toBe("generic");
    });

    it("defaults name to empty string when not provided", () => {
      const data: RawElementData = {
        tag: "div",
        role: "region",
        name: "",
        selector: "div",
        isInteractive: false,
        isVisible: true,
      };

      const elementRef = createElementRef(data, "region_1");

      expect(elementRef.name).toBe("");
    });
  });

  describe("isInteractiveElement", () => {
    it("returns true for interactive tags", () => {
      const interactiveTags = ["a", "button", "input", "select", "textarea", "details", "summary"];

      for (const tag of interactiveTags) {
        expect(isInteractiveElement(tag, "generic", {})).toBe(true);
      }
    });

    it("returns true for interactive roles", () => {
      const interactiveRoles = [
        "button",
        "link",
        "textbox",
        "checkbox",
        "radio",
        "combobox",
        "listbox",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "option",
        "slider",
        "spinbutton",
        "switch",
        "tab",
        "treeitem",
      ];

      for (const role of interactiveRoles) {
        expect(isInteractiveElement("div", role, {})).toBe(true);
      }
    });

    it("returns true when onclick attribute present", () => {
      expect(isInteractiveElement("div", "generic", { onclick: "handleClick()" })).toBe(true);
    });

    it("returns true when tabindex is 0", () => {
      expect(isInteractiveElement("div", "generic", { tabindex: "0" })).toBe(true);
    });

    it("returns true when contenteditable is true", () => {
      expect(isInteractiveElement("div", "generic", { contenteditable: "true" })).toBe(true);
    });

    it("returns false for non-interactive elements", () => {
      expect(isInteractiveElement("div", "generic", {})).toBe(false);
      expect(isInteractiveElement("span", "presentation", {})).toBe(false);
      expect(isInteractiveElement("p", "paragraph", {})).toBe(false);
    });

    it("handles case insensitivity", () => {
      expect(isInteractiveElement("BUTTON", "BUTTON", {})).toBe(true);
      expect(isInteractiveElement("A", "LINK", {})).toBe(true);
    });
  });

  describe("buildSelector", () => {
    it("prefers data-testid", () => {
      const selector = buildSelector("button", "submit-btn", "Submit form", { id: "btn1" });

      expect(selector).toBe('[data-testid="submit-btn"]');
    });

    it("uses aria-label when no testId", () => {
      const selector = buildSelector("button", undefined, "Close dialog", { id: "btn1" });

      expect(selector).toBe('[aria-label="Close dialog"]');
    });

    it("uses id when no testId or aria-label", () => {
      const selector = buildSelector("button", undefined, undefined, { id: "my-button" });

      expect(selector).toBe("#my-button");
    });

    it("builds selector from name and type attributes", () => {
      const selector = buildSelector("input", undefined, undefined, {
        name: "email",
        type: "email",
      });

      expect(selector).toBe('input[name="email"][type="email"]');
    });

    it("includes placeholder in selector", () => {
      const selector = buildSelector("input", undefined, undefined, {
        placeholder: "Enter email",
      });

      expect(selector).toBe('input[placeholder="Enter email"]');
    });

    it("returns tag-only selector when no attributes", () => {
      const selector = buildSelector("div", undefined, undefined, {});

      expect(selector).toBe("div");
    });
  });

  describe("getParentContext", () => {
    it("returns form context for form parents", () => {
      expect(getParentContext("input", "textbox", "form", undefined, 1)).toBe("form_1");
      expect(getParentContext("input", "textbox", "div", "form", 2)).toBe("form_2");
    });

    it("returns nav context for navigation parents", () => {
      expect(getParentContext("a", "link", "nav", undefined, 1)).toBe("nav_1");
      expect(getParentContext("a", "link", "div", "navigation", 1)).toBe("nav_1");
    });

    it("returns dialog context for dialog parents", () => {
      expect(getParentContext("button", "button", "dialog", undefined, 1)).toBe("dialog_1");
      expect(getParentContext("button", "button", "div", "dialog", 2)).toBe("dialog_2");
    });

    it("returns main context for main parents", () => {
      expect(getParentContext("button", "button", "main", undefined)).toBe("main");
      expect(getParentContext("button", "button", "div", "main")).toBe("main");
    });

    it("returns header context for header/banner parents", () => {
      expect(getParentContext("a", "link", "header", undefined)).toBe("header");
      expect(getParentContext("a", "link", "div", "banner")).toBe("header");
    });

    it("returns footer context for footer/contentinfo parents", () => {
      expect(getParentContext("a", "link", "footer", undefined)).toBe("footer");
      expect(getParentContext("a", "link", "div", "contentinfo")).toBe("footer");
    });

    it("returns undefined for generic parents", () => {
      expect(getParentContext("button", "button", "div", "generic")).toBeUndefined();
      expect(getParentContext("button", "button", "section", undefined)).toBeUndefined();
    });

    it("defaults parentIndex to 1", () => {
      expect(getParentContext("input", "textbox", "form", undefined)).toBe("form_1");
    });
  });
});
