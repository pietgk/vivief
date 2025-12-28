/**
 * Tests for Claude CLI Executor
 */

import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeCLIExecutor } from "../../src/runner/claude-cli-executor.js";
import type { EvalQuestion } from "../../src/types.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

describe("ClaudeCLIExecutor", () => {
  let executor: ClaudeCLIExecutor;

  beforeEach(() => {
    executor = new ClaudeCLIExecutor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("execute", () => {
    it("should build correct args for basic prompt", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Test response",
        cost_usd: 0.01,
        is_error: false,
        duration_ms: 1000,
        duration_api_ms: 900,
        num_turns: 1,
        session_id: "test-session",
        total_cost_usd: 0.01,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await executor.execute("What is this?");

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "What is this?", "--output-format", "json"],
        expect.objectContaining({
          stdio: ["ignore", "pipe", "pipe"],
          cwd: expect.stringContaining("/ws"),
        })
      );
    });

    it("should add system prompt when provided", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Test response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await executor.execute("Question?", "You are a helpful assistant.");

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        [
          "-p",
          "Question?",
          "--output-format",
          "json",
          "--append-system-prompt",
          "You are a helpful assistant.",
        ],
        expect.any(Object)
      );
    });

    it("should add --allowedTools empty string when allowTools is false", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Test response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await executor.execute("Question?", undefined, { allowTools: false });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "Question?", "--output-format", "json", "--allowedTools", ""],
        expect.any(Object)
      );
    });

    it("should add --model when model is provided", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Test response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await executor.execute("Question?", undefined, { model: "sonnet" });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "Question?", "--output-format", "json", "--model", "sonnet"],
        expect.any(Object)
      );
    });

    it("should NOT add --allowedTools when allowTools is true", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Test response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await executor.execute("Question?", undefined, { allowTools: true });

      const callArgs = mockSpawn.mock.calls[0][1];
      expect(callArgs).not.toContain("--allowedTools");
    });

    it("should add MCP config path when provided", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Test response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await executor.execute("Question?", undefined, {
        mcpConfigPath: "/path/to/mcp.json",
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "Question?", "--output-format", "json", "--mcp-config", "/path/to/mcp.json"],
        expect.any(Object)
      );
    });

    it("should parse JSON response correctly", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "The answer is 42.",
        cost_usd: 0.02,
        is_error: false,
        duration_ms: 1500,
        duration_api_ms: 1400,
        num_turns: 1,
        session_id: "session-123",
        total_cost_usd: 0.02,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const result = await executor.execute("What is the answer?");

      expect(result.response).toBe("The answer is 42.");
      expect(result.metadata.model).toBe("claude-cli");
      expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle multi-line JSON output (find last result)", async () => {
      const multiLineOutput = `{"type":"system","message":"Starting..."}
{"type":"assistant","content":"thinking..."}
{"type":"result","subtype":"success","result":"Final answer","cost_usd":0.01,"is_error":false,"duration_ms":100,"duration_api_ms":90,"num_turns":1,"session_id":"s1","total_cost_usd":0.01}`;

      const mockProcess = createMockProcessWithRawOutput(multiLineOutput);
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const result = await executor.execute("Question?");

      expect(result.response).toBe("Final answer");
    });

    it("should handle non-JSON output as fallback", async () => {
      const mockProcess = createMockProcessWithRawOutput("Plain text response");
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const result = await executor.execute("Question?");

      expect(result.response).toBe("Plain text response");
    });

    it("should reject when CLI exits with non-zero code", async () => {
      const mockProcess = createMockProcessWithError(1, "Error message");
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await expect(executor.execute("Question?")).rejects.toThrow("Claude CLI exited with code 1");
    });

    it("should reject when spawn fails", async () => {
      const mockProcess = createMockProcessWithSpawnError("ENOENT");
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      await expect(executor.execute("Question?")).rejects.toThrow("Failed to spawn Claude CLI");
    });
  });

  describe("executeBaseline", () => {
    it("should execute with allowTools: false", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Baseline response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const question: EvalQuestion = {
        id: "test-001",
        title: "Test Question",
        question: "How does X work?",
        category: "architecture",
        difficulty: "medium",
        expectedCoverage: ["topic1", "topic2"],
        groundTruth: [],
        tags: ["test"],
      };

      await executor.executeBaseline(question);

      const callArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(callArgs).toContain("--allowedTools");
      expect(callArgs[callArgs.indexOf("--allowedTools") + 1]).toBe("");
    });

    it("should include baseline-specific system prompt", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const question: EvalQuestion = {
        id: "test-001",
        title: "Test",
        question: "Question?",
        category: "implementation",
        difficulty: "easy",
        expectedCoverage: ["coverage"],
        groundTruth: [],
        tags: [],
      };

      await executor.executeBaseline(question);

      const callArgs = mockSpawn.mock.calls[0][1] as string[];
      const systemPromptIndex = callArgs.indexOf("--append-system-prompt");
      const systemPrompt = callArgs[systemPromptIndex + 1];

      expect(systemPrompt).toContain("general knowledge");
      expect(systemPrompt).not.toContain("DevAC code analysis tools");
    });
  });

  describe("executeEnhanced", () => {
    it("should execute without --allowedTools restriction", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Enhanced response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const question: EvalQuestion = {
        id: "test-001",
        title: "Test Question",
        question: "How does X work?",
        category: "architecture",
        difficulty: "medium",
        expectedCoverage: ["topic1"],
        groundTruth: [],
        tags: [],
      };

      await executor.executeEnhanced(question);

      const callArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(callArgs).not.toContain("--allowedTools");
    });

    it("should include enhanced-specific system prompt", async () => {
      const mockProcess = createMockProcess({
        type: "result",
        subtype: "success",
        result: "Response",
        cost_usd: 0,
        is_error: false,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 1,
        session_id: "",
        total_cost_usd: 0,
      });
      mockSpawn.mockReturnValue(mockProcess as ReturnType<typeof spawn>);

      const question: EvalQuestion = {
        id: "test-001",
        title: "Test",
        question: "Question?",
        category: "implementation",
        difficulty: "easy",
        expectedCoverage: ["coverage"],
        groundTruth: [],
        tags: [],
      };

      await executor.executeEnhanced(question);

      const callArgs = mockSpawn.mock.calls[0][1] as string[];
      const systemPromptIndex = callArgs.indexOf("--append-system-prompt");
      const systemPrompt = callArgs[systemPromptIndex + 1];

      expect(systemPrompt).toContain("DevAC code analysis tools");
      expect(systemPrompt).not.toContain("general knowledge");
    });
  });

  describe("toEvalResponse", () => {
    it("should convert executor result to eval response", () => {
      const result = {
        response: "Test response",
        metadata: {
          model: "claude-cli",
          timestamp: "2024-01-01T00:00:00.000Z",
          latencyMs: 1000,
          totalTokens: 100,
          inputTokens: 50,
          outputTokens: 50,
        },
      };

      const evalResponse = ClaudeCLIExecutor.toEvalResponse("q-001", "baseline", result);

      expect(evalResponse.questionId).toBe("q-001");
      expect(evalResponse.mode).toBe("baseline");
      expect(evalResponse.response).toBe("Test response");
      expect(evalResponse.metadata).toEqual(result.metadata);
    });
  });
});

// Helper functions to create mock processes
function createMockProcess(jsonOutput: object) {
  return createMockProcessWithRawOutput(JSON.stringify(jsonOutput));
}

function createMockProcessWithRawOutput(stdout: string) {
  const mockProcess = {
    stdout: {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(stdout)), 0);
        }
      }),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn((event: string, callback: (code: number | null) => void) => {
      if (event === "close") {
        setTimeout(() => callback(0), 10);
      }
    }),
  };
  return mockProcess;
}

function createMockProcessWithError(code: number, stderr: string) {
  const mockProcess = {
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(stderr)), 0);
        }
      }),
    },
    on: vi.fn((event: string, callback: (code: number | null) => void) => {
      if (event === "close") {
        setTimeout(() => callback(code), 10);
      }
    }),
  };
  return mockProcess;
}

function createMockProcessWithSpawnError(errorCode: string) {
  const mockProcess = {
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn((event: string, callback: (arg: number | null | Error) => void) => {
      if (event === "error") {
        const error = new Error("spawn claude ENOENT");
        (error as NodeJS.ErrnoException).code = errorCode;
        setTimeout(() => callback(error), 0);
      }
    }),
  };
  return mockProcess;
}
