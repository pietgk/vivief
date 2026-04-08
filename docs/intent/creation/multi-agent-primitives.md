# Multi-Agent Primitives

> Intent: Sequential, Parallel, and Loop as first-class agent composition abstractions.

**Status**: Open — extracted from [archived high-level-concepts](../../archive/brainstorms/high-level-concepts.md) for focused exploration.

---

## Core Idea

The concept of dispatching to a set of agents (sequentially, in parallel, or looping) is a **first-class abstraction** in vivief. These are not library utilities — they're structural patterns that compose effectHandlers into higher-order behaviors.

Three primitives:
- **SequentialAgent** — handlers execute in order, each receiving prior handler's output
- **ParallelAgent** — handlers execute simultaneously, results merged by a composition handler
- **LoopAgent** — handler re-executes until a termination condition is met

Error handling is first-class at every level — not bolted on after the fact.

### The OpenCode Pattern

The basic agent loop maps to vivief's creation loop:

```
state = init_task_state(request)
while not state.done:
  prompt = build_prompt(state)
  response = call_llm(prompt)
  actions = parse_actions(response)
  state = apply_actions(state, actions)
  stream_updates(state)
```

In vivief terms: LLM responses are tool calls to effectHandlers. The loop is the creation loop. `build_prompt` is a Projection. `stream_updates` renders on a Surface.

## Overlapping Concepts

- **effectHandler roles** ([effecthandler-roles.md](effecthandler-roles.md)) — roles define handler competence. Multi-agent primitives define handler composition. A ParallelAgent might dispatch to handlers based on their roles.
- **Intent dispatch** ([creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md)) — the aperture-based dispatch model (triage → pool → chorus) IS a form of multi-agent composition. Narrow = sequential (one handler), Wide = parallel (chorus). The primitives may be the implementation of aperture-based dispatch.
- **Proactive improvement** ([proactive-improvement.md](proactive-improvement.md)) — the improvement cycle (detect → research → propose → approve) is a SequentialAgent pattern where each step is an effectHandler.
- **XState v5 actors** ([ADR-0051](../../contract/adr/0051-tech-stack.md)) — XState already provides actor composition (spawn, send, invoke). The question: are multi-agent primitives a vivief-level abstraction or just XState actor patterns?

## Open Questions

1. Are these vivief concepts or XState implementation patterns? If effectHandlers already compose via XState actors, do we need an additional abstraction layer?
2. How does the composition handler in chorus mode (wide aperture) relate to ParallelAgent? Same thing?
3. What's the error model? If one handler in a ParallelAgent fails, does the whole composition fail? Degrade gracefully?
4. How do multi-agent primitives interact with Contracts? Does a SequentialAgent have its own BehaviorContract, or does it inherit from its component handlers?
