# @pietgk/browser-cli

Command-line interface for browser automation.

## Installation

```bash
pnpm add -g @pietgk/browser-cli
```

Or link locally for development:

```bash
cd packages/browser-cli && pnpm link --global
```

## Quick Start

```bash
# Start a browser session
browser session start --headed

# Navigate to a page
browser navigate https://example.com

# Read the page to get element refs
browser read --interactive-only

# Interact with elements
browser click "button:Sign In"
browser fill "email-input" "user@example.com"
browser fill "password-input" "secret123"
browser click "button:Submit"

# Take a screenshot
browser screenshot --name login-complete

# Stop the session
browser session stop
```

## Command Categories

### Session Management

```bash
browser session start [--headed] [--viewport WxH]
browser session stop [id]
browser session list
```

### Navigation

```bash
browser navigate <url> [--wait-until load|domcontentloaded|networkidle]
browser reload
browser back
browser forward
```

### Page Reading

```bash
browser read [--selector <css>] [--interactive-only] [--max-elements <n>] [--json]
```

### Element Interaction

```bash
browser click <ref>
browser type <ref> <text> [--delay <ms>] [--clear]
browser fill <ref> <value>
browser select <ref> <value> [--by value|label|index]
browser scroll <up|down|left|right> [--amount <px>] [--ref <ref>]
browser hover <ref>
```

### Screenshots

```bash
browser screenshot [--full-page] [--name <name>] [--selector <css>]
```

### Element Finding

```bash
browser find [--selector <css>] [--text <text>] [--role <role>] [--label <text>]
browser eval <script>
```

## Full Documentation

For complete command reference and options, see the [CLAUDE.md](../../CLAUDE.md) file in the repository root.

## License

MIT
