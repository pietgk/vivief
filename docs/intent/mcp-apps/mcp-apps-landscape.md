---
topic: mcp-apps-landscape
status: intent
depends-on: [concepts-surface, concepts-effecthandler, concepts-contract, arch-security]
last-verified: 2026-04-20
---

# MCP UI for Vivief — Landscape, Mapping, and Where to Spike

## TL;DR

The UI-over-MCP space consolidated in late 2025 / early 2026. What looked like three
rendering protocols (MCP-UI, OpenAI Apps SDK, Claude Desktop widgets) is now **one
standard** — **MCP Apps (SEP-1865)** — with two SDKs (`@modelcontextprotocol/ext-apps`
and `@mcp-ui/client`) and multiple hosts (Claude, ChatGPT, VS Code, Goose, Postman,
MCPJam) that all speak the same protocol.

For Vivief this means:

- **Consumer-facing extension point (the stated goal):** implement MCP Apps as a
  Surface sub-mode. Any MCP Apps-compliant server (Excalidraw, charts, maps, etc.)
  becomes an embeddable sub-component in a Vivief Surface for free.
- **Vivief-as-MCP-server (the cool-idea side-door):** package each Surface mode as an
  MCP App resource. This gets us instant interop with every compliant host without
  building bespoke integrations.
- **Primitives map cleanly:** MCP Apps' `_meta.ui.resourceUri` + sandboxed iframe +
  JSON-RPC-over-postMessage is structurally the same shape as Vivief's Projection
  binding + trust-scored Surface + effectHandler dispatch. The translation is
  mechanical, not conceptual.

The honest answer to "which approach?" is: pick MCP Apps. The other two either
fed into it or are now SDKs that target it.

---

## What we're designing for

Piet's request, pinned down in the interview:

1. A **playground** for experimenting with MCP-rendered UI the way Claude Desktop
   delivers it (e.g. Excalidraw-MCP drawing a UI while the human watches).
2. The production goal: **MCP apps as UI sub-components inside a Vivief Surface** —
   third-party servers as a consumer-facing extension point.
3. Side-door that emerged: Vivief Surfaces exposed **as an MCP server** so
   Claude/ChatGPT/VS Code can embed them.
4. Compare all three protocol contenders and recommend.
5. Deliverable: architectural brief now. Spike definition next.

---

## The three contenders (and why there is really only one)

### 1. MCP-UI (community project, `mcpui.dev`)

The first serious attempt at UI over MCP. Introduced the `UIResource` convention
with the `ui://` URI scheme and three content types: inline HTML, external URL, and
Remote DOM (Shopify's sandboxed JS-to-host-component bridge).

Status today: the SDK (`@mcp-ui/server`, `@mcp-ui/client`) lives on and has been
re-aligned as the **reference implementation and community playground for
SEP-1865**. Remote DOM support was **removed** from the mainline — the docs
explicitly say so — because SEP-1865 chose plain sandboxed HTML for its v1.

Adopters: Postman, HuggingFace, Shopify, Goose, ElevenLabs.

### 2. OpenAI Apps SDK

Launched November 2025 for ChatGPT. Same shape — iframe + postMessage — but
originally ChatGPT-specific. OpenAI folded their patterns into SEP-1865 and
ChatGPT now implements the shared bridge. Their docs explicitly say: *build with
the MCP Apps standard bridge by default; use `window.openai` only for
ChatGPT-specific extras.*

Relevant to us only as historical context. Not a separate target.

### 3. MCP Apps / SEP-1865 (the standard)

Proposed November 2025 by MCP core maintainers at Anthropic and OpenAI together
with the MCP-UI maintainers. Officially released **January 26, 2026** as the
first official MCP extension (`io.modelcontextprotocol/ui`).

Shape:

- Tool declares `_meta.ui.resourceUri` pointing at a `ui://…` resource.
- Resource has `mimeType: "text/html;profile=mcp-app"` and bundled HTML/JS.
- Host renders it in a **sandboxed iframe** (in practice double-iframe for
  origin isolation).
- UI ↔ host communication uses **MCP's existing JSON-RPC over `postMessage`** —
  no new protocol. UI can call server tools, push context to the model, open
  links, log events. Host controls what's allowed.
- `_meta.ui` on the resource carries a CSP plus permission requests
  (microphone, camera, etc.).
- Mobile hosts (Claude.ai) use a native WebView instead of an iframe. Same
  message bridge.

Host support at time of writing: Claude, Claude Desktop, ChatGPT, VS Code
GitHub Copilot, Goose, Postman, MCPJam.

### What this means for our comparison

The MCP Apps SEP *is* the consolidated answer. MCP-UI and Apps SDK both aligned
behind it. "Which protocol" is no longer the real question; the real questions are:

- Which **SDK** do we use to render? (`@mcp-ui/client` React components vs.
  `@modelcontextprotocol/ext-apps` AppBridge — both target SEP-1865.)
- Where in Vivief's model does an MCP App **live**?
- What's our security posture given iframe-hosted untrusted code?

---

## Mapping onto Vivief

Putting the two sides cleanly:

### A — Vivief Surface as **host** (third-party MCP App as sub-component)

The target. Translation of MCP Apps primitives → Vivief:

| MCP Apps concept | Vivief concept |
|---|---|
| MCP server tool result | Intent producing datoms via effectHandler |
| Tool with `_meta.ui.resourceUri` | Effect whose output Surface can embed |
| `ui://…` resource (HTML bundle) | Embed payload addressed by datom |
| Sandboxed iframe | New Surface render sub-mode (`Embed`) |
| `postMessage` JSON-RPC `ui/*` | Bridge that translates UI events → intents |
| UI-initiated `tools/call` | New intent queued through effectHandler |
| `_meta.ui.csp` + permissions | Render Contract term (`embed.csp`, `embed.permissions`) |
| Host consent for tool calls | Trust-score gate / human-in-the-loop in creation loop |

Concretely we'd add:

```typescript
// New Surface mode
interface EmbedSurface {
  mode: "embed";
  source: {
    kind: "mcp-app";
    resourceUri: string;            // ui://excalidraw/canvas
    serverId: DatomId;              // which MCP server this came from
    structuredContent?: unknown;    // payload pushed into the iframe
  };
  contract: RenderContract & {
    embed?: {
      csp: string;                  // from _meta.ui.csp
      permissions: string[];        // mic, camera, clipboard-write…
      allowToolCalls: "deny" | "prompt" | "trusted-only";
    };
  };
}
```

The bridge: every `ui/*` postMessage becomes an intent datom.
`requestToolCall(name, args)` is not dispatched directly — it flows through the
effectHandler the same way an LLM-proposed change does today. This gives us the
creation-loop's human-approval gate for free; the only new piece is a Contract
term that tells the Surface *how eagerly* to surface approval prompts based on
the source server's trust score.

Aperture (from `concepts-creation-loop-extensions`) applies here too: low
aperture = deterministic replay of last-known-good embed + trusted tool calls
only; high aperture = wider permission, prompt user less.

### B — Vivief **as MCP server** (Surfaces exposed to external hosts)

Pleasingly symmetric and cheap. Each Surface mode maps to an MCP App resource:

- `Canvas` mode → `ui://vivief/canvas/{projectionId}`
- `Board`  mode → `ui://vivief/board/{projectionId}`
- `Diagram` mode → `ui://vivief/diagram/{projectionId}`
- etc.

The server side is a thin wrapper: resolve a Projection → bundle the same
Surface renderer we use locally → serve it as `text/html;profile=mcp-app`.
Tool calls from the embedded Surface back to Vivief are the same intents the
local Surface would emit — they just round-trip over JSON-RPC instead of being
in-process.

**Caveat**: this exposes Projection data to hosts that aren't Vivief. The
Projection's access scope + encryption model already contemplates this, but
we'd want an explicit Contract term for "MCP-exportable: yes/no" at minimum, and
probably a distinct encryption policy. Not hard, just needs to be thought
through.

---

## Platform and transport

- **Desktop (Tauri):** iframe sandbox works natively. MCP servers can run as
  Node sidecars (already a known-good path in our setup). Our hot path.
- **Mobile:** Claude.ai uses a native WebView (WKWebView / Android WebView)
  rather than an iframe. Same postMessage bridge. For Vivief: fine in theory,
  but runs into the Tauri 2.0 iOS/Android Node-sidecar limitation we already
  documented. Options:
  - Run MCP servers **remote** over HTTP/SSE (spec-supported) instead of stdio.
    Loses some of the local-first story but unblocks mobile.
  - Run MCP servers **in-process** inside the Vivief Rust core when the server
    is trusted/first-party (e.g. Vivief-local tools). Third-party servers stay
    remote on mobile.
- **P2P note:** for A (Vivief-as-host), MCP is orthogonal to Iroh/MoQ — the
  MCP server is usually local stdio or LAN HTTP. For B (Vivief-as-server) it
  becomes interesting: a datom-subscribing MCP resource served over an Iroh
  connection is a coherent extension but out of scope for this brief.

---

## Pros / cons of each rendering choice

Not "which protocol" (settled) but "which SDK / integration path". Three live
options.

### Option 1 — `@mcp-ui/client` React components

**Pros**
- Highest-level API. `<UIResourceRenderer resource={…} onUIAction={…} />` and
  done.
- Handles SEP-1865 + legacy MCP-UI servers transparently; broader ecosystem
  coverage in practice.
- Mature, has been in production at Goose/Postman/etc.
- React-native integration with our stack.

**Cons**
- React-specific. If we ever want Surface to render outside React (native
  Tauri UI, terminal, etc.) this doesn't help.
- Extra dependency on a community org. Responsive but not Anthropic-owned.
- Hides the AppBridge primitives — harder to extend when we want Vivief-specific
  behaviour (trust score gating, datom-level auditing).

### Option 2 — `@modelcontextprotocol/ext-apps` AppBridge directly

**Pros**
- The standard SDK, authored alongside the spec. Track record of mirroring
  the spec exactly.
- Framework-agnostic — AppBridge is a plain class. Fits Surface renderer as a
  substrate we build on rather than a component we drop in.
- Easier to interpose Vivief-specific logic (datom emission per message,
  trust-score gating, Contract enforcement) between the iframe and the
  effectHandler.
- Best base for both A (host) and B (server) since the same SDK covers both.

**Cons**
- Lower-level; we write the rendering shell ourselves.
- Newer (stabilised Jan 2026); some rough edges still being sanded.

### Option 3 — Roll our own iframe + postMessage bridge

**Pros**
- Zero external dependency.
- Full control over every byte of the boundary.

**Cons**
- We'd be re-implementing the SEP-1865 spec, including the double-iframe
  security pattern and the JSON-RPC dialect. Weeks of work to match what the
  SDK gives for free.
- Diverges from ecosystem — means our bundle won't necessarily render in
  Claude Desktop when we flip the direction for option B.
- Hard to justify unless we find an actual misalignment between SEP-1865 and
  Surface, which so far we haven't.

---

## Recommendation

**Go with Option 2 (AppBridge SDK directly) as Vivief's substrate**, and
optionally layer `@mcp-ui/client` where a quick-and-dirty React drop-in is
good enough for a given Surface.

Rationale:

- AppBridge is the minimum-surface primitive we need to integrate MCP Apps
  into Surface cleanly and to expose Surfaces as MCP Apps. Using it for both
  directions means one mental model.
- Interposing datom emission on every `ui/*` message is the linchpin of the
  creation-loop story (every interaction becomes queryable, replayable). Doing
  that is natural at the AppBridge level and awkward through
  `@mcp-ui/client`'s React abstraction.
- Trust-score gating and Render Contract enforcement want to sit *between*
  the iframe and the effectHandler. That's exactly where AppBridge lets us
  sit.
- We keep the option to fall back to `@mcp-ui/client` for a fast path (e.g.
  when building the playground UI itself, which doesn't need any Vivief
  semantics).

---

## Open questions before spike

Things we need to decide (probably in a follow-up session):

1. **New Surface mode vs. reuse Canvas?** `Embed` feels right for clarity but
   adds a seventh mode to a concept-page that currently lists six. Worth
   checking whether MCP App embedding is a *mode* or a *source* orthogonal to
   mode.
2. **Trust score → permission policy mapping.** What's the default
   `allowToolCalls` for trust < 0.5, 0.5–0.8, > 0.8?
3. **Datom shape for iframe↔host messages.** Probably `[embed:X
   :embed/message {jsonRpcPayload} tx:N true]` but worth nailing down so
   audit queries are ergonomic.
4. **Mobile story.** Do we ship A on mobile in v1, or desktop-only until we've
   figured out remote-MCP over Iroh?
5. **For B (Vivief-as-server):** which Surface modes do we expose first?
   Diagram and Board are probably the highest-value demos to external hosts.

---

## What a spike would look like (sketch, for next phase)

Two interlocking demos in a dedicated playground:

**Spike 1 — host the Excalidraw MCP App inside a Vivief Surface.**
- Standalone Tauri window with a single `Embed`-mode Surface.
- Mounts the official `excalidraw/excalidraw-mcp` server as a Node sidecar.
- Renders `ui://excalidraw/canvas` via AppBridge.
- Every postMessage is logged as a datom into a scratch DatomStore.
- "Approve tool call?" prompts routed through a placeholder effectHandler.

**Spike 2 — expose a trivial Vivief Surface as an MCP App to Claude Desktop.**
- MCP server declares one tool returning a `ui://vivief/card/{id}` resource.
- Resource is a bundled Card Surface reading from an in-memory Projection.
- Wire up in Claude Desktop's `claude_desktop_config.json`; confirm it renders.

Both together validate the bridge shape in both directions with minimum code.

---

## References

- SEP-1865 spec: https://modelcontextprotocol.io/community/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
- MCP Apps overview + AppBridge: https://modelcontextprotocol.io/extensions/apps/overview
- Official blog (release): https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- Claude.ai design guidelines: https://claude.com/docs/connectors/building/mcp-apps/design-guidelines
- `@mcp-ui/client`: https://mcpui.dev/guide/client/resource-renderer
- `@modelcontextprotocol/ext-apps` examples: threejs-server, map-server, pdf-server, system-monitor-server
- Excalidraw official MCP: https://github.com/excalidraw/excalidraw-mcp
- Alpic comparison (SEP vs. ChatGPT Apps internals): https://alpic.ai/blog/mcp-apps-how-it-works-and-how-it-compares-to-chatgpt-apps
