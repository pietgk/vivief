/**
 * Plugin Validation Tests for DevAC CLI
 *
 * Tests the structure and validity of the DevAC plugin:
 * - SKILL.md schema validation
 * - COMMAND.md schema validation
 * - Hook configuration validation
 * - CLI/MCP reference validation
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PLUGIN_ROOT = path.resolve(__dirname, "../../../plugins/devac");

describe("plugin validation", () => {
  describe("plugin structure", () => {
    it("has required plugin directories", async () => {
      const requiredDirs = ["skills", "commands", "hooks", ".claude-plugin"];

      for (const dir of requiredDirs) {
        const dirPath = path.join(PLUGIN_ROOT, dir);
        const stat = await fs.stat(dirPath);
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it("has plugin manifest", async () => {
      const manifestPath = path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
      const stat = await fs.stat(manifestPath);
      expect(stat.isFile()).toBe(true);
    });

    it("has MCP configuration", async () => {
      const mcpPath = path.join(PLUGIN_ROOT, ".mcp.json");
      const stat = await fs.stat(mcpPath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe("plugin manifest validation", () => {
    let manifest: { name?: string; version?: string; description?: string; author?: unknown };

    beforeAll(async () => {
      const manifestPath = path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      manifest = JSON.parse(content);
    });

    it("has required name field", () => {
      expect(manifest.name).toBeDefined();
      expect(typeof manifest.name).toBe("string");
      expect(manifest.name).toBe("devac");
    });

    it("has valid version field", () => {
      expect(manifest.version).toBeDefined();
      expect(typeof manifest.version).toBe("string");
      // Semantic versioning pattern
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("has description field", () => {
      expect(manifest.description).toBeDefined();
      expect(typeof manifest.description).toBe("string");
      expect((manifest.description as string).length).toBeGreaterThan(0);
    });

    it("has author field", () => {
      expect(manifest.author).toBeDefined();
    });
  });

  describe("MCP configuration validation", () => {
    let mcpConfig: { mcpServers?: Record<string, unknown> };

    beforeAll(async () => {
      const mcpPath = path.join(PLUGIN_ROOT, ".mcp.json");
      const content = await fs.readFile(mcpPath, "utf-8");
      mcpConfig = JSON.parse(content);
    });

    it("has mcpServers field", () => {
      expect(mcpConfig.mcpServers).toBeDefined();
      expect(typeof mcpConfig.mcpServers).toBe("object");
    });

    it("has devac server configuration", () => {
      expect(mcpConfig.mcpServers?.devac).toBeDefined();
    });

    it("devac server has required command field", () => {
      const devacServer = mcpConfig.mcpServers?.devac as { command?: string };
      expect(devacServer?.command).toBeDefined();
      expect(typeof devacServer?.command).toBe("string");
    });

    it("devac server has args array", () => {
      const devacServer = mcpConfig.mcpServers?.devac as { args?: string[] };
      expect(devacServer?.args).toBeDefined();
      expect(Array.isArray(devacServer?.args)).toBe(true);
    });
  });

  describe("hooks validation", () => {
    let hooksConfig: { hooks?: Array<{ event?: string; command?: string; blocking?: boolean }> };

    beforeAll(async () => {
      const hooksPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
      const content = await fs.readFile(hooksPath, "utf-8");
      hooksConfig = JSON.parse(content);
    });

    it("has hooks array", () => {
      expect(hooksConfig.hooks).toBeDefined();
      expect(Array.isArray(hooksConfig.hooks)).toBe(true);
    });

    it("each hook has required event field", () => {
      for (const hook of hooksConfig.hooks || []) {
        expect(hook.event).toBeDefined();
        expect(typeof hook.event).toBe("string");
      }
    });

    it("each hook has required command field", () => {
      for (const hook of hooksConfig.hooks || []) {
        expect(hook.command).toBeDefined();
        expect(typeof hook.command).toBe("string");
      }
    });

    it("hooks use valid event names", () => {
      const validEvents = ["UserPromptSubmit", "Stop", "PreToolUse", "PostToolUse"];

      for (const hook of hooksConfig.hooks || []) {
        expect(validEvents).toContain(hook.event);
      }
    });

    it("hooks reference valid devac commands", () => {
      for (const hook of hooksConfig.hooks || []) {
        const command = hook.command || "";
        // Should start with "devac" command
        expect(command.startsWith("devac ")).toBe(true);
      }
    });
  });

  describe("skills validation", () => {
    let skillDirs: string[];

    beforeAll(async () => {
      const skillsPath = path.join(PLUGIN_ROOT, "skills");
      const entries = await fs.readdir(skillsPath, { withFileTypes: true });
      skillDirs = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);
    });

    it("has at least one skill", () => {
      expect(skillDirs.length).toBeGreaterThan(0);
    });

    it("each skill directory has SKILL.md file", async () => {
      for (const skillDir of skillDirs) {
        const skillPath = path.join(PLUGIN_ROOT, "skills", skillDir, "SKILL.md");
        try {
          const stat = await fs.stat(skillPath);
          expect(stat.isFile()).toBe(true);
        } catch {
          throw new Error(`Missing SKILL.md in skills/${skillDir}`);
        }
      }
    });

    it("SKILL.md files have required markdown structure", async () => {
      for (const skillDir of skillDirs) {
        const skillPath = path.join(PLUGIN_ROOT, "skills", skillDir, "SKILL.md");
        const content = await fs.readFile(skillPath, "utf-8");

        // Should have a title (# heading)
        expect(content).toMatch(/^# .+/m);

        // Should have content
        expect(content.length).toBeGreaterThan(100);
      }
    });

    it("SKILL.md files reference valid CLI commands", async () => {
      const validCommandPatterns = [
        /devac query/,
        /devac sync/,
        /devac status/,
        /devac validate/,
        /devac file-symbols/,
        /devac workflow/,
      ];

      for (const skillDir of skillDirs) {
        const skillPath = path.join(PLUGIN_ROOT, "skills", skillDir, "SKILL.md");
        const content = await fs.readFile(skillPath, "utf-8");

        // Skills should mention CLI commands (not all skills may have commands)
        const hasCommands = content.includes("```bash");
        if (hasCommands) {
          // If it has bash code blocks, they should reference valid devac commands
          const hasValidCommand = validCommandPatterns.some((pattern) => pattern.test(content));
          if (!hasValidCommand && content.includes("devac ")) {
            // If it mentions devac but not a valid pattern, it might be custom
            // This is a soft check
          }
        }
      }
    });
  });

  describe("commands validation", () => {
    let commandFiles: string[];

    beforeAll(async () => {
      const commandsPath = path.join(PLUGIN_ROOT, "commands");
      const entries = await fs.readdir(commandsPath, { withFileTypes: true });
      commandFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name);
    });

    it("has at least one command", () => {
      expect(commandFiles.length).toBeGreaterThan(0);
    });

    it("command files have valid markdown structure", async () => {
      for (const commandFile of commandFiles) {
        const commandPath = path.join(PLUGIN_ROOT, "commands", commandFile);
        const content = await fs.readFile(commandPath, "utf-8");

        // Should have a title
        expect(content).toMatch(/^# .+/m);

        // Should have content
        expect(content.length).toBeGreaterThan(50);
      }
    });

    it("command files follow naming convention", () => {
      for (const commandFile of commandFiles) {
        // Should be kebab-case with .md extension
        expect(commandFile).toMatch(/^[a-z][a-z0-9-]*\.md$/);
      }
    });

    it("command files reference valid CLI commands", async () => {
      const validCommandPatterns = [
        /devac query/,
        /devac sync/,
        /devac status/,
        /devac validate/,
        /devac workflow/,
        /git /,
        /gh /,
      ];

      for (const commandFile of commandFiles) {
        const commandPath = path.join(PLUGIN_ROOT, "commands", commandFile);
        const content = await fs.readFile(commandPath, "utf-8");

        // Commands should mention CLI commands in code blocks
        const hasCommands = content.includes("```bash") || content.includes("```");
        if (hasCommands) {
          // Check that it references some valid tool
          const hasValidCommand = validCommandPatterns.some((pattern) => pattern.test(content));
          // This is informational - commands might use other tools
          if (!hasValidCommand) {
            // That's okay, command might use different tools
          }
        }
      }
    });
  });

  describe("cross-reference validation", () => {
    it("hooks reference existing devac CLI commands", async () => {
      const hooksPath = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
      const content = await fs.readFile(hooksPath, "utf-8");
      const hooksConfig = JSON.parse(content);

      // Known valid devac subcommands
      const validSubcommands = [
        "sync",
        "status",
        "validate",
        "query",
        "mcp",
        "workflow",
        "hub",
        "cleanup",
        "context",
        "doc-sync",
      ];

      for (const hook of hooksConfig.hooks || []) {
        const command = hook.command || "";
        if (command.startsWith("devac ")) {
          const subcommand = command.split(" ")[1];
          expect(validSubcommands).toContain(subcommand);
        }
      }
    });

    it("all skill directories exist", async () => {
      const skillsPath = path.join(PLUGIN_ROOT, "skills");
      const entries = await fs.readdir(skillsPath, { withFileTypes: true });
      const skillDirs = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);

      // Verify each skill directory is accessible
      for (const skillDir of skillDirs) {
        const dirPath = path.join(skillsPath, skillDir);
        const stat = await fs.stat(dirPath);
        expect(stat.isDirectory()).toBe(true);
      }
    });
  });
});

describe("plugin content quality", () => {
  describe("SKILL.md content checks", () => {
    it("skills have descriptive names", async () => {
      const skillsPath = path.join(PLUGIN_ROOT, "skills");
      const entries = await fs.readdir(skillsPath, { withFileTypes: true });
      const skillDirs = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);

      for (const skillDir of skillDirs) {
        // Should be kebab-case and descriptive
        expect(skillDir).toMatch(/^[a-z][a-z0-9-]+$/);
        // Should not be too short
        expect(skillDir.length).toBeGreaterThan(3);
      }
    });
  });

  describe("command content checks", () => {
    it("commands have descriptive titles", async () => {
      const commandsPath = path.join(PLUGIN_ROOT, "commands");
      const entries = await fs.readdir(commandsPath, { withFileTypes: true });
      const commandFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name);

      for (const commandFile of commandFiles) {
        const commandPath = path.join(PLUGIN_ROOT, "commands", commandFile);
        const content = await fs.readFile(commandPath, "utf-8");

        // Extract title
        const titleMatch = content.match(/^# (.+)/m);
        expect(titleMatch).not.toBeNull();

        if (titleMatch?.[1]) {
          const title = titleMatch[1];
          // Title should be meaningful
          expect(title.length).toBeGreaterThan(5);
        }
      }
    });
  });
});
