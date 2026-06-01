# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: one project-wide glossary plus a central ADR directory.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (one global glossary for the whole project).
- **`docs/contract/adr/`** — read ADRs that touch the area you're about to work in. (Note: ADRs live under `docs/contract/adr/`, not the conventional `docs/adr/`, because this repo's docs are organised into `intent/contract/fact/claude/story/archive`.)

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md                         ← project-wide glossary (created lazily)
├── docs/
│   ├── contract/adr/                  ← architectural decision records
│   │   ├── 0024-hub-single-writer-ipc.md
│   │   └── 0042-mcp-tool-naming-conventions.md
│   ├── intent/                        ← intent docs
│   ├── fact/                          ← factual / reference docs
│   └── story/                         ← narrative docs
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0024 (hub single-writer IPC) — but worth reopening because…_
