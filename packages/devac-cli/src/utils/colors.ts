/**
 * CLI Color Utilities
 *
 * Lightweight ANSI color support with NO_COLOR and --no-color respect.
 * Uses a minimal implementation without external dependencies.
 *
 * @see https://no-color.org/ for the NO_COLOR standard
 */

// ─────────────────────────────────────────────────────────────────────────────
// ANSI Escape Codes
// ─────────────────────────────────────────────────────────────────────────────

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Color Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if colors should be enabled.
 * Respects NO_COLOR env var and TTY detection.
 */
function shouldUseColors(): boolean {
  // NO_COLOR takes precedence (https://no-color.org/)
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // FORCE_COLOR overrides TTY detection
  if (process.env.FORCE_COLOR !== undefined) {
    return true;
  }

  // Check if stdout is a TTY
  return process.stdout.isTTY ?? false;
}

// Global state for color mode
let colorsEnabled = shouldUseColors();

/**
 * Enable or disable colors programmatically.
 * Used by --no-color flag.
 */
export function setColorsEnabled(enabled: boolean): void {
  colorsEnabled = enabled;
}

/**
 * Check if colors are currently enabled.
 */
export function areColorsEnabled(): boolean {
  return colorsEnabled;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap text with ANSI code if colors are enabled.
 */
function wrap(code: string, text: string): string {
  if (!colorsEnabled) return text;
  return `${code}${text}${ANSI.reset}`;
}

/**
 * Color functions for status output.
 */
export const colors = {
  // Status colors
  green: (text: string) => wrap(ANSI.green, text),
  red: (text: string) => wrap(ANSI.red, text),
  yellow: (text: string) => wrap(ANSI.yellow, text),
  blue: (text: string) => wrap(ANSI.blue, text),
  cyan: (text: string) => wrap(ANSI.cyan, text),
  magenta: (text: string) => wrap(ANSI.magenta, text),

  // Modifiers
  dim: (text: string) => wrap(ANSI.dim, text),
  bold: (text: string) => wrap(ANSI.bold, text),
  gray: (text: string) => wrap(ANSI.gray, text),

  // Reset
  reset: ANSI.reset,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Status-Specific Colorizers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Colorize text based on CI/workflow status.
 */
export function colorByStatus(
  text: string,
  status: "passing" | "failing" | "pending" | "none" | "unknown"
): string {
  switch (status) {
    case "passing":
      return colors.green(text);
    case "failing":
      return colors.red(text);
    case "pending":
      return colors.yellow(text);
    case "none":
    case "unknown":
      return colors.dim(text);
  }
}

/**
 * Colorize text based on diagnostic severity.
 */
export function colorBySeverity(
  text: string,
  severity: "error" | "warning" | "suggestion" | "ok"
): string {
  switch (severity) {
    case "error":
      return colors.red(text);
    case "warning":
      return colors.yellow(text);
    case "suggestion":
      return colors.cyan(text);
    case "ok":
      return colors.green(text);
  }
}

/**
 * Colorize status icon with appropriate color.
 */
export function colorIcon(
  icon: string,
  status: "passing" | "failing" | "pending" | "none" | "ok" | "error" | "warning"
): string {
  switch (status) {
    case "passing":
    case "ok":
      return colors.green(icon);
    case "failing":
    case "error":
      return colors.red(icon);
    case "pending":
    case "warning":
      return colors.yellow(icon);
    case "none":
      return colors.dim(icon);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a header with optional underline.
 */
export function header(text: string, underlineChar = "─"): string {
  const line = underlineChar.repeat(Math.max(text.length, 30));
  return `${colors.bold(text)}\n${colors.dim(line)}`;
}

/**
 * Format a section header for brief output.
 */
export function sectionHeader(text: string): string {
  return colors.bold(text);
}

/**
 * Format a label: value pair with aligned colons.
 */
export function labelValue(label: string, value: string, labelWidth = 12): string {
  const paddedLabel = label.padEnd(labelWidth);
  return `${colors.dim(paddedLabel)} ${value}`;
}
