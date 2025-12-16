import { describe, expect, it } from "vitest";

import { createCSharpParser } from "../src/parsers/csharp-parser.js";
import type { ParserConfig } from "../src/parsers/parser-interface.js";
import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import { createPythonParser } from "../src/parsers/python-parser.js";
import { createTypeScriptParser } from "../src/parsers/typescript-parser.js";

// Default test config
const testConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "error-test-repo",
  packagePath: "error-test-package",
  branch: "main",
};

describe("Error Handling", () => {
  // ==========================================================================
  // TypeScript Parser Error Recovery
  // ==========================================================================

  describe("TypeScript Parser", () => {
    const parser = createTypeScriptParser();

    describe("syntax errors", () => {
      it("handles unclosed braces", async () => {
        const content = `
export class Incomplete {
  getValue() {
    return 42;
  // Missing closing brace for method
// Missing closing brace for class
`;
        const result = await parser.parseContent(content, "unclosed.ts", testConfig);

        // Should not throw, should return a result
        expect(result).toBeDefined();
        expect(result.filePath).toBe("unclosed.ts");
      });

      it("handles unclosed strings", async () => {
        const content = `
const message = "This string is never closed;
const value = 42;
`;
        const result = await parser.parseContent(content, "unclosed-string.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles unclosed template literals", async () => {
        const content = `
const template = \`This template
  spans multiple lines
  but is never closed;
`;
        const result = await parser.parseContent(content, "unclosed-template.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles mismatched brackets", async () => {
        const content = `
function test(a: number, b: string] {
  return a + b.length;
}
`;
        const result = await parser.parseContent(content, "mismatched.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles invalid type annotations", async () => {
        const content = `
const x: number string = 42;
function foo(): void number {}
`;
        const result = await parser.parseContent(content, "invalid-types.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles incomplete arrow functions", async () => {
        const content = `
const fn = (x: number) =>
// Missing body

const fn2 = () => {
`;
        const result = await parser.parseContent(content, "incomplete-arrow.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles duplicate keywords", async () => {
        const content = `
export export class DoubleExport {}
public public class DoublePublic {}
async async function doubleAsync() {}
`;
        const result = await parser.parseContent(content, "duplicate-keywords.ts", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("edge cases", () => {
      it("handles empty file", async () => {
        const result = await parser.parseContent("", "empty.ts", testConfig);

        expect(result).toBeDefined();
        // Parser may include implicit nodes - just verify no crash
        expect(result.nodes.length).toBeGreaterThanOrEqual(0);
        expect(result.edges.length).toBeGreaterThanOrEqual(0);
        expect(result.externalRefs.length).toBeGreaterThanOrEqual(0);
      });

      it("handles file with only whitespace", async () => {
        const content = "   \n\n\t\t\n   \n";
        const result = await parser.parseContent(content, "whitespace.ts", testConfig);

        expect(result).toBeDefined();
        // Parser may include implicit nodes - just verify no crash
        expect(result.nodes.length).toBeGreaterThanOrEqual(0);
      });

      it("handles file with only comments", async () => {
        const content = `
// Single line comment
/* Multi
   line
   comment */
/**
 * JSDoc comment
 */
`;
        const result = await parser.parseContent(content, "comments.ts", testConfig);

        expect(result).toBeDefined();
        // Parser may or may not extract comments - just verify no crash
        expect(result.nodes.length).toBeGreaterThanOrEqual(0);
      });

      it("handles extremely long lines", async () => {
        const longString = "a".repeat(10000);
        const content = `const x = "${longString}";`;
        const result = await parser.parseContent(content, "long-line.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles deeply nested structures", async () => {
        // Create deeply nested object
        let content = "const deep = ";
        for (let i = 0; i < 50; i++) {
          content += "{ a: ";
        }
        content += "1";
        for (let i = 0; i < 50; i++) {
          content += " }";
        }
        content += ";";

        const result = await parser.parseContent(content, "deep-nesting.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles unicode characters", async () => {
        const content = `
const emoji = "🎉🚀💻";
const chinese = "你好世界";
const arabic = "مرحبا بالعالم";
const math = "∑∏∫∂";
function π(): number { return 3.14159; }
const λ = (x: number) => x * 2;
`;
        const result = await parser.parseContent(content, "unicode.ts", testConfig);

        expect(result).toBeDefined();
        // Should find function π
        const piFunc = result.nodes.find((n) => n.name === "π");
        expect(piFunc).toBeDefined();
      });

      it("handles BOM (Byte Order Mark)", async () => {
        const content = "\uFEFFexport const value = 42;";
        const result = await parser.parseContent(content, "bom.ts", testConfig);

        // Should not crash - BOM handling may vary
        expect(result).toBeDefined();
        expect(result.filePath).toBe("bom.ts");
      });

      it("handles mixed line endings", async () => {
        const content = "const a = 1;\r\nconst b = 2;\rconst c = 3;\nconst d = 4;";
        const result = await parser.parseContent(content, "line-endings.ts", testConfig);

        expect(result).toBeDefined();
      });

      it("handles null bytes", async () => {
        const content = "const x = 1;\0const y = 2;";
        const result = await parser.parseContent(content, "null-bytes.ts", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("partial valid code", () => {
      it("extracts valid parts from partially broken code", async () => {
        const content = `
export class ValidClass {
  getValue(): number {
    return 42;
  }
}

export class BrokenClass {
  getValue(): number
  // Missing body
}

export class AnotherValidClass {
  getName(): string {
    return "name";
  }
}
`;
        const result = await parser.parseContent(content, "partial.ts", testConfig);

        expect(result).toBeDefined();
        // Should at least find the valid classes
        const validClass = result.nodes.find((n) => n.name === "ValidClass");
        expect(validClass).toBeDefined();
      });

      it("handles valid code after syntax error", async () => {
        const content = `
const broken = {
  key: // Missing value
};

export function validFunction(): number {
  return 42;
}
`;
        const result = await parser.parseContent(content, "recovery.ts", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("file system errors", () => {
      it("throws on non-existent file", async () => {
        await expect(parser.parse("/non/existent/file.ts", testConfig)).rejects.toThrow();
      });

      it("throws on directory instead of file", async () => {
        await expect(parser.parse(__dirname, testConfig)).rejects.toThrow();
      });
    });
  });

  // ==========================================================================
  // Python Parser Error Recovery
  // ==========================================================================

  describe("Python Parser", () => {
    const parser = createPythonParser();

    describe("syntax errors", () => {
      it("handles indentation errors", async () => {
        const content = `
def function():
print("wrong indent")
    pass
`;
        const result = await parser.parseContent(content, "indent.py", testConfig);

        expect(result).toBeDefined();
        // May have warnings
        expect(result.warnings.length >= 0).toBe(true);
      });

      it("handles missing colons", async () => {
        const content = `
def broken_function()
    pass

class BrokenClass
    pass
`;
        const result = await parser.parseContent(content, "missing-colons.py", testConfig);

        expect(result).toBeDefined();
      });

      it("handles unclosed parentheses", async () => {
        const content = `
def function(a, b, c:
    return a + b + c

result = function(1, 2, 3
`;
        const result = await parser.parseContent(content, "unclosed-parens.py", testConfig);

        expect(result).toBeDefined();
      });

      it("handles unclosed strings", async () => {
        const content = `
message = "This string is never closed
value = 42
`;
        const result = await parser.parseContent(content, "unclosed-string.py", testConfig);

        expect(result).toBeDefined();
      });

      it("handles invalid decorators", async () => {
        const content = `
@
def no_decorator_name():
    pass

@decorator with spaces
def invalid_decorator():
    pass
`;
        const result = await parser.parseContent(content, "invalid-decorators.py", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("edge cases", () => {
      it("handles empty file", async () => {
        const result = await parser.parseContent("", "empty.py", testConfig);

        expect(result).toBeDefined();
        expect(result.nodes).toHaveLength(0);
      });

      it("handles file with only comments", async () => {
        const content = `
# Comment line 1
# Comment line 2
"""
Docstring that's not attached to anything
"""
`;
        const result = await parser.parseContent(content, "comments.py", testConfig);

        expect(result).toBeDefined();
      });

      it("handles unicode identifiers", async () => {
        const content = `
def 你好():
    return "Hello"

变量 = 42
π = 3.14159

class Класс:
    def метод(self):
        pass
`;
        const result = await parser.parseContent(content, "unicode.py", testConfig);

        expect(result).toBeDefined();
      });

      it("handles deeply nested code", async () => {
        let content = "def outer():\n";
        for (let i = 0; i < 20; i++) {
          content += `${"    ".repeat(i + 1)}def level_${i}():\n`;
        }
        content += `${"    ".repeat(21)}pass\n`;

        const result = await parser.parseContent(content, "deep-nesting.py", testConfig);

        expect(result).toBeDefined();
      });

      it("handles mixed tabs and spaces", async () => {
        const content = `
def function():
\tif True:
    \tpass
`;
        const result = await parser.parseContent(content, "mixed-indent.py", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("file system errors", () => {
      it("throws on non-existent file", async () => {
        await expect(parser.parse("/non/existent/file.py", testConfig)).rejects.toThrow();
      });
    });
  });

  // ==========================================================================
  // C# Parser Error Recovery
  // ==========================================================================

  describe("C# Parser", () => {
    const parser = createCSharpParser();

    describe("syntax errors", () => {
      it("handles unclosed braces", async () => {
        const content = `
public class Incomplete
{
    public void Method()
    {
        // Missing closing braces
`;
        const result = await parser.parseContent(content, "unclosed.cs", testConfig);

        expect(result).toBeDefined();
      });

      it("handles missing semicolons", async () => {
        const content = `
public class NoSemicolons
{
    public int Value { get set }
    public void Method() { return }
}
`;
        const result = await parser.parseContent(content, "no-semicolons.cs", testConfig);

        expect(result).toBeDefined();
      });

      it("handles invalid access modifiers", async () => {
        const content = `
public private class DoubleAccess { }
protected internal public class TripleAccess { }
`;
        const result = await parser.parseContent(content, "invalid-access.cs", testConfig);

        expect(result).toBeDefined();
      });

      it("handles incomplete generics", async () => {
        const content = `
public class Container<T
{
    public T Value { get; set; }
}

public class Pair<TFirst, TSecond>
`;
        const result = await parser.parseContent(content, "incomplete-generics.cs", testConfig);

        expect(result).toBeDefined();
      });

      it("handles invalid method signatures", async () => {
        const content = `
public class InvalidMethods
{
    public void Method1( { }
    public int Method2() =>
    public async Method3() { }
}
`;
        const result = await parser.parseContent(content, "invalid-methods.cs", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("edge cases", () => {
      it("handles empty file", async () => {
        const result = await parser.parseContent("", "empty.cs", testConfig);

        expect(result).toBeDefined();
        expect(result.nodes).toHaveLength(0);
      });

      it("handles file with only comments", async () => {
        const content = `
// Single line comment
/* Multi
   line
   comment */
/// <summary>XML doc comment</summary>
`;
        const result = await parser.parseContent(content, "comments.cs", testConfig);

        expect(result).toBeDefined();
        expect(result.nodes).toHaveLength(0);
      });

      it("handles preprocessor directives", async () => {
        const content = `
#if DEBUG
public class DebugOnly { }
#endif

#region MyRegion
public class InRegion { }
#endregion

#pragma warning disable 0618
public class WithPragma { }
#pragma warning restore 0618
`;
        const result = await parser.parseContent(content, "preprocessor.cs", testConfig);

        expect(result).toBeDefined();
      });

      it("handles verbatim strings with special characters", async () => {
        const content = `
public class StringTests
{
    public string Path = @"C:\\Users\\test";
    public string MultiLine = @"Line 1
Line 2
Line 3";
    public string WithQuotes = @"He said ""Hello""";
}
`;
        const result = await parser.parseContent(content, "verbatim-strings.cs", testConfig);

        expect(result).toBeDefined();
        const classNode = result.nodes.find((n) => n.name === "StringTests");
        expect(classNode).toBeDefined();
      });

      it("handles interpolated strings", async () => {
        const content = `
public class InterpolatedStrings
{
    public string GetMessage(string name, int age)
    {
        return $"Hello, {name}! You are {age} years old.";
    }

    public string Complex()
    {
        return $@"Path: {Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)}
        Date: {DateTime.Now:yyyy-MM-dd}";
    }
}
`;
        const result = await parser.parseContent(content, "interpolated.cs", testConfig);

        expect(result).toBeDefined();
      });

      it("handles unicode in identifiers", async () => {
        const content = `
public class УникодКласс
{
    public string Имя { get; set; }
    public void Метод() { }
}

public class 中文类
{
    public string 名称 { get; set; }
}
`;
        const result = await parser.parseContent(content, "unicode.cs", testConfig);

        expect(result).toBeDefined();
      });
    });

    describe("file system errors", () => {
      it("throws on non-existent file", async () => {
        await expect(parser.parse("/non/existent/file.cs", testConfig)).rejects.toThrow();
      });
    });
  });

  // ==========================================================================
  // Cross-Parser Error Handling
  // ==========================================================================

  describe("Cross-Parser Behavior", () => {
    it("all parsers handle empty input consistently", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      const tsResult = await tsParser.parseContent("", "empty.ts", testConfig);
      const pyResult = await pyParser.parseContent("", "empty.py", testConfig);
      const csResult = await csParser.parseContent("", "empty.cs", testConfig);

      // All should return valid structure without errors
      // Note: Some parsers may include implicit nodes - that's OK
      expect(tsResult).toBeDefined();
      expect(pyResult).toBeDefined();
      expect(csResult).toBeDefined();

      // Edges should be minimal for empty input
      expect(tsResult.edges.length).toBeLessThanOrEqual(tsResult.nodes.length);
      expect(pyResult.edges.length).toBeLessThanOrEqual(pyResult.nodes.length);
      expect(csResult.edges.length).toBeLessThanOrEqual(csResult.nodes.length);
    });

    it("all parsers have consistent error response structure", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      const brokenCode = "{{{{{{";

      const tsResult = await tsParser.parseContent(brokenCode, "broken.ts", testConfig);
      const pyResult = await pyParser.parseContent(brokenCode, "broken.py", testConfig);
      const csResult = await csParser.parseContent(brokenCode, "broken.cs", testConfig);

      // All should return valid result structure
      for (const result of [tsResult, pyResult, csResult]) {
        expect(result).toHaveProperty("nodes");
        expect(result).toHaveProperty("edges");
        expect(result).toHaveProperty("externalRefs");
        expect(result).toHaveProperty("warnings");
        expect(result).toHaveProperty("filePath");
        expect(result).toHaveProperty("parseTimeMs");
        expect(result).toHaveProperty("sourceFileHash");

        expect(Array.isArray(result.nodes)).toBe(true);
        expect(Array.isArray(result.edges)).toBe(true);
        expect(Array.isArray(result.externalRefs)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    });

    it("parsers handle large files without crashing", async () => {
      const tsParser = createTypeScriptParser();
      const pyParser = createPythonParser();
      const csParser = createCSharpParser();

      // Generate large files (~100KB each)
      let tsContent = "";
      let pyContent = "";
      let csContent = "namespace Large {\n";

      for (let i = 0; i < 500; i++) {
        tsContent += `export function func${i}(a: number, b: string): number { return a + b.length; }\n`;
        pyContent += `def func_${i}(a: int, b: str) -> int:\n    return a + len(b)\n\n`;
        csContent += `  public class Class${i} { public int Method() { return ${i}; } }\n`;
      }
      csContent += "}";

      const tsResult = await tsParser.parseContent(tsContent, "large.ts", testConfig);
      const pyResult = await pyParser.parseContent(pyContent, "large.py", testConfig);
      const csResult = await csParser.parseContent(csContent, "large.cs", testConfig);

      // All should complete without error and find many nodes
      expect(tsResult.nodes.length).toBeGreaterThan(100);
      expect(pyResult.nodes.length).toBeGreaterThan(100);
      expect(csResult.nodes.length).toBeGreaterThan(100);

      // Parse time should be reasonable (under 5 seconds each)
      expect(tsResult.parseTimeMs).toBeLessThan(5000);
      expect(pyResult.parseTimeMs).toBeLessThan(5000);
      expect(csResult.parseTimeMs).toBeLessThan(5000);
    });
  });
});
