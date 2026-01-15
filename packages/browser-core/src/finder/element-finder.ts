/**
 * ElementFinder - Find elements using various strategies
 *
 * Provides multiple ways to locate elements on a page:
 * - byRef: Find by element ref (registered refs)
 * - bySelector: Find by CSS selector
 * - byText: Find by text content
 * - byRole: Find by ARIA role and accessible name
 * - byLabel: Find by label text
 */

import type { Locator, Page } from "playwright";
import { type RawElementData, createElementRef, generateRef } from "../reader/element-ref.js";
import type { PageContext } from "../session/page-context.js";
import type { ElementRef, FindOptions, FindResult } from "../types/index.js";
import { DEFAULT_LIMITS, ElementNotFoundError } from "../types/index.js";

// Browser-side script for extracting element data
const EXTRACT_ELEMENT_DATA_SCRIPT = `
  (function() {
    const el = arguments[0];
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const testId = el.getAttribute('data-testid') || '';

    // Get accessible name
    let name = ariaLabel;
    if (!name) {
      const labelledById = el.getAttribute('aria-labelledby');
      if (labelledById) {
        const labelEl = document.getElementById(labelledById);
        if (labelEl) name = (labelEl.textContent || '').trim();
      }
    }
    if (!name && (tag === 'button' || tag === 'a')) {
      name = (el.textContent || '').trim();
    }
    if (!name && el.placeholder) {
      name = el.placeholder;
    }

    const rect = el.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;

    // Build selector
    let selector = '';
    if (testId) {
      selector = '[data-testid="' + testId + '"]';
    } else if (el.id) {
      selector = '#' + el.id;
    } else if (ariaLabel) {
      selector = '[aria-label="' + ariaLabel.replace(/"/g, '\\\\"') + '"]';
    } else {
      // Build path-based selector
      const path = [];
      let current = el;
      while (current && current !== document.body) {
        const t = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            path.unshift(t + ':nth-of-type(' + index + ')');
          } else {
            path.unshift(t);
          }
        } else {
          path.unshift(t);
        }
        current = parent;
      }
      selector = path.join(' > ');
    }

    return {
      tag: tag,
      role: role,
      name: name || '',
      testId: testId || undefined,
      ariaLabel: ariaLabel || undefined,
      selector: selector,
      isInteractive: ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ||
        ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox'].includes(role),
      isVisible: isVisible,
      boundingBox: isVisible ? {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      } : undefined
    };
  })()
`;

interface BrowserElementData {
  tag: string;
  role: string;
  name: string;
  testId?: string;
  ariaLabel?: string;
  selector: string;
  isInteractive: boolean;
  isVisible: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export class ElementFinder {
  private readonly pageContext: PageContext;
  private readonly page: Page;

  constructor(pageContext: PageContext) {
    this.pageContext = pageContext;
    this.page = pageContext.getPlaywrightPage();
  }

  /**
   * Find elements using a specified strategy
   */
  async find(options: FindOptions): Promise<FindResult> {
    const { strategy, value, name, visible = true, timeout } = options;

    let locator: Locator;

    switch (strategy) {
      case "ref":
        return this.byRef(value);

      case "selector":
        locator = this.page.locator(value);
        break;

      case "text":
        locator = this.page.getByText(value, { exact: false });
        break;

      case "role":
        locator = this.page.getByRole(value as Parameters<Page["getByRole"]>[0], {
          name: name,
          exact: false,
        });
        break;

      case "label":
        locator = this.page.getByLabel(value, { exact: false });
        break;

      default:
        throw new Error(`Unknown find strategy: ${strategy}`);
    }

    // Apply visibility filter if requested
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    // Wait for at least one match if timeout specified
    if (timeout) {
      try {
        await locator.first().waitFor({ timeout, state: "attached" });
      } catch {
        return { elements: [], count: 0 };
      }
    }

    // Get element details
    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, DEFAULT_LIMITS.maxElementRefs); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Find element by ref (registered in PageContext)
   */
  async byRef(ref: string): Promise<FindResult> {
    if (!this.pageContext.hasRef(ref)) {
      return { elements: [], count: 0 };
    }

    const locator = this.pageContext.getLocator(ref);
    const count = await locator.count();

    if (count === 0) {
      return { elements: [], count: 0 };
    }

    const elementData = await this.extractElementData(locator.first());
    if (!elementData) {
      return { elements: [], count: 0 };
    }

    const elementRef = createElementRef(elementData, ref);
    return { elements: [elementRef], count: 1 };
  }

  /**
   * Find elements by CSS selector
   */
  async bySelector(
    selector: string,
    options: { visible?: boolean; maxResults?: number } = {}
  ): Promise<FindResult> {
    const { visible = true, maxResults = DEFAULT_LIMITS.maxElementRefs } = options;

    let locator = this.page.locator(selector);
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, maxResults); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Find elements by text content
   */
  async byText(
    text: string,
    options: { exact?: boolean; visible?: boolean } = {}
  ): Promise<FindResult> {
    const { exact = false, visible = true } = options;

    let locator = this.page.getByText(text, { exact });
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, DEFAULT_LIMITS.maxElementRefs); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Find elements by ARIA role
   */
  async byRole(
    role: Parameters<Page["getByRole"]>[0],
    options: { name?: string; exact?: boolean; visible?: boolean } = {}
  ): Promise<FindResult> {
    const { name, exact = false, visible = true } = options;

    let locator = this.page.getByRole(role, { name, exact });
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, DEFAULT_LIMITS.maxElementRefs); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Find elements by label text
   */
  async byLabel(
    label: string,
    options: { exact?: boolean; visible?: boolean } = {}
  ): Promise<FindResult> {
    const { exact = false, visible = true } = options;

    let locator = this.page.getByLabel(label, { exact });
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, DEFAULT_LIMITS.maxElementRefs); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Find element by placeholder text
   */
  async byPlaceholder(
    placeholder: string,
    options: { exact?: boolean; visible?: boolean } = {}
  ): Promise<FindResult> {
    const { exact = false, visible = true } = options;

    let locator = this.page.getByPlaceholder(placeholder, { exact });
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, DEFAULT_LIMITS.maxElementRefs); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Find element by test ID
   */
  async byTestId(testId: string, options: { visible?: boolean } = {}): Promise<FindResult> {
    const { visible = true } = options;

    let locator = this.page.getByTestId(testId);
    if (visible) {
      locator = locator.filter({ visible: true });
    }

    const count = await locator.count();
    const elements: ElementRef[] = [];

    for (let i = 0; i < Math.min(count, DEFAULT_LIMITS.maxElementRefs); i++) {
      const element = locator.nth(i);
      const elementData = await this.extractElementData(element);
      if (elementData) {
        const usedRefs = new Set(elements.map((e) => e.ref));
        const ref = generateRef(elementData, usedRefs);
        elements.push(createElementRef(elementData, ref));
      }
    }

    return { elements, count };
  }

  /**
   * Get first matching element or throw if not found
   */
  async findFirst(options: FindOptions): Promise<ElementRef> {
    const result = await this.find(options);
    const firstElement = result.elements[0];
    if (result.count === 0 || !firstElement) {
      throw new ElementNotFoundError(`${options.strategy}:${options.value}`);
    }
    return firstElement;
  }

  /**
   * Extract element data from a Playwright locator
   */
  private async extractElementData(locator: Locator): Promise<RawElementData | null> {
    try {
      const data = await locator.evaluate<BrowserElementData>(EXTRACT_ELEMENT_DATA_SCRIPT);
      return data;
    } catch {
      return null;
    }
  }
}
