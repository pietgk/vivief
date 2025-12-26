/**
 * CLI Output Utilities
 *
 * Standard CLI output helpers with consistent formatting for success/error messages.
 */

/**
 * Result interface that command functions return
 */
export interface CommandResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Display a success message with checkmark
 */
export function success(message: string): void {
  console.log(`✓ ${message}`);
}

/**
 * Display an error message with X mark, details, and optional suggestion
 */
export function error(message: string, details?: string): void {
  console.error(`✗ ${message}`);
  if (details) {
    console.error(`  ${details}`);
  }
  const suggestion = getSuggestion(details || message);
  if (suggestion) {
    console.error("");
    console.error(`  Suggestion: ${suggestion}`);
  }
}

/**
 * Display result from a command function.
 * Shows success message or error with details, then exits on failure.
 */
export function displayCommandResult(result: CommandResult): void {
  if (result.success) {
    console.log(result.message);
  } else {
    error(result.message, result.error);
    process.exit(1);
  }
}

/**
 * Pattern-match common errors to provide helpful suggestions
 */
function getSuggestion(errorText: string): string | null {
  const lower = errorText.toLowerCase();

  if (lower.includes("not initialized")) {
    return "Run 'devac workspace init' first";
  }

  if (lower.includes("locked") || lower.includes("conflicting lock")) {
    return "Database locked by another process. The MCP server may be running.";
  }

  if (lower.includes("no .devac/seed") || lower.includes("no seed")) {
    return "Run 'devac analyze' in the repository first";
  }

  if (
    lower.includes("not a workspace") ||
    lower.includes("no workspace") ||
    lower.includes("not in a workspace")
  ) {
    return "Run this command from inside a workspace directory";
  }

  if (lower.includes("repository") && lower.includes("not found")) {
    return "Check the repository ID with 'devac hub list'";
  }

  if (lower.includes("enoent") || lower.includes("does not exist")) {
    return "Check that the specified path exists and is accessible";
  }

  return null;
}
