# OpenTelemetry Integration for Effect Validation

> Implementation guide for test-driven runtime effects using OpenTelemetry.

**Vision**: See [actors.md](../vision/actors.md) Section 3.3 (Runtime Validation)
**Gaps**: See [gaps.md](../spec/gaps.md) Phase 3A and 3B

---

## 1. Overview

This document describes how to integrate OpenTelemetry (OTel) into DevAC to enable:
- Tests producing runtime effects as OTel spans
- Correlation between static effects and runtime spans
- Queries answering "which effects are validated by tests?"

```
┌──────────────────────────────────────────────────────────────┐
│                    OTel Integration Flow                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Tests run          OTel SDK captures       Spans exported    │
│  with tracing  →    effects as spans   →    to hub DB         │
│       │                    │                      │           │
│       ▼                    ▼                      ▼           │
│  ┌─────────┐        ┌─────────────┐       ┌─────────────┐    │
│  │ Vitest  │        │ Effect-aware │       │ Correlation │    │
│  │ + OTel  │   →    │   spans      │   →   │   queries   │    │
│  │ setup   │        │ with IDs     │       │             │    │
│  └─────────┘        └─────────────┘       └─────────────┘    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### 2.1 Components

| Component | Purpose | Location |
|-----------|---------|----------|
| OTel SDK setup | Configure tracing provider | `telemetry/otel-setup.ts` |
| Effect tracer | Create spans with entity IDs | `telemetry/effect-tracer.ts` |
| Span exporter | Export spans to hub | `telemetry/span-exporter.ts` |
| EventEnvelope | Extended with trace context | `events/EventEnvelope.ts` |
| Hub schema | Store spans for queries | `hub/schema/otel-spans.sql` |

### 2.2 Data Flow

```
Test execution
     │
     ▼
┌────────────────┐
│  OTel SDK      │  trace.getTracer("devac")
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Effect Tracer  │  withEffectSpan(entityId, effectType, fn)
└───────┬────────┘
        │
        ▼
┌────────────────┐
│    Spans       │  { name, attributes: { devac.entity_id, ... } }
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Span Exporter  │  Batch export to hub
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ otel_spans     │  Queryable via SQL
│    table       │
└────────────────┘
```

---

## 3. Implementation

### 3.1 OTel SDK Setup

**File**: `packages/devac-core/src/telemetry/otel-setup.ts`

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { DevACSpanExporter } from "./span-exporter";

export function initializeOTel(options: {
  serviceName?: string;
  hubPath?: string;
}) {
  const { serviceName = "devac-tests", hubPath } = options;

  const exporter = new DevACSpanExporter({ hubPath });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    spanProcessor: new SimpleSpanProcessor(exporter),
  });

  sdk.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk.shutdown()
      .then(() => console.log("OTel SDK shut down"))
      .catch((error) => console.error("Error shutting down SDK", error))
      .finally(() => process.exit(0));
  });

  return sdk;
}
```

### 3.2 Effect-Aware Span Creation

**File**: `packages/devac-core/src/telemetry/effect-tracer.ts`

```typescript
import { trace, Span, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("devac", "1.0.0");

/**
 * Execute a function wrapped in an OTel span with effect metadata.
 * The span includes devac.entity_id for correlation with static effects.
 */
export function withEffectSpan<T>(
  entityId: string,
  effectType: string,
  fn: () => T,
  options?: {
    name?: string;
    args?: unknown[];
  }
): T {
  const spanName = options?.name ?? `${effectType}:${entityId.split(":").pop()}`;

  return tracer.startActiveSpan(spanName, (span: Span) => {
    // Set DevAC-specific attributes for correlation
    span.setAttribute("devac.entity_id", entityId);
    span.setAttribute("devac.effect_type", effectType);
    
    if (options?.args) {
      span.setAttribute("devac.args", JSON.stringify(options.args));
    }

    try {
      const result = fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Async version of withEffectSpan
 */
export async function withEffectSpanAsync<T>(
  entityId: string,
  effectType: string,
  fn: () => Promise<T>,
  options?: {
    name?: string;
    args?: unknown[];
  }
): Promise<T> {
  const spanName = options?.name ?? `${effectType}:${entityId.split(":").pop()}`;

  return tracer.startActiveSpan(spanName, async (span: Span) => {
    span.setAttribute("devac.entity_id", entityId);
    span.setAttribute("devac.effect_type", effectType);
    
    if (options?.args) {
      span.setAttribute("devac.args", JSON.stringify(options.args));
    }

    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 3.3 EventEnvelope Extension

**File**: `packages/devac-core/src/events/EventEnvelope.ts`

```typescript
import { context, trace } from "@opentelemetry/api";

export interface EventEnvelope<T> {
  type: string;
  payload: T;
  metadata: {
    timestamp: number;
    // Trace context for correlation
    traceId?: string;
    spanId?: string;
    // Link to static effect
    entityId?: string;
  };
}

/**
 * Create an EventEnvelope with current trace context
 */
export function createEventEnvelope<T>(
  type: string,
  payload: T,
  entityId?: string
): EventEnvelope<T> {
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();

  return {
    type,
    payload,
    metadata: {
      timestamp: Date.now(),
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      entityId,
    },
  };
}
```

### 3.4 Span Exporter

**File**: `packages/devac-core/src/telemetry/span-exporter.ts`

```typescript
import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";

export class DevACSpanExporter implements SpanExporter {
  private hubPath?: string;
  private buffer: ReadableSpan[] = [];
  private batchSize = 100;

  constructor(options: { hubPath?: string }) {
    this.hubPath = options.hubPath;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.buffer.push(...spans);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const spans = this.buffer.splice(0);
    const records = spans.map(this.spanToRecord);

    // Write to hub database
    await this.writeToHub(records);
  }

  private spanToRecord(span: ReadableSpan) {
    return {
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      parent_span_id: span.parentSpanId,
      name: span.name,
      start_time: span.startTime,
      end_time: span.endTime,
      duration_ms: (span.endTime[0] - span.startTime[0]) * 1000 +
                   (span.endTime[1] - span.startTime[1]) / 1_000_000,
      status: span.status.code,
      attributes: JSON.stringify(span.attributes),
      entity_id: span.attributes["devac.entity_id"],
      effect_type: span.attributes["devac.effect_type"],
    };
  }

  private async writeToHub(records: unknown[]): Promise<void> {
    // Implementation: Insert into otel_spans table via DuckDB
    // See hub schema below
  }
}
```

### 3.5 Hub Schema

**File**: `packages/devac-hub/src/schema/otel-spans.sql`

```sql
-- OTel spans table for runtime effect correlation
CREATE TABLE IF NOT EXISTS otel_spans (
  trace_id VARCHAR NOT NULL,
  span_id VARCHAR PRIMARY KEY,
  parent_span_id VARCHAR,
  name VARCHAR NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration_ms DOUBLE,
  status INTEGER,
  attributes JSON,
  -- DevAC-specific fields for correlation
  entity_id VARCHAR,
  effect_type VARCHAR,
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for correlation queries
CREATE INDEX idx_otel_spans_entity_id ON otel_spans(entity_id);
CREATE INDEX idx_otel_spans_effect_type ON otel_spans(effect_type);

-- Effect validation view
CREATE VIEW effect_validation AS
SELECT 
  e.entity_id,
  e.effect_type,
  e.name,
  e.file_path,
  CASE WHEN COUNT(s.span_id) > 0 THEN 'validated' ELSE 'static_only' END as status,
  COUNT(s.span_id) as runtime_count,
  ARRAY_AGG(DISTINCT s.trace_id) as traces
FROM effects e
LEFT JOIN otel_spans s ON e.entity_id = s.entity_id
GROUP BY e.entity_id, e.effect_type, e.name, e.file_path;
```

---

## 4. Test Integration

### 4.1 Vitest Setup

**File**: `vitest.setup.ts`

```typescript
import { initializeOTel } from "@devac/core/telemetry";

// Initialize OTel before tests run
const sdk = initializeOTel({
  serviceName: "my-app-tests",
  hubPath: ".devac/hub",
});

// Ensure cleanup after tests
afterAll(async () => {
  await sdk.shutdown();
});
```

### 4.2 Test Helper

**File**: `packages/devac-test-utils/src/index.ts`

```typescript
import { withEffectSpan, withEffectSpanAsync } from "@devac/core/telemetry";

/**
 * Run a test function with effect tracing
 */
export async function runWithTracing<T>(
  fn: () => Promise<T>
): Promise<{ result: T; spans: SpanInfo[] }> {
  const spans: SpanInfo[] = [];
  
  // Capture spans during execution
  const result = await fn();
  
  // Return result and captured spans for assertions
  return { result, spans };
}

/**
 * Custom matcher for effect spans
 */
export function toContainEffect(spans: SpanInfo[], effectId: string) {
  const found = spans.some(s => s.entityId === effectId);
  return {
    pass: found,
    message: () => `Expected spans to contain effect ${effectId}`,
  };
}
```

### 4.3 Example Test

```typescript
import { runWithTracing, toContainEffect } from "@devac/test-utils";

expect.extend({ toContainEffect });

describe("BookingFlow", () => {
  it("completes booking journey", async () => {
    const { spans } = await runWithTracing(async () => {
      render(<BookingFlow />);
      await userEvent.click(screen.getByText("Select Time"));
      await userEvent.click(screen.getByText("10:00 AM"));
      await userEvent.click(screen.getByText("Confirm"));
    });

    // Verify expected effects were executed
    expect(spans).toContainEffect("BookingFlow:selectTime");
    expect(spans).toContainEffect("BookingFlow:confirmBooking");
  });
});
```

---

## 5. Correlation Queries

### 5.1 Basic Queries

```sql
-- Which effects are validated by tests?
SELECT entity_id, effect_type, status 
FROM effect_validation 
WHERE status = 'validated';

-- Which effects are never tested (dead effects)?
SELECT entity_id, effect_type, file_path 
FROM effect_validation 
WHERE status = 'static_only';

-- Coverage by effect type
SELECT 
  effect_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) as tested,
  ROUND(100.0 * SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) / COUNT(*), 1) as coverage_pct
FROM effect_validation
GROUP BY effect_type;
```

### 5.2 MCP Endpoint

```typescript
// Add to MCP diagnostics
server.tool("get_effect_coverage", async () => {
  const result = await hub.query(`
    SELECT 
      effect_type,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) as tested
    FROM effect_validation
    GROUP BY effect_type
  `);
  
  return {
    coverage: result,
    summary: {
      total: result.reduce((sum, r) => sum + r.total, 0),
      tested: result.reduce((sum, r) => sum + r.tested, 0),
    }
  };
});
```

---

## 6. Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.45.0",
    "@opentelemetry/sdk-trace-base": "^1.18.0",
    "@opentelemetry/resources": "^1.18.0",
    "@opentelemetry/semantic-conventions": "^1.18.0"
  }
}
```

---

## 7. Verification

After implementation, verify:

1. **Unit test**: OTel produces spans with correct attributes
2. **Integration test**: Spans appear in hub database
3. **Query test**: `effect_validation` view returns expected results
4. **Performance test**: Overhead < 10% in test execution

---

*Implementation guide for [actors.md](../vision/actors.md) Section 3.3*
