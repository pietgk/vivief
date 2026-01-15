/**
 * Tests for MCP Handler Input Validation and Error Handling
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserMCPServer } from "../src/server.js";

// Mock the browser-core module
vi.mock("@pietgk/browser-core", () => {
  const mockPageContext = {
    getPlaywrightPage: vi.fn().mockReturnValue({
      evaluate: vi.fn().mockResolvedValue({}),
      keyboard: { press: vi.fn() },
      mouse: { wheel: vi.fn() },
      waitForSelector: vi.fn(),
      waitForNavigation: vi.fn(),
      waitForLoadState: vi.fn(),
    }),
    getLocator: vi.fn().mockReturnValue({
      click: vi.fn(),
      textContent: vi.fn().mockResolvedValue("text"),
      inputValue: vi.fn().mockResolvedValue("value"),
    }),
    navigate: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    url: vi.fn().mockReturnValue("https://example.com"),
    title: vi.fn().mockResolvedValue("Test Page"),
  };

  const mockSession = {
    id: "test-session-id",
    getCurrentPage: vi.fn().mockReturnValue(mockPageContext),
  };

  return {
    SessionManager: {
      getInstance: vi.fn().mockReturnValue({
        createSession: vi.fn().mockResolvedValue(mockSession),
        closeSession: vi.fn(),
        getCurrentSession: vi.fn().mockReturnValue(mockSession),
        listSessions: vi.fn().mockReturnValue([]),
        closeAll: vi.fn(),
      }),
    },
    PageReader: vi.fn().mockImplementation(() => ({
      readPage: vi.fn().mockResolvedValue({
        url: "https://example.com",
        title: "Test",
        elements: [],
        refVersion: 1,
        timestamp: Date.now(),
      }),
    })),
    ElementFinder: vi.fn().mockImplementation(() => ({
      byRef: vi.fn().mockResolvedValue({ count: 1, elements: [{ ref: "test" }] }),
      bySelector: vi.fn().mockResolvedValue({ count: 0, elements: [] }),
      byText: vi.fn().mockResolvedValue({ count: 0, elements: [] }),
      byRole: vi.fn().mockResolvedValue({ count: 0, elements: [] }),
      byLabel: vi.fn().mockResolvedValue({ count: 0, elements: [] }),
      byPlaceholder: vi.fn().mockResolvedValue({ count: 0, elements: [] }),
      byTestId: vi.fn().mockResolvedValue({ count: 0, elements: [] }),
    })),
    ScreenshotManager: vi.fn().mockImplementation(() => ({
      capture: vi.fn().mockResolvedValue({
        path: "/tmp/screenshot.png",
        width: 1280,
        height: 720,
      }),
    })),
    click: vi.fn().mockResolvedValue({ success: true, ref: "test" }),
    typeText: vi.fn().mockResolvedValue({ success: true, ref: "test", text: "text" }),
    fill: vi.fn().mockResolvedValue({ success: true, ref: "test", value: "value" }),
    select: vi.fn().mockResolvedValue({ success: true, ref: "test", selectedValues: [] }),
    scroll: vi.fn().mockResolvedValue({ success: true, direction: "down", amount: 500 }),
    scrollIntoView: vi.fn().mockResolvedValue({ success: true, ref: "test" }),
    hover: vi.fn().mockResolvedValue({ success: true, ref: "test" }),
  };
});

// Mock MCP SDK
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  ListToolsRequestSchema: "list_tools",
  CallToolRequestSchema: "call_tool",
}));

describe("BrowserMCPServer Input Validation", () => {
  let server: BrowserMCPServer;
  let executeToolMethod: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string; data?: unknown }>;

  beforeEach(() => {
    server = new BrowserMCPServer();
    // Access the private executeTool method for testing
    executeToolMethod = (
      server as unknown as {
        executeTool: (
          name: string,
          args: Record<string, unknown>
        ) => Promise<{ success: boolean; error?: string; data?: unknown }>;
      }
    ).executeTool.bind(server);
  });

  describe("ref parameter validation", () => {
    const toolsRequiringRef = [
      "browser_click",
      "browser_type",
      "browser_fill",
      "browser_select",
      "browser_scroll_into_view",
      "browser_hover",
      "browser_get_text",
      "browser_get_value",
    ];

    for (const tool of toolsRequiringRef) {
      it(`${tool} fails when ref is missing`, async () => {
        const result = await executeToolMethod(tool, {});
        expect(result.success).toBe(false);
        expect(result.error).toContain("ref");
      });

      it(`${tool} fails when ref is empty string`, async () => {
        const result = await executeToolMethod(tool, { ref: "" });
        expect(result.success).toBe(false);
        expect(result.error).toContain("empty");
      });

      it(`${tool} fails when ref is not a string`, async () => {
        const result = await executeToolMethod(tool, { ref: 123 });
        expect(result.success).toBe(false);
        expect(result.error).toContain("string");
      });
    }
  });

  describe("url parameter validation", () => {
    it("browser_navigate fails when url is missing", async () => {
      const result = await executeToolMethod("browser_navigate", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("url");
    });

    it("browser_navigate fails when url is invalid", async () => {
      const result = await executeToolMethod("browser_navigate", { url: "not-a-url" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid URL");
    });

    it("browser_navigate accepts valid url", async () => {
      const result = await executeToolMethod("browser_navigate", { url: "https://example.com" });
      expect(result.success).toBe(true);
    });
  });

  describe("text parameter validation", () => {
    it("browser_type fails when text is missing", async () => {
      const result = await executeToolMethod("browser_type", { ref: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("text");
    });

    it("browser_type fails when text is empty", async () => {
      const result = await executeToolMethod("browser_type", { ref: "test", text: "" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
    });
  });

  describe("value parameter validation", () => {
    it("browser_fill fails when value is missing", async () => {
      const result = await executeToolMethod("browser_fill", { ref: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("value");
    });

    it("browser_select fails when value is missing", async () => {
      const result = await executeToolMethod("browser_select", { ref: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("value");
    });
  });

  describe("direction parameter validation", () => {
    it("browser_scroll fails when direction is missing", async () => {
      const result = await executeToolMethod("browser_scroll", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("direction");
    });

    it("browser_scroll fails when direction is invalid", async () => {
      const result = await executeToolMethod("browser_scroll", { direction: "diagonal" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid scroll direction");
    });

    it("browser_scroll accepts valid directions", async () => {
      for (const direction of ["up", "down", "left", "right"]) {
        const result = await executeToolMethod("browser_scroll", { direction });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("script parameter validation", () => {
    it("browser_evaluate fails when script is missing", async () => {
      const result = await executeToolMethod("browser_evaluate", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("script");
    });

    it("browser_evaluate fails when script is empty", async () => {
      const result = await executeToolMethod("browser_evaluate", { script: "" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
    });
  });

  describe("find tool validation", () => {
    it("browser_find fails when strategy is missing", async () => {
      const result = await executeToolMethod("browser_find", { value: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("strategy");
    });

    it("browser_find fails when value is missing", async () => {
      const result = await executeToolMethod("browser_find", { strategy: "selector" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("value");
    });

    it("browser_find fails for unknown strategy", async () => {
      const result = await executeToolMethod("browser_find", {
        strategy: "unknown",
        value: "test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown find strategy");
    });
  });

  describe("wait tool validation", () => {
    it("browser_wait requires value for selector condition", async () => {
      const result = await executeToolMethod("browser_wait", { condition: "selector" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Selector value required");
    });

    it("browser_wait requires value for text condition", async () => {
      const result = await executeToolMethod("browser_wait", { condition: "text" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Text value required");
    });

    it("browser_wait requires value for visible condition", async () => {
      const result = await executeToolMethod("browser_wait", { condition: "visible" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Value required");
    });

    it("browser_wait requires value for hidden condition", async () => {
      const result = await executeToolMethod("browser_wait", { condition: "hidden" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Value required");
    });

    it("browser_wait fails for unknown condition", async () => {
      const result = await executeToolMethod("browser_wait", { condition: "unknown" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown wait condition");
    });
  });

  describe("unknown tool handling", () => {
    it("returns error for unknown tool", async () => {
      const result = await executeToolMethod("unknown_tool", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });
  });
});

describe("BrowserMCPServer Session Management", () => {
  let server: BrowserMCPServer;
  let executeToolMethod: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string; data?: unknown }>;

  beforeEach(() => {
    server = new BrowserMCPServer();
    executeToolMethod = (
      server as unknown as {
        executeTool: (
          name: string,
          args: Record<string, unknown>
        ) => Promise<{ success: boolean; error?: string; data?: unknown }>;
      }
    ).executeTool.bind(server);
  });

  it("browser_session_start creates a new session", async () => {
    const result = await executeToolMethod("browser_session_start", {});
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("sessionId");
  });

  it("browser_session_start accepts headless option", async () => {
    const result = await executeToolMethod("browser_session_start", { headless: false });
    expect(result.success).toBe(true);
  });

  it("browser_session_list returns sessions", async () => {
    const result = await executeToolMethod("browser_session_list", {});
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("sessions");
    expect(result.data).toHaveProperty("count");
  });
});
