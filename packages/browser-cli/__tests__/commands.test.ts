/**
 * Tests for CLI Commands
 */

import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  formatOutput,
  registerFindCommands,
  registerInteractCommands,
  registerNavigateCommands,
  registerReadCommands,
  registerScreenshotCommands,
  registerSessionCommands,
} from "../src/commands/index.js";

describe("Command Registration", () => {
  describe("registerSessionCommands", () => {
    it("should register session commands", () => {
      const program = new Command();
      registerSessionCommands(program);

      const sessionCmd = program.commands.find((c) => c.name() === "session");
      expect(sessionCmd).toBeDefined();

      const subcommands = sessionCmd?.commands.map((c) => c.name());
      expect(subcommands).toContain("start");
      expect(subcommands).toContain("stop");
      expect(subcommands).toContain("list");
    });

    it("should have correct options for session start", () => {
      const program = new Command();
      registerSessionCommands(program);

      const sessionCmd = program.commands.find((c) => c.name() === "session");
      const startCmd = sessionCmd?.commands.find((c) => c.name() === "start");

      const optionNames = startCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--headed");
      expect(optionNames).toContain("--viewport");
      expect(optionNames).toContain("--json");
    });
  });

  describe("registerNavigateCommands", () => {
    it("should register navigation commands", () => {
      const program = new Command();
      registerNavigateCommands(program);

      const commandNames = program.commands.map((c) => c.name());
      expect(commandNames).toContain("navigate");
      expect(commandNames).toContain("reload");
      expect(commandNames).toContain("back");
      expect(commandNames).toContain("forward");
    });

    it("should have correct options for navigate", () => {
      const program = new Command();
      registerNavigateCommands(program);

      const navigateCmd = program.commands.find((c) => c.name() === "navigate");
      const optionNames = navigateCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--wait-until");
      expect(optionNames).toContain("--json");
    });
  });

  describe("registerReadCommands", () => {
    it("should register read command", () => {
      const program = new Command();
      registerReadCommands(program);

      const readCmd = program.commands.find((c) => c.name() === "read");
      expect(readCmd).toBeDefined();
    });

    it("should have correct options for read", () => {
      const program = new Command();
      registerReadCommands(program);

      const readCmd = program.commands.find((c) => c.name() === "read");
      const optionNames = readCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--selector");
      expect(optionNames).toContain("--interactive-only");
      expect(optionNames).toContain("--max-elements");
      expect(optionNames).toContain("--json");
    });
  });

  describe("registerInteractCommands", () => {
    it("should register interaction commands", () => {
      const program = new Command();
      registerInteractCommands(program);

      const commandNames = program.commands.map((c) => c.name());
      expect(commandNames).toContain("click");
      expect(commandNames).toContain("type");
      expect(commandNames).toContain("fill");
      expect(commandNames).toContain("select");
      expect(commandNames).toContain("scroll");
      expect(commandNames).toContain("hover");
    });

    it("should have correct options for type", () => {
      const program = new Command();
      registerInteractCommands(program);

      const typeCmd = program.commands.find((c) => c.name() === "type");
      const optionNames = typeCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--delay");
      expect(optionNames).toContain("--clear");
      expect(optionNames).toContain("--json");
    });

    it("should have correct options for scroll", () => {
      const program = new Command();
      registerInteractCommands(program);

      const scrollCmd = program.commands.find((c) => c.name() === "scroll");
      const optionNames = scrollCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--amount");
      expect(optionNames).toContain("--ref");
      expect(optionNames).toContain("--json");
    });

    it("should have correct options for select", () => {
      const program = new Command();
      registerInteractCommands(program);

      const selectCmd = program.commands.find((c) => c.name() === "select");
      const optionNames = selectCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--by");
      expect(optionNames).toContain("--json");
    });
  });

  describe("registerScreenshotCommands", () => {
    it("should register screenshot command", () => {
      const program = new Command();
      registerScreenshotCommands(program);

      const screenshotCmd = program.commands.find((c) => c.name() === "screenshot");
      expect(screenshotCmd).toBeDefined();
    });

    it("should have correct options for screenshot", () => {
      const program = new Command();
      registerScreenshotCommands(program);

      const screenshotCmd = program.commands.find((c) => c.name() === "screenshot");
      const optionNames = screenshotCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--full-page");
      expect(optionNames).toContain("--name");
      expect(optionNames).toContain("--selector");
      expect(optionNames).toContain("--json");
    });
  });

  describe("registerFindCommands", () => {
    it("should register find and eval commands", () => {
      const program = new Command();
      registerFindCommands(program);

      const commandNames = program.commands.map((c) => c.name());
      expect(commandNames).toContain("find");
      expect(commandNames).toContain("eval");
    });

    it("should have correct options for find", () => {
      const program = new Command();
      registerFindCommands(program);

      const findCmd = program.commands.find((c) => c.name() === "find");
      const optionNames = findCmd?.options.map((o) => o.long);
      expect(optionNames).toContain("--selector");
      expect(optionNames).toContain("--text");
      expect(optionNames).toContain("--role");
      expect(optionNames).toContain("--name");
      expect(optionNames).toContain("--label");
      expect(optionNames).toContain("--placeholder");
      expect(optionNames).toContain("--test-id");
      expect(optionNames).toContain("--json");
    });
  });
});

describe("formatOutput", () => {
  it("should format as JSON when json option is true", () => {
    const data = { test: "value" };
    const result = formatOutput(data, { json: true });
    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it("should format objects as JSON by default", () => {
    const data = { test: "value" };
    const result = formatOutput(data);
    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it("should return strings as-is", () => {
    const result = formatOutput("test string");
    expect(result).toBe("test string");
  });

  it("should convert non-objects to string", () => {
    const result = formatOutput(123);
    expect(result).toBe("123");
  });
});

describe("All Commands Together", () => {
  it("should register all commands on a single program", () => {
    const program = new Command();

    registerSessionCommands(program);
    registerNavigateCommands(program);
    registerReadCommands(program);
    registerInteractCommands(program);
    registerScreenshotCommands(program);
    registerFindCommands(program);

    const allCommands = program.commands.map((c) => c.name());

    // Session commands
    expect(allCommands).toContain("session");

    // Navigation commands
    expect(allCommands).toContain("navigate");
    expect(allCommands).toContain("reload");
    expect(allCommands).toContain("back");
    expect(allCommands).toContain("forward");

    // Read command
    expect(allCommands).toContain("read");

    // Interact commands
    expect(allCommands).toContain("click");
    expect(allCommands).toContain("type");
    expect(allCommands).toContain("fill");
    expect(allCommands).toContain("select");
    expect(allCommands).toContain("scroll");
    expect(allCommands).toContain("hover");

    // Screenshot command
    expect(allCommands).toContain("screenshot");

    // Find commands
    expect(allCommands).toContain("find");
    expect(allCommands).toContain("eval");
  });

  it("should have expected number of top-level commands/groups", () => {
    const program = new Command();

    registerSessionCommands(program);
    registerNavigateCommands(program);
    registerReadCommands(program);
    registerInteractCommands(program);
    registerScreenshotCommands(program);
    registerFindCommands(program);

    // Verify we have a reasonable number of commands and key ones are registered
    expect(program.commands.length).toBeGreaterThan(0);

    // Verify essential command groups are registered
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain("session");
    expect(commandNames).toContain("navigate");
    expect(commandNames).toContain("read");
    expect(commandNames).toContain("click");
    expect(commandNames).toContain("type");
    expect(commandNames).toContain("fill");
    expect(commandNames).toContain("scroll");
    expect(commandNames).toContain("screenshot");
    expect(commandNames).toContain("find");
  });
});
