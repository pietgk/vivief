# Bridging — The Universal Connection Pattern

> Brainstorm document. How does the bridge pattern extend beyond "files ↔ datoms" to cover the complete scope of creation in vivief — developers (pre-LLM, current, future), non-developers, LLM reasoning, and diverse file sources?
>
> The challenge: we defined bridge generally as `File (native medium) ←→ Bridge ←→ Datoms`. But files come from many sources (disk, git, web, LLM reasoning, APIs). And LLMs themselves need bridging — their context, memory, tools, and skills are the "code and state" of reasoning. Contract applies at every bridge boundary. How do we define this elegantly?

---

## The Deeper Pattern

The bridge pattern we defined in the vision doc is:

```
File (native medium) ←→ Bridge ←→ Datoms (intent, provenance, metadata, validation)
```

But this undersells what actually happens. Creation doesn't start with "a file." It starts with **intent**, which gathers from diverse sources, creates through effectHandlers, and lands in native mediums with datom metadata. The fuller pattern:

```
Intent
  → Gather (from sources via inbound bridges)
    → Create (effectHandler, constrained by Contract)
      → Land (outbound bridges to native mediums + datom store)
```

### Sources (inbound bridges)

| Source | What it provides | Bridge mechanism |
|--------|-----------------|-----------------|
| **Datom store** | Existing facts, prior creations, cached results | Projection (already defined) |
| **Local filesystem** | Files on disk | Read/watch + parser |
| **Git** | Versions, history, branches | Git commands → datoms |
| **GitHub** | Issues, PRs, reviews, CI status | gh API / webhooks → datoms |
| **Remote filesystem** | P2P files | iroh-blobs sync |
| **Web** | Reference docs, API specs, content | Scrape → markdown → datoms |
| **LLM reasoning** | Generated text, code, plans, decisions | LLM output → file + datoms |
| **External APIs** | Data from services | API call → response → datoms |
| **User input** | Voice, text, forms, observation | Input handler → datoms |
| **Other agents** | Federated creation results | Agent protocol → datoms |

### Landings (outbound bridges)

| Destination | What lands there | Bridge mechanism |
|-------------|-----------------|-----------------|
| **Files on disk** | Code, images, docs, config | effectHandler writes file |
| **Git** | Commits, branches, tags | Git commands |
| **GitHub** | PRs, issues, comments, reviews | gh API |
| **Datom store** | Metadata, provenance, workflow state, LLM context | Datom assertion |
| **Remote systems** | Deployments, notifications, published content | API calls |
| **iroh-blobs** | P2P replicated files | iroh-blobs write |

### Contract at every boundary

Every bridge — inbound and outbound — is a **Contract enforcement point**:

- **Inbound**: What's accepted? What trust level? Schema Contract validates structure. Trust Contract determines who can write. Projection Contract scopes what the creator can see.
- **Outbound**: What's valid to produce? Behavior Contract constrains effectHandler output. Schema Contract validates datoms before commit. Render Contract validates before display.

This means: **Bridge = effectHandler + Contract at a medium boundary.**

---

## Three Eras of Bridging

### Era 1: Pre-LLM Developer

```
Human intent → think → write code → compile → test → git commit → CI → deploy
```

The developer IS the bridge. Human cognition bridges intent to code. Tools (compiler, linter, tests) are Contracts. Git is versioning. CI is automated Contract validation.

**What vivief adds (if applied retrospectively):**
- Code graph as datoms (devac sync — already exists)
- Workflow state as datoms (which issue, which branch, which state)
- Intent tracking (issue → branch → commits linked via datoms)
- Cache (content-addressed build artifacts)

**Bridge pattern:** Simple. One actor (human), one primary medium (filesystem), well-understood tools. The datom layer adds queryability and provenance but doesn't change the flow.

### Era 2: Current Developer + LLM

```
Human intent → LLM assists → files → git → GitHub → CI → LLM reviews → iterate
```

**The pain**: six disconnected storage systems (see developer-flow.md). The developer maintains:
1. Source code (filesystem)
2. Versions (git)
3. Collaboration (GitHub)
4. AI instructions (CLAUDE.md — manual)
5. AI memory (.claude/memory/ — markdown, not queryable)
6. AI plans (.claude/plans/ — per-conversation, fragile)
7. Code analysis (devac datoms)
8. AI conversation context (lost on compaction)

**Bridge burden is HIGH.** The developer is manually bridging between all these systems. The LLM re-reads everything each conversation. Context compaction loses reasoning. Review→fix links live only in human memory.

**What vivief adds:**
- Datom store as glue — replaces scattered state with queryable, linked facts
- LLM context as datoms — survives compaction, loads via Projection
- Intent→code→review→fix chain as linked datoms — automatic provenance
- Bridge hooks (git hooks, file watchers, webhooks) → event-driven datom production

**Bridge pattern:** More complex. Two actors (human + LLM), multiple mediums, multiple bridge mechanisms. The datom layer SIMPLIFIES by replacing 6+ disconnected systems with one queryable store.

### Era 3: Future — LLM-Native Creation

```
Intent → LLM reasons with full datom context → creates across mediums → Contracts validate → lands
```

The LLM becomes a **first-class bridge participant**, not an assistant bolted onto human tools. It reads intent from datoms, gathers context via Projection, creates through effectHandlers, and its reasoning state IS datoms.

**Key shift:** In Era 2, the LLM uses tools (MCP, CLI) that bridge it to mediums. In Era 3, the LLM's tools ARE bridges — each tool is an effectHandler that connects the LLM to a specific medium, governed by Contracts.

**What changes:**
- LLM context loading = `Projection(workflow:X, delivery: snapshot, depth: refs)`
- LLM memory = datoms (not .claude/memory/ markdown)
- LLM plans = datoms with StateMachine (not .claude/plans/ markdown)
- LLM tool use = effectHandler invocation (governed by Behavior Contract)
- LLM output validation = in-flight Contract (streaming)
- Multi-LLM collaboration = federated creation (agents as actors, Sync Contract for coordination)

**Bridge pattern:** The LLM's entire interaction with the world is bridging. Every tool call crosses a medium boundary. Every output passes a Contract. The bridge pattern IS the LLM runtime.

---

## The LLM Bridge (Deep Dive)

### LLM aspects as bridge concepts

| LLM aspect | What it is today | Bridge analogy | As datoms |
|-----------|-----------------|---------------|-----------|
| **Context window** | Conversation messages, compacted | Working memory | Projection(snapshot) loads relevant datoms on demand |
| **Memory** | .claude/memory/*.md with frontmatter | Persistent knowledge | Memory datoms — queryable, typed, survives compaction |
| **Plans** | .claude/plans/*.md, one per task | Workflow state | Plan datoms + StateMachine Contract tracking steps |
| **Tools** | MCP tools, bash, file read/write | Bridge endpoints | Each tool = effectHandler bridging LLM to a medium |
| **Skills** | Slash commands (/commit, /review-pr) | Reusable workflows | Named effectHandler patterns with Behavior Contracts |
| **Reasoning** | In-context chain of thought | Creation process | In-flight datoms — decisions captured as they happen |
| **Output** | Text, code, files | Artifacts | Landing via outbound bridges to native mediums |
| **Conversation** | Tx log with compaction | Append-only log | Key decisions survive as datoms; rest can compact |

### Contract governs every LLM bridge boundary

| Contract type | What it governs in LLM context |
|--------------|-------------------------------|
| **Schema Contract** | Structure of memory datoms, plan datoms, action datoms |
| **Projection Contract** | What the LLM can see — scoped by task, redacted by trust |
| **Behavior Contract** | Which tools/effects the LLM can invoke, output constraints |
| **Trust Contract** | LLM trust level per domain — sandboxed for code, gated for clinical |
| **In-flight Contract** | Validates streaming output — no diagnosis language, cultural rules |
| **Sync Contract** | Multi-agent coordination — who creates what, conflict resolution |

### What this looks like practically

**Loading context (inbound bridge):**

```
New conversation starts on issue #42:

1. Hook (UserPromptSubmit) fires
2. Projection(workflow:42, delivery: snapshot, depth: refs) → loads:
   - Issue intent + acceptance criteria (from GitHub bridge)
   - Prior LLM decisions + approach (from memory datoms)
   - Current plan state — which step (from plan datoms)
   - Active diagnostics (from devac bridge)
   - Recent review comments (from GitHub bridge)
3. Injected into LLM context as structured summary
4. LLM starts with full awareness — no re-reading

Today: LLM re-reads issue via gh api, re-reads files, re-reads memory markdown.
With datoms: one Projection query returns everything linked to the workflow.
```

**Producing output (outbound bridge):**

```
LLM creates a file:

1. LLM invokes tool: Write("session-recap.ts", code)
   → Behavior Contract: LLM allowed to write .ts files in sandbox
2. File lands on filesystem (native medium)
3. Bridge (devac sync) runs:
   → Parses code → code graph datoms
   → Records provenance: [file:X :file/created-by :ai :file/intent workflow:42]
4. Validation Contract triggers:
   → TypeScript check → diagnostic datoms
   → Lint check → diagnostic datoms
5. Results available via Projection for LLM's next turn

Today: LLM writes file, runs typecheck manually, reads output, fixes.
With datoms: validation is automatic, results are datoms, fix cycle is the Creation Loop.
```

**Persisting decisions (memory bridge):**

```
LLM makes an architectural decision:

1. LLM decides: "Use XState for state machine because it maps to Behavior Contract"
2. Instead of writing to .claude/memory/decision.md:
   → Assert datom: [decision:D :decision/what "Use XState"
                     :decision/why "Maps to Behavior Contract"
                     :decision/workflow workflow:42]
3. Decision survives context compaction (it's in the datom store, not conversation)
4. Next conversation: Projection loads decisions for workflow:42
5. LLM has the decision without re-discovering it

Today: decision in .claude/memory/decision.md — flat file, may not load if memory is full.
With datoms: structured, linked to workflow, loads by relevance via Projection.
```

---

## Non-Developer Users (Domain Experts + LLM)

### The key insight

Non-developers don't interact with filesystem, git, or GitHub. Their bridge is **LLM-mediated**. The LLM bridges their domain intent to the appropriate creation medium.

```
Domain expert intent
  → LLM understands (Projection loads domain context)
    → LLM creates (effectHandler, constrained by domain Contract)
      → Artifact lands in appropriate medium + datom store
```

### User archetypes

**Counselor:**
```
Intent: "Document today's session with Alex"
Sources: Voice recording, prior sessions (datoms), treatment plan (datoms)
Bridge: Voice → transcription (system effectHandler) → datom-native clinical notes
Contract: Clinical safety (no diagnosis from AI), consent (Trust Contract)
LLM role: Transcription → theme extraction (gated) → risk flagging (gated)
Landing: Clinical notes as datoms (native), summary report as file (bridge)
```

No filesystem. No git. The counselor speaks, the system creates datoms. The LLM assists within clinical Contracts. Files (reports) are generated as needed from datom content.

**Data analyst:**
```
Intent: "Show me Q1 revenue trends by region"
Sources: Data warehouse (external API), prior analyses (datoms), team context (datoms)
Bridge: API → response → datoms, query → Projection → chart datoms
Contract: Data quality (Schema), access control (Projection Contract)
LLM role: Translate question → query (gated), generate visualization (gated)
Landing: Visualization as file (SVG/PNG), analysis as datoms, insight as datoms
```

The analyst's "filesystem" is the data warehouse. The bridge connects external data to datoms. The LLM translates intent to queries.

**Designer:**
```
Intent: "Create a hero image for the session overview page"
Sources: Brand guidelines (datoms), reference images (files), design system (datoms)
Bridge: Design tool or AI generation → file + metadata datoms
Contract: Brand Contract (colors, typography), Render Contract (dimensions, a11y alt-text)
LLM role: Generate image (sandboxed), propose alt-text (gated)
Landing: Image as file (native medium), metadata + provenance as datoms
```

**Writer:**
```
Intent: "Draft the Q1 product update blog post"
Sources: Release notes (datoms), prior posts (files), style guide (datoms)
Bridge: LLM draft → markdown file + structure datoms
Contract: Editorial Contract (tone, accuracy), Brand Contract (voice)
LLM role: Draft (gated → editor reviews), translate (gated per locale)
Landing: Document as file, structure + metadata as datoms
```

**Manager:**
```
Intent: "Plan the next sprint based on roadmap priorities"
Sources: Roadmap (datoms), team capacity (datoms), backlog (GitHub issues via bridge)
Bridge: GitHub API ↔ datoms, planning tool ↔ datoms
Contract: Process Contract (sprint rules), capacity constraints
LLM role: Propose sprint plan (gated), create issues (gated)
Landing: Issues in GitHub (via bridge), sprint state as datoms
```

### Pattern across all non-developer users

1. **Intent is domain-specific** — not "create a file" but "document a session" or "show me trends"
2. **LLM mediates** — translates domain intent to creation actions
3. **Contract is domain-specific** — clinical safety, brand guidelines, data quality, editorial standards
4. **Files are incidental** — sometimes creation produces files, sometimes it's datom-native
5. **The bridge is invisible** — user doesn't know about bridges, datoms, or effectHandlers

This is the same pattern as developer bridging, but the **filesystem is less central** and the **LLM is more central**.

---

## File Sources — The Gathering Bridge

Files aren't just "things on disk." In creation, files come from everywhere:

### Taxonomy of file sources

**1. Datoms → Files (materialization)**
Datoms become files when a native medium is needed:
- Report datoms → rendered PDF
- Clinical notes → exported document
- Config datoms → YAML/JSON file
- Code graph datoms → generated documentation

Bridge direction: outbound. effectHandler reads datoms via Projection, writes file.

**2. Disk → Datoms (existing files)**
Files already on disk get bridged to datom metadata:
- Source code → devac sync → code graph datoms
- Config files → schema parser → structured datoms
- Images → metadata extractor → dimension/alt-text datoms

Bridge direction: inbound. Bridge reads file, produces datoms.

**3. Git → Datoms (version history)**
Git state becomes datoms for queryability:
- Commits → provenance datoms (who, when, why, what files)
- Branches → sandbox state datoms
- Blame → per-line authorship datoms
- Diff → change datoms

Bridge direction: inbound. Git hooks + git commands → datoms.

**4. GitHub → Datoms (collaboration state)**
GitHub state becomes datoms for unified workflow:
- Issues → intent datoms (description, acceptance criteria)
- PRs → promotion datoms (state, files, reviews)
- Reviews → feedback datoms (comments, verdict)
- CI → validation datoms (status, errors)

Bridge direction: bidirectional. Webhooks/polls inbound, gh API outbound.

**5. Web → Datoms (external content)**
Web content becomes datoms for LLM context:
- Documentation → scraped markdown → content datoms
- API specs → parsed → schema datoms
- Reference material → extracted → knowledge datoms

Bridge direction: inbound. Scraper → parser → datoms. Trust: sandboxed (external source).

**6. LLM Reasoning → Files + Datoms (generated content)**
LLM output becomes artifacts:
- Generated code → file on disk + code graph datoms
- Drafted text → markdown file + structure datoms
- Generated image → file + metadata datoms
- Plans/decisions → datoms (may not need files at all)

Bridge direction: outbound (to file) + inbound (to datom store). Trust: gated or sandboxed.

**7. External APIs → Datoms (data integration)**
External data becomes datoms:
- Weather API → forecast datoms
- Translation API → translated content datoms
- Analytics → metric datoms
- Calendar → schedule datoms

Bridge direction: inbound. API client → response parser → datoms. Contract: Schema validation on external data.

**8. User Input → Datoms (direct human creation)**
Direct human input becomes datoms:
- Voice → transcription → datoms
- Form input → validated → datoms
- Canvas editing → CRDT state → datoms
- Chat → message datoms

Bridge direction: inbound. Input handler → datoms. Trust: authoritative (human).

### The gathering pattern

When creation begins, it GATHERS from multiple sources simultaneously:

```
"Create session-recap handler" (intent)
  ├── Datom store: workflow intent, prior decisions, cached analysis
  ├── GitHub: issue description, acceptance criteria (via bridge)
  ├── Filesystem: existing code patterns (via devac bridge)
  ├── Web: XState documentation (via scrape bridge)
  ├── LLM memory: prior approach decisions (via datom Projection)
  └── effectHandler: synthesizes all sources → creates code + datoms
```

Each source has its own inbound bridge. Each bridge has its own Contract. The effectHandler orchestrates gathering via Projection + tool calls, then creates.

---

## Alternatives for Elegance

### Alt A: Bridge as effectHandler

Every bridge IS an effectHandler:
- Inbound bridge = `(state, :bridge/{source}-gathered) => { datoms, intents }`
- Outbound bridge = `(state, :bridge/{medium}-landed) => { datoms, intents }`

```
Inbound:
  handler(:bridge/github-gathered, { issue: 42 })
    => { datoms: [intent datoms], intents: [] }

Outbound:
  handler(:bridge/filesystem-landed, { path: "recap.ts", content })
    => { datoms: [provenance datoms], intents: [:validation/requested] }
```

**Strength:** Clean. No new concept. Bridge dissolves into effectHandler — it's just what effectHandlers do at medium boundaries.

**Weakness:** "Bridge" disappears as vocabulary. When explaining the system, you can't say "the bridge syncs files to datoms" — you'd say "the effectHandler that handles :bridge/filesystem-gathered produces datoms." More precise but less intuitive.

### Alt B: Bridge as named pattern (current approach)

Bridge remains a vocabulary term for effectHandlers that connect native mediums to the datom store. Not a 6th concept, but a recognized pattern:

```
Bridge = effectHandler at a medium boundary + Contract enforcement
```

"devac sync is a bridge." "The GitHub webhook handler is a bridge." "The LLM memory loader is a bridge."

**Strength:** Intuitive vocabulary. People understand "bridge" without knowing about effectHandlers.

**Weakness:** Could become a kitchen sink — anything that connects two things is a "bridge."

### Alt C: Bridge as Contract boundary

The bridge IS defined by its Contract, not its mechanism:

```
Bridge = the Contract that governs what crosses a medium boundary
```

"The GitHub bridge" = the Contract specifying what GitHub events produce which datoms, what trust level, what validation. The effectHandler implements it, but the BRIDGE is the Contract.

**Strength:** Shifts focus from mechanism to governance. "What are the rules for crossing this boundary?" is the right question.

**Weakness:** Conflates bridge with Contract. Not every Contract is a bridge (Schema Contract on datom-native content isn't bridging anything).

### Alt D: Source as concept

Introduce "Source" as a recognized pattern (like artifact):

```
Source = where creation gathers its inputs from
Artifact = what creation produces
Bridge = the effectHandler + Contract connecting source to datom store
```

The creation formula becomes:
```
Sources → (via inbound bridges) → effectHandler → (via outbound bridges) → Artifacts
```

**Strength:** Clean separation. Source and artifact are symmetric. Bridge connects them.

**Weakness:** Adds vocabulary. "Source" is generic. Could be confusing alongside "datom source" or "event source."

### Alt E: Bridge dissolves into Projection + effectHandler

No separate "bridge" concept at all. What we've been calling "bridge" is just:
- **Inbound**: effectHandler that produces datoms from external input
- **Outbound**: effectHandler that writes to a medium based on datom state
- **Context loading**: Projection with appropriate filters and depth
- **Validation**: Contract at pre-commit or in-flight

The word "bridge" was useful for brainstorming, but the concepts already cover it:
- Projection handles gathering (query + access + delivery)
- effectHandler handles creation and landing
- Contract handles validation at boundaries

**Strength:** No new vocabulary. Five concepts are sufficient.

**Weakness:** Loses the mental model of "bridging two worlds." The pattern is real even if the concepts cover it.

---

## Synthesis Questions

1. **Does "bridge" stay as named pattern or dissolve?**
   - Alt A/E: dissolves into effectHandler + Contract (purist)
   - Alt B: stays as vocabulary (pragmatist)
   - Alt C: becomes Contract-centric (governance)
   - Alt D: Source + Artifact + Bridge triad (structured)

2. **How does LLM bridging integrate?**
   - LLM tools = effectHandlers at medium boundaries (this works regardless of bridge vocabulary)
   - LLM context loading = Projection (already defined)
   - LLM memory = datoms (already defined)
   - The question: does the vision doc need to spell this out, or is it an implementation detail?

3. **How do non-developer users change the story?**
   - Their bridge is LLM-mediated (LLM IS the bridge for them)
   - Files are incidental, not central
   - Domain Contracts replace developer tooling (clinical safety vs typecheck)
   - The same concepts apply, but the weight shifts: Projection + Contract become more visible than filesystem + git

4. **Is "gathering" a creation phase worth naming?**
   - The pattern Intent → Gather → Create → Land is real
   - But gathering IS creation (recursive) — gathering from GitHub IS an effectHandler invocation
   - Maybe: gathering is just "the effectHandler reads its inputs via Projection"

---

## Verification Scenarios

### Scenario 1: Counselor's morning (non-developer)

```
Intent: Prepare for today's sessions
Gather:
  - Projection(today's-clients, delivery: snapshot) → loads client history, notes, risk flags
  - No filesystem involved — all datom-native
Create:
  - effectHandler(:brief/preparation-requested) → AI summarizes, flags risks
  - In-flight Contract: no diagnosis language, no unauthorized detail
  - Trust: gated (counselor reviews before acting)
Land:
  - Morning brief as datoms (view on Surface)
  - Optional: brief as markdown file if counselor prefers
Contract boundaries:
  - Projection Contract: counselor sees only own clients (scoped)
  - Trust Contract: AI sees consented data only
  - In-flight Contract: validates AI output mid-stream
```

All 5 concepts present. Bridge = Projection (inbound, from datom store) + effectHandler (creation) + Contract (at every boundary). No filesystem bridge needed — creation is datom-native.

### Scenario 2: LLM context across conversation boundary

```
Conversation 1 ends:
  - LLM has made decisions, written code, has a plan at step 3 of 5
  - Context compacts → conversation summary lossy
  - But: decision datoms, plan datoms, action datoms survive in store

Conversation 2 starts:
  Gather (inbound bridge):
    - Hook fires on UserPromptSubmit
    - Projection(workflow:42, depth: refs) → loads:
      - Issue intent (from GitHub bridge, already in datoms)
      - Decisions made (decision datoms)
      - Plan state (plan datoms — currently at step 3)
      - Actions taken (file create, fix, PR — action datoms)
      - Current diagnostics (from devac bridge)
    - Injected into LLM context
  Create:
    - LLM resumes at step 3 with full awareness
    - No re-reading issue, no re-reading files, no "let me understand what was done"
  Land:
    - New actions → action datoms
    - Updated plan → plan datom state advances
    - Files → filesystem + provenance datoms

Contract boundaries:
  - Projection Contract: LLM sees only workflow:42 scope
  - Behavior Contract: LLM can write to sandbox branch only
  - Schema Contract: memory/plan datoms must follow schema
```

This is the LLM bridge in action. The "inbound bridge" is a Projection with depth. The "outbound bridge" is effectHandler writes to filesystem + datom store.

### Scenario 3: Web scraping → context → code generation (multi-source)

```
Intent: "Implement session recap using XState, following their v5 patterns"
Gather (multiple inbound bridges):
  - Datom store: workflow intent, existing code patterns (via devac bridge)
  - Web: XState v5 docs (scrape → markdown → knowledge datoms)
    - Contract: Trust sandboxed (external content), Schema validates structure
  - GitHub: issue acceptance criteria (via GitHub bridge)
  - LLM memory: prior XState experience (via datom Projection)
Create:
  - LLM synthesizes all sources → generates handler code
  - effectHandler(:file/creation-requested, { path, content })
  - In-flight Contract: code must follow project patterns (from code graph datoms)
Land:
  - File on disk (session-recap.ts)
  - Provenance datoms: [file:X :file/sources [web:xstate-docs, issue:42, memory:xstate-exp]]
  - Code graph datoms (via devac sync bridge)
  - Validation datoms (typecheck + lint via validation bridge)

Contract boundaries:
  - Inbound: Trust Contract on web content (sandboxed, may be stale)
  - Creation: Behavior Contract on LLM (allowed effects, output constraints)
  - Outbound: Schema Contract on datoms, filesystem Contract on file location
  - Validation: TypeScript + lint as Guard Contracts
```

Three different source types, each with its own inbound bridge and trust level. The LLM orchestrates gathering, creates, and the outbound bridges handle landing.

---

## What This Means for the Vision Document

The brainstorm reveals:

1. **Bridge is real as a pattern** — it shows up everywhere creation touches a medium boundary. Whether we call it "bridge" or describe it as "effectHandler + Contract at medium boundary," the pattern exists.

2. **The vision doc's current bridge section is file-centric** — it covers files↔datoms well but misses:
   - LLM-as-bridge-participant (tools as bridge endpoints, context as Projection)
   - Non-developer users (LLM-mediated bridging, files as incidental)
   - Multi-source gathering (creation draws from diverse sources simultaneously)
   - Outbound bridges (datoms→files, datoms→GitHub, datoms→APIs)

3. **Contract at bridge boundaries is underemphasized** — the vision doc shows Contract for validation (typecheck, lint) but doesn't emphasize that EVERY medium boundary is a Contract enforcement point.

4. **The three eras framing clarifies evolution** — pre-LLM (simple bridges), current (painful bridge burden), future (LLM-native bridging). The vision doc should acknowledge this trajectory.

5. **"Gathering" may not need its own name** — it's just "the effectHandler reads its inputs via Projection + tool calls." But the PATTERN of multi-source gathering is worth describing.

---

*Version: brainstorm — bridging as universal connection pattern. Key insight: bridge = effectHandler + Contract at medium boundary. Extends beyond files↔datoms to cover LLM context (inbound via Projection, outbound via datom assertion), non-developer users (LLM-mediated, files incidental), multi-source gathering (web, APIs, git, datoms simultaneously), and three eras of evolution (pre-LLM, current pain, future LLM-native). Five alternatives for elegance: bridge as effectHandler / named pattern / Contract boundary / Source+Artifact triad / dissolves into existing concepts. Contract at every bridge boundary — inbound trust, outbound validation.*
