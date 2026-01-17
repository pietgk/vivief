/**
 * Actions Module
 *
 * Provides browser interaction actions:
 * - click, doubleClick, rightClick
 * - type, press
 * - fill, clear
 * - select, selectMultiple
 * - scroll, scrollElement, scrollIntoView, scrollToTop, scrollToBottom
 * - hover
 */

export { click, doubleClick, rightClick, type ClickResult } from "./click.js";
export { type, press, type TypeResult } from "./type.js";
export { fill, clear, type FillResult } from "./fill.js";
export { select, selectMultiple, type SelectResult } from "./select.js";
export {
  scroll,
  scrollElement,
  scrollIntoView,
  scrollToTop,
  scrollToBottom,
  type ScrollResult,
} from "./scroll.js";
export { hover, type HoverResult } from "./hover.js";
