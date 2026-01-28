/**
 * Accessibility Module
 *
 * Runtime accessibility scanning and testing utilities for DevAC.
 *
 * Part of DevAC Phase 2: Runtime Detection (Issue #235)
 */

// AxeScanner - Core runtime scanning
export {
  AxeScanner,
  createAxeScanner,
  quickScan,
  type A11yViolation,
  type A11yPlatform,
  type A11yDetectionSource,
  type AxeImpact,
  type WcagLevel,
  type AxeScanOptions,
  type AxeScanResult,
} from "./axe-scanner.js";

// Play Function Utilities - Storybook integration
export {
  runAxeCheck,
  assertNoViolations,
  testKeyboardNavigation,
  testTabOrder,
  testFocusTrap,
  testEscapeDismisses,
  runA11yTestSuite,
  type AxeCheckOptions,
  type KeyboardNavOptions,
  type KeySequence,
  type KeyboardNavResult,
  type FocusTrapOptions,
  type FocusTrapResult,
} from "./play-function-utils.js";
