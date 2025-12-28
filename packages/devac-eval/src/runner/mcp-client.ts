/**
 * MCP Client - connects to DevAC MCP server for enhanced mode evaluation
 */

import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { EvalQuestion } from "../types.js";
import { type ExecutorResult, LLMExecutor, type LLMExecutorOptions } from "./llm-executor.js";

export interface MCPClientOptions extends LLMExecutorOptions {
  /** Path to DevAC hub */
  hubPath: string;
  /** Path to devac-mcp executable (defaults to npx) */
  mcpExecutable?: string;
}

/**
 * MCP Client for DevAC-enhanced evaluations
 */
export class MCPClient {
  private executor: LLMExecutor;
  private hubPath: string;
  private mcpExecutable: string;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: Anthropic.Tool[] = [];

  constructor(options: MCPClientOptions) {
    this.executor = new LLMExecutor(options);
    this.hubPath = options.hubPath;
    this.mcpExecutable = options.mcpExecutable ?? "npx";
  }

  /**
   * Connect to the DevAC MCP server
   */
  async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.mcpExecutable,
      args:
        this.mcpExecutable === "npx"
          ? ["@pietgk/devac-mcp", "--hub", this.hubPath]
          : ["--hub", this.hubPath],
    });

    this.client = new Client(
      {
        name: "devac-eval",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);

    // Get available tools
    const toolsResponse = await this.client.listTools();
    this.tools = toolsResponse.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.inputSchema as Anthropic.Tool["input_schema"],
    }));
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * Get available tools
   */
  getTools(): Anthropic.Tool[] {
    return this.tools;
  }

  /**
   * Execute a tool call
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    // Extract text content from result
    if (Array.isArray(result.content)) {
      return result.content
        .filter((item): item is { type: "text"; text: string } => item.type === "text")
        .map((item) => item.text)
        .join("\n");
    }

    return JSON.stringify(result.content);
  }

  /**
   * Execute an enhanced query using MCP tools
   */
  async executeEnhanced(question: EvalQuestion): Promise<ExecutorResult> {
    if (!this.client) {
      await this.connect();
    }

    return this.executor.executeWithTools(question, this.tools, async (name, input) =>
      this.callTool(name, input)
    );
  }
}

/**
 * Create and connect an MCP client
 */
export async function createMCPClient(options: MCPClientOptions): Promise<MCPClient> {
  const client = new MCPClient(options);
  await client.connect();
  return client;
}
