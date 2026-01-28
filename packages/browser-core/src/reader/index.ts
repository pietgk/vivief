/**
 * Reader Module
 *
 * Provides page reading and element ref generation:
 * - PageReader: Reads page content and generates element refs
 * - Element ref utilities: Hybrid strategy for stable refs
 * - Accessibility: Runtime a11y scanning with axe-core
 */

export { PageReader, type ReadPageOptions } from "./page-reader.js";
export {
  generateRef,
  createElementRef,
  isInteractiveElement,
  buildSelector,
  getParentContext,
  type RawElementData,
} from "./element-ref.js";

// Accessibility module
export * from "./accessibility/index.js";
