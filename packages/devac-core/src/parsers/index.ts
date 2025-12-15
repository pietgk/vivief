/**
 * Parsers Module Exports
 *
 * Language-specific parsers for DevAC v2.0
 */

// Parser interface
export {
  createEmptyParseResult,
  mergeParseResults,
  filterParseResultByFile,
  validateParseResult,
  DEFAULT_PARSER_CONFIG,
} from "./parser-interface.js";
export type {
  StructuralParseResult,
  ParserConfig,
  LanguageParser,
  BatchParseResult,
  ParserFactory,
} from "./parser-interface.js";

// Scoped name generator
export {
  createScopeContext,
  generateScopedName,
  pushScope,
  popScope,
  getCurrentScopePath,
  createChildContext,
  generateCallbackScopedName,
} from "./scoped-name-generator.js";
export type {
  ScopeContext,
  SymbolInfo,
  SymbolKind,
} from "./scoped-name-generator.js";

// TypeScript/JavaScript parser
export {
  TypeScriptParser,
  createTypeScriptParser,
} from "./typescript-parser.js";

// Python parser
export { PythonParser, createPythonParser } from "./python-parser.js";

// C# parser
export { CSharpParser, createCSharpParser } from "./csharp-parser.js";
