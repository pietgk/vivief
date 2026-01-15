/**
 * PageReader - Extracts accessibility tree and generates element refs
 *
 * Reads the page DOM and generates a structured list of elements
 * with stable refs using the hybrid strategy.
 */

import type { Page } from "playwright";
import type { PageContext } from "../session/page-context.js";
import type { ElementRef, PageContent } from "../types/index.js";
import { DEFAULT_LIMITS } from "../types/index.js";
import { type RawElementData, createElementRef, generateRef } from "./element-ref.js";

export interface ReadPageOptions {
  /** Include hidden elements (default: false) */
  includeHidden?: boolean;
  /** Maximum elements to return (default: 1000) */
  maxElements?: number;
  /** CSS selector to scope reading (default: body) */
  selector?: string;
  /** Only include interactive elements (default: false) */
  interactiveOnly?: boolean;
}

export class PageReader {
  private readonly pageContext: PageContext;
  private readonly page: Page;

  constructor(pageContext: PageContext) {
    this.pageContext = pageContext;
    this.page = pageContext.getPlaywrightPage();
  }

  /**
   * Read the page and generate element refs
   */
  async readPage(options: ReadPageOptions = {}): Promise<PageContent> {
    const {
      includeHidden = false,
      maxElements = DEFAULT_LIMITS.maxElementRefs,
      selector = "body",
      interactiveOnly = false,
    } = options;

    // Invalidate existing refs before reading
    this.pageContext.invalidateRefs();

    // Extract elements from the page using browser-side script
    const rawElements = await this.extractElements(
      selector,
      includeHidden,
      maxElements,
      interactiveOnly
    );

    // Generate refs and register them
    const usedRefs = new Set<string>();
    const elements: ElementRef[] = [];

    for (const rawData of rawElements) {
      const ref = generateRef(rawData, usedRefs);
      usedRefs.add(ref);

      const elementRef = createElementRef(rawData, ref);
      elements.push(elementRef);

      // Register the ref with the page context
      this.pageContext.registerRef(ref, rawData.selector);
    }

    return {
      url: this.page.url(),
      title: await this.page.title(),
      elements,
      refVersion: this.pageContext.getRefVersion(),
      timestamp: Date.now(),
    };
  }

  /**
   * Extract elements from the page DOM
   */
  private async extractElements(
    rootSelector: string,
    includeHidden: boolean,
    maxElements: number,
    interactiveOnly: boolean
  ): Promise<RawElementData[]> {
    // This function runs in browser context, cast to any to bypass Node.js type checking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browserFn = (([rootSel, inclHidden, maxEls, intOnly]: [
      string,
      boolean,
      number,
      boolean,
    ]) => {
      const results: Array<{
        tag: string;
        role: string;
        name: string;
        testId?: string;
        ariaLabel?: string;
        selector: string;
        isInteractive: boolean;
        isVisible: boolean;
        boundingBox?: { x: number; y: number; width: number; height: number };
        parentContext?: string;
      }> = [];

      // Helper to check visibility
      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      // Helper to get input role
      const getInputRole = (el: HTMLInputElement) => {
        const type = (el.type || "text").toLowerCase();
        const inputRoleMap: Record<string, string> = {
          button: "button",
          checkbox: "checkbox",
          email: "textbox",
          number: "spinbutton",
          password: "textbox",
          radio: "radio",
          range: "slider",
          search: "searchbox",
          submit: "button",
          tel: "textbox",
          text: "textbox",
          url: "textbox",
        };
        return inputRoleMap[type] || "textbox";
      };

      // Helper to get ARIA role
      const getRole = (el: Element) => {
        const explicitRole = el.getAttribute("role");
        if (explicitRole) return explicitRole;

        const tag = el.tagName.toLowerCase();
        const roleMap: Record<string, string | (() => string)> = {
          a: () => ((el as HTMLAnchorElement).hasAttribute("href") ? "link" : "generic"),
          article: "article",
          aside: "complementary",
          button: "button",
          dialog: "dialog",
          footer: "contentinfo",
          form: "form",
          h1: "heading",
          h2: "heading",
          h3: "heading",
          h4: "heading",
          h5: "heading",
          h6: "heading",
          header: "banner",
          img: "img",
          input: () => getInputRole(el as HTMLInputElement),
          li: "listitem",
          main: "main",
          nav: "navigation",
          ol: "list",
          option: "option",
          progress: "progressbar",
          section: "region",
          select: "combobox",
          table: "table",
          tbody: "rowgroup",
          td: "cell",
          textarea: "textbox",
          tfoot: "rowgroup",
          th: "columnheader",
          thead: "rowgroup",
          tr: "row",
          ul: "list",
        };
        const role = roleMap[tag];
        if (typeof role === "function") return role();
        return role || "generic";
      };

      // Helper to get accessible name
      const getAccessibleName = (el: Element) => {
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel;

        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          const labelEl = document.getElementById(ariaLabelledBy);
          if (labelEl) return labelEl.textContent?.trim() || "";
        }

        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") {
          const id = el.id;
          if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) return label.textContent?.trim() || "";
          }
        }

        if (tag === "img") {
          return (el as HTMLImageElement).alt || "";
        }

        if (tag === "a" || tag === "button") {
          return el.textContent?.trim() || "";
        }

        return "";
      };

      // Helper to check if element is interactive
      const checkInteractive = (el: Element, role: string) => {
        const interactiveRoles = [
          "button",
          "link",
          "textbox",
          "checkbox",
          "radio",
          "combobox",
          "listbox",
          "menuitem",
          "option",
          "slider",
          "spinbutton",
          "switch",
          "tab",
        ];
        if (interactiveRoles.includes(role)) return true;

        const tag = el.tagName.toLowerCase();
        if (["a", "button", "input", "select", "textarea"].includes(tag)) return true;
        if (el.hasAttribute("onclick") || el.getAttribute("tabindex") === "0") return true;

        return false;
      };

      // Helper to build unique selector
      const buildUniqueSelector = (el: Element) => {
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;

        const id = el.id;
        if (id) return `#${id}`;

        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;

        // Build path-based selector
        const path: string[] = [];
        let current: Element | null = el;

        while (current && current !== document.body) {
          const tag = current.tagName.toLowerCase();
          const parent: Element | null = current.parentElement;

          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (c: Element) => c.tagName === current?.tagName
            );
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              path.unshift(`${tag}:nth-of-type(${index})`);
            } else {
              path.unshift(tag);
            }
          } else {
            path.unshift(tag);
          }

          current = parent;
        }

        return path.length > 0 ? path.join(" > ") : el.tagName.toLowerCase();
      };

      // Get parent context
      const getParentContext = (el: Element) => {
        let parent = el.parentElement;

        while (parent && parent !== document.body) {
          const tag = parent.tagName.toLowerCase();
          const role = getRole(parent);

          if (tag === "form" || role === "form") return "form";
          if (tag === "nav" || role === "navigation") return "nav";
          if (tag === "dialog" || role === "dialog") return "dialog";
          if (tag === "main" || role === "main") return "main";
          if (tag === "header" || role === "banner") return "header";
          if (tag === "footer" || role === "contentinfo") return "footer";

          parent = parent.parentElement;
        }

        return undefined;
      };

      // Walk the DOM tree
      const root = document.querySelector(rootSel);
      if (!root) return results;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
          const tag = (node as Element).tagName.toLowerCase();
          if (["script", "style", "noscript", "template", "svg", "path"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let node: Node | null = walker.currentNode;
      while (node && results.length < maxEls) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        const role = getRole(el);
        const visible = isVisible(el);
        const interactive = checkInteractive(el, role);

        // Apply filters
        if (!inclHidden && !visible) {
          node = walker.nextNode();
          continue;
        }

        if (intOnly && !interactive) {
          node = walker.nextNode();
          continue;
        }

        // Skip generic non-interactive elements without meaningful content
        if (
          role === "generic" &&
          !interactive &&
          !el.hasAttribute("data-testid") &&
          !el.hasAttribute("aria-label")
        ) {
          node = walker.nextNode();
          continue;
        }

        const rect = el.getBoundingClientRect();
        const name = getAccessibleName(el);

        results.push({
          tag: tag,
          role: role,
          name: name,
          testId: el.getAttribute("data-testid") || undefined,
          ariaLabel: el.getAttribute("aria-label") || undefined,
          selector: buildUniqueSelector(el),
          isInteractive: interactive,
          isVisible: visible,
          boundingBox:
            rect.width > 0 && rect.height > 0
              ? {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                }
              : undefined,
          parentContext: getParentContext(el),
        });

        node = walker.nextNode();
      }

      return results;
      // biome-ignore lint/suspicious/noExplicitAny: Browser function runs in different context, types are validated at runtime
    }) as any;

    const elements = await this.page.evaluate(browserFn, [
      rootSelector,
      includeHidden,
      maxElements,
      interactiveOnly,
    ] as [string, boolean, number, boolean]);

    return elements as RawElementData[];
  }

  /**
   * Get text content of an element by ref
   */
  async getText(ref: string): Promise<string> {
    const locator = this.pageContext.getLocator(ref);
    return (await locator.textContent()) || "";
  }

  /**
   * Get input value of an element by ref
   */
  async getValue(ref: string): Promise<string> {
    const locator = this.pageContext.getLocator(ref);
    return await locator.inputValue();
  }

  /**
   * Get attributes of an element by ref
   */
  async getAttributes(ref: string): Promise<Record<string, string>> {
    const locator = this.pageContext.getLocator(ref);
    return await locator.evaluate((el) => {
      const attrs: Record<string, string> = {};
      const attrList = Array.from(el.attributes);
      for (const attr of attrList) {
        attrs[attr.name] = attr.value;
      }
      return attrs;
    });
  }

  /**
   * Check if an element exists
   */
  async exists(ref: string): Promise<boolean> {
    try {
      const locator = this.pageContext.getLocator(ref);
      const count = await locator.count();
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if an element is visible
   */
  async isVisible(ref: string): Promise<boolean> {
    try {
      const locator = this.pageContext.getLocator(ref);
      return await locator.isVisible();
    } catch {
      return false;
    }
  }
}
