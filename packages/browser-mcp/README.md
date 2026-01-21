# @pietgk/browser-mcp

MCP (Model Context Protocol) server for browser automation tools.

## Installation

```bash
pnpm add -g @pietgk/browser-mcp
```

Or link locally for development:

```bash
cd packages/browser-mcp && pnpm link --global
```

## Running the Server

```bash
browser-mcp
```

The server exposes browser automation tools via the Model Context Protocol, enabling AI assistants to control web browsers.

## Available Tools

| Tool | Description |
|------|-------------|
| `browser_session_start` | Start new browser session |
| `browser_session_stop` | Stop browser session |
| `browser_session_list` | List active sessions |
| `browser_navigate` | Navigate to URL |
| `browser_reload` | Reload current page |
| `browser_back` | Go back in history |
| `browser_forward` | Go forward in history |
| `browser_read_page` | Get accessibility tree with element refs |
| `browser_get_text` | Get text content of element |
| `browser_click` | Click element by ref |
| `browser_type` | Type text into element |
| `browser_fill` | Fill input field |
| `browser_select` | Select dropdown option |
| `browser_scroll` | Scroll page or element |
| `browser_scroll_into_view` | Scroll element into viewport |
| `browser_hover` | Hover over element |
| `browser_screenshot` | Capture screenshot |
| `browser_find` | Find elements by strategy |
| `browser_evaluate` | Execute JavaScript |

## Element Reference System

Element refs are the primary way to identify and interact with page elements:

- **testId** - `data-testid` attribute (most stable)
- **ariaLabel** - Unique `aria-label` attribute
- **role:name** - Semantic ref (e.g., `button:Submit`)
- **fallback** - Context-aware sequential ref (e.g., `form_1:button_2`)

**Important:** Refs are scoped to page state. Always call `browser_read_page` after navigation to get fresh refs.

## Configuration for AI Assistants

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "browser": {
      "command": "browser-mcp"
    }
  }
}
```

## Full Documentation

For complete tool reference and usage patterns, see the [CLAUDE.md](../../CLAUDE.md) file in the repository root.

## License

MIT
