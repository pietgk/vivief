# ADR-0027: LikeC4 as Primary C4 Documentation Format

## Status

Accepted

## Context

DevAC generates C4 architecture diagrams from code effects to help developers understand system architecture. The current implementation generates both PlantUML (.puml) and LikeC4 (.c4) output formats. However, the PlantUML output has several limitations:

1. **Static Output**: PlantUML generates static images with no interactivity
2. **Verbose Syntax**: C4 macros like `System_Ext()`, `Rel()` are complex and less readable
3. **Limited Source Linking**: No native support for linking diagram elements to source code
4. **No Dynamic Views**: Sequence-like effect flows require separate PlantUML syntax
5. **Poor AI/LLM Integration**: Complex macro syntax is harder for LLMs to generate correctly

LikeC4 offers compelling advantages for DevAC's use case:

1. **Source Code Links**: Native `link` property supports file paths with line numbers (`./src/file.ts#L10-L50`)
2. **Interactive Navigation**: `navigateTo` enables drill-down from containers to components to source
3. **Dynamic Views**: Native `dynamic view` syntax for visualizing effect execution flows
4. **Modern Tooling**: VSCode extension with live preview, real-time updates
5. **Clean DSL**: More readable syntax, better for AI-assisted development
6. **Web Embedding**: React/WebComponents for embedding diagrams in documentation

## Decision

We adopt **LikeC4 as the primary output format** for DevAC's C4 documentation generation, while maintaining PlantUML generation for backward compatibility.

### Key Changes

1. **Default Format**: `devac doc-sync` now defaults to LikeC4 output (`.c4` files)
2. **Format Flag**: New `--format` flag allows choosing output format:
   - `--format likec4` (default): Only generate `.c4` files
   - `--format plantuml`: Only generate `.puml` files
   - `--format both`: Generate both formats
3. **Enhanced LikeC4 Output**:
   - Custom specification blocks based on detected domains
   - Element kinds: `api_server`, `database`, `message_queue`, `payment_service`, etc.
   - Domain tags: `#Payment`, `#Database`, `#Auth`, `#Messaging`
   - Source code links with line numbers on components
   - Relationship kinds: `calls`, `stores`, `retrieves`, `sends`, `authenticates`
4. **Dynamic Effect Views**:
   - `generateDynamicViews()` creates sequence-like diagrams from effect chains
   - `identifyEffectChains()` finds the top N most significant effect flows
   - Effect chains scored by domain importance and external system involvement
5. **Unified Workspace Model**:
   - Single `workspace.c4` file for cross-repo architecture
   - Drill-down navigation from workspace → repo → package → component → source

### Implementation Files

```
packages/devac-core/src/views/
├── c4-generator.ts           # Enhanced LikeC4 exports
├── likec4-spec-generator.ts  # Custom specification generation (NEW)
├── likec4-dynamic-generator.ts # Dynamic view generation (NEW)
└── index.ts                  # Updated exports

packages/devac-core/src/docs/
└── workspace-effects-generator.ts # Unified workspace model

packages/devac-cli/src/commands/
└── doc-sync.ts               # --format flag
```

### Output File Structure

```
package/docs/c4/
├── context.c4           # System context (LikeC4 - default)
├── containers.c4        # Container diagram (LikeC4 - default)
└── context.puml         # (only with --format plantuml or both)

repo/docs/c4/
├── context.c4           # All external systems
├── containers.c4        # Packages as containers
└── effects-flow.c4      # Top repo-wide effect chains (future)

workspace/docs/c4/
└── workspace.c4         # Unified model with all repos
```

## Consequences

### Positive

- **Usable Documentation**: Developers can click through diagrams to source code
- **Effect Flow Visibility**: Dynamic views show how effects execute in sequence
- **Multi-Level Navigation**: Workspace → Repo → Package → Component → Code
- **Rich Metadata**: Tags, technologies, and descriptions on all elements
- **VSCode Integration**: Live preview works with DevAC-generated `.c4` files
- **AI-Friendly**: Clean DSL enables better LLM-assisted diagram generation

### Negative

- **Younger Ecosystem**: LikeC4 has fewer integrations (no Confluence plugin yet)
- **Rendering Dependencies**: Requires LikeC4 CLI or VSCode extension to view
- **Team Adoption**: Developers familiar with PlantUML need to learn new DSL
- **PNG Export**: Static image export requires Playwright in LikeC4

### Neutral

- **Dual Format Support**: Both formats remain available via `--format` flag
- **Migration Path**: Existing PlantUML users can continue using `--format plantuml`

## References

- [LikeC4 Official Site](https://likec4.dev/)
- [LikeC4 GitHub Repository](https://github.com/likec4/likec4)
- [ADR-0026: Federated Documentation Generation](./0026-federated-documentation-generation.md)
- [Implementation Plan](/Users/grop/.claude/plans/federated-herding-sloth.md)
