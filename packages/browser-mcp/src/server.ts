/**
 * Browser MCP Server
 *
 * MCP server that exposes browser automation tools using @pietgk/browser-core
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  type ClickOptions,
  ElementFinder,
  type PageContext,
  PageReader,
  type ReadPageOptions,
  ScreenshotManager,
  type ScreenshotOptions,
  type ScrollOptions,
  type SessionConfig,
  SessionManager,
  type TypeOptions,
  click,
  fill,
  hover,
  scroll,
  scrollIntoView,
  select,
  type as typeText,
} from "@pietgk/browser-core";
import { MCP_TOOLS } from "./tools/index.js";
import type { MCPToolResult } from "./types.js";

/**
 * Browser MCP Server class
 */
export class BrowserMCPServer {
  private server: Server;
  private sessionManager: SessionManager;

  constructor() {
    this.server = new Server(
      {
        name: "browser-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sessionManager = SessionManager.getInstance();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: MCP_TOOLS,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await this.executeTool(name, args ?? {});

      // Transform internal MCPToolResult to SDK format
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result.data ?? { error: result.error }, null, 2),
          },
        ],
        isError: !result.success,
      };
    });
  }

  /**
   * Execute a tool by name with given arguments
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (name) {
        // ================== Session Management ==================
        case "browser_session_start":
          return await this.handleSessionStart(args);

        case "browser_session_stop":
          return await this.handleSessionStop(args);

        case "browser_session_list":
          return await this.handleSessionList();

        // ================== Navigation ==================
        case "browser_navigate":
          return await this.handleNavigate(args);

        case "browser_reload":
          return await this.handleReload(args);

        case "browser_back":
          return await this.handleBack();

        case "browser_forward":
          return await this.handleForward();

        // ================== Page Reading ==================
        case "browser_read_page":
          return await this.handleReadPage(args);

        case "browser_get_text":
          return await this.handleGetText(args);

        case "browser_get_value":
          return await this.handleGetValue(args);

        // ================== Actions ==================
        case "browser_click":
          return await this.handleClick(args);

        case "browser_type":
          return await this.handleType(args);

        case "browser_fill":
          return await this.handleFill(args);

        case "browser_select":
          return await this.handleSelect(args);

        case "browser_scroll":
          return await this.handleScroll(args);

        case "browser_hover":
          return await this.handleHover(args);

        // ================== Find Elements ==================
        case "browser_find":
          return await this.handleFind(args);

        // ================== Screenshot ==================
        case "browser_screenshot":
          return await this.handleScreenshot(args);

        // ================== JavaScript Execution ==================
        case "browser_evaluate":
          return await this.handleEvaluate(args);

        // ================== Wait ==================
        case "browser_wait":
          return await this.handleWait(args);

        default:
          return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ================== Session Management Handlers ==================

  private async handleSessionStart(args: Record<string, unknown>): Promise<MCPToolResult> {
    const config: SessionConfig = {
      headless: args.headless !== false,
      viewport: args.viewport as { width: number; height: number } | undefined,
    };

    const session = await this.sessionManager.createSession(config);
    return {
      success: true,
      data: {
        sessionId: session.id,
        message: `Browser session started: ${session.id}`,
      },
    };
  }

  private async handleSessionStop(args: Record<string, unknown>): Promise<MCPToolResult> {
    const sessionId = args.sessionId as string | undefined;

    if (sessionId) {
      await this.sessionManager.closeSession(sessionId);
    } else {
      const current = this.sessionManager.getCurrentSession();
      if (current) {
        await this.sessionManager.closeSession(current.id);
      } else {
        return { success: false, error: "No active session to stop" };
      }
    }

    return { success: true, data: { message: "Session stopped" } };
  }

  private async handleSessionList(): Promise<MCPToolResult> {
    const sessions = this.sessionManager.listSessions();
    const current = this.sessionManager.getCurrentSession();

    return {
      success: true,
      data: {
        sessions: sessions.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          currentUrl: s.currentUrl,
          headless: s.headless,
          isCurrent: s.id === current?.id,
        })),
        count: sessions.length,
      },
    };
  }

  // ================== Navigation Handlers ==================

  private async handleNavigate(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const url = args.url as string;
    const waitUntil = args.waitUntil as
      | "load"
      | "domcontentloaded"
      | "networkidle"
      | "commit"
      | undefined;

    await pageContext.navigate(url, { waitUntil });

    return {
      success: true,
      data: {
        url: pageContext.url(),
        title: await pageContext.title(),
      },
    };
  }

  private async handleReload(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const waitUntil = args.waitUntil as
      | "load"
      | "domcontentloaded"
      | "networkidle"
      | "commit"
      | undefined;

    await pageContext.reload({ waitUntil });

    return {
      success: true,
      data: {
        url: pageContext.url(),
        message: "Page reloaded",
      },
    };
  }

  private async handleBack(): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    await pageContext.goBack();

    return {
      success: true,
      data: {
        url: pageContext.url(),
        message: "Navigated back",
      },
    };
  }

  private async handleForward(): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    await pageContext.goForward();

    return {
      success: true,
      data: {
        url: pageContext.url(),
        message: "Navigated forward",
      },
    };
  }

  // ================== Page Reading Handlers ==================

  private async handleReadPage(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const reader = new PageReader(pageContext);

    const options: ReadPageOptions = {
      selector: args.selector as string | undefined,
      includeHidden: args.includeHidden as boolean | undefined,
      interactiveOnly: args.interactiveOnly as boolean | undefined,
      maxElements: args.maxElements as number | undefined,
    };

    const content = await reader.readPage(options);

    return {
      success: true,
      data: {
        url: content.url,
        title: content.title,
        elements: content.elements.map((el) => ({
          ref: el.ref,
          role: el.role,
          name: el.name,
          tag: el.tag,
          testId: el.testId,
          isInteractive: el.isInteractive,
          isVisible: el.isVisible,
        })),
        elementCount: content.elements.length,
        refVersion: content.refVersion,
      },
    };
  }

  private async handleGetText(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const finder = new ElementFinder(pageContext);
    const ref = args.ref as string;

    const result = await finder.byRef(ref);
    if (result.count === 0) {
      return { success: false, error: `Element not found: ${ref}` };
    }

    const firstElement = result.elements[0];
    if (!firstElement) {
      return { success: false, error: `Element not found: ${ref}` };
    }

    const locator = pageContext.getLocator(ref);
    const text = await locator.textContent();

    return {
      success: true,
      data: {
        ref,
        text: text ?? "",
      },
    };
  }

  private async handleGetValue(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const finder = new ElementFinder(pageContext);
    const ref = args.ref as string;

    const result = await finder.byRef(ref);
    if (result.count === 0) {
      return { success: false, error: `Element not found: ${ref}` };
    }

    const locator = pageContext.getLocator(ref);
    const value = await locator.inputValue();

    return {
      success: true,
      data: {
        ref,
        value,
      },
    };
  }

  // ================== Action Handlers ==================

  private async handleClick(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const ref = args.ref as string;
    const button = args.button as ClickOptions["button"];

    const result = await click(pageContext, ref, { button });

    if (!result.success) {
      return { success: false, error: result.error ?? "Click failed" };
    }

    return {
      success: true,
      data: {
        ref,
        message: `Clicked element: ${ref}`,
      },
    };
  }

  private async handleType(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const ref = args.ref as string;
    const text = args.text as string;
    const options: TypeOptions = {
      delay: args.delay as number | undefined,
      clear: args.clear as boolean | undefined,
    };

    const result = await typeText(pageContext, ref, text, options);

    if (!result.success) {
      return { success: false, error: result.error ?? "Type failed" };
    }

    return {
      success: true,
      data: {
        ref,
        message: `Typed text into element: ${ref}`,
      },
    };
  }

  private async handleFill(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const ref = args.ref as string;
    const value = args.value as string;

    const result = await fill(pageContext, ref, value);

    if (!result.success) {
      return { success: false, error: result.error ?? "Fill failed" };
    }

    return {
      success: true,
      data: {
        ref,
        message: `Filled element: ${ref}`,
      },
    };
  }

  private async handleSelect(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const ref = args.ref as string;
    const value = args.value as string;
    const by = (args.by as "value" | "label" | "index") ?? "value";

    const result = await select(pageContext, ref, value, { by });

    if (!result.success) {
      return { success: false, error: result.error ?? "Select failed" };
    }

    return {
      success: true,
      data: {
        ref,
        message: `Selected option in element: ${ref}`,
        selectedValues: result.selectedValues,
      },
    };
  }

  private async handleScroll(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const direction = args.direction as ScrollOptions["direction"];
    const amount = args.amount as number | undefined;
    const ref = args.ref as string | undefined;

    if (ref) {
      const result = await scrollIntoView(pageContext, ref);
      if (!result.success) {
        return { success: false, error: result.error ?? "Scroll failed" };
      }
      return {
        success: true,
        data: { message: `Scrolled element into view: ${ref}` },
      };
    }

    const result = await scroll(pageContext, { direction, amount });

    if (!result.success) {
      return { success: false, error: result.error ?? "Scroll failed" };
    }

    return {
      success: true,
      data: { message: `Scrolled page ${direction}` },
    };
  }

  private async handleHover(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const ref = args.ref as string;

    const result = await hover(pageContext, ref);

    if (!result.success) {
      return { success: false, error: result.error ?? "Hover failed" };
    }

    return {
      success: true,
      data: {
        ref,
        message: `Hovered over element: ${ref}`,
      },
    };
  }

  // ================== Find Elements Handler ==================

  private async handleFind(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const finder = new ElementFinder(pageContext);
    const strategy = args.strategy as string;
    const value = args.value as string;
    const name = args.name as string | undefined;
    const visible = args.visible !== false;

    let result: Awaited<ReturnType<typeof finder.bySelector>> | undefined;

    switch (strategy) {
      case "selector":
        result = await finder.bySelector(value);
        break;
      case "text":
        result = await finder.byText(value, { visible });
        break;
      case "role":
        // Cast role to any to allow string input - Playwright will validate
        result = await finder.byRole(value as Parameters<typeof finder.byRole>[0], {
          name,
          visible,
        });
        break;
      case "label":
        result = await finder.byLabel(value);
        break;
      case "placeholder":
        result = await finder.byPlaceholder(value);
        break;
      case "testId":
        result = await finder.byTestId(value);
        break;
      default:
        return { success: false, error: `Unknown find strategy: ${strategy}` };
    }

    if (!result || result.count === 0) {
      return {
        success: true,
        data: {
          found: false,
          elements: [],
          message: `No elements found with ${strategy}: ${value}`,
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        elements: result.elements.map((el) => ({
          ref: el.ref,
          role: el.role,
          name: el.name,
          tag: el.tag,
        })),
        count: result.count,
      },
    };
  }

  // ================== Screenshot Handler ==================

  private async handleScreenshot(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const session = this.sessionManager.getCurrentSession();

    if (!session) {
      return { success: false, error: "No active session" };
    }

    const screenshotManager = new ScreenshotManager(pageContext);

    const options: ScreenshotOptions = {
      fullPage: args.fullPage as boolean | undefined,
      selector: args.selector as string | undefined,
      name: args.name as string | undefined,
    };

    const result = await screenshotManager.capture(session.id, options);

    return {
      success: true,
      data: {
        path: result.path,
        width: result.width,
        height: result.height,
        message: `Screenshot saved: ${result.path}`,
      },
    };
  }

  // ================== JavaScript Execution Handler ==================

  private async handleEvaluate(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const script = args.script as string;

    const page = pageContext.getPlaywrightPage();
    const result = await page.evaluate(script);

    return {
      success: true,
      data: { result },
    };
  }

  // ================== Wait Handler ==================

  private async handleWait(args: Record<string, unknown>): Promise<MCPToolResult> {
    const pageContext = this.getCurrentPageContext();
    const condition = args.condition as string;
    const value = args.value as string | undefined;
    const timeout = (args.timeout as number) ?? 30000;

    const page = pageContext.getPlaywrightPage();

    switch (condition) {
      case "selector":
        if (!value) {
          return { success: false, error: "Selector value required for selector wait" };
        }
        await page.waitForSelector(value, { timeout });
        break;

      case "text":
        if (!value) {
          return { success: false, error: "Text value required for text wait" };
        }
        await page.waitForSelector(`text=${value}`, { timeout });
        break;

      case "visible":
        if (!value) {
          return { success: false, error: "Value required for visible wait" };
        }
        await page.waitForSelector(value, { state: "visible", timeout });
        break;

      case "hidden":
        if (!value) {
          return { success: false, error: "Value required for hidden wait" };
        }
        await page.waitForSelector(value, { state: "hidden", timeout });
        break;

      case "navigation":
        await page.waitForNavigation({ timeout });
        break;

      case "networkIdle":
        await page.waitForLoadState("networkidle", { timeout });
        break;

      default:
        return { success: false, error: `Unknown wait condition: ${condition}` };
    }

    return {
      success: true,
      data: {
        condition,
        message: `Wait condition satisfied: ${condition}`,
      },
    };
  }

  // ================== Helper Methods ==================

  private getCurrentPageContext(): PageContext {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error("No active browser session. Start a session with browser_session_start.");
    }
    const pageContext = session.getCurrentPage();
    if (!pageContext) {
      throw new Error("No active page in session.");
    }
    return pageContext;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Stop the MCP server and cleanup
   */
  async stop(): Promise<void> {
    await this.sessionManager.closeAll();
    await this.server.close();
  }
}
