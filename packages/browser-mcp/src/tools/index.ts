/**
 * Browser MCP Tool Definitions
 */

import type { MCPTool } from "../types.js";

/**
 * All available browser MCP tools
 */
export const MCP_TOOLS: MCPTool[] = [
  // ================== Session Management ==================
  {
    name: "browser_session_start",
    description: "Start a new browser session. Returns session ID.",
    inputSchema: {
      type: "object",
      properties: {
        headless: {
          type: "boolean",
          description: "Run browser in headless mode (default: true)",
        },
        viewport: {
          type: "object",
          description: "Viewport dimensions { width, height }",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_session_stop",
    description: "Stop a browser session. If no sessionId provided, stops the current session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to stop (optional, defaults to current session)",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_session_list",
    description: "List all active browser sessions.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ================== Navigation ==================
  {
    name: "browser_navigate",
    description: "Navigate to a URL in the current browser session.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to",
        },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle", "commit"],
          description: "When to consider navigation complete (default: load)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_reload",
    description: "Reload the current page.",
    inputSchema: {
      type: "object",
      properties: {
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle", "commit"],
          description: "When to consider reload complete (default: load)",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_back",
    description: "Go back in browser history.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser_forward",
    description: "Go forward in browser history.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // ================== Page Reading ==================
  {
    name: "browser_read_page",
    description:
      "Read the current page and return element refs. Use refs for subsequent actions (click, type, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to scope reading (default: body)",
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden elements (default: false)",
        },
        interactiveOnly: {
          type: "boolean",
          description: "Only include interactive elements (default: false)",
        },
        maxElements: {
          type: "number",
          description: "Maximum elements to return (default: 1000)",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_get_text",
    description: "Get the text content of an element by ref.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref from browser_read_page",
        },
      },
      required: ["ref"],
    },
  },
  {
    name: "browser_get_value",
    description: "Get the input value of a form element by ref.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref from browser_read_page",
        },
      },
      required: ["ref"],
    },
  },
  // ================== Actions ==================
  {
    name: "browser_click",
    description: "Click an element by ref.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref from browser_read_page",
        },
        button: {
          type: "string",
          enum: ["left", "right", "middle"],
          description: "Mouse button (default: left)",
        },
      },
      required: ["ref"],
    },
  },
  {
    name: "browser_type",
    description:
      "Type text into an element. Simulates actual key presses. Use for inputs with custom handlers.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref from browser_read_page",
        },
        text: {
          type: "string",
          description: "Text to type",
        },
        delay: {
          type: "number",
          description: "Delay between keystrokes in ms (default: 0)",
        },
        clear: {
          type: "boolean",
          description: "Clear existing content first (default: false)",
        },
      },
      required: ["ref", "text"],
    },
  },
  {
    name: "browser_fill",
    description:
      "Fill an input field with a value. Clears existing content first. Faster than type.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref from browser_read_page",
        },
        value: {
          type: "string",
          description: "Value to fill",
        },
      },
      required: ["ref", "value"],
    },
  },
  {
    name: "browser_select",
    description: "Select an option from a dropdown.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref of the select element",
        },
        value: {
          type: "string",
          description: "Value, label, or index to select",
        },
        by: {
          type: "string",
          enum: ["value", "label", "index"],
          description: "How to match the option (default: value)",
        },
      },
      required: ["ref", "value"],
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page in a direction.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Scroll direction",
        },
        amount: {
          type: "number",
          description: "Scroll amount in pixels (default: 500)",
        },
        ref: {
          type: "string",
          description: "Optional: Element ref to scroll instead of page",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "browser_hover",
    description: "Hover over an element by ref.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element ref from browser_read_page",
        },
      },
      required: ["ref"],
    },
  },
  // ================== Find Elements ==================
  {
    name: "browser_find",
    description: "Find elements using various strategies (selector, text, role, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        strategy: {
          type: "string",
          enum: ["selector", "text", "role", "label", "placeholder", "testId"],
          description: "Find strategy",
        },
        value: {
          type: "string",
          description: "Search value",
        },
        name: {
          type: "string",
          description: "For role strategy: accessible name filter",
        },
        visible: {
          type: "boolean",
          description: "Only find visible elements (default: true)",
        },
      },
      required: ["strategy", "value"],
    },
  },
  // ================== Screenshot ==================
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page. Returns file path.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description: "Capture full scrollable page (default: false)",
        },
        selector: {
          type: "string",
          description: "CSS selector to capture specific element",
        },
        name: {
          type: "string",
          description: "Custom filename (without extension)",
        },
      },
      required: [],
    },
  },
  // ================== JavaScript Execution ==================
  {
    name: "browser_evaluate",
    description: "Execute JavaScript in the page context. Returns the result.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "JavaScript code to execute",
        },
      },
      required: ["script"],
    },
  },
  // ================== Wait ==================
  {
    name: "browser_wait",
    description: "Wait for a condition before proceeding.",
    inputSchema: {
      type: "object",
      properties: {
        condition: {
          type: "string",
          enum: ["selector", "text", "visible", "hidden", "navigation", "networkIdle"],
          description: "Type of condition to wait for",
        },
        value: {
          type: "string",
          description: "Selector, text, or ref depending on condition",
        },
        timeout: {
          type: "number",
          description: "Maximum wait time in ms (default: 30000)",
        },
      },
      required: ["condition"],
    },
  },
];

export { MCP_TOOLS as default };
