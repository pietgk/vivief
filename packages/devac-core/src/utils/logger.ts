/**
 * Structured Logger Module
 *
 * Provides configurable logging with:
 * - Multiple log levels (silent, error, warn, info, debug, verbose)
 * - Level filtering
 * - Operation timing
 * - Child loggers with context
 * - JSON output format option
 *
 * Based on DevAC v2.0 spec Section 12.5
 */

/**
 * Log levels in order of verbosity (lowest to highest)
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "verbose";

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level to output (default: "info") */
  level?: LogLevel;
  /** Prefix to prepend to all messages */
  prefix?: string;
  /** Include timestamps in output */
  timestamps?: boolean;
  /** Output in JSON format */
  json?: boolean;
  /** Additional context to include in all log entries */
  context?: Record<string, unknown>;
}

/**
 * Logger interface
 */
export interface Logger {
  /** Log at error level (always shown except silent) */
  error(message: string, ...args: unknown[]): void;
  /** Log at warn level (shown at warn and above) */
  warn(message: string, ...args: unknown[]): void;
  /** Log at info level (shown at info and above) */
  info(message: string, ...args: unknown[]): void;
  /** Log at debug level (shown at debug and above) */
  debug(message: string, ...args: unknown[]): void;
  /** Log at verbose level (shown only at verbose) */
  verbose(message: string, ...args: unknown[]): void;
  /** Start a timer with the given label */
  time(label: string): void;
  /** End a timer and return duration in ms (-1 if not found) */
  timeEnd(label: string): number;
  /** Change the log level */
  setLevel(level: LogLevel): void;
  /** Get current log level */
  getLevel(): LogLevel;
  /** Create a child logger with additional context */
  child(context: Record<string, unknown>): Logger;
}

/**
 * Log level priority (higher number = more verbose)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  verbose: 5,
};

/**
 * Global log level - can be set once for all new loggers
 */
let globalLogLevel: LogLevel = "info";

/**
 * Set the global log level for all new loggers
 */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

/**
 * Alias for setGlobalLogLevel for convenience
 */
export const setLogLevel = setGlobalLogLevel;

/**
 * Get the current global log level
 */
export function getGlobalLogLevel(): LogLevel {
  return globalLogLevel;
}

/**
 * Format timestamp for log output
 */
function formatTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Logger implementation
 */
class LoggerImpl implements Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;
  private json: boolean;
  private context: Record<string, unknown>;
  private timers: Map<string, number> = new Map();

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? globalLogLevel;
    this.prefix = options.prefix ?? "";
    this.timestamps = options.timestamps ?? false;
    this.json = options.json ?? false;
    this.context = options.context ?? {};
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(_level: LogLevel, message: string): string {
    if (this.json) {
      return ""; // JSON format handled separately
    }

    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(formatTimestamp());
    }

    if (this.prefix) {
      parts.push(this.prefix);
    }

    parts.push(message);

    return parts.join(" ");
  }

  private log(
    level: LogLevel,
    consoleMethod: "error" | "warn" | "info" | "debug",
    message: string,
    ...args: unknown[]
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    if (this.json) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...this.context,
        ...(args.length > 0 && typeof args[0] === "object" ? args[0] : {}),
      };
      console[consoleMethod](JSON.stringify(entry));
      return;
    }

    const formattedMessage = this.formatMessage(level, message);
    const logArgs =
      args.length > 0
        ? { ...this.context, ...(typeof args[0] === "object" ? args[0] : {}) }
        : this.context;

    console[consoleMethod](formattedMessage, logArgs);
  }

  error(message: string, ...args: unknown[]): void {
    this.log("error", "error", message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log("warn", "warn", message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log("info", "info", message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log("debug", "debug", message, ...args);
  }

  verbose(message: string, ...args: unknown[]): void {
    this.log("verbose", "debug", message, ...args);
  }

  time(label: string): void {
    this.timers.set(label, performance.now());
  }

  timeEnd(label: string): number {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      return -1;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    // Log the timing at info level
    this.info(`${label}: ${duration.toFixed(2)}ms`);

    return duration;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  child(context: Record<string, unknown>): Logger {
    return new LoggerImpl({
      level: this.level,
      prefix: this.prefix,
      timestamps: this.timestamps,
      json: this.json,
      context: { ...this.context, ...context },
    });
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new LoggerImpl(options);
}

/**
 * Default logger instance for convenience
 */
export const logger = createLogger({ prefix: "[DevAC]" });
