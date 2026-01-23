# @pietgk/browser-core

Browser automation core engine wrapping Playwright for AI agents and CLI tools.

## Installation

```bash
pnpm add @pietgk/browser-core
```

## Overview

`browser-core` provides a session-based browser automation API built on Playwright. It handles:

- **Session Management**: Create, track, and dispose browser sessions
- **Element References**: Deterministic element identification using test IDs, ARIA labels, and semantic refs
- **Page Reading**: Accessibility tree extraction with interactive element refs
- **Actions**: Click, type, fill, select, scroll, hover, and screenshot

## Basic Usage

```typescript
import { SessionManager } from "@pietgk/browser-core";

// Create a session manager
const manager = new SessionManager();

// Start a new session
const session = await manager.startSession({ headless: false });

// Navigate to a page
await session.navigate("https://example.com");

// Read the page to get element refs
const tree = await session.readPage({ interactiveOnly: true });

// Interact with elements using refs
await session.click("button:Submit");
await session.fill("email-input", "user@example.com");

// Take a screenshot
const screenshot = await session.screenshot();

// Stop the session
await manager.stopSession(session.id);
```

## Element Reference System

Element refs prioritize deterministic identifiers:

1. **testId** - `data-testid` attribute (most stable)
2. **ariaLabel** - Unique `aria-label` attribute
3. **role:name** - Semantic ref from ARIA role + accessible name (e.g., `button:Submit`)
4. **fallback** - Context-aware sequential ref (e.g., `form_1:button_2`)

## Full Documentation

For complete API documentation, CLI commands, and MCP tools, see the [CLAUDE.md](../../CLAUDE.md) file in the repository root.

## License

MIT
