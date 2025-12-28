/**
 * LLM Executor - handles LLM API calls for generating responses
 */

import Anthropic from "@anthropic-ai/sdk";
import type { EvalMode, EvalQuestion, EvalResponse, ToolUsage } from "../types.js";

export interface LLMExecutorOptions {
  /** Anthropic API key */
  apiKey?: string;
  /** Model to use for responses */
  model: string;
  /** Temperature for generation */
  temperature?: number;
  /** Max tokens for responses */
  maxTokens?: number;
}

export interface ExecutorResult {
  response: string;
  metadata: {
    model: string;
    timestamp: string;
    latencyMs: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  toolUsage?: ToolUsage[];
}

/**
 * Execute LLM queries for evaluation
 */
export class LLMExecutor {
  private client: Anthropic;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(options: LLMExecutorOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = options.model;
    this.temperature = options.temperature ?? 0.3;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  /**
   * Execute a baseline query (LLM only, no tools)
   */
  async executeBaseline(question: EvalQuestion): Promise<ExecutorResult> {
    const systemPrompt = this.buildSystemPrompt(question, "baseline");
    const startTime = Date.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: question.question,
        },
      ],
    });

    const latencyMs = Date.now() - startTime;
    const responseText = this.extractTextContent(response);

    return {
      response: responseText,
      metadata: {
        model: this.model,
        timestamp: new Date().toISOString(),
        latencyMs,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Execute an enhanced query with DevAC MCP tools
   * This is called by the MCPClient wrapper
   */
  async executeWithTools(
    question: EvalQuestion,
    tools: Anthropic.Tool[],
    handleToolCall: (name: string, input: Record<string, unknown>) => Promise<string>
  ): Promise<ExecutorResult> {
    const systemPrompt = this.buildSystemPrompt(question, "enhanced");
    const startTime = Date.now();
    const toolUsage: Map<string, ToolUsage> = new Map();

    let messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: question.question,
      },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    const maxIterations = 10;

    // Agentic loop - keep calling until no more tool use
    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        tools,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Check if we have tool calls
      const toolBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (toolBlocks.length === 0 || response.stop_reason === "end_turn") {
        // No more tool calls, extract final response
        const latencyMs = Date.now() - startTime;
        const responseText = this.extractTextContent(response);

        return {
          response: responseText,
          metadata: {
            model: this.model,
            timestamp: new Date().toISOString(),
            latencyMs,
            totalTokens: totalInputTokens + totalOutputTokens,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
          toolUsage: Array.from(toolUsage.values()),
        };
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolBlocks) {
        // Track tool usage
        const existing = toolUsage.get(toolBlock.name);
        if (existing) {
          existing.callCount++;
        } else {
          toolUsage.set(toolBlock.name, {
            toolName: toolBlock.name,
            callCount: 1,
            tokensUsed: 0,
          });
        }

        // Execute tool
        try {
          const result = await handleToolCall(
            toolBlock.name,
            toolBlock.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: result,
          });

          // Estimate tokens used by tool result
          const usage = toolUsage.get(toolBlock.name);
          if (usage) {
            usage.tokensUsed += Math.ceil(result.length / 4);
          }
        } catch (error) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            is_error: true,
          });
        }
      }

      // Add assistant response and tool results to messages
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    // Max iterations reached
    throw new Error(`Max iterations (${maxIterations}) reached without completion`);
  }

  /**
   * Build system prompt based on mode
   */
  private buildSystemPrompt(question: EvalQuestion, mode: EvalMode): string {
    const basePrompt = `You are a helpful assistant answering questions about a software codebase.

Question Category: ${question.category}
Difficulty: ${question.difficulty}

Answer the question thoroughly and accurately. Focus on:
${question.expectedCoverage.map((t) => `- ${t}`).join("\n")}

Provide specific details including file paths, function names, and code examples where relevant.`;

    if (mode === "enhanced") {
      return `${basePrompt}

You have access to DevAC code analysis tools. Use them to:
1. Find relevant symbols and their locations
2. Explore dependencies and dependents
3. Query the code graph for specific information
4. Get call graphs for functions

Always use the tools to ground your answer in the actual codebase.`;
    }

    return `${basePrompt}

Answer based on your general knowledge of software patterns and common implementations.
If you're unsure about specific implementation details, acknowledge the uncertainty.`;
  }

  /**
   * Extract text content from response
   */
  private extractTextContent(response: Anthropic.Message): string {
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    return textBlocks.map((block) => block.text).join("\n");
  }

  /**
   * Create an EvalResponse from executor result
   */
  static toEvalResponse(questionId: string, mode: EvalMode, result: ExecutorResult): EvalResponse {
    return {
      questionId,
      mode,
      response: result.response,
      metadata: result.metadata,
      toolUsage: result.toolUsage,
    };
  }
}
