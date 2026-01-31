/**
 * Effect Schema Types
 *
 * Based on DevAC v3.0 Foundation - Sections 5.3-5.5
 *
 * Effects are immutable data structures that describe:
 * - Code Effects: What code does (FunctionCall, Store, Retrieve, Send)
 * - Workflow Effects: Development activity (FileChanged, SeedUpdated, ValidationResult)
 *
 * Effects form the foundation for:
 * - Understanding code behavior
 * - Generating documentation and diagrams
 * - Tracking development workflow
 * - Enabling the Rules Engine
 */

import { z } from "zod";

// =============================================================================
// Base Effect Schema
// =============================================================================

/**
 * Common fields shared by all effects
 */
export const BaseEffectSchema = z.object({
  /** Unique identifier for this effect instance */
  effect_id: z.string(),

  /** ISO timestamp when this effect occurred/was extracted */
  timestamp: z.string().datetime(),

  /** Source entity that produced this effect */
  source_entity_id: z.string(),

  /** File path where this effect was extracted from */
  source_file_path: z.string(),

  /** Line number in source file */
  source_line: z.number().int().min(1),

  /** Column number in source file */
  source_column: z.number().int().min(0),

  /** Branch name (for delta storage) */
  branch: z.string().default("base"),

  /** Additional context as JSON */
  properties: z.record(z.unknown()).default({}),
});

export type BaseEffect = z.infer<typeof BaseEffectSchema>;

// =============================================================================
// Code Effects - Data Effects (What Happens)
// =============================================================================

/**
 * FunctionCall - Code execution effect
 * Example: userService.getUser() calls db.query()
 */
export const FunctionCallEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("FunctionCall"),

  /** Entity ID of the function being called (if resolved) */
  target_entity_id: z.string().nullable(),

  /** Name of the function/method being called */
  callee_name: z.string(),

  /** Full qualified name if known */
  callee_qualified_name: z.string().nullable(),

  /** Whether this is a method call (obj.method()) vs function call */
  is_method_call: z.boolean(),

  /** Whether this is an async call (await) */
  is_async: z.boolean(),

  /** Whether this is a constructor call (new X()) */
  is_constructor: z.boolean(),

  /** Number of arguments passed */
  argument_count: z.number().int().min(0),

  /** Whether this calls external code (node_modules, external package) */
  is_external: z.boolean(),

  /** External module specifier if is_external is true */
  external_module: z.string().nullable(),
});

export type FunctionCallEffect = z.infer<typeof FunctionCallEffectSchema>;

/**
 * Store - Data persistence effect
 * Example: INSERT INTO users, dynamodb.put(), redis.set()
 */
export const StoreEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Store"),

  /** Type of store operation */
  store_type: z.enum(["database", "cache", "file", "queue", "external"]),

  /** Operation being performed */
  operation: z.enum(["insert", "update", "upsert", "delete", "write", "publish"]),

  /** Target resource (table name, cache key pattern, file path, queue name) */
  target_resource: z.string(),

  /** Provider/SDK being used (e.g., "mysql", "dynamodb", "redis", "s3") */
  provider: z.string().nullable(),
});

export type StoreEffect = z.infer<typeof StoreEffectSchema>;

/**
 * Retrieve - Data fetching effect
 * Example: SELECT * FROM users, dynamodb.get(), redis.get()
 */
export const RetrieveEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Retrieve"),

  /** Type of retrieve operation */
  retrieve_type: z.enum(["database", "cache", "file", "queue", "external"]),

  /** Operation being performed */
  operation: z.enum(["select", "get", "read", "fetch", "receive", "scan", "query"]),

  /** Target resource (table name, cache key pattern, file path, queue name) */
  target_resource: z.string(),

  /** Provider/SDK being used */
  provider: z.string().nullable(),
});

export type RetrieveEffect = z.infer<typeof RetrieveEffectSchema>;

/**
 * Send - External communication effect
 * Example: HTTP POST to stripe.com, send email, publish to SNS
 */
export const SendEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Send"),

  /** Type of communication */
  send_type: z.enum(["http", "m2m", "email", "sms", "push", "webhook", "event"]),

  /** HTTP method if applicable */
  method: z.string().nullable(),

  /** Target URL, endpoint, or destination */
  target: z.string(),

  /** Is this a third-party service call? */
  is_third_party: z.boolean(),

  /** Service name if identifiable (e.g., "stripe", "twilio", "sendgrid") */
  service_name: z.string().nullable(),
});

export type SendEffect = z.infer<typeof SendEffectSchema>;

/**
 * Request - Incoming request handler effect
 * Example: API endpoint handler, webhook receiver
 */
export const RequestEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Request"),

  /** Type of request */
  request_type: z.enum(["http", "graphql", "grpc", "websocket", "queue"]),

  /** HTTP method if applicable */
  method: z.string().nullable(),

  /** Route pattern (e.g., "/users/:id", "/api/v1/orders") */
  route_pattern: z.string(),

  /** Framework being used (e.g., "express", "tsoa", "fastify", "trpc") */
  framework: z.string().nullable(),
});

export type RequestEffect = z.infer<typeof RequestEffectSchema>;

/**
 * Response - Outgoing response effect
 * Example: API response, return value
 */
export const ResponseEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Response"),

  /** Type of response */
  response_type: z.enum(["http", "graphql", "grpc", "websocket"]),

  /** Status code if applicable */
  status_code: z.number().int().nullable(),

  /** Response content type */
  content_type: z.string().nullable(),
});

export type ResponseEffect = z.infer<typeof ResponseEffectSchema>;

// =============================================================================
// Code Effects - Flow Effects (Control Structures)
// =============================================================================

/**
 * Condition - Branching logic effect
 * Example: if (user.isAdmin), switch/case
 */
export const ConditionEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Condition"),

  /** Type of conditional */
  condition_type: z.enum(["if", "switch", "ternary", "guard"]),

  /** Number of branches (including else/default) */
  branch_count: z.number().int().min(1),

  /** Whether there's a default/else branch */
  has_default: z.boolean(),
});

export type ConditionEffect = z.infer<typeof ConditionEffectSchema>;

/**
 * Loop - Iteration effect
 * Example: for each order in orders, while, map/filter/reduce
 */
export const LoopEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Loop"),

  /** Type of loop */
  loop_type: z.enum([
    "for",
    "for_of",
    "for_in",
    "while",
    "do_while",
    "map",
    "filter",
    "reduce",
    "foreach",
  ]),

  /** Is this an async iteration? */
  is_async: z.boolean(),
});

export type LoopEffect = z.infer<typeof LoopEffectSchema>;

// =============================================================================
// Code Effects - Group Effects (Organization/C4)
// =============================================================================

/**
 * Group effect types for C4 and architectural organization
 */
export const GroupEffectTypeSchema = z.enum([
  "System", // Top-level boundary (C4 System Context)
  "Container", // Deployment unit (C4 Container diagram)
  "Component", // Code module (C4 Component diagram)
  "File", // Code file
  "Class", // Type definition
]);

export type GroupEffectType = z.infer<typeof GroupEffectTypeSchema>;

/**
 * Group - Organizational boundary effect
 * Used for C4 diagrams and architectural documentation
 */
export const GroupEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("Group"),

  /** Type of grouping */
  group_type: GroupEffectTypeSchema,

  /** Name of the group */
  group_name: z.string(),

  /** Description/purpose of this group */
  description: z.string().nullable(),

  /** Technology stack (for Container level) */
  technology: z.string().nullable(),

  /** Parent group entity ID (for hierarchy) */
  parent_group_id: z.string().nullable(),
});

export type GroupEffect = z.infer<typeof GroupEffectSchema>;

// =============================================================================
// Workflow Effects (Development Process)
// =============================================================================

/**
 * FileChanged - Filesystem watch trigger
 * Handler: Re-analyze, update seed
 */
export const FileChangedEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("FileChanged"),

  /** Type of change */
  change_type: z.enum(["created", "modified", "deleted", "renamed"]),

  /** File path that changed */
  file_path: z.string(),

  /** Previous file path (for renamed files) */
  previous_path: z.string().nullable(),

  /** Package that this file belongs to */
  package_path: z.string(),
});

export type FileChangedEffect = z.infer<typeof FileChangedEffectSchema>;

/**
 * SeedUpdated - Extraction complete
 * Handler: Refresh hub, notify dependents
 */
export const SeedUpdatedEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("SeedUpdated"),

  /** Package that was updated */
  package_path: z.string(),

  /** Repository ID */
  repo_id: z.string(),

  /** Number of nodes in updated seed */
  node_count: z.number().int().min(0),

  /** Number of edges in updated seed */
  edge_count: z.number().int().min(0),

  /** Number of external refs in updated seed */
  ref_count: z.number().int().min(0),

  /** Number of files analyzed */
  file_count: z.number().int().min(0),

  /** Duration of analysis in milliseconds */
  duration_ms: z.number().int().min(0),

  /** Whether this was an incremental update */
  is_incremental: z.boolean(),
});

export type SeedUpdatedEffect = z.infer<typeof SeedUpdatedEffectSchema>;

/**
 * Validation check types
 */
export const ValidationCheckTypeSchema = z.enum([
  "type-check",
  "lint-check",
  "test-check",
  "build-check",
  "coverage-check",
  "security-check",
]);

export type ValidationCheckType = z.infer<typeof ValidationCheckTypeSchema>;

/**
 * ValidationResult - Check complete
 * Handler: Pass/fail with diagnostics
 */
export const ValidationResultEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("ValidationResult"),

  /** Type of validation check */
  check_type: ValidationCheckTypeSchema,

  /** Did the check pass? */
  passed: z.boolean(),

  /** Number of errors/failures */
  error_count: z.number().int().min(0),

  /** Number of warnings */
  warning_count: z.number().int().min(0),

  /** Duration of check in milliseconds */
  duration_ms: z.number().int().min(0),

  /** Package that was validated */
  package_path: z.string(),

  /** Command that was run */
  command: z.string().nullable(),

  /** Exit code */
  exit_code: z.number().int().nullable(),

  /** Summary message */
  summary: z.string().nullable(),
});

export type ValidationResultEffect = z.infer<typeof ValidationResultEffectSchema>;

/**
 * IssueClaimed - Human/LLM action
 * Handler: Create worktree, branch
 */
export const IssueClaimedEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("IssueClaimed"),

  /** Issue number */
  issue_number: z.number().int().min(1),

  /** Issue title */
  issue_title: z.string(),

  /** Repository */
  repo: z.string(),

  /** Who claimed it (user or "claude") */
  claimed_by: z.string(),

  /** Worktree path created */
  worktree_path: z.string().nullable(),

  /** Branch name created */
  branch_name: z.string().nullable(),
});

export type IssueClaimedEffect = z.infer<typeof IssueClaimedEffectSchema>;

/**
 * PRMerged - GitHub event
 * Handler: Clean worktree, update seeds
 */
export const PRMergedEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("PRMerged"),

  /** PR number */
  pr_number: z.number().int().min(1),

  /** PR title */
  pr_title: z.string(),

  /** Repository */
  repo: z.string(),

  /** Base branch merged into */
  base_branch: z.string(),

  /** Head branch that was merged */
  head_branch: z.string(),

  /** Related issue numbers */
  related_issues: z.array(z.number().int().min(1)),

  /** Merge commit SHA */
  merge_commit_sha: z.string().nullable(),
});

export type PRMergedEffect = z.infer<typeof PRMergedEffectSchema>;

/**
 * ChangeRequested - Human/LLM action
 * Handler: Route to appropriate handler
 */
export const ChangeRequestedEffectSchema = BaseEffectSchema.extend({
  effect_type: z.literal("ChangeRequested"),

  /** Type of change requested */
  change_type: z.enum(["feature", "bugfix", "refactor", "docs", "test", "chore"]),

  /** Description of the requested change */
  description: z.string(),

  /** Files affected (if known) */
  affected_files: z.array(z.string()),

  /** Requested by (user ID or "claude") */
  requested_by: z.string(),

  /** Priority */
  priority: z.enum(["low", "medium", "high", "critical"]).nullable(),
});

export type ChangeRequestedEffect = z.infer<typeof ChangeRequestedEffectSchema>;

// =============================================================================
// Union Types
// =============================================================================

/**
 * All Code Effect schemas
 */
export const CodeEffectSchema = z.discriminatedUnion("effect_type", [
  FunctionCallEffectSchema,
  StoreEffectSchema,
  RetrieveEffectSchema,
  SendEffectSchema,
  RequestEffectSchema,
  ResponseEffectSchema,
  ConditionEffectSchema,
  LoopEffectSchema,
  GroupEffectSchema,
]);

export type CodeEffect = z.infer<typeof CodeEffectSchema>;

/**
 * All Workflow Effect schemas
 */
export const WorkflowEffectSchema = z.discriminatedUnion("effect_type", [
  FileChangedEffectSchema,
  SeedUpdatedEffectSchema,
  ValidationResultEffectSchema,
  IssueClaimedEffectSchema,
  PRMergedEffectSchema,
  ChangeRequestedEffectSchema,
]);

export type WorkflowEffect = z.infer<typeof WorkflowEffectSchema>;

/**
 * All Effect types
 */
export const EffectSchema = z.union([CodeEffectSchema, WorkflowEffectSchema]);

export type Effect = z.infer<typeof EffectSchema>;

/**
 * Effect type discriminator values
 */
export type CodeEffectType = CodeEffect["effect_type"];
export type WorkflowEffectType = WorkflowEffect["effect_type"];
export type EffectType = Effect["effect_type"];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique effect ID
 */
export function generateEffectId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `eff_${timestamp}_${random}`;
}

/**
 * Create base effect fields with defaults
 */
function createBaseEffect(
  partial: Partial<BaseEffect> &
    Pick<BaseEffect, "source_entity_id" | "source_file_path" | "source_line">
): BaseEffect {
  return {
    effect_id: partial.effect_id ?? generateEffectId(),
    timestamp: partial.timestamp ?? new Date().toISOString(),
    source_column: partial.source_column ?? 0,
    branch: partial.branch ?? "base",
    properties: partial.properties ?? {},
    ...partial,
  };
}

/**
 * Create a FunctionCall effect
 */
export function createFunctionCallEffect(
  partial: Partial<FunctionCallEffect> &
    Pick<
      FunctionCallEffect,
      "source_entity_id" | "source_file_path" | "source_line" | "callee_name"
    >
): FunctionCallEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "FunctionCall",
    target_entity_id: partial.target_entity_id ?? null,
    callee_qualified_name: partial.callee_qualified_name ?? null,
    is_method_call: partial.is_method_call ?? false,
    is_async: partial.is_async ?? false,
    is_constructor: partial.is_constructor ?? false,
    argument_count: partial.argument_count ?? 0,
    is_external: partial.is_external ?? false,
    external_module: partial.external_module ?? null,
    ...partial,
  };
}

/**
 * Create a Store effect
 */
export function createStoreEffect(
  partial: Partial<StoreEffect> &
    Pick<
      StoreEffect,
      | "source_entity_id"
      | "source_file_path"
      | "source_line"
      | "store_type"
      | "operation"
      | "target_resource"
    >
): StoreEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "Store",
    provider: partial.provider ?? null,
    ...partial,
  };
}

/**
 * Create a Retrieve effect
 */
export function createRetrieveEffect(
  partial: Partial<RetrieveEffect> &
    Pick<
      RetrieveEffect,
      | "source_entity_id"
      | "source_file_path"
      | "source_line"
      | "retrieve_type"
      | "operation"
      | "target_resource"
    >
): RetrieveEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "Retrieve",
    provider: partial.provider ?? null,
    ...partial,
  };
}

/**
 * Create a Send effect
 */
export function createSendEffect(
  partial: Partial<SendEffect> &
    Pick<
      SendEffect,
      "source_entity_id" | "source_file_path" | "source_line" | "send_type" | "target"
    >
): SendEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "Send",
    method: partial.method ?? null,
    is_third_party: partial.is_third_party ?? false,
    service_name: partial.service_name ?? null,
    ...partial,
  };
}

/**
 * Create a ValidationResult effect
 */
export function createValidationResultEffect(
  partial: Partial<ValidationResultEffect> &
    Pick<
      ValidationResultEffect,
      | "source_entity_id"
      | "source_file_path"
      | "source_line"
      | "check_type"
      | "passed"
      | "package_path"
    >
): ValidationResultEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "ValidationResult",
    error_count: partial.error_count ?? 0,
    warning_count: partial.warning_count ?? 0,
    duration_ms: partial.duration_ms ?? 0,
    command: partial.command ?? null,
    exit_code: partial.exit_code ?? null,
    summary: partial.summary ?? null,
    ...partial,
  };
}

/**
 * Create a SeedUpdated effect
 */
export function createSeedUpdatedEffect(
  partial: Partial<SeedUpdatedEffect> &
    Pick<
      SeedUpdatedEffect,
      "source_entity_id" | "source_file_path" | "source_line" | "package_path" | "repo_id"
    >
): SeedUpdatedEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "SeedUpdated",
    node_count: partial.node_count ?? 0,
    edge_count: partial.edge_count ?? 0,
    ref_count: partial.ref_count ?? 0,
    file_count: partial.file_count ?? 0,
    duration_ms: partial.duration_ms ?? 0,
    is_incremental: partial.is_incremental ?? false,
    ...partial,
  };
}

/**
 * Create a FileChanged effect
 */
export function createFileChangedEffect(
  partial: Partial<FileChangedEffect> &
    Pick<
      FileChangedEffect,
      | "source_entity_id"
      | "source_file_path"
      | "source_line"
      | "change_type"
      | "file_path"
      | "package_path"
    >
): FileChangedEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "FileChanged",
    previous_path: partial.previous_path ?? null,
    ...partial,
  };
}

/**
 * Create a Request effect (API endpoint handler)
 */
export function createRequestEffect(
  partial: Partial<RequestEffect> &
    Pick<RequestEffect, "source_entity_id" | "source_file_path" | "source_line" | "route_pattern">
): RequestEffect {
  return {
    ...createBaseEffect(partial),
    effect_type: "Request",
    request_type: partial.request_type ?? "http",
    method: partial.method ?? null,
    framework: partial.framework ?? null,
    ...partial,
  };
}

/**
 * Parse and validate an effect from unknown data
 */
export function parseEffect(data: unknown): Effect {
  return EffectSchema.parse(data);
}

/**
 * Safely parse an effect, returning null on failure
 */
export function safeParseEffect(data: unknown): Effect | null {
  const result = EffectSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Check if an effect is a code effect
 */
export function isCodeEffect(effect: Effect): effect is CodeEffect {
  return CodeEffectSchema.safeParse(effect).success;
}

/**
 * Check if an effect is a workflow effect
 */
export function isWorkflowEffect(effect: Effect): effect is WorkflowEffect {
  return WorkflowEffectSchema.safeParse(effect).success;
}

// =============================================================================
// Effect Mapping Schemas - Developer-Defined Pattern Mappings
// =============================================================================

/**
 * Store operation mapping from FunctionCall pattern to Store effect
 */
export const StoreEffectMappingSchema = z.object({
  /** Pattern to match (e.g., "userRepo.create", "db.insertInto*") */
  pattern: z.string(),
  /** Store type: database, cache, file, queue, external */
  store_type: z.enum(["database", "cache", "file", "queue", "external"]),
  /** Operation: insert, update, upsert, delete, write, publish */
  operation: z.string(),
  /** Provider name (e.g., "mysql", "redis", "dynamodb") */
  provider: z.string(),
  /** Target resource name (e.g., "users", "orders") */
  target: z.string().optional(),
  /** Optional description */
  description: z.string().optional(),
});

export type StoreEffectMapping = z.infer<typeof StoreEffectMappingSchema>;

/**
 * Retrieve operation mapping from FunctionCall pattern to Retrieve effect
 */
export const RetrieveEffectMappingSchema = z.object({
  /** Pattern to match (e.g., "userRepo.findById", "db.selectFrom*") */
  pattern: z.string(),
  /** Retrieve type: database, cache, file, queue, external */
  retrieve_type: z.enum(["database", "cache", "file", "queue", "external"]),
  /** Operation: select, get, read, fetch, receive, scan, query */
  operation: z.string(),
  /** Provider name (e.g., "mysql", "redis", "dynamodb") */
  provider: z.string(),
  /** Target resource name (e.g., "users", "orders") */
  target: z.string().optional(),
  /** Optional description */
  description: z.string().optional(),
});

export type RetrieveEffectMapping = z.infer<typeof RetrieveEffectMappingSchema>;

/**
 * Send (external call) mapping from FunctionCall pattern to Send effect
 */
export const SendEffectMappingSchema = z.object({
  /** Pattern to match (e.g., "stripeClient.*", "sendgrid.send") */
  pattern: z.string(),
  /** Send type: http, m2m, email, sms, push, webhook, event */
  send_type: z.enum(["http", "m2m", "email", "sms", "push", "webhook", "event", "external"]),
  /** Service name (e.g., "stripe", "sendgrid") */
  service: z.string(),
  /** Whether this is a third-party service */
  is_third_party: z.boolean().default(true),
  /** Optional description */
  description: z.string().optional(),
});

export type SendEffectMapping = z.infer<typeof SendEffectMappingSchema>;

/**
 * Request handler mapping for API endpoints
 */
export const RequestEffectMappingSchema = z.object({
  /** Class.Method pattern (e.g., "UserController.getUser") */
  pattern: z.string(),
  /** HTTP method: GET, POST, PUT, DELETE, PATCH */
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]),
  /** Route pattern (e.g., "/users/:id") */
  route: z.string(),
  /** Framework (e.g., "tsoa", "nestjs", "express") */
  framework: z.string().optional(),
  /** Optional description */
  description: z.string().optional(),
});

export type RequestEffectMapping = z.infer<typeof RequestEffectMappingSchema>;

/**
 * Group mapping for architectural organization (C4 diagrams)
 */
export const GroupEffectMappingSchema = z.object({
  /** Name of the group */
  name: z.string(),
  /** Group type: System, Container, Component, File, Class */
  group_type: z.enum(["System", "Container", "Component", "File", "Class"]),
  /** Technology used (e.g., "typescript", "mysql") */
  technology: z.string().optional(),
  /** Parent group name */
  parent: z.string().optional(),
  /** Optional description */
  description: z.string().optional(),
});

export type GroupEffectMapping = z.infer<typeof GroupEffectMappingSchema>;

/**
 * Complete package effect mappings schema
 * This is the structure of docs/package-effects.md parsed into TypeScript
 */
export const PackageEffectMappingsSchema = z.object({
  /** Package metadata */
  metadata: z.object({
    package_name: z.string(),
    last_updated: z.string().optional(),
    verified: z.boolean().default(false),
  }),
  /** Store operation mappings */
  store_operations: z.array(StoreEffectMappingSchema).default([]),
  /** Retrieve operation mappings */
  retrieve_operations: z.array(RetrieveEffectMappingSchema).default([]),
  /** External service call mappings */
  external_calls: z.array(SendEffectMappingSchema).default([]),
  /** Request handler mappings */
  request_handlers: z.array(RequestEffectMappingSchema).default([]),
  /** Architectural groups */
  groups: z.array(GroupEffectMappingSchema).default([]),
});

export type PackageEffectMappings = z.infer<typeof PackageEffectMappingsSchema>;

/**
 * Pattern matching utilities for effect mappings
 */

/**
 * Check if a callee name matches a pattern
 * Supports wildcards: "foo.*" matches "foo.bar", "foo.baz"
 */
export function matchesPattern(calleeName: string, pattern: string): boolean {
  // Convert pattern to regex
  // "foo.*" -> /^foo\..+$/
  // "foo.bar" -> /^foo\.bar$/
  const regexPattern = pattern
    .replace(/\./g, "\\.") // Escape dots
    .replace(/\*/g, ".+"); // Convert * to .+
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(calleeName);
}

/**
 * Find the first matching mapping for a callee name
 */
export function findStoreMapping(
  calleeName: string,
  mappings: StoreEffectMapping[]
): StoreEffectMapping | undefined {
  return mappings.find((m) => matchesPattern(calleeName, m.pattern));
}

export function findRetrieveMapping(
  calleeName: string,
  mappings: RetrieveEffectMapping[]
): RetrieveEffectMapping | undefined {
  return mappings.find((m) => matchesPattern(calleeName, m.pattern));
}

export function findSendMapping(
  calleeName: string,
  mappings: SendEffectMapping[]
): SendEffectMapping | undefined {
  return mappings.find((m) => matchesPattern(calleeName, m.pattern));
}
