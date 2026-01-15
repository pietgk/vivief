/**
 * Select Action
 *
 * Selects options from dropdown/select elements.
 */

import type { PageContext } from "../session/page-context.js";
import type { SelectOptions } from "../types/index.js";
import { DEFAULT_LIMITS } from "../types/index.js";

export interface SelectResult {
  success: boolean;
  ref: string;
  value: string;
  selectedValues: string[];
  error?: string;
}

/**
 * Select an option from a dropdown by ref
 */
export async function select(
  pageContext: PageContext,
  ref: string,
  value: string,
  options: SelectOptions = {}
): Promise<SelectResult> {
  try {
    const locator = pageContext.getLocator(ref);

    let selectedValues: string[];

    switch (options.by) {
      case "label":
        selectedValues = await locator.selectOption(
          { label: value },
          { timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout }
        );
        break;

      case "index": {
        const index = Number.parseInt(value, 10);
        if (Number.isNaN(index)) {
          throw new Error(`Invalid index: ${value}`);
        }
        selectedValues = await locator.selectOption(
          { index },
          { timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout }
        );
        break;
      }

      default:
        selectedValues = await locator.selectOption(
          { value },
          { timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout }
        );
        break;
    }

    return {
      success: true,
      ref,
      value,
      selectedValues,
    };
  } catch (error) {
    return {
      success: false,
      ref,
      value,
      selectedValues: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Select multiple options from a multi-select by ref
 */
export async function selectMultiple(
  pageContext: PageContext,
  ref: string,
  values: string[],
  options: SelectOptions = {}
): Promise<SelectResult> {
  try {
    const locator = pageContext.getLocator(ref);

    let selectOptions: Parameters<typeof locator.selectOption>[0];

    switch (options.by) {
      case "label":
        selectOptions = values.map((v) => ({ label: v }));
        break;

      case "index":
        selectOptions = values.map((v) => {
          const index = Number.parseInt(v, 10);
          if (Number.isNaN(index)) {
            throw new Error(`Invalid index: ${v}`);
          }
          return { index };
        });
        break;

      default:
        selectOptions = values.map((v) => ({ value: v }));
        break;
    }

    const selectedValues = await locator.selectOption(selectOptions, {
      timeout: options.timeout ?? DEFAULT_LIMITS.actionTimeout,
    });

    return {
      success: true,
      ref,
      value: values.join(", "),
      selectedValues,
    };
  } catch (error) {
    return {
      success: false,
      ref,
      value: values.join(", "),
      selectedValues: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
