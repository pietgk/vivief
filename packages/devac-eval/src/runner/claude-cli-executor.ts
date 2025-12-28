/**
 * Claude CLI Executor - handles LLM calls via Claude CLI subprocess
 * Replaces the Anthropic SDK-based LLMExecutor to work with Claude Max subscription
 */

import { spawn } from "node:child_process";
import type { EvalMode, EvalQuestion, EvalResponse, ToolUsage } from "../types.js";

export interface ClaudeCLIOptions {
  /** Allow MCP tools (true for enhanced mode, false for baseline) */
  allowTools?: boolean;
  /** Custom MCP config path (optional) */
  mcpConfigPath?: string;
  /** Model to use (e.g., 'sonnet', 'haiku', 'opus') - defaults to CLI default */
  model?: string;
  /** Working directory for Claude CLI - defaults to HOME/ws for proper context access */
  workDir?: string;
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

interface ClaudeCLIJsonOutput {
  type: "result";
  subtype: "success" | "error_max_turns" | "error_during_execution";
  result: string;
  cost_usd: number;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  session_id: string;
  total_cost_usd: number;
}

/**
 * Execute LLM queries via Claude CLI subprocess
 */
export class ClaudeCLIExecutor {
  /**
   * Execute a baseline query (no tools)
   */
  async executeBaseline(question: EvalQuestion, model?: string): Promise<ExecutorResult> {
    const systemPrompt = this.buildSystemPrompt(question, "baseline");

    return this.execute(question.question, systemPrompt, {
      allowTools: false,
      model,
    });
  }

  /**
   * Execute an enhanced query (with MCP tools)
   */
  async executeEnhanced(question: EvalQuestion, model?: string): Promise<ExecutorResult> {
    const systemPrompt = this.buildSystemPrompt(question, "enhanced");

    return this.execute(question.question, systemPrompt, {
      allowTools: true,
      model,
    });
  }

  /**
   * Execute a query via Claude CLI
   */
  async execute(
    prompt: string,
    systemPrompt?: string,
    options?: ClaudeCLIOptions
  ): Promise<ExecutorResult> {
    const args = ["-p", prompt, "--output-format", "json"];

    if (systemPrompt) {
      args.push("--append-system-prompt", systemPrompt);
    }

    if (options?.allowTools === false) {
      args.push("--allowedTools", "");
    }

    if (options?.mcpConfigPath) {
      args.push("--mcp-config", options.mcpConfigPath);
    }

    if (options?.model) {
      args.push("--model", options.model);
    }

    // Note: Claude CLI doesn't support --max-tokens, it uses the model's default

    const startTime = Date.now();
    // Use HOME/ws for proper directory access, or specified workDir
    const workDir = options?.workDir ?? `${process.env.HOME}/ws`;
    const result = await this.spawnClaude(args, workDir);
    const latencyMs = Date.now() - startTime;

    // Parse JSON output
    const parsed = this.parseClaudeOutput(result.stdout);

    // Estimate tokens from response length (Claude CLI doesn't provide exact counts)
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(parsed.result.length / 4);

    return {
      response: parsed.result,
      metadata: {
        model: "claude-cli",
        timestamp: new Date().toISOString(),
        latencyMs,
        totalTokens: estimatedInputTokens + estimatedOutputTokens,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
      },
      // Note: Tool usage tracking not available via CLI - Claude handles tools internally
    };
  }

  /**
   * Parse Claude CLI JSON output
   */
  private parseClaudeOutput(stdout: string): ClaudeCLIJsonOutput {
    try {
      // Claude CLI with --output-format json may output multiple JSON lines
      // We want the final result line
      const lines = stdout.trim().split("\n");

      for (let i = lines.length - 1; i >= 0; i--) {
        const lineContent = lines[i];
        if (!lineContent) continue;
        const line = lineContent.trim();
        if (line.startsWith("{")) {
          const parsed = JSON.parse(line) as ClaudeCLIJsonOutput;
          if (parsed.type === "result") {
            return parsed;
          }
        }
      }

      // Fallback: try parsing entire stdout
      return JSON.parse(stdout) as ClaudeCLIJsonOutput;
    } catch {
      // If JSON parsing fails, return the raw output as result
      return {
        type: "result",
        subtype: "success",
        result: stdout,
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      };
    }
  }

  /**
   * Spawn Claude CLI as subprocess
   * @param args - CLI arguments
   * @param workDir - Working directory for Claude CLI (~/ws for proper context access)
   */
  private spawnClaude(
    args: string[],
    workDir: string
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn("claude", args, {
        // Use "ignore" for stdin since we pass prompt via -p flag
        // Using "pipe" without closing can cause Claude CLI to wait indefinitely
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        // Use ~/ws for proper directory access across repos
        cwd: workDir,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
        }
      });
    });
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
