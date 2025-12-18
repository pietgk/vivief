/**
 * Unit tests for Logger Module
 *
 * The logger must support:
 * - Multiple log levels (error, warn, info, debug, verbose)
 * - Level filtering based on configuration
 * - Operation timing with time()/timeEnd()
 * - Child loggers with context
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type LogLevel,
  createLogger,
  getGlobalLogLevel,
  setGlobalLogLevel,
} from "../src/utils/logger.js";

describe("Logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    // Reset global level before each test
    setGlobalLogLevel("info");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("log levels", () => {
    it("outputs error level always", () => {
      const logger = createLogger({ level: "error" });
      logger.error("error message");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("outputs warn level when level is warn or higher", () => {
      const logger = createLogger({ level: "warn" });
      logger.warn("warn message");
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it("does not output warn level when level is error", () => {
      const logger = createLogger({ level: "error" });
      logger.warn("warn message");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("outputs info level by default", () => {
      const logger = createLogger();
      logger.info("info message");
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });

    it("does not output debug level by default", () => {
      const logger = createLogger();
      logger.debug("debug message");
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it("outputs debug level only when level is debug or verbose", () => {
      const logger = createLogger({ level: "debug" });
      logger.debug("debug message");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });

    it("outputs verbose level only when level is verbose", () => {
      const loggerDebug = createLogger({ level: "debug" });
      loggerDebug.verbose("verbose message");
      expect(consoleDebugSpy).not.toHaveBeenCalled();

      const loggerVerbose = createLogger({ level: "verbose" });
      loggerVerbose.verbose("verbose message");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });

    it("respects log level hierarchy", () => {
      const logger = createLogger({ level: "warn" });

      logger.error("error");
      logger.warn("warn");
      logger.info("info");
      logger.debug("debug");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe("setLevel()", () => {
    it("changes the log level dynamically", () => {
      const logger = createLogger({ level: "error" });

      logger.info("should not appear");
      expect(consoleInfoSpy).not.toHaveBeenCalled();

      logger.setLevel("info");
      logger.info("should appear");
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });

    it("can be set to silent to suppress all output", () => {
      const logger = createLogger({ level: "silent" });

      logger.error("error");
      logger.warn("warn");
      logger.info("info");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe("global log level", () => {
    it("can set global log level", () => {
      setGlobalLogLevel("debug");
      expect(getGlobalLogLevel()).toBe("debug");
    });

    it("new loggers inherit global log level", () => {
      setGlobalLogLevel("debug");
      const logger = createLogger();
      logger.debug("debug message");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("message formatting", () => {
    it("includes prefix in output", () => {
      const logger = createLogger({ prefix: "[DevAC]" });
      logger.info("test message");

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DevAC]"),
        expect.anything()
      );
    });

    it("includes timestamp when configured", () => {
      const logger = createLogger({ timestamps: true });
      logger.info("test message");

      // Timestamp format: HH:MM:SS or ISO
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}/),
        expect.anything()
      );
    });

    it("passes additional arguments through", () => {
      const logger = createLogger();
      const data = { key: "value" };
      logger.info("message with data", data);

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ key: "value" })
      );
    });
  });

  describe("performance timing", () => {
    it("logs operation duration with time() and timeEnd()", () => {
      const logger = createLogger();

      logger.time("operation");
      // Simulate some work
      const duration = logger.timeEnd("operation");

      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("returns -1 for timeEnd without matching time", () => {
      const logger = createLogger();
      const duration = logger.timeEnd("nonexistent");
      expect(duration).toBe(-1);
    });

    it("supports nested timing operations", () => {
      const logger = createLogger();

      logger.time("outer");
      logger.time("inner");
      const innerDuration = logger.timeEnd("inner");
      const outerDuration = logger.timeEnd("outer");

      expect(innerDuration).toBeGreaterThanOrEqual(0);
      expect(outerDuration).toBeGreaterThanOrEqual(innerDuration);
    });

    it("logs timing at info level by default", () => {
      const logger = createLogger();
      logger.time("op");
      logger.timeEnd("op");

      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining("op"), expect.anything());
    });
  });

  describe("child logger", () => {
    it("creates child logger with additional context", () => {
      const logger = createLogger({ prefix: "[Parent]" });
      const child = logger.child({ component: "Parser" });

      child.info("child message");

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Parent]"),
        expect.objectContaining({ component: "Parser" })
      );
    });

    it("child inherits parent log level", () => {
      const logger = createLogger({ level: "debug" });
      const child = logger.child({ component: "Test" });

      child.debug("debug from child");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });

    it("child can override log level", () => {
      const logger = createLogger({ level: "info" });
      const child = logger.child({ component: "Test" });
      child.setLevel("debug");

      child.debug("debug from child");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);

      // Parent should still be at info level
      logger.debug("debug from parent");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe("structured output", () => {
    it("outputs JSON format when json option is true", () => {
      const logger = createLogger({ json: true });
      logger.info("json message", { data: "test" });

      const call = consoleInfoSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(call);

      expect(parsed).toHaveProperty("level", "info");
      expect(parsed).toHaveProperty("message", "json message");
      expect(parsed).toHaveProperty("data", "test");
    });

    it("includes timestamp in JSON output", () => {
      const logger = createLogger({ json: true });
      logger.info("test");

      const call = consoleInfoSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(call);

      expect(parsed).toHaveProperty("timestamp");
    });
  });
});

describe("LogLevel type", () => {
  it("includes all expected levels", () => {
    const levels: LogLevel[] = ["silent", "error", "warn", "info", "debug", "verbose"];

    // Type check - this will fail compilation if LogLevel is wrong
    for (const level of levels) {
      expect(typeof level).toBe("string");
    }
  });
});
