# Other Sessions Knowledge Recap

*Accumulated knowledge from Claude sessions — context document for new conversations*
*Last updated: February 2026*

---

## About Piet

- **Location**: Röfors, Sweden
- **Current role**: Tech lead at health tech company managing 15 engineers across 3 teams (Expo React Native apps, Next.js websites, AWS microservices)
- **Background**: Deep TypeScript/React ecosystem experience, AWS infrastructure, multi-repository development environments, ERP system development (25+ years ago)
- **Workshop**: Extensive DIY experience with Makita 18V tools, woodworking projects
- **Thinking style**: Systematic, seeks elegant simple solutions, thorough research before decisions, likes visual diagrams (mermaid), prefers concise presentation

---

## 1. LLM-Assisted Development Strategy

### Tool Landscape Evaluated

- **Claude Code CLI**: Primary tool, plugin system with skills, MCP server support
- **GitHub Copilot**: Used by some team members (VS Code, Zed, Copilot CLI), supports multiple models
- **Gemini**: Some team members use in various ways
- **Cursor**: `.cursorrules` for project-level AI instructions
- **Continue.dev**: Open source, `.continuerules`, custom slash commands

### Claude Code Plugin Architecture

- Plugins installed via `--plugin-dir` or workspace marketplace.json
- Skills: structured instruction files that guide AI behavior per task type
- Dynamic discovery and composition — multiple skills combine per task
- Commands and CLI commands using devac-core library
- The `view` tool pattern: skills can reference each other

### Key Decision Points

- Claude Max subscription vs API access: built business case for API budget
- Prompt caching strategies for pipeline use
- Claude Code as persistent actor with input queue and `/clear` between tasks
- Token economics: ~200 tokens for module overview, drill down on demand

### Agent Workflow Methodologies Explored

- **SuperClaude v3**: 16 commands, 9 personas, 70% token optimization (Claude Code exclusive)
- **Agent-OS**: Tool-agnostic methodology for structured documentation
- **MCP servers**: GitHub, Postgres, Puppeteer, Notion, Memory Bank, Figma, etc.
- **claude-code-mcp-enhanced**: "Boomerang pattern" for breaking complex tasks into subtasks

---

## 2. MCP (Model Context Protocol) Ecosystem

### MCP Servers Used/Evaluated

- **devac-mcp**: Custom server for vivief/DevAC functionality
- **Postgres MCP** (with Kysely ORM): SQL database access via natural language
- **Mobile MCP**: React Native automation (like Puppeteer for mobile)
- **Atlassian MCP**: Jira/Confluence integration (requires API token auth)
- **MCP Launchpad**: Multi-server management (evaluated against native Claude Code support)
- **Docker MCP**: Container gateway

### MCP Architecture Patterns

- Skills exposed through MCP for multi-model support
- Tool descriptions can embed skill-like guidance
- `get_skill` tool returns relevant SKILL.md content
- Prefix tool responses with contextual guidance
- Testing: vitest for deterministic layer, promptfoo with assertions for skill behavior

---

## 3. Accessibility Testing (WCAG 2.1 AA)

### UI Component Libraries Evaluated

Investigated for accessibility compliance across React and React Native:

- **shadcn/ui**: Recommended for web (built on Radix primitives, good a11y)
- **React Native Reusables**: Recommended for mobile
- **Hybrid approach**: shadcn/ui for web + React Native Reusables for mobile

### Key Principles

- WCAG 2.1 AA as the compliance target
- Accessibility tree-based testing preferred
- Mobile MCP server uses native accessibility trees for interactions

---

## 4. Architecture Documentation Approaches

### C4 Model Integration

Explored mapping ViViEf Effects to C4InterFlow:
- C4InterFlow Flow ↔ Effect as Condition/Loop
- Effect as Message ↔ C4InterFlow Interface
- C4InterFlow Actor ↔ Effect as Actor

### Documentation as Code

- Architecture views auto-generated from code analysis
- Diagrams generated from Effects (mermaid, C4, forced graph views)
- Graph database for LLM-queryable architectural knowledge

### Spec-Driven Development

- Vision documents in natural language (Given/When/Then)
- Specs drive both implementation and architecture validation
- Tests validate implementation against specs
- Architecture views validate specs against reality

---

## 5. Procurement Domain Exploration

### Procurement Analysis System

Built on vivief concepts, explored extracting structured data from Swedish government procurement portals.

### Procurement Primitives Framework

Five primitive types crossed with four directions:
- **Types**: Matter, Energy, Information, Attention, Rights
- **Directions**: Acquire, Dispose, Move, Transform
- Creates 5×4 matrix of atomic procurement operations
- Complex procurements decompose into these atoms
- Self-referential: gaining insights IS procurement (of information)

### Technical Pipeline

TypeScript-first extraction:
- NATS messaging for pipeline coordination
- DuckLake for structured storage
- LLM extraction with Zod schemas for validation
- Four rule types: Validity, Quality, Abstraction, Anomaly
- Source span preservation for audit trails

### Investor Pitch Angles

Five distinct framings developed:
1. "Procurement Compiler" (Enterprise SaaS)
2. Self-improving systems (AI deep tech)
3. Taxpayer transparency (Impact/ESG)
4. Universal process intelligence engine (Platform)
5. Intelligence marketplace (Network-effects)

---

## 6. Database and Storage Decisions

### The Evolution

```
Neo4j → ArangoDB (considered) → PostgreSQL + AGE (evaluated) → Parquet + DuckDB (chosen)
```

### Key Evaluations

| Technology | Context | Verdict |
|-----------|---------|---------|
| **DuckDB** | Code intelligence queries | ✅ Primary analytical engine |
| **Parquet** | Seed file storage | ✅ Columnar, git-versionable |
| **DuckLake** | Lakehouse for derived data | ✅ For computed/versioned analytics |
| **LanceDB** | Vector-native storage | Future option if DuckDB vss insufficient |
| **Neo4j** | Graph queries | ❌ Replaced (too much infrastructure) |
| **ArangoDB** | Multi-model | Interesting but not chosen |
| **PostgreSQL + AGE** | Graph queries in PG | Good if already using PG |
| **Avro** | Hot WAL segments | Recommended for loco WAL format |
| **JSONL** | Simple WAL | Current loco implementation |

---

## 7. OpenTelemetry Strategy (Future)

### Vision

Bridge the gap between static code analysis and runtime behavior:

- Three instrumentation patterns explored: Decorator, Wrapper, Proxy
- Parquet as storage format for OTel traces (popular in observability)
- Custom exporter to send traces to vivief's storage
- Link runtime traces to code paths in the architectural graph
- XState state machine simulations for user interaction testing
- LocalStack for local AWS development testing

### The Promise

Code + runtime = complete architectural understanding:
- Static: "these functions call each other"
- Runtime: "this path was actually used in production"
- Combined: "this dead code path was never executed" or "this hot path needs optimization"

---

## 8. Frontend Architecture Knowledge

### React Native / Expo

- Primary mobile development stack across teams
- Mobile MCP server for automated testing
- Accessibility testing via native accessibility trees

### Next.js

- Primary web development framework
- Used alongside React for web applications

### Web Components

- Browser-native standard for framework-agnostic UI
- Shadow DOM for encapsulated styles
- Custom Elements for reusable components
- Key interoperability layer for multi-framework environments (like Heads)
- React 19 finally fixed poor Web Component interop

### Svelte

- Compiler-based, no virtual DOM
- Tiny bundle sizes (no framework runtime shipped)
- SvelteKit for routing/SSR
- Good Web Component interop (better than React historically)

### Framework Philosophy

Build core UI primitives as Web Components (framework-agnostic), consume from whatever framework the specific app uses. This is the Heads approach and architecturally sound.

---

## 9. Provenance and Data Lineage

### Concept

Provenance = origin, history, chain of custody. Applied across:
- **Data engineering**: Track source systems, transformations (dbt, OpenLineage)
- **Code intelligence**: Vivief answer provenance — every answer traced to source nodes, effect chains, runtime traces
- **Document extraction**: Source span preservation for audit trails

### In Vivief Context

```typescript
interface Provenance {
  codeRefs: CodeReference[]      // file, line, symbol
  runtimeRefs: RuntimeReference[]  // OTel trace IDs, span IDs
  graphPaths: GraphPath[]        // traversal paths that produced the answer
  externalRefs: ExternalRef[]    // Jira tickets, CloudFormation stacks
}
```

---

## 10. Key Recurring Themes

### Piet's Design Principles

1. **Elegantly simple**: Complex systems from simple, composable primitives
2. **Files as truth**: Parquet files, git repos — no server infrastructure where avoidable
3. **Progressive depth**: Start simple, add complexity only when needed
4. **Humans think, LLMs reason, Systems execute**: Each does what they do best
5. **Universal primitives**: Find one abstraction that covers all cases (Effects, Locations)
6. **Challenge before committing**: Always evaluate alternatives with pros/cons before investing
7. **Visual thinking**: Mermaid diagrams, ASCII art, architecture views for understanding
8. **Research thoroughly, then decide**: Comprehensive comparison before implementation

### Architectural Preferences

- TypeScript for most things, C# where .NET ecosystem needed
- Embedded databases over servers (DuckDB, in-memory)
- Columnar formats (Parquet) over row-based
- SQL as the query lingua franca
- Event sourcing / append-only logs for durability
- P2P over client-server where resilience matters
- Web Components for cross-framework interop

### Working Style with Claude

- Likes brainstorm documents that can be shared with teams
- Requests pros/cons analysis before decisions
- Values comprehensive research with honest tradeoff assessments
- Prefers markdown documents for knowledge preservation
- Uses Claude to prepare for interviews, meetings, and team discussions
- Iterates on concepts across multiple sessions
- Documents decisions as ADRs (Architecture Decision Records)

---

## 11. Job Search Context

### Companies Evaluated

- **Heads**: Primary interest, deep technical alignment with Piet's thinking. Interview process ongoing for Senior Engineer role.
- **Tendium**: Swedish procurement platform — explored for procurement domain knowledge
- **Quartr**: Evaluated as potential employer

### Interview Preparation Approach

- Deep technical research on company tech stack
- Brainstorm documents to demonstrate architectural thinking
- Understanding production deployments (what's actually live vs roadmap)
- Identifying intellectual alignment points
- Preparing smart questions about their architecture
- Creating technical vision documents as conversation starters

---

## 12. Useful Technical References

### Tools and Libraries Mentioned Across Sessions

| Tool | Purpose |
|------|---------|
| ts-morph | TypeScript AST extraction |
| DuckDB | Analytical SQL engine (embedded) |
| Parquet (Apache Arrow) | Columnar file format |
| DuckLake | Lakehouse format on Parquet |
| Hypercore/Holepunch | P2P append-only log infrastructure |
| ClearScript | V8 JavaScript engine embedded in .NET |
| NATS | Messaging/pub-sub for pipeline coordination |
| Zod | TypeScript-first schema validation |
| Joern | Code Property Graph analysis (inspiration) |
| SCIP | Sourcegraph Code Intelligence Protocol |
| OpenTelemetry | Observability/tracing standard |
| XState | State machine library |
| shadcn/ui | React UI components (a11y-focused) |
| Kysely | TypeScript SQL query builder |
| LanceDB | Vector-native storage (Arrow-based) |
| Crawl4AI | Web scraping with LLM support |
| promptfoo | LLM evaluation framework |
| AG-UI | Agentic UI protocol |
| CopilotKit | Frontend for AI-assisted UI |
| Semantic Kernel | .NET AI orchestration |
| d2ts | TanStack's differential dataflow engine |
