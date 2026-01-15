/**
 * Element Reference System (Hybrid Strategy)
 *
 * Generates stable, readable element refs using a priority system:
 * 1. testId - data-testid attribute (most deterministic)
 * 2. ariaLabel - aria-label attribute
 * 3. role:name - Semantic ref from ARIA role + accessible name
 * 4. fallback - Context-aware sequential ref (e.g., form_1:button_2)
 */

import type { ElementRef } from "../types/index.js";

/**
 * Raw element data extracted from the page
 */
export interface RawElementData {
  tag: string;
  role: string;
  name: string;
  testId?: string;
  ariaLabel?: string;
  selector: string;
  isInteractive: boolean;
  isVisible: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parentContext?: string; // e.g., "form_1" for elements inside a form
}

/**
 * Generate a ref for an element using the hybrid strategy
 */
export function generateRef(data: RawElementData, usedRefs: Set<string>): string {
  // Priority 1: data-testid (most deterministic)
  if (data.testId) {
    const ref = sanitizeRef(data.testId);
    if (!usedRefs.has(ref)) {
      return ref;
    }
    // If testId is already used, append a counter
    return makeUnique(ref, usedRefs);
  }

  // Priority 2: aria-label (if unique and meaningful)
  if (data.ariaLabel && data.ariaLabel.length > 0 && data.ariaLabel.length <= 50) {
    const ref = sanitizeRef(data.ariaLabel);
    if (!usedRefs.has(ref)) {
      return ref;
    }
  }

  // Priority 3: role:name (semantic ref)
  if (data.role && data.name && data.name.length > 0 && data.name.length <= 30) {
    const ref = `${data.role}:${sanitizeRef(data.name)}`;
    if (!usedRefs.has(ref)) {
      return ref;
    }
    // If role:name is already used, append a counter
    return makeUnique(ref, usedRefs);
  }

  // Priority 4: role-only (for elements without names)
  if (data.role) {
    const baseRef = data.parentContext ? `${data.parentContext}:${data.role}` : data.role;
    return makeUnique(baseRef, usedRefs);
  }

  // Priority 5: fallback with parent context
  const baseRef = data.parentContext ? `${data.parentContext}:${data.tag}` : data.tag;
  return makeUnique(baseRef, usedRefs);
}

/**
 * Sanitize a string to be used as a ref
 */
function sanitizeRef(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "_") // Replace special chars with underscore
    .replace(/_+/g, "_") // Collapse multiple underscores
    .replace(/^_|_$/g, ""); // Remove leading/trailing underscores
}

/**
 * Make a ref unique by appending a counter
 */
function makeUnique(baseRef: string, usedRefs: Set<string>): string {
  if (!usedRefs.has(baseRef)) {
    return baseRef;
  }

  let counter = 1;
  while (usedRefs.has(`${baseRef}_${counter}`)) {
    counter++;
  }
  return `${baseRef}_${counter}`;
}

/**
 * Create an ElementRef from raw data
 */
export function createElementRef(data: RawElementData, ref: string): ElementRef {
  return {
    ref,
    testId: data.testId,
    ariaLabel: data.ariaLabel,
    role: data.role || "generic",
    name: data.name || "",
    tag: data.tag,
    selector: data.selector,
    isInteractive: data.isInteractive,
    isVisible: data.isVisible,
    boundingBox: data.boundingBox,
  };
}

/**
 * Check if an element is interactive
 */
export function isInteractiveElement(
  tag: string,
  role: string,
  attributes: Record<string, string>
): boolean {
  // Interactive by tag
  const interactiveTags = ["a", "button", "input", "select", "textarea", "details", "summary"];
  if (interactiveTags.includes(tag.toLowerCase())) {
    return true;
  }

  // Interactive by role
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
  if (interactiveRoles.includes(role.toLowerCase())) {
    return true;
  }

  // Interactive by attribute
  if (attributes.onclick || attributes.tabindex === "0" || attributes.contenteditable === "true") {
    return true;
  }

  return false;
}

/**
 * Build a unique CSS selector for an element
 */
export function buildSelector(
  tag: string,
  testId?: string,
  ariaLabel?: string,
  attributes?: Record<string, string>
): string {
  // Prefer data-testid (most reliable)
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  // Use aria-label if unique
  if (ariaLabel) {
    return `[aria-label="${ariaLabel}"]`;
  }

  // Build selector from attributes
  const parts: string[] = [tag];

  if (attributes?.id) {
    return `#${attributes.id}`;
  }

  if (attributes?.name) {
    parts.push(`[name="${attributes.name}"]`);
  }

  if (attributes?.type) {
    parts.push(`[type="${attributes.type}"]`);
  }

  if (attributes?.placeholder) {
    parts.push(`[placeholder="${attributes.placeholder}"]`);
  }

  return parts.join("");
}

/**
 * Determine parent context for nested elements
 */
export function getParentContext(
  _tag: string,
  _role: string,
  parentTag?: string,
  parentRole?: string,
  parentIndex?: number
): string | undefined {
  // Elements inside forms get form context
  if (parentTag === "form" || parentRole === "form") {
    return `form_${parentIndex ?? 1}`;
  }

  // Elements inside navigation get nav context
  if (parentTag === "nav" || parentRole === "navigation") {
    return `nav_${parentIndex ?? 1}`;
  }

  // Elements inside dialogs get dialog context
  if (parentTag === "dialog" || parentRole === "dialog") {
    return `dialog_${parentIndex ?? 1}`;
  }

  // Elements inside main get main context
  if (parentTag === "main" || parentRole === "main") {
    return "main";
  }

  // Elements inside header get header context
  if (parentTag === "header" || parentRole === "banner") {
    return "header";
  }

  // Elements inside footer get footer context
  if (parentTag === "footer" || parentRole === "contentinfo") {
    return "footer";
  }

  return undefined;
}
