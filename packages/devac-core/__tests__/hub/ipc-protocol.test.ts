/**
 * Tests for ipc-protocol.ts
 *
 * Tests the IPC protocol utilities for Hub communication.
 */

import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
  HUB_SOCKET_NAME,
  HubErrorCode,
  IPC_CONNECT_TIMEOUT_MS,
  IPC_TIMEOUT_MS,
  createErrorResponse,
  createSuccessResponse,
  getSocketPath,
  parseResponse,
  serializeRequest,
} from "../../src/hub/ipc-protocol.js";
import type { HubError, HubMethod, HubRequest, HubResponse } from "../../src/hub/ipc-protocol.js";

// =============================================================================
// Constants Tests
// =============================================================================

describe("Constants", () => {
  test("HUB_SOCKET_NAME is defined correctly", () => {
    expect(HUB_SOCKET_NAME).toBe("mcp.sock");
  });

  test("IPC_TIMEOUT_MS has reasonable default", () => {
    expect(IPC_TIMEOUT_MS).toBe(30_000);
    expect(IPC_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test("IPC_CONNECT_TIMEOUT_MS has reasonable default", () => {
    expect(IPC_CONNECT_TIMEOUT_MS).toBe(100);
    expect(IPC_CONNECT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(IPC_CONNECT_TIMEOUT_MS).toBeLessThan(IPC_TIMEOUT_MS);
  });
});

// =============================================================================
// HubErrorCode Tests
// =============================================================================

describe("HubErrorCode", () => {
  test("METHOD_NOT_FOUND is standard JSON-RPC code", () => {
    expect(HubErrorCode.METHOD_NOT_FOUND).toBe(-32601);
  });

  test("INVALID_PARAMS is standard JSON-RPC code", () => {
    expect(HubErrorCode.INVALID_PARAMS).toBe(-32602);
  });

  test("INTERNAL_ERROR is standard JSON-RPC code", () => {
    expect(HubErrorCode.INTERNAL_ERROR).toBe(-32603);
  });

  test("HUB_NOT_READY is custom code", () => {
    expect(HubErrorCode.HUB_NOT_READY).toBe(-32000);
  });

  test("OPERATION_FAILED is custom code", () => {
    expect(HubErrorCode.OPERATION_FAILED).toBe(-32001);
  });

  test("all codes are negative numbers", () => {
    for (const code of Object.values(HubErrorCode)) {
      expect(code).toBeLessThan(0);
    }
  });
});

// =============================================================================
// getSocketPath Tests
// =============================================================================

describe("getSocketPath", () => {
  test("returns socket path within hub directory", () => {
    const hubDir = "/home/user/.devac/hub";
    const socketPath = getSocketPath(hubDir);

    expect(socketPath).toBe(path.join(hubDir, HUB_SOCKET_NAME));
    expect(socketPath).toBe("/home/user/.devac/hub/mcp.sock");
  });

  test("works with relative paths", () => {
    const hubDir = "./hub";
    const socketPath = getSocketPath(hubDir);

    expect(socketPath).toBe(path.join("hub", HUB_SOCKET_NAME));
  });

  test("works with root path", () => {
    const hubDir = "/";
    const socketPath = getSocketPath(hubDir);

    expect(socketPath).toBe("/mcp.sock");
  });

  test("handles trailing slash", () => {
    const hubDir = "/home/user/.devac/hub/";
    const socketPath = getSocketPath(hubDir);

    // path.join normalizes the trailing slash
    expect(socketPath).toBe("/home/user/.devac/hub/mcp.sock");
  });

  test("works with Windows-style paths", () => {
    const hubDir = "C:\\Users\\user\\.devac\\hub";
    const socketPath = getSocketPath(hubDir);

    expect(socketPath).toContain(HUB_SOCKET_NAME);
  });
});

// =============================================================================
// serializeRequest Tests
// =============================================================================

describe("serializeRequest", () => {
  test("serializes request to JSON with newline", () => {
    const request: HubRequest = {
      id: "test-123",
      method: "query",
      params: { sql: "SELECT * FROM nodes" },
    };

    const serialized = serializeRequest(request);

    expect(serialized).toContain('"id":"test-123"');
    expect(serialized).toContain('"method":"query"');
    expect(serialized).toContain('"params":');
    expect(serialized.endsWith("\n")).toBe(true);
  });

  test("serializes request with empty params", () => {
    const request: HubRequest = {
      id: "req-1",
      method: "listRepos",
      params: {},
    };

    const serialized = serializeRequest(request);
    const parsed = JSON.parse(serialized.trim());

    expect(parsed.id).toBe("req-1");
    expect(parsed.method).toBe("listRepos");
    expect(parsed.params).toEqual({});
  });

  test("serializes request with null params", () => {
    const request: HubRequest = {
      id: "req-2",
      method: "refreshAll",
      params: null,
    };

    const serialized = serializeRequest(request);
    const parsed = JSON.parse(serialized.trim());

    expect(parsed.params).toBeNull();
  });

  test("serializes request with complex params", () => {
    const request: HubRequest = {
      id: "req-complex",
      method: "pushDiagnostics",
      params: {
        repoId: "github.com/org/repo",
        diagnostics: [
          { file: "src/index.ts", line: 10, message: "Error" },
          { file: "src/utils.ts", line: 20, message: "Warning" },
        ],
        nested: { deep: { value: 42 } },
      },
    };

    const serialized = serializeRequest(request);
    const parsed = JSON.parse(serialized.trim());

    expect(parsed.params.repoId).toBe("github.com/org/repo");
    expect(parsed.params.diagnostics).toHaveLength(2);
    expect(parsed.params.nested.deep.value).toBe(42);
  });

  test("handles special characters in params", () => {
    const request: HubRequest = {
      id: "req-special",
      method: "query",
      params: {
        sql: 'SELECT * FROM nodes WHERE name = "test\nvalue"',
        unicode: "日本語テスト",
      },
    };

    const serialized = serializeRequest(request);
    const parsed = JSON.parse(serialized.trim());

    expect(parsed.params.sql).toContain("test\nvalue");
    expect(parsed.params.unicode).toBe("日本語テスト");
  });

  test("serializes all hub methods", () => {
    const methods: HubMethod[] = [
      "register",
      "unregister",
      "refresh",
      "refreshAll",
      "pushDiagnostics",
      "clearDiagnostics",
      "resolveDiagnostics",
      "pushValidationErrors",
      "query",
      "listRepos",
      "getRepoStatus",
      "getValidationErrors",
      "getValidationSummary",
      "getValidationCounts",
      "getDiagnostics",
      "getDiagnosticsSummary",
      "getDiagnosticsCounts",
    ];

    for (const method of methods) {
      const request: HubRequest = { id: `${method}-test`, method, params: {} };
      const serialized = serializeRequest(request);
      const parsed = JSON.parse(serialized.trim());

      expect(parsed.method).toBe(method);
    }
  });
});

// =============================================================================
// parseResponse Tests
// =============================================================================

describe("parseResponse", () => {
  test("parses success response", () => {
    const data = '{"id":"test-123","result":{"count":42}}';

    const response = parseResponse<{ count: number }>(data);

    expect(response.id).toBe("test-123");
    expect(response.result).toEqual({ count: 42 });
    expect(response.error).toBeUndefined();
  });

  test("parses error response", () => {
    const data = '{"id":"test-456","error":{"code":-32601,"message":"Method not found"}}';

    const response = parseResponse(data);

    expect(response.id).toBe("test-456");
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32601);
    expect(response.error?.message).toBe("Method not found");
  });

  test("handles whitespace in data", () => {
    const data = '  {"id":"test","result":"ok"}  \n';

    const response = parseResponse(data);

    expect(response.id).toBe("test");
    expect(response.result).toBe("ok");
  });

  test("parses response with complex result", () => {
    const data = JSON.stringify({
      id: "complex-result",
      result: {
        repos: [
          { id: "repo1", status: "active" },
          { id: "repo2", status: "stale" },
        ],
        total: 2,
      },
    });

    const response = parseResponse<{
      repos: Array<{ id: string; status: string }>;
      total: number;
    }>(data);

    expect(response.result?.repos).toHaveLength(2);
    expect(response.result?.total).toBe(2);
  });

  test("parses response with error data", () => {
    const data = JSON.stringify({
      id: "error-with-data",
      error: {
        code: HubErrorCode.OPERATION_FAILED,
        message: "Validation failed",
        data: { fields: ["email", "name"] },
      },
    });

    const response = parseResponse(data);

    expect(response.error?.code).toBe(HubErrorCode.OPERATION_FAILED);
    expect(response.error?.data).toEqual({ fields: ["email", "name"] });
  });

  test("throws on invalid JSON", () => {
    const data = "not valid json";

    expect(() => parseResponse(data)).toThrow();
  });

  test("handles null result", () => {
    const data = '{"id":"null-result","result":null}';

    const response = parseResponse(data);

    expect(response.id).toBe("null-result");
    expect(response.result).toBeNull();
  });

  test("handles array result", () => {
    const data = '{"id":"array-result","result":[1,2,3]}';

    const response = parseResponse<number[]>(data);

    expect(response.result).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// createErrorResponse Tests
// =============================================================================

describe("createErrorResponse", () => {
  test("creates error response with code and message", () => {
    const response = createErrorResponse(
      "req-123",
      HubErrorCode.METHOD_NOT_FOUND,
      "Unknown method"
    );

    expect(response.id).toBe("req-123");
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(HubErrorCode.METHOD_NOT_FOUND);
    expect(response.error?.message).toBe("Unknown method");
    expect(response.error?.data).toBeUndefined();
  });

  test("creates error response with data", () => {
    const response = createErrorResponse(
      "req-456",
      HubErrorCode.INVALID_PARAMS,
      "Missing required field",
      { field: "repoId" }
    );

    expect(response.id).toBe("req-456");
    expect(response.error?.code).toBe(HubErrorCode.INVALID_PARAMS);
    expect(response.error?.message).toBe("Missing required field");
    expect(response.error?.data).toEqual({ field: "repoId" });
  });

  test("creates error response for all error codes", () => {
    for (const [name, code] of Object.entries(HubErrorCode)) {
      const response = createErrorResponse("test", code, `Error: ${name}`);

      expect(response.error?.code).toBe(code);
    }
  });

  test("handles complex error data", () => {
    const errorData = {
      stack: "Error at line 1\n  at function2\n  at function3",
      context: { user: "test", action: "register" },
    };

    const response = createErrorResponse(
      "complex-error",
      HubErrorCode.INTERNAL_ERROR,
      "Internal error occurred",
      errorData
    );

    expect(response.error?.data).toEqual(errorData);
  });
});

// =============================================================================
// createSuccessResponse Tests
// =============================================================================

describe("createSuccessResponse", () => {
  test("creates success response with result", () => {
    const response = createSuccessResponse("req-789", { status: "ok" });

    expect(response.id).toBe("req-789");
    expect(response.result).toEqual({ status: "ok" });
    expect(response.error).toBeUndefined();
  });

  test("creates success response with null result", () => {
    const response = createSuccessResponse("null-test", null);

    expect(response.id).toBe("null-test");
    expect(response.result).toBeNull();
  });

  test("creates success response with array result", () => {
    const repos = [
      { id: "repo1", path: "/path/to/repo1" },
      { id: "repo2", path: "/path/to/repo2" },
    ];

    const response = createSuccessResponse("list-repos", repos);

    expect(response.result).toEqual(repos);
    expect(response.result).toHaveLength(2);
  });

  test("creates success response with primitive result", () => {
    const numberResponse = createSuccessResponse("count", 42);
    expect(numberResponse.result).toBe(42);

    const stringResponse = createSuccessResponse("name", "test");
    expect(stringResponse.result).toBe("test");

    const boolResponse = createSuccessResponse("active", true);
    expect(boolResponse.result).toBe(true);
  });

  test("preserves type information", () => {
    interface QueryResult {
      rows: Array<{ id: number; name: string }>;
      count: number;
    }

    const result: QueryResult = {
      rows: [
        { id: 1, name: "first" },
        { id: 2, name: "second" },
      ],
      count: 2,
    };

    const response = createSuccessResponse<QueryResult>("typed-query", result);

    expect(response.result?.rows).toHaveLength(2);
    expect(response.result?.count).toBe(2);
  });
});

// =============================================================================
// Type Tests
// =============================================================================

describe("Type definitions", () => {
  test("HubRequest has required fields", () => {
    const request: HubRequest = {
      id: "type-test",
      method: "query",
      params: {},
    };

    expect(request.id).toBeDefined();
    expect(request.method).toBeDefined();
    expect(request.params).toBeDefined();
  });

  test("HubResponse can have result or error", () => {
    const successResponse: HubResponse<string> = {
      id: "success",
      result: "ok",
    };

    const errorResponse: HubResponse = {
      id: "error",
      error: { code: -1, message: "Error" },
    };

    expect(successResponse.result).toBe("ok");
    expect(errorResponse.error?.message).toBe("Error");
  });

  test("HubError has required fields", () => {
    const error: HubError = {
      code: -32600,
      message: "Invalid request",
    };

    expect(error.code).toBeDefined();
    expect(error.message).toBeDefined();
    expect(error.data).toBeUndefined();
  });

  test("HubError can have optional data", () => {
    const error: HubError = {
      code: -32600,
      message: "Invalid request",
      data: { details: "missing field" },
    };

    expect(error.data).toEqual({ details: "missing field" });
  });
});

// =============================================================================
// Round-trip Tests
// =============================================================================

describe("Round-trip serialization", () => {
  test("request can be serialized and parsed as response", () => {
    const request: HubRequest = {
      id: "round-trip",
      method: "getRepoStatus",
      params: { repoId: "test/repo" },
    };

    const _serialized = serializeRequest(request);

    // Simulate sending request and receiving response
    const response = createSuccessResponse(request.id, { status: "active" });
    const responseStr = JSON.stringify(response);
    const parsed = parseResponse<{ status: string }>(responseStr);

    expect(parsed.id).toBe(request.id);
    expect(parsed.result?.status).toBe("active");
  });

  test("error response round-trip", () => {
    const errorResponse = createErrorResponse(
      "error-round-trip",
      HubErrorCode.OPERATION_FAILED,
      "Operation failed",
      { reason: "timeout" }
    );

    const serialized = JSON.stringify(errorResponse);
    const parsed = parseResponse(serialized);

    expect(parsed.id).toBe("error-round-trip");
    expect(parsed.error?.code).toBe(HubErrorCode.OPERATION_FAILED);
    expect(parsed.error?.message).toBe("Operation failed");
    expect(parsed.error?.data).toEqual({ reason: "timeout" });
  });
});
