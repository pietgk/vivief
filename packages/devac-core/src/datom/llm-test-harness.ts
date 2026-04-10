/**
 * LLM Test Harness — Evaluates whether an LLM can generate correct DatomStore queries
 *
 * 10 questions from the brainstorm (Section 9). Each question is sent to Claude
 * via `claude -p` with a system prompt describing the DatomStore API and a rich
 * fixture. The generated TypeScript is validated: does it compile? produce results?
 * correct results?
 *
 * Pass threshold: 8/10 correct (zero-shot or one-shot).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";
import type { Edge } from "../storage/schemas/edge.schema.js";
import type { ExternalRef } from "../storage/schemas/external-ref.schema.js";
import type { Node } from "../storage/schemas/node.schema.js";
import { InMemoryDatomStore } from "./datom-store.js";
import { loadFromArrays } from "./loader.js";
import type { DatomStore } from "./types.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Rich Test Fixture — ~20 nodes across 5 files
// ---------------------------------------------------------------------------

const NOW = "2026-01-01T00:00:00Z";

function node(
  id: string,
  name: string,
  kind: string,
  file: string,
  extra: Partial<Node> = {}
): Node {
  return {
    entity_id: id,
    name,
    qualified_name: name,
    kind: kind as Node["kind"],
    file_path: file,
    start_line: 1,
    end_line: 10,
    start_column: 0,
    end_column: 50,
    is_exported: true,
    is_default_export: false,
    visibility: "public",
    is_async: false,
    is_generator: false,
    is_static: false,
    is_abstract: false,
    type_signature: null,
    documentation: null,
    decorators: [],
    type_parameters: [],
    properties: {},
    source_file_hash: "hash",
    branch: "base",
    is_deleted: false,
    updated_at: NOW,
    ...extra,
  };
}

function edge(source: string, target: string, type: string, file: string): Edge {
  return {
    source_entity_id: source,
    target_entity_id: target,
    edge_type: type as Edge["edge_type"],
    source_file_path: file,
    source_line: 1,
    source_column: 0,
    properties: {},
    source_file_hash: "hash",
    branch: "base",
    is_deleted: false,
    updated_at: NOW,
  };
}

function extRef(source: string, module: string, symbol: string, style = "named"): ExternalRef {
  return {
    source_entity_id: source,
    module_specifier: module,
    imported_symbol: symbol,
    local_alias: null,
    import_style: style as ExternalRef["import_style"],
    is_type_only: false,
    source_file_path: "src/app.ts",
    source_line: 1,
    source_column: 0,
    target_entity_id: null,
    is_resolved: false,
    is_reexport: false,
    export_alias: null,
    source_file_hash: "hash",
    branch: "base",
    is_deleted: false,
    updated_at: NOW,
  };
}

/** The rich fixture used for all LLM eval questions */
export const LLM_FIXTURE = {
  nodes: [
    // auth.ts — 4 nodes
    node("r:p:module:auth", "auth", "module", "src/auth.ts"),
    node("r:p:function:login", "login", "function", "src/auth.ts", { is_async: true }),
    node("r:p:function:logout", "logout", "function", "src/auth.ts", { is_async: true }),
    node("r:p:function:validateToken", "validateToken", "function", "src/auth.ts"),

    // payment.ts — 4 nodes
    node("r:p:module:payment", "payment", "module", "src/payment.ts"),
    node("r:p:function:stripeCharge", "stripeCharge", "function", "src/payment.ts", {
      is_async: true,
    }),
    node("r:p:function:processRefund", "processRefund", "function", "src/payment.ts", {
      is_async: true,
    }),
    node("r:p:function:calculateTotal", "calculateTotal", "function", "src/payment.ts"),

    // app.tsx — 4 nodes
    node("r:p:module:app", "App", "module", "src/app.tsx"),
    node("r:p:jsx_component:App", "App", "jsx_component", "src/app.tsx"),
    node("r:p:function:handleClick", "handleClick", "function", "src/app.tsx", { is_async: true }),
    node("r:p:function:renderDashboard", "renderDashboard", "function", "src/app.tsx"),

    // service.ts — 4 nodes
    node("r:p:class:UserService", "UserService", "class", "src/service.ts"),
    node("r:p:method:getUser", "getUser", "method", "src/service.ts", { is_async: true }),
    node("r:p:method:saveUser", "saveUser", "method", "src/service.ts", { is_async: true }),
    node("r:p:method:deleteUser", "deleteUser", "method", "src/service.ts", { is_async: true }),

    // utils.ts — 4 nodes
    node("r:p:module:utils", "utils", "module", "src/utils.ts"),
    node("r:p:function:formatCurrency", "formatCurrency", "function", "src/utils.ts"),
    node("r:p:function:validateEmail", "validateEmail", "function", "src/utils.ts"),
    node("r:p:function:hashPassword", "hashPassword", "function", "src/utils.ts", {
      is_async: true,
    }),
  ],
  edges: [
    // auth.ts calls
    edge("r:p:function:login", "r:p:function:validateToken", "CALLS", "src/auth.ts"),
    edge("r:p:function:login", "r:p:function:hashPassword", "CALLS", "src/auth.ts"),

    // payment.ts calls
    edge("r:p:function:stripeCharge", "r:p:function:calculateTotal", "CALLS", "src/payment.ts"),
    edge("r:p:function:processRefund", "r:p:function:stripeCharge", "CALLS", "src/payment.ts"),

    // app.tsx calls
    edge("r:p:function:handleClick", "r:p:function:stripeCharge", "CALLS", "src/app.tsx"),
    edge("r:p:function:handleClick", "r:p:function:login", "CALLS", "src/app.tsx"),
    edge("r:p:function:renderDashboard", "r:p:method:getUser", "CALLS", "src/app.tsx"),

    // service.ts calls
    edge("r:p:method:getUser", "r:p:function:validateToken", "CALLS", "src/service.ts"),
    edge("r:p:method:saveUser", "r:p:function:validateEmail", "CALLS", "src/service.ts"),
    edge("r:p:method:saveUser", "r:p:function:hashPassword", "CALLS", "src/service.ts"),

    // Containment
    edge("r:p:class:UserService", "r:p:method:getUser", "CONTAINS", "src/service.ts"),
    edge("r:p:class:UserService", "r:p:method:saveUser", "CONTAINS", "src/service.ts"),
    edge("r:p:class:UserService", "r:p:method:deleteUser", "CONTAINS", "src/service.ts"),

    // Imports
    edge("r:p:module:app", "r:p:module:auth", "IMPORTS", "src/app.tsx"),
    edge("r:p:module:app", "r:p:module:payment", "IMPORTS", "src/app.tsx"),
    edge("r:p:module:payment", "r:p:module:utils", "IMPORTS", "src/payment.ts"),
    edge("r:p:module:auth", "r:p:module:utils", "IMPORTS", "src/auth.ts"),
  ],
  externalRefs: [
    extRef("r:p:module:payment", "stripe", "Stripe", "named"),
    extRef("r:p:module:payment", "stripe", "PaymentIntent", "named"),
    extRef("r:p:module:auth", "jsonwebtoken", "jwt", "default"),
    extRef("r:p:module:auth", "bcrypt", "bcrypt", "default"),
    extRef("r:p:module:app", "react", "React", "default"),
    extRef("r:p:module:app", "express", "Router", "named"),
  ],
};

/** Load the rich fixture into a fresh DatomStore */
export function createLlmFixtureStore(): InMemoryDatomStore {
  const store = new InMemoryDatomStore();
  loadFromArrays(store, LLM_FIXTURE);
  return store;
}

// ---------------------------------------------------------------------------
// DatomStore API System Prompt
// ---------------------------------------------------------------------------

export const DATOMSTORE_API_PROMPT = `You are a TypeScript expert. You write queries against a DatomStore API.

## DatomStore API

\`\`\`typescript
interface DatomStore {
  // EAVT — "everything about entity X"
  get(entity: EntityId): EntityView | undefined;
  getAttribute(entity: EntityId, attr: Attribute): DatomValue[];

  // AEVT — "find entities with attribute"
  findByAttribute(attr: Attribute, value?: DatomValue): EntityId[];

  // AVET — "search by value"
  findByValue(attr: Attribute, value: DatomValue): EntityId[];

  // VAET — "reverse references"
  reverseRefs(target: EntityId, attr?: Attribute): EntityId[];

  // Convenience
  callers(entity: EntityId): EntityView[];
  callees(entity: EntityId): EntityView[];

  // Transitive traversal
  transitiveDeps(entity: EntityId, attr: Attribute, depth: number): EntityView[];
}

interface EntityView {
  readonly id: EntityId;
  get(attr: Attribute): DatomValue | undefined;
  getAll(attr: Attribute): DatomValue[];
  has(attr: Attribute): boolean;
  readonly attrs: ReadonlyMap<Attribute, DatomValue[]>;
}
\`\`\`

## Attribute namespaces

- \`:node/name\`, \`:node/kind\`, \`:node/file_path\`, \`:node/is_exported\`, \`:node/is_async\`, \`:node/start_line\`, \`:node/end_line\`, \`:node/type_signature\`, \`:node/documentation\`, \`:node/visibility\`, \`:node/decorators\`, \`:node/type_parameters\`
- \`:edge/CALLS\`, \`:edge/IMPORTS\`, \`:edge/EXTENDS\`, \`:edge/IMPLEMENTS\`, \`:edge/CONTAINS\`, \`:edge/RETURNS\`, \`:edge/REFERENCES\`
  - Edge values are structured: \`{ target: EntityId, sourceFile: string, sourceLine: number, sourceColumn: number, properties: {} }\`
- \`:external-ref/import\`
  - Values: \`{ moduleSpecifier, importedSymbol, localAlias, importStyle, isTypeOnly, ... }\`
- \`:effect/FunctionCall\`, \`:effect/Store\`, \`:effect/Send\`

## NodeKind values
"function", "class", "method", "property", "variable", "constant", "interface", "type", "enum", "enum_member", "namespace", "module", "parameter", "decorator", "jsx_component", "html_element", "hook", "story", "unknown"

## Data available

The store contains ~20 entities across 5 files:
- src/auth.ts: auth (module), login (async function), logout (async function), validateToken (function)
- src/payment.ts: payment (module), stripeCharge (async function), processRefund (async function), calculateTotal (function)
- src/app.tsx: App (module), App (jsx_component), handleClick (async function), renderDashboard (function)
- src/service.ts: UserService (class), getUser (async method), saveUser (async method), deleteUser (async method)
- src/utils.ts: utils (module), formatCurrency (function), validateEmail (function), hashPassword (async function)

Key relationships:
- handleClick calls stripeCharge and login
- login calls validateToken and hashPassword
- stripeCharge calls calculateTotal
- processRefund calls stripeCharge
- renderDashboard calls getUser
- getUser calls validateToken
- saveUser calls validateEmail and hashPassword
- UserService contains getUser, saveUser, deleteUser
- app imports auth, payment; payment imports utils; auth imports utils

External deps: payment uses stripe (Stripe, PaymentIntent); auth uses jsonwebtoken (jwt), bcrypt; app uses react, express

## Instructions

Given a natural language question about this codebase, write a TypeScript function body that uses the \`store\` variable (a DatomStore instance) to answer the question.

Return ONLY valid TypeScript code. The code should assign its final result to a variable called \`result\`.
Do NOT include import statements or type declarations — \`store\` is already available.
Do NOT wrap in a function — just the body.
Do NOT include markdown code fences.`;

// ---------------------------------------------------------------------------
// The 10 Test Questions
// ---------------------------------------------------------------------------

export interface TestQuestion {
  id: number;
  question: string;
  /** Validate the result produced by the generated code */
  validate: (result: unknown, store: DatomStore) => ValidationResult;
}

export interface ValidationResult {
  pass: boolean;
  expected: string;
  actual: string;
}

export const TEST_QUESTIONS: TestQuestion[] = [
  {
    id: 1,
    question: "What functions exist in auth.ts?",
    validate: (result, _store) => {
      const arr = toStringArray(result);
      const expected = ["login", "logout", "validateToken"];
      const pass = expected.every((n) => arr.includes(n)) && arr.length >= 3;
      return { pass, expected: expected.join(", "), actual: arr.join(", ") };
    },
  },
  {
    id: 2,
    question: "What does handleClick call, and are those calls async?",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      const hasStripeCharge = str.includes("stripeCharge");
      const hasLogin = str.includes("login");
      const pass = hasStripeCharge && hasLogin;
      return {
        pass,
        expected: "stripeCharge (async), login (async)",
        actual: str,
      };
    },
  },
  {
    id: 3,
    question: "Who calls stripeCharge?",
    validate: (result, _store) => {
      const arr = toStringArray(result);
      const expected = ["handleClick", "processRefund"];
      const pass = expected.every((n) => arr.some((a) => a.includes(n)));
      return { pass, expected: expected.join(", "), actual: arr.join(", ") };
    },
  },
  {
    id: 4,
    question: "What external APIs does the auth module use?",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      const hasJwt = str.includes("jsonwebtoken") || str.includes("jwt");
      const hasBcrypt = str.includes("bcrypt");
      const pass = hasJwt && hasBcrypt;
      return {
        pass,
        expected: "jsonwebtoken, bcrypt",
        actual: str,
      };
    },
  },
  {
    id: 5,
    question:
      "What is the blast radius if I change validateToken? (What depends on it transitively?)",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      // validateToken is called by login and getUser
      // login is called by handleClick
      // getUser is called by renderDashboard
      const hasLogin = str.includes("login");
      const hasGetUser = str.includes("getUser");
      const pass = hasLogin && hasGetUser;
      return {
        pass,
        expected: "login, getUser (+ their callers: handleClick, renderDashboard)",
        actual: str,
      };
    },
  },
  {
    id: 6,
    question: "Find all exported async functions",
    validate: (result, _store) => {
      const arr = toStringArray(result);
      // login, logout, stripeCharge, processRefund, handleClick, getUser, saveUser, deleteUser, hashPassword
      const expected = [
        "login",
        "logout",
        "stripeCharge",
        "processRefund",
        "handleClick",
        "getUser",
        "saveUser",
        "deleteUser",
        "hashPassword",
      ];
      const matchCount = expected.filter((n) => arr.some((a) => a.includes(n))).length;
      const pass = matchCount >= 7; // Allow some flexibility
      return {
        pass,
        expected: `${expected.length} async exported functions`,
        actual: `${matchCount} matched: ${arr.join(", ")}`,
      };
    },
  },
  {
    id: 7,
    question: "What's the most called function in this codebase?",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      // validateToken: called by login, getUser (2 callers)
      // hashPassword: called by login, saveUser (2 callers)
      // stripeCharge: called by handleClick, processRefund (2 callers)
      // Any of these is acceptable
      const pass =
        str.includes("validateToken") ||
        str.includes("hashPassword") ||
        str.includes("stripeCharge");
      return {
        pass,
        expected: "validateToken or hashPassword or stripeCharge (2 callers each)",
        actual: str,
      };
    },
  },
  {
    id: 8,
    question: "Show me the dependency chain from handleClick to the utils module",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      // handleClick -> stripeCharge -> calculateTotal (in payment.ts)
      // handleClick -> login -> hashPassword (in utils.ts) / validateToken (in auth.ts)
      // payment imports utils, auth imports utils
      const hasChain = str.includes("stripeCharge") || str.includes("login");
      const pass = hasChain;
      return {
        pass,
        expected: "handleClick -> (stripeCharge|login) -> ... -> utils",
        actual: str,
      };
    },
  },
  {
    id: 9,
    question: "Which files would be affected if I rename UserService?",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      // UserService is in service.ts, contains getUser/saveUser/deleteUser
      // getUser is called by renderDashboard (in app.tsx)
      // saveUser calls validateEmail, hashPassword (in utils.ts)
      const hasServiceTs = str.includes("service.ts");
      const pass = hasServiceTs;
      return {
        pass,
        expected: "service.ts (+ possibly app.tsx via getUser)",
        actual: str,
      };
    },
  },
  {
    id: 10,
    question: "What external packages does the payment module depend on?",
    validate: (result, _store) => {
      const str = JSON.stringify(result);
      const hasStripe = str.includes("stripe") || str.includes("Stripe");
      const pass = hasStripe;
      return {
        pass,
        expected: "stripe (Stripe, PaymentIntent)",
        actual: str,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Execution engine
// ---------------------------------------------------------------------------

export interface QuestionResult {
  questionId: number;
  question: string;
  generatedCode: string;
  compiles: boolean;
  producesResult: boolean;
  validation: ValidationResult;
  error?: string;
  attempts: number;
}

export interface HarnessResult {
  results: QuestionResult[];
  passCount: number;
  totalCount: number;
  passRate: number;
}

/**
 * Run a single question through the LLM and evaluate the response.
 * Uses `claude -p` for zero-shot, retries once (one-shot with error feedback).
 */
async function runQuestion(q: TestQuestion, store: DatomStore): Promise<QuestionResult> {
  const prompt = `${DATOMSTORE_API_PROMPT}\n\nQuestion: ${q.question}`;

  let generatedCode = "";
  let attempts = 0;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts = attempt + 1;
    const fullPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous answer produced a runtime error when executed: ${lastError}\nPlease fix the code. TypeScript type annotations are OK — they will be transpiled.`;

    try {
      const { stdout } = await execFileAsync("claude", ["-p", fullPrompt], {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      generatedCode = cleanCode(stdout.trim());
    } catch (err) {
      lastError = `claude -p failed: ${(err as Error).message}`;
      continue;
    }

    // Try to compile and execute
    try {
      const result = executeGeneratedCode(generatedCode, store);
      const validation = q.validate(result, store);
      return {
        questionId: q.id,
        question: q.question,
        generatedCode,
        compiles: true,
        producesResult: true,
        validation,
        attempts,
      };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  return {
    questionId: q.id,
    question: q.question,
    generatedCode,
    compiles: false,
    producesResult: false,
    validation: { pass: false, expected: "valid code", actual: lastError ?? "unknown error" },
    error: lastError,
    attempts,
  };
}

/** Strip markdown fences and leading/trailing whitespace from generated code */
function cleanCode(raw: string): string {
  let code = raw;
  // Remove ```typescript ... ``` wrapping
  code = code.replace(/^```(?:typescript|ts)?\n?/m, "");
  code = code.replace(/\n?```\s*$/m, "");
  return code.trim();
}

/**
 * Transpile TypeScript to JavaScript so it can run in `new Function()`.
 * LLMs produce TypeScript with type annotations — we strip them here.
 */
function transpileTs(code: string): string {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: false,
      removeComments: true,
    },
  });
  return result.outputText;
}

/**
 * Execute LLM-generated code against a DatomStore.
 * The code must assign its answer to `result`.
 * Transpiles TypeScript → JavaScript before execution.
 */
function executeGeneratedCode(code: string, store: DatomStore): unknown {
  const jsCode = transpileTs(code);

  // Build a function that receives `store` and returns `result`
  const wrappedCode = `
    "use strict";
    ${jsCode}
    return typeof result !== 'undefined' ? result : undefined;
  `;

  const fn = new Function("store", wrappedCode);
  return fn(store);
}

/**
 * Run all 10 questions and produce a summary.
 */
export async function runLlmEval(): Promise<HarnessResult> {
  const store = createLlmFixtureStore();
  const results: QuestionResult[] = [];

  for (const q of TEST_QUESTIONS) {
    const result = await runQuestion(q, store);
    results.push(result);
  }

  const passCount = results.filter((r) => r.validation.pass).length;

  return {
    results,
    passCount,
    totalCount: TEST_QUESTIONS.length,
    passRate: passCount / TEST_QUESTIONS.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort extraction of string array from unknown result */
function toStringArray(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        // EntityView-like: extract name
        if ("get" in item && typeof item.get === "function") {
          return String(item.get(":node/name") ?? item.id ?? JSON.stringify(item));
        }
        // Plain object with name field
        if ("name" in item) return String(item.name);
        if ("id" in item) return String(item.id);
        return JSON.stringify(item);
      }
      return String(item);
    });
  }
  if (typeof result === "string") return [result];
  if (result && typeof result === "object") return [JSON.stringify(result)];
  return [];
}
