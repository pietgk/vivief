# Intent: Proactive Improvement

**Status**: Open — discovered during knowledge-acquisition interview, not yet locked

## The Problem

The creation loop has reactive improvement: `validate → fail → fix → re-validate`. The flywheel has evolutionary improvement: `effects → patterns → Contracts → rules` over days and weeks. What's missing is the **middle layer**: proactive session-level improvement that periodically reviews interactions and proposes better approaches — without waiting for a failure to trigger it.

Agent harnesses like Hermes trigger improvement reviews after N session interactions or N tool calls. The question: how does this pattern fit vivief's existing concepts without creating new mechanisms?

## Three Improvement Timescales

| Timescale | Trigger | Scope | Mechanism |
|-----------|---------|-------|-----------|
| **Reactive** | Validation failure | Single output | Creation loop: validate → fix → re-validate |
| **Proactive** | Aggregation threshold | Session / interaction batch | Aggregation Contract → `:improvement/review-requested` |
| **Evolutionary** | Pattern accumulation | Weeks / months | Flywheel: effects → patterns → Contracts → rules |

These are not competing mechanisms. They are the same improvement impulse at different time constants — matching vivief's temperature tiers (hot/warm/cold).

## Proactive Improvement via Aggregation Contracts

Aggregation is already a Contract mode: "derive higher-level facts from lower-level datoms." Proactive improvement is an Aggregation Contract that watches session interaction datoms:

An Aggregation Contract watches session interaction datoms and triggers when a threshold is met:

```clojure
;; Aggregation Contract — proactive improvement trigger
[:contract/type        :aggregation]
[:contract/source      :session/interaction]      ;; watches prompts, tool calls, responses
[:contract/trigger     {:count 10                  ;; after 10 interactions
                        :or {:event :session/end}} ;; OR at session end
[:contract/produces    :improvement/review-requested]
[:contract/trust-floor 0.6]                        ;; only reviews interactions above this trust
```

When triggered, the Contract produces an `:improvement/review-requested` intent that enters the creation loop like any other intent. No special mechanism — just an Aggregation Contract doing what Aggregation Contracts do.

## What Processes the Review

An effectHandler (likely with Researcher and Improver roles) processes the `:improvement/review-requested` intent:

1. **Retrieve** — gather the interaction datoms that triggered the review (the last N prompts, tool calls, responses)
2. **Analyze** — look for patterns: repeated failures, inefficient tool usage, missed opportunities, recurring questions
3. **Synthesize** — produce improvement datoms:
   - `:improvement/opportunity` — a specific observation ("user corrects formatting 3 times per session")
   - `:rule/proposal-needed` — a Contract candidate ("auto-format output to user's preferred style")
   - `:skill/creation-requested` — a new skill candidate ("create a formatting skill")
4. **Surface** — improvement datoms enter the creation loop, where they may be surfaced to the human for approval

The human approves formalization steps (`:rule/proposal-needed` → actual Contract). The system proposes; the human decides. Same trust model as the knowledge maturity path.

## Session-Wide, Not Role-Specific

Proactive improvement is not bound to any specific effectHandler role. It applies to **all session interactions**:

- Researcher interactions: "we keep searching the same 3 docs — should we create a synthesis?"
- Developer interactions: "test failures cluster around the same module — should we flag it?"
- Counselor interactions: "session notes follow the same structure — should we template it?"
- Organiser interactions: "intent classification keeps misrouting clinical intents — should we retrain?"

The Aggregation Contract watches interaction datoms regardless of which role produced them. The improvement review considers the session as a whole.

## Trigger Strategies

The Aggregation Contract's threshold can use different strategies:

| Strategy | Trigger | Best for |
|----------|---------|----------|
| **Count-based** | After N interactions | General session review |
| **Time-based** | After N minutes of session activity | Long-running sessions |
| **Pattern-based** | When a specific pattern repeats N times | Targeted improvement (e.g., same error 3 times) |
| **Event-based** | After a significant event (session end, milestone) | Natural review points |

These compose: "after 10 interactions OR at session end, whichever comes first." The Aggregation Contract supports compound triggers.

## Reactive and Proactive Compose

Reactive improvement (validate/fix) and proactive improvement (aggregation trigger) are not either/or. They compose naturally:

- **Reactive** catches individual failures immediately
- **Proactive** catches patterns across multiple interactions that no single validation would flag
- An individual failure might be auto-fixed reactively, but if the same failure recurs 5 times, the proactive review proposes a Contract to prevent it

The proactive layer is where **structural improvement** happens — not fixing this output, but preventing this class of problem.

## Connection to the Flywheel

Proactive improvement is the **warm tier** of the compounding flywheel:

```
Interaction → effect datoms → Aggregation triggers review → improvement datoms → Contract proposals → human approves → new Contracts → better interactions
```

The flywheel's "LLM observes patterns, proposes Contracts" step is not magic — it's proactive improvement, triggered by Aggregation Contracts, processed by Improver effectHandlers, governed by the same trust model as everything else.

## Open Questions

| Question | Context | Next step |
|----------|---------|-----------|
| **What exactly is an Aggregation Contract?** | Used throughout this doc but not formally defined. How does it differ from a regular Behavior Contract? What's the schema? Is `trigger` a first-class field or metadata? | Needs formalization — candidate for its own contract/ doc |
| **Who approves improvement proposals?** | Line "human approves formalization steps" — but what's the mechanism? A Surface notification? A dialog prompt? An MCP tool? | Design the approval workflow as part of the creation loop |
| **Researcher ↔ Improver handoff** | The Improver role (effecthandler-roles.md) proposes improvements, the Researcher role (knowledge-acquisition.md) investigates context. How do they coordinate? Sequential? Parallel? Who initiates? | Map to multi-agent primitives (multi-agent-primitives.md) |
| **Autoresearch applicability** | Karpathy's [Autoresearch-as-Universal-Skill](https://github.com/balukosuri/Andrej-Karpathy-s-Autoresearch-As-a-Universal-Skill) proposes research as a structural, automatable loop. How do these concepts map to vivief's improvement cycle? | Future brainstorm — evaluate key concepts for adoption |
| **Compound trigger semantics** | "After 10 interactions OR at session end" — what's the formal semantics? Short-circuit? Priority? Reset behavior? | Needs formalization alongside Aggregation Contract schema |

## Research Inputs

- **Karpathy's Autoresearch** — [Autoresearch-as-Universal-Skill](https://github.com/balukosuri/Andrej-Karpathy-s-Autoresearch-As-a-Universal-Skill): positions research as a universal, automatable skill. Relevant to vivief because the proactive improvement loop IS a research loop (observe patterns → form hypotheses → propose changes). Key concepts to evaluate: research as a manually-triggered improvement cycle, structural decomposition of research steps, LLM-as-researcher patterns.

## Related Documents

- [knowledge-acquisition.md](knowledge-acquisition.md) — the interview that surfaced this pattern, Researcher role
- [effecthandler-roles.md](effecthandler-roles.md) — Improver as an effectHandler role
- [multi-agent-primitives.md](multi-agent-primitives.md) — composition patterns for Researcher + Improver coordination
- [creation-loop-extensions.md](../../contract/vision/creation-loop-extensions.md) — aperture governs what improvement reviews can see
- [concepts-creation-loop](../../claude/concepts-creation-loop.md) — reactive improvement (validate/fix), the flywheel
- [concepts-contract](../../claude/concepts-contract.md) — Aggregation as a Contract mode
- [concepts-fractal-software-factory](../../claude/concepts-fractal-software-factory.md) — temperature tiers (hot/warm/cold)
