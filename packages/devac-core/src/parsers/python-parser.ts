/**
 * Python Language Parser
 *
 * Wraps the Python AST parser script to provide Python support
 * for the DevAC v2.0 analyzer.
 *
 * Based on DevAC v2.0 spec Phase 3 requirements.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import type { NodeKind, ParsedEdge, ParsedExternalRef, ParsedNode } from "../types/index.js";
import { createEdge, createExternalRef, createNode } from "../types/index.js";
import { computeStringHash } from "../utils/hash.js";
import type { LanguageParser, ParserConfig, StructuralParseResult } from "./parser-interface.js";

// ============================================================================
// Python Parser Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the Python parser script */
const PYTHON_SCRIPT_PATH = path.join(__dirname, "python_parser.py");

/** Default timeout for Python subprocess (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/** Python executable to use */
const PYTHON_EXECUTABLE = process.env.PYTHON_PATH || "python3";

// ============================================================================
// Types
// ============================================================================

/**
 * Raw output from Python parser script
 */
interface PythonParserOutput {
  nodes: RawPythonNode[];
  edges: RawPythonEdge[];
  externalRefs: RawPythonRef[];
  sourceFileHash: string;
  filePath: string;
  parseTimeMs: number;
  warnings: string[];
  error?: string;
}

interface RawPythonNode {
  entity_id: string;
  kind: string;
  name: string;
  qualified_name?: string;
  file_path: string;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  language: string;
  is_exported?: boolean;
  is_async?: boolean;
  is_static?: boolean;
  is_generator?: boolean;
  is_property?: boolean;
  return_type?: string;
  type_annotation?: string;
  documentation?: string;
  properties?: Record<string, unknown>;
}

interface RawPythonEdge {
  edge_id: string;
  edge_type: string;
  source_entity_id: string;
  target_entity_id: string;
  source_file_path: string;
  target_name?: string;
}

interface RawPythonRef {
  source_entity_id: string;
  source_file_path: string;
  module_specifier: string;
  imported_symbol: string;
  local_name?: string;
  is_type_only?: boolean;
  is_relative?: boolean;
}

// ============================================================================
// Python Parser Implementation
// ============================================================================

/**
 * Python language parser
 *
 * Uses a Python subprocess to parse Python files via the ast module.
 */
export class PythonParser implements LanguageParser {
  readonly language = "python";
  readonly extensions = [".py", ".pyw", ".pyi"];
  readonly version = "1.0.0";

  private readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Check if this parser can handle a given file
   */
  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parse a source file
   */
  async parse(filePath: string, config: ParserConfig): Promise<StructuralParseResult> {
    const startTime = performance.now();

    // Read file content for hash
    const content = await readFile(filePath, "utf-8");
    const sourceFileHash = computeStringHash(content);

    // Run Python parser
    const pythonOutput = await this.runPythonParser(filePath, config);

    // Convert to StructuralParseResult
    const result = this.convertOutput(pythonOutput, filePath, sourceFileHash, config, startTime);

    return result;
  }

  /**
   * Parse source code content directly (for testing)
   */
  async parseContent(
    content: string,
    filePath: string,
    config: ParserConfig
  ): Promise<StructuralParseResult> {
    const startTime = performance.now();
    const sourceFileHash = computeStringHash(content);

    // Write content to temp file
    const tempDir = await mkdtemp(path.join(tmpdir(), "devac-python-"));
    const tempFile = path.join(tempDir, path.basename(filePath));

    try {
      await writeFile(tempFile, content, "utf-8");

      // Run Python parser on temp file
      const pythonOutput = await this.runPythonParser(tempFile, config);

      // Convert output (use original filePath, not temp path)
      const result = this.convertOutput(pythonOutput, filePath, sourceFileHash, config, startTime);

      // Fix file paths in result to use original path
      result.filePath = filePath;
      for (const node of result.nodes) {
        node.file_path = filePath;
      }
      for (const edge of result.edges) {
        edge.source_file_path = filePath;
      }
      for (const ref of result.externalRefs) {
        ref.source_file_path = filePath;
      }

      return result;
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run the Python parser script
   */
  private async runPythonParser(
    filePath: string,
    config: ParserConfig
  ): Promise<PythonParserOutput> {
    return new Promise((resolve, reject) => {
      const configJson = JSON.stringify({
        repoName: config.repoName,
        packagePath: config.packagePath,
        branch: config.branch,
      });

      const args = [PYTHON_SCRIPT_PATH, filePath, "--config", configJson];

      const child = spawn(PYTHON_EXECUTABLE, args, {
        timeout: this.timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to spawn Python parser: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          // Try to parse error from stderr
          try {
            const errorOutput = JSON.parse(stderr || stdout);
            if (errorOutput.error) {
              reject(new Error(errorOutput.error));
              return;
            }
          } catch {
            // Not JSON, use raw stderr
          }
          reject(new Error(`Python parser exited with code ${code}: ${stderr || stdout}`));
          return;
        }

        try {
          const output = JSON.parse(stdout);
          resolve(output);
        } catch (_err) {
          reject(new Error(`Failed to parse Python parser output: ${stdout}`));
        }
      });
    });
  }

  /**
   * Convert Python parser output to StructuralParseResult
   */
  private convertOutput(
    output: PythonParserOutput,
    filePath: string,
    sourceFileHash: string,
    config: ParserConfig,
    startTime: number
  ): StructuralParseResult {
    const nodes: ParsedNode[] = output.nodes.map((raw) =>
      this.convertNode(raw, sourceFileHash, config)
    );

    const edges: ParsedEdge[] = output.edges.map((raw) => this.convertEdge(raw, sourceFileHash));

    const externalRefs: ParsedExternalRef[] = output.externalRefs.map((raw) =>
      this.convertExternalRef(raw, sourceFileHash)
    );

    const parseTimeMs = performance.now() - startTime;

    return {
      nodes,
      edges,
      externalRefs,
      sourceFileHash,
      filePath,
      parseTimeMs,
      warnings: output.warnings || [],
    };
  }

  /**
   * Convert a raw Python node to ParsedNode
   */
  private convertNode(
    raw: RawPythonNode,
    sourceFileHash: string,
    config: ParserConfig
  ): ParsedNode {
    // Map Python kinds to DevAC NodeKind
    const kind = this.mapNodeKind(raw.kind);

    return createNode({
      entity_id: raw.entity_id,
      name: raw.name,
      qualified_name: raw.qualified_name || raw.name,
      kind,
      file_path: raw.file_path,
      source_file_hash: sourceFileHash,
      start_line: raw.start_line,
      end_line: raw.end_line,
      start_column: raw.start_column,
      end_column: raw.end_column,
      is_exported: raw.is_exported ?? true, // Python exports everything by default
      is_async: raw.is_async ?? false,
      is_static: raw.is_static ?? false,
      is_generator: raw.is_generator ?? false,
      type_signature: raw.return_type || raw.type_annotation || null,
      documentation: raw.documentation || null,
      properties: {
        ...raw.properties,
        language: "python",
        is_property: raw.is_property,
      },
      branch: config.branch,
    });
  }

  /**
   * Map Python kind string to NodeKind
   */
  private mapNodeKind(kind: string): NodeKind {
    const kindMap: Record<string, NodeKind> = {
      function: "function",
      method: "method",
      class: "class",
      variable: "variable",
      constant: "constant",
      parameter: "parameter",
      property: "property",
      type: "type",
      module: "module",
      decorator: "decorator",
    };

    return kindMap[kind.toLowerCase()] || "unknown";
  }

  /**
   * Convert a raw Python edge to ParsedEdge
   */
  private convertEdge(raw: RawPythonEdge, sourceFileHash: string): ParsedEdge {
    return createEdge({
      edge_type: raw.edge_type as ParsedEdge["edge_type"],
      source_entity_id: raw.source_entity_id,
      target_entity_id: raw.target_entity_id,
      source_file_path: raw.source_file_path,
      source_file_hash: sourceFileHash,
      properties: raw.target_name ? { target_name: raw.target_name } : {},
    });
  }

  /**
   * Convert a raw Python external ref to ParsedExternalRef
   */
  private convertExternalRef(raw: RawPythonRef, sourceFileHash: string): ParsedExternalRef {
    return createExternalRef({
      source_entity_id: raw.source_entity_id,
      source_file_path: raw.source_file_path,
      source_file_hash: sourceFileHash,
      module_specifier: raw.module_specifier,
      imported_symbol: raw.imported_symbol,
      local_alias: raw.local_name ?? null,
      is_type_only: raw.is_type_only ?? false,
      import_style: raw.is_relative ? "named" : "named",
    });
  }
}

/**
 * Factory function to create a PythonParser
 */
export function createPythonParser(options: { timeoutMs?: number } = {}): PythonParser {
  return new PythonParser(options);
}
