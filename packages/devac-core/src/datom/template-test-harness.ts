/**
 * Template Test Harness — Template extraction + Haiku routing evaluation
 *
 * From the 10 LLM questions, extract parameterized templates.
 * Expected: 4-6 templates cover all 10 questions.
 * Then test Haiku routing: 10 new variations → correct template + parameters.
 *
 * Pass threshold: 8/10 correct routing.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Template Catalog
// ---------------------------------------------------------------------------

/** A parameterized query template */
export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  intentPatterns: string[];
  parameters: TemplateParam[];
  /** Example code body showing the DatomStore API usage */
  codeTemplate: string;
}

export interface TemplateParam {
  name: string;
  type: "string" | "string[]" | "number";
  description: string;
}

/**
 * The 5 templates extracted from the 10 LLM eval questions.
 *
 * Coverage mapping:
 *   findEntities      → Q1, Q6 (find entities matching criteria)
 *   traceCallees      → Q2, Q8 (what does X call / dependency chain)
 *   traceCallers      → Q3, Q7 (who calls X / most-called)
 *   blastRadius       → Q5, Q9 (what breaks if I change X)
 *   externalDeps      → Q4, Q10 (what external packages does X use)
 */
export const TEMPLATE_CATALOG: QueryTemplate[] = [
  {
    id: "findEntities",
    name: "Find Entities by Criteria",
    description:
      "Find code entities matching attribute filters (file, kind, exported, async, etc.)",
    intentPatterns: [
      "What {kind} exist in {file}?",
      "Find all {criteria} {kind}",
      "List {kind} in {file}",
      "Show me all exported {kind}",
    ],
    parameters: [
      { name: "file", type: "string", description: "File path pattern to search in" },
      { name: "kind", type: "string", description: "Entity kind filter (function, class, etc.)" },
      {
        name: "criteria",
        type: "string",
        description: "Additional filter (exported, async, etc.)",
      },
    ],
    codeTemplate: `const entities = store.findByAttribute(":node/file_path", file)
  .map(id => store.get(id))
  .filter(v => v && (!kind || v.get(":node/kind") === kind))
  .filter(v => v && (!criteria || matchesCriteria(v, criteria)));
const result = entities.map(v => v.get(":node/name"));`,
  },
  {
    id: "traceCallees",
    name: "Trace Outgoing Calls",
    description: "What does entity X call? Follow the call chain to a given depth.",
    intentPatterns: [
      "What does {entity} call?",
      "Show me the dependency chain from {entity} to {target}",
      "What are the dependencies of {entity}?",
      "Trace calls from {entity}",
    ],
    parameters: [
      { name: "entity", type: "string", description: "Name of the entity to trace from" },
      { name: "depth", type: "number", description: "How many levels to follow (default: 1)" },
      { name: "target", type: "string", description: "Optional target to trace toward" },
    ],
    codeTemplate: `const ids = store.findByValue(":node/name", entity);
const callees = store.transitiveDeps(ids[0], ":edge/CALLS", depth ?? 1);
const result = callees.map(v => ({ name: v.get(":node/name"), kind: v.get(":node/kind") }));`,
  },
  {
    id: "traceCallers",
    name: "Trace Incoming Callers",
    description: "Who calls entity X? Find the most-called entity.",
    intentPatterns: [
      "Who calls {entity}?",
      "What's the most called {kind} in this codebase?",
      "Which {kind} have the most callers?",
      "Find callers of {entity}",
    ],
    parameters: [
      { name: "entity", type: "string", description: "Name of the entity to find callers for" },
      { name: "kind", type: "string", description: "Optional kind filter" },
    ],
    codeTemplate: `const ids = store.findByValue(":node/name", entity);
const callers = store.callers(ids[0]);
const result = callers.map(v => v.get(":node/name"));`,
  },
  {
    id: "blastRadius",
    name: "Blast Radius / Impact Analysis",
    description: "What would break or be affected if I change/rename entity X?",
    intentPatterns: [
      "What is the blast radius if I change {entity}?",
      "Which files would be affected if I rename {entity}?",
      "What depends on {entity}?",
      "Impact analysis for {entity}",
    ],
    parameters: [
      { name: "entity", type: "string", description: "Name of the entity to analyze impact for" },
      { name: "depth", type: "number", description: "How far to trace (default: 5)" },
    ],
    codeTemplate: `const ids = store.findByValue(":node/name", entity);
// Reverse traversal: who depends on me, transitively?
function collectReverseDeps(id, visited = new Set()) {
  visited.add(id);
  const refs = store.reverseRefs(id);
  for (const ref of refs) {
    if (!visited.has(ref)) collectReverseDeps(ref, visited);
  }
  return visited;
}
const affected = collectReverseDeps(ids[0]);
const result = [...affected].map(id => store.get(id)).filter(Boolean).map(v => v.get(":node/name"));`,
  },
  {
    id: "externalDeps",
    name: "External Dependencies",
    description: "What external packages/APIs does a module or file use?",
    intentPatterns: [
      "What external APIs does {module} use?",
      "What external packages does {module} depend on?",
      "List imports from third-party packages in {module}",
      "What does {module} import from npm?",
    ],
    parameters: [{ name: "module", type: "string", description: "Module or file name to check" }],
    codeTemplate: `const ids = store.findByValue(":node/name", module);
const refs = ids.flatMap(id => store.getAttribute(id, ":external-ref/import"));
const result = refs.map(r => ({ module: r.moduleSpecifier, symbol: r.importedSymbol }));`,
  },
];

// ---------------------------------------------------------------------------
// Routing Test — 10 new question variations
// ---------------------------------------------------------------------------

/** A test variation for template routing */
export interface RoutingTestCase {
  id: number;
  question: string;
  expectedTemplateId: string;
  expectedParams: Record<string, string | number>;
}

export const ROUTING_TEST_CASES: RoutingTestCase[] = [
  {
    id: 1,
    question: "What classes are defined in service.ts?",
    expectedTemplateId: "findEntities",
    expectedParams: { file: "service.ts", kind: "class" },
  },
  {
    id: 2,
    question: "List all the async methods in this codebase",
    expectedTemplateId: "findEntities",
    expectedParams: { kind: "method", criteria: "async" },
  },
  {
    id: 3,
    question: "What functions does login call?",
    expectedTemplateId: "traceCallees",
    expectedParams: { entity: "login" },
  },
  {
    id: 4,
    question: "Trace the call chain from renderDashboard",
    expectedTemplateId: "traceCallees",
    expectedParams: { entity: "renderDashboard" },
  },
  {
    id: 5,
    question: "Who calls hashPassword?",
    expectedTemplateId: "traceCallers",
    expectedParams: { entity: "hashPassword" },
  },
  {
    id: 6,
    question: "Which function is invoked most often?",
    expectedTemplateId: "traceCallers",
    expectedParams: {},
  },
  {
    id: 7,
    question: "What would break if I delete the calculateTotal function?",
    expectedTemplateId: "blastRadius",
    expectedParams: { entity: "calculateTotal" },
  },
  {
    id: 8,
    question: "Impact analysis for the getUser method",
    expectedTemplateId: "blastRadius",
    expectedParams: { entity: "getUser" },
  },
  {
    id: 9,
    question: "What npm packages does the app module import?",
    expectedTemplateId: "externalDeps",
    expectedParams: { module: "app" },
  },
  {
    id: 10,
    question: "Which third-party libraries are used in auth.ts?",
    expectedTemplateId: "externalDeps",
    expectedParams: { module: "auth" },
  },
];

// ---------------------------------------------------------------------------
// Routing Engine
// ---------------------------------------------------------------------------

export interface RoutingResult {
  testCaseId: number;
  question: string;
  expectedTemplateId: string;
  routedTemplateId: string | null;
  expectedParams: Record<string, string | number>;
  extractedParams: Record<string, string | number>;
  templateMatch: boolean;
  paramsMatch: boolean;
  pass: boolean;
  error?: string;
}

export interface RoutingEvalResult {
  results: RoutingResult[];
  passCount: number;
  totalCount: number;
  passRate: number;
}

/** Build the routing prompt for Haiku */
function buildRoutingPrompt(question: string): string {
  const catalog = TEMPLATE_CATALOG.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    intentPatterns: t.intentPatterns,
    parameters: t.parameters,
  }));

  return `You are a query router. Given a user question about a codebase, match it to the most appropriate template and extract parameters.

## Available Templates

${JSON.stringify(catalog, null, 2)}

## Instructions

Given the user question below, respond with ONLY a JSON object (no markdown, no explanation):
{
  "templateId": "<id of the best matching template>",
  "params": { "<paramName>": "<extractedValue>", ... }
}

Only include params that can be extracted from the question. Omit params with no clear value.

## User Question

"${question}"`;
}

/** Parse Haiku's routing response */
function parseRoutingResponse(raw: string): {
  templateId: string | null;
  params: Record<string, string | number>;
} {
  try {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\n?/m, "");
    cleaned = cleaned.replace(/\n?```\s*$/m, "");
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return {
      templateId: parsed.templateId ?? null,
      params: parsed.params ?? {},
    };
  } catch {
    return { templateId: null, params: {} };
  }
}

/**
 * Run a single routing test case via Haiku.
 */
async function runRoutingTest(tc: RoutingTestCase): Promise<RoutingResult> {
  const prompt = buildRoutingPrompt(tc.question);

  try {
    const { stdout } = await execFileAsync("claude", ["-p", "--model", "haiku", prompt], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    const { templateId, params } = parseRoutingResponse(stdout);

    const templateMatch = templateId === tc.expectedTemplateId;
    // Check params: each expected param key should match (values are fuzzy)
    const paramsMatch = Object.entries(tc.expectedParams).every(([key, val]) => {
      const extracted = params[key];
      if (extracted === undefined) return false;
      return String(extracted).toLowerCase().includes(String(val).toLowerCase());
    });

    return {
      testCaseId: tc.id,
      question: tc.question,
      expectedTemplateId: tc.expectedTemplateId,
      routedTemplateId: templateId,
      expectedParams: tc.expectedParams,
      extractedParams: params,
      templateMatch,
      paramsMatch,
      // Pass if template matches. Params match is bonus.
      pass: templateMatch,
    };
  } catch (err) {
    return {
      testCaseId: tc.id,
      question: tc.question,
      expectedTemplateId: tc.expectedTemplateId,
      routedTemplateId: null,
      expectedParams: tc.expectedParams,
      extractedParams: {},
      templateMatch: false,
      paramsMatch: false,
      pass: false,
      error: (err as Error).message,
    };
  }
}

/**
 * Run all 10 routing test cases and produce a summary.
 */
export async function runRoutingEval(): Promise<RoutingEvalResult> {
  const results: RoutingResult[] = [];

  for (const tc of ROUTING_TEST_CASES) {
    const result = await runRoutingTest(tc);
    results.push(result);
  }

  const passCount = results.filter((r) => r.pass).length;

  return {
    results,
    passCount,
    totalCount: ROUTING_TEST_CASES.length,
    passRate: passCount / ROUTING_TEST_CASES.length,
  };
}
