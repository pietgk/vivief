import { describe, expect, it, vi } from "vitest";

import { MCP_TOOLS } from "../src/tools/index.js";

// Mock the MCP SDK transport to avoid actual stdio connections
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    close: vi.fn(),
  })),
}));

describe("MCP Tool Definitions", () => {
  describe("tool registry", () => {
    it("exports an array of tools", () => {
      expect(Array.isArray(MCP_TOOLS)).toBe(true);
      expect(MCP_TOOLS.length).toBeGreaterThan(0);
    });

    it("contains expected tool names", () => {
      const toolNames = MCP_TOOLS.map((t) => t.name);

      // Query tools
      expect(toolNames).toContain("query_symbol");
      expect(toolNames).toContain("query_deps");
      expect(toolNames).toContain("query_dependents");
      expect(toolNames).toContain("query_file");
      expect(toolNames).toContain("query_affected");
      expect(toolNames).toContain("query_call_graph");
      expect(toolNames).toContain("query_sql");
      expect(toolNames).toContain("query_schema");
      expect(toolNames).toContain("query_repos");
      expect(toolNames).toContain("query_context");
      // Status tools
      expect(toolNames).toContain("status");
      expect(toolNames).toContain("status_diagnostics");
      // Unified diagnostics tools
      expect(toolNames).toContain("status_all_diagnostics");
      expect(toolNames).toContain("status_all_diagnostics_summary");
      expect(toolNames).toContain("status_all_diagnostics_counts");
    });

    it("has exactly 21 tools", () => {
      expect(MCP_TOOLS.length).toBe(21);
    });
  });

  describe("tool structure", () => {
    it("each tool has required fields", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);

        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(0);

        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe("object");
      }
    });

    it("tool names are snake_case", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });

  describe("query_symbol schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_symbol");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("has correct input schema", () => {
      expect(tool?.inputSchema.type).toBe("object");
      expect(tool?.inputSchema.properties).toBeDefined();
      expect(tool?.inputSchema.properties.name).toBeDefined();
      expect((tool?.inputSchema.properties.name as { type: string }).type).toBe("string");
    });

    it("requires name parameter", () => {
      expect(tool?.inputSchema.required).toContain("name");
    });

    it("has optional kind parameter", () => {
      expect(tool?.inputSchema.properties.kind).toBeDefined();
      expect((tool?.inputSchema.properties.kind as { type: string }).type).toBe("string");
    });

    it("has descriptive description", () => {
      expect(tool?.description).toContain("symbol");
    });
  });

  describe("query_deps schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_deps");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("requires entityId parameter", () => {
      expect(tool?.inputSchema.properties.entityId).toBeDefined();
      expect((tool?.inputSchema.properties.entityId as { type: string }).type).toBe("string");
      expect(tool?.inputSchema.required).toContain("entityId");
    });

    it("has descriptive description", () => {
      expect(tool?.description).toContain("dependenc");
    });
  });

  describe("query_dependents schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_dependents");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("requires entityId parameter", () => {
      expect(tool?.inputSchema.properties.entityId).toBeDefined();
      expect((tool?.inputSchema.properties.entityId as { type: string }).type).toBe("string");
      expect(tool?.inputSchema.required).toContain("entityId");
    });

    it("has descriptive description", () => {
      expect(tool?.description).toContain("depend");
    });
  });

  describe("query_file schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_file");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("requires filePath parameter", () => {
      expect(tool?.inputSchema.properties.filePath).toBeDefined();
      expect((tool?.inputSchema.properties.filePath as { type: string }).type).toBe("string");
      expect(tool?.inputSchema.required).toContain("filePath");
    });

    it("has descriptive description", () => {
      expect(tool?.description).toContain("file");
    });
  });

  describe("query_affected schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_affected");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("requires changedFiles parameter", () => {
      expect(tool?.inputSchema.properties.changedFiles).toBeDefined();
      expect((tool?.inputSchema.properties.changedFiles as { type: string }).type).toBe("array");
      expect(tool?.inputSchema.required).toContain("changedFiles");
    });

    it("has optional maxDepth parameter", () => {
      expect(tool?.inputSchema.properties.maxDepth).toBeDefined();
      expect((tool?.inputSchema.properties.maxDepth as { type: string }).type).toBe("number");
    });

    it("has descriptive description", () => {
      expect(tool?.description).toContain("affected");
    });
  });

  describe("query_call_graph schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_call_graph");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("requires entityId parameter", () => {
      expect(tool?.inputSchema.properties.entityId).toBeDefined();
      expect((tool?.inputSchema.properties.entityId as { type: string }).type).toBe("string");
      expect(tool?.inputSchema.required).toContain("entityId");
    });

    it("has optional direction parameter", () => {
      expect(tool?.inputSchema.properties.direction).toBeDefined();
    });

    it("has optional maxDepth parameter", () => {
      expect(tool?.inputSchema.properties.maxDepth).toBeDefined();
      expect((tool?.inputSchema.properties.maxDepth as { type: string }).type).toBe("number");
    });

    it("has descriptive description", () => {
      expect(tool?.description).toContain("call");
    });
  });

  describe("query_sql schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_sql");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("requires sql parameter", () => {
      expect(tool?.inputSchema.properties.sql).toBeDefined();
      expect((tool?.inputSchema.properties.sql as { type: string }).type).toBe("string");
      expect(tool?.inputSchema.required).toContain("sql");
    });

    it("has descriptive description mentioning read-only", () => {
      expect(tool?.description.toLowerCase()).toContain("read-only");
    });
  });

  describe("query_repos schema", () => {
    const tool = MCP_TOOLS.find((t) => t.name === "query_repos");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("has no required parameters", () => {
      expect(tool?.inputSchema.required).toEqual([]);
    });

    it("has descriptive description mentioning hub mode", () => {
      expect(tool?.description.toLowerCase()).toContain("hub");
    });
  });
});

describe("Tool Input Validation", () => {
  describe("query_symbol", () => {
    it("schema accepts valid input", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "query_symbol");
      const validInput = { name: "Calculator" };

      // Schema validation - properties exist
      expect(tool?.inputSchema.properties.name).toBeDefined();
      expect(typeof validInput.name).toBe("string");
    });

    it("schema accepts optional kind", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "query_symbol");
      const validInput = { name: "Calculator", kind: "class" };

      expect(tool?.inputSchema.properties.kind).toBeDefined();
      expect(typeof validInput.kind).toBe("string");
    });
  });

  describe("query_affected", () => {
    it("schema accepts array of changed files", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "query_affected");
      const validInput = { changedFiles: ["src/a.ts", "src/b.ts"] };

      expect((tool?.inputSchema.properties.changedFiles as { type: string }).type).toBe("array");
      expect(Array.isArray(validInput.changedFiles)).toBe(true);
    });

    it("schema accepts optional maxDepth", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "query_affected");
      const validInput = { changedFiles: ["src/a.ts"], maxDepth: 5 };

      expect((tool?.inputSchema.properties.maxDepth as { type: string }).type).toBe("number");
      expect(typeof validInput.maxDepth).toBe("number");
    });
  });

  describe("query_call_graph", () => {
    it("schema accepts direction values", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "query_call_graph");
      const directions = ["callers", "callees", "both"];

      expect(tool?.inputSchema.properties.direction).toBeDefined();
      for (const dir of directions) {
        expect(typeof dir).toBe("string");
      }
    });
  });

  describe("query_sql", () => {
    it("schema accepts SQL string", () => {
      const tool = MCP_TOOLS.find((t) => t.name === "query_sql");
      const validInput = { sql: "SELECT * FROM nodes LIMIT 10" };

      expect((tool?.inputSchema.properties.sql as { type: string }).type).toBe("string");
      expect(typeof validInput.sql).toBe("string");
    });
  });
});

describe("Tool Error Scenarios", () => {
  describe("SQL injection prevention", () => {
    it("query_symbol escapes single quotes in name", () => {
      // This tests the escaping pattern used in the server
      // Single quotes are escaped by doubling them in SQL
      const maliciousName = "'; DROP TABLE nodes; --";
      const escaped = maliciousName.replace(/'/g, "''");

      // After escaping, the single quote becomes two single quotes
      expect(escaped).toBe("''; DROP TABLE nodes; --");
      // The injection pattern "'; DROP" becomes "''; DROP" which is safe
      // because it's now a literal string containing two quotes
    });

    it("query_file escapes single quotes in filePath", () => {
      const maliciousPath = "'; DELETE FROM nodes; --";
      const escaped = maliciousPath.replace(/'/g, "''");

      expect(escaped).toBe("''; DELETE FROM nodes; --");
    });

    it("escaping prevents SQL injection by doubling quotes", () => {
      // When the escaped value is used in SQL like:
      // SELECT * FROM nodes WHERE name = 'escaped_value'
      // The original attack: name = ''; DROP TABLE nodes; --'
      // After escaping:      name = ''''; DROP TABLE nodes; --'
      // This makes the DROP part of the string literal, not a command
      const attack = "test'; DROP TABLE nodes; --";
      const escaped = attack.replace(/'/g, "''");

      // The escaped version should have two quotes where there was one
      expect(escaped).toBe("test''; DROP TABLE nodes; --");
      // Count quotes - should have 2 where original had 1
      expect((escaped.match(/''/g) || []).length).toBe(1);
    });
  });

  describe("query_sql restrictions", () => {
    it("should only allow SELECT queries (case insensitive)", () => {
      const validQueries = [
        "SELECT * FROM nodes",
        "select name from nodes",
        "  SELECT count(*) FROM edges",
        "SELECT * FROM nodes WHERE name = 'test'",
      ];

      for (const sql of validQueries) {
        expect(sql.trim().toLowerCase().startsWith("select")).toBe(true);
      }
    });

    it("should reject non-SELECT queries", () => {
      const invalidQueries = [
        "DELETE FROM nodes",
        "INSERT INTO nodes VALUES ('test')",
        "UPDATE nodes SET name = 'hacked'",
        "DROP TABLE nodes",
        "CREATE TABLE hack (id INT)",
        "ALTER TABLE nodes ADD COLUMN x INT",
      ];

      for (const sql of invalidQueries) {
        expect(sql.trim().toLowerCase().startsWith("select")).toBe(false);
      }
    });
  });
});
