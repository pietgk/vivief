/**
 * Datom Module — Public API
 *
 * In-memory datom store with EAVT/AEVT/AVET/VAET indexes.
 */

// Core types
export type {
  Attribute,
  BenchmarkResult,
  Datom,
  DatomOp,
  DatomStore,
  DatomValue,
  EdgeDatomValue,
  EntityId,
  EntityView,
  ExternalRefDatomValue,
  LoadResult,
  TxId,
} from "./types.js";

// Store implementation
export { InMemoryDatomStore } from "./datom-store.js";

// Loader
export { loadFromArrays } from "./loader.js";
export type { LoadableData } from "./loader.js";

// Graph deps (ported query)
export { graphDepsDatom } from "./graph-deps-datom.js";
export type { DepResult, GraphDepsDatomParams } from "./graph-deps-datom.js";

// Compact store
export { CompactDatomStore } from "./compact-datom-store.js";

// Intern pool
export { InternPool } from "./intern-pool.js";

// Benchmark V1
export { runBenchmark } from "./benchmark.js";

// Benchmark V2
export {
  batchTimingNs,
  formatBenchmarkV2,
  formatScalingTable,
  generateRealisticData,
  runBenchmarkV2,
  runScalingCurve,
  takeMemorySnapshot,
  warmup,
} from "./benchmark-v2.js";
export type {
  BatchTimingResult,
  BenchmarkV2Result,
  IndexLatency,
  MemorySnapshot,
  ScalePoint,
} from "./benchmark-v2.js";

// Benchmark comparison
export {
  formatComparisonReport,
  runComparison,
} from "./benchmark-comparison.js";
export type {
  ComparisonResult,
  StoreComparisonAtScale,
} from "./benchmark-comparison.js";

// LLM test harness
export {
  createLlmFixtureStore,
  DATOMSTORE_API_PROMPT,
  LLM_FIXTURE,
  runLlmEval,
  TEST_QUESTIONS,
} from "./llm-test-harness.js";
export type {
  HarnessResult,
  QuestionResult,
  TestQuestion,
  ValidationResult,
} from "./llm-test-harness.js";

// Template test harness
export {
  ROUTING_TEST_CASES,
  runRoutingEval,
  TEMPLATE_CATALOG,
} from "./template-test-harness.js";
export type {
  QueryTemplate,
  RoutingEvalResult,
  RoutingResult,
  RoutingTestCase,
  TemplateParam,
} from "./template-test-harness.js";
