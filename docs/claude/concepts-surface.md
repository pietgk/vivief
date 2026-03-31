---
topic: surface
status: canonical
depends-on: [concepts-projection]
human-version: ../contract/vivief-concepts-v6.md#23-surface
last-verified: 2026-03-30
---

# Surface

The renderer. A Surface consumes a Projection's output and renders it in one of six modes.

## Six Modes

| Mode | Input | Output |
|------|-------|--------|
| **Stream** | Time-ordered datoms | Activity feed, chat, notifications |
| **Card** | Single entity datoms | Detail page, form, record |
| **Canvas** | Block datoms + CRDT state | Document, notes, Jupyter blocks |
| **Dialog** | Projection(live, in-flight) | AI chat with streaming tokens |
| **Board** | Grouped datoms | Kanban, calendar, roster |
| **Diagram** | Contract + effect datoms | C4, XState viz, sequence diagram |

Streaming is natural -- Dialog renders what the Projection delivers. System visualization is natural -- Diagram renders Contract and handler datoms.

## Surface-Projection Binding

A Projection is a Surface parameter: `Surface(projection, mode)`. The binding is recorded as a datom:

```
[surface:X  :surface/projection  projection:Y  tx:N  true]
```

This makes bindings queryable without introducing a new concept. A Surface can consume multiple Projections via composite Projection. Multiple Surfaces can share a Projection.

## Surface Lifecycle

1. Surface mounts with a Projection and mode
2. Projection delivers datoms according to its delivery mode
3. Surface renders according to its mode and any Render Contract
4. On unmount, ephemeral (live) Projections die; persistent ones continue

## Non-Developer Interaction

Surfaces blend two interaction styles:
- **Direct interaction** -- deterministic, fast (clicking "new session", editing a field)
- **LLM-mediated interaction** -- contextual, generative (asking "summarize this week's patterns")

Deterministic first, LLM when it adds value. A counselor never types "datom" or "Projection."

## Trust Signals in Rendering

When a Surface renders content from datoms with low trust score or non-human source, the Render Contract can require visible provenance:
- "AI draft -- pending review"
- "Source: web (trust: 0.4)"

## Render Contract (optional)

Constrains how a Surface renders:

```typescript
interface RenderContract {
  required?: AttributeKw[]    // must display these attributes
  forbidden?: AttributeKw[]   // must not display these attributes
  a11y: {
    wcag: "2.1-AA" | "2.1-AAA"
    keyboard: boolean
    screenReader: boolean
  }
  trustSignals?: {
    showSource: boolean
    showScore: boolean
    threshold: number
  }
  stories?: StoryDefinition[]
}
```

Accessibility as Contract term: every Surface can have a Render Contract specifying WCAG level, keyboard navigability, and screen reader support. axe scanning validates the a11y terms. Storybook as Contract verification: `Story = Surface(Projection(fixture-datoms))`.

## Key Relationships

- Surface subscribes to Projection(s) for data
- Render Contract constrains display behavior
- Dialog mode pairs naturally with `freshness: "in-flight"` for streaming LLM tokens
- Diagram mode pairs naturally with Contract and effect datoms for system visualization
