# Proactive Improvement

> Session-level improvement via Aggregation Contracts: observe interaction patterns, trigger reviews, propose better approaches — without waiting for failures.

**Status**: Proposed — pending validation when first Aggregation Contract triggers in a live session.

**Origin**: Design interview resolving Aggregation Contract shape, approval workflow, and Researcher-Improver coordination ([archived intent](../../archive/creation/proactive-improvement.md)).

**Related Documents**:
- [knowledge-acquisition.md](knowledge-acquisition.md) — Researcher role, sources, dispatch
- [effecthandler-roles.md](effecthandler-roles.md) — Improver as an effectHandler role
- [creation-loop-extensions.md](creation-loop-extensions.md) — Aperture governs what improvement reviews can see
- [concepts-creation-loop Claude window](../../claude/concepts-creation-loop.md) — Reactive improvement (validate/fix), the compounding flywheel
- [concepts-contract Claude window](../../claude/concepts-contract.md) — Contract types including Aggregation

---

## Summary

Three improvement timescales, each using existing concepts:

| Timescale | Trigger | Scope | Mechanism |
|-----------|---------|-------|-----------|
| **Reactive** | Validation failure | Single output | Creation loop: validate → fix → re-validate |
| **Proactive** | Aggregation threshold | Session / interaction batch | Aggregation Contract → review intent |
| **Evolutionary** | Pattern accumulation | Weeks / months | Flywheel: effects → patterns → Contracts → rules |

Proactive improvement is the **warm tier** — between reactive (hot, immediate) and evolutionary (cold, gradual).

## Aggregation Contract

An Aggregation Contract is a **Behavior Contract with a trigger-threshold parameter**. Not a new Contract type.

Additional schema attributes on a standard Behavior Contract:

```clojure
;; Aggregation trigger — proactive improvement example
[:contract:improvement-review :contract/type           :behavior            tx:1 true]
[:contract:improvement-review :contract/trigger-count  10                   tx:1 true]
[:contract:improvement-review :contract/trigger-pattern :session/interaction tx:1 true]
[:contract:improvement-review :contract/trigger-strategy :count-or-event    tx:1 true]
[:contract:improvement-review :contract/trigger-event  :session/end         tx:1 true]
[:contract:improvement-review :contract/produces       :improvement/review-requested tx:1 true]
[:contract:improvement-review :contract/trust-floor    0.6                  tx:1 true]
```

When the threshold is met, the Contract produces an `:improvement/review-requested` intent that enters the creation loop like any other intent.

### Trigger Strategies

| Strategy | Trigger | Best for |
|----------|---------|----------|
| **Count-based** | After N interactions | General session review |
| **Time-based** | After N minutes of activity | Long-running sessions |
| **Pattern-based** | When a pattern repeats N times | Targeted improvement (same error 3 times) |
| **Event-based** | After a significant event | Natural review points (session end, milestone) |
| **Compound** | Any combination with OR/AND | "After 10 interactions OR at session end" |

## Approval Workflow

Surface notification with explicit human approval via the creation loop:

1. Aggregation Contract triggers → produces `:improvement/review-requested`
2. Researcher effectHandler gathers interaction datoms, analyzes patterns
3. Researcher produces `:improvement/analysis-completed` datoms (findings)
4. Improver effectHandler proposes specific improvements:
   - `:improvement/opportunity` — observation ("user corrects formatting 3 times per session")
   - `:rule/proposal-needed` — Contract candidate ("auto-format to user's preferred style")
   - `:skill/creation-requested` — new skill candidate ("create a formatting skill")
5. Improvement datoms enter the creation loop
6. Surface presents proposals to human as notifications with accept/reject/defer
7. Accept triggers next creation step (e.g., actual Contract creation)

**No special approval mechanism.** Same as any human-gated creation step. The Trust Contract on improvement datoms determines which proposals require human approval (all, initially).

## Researcher-Improver Coordination

**Sequential pipeline** — standard effectHandler composition:

```
:improvement/review-requested
  → Researcher effectHandler
    → :improvement/analysis-completed (findings)
      → Improver effectHandler
        → :improvement/opportunity, :rule/proposal-needed, :skill/creation-requested
          → Creation loop (human approval via Surface)
```

Researcher gathers context; Improver proposes changes. No special multi-agent coordination primitive needed — this is the same cascading intent pattern used everywhere in the pipeline.

## Session-Wide, Not Role-Specific

Proactive improvement watches ALL session interactions regardless of which role produced them:

- Researcher interactions: "we keep searching the same 3 docs — should we create a synthesis?"
- Developer interactions: "test failures cluster around the same module — should we flag it?"
- Counselor interactions: "session notes follow the same structure — should we template it?"
- Organiser interactions: "intent classification keeps misrouting clinical intents — retrain?"

## Reactive and Proactive Compose

- **Reactive** catches individual failures immediately
- **Proactive** catches patterns across multiple interactions that no single validation would flag
- An individual failure might be auto-fixed reactively, but if the same failure recurs 5 times, the proactive review proposes a Contract to prevent it

The proactive layer is where **structural improvement** happens — not fixing this output, but preventing this class of problem.
