/**
 * Tests for MCP Tool Definitions
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOLS } from "../src/tools/index.js";

describe("MCP_TOOLS", () => {
  it("should export an array of tools", () => {
    expect(Array.isArray(MCP_TOOLS)).toBe(true);
    expect(MCP_TOOLS.length).toBeGreaterThan(0);
  });

  it("should have expected tools defined", () => {
    // Use greater-than check to allow for tool additions
    expect(MCP_TOOLS.length).toBeGreaterThanOrEqual(20);
  });

  describe("tool structure", () => {
    it("should have required properties for all tools", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
        expect(typeof tool.name).toBe("string");
        expect(typeof tool.description).toBe("string");
        expect(typeof tool.inputSchema).toBe("object");
      }
    });

    it("should have valid inputSchema for all tools", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema).toHaveProperty("properties");
        expect(tool.inputSchema).toHaveProperty("required");
        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      }
    });
  });

  describe("session management tools", () => {
    it("should have browser_session_start tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_session_start");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Start");
      expect(tool?.inputSchema.properties).toHaveProperty("headless");
      expect(tool?.inputSchema.properties).toHaveProperty("viewport");
    });

    it("should have browser_session_stop tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_session_stop");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Stop");
      expect(tool?.inputSchema.properties).toHaveProperty("sessionId");
    });

    it("should have browser_session_list tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_session_list");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("List");
    });
  });

  describe("navigation tools", () => {
    it("should have browser_navigate tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_navigate");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("url");
      expect(tool?.inputSchema.properties).toHaveProperty("waitUntil");
      expect(tool?.inputSchema.required).toContain("url");
    });

    it("should have browser_reload tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_reload");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("waitUntil");
    });

    it("should have browser_back tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_back");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("back");
    });

    it("should have browser_forward tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_forward");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("forward");
    });
  });

  describe("page reading tools", () => {
    it("should have browser_read_page tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_read_page");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("selector");
      expect(tool?.inputSchema.properties).toHaveProperty("includeHidden");
      expect(tool?.inputSchema.properties).toHaveProperty("interactiveOnly");
      expect(tool?.inputSchema.properties).toHaveProperty("maxElements");
    });

    it("should have browser_get_text tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_get_text");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.required).toContain("ref");
    });

    it("should have browser_get_value tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_get_value");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.required).toContain("ref");
    });
  });

  describe("action tools", () => {
    it("should have browser_click tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_click");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.properties).toHaveProperty("button");
      expect(tool?.inputSchema.required).toContain("ref");
    });

    it("should have browser_type tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_type");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.properties).toHaveProperty("text");
      expect(tool?.inputSchema.properties).toHaveProperty("delay");
      expect(tool?.inputSchema.properties).toHaveProperty("clear");
      expect(tool?.inputSchema.required).toContain("ref");
      expect(tool?.inputSchema.required).toContain("text");
    });

    it("should have browser_fill tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_fill");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.properties).toHaveProperty("value");
      expect(tool?.inputSchema.required).toContain("ref");
      expect(tool?.inputSchema.required).toContain("value");
    });

    it("should have browser_select tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_select");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.properties).toHaveProperty("value");
      expect(tool?.inputSchema.properties).toHaveProperty("by");
    });

    it("should have browser_scroll tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_scroll");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("direction");
      expect(tool?.inputSchema.properties).toHaveProperty("amount");
      expect(tool?.inputSchema.required).toContain("direction");
    });

    it("should have browser_scroll_into_view tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_scroll_into_view");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.required).toContain("ref");
    });

    it("should have browser_hover tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_hover");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("ref");
      expect(tool?.inputSchema.required).toContain("ref");
    });
  });

  describe("find tool", () => {
    it("should have browser_find tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_find");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("strategy");
      expect(tool?.inputSchema.properties).toHaveProperty("value");
      expect(tool?.inputSchema.properties).toHaveProperty("name");
      expect(tool?.inputSchema.properties).toHaveProperty("visible");
      expect(tool?.inputSchema.required).toContain("strategy");
      expect(tool?.inputSchema.required).toContain("value");
    });

    it("should support multiple find strategies", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_find");
      const strategyProp = tool?.inputSchema.properties.strategy;
      expect(strategyProp?.enum).toContain("selector");
      expect(strategyProp?.enum).toContain("text");
      expect(strategyProp?.enum).toContain("role");
      expect(strategyProp?.enum).toContain("label");
      expect(strategyProp?.enum).toContain("placeholder");
      expect(strategyProp?.enum).toContain("testId");
    });
  });

  describe("screenshot tool", () => {
    it("should have browser_screenshot tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_screenshot");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("fullPage");
      expect(tool?.inputSchema.properties).toHaveProperty("selector");
      expect(tool?.inputSchema.properties).toHaveProperty("name");
    });
  });

  describe("javascript execution tool", () => {
    it("should have browser_evaluate tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_evaluate");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("script");
      expect(tool?.inputSchema.required).toContain("script");
    });
  });

  describe("wait tool", () => {
    it("should have browser_wait tool", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_wait");
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty("condition");
      expect(tool?.inputSchema.properties).toHaveProperty("value");
      expect(tool?.inputSchema.properties).toHaveProperty("timeout");
      expect(tool?.inputSchema.required).toContain("condition");
    });

    it("should support multiple wait conditions", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "browser_wait");
      const conditionProp = tool?.inputSchema.properties.condition;
      expect(conditionProp?.enum).toContain("selector");
      expect(conditionProp?.enum).toContain("text");
      expect(conditionProp?.enum).toContain("visible");
      expect(conditionProp?.enum).toContain("hidden");
      expect(conditionProp?.enum).toContain("navigation");
      expect(conditionProp?.enum).toContain("networkIdle");
    });
  });

  describe("tool naming convention", () => {
    it("should have all tool names starting with browser_", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.name).toMatch(/^browser_/);
      }
    });

    it("should have unique tool names", () => {
      const names = MCP_TOOLS.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
