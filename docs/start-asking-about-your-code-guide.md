# Start Asking Questions About Your Code

A step-by-step guide to analyze your codebase and query it using AI assistants like Claude Code CLI or VS Code with GitHub Copilot.

## What You'll Achieve

By the end of this guide, you'll be able to:
- Analyze any TypeScript, Python, or C# codebase
- Connect the analysis to your AI assistant
- Ask intelligent questions about your code architecture, dependencies, and patterns

## Prerequisites

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **A GitHub account** - For accessing packages from GitHub Packages
- **One of the following AI tools:**
  - [Claude Code CLI](https://claude.com/claude-code) - Anthropic's CLI tool
  - [VS Code](https://code.visualstudio.com/) with [GitHub Copilot](https://github.com/features/copilot) extension
- **One or more codebases** - Your projects to analyze

## Step 1: Set Up Your Workspace

Create a workspace directory where you'll clone and work with your codebases:

```bash
# Create workspace directory
mkdir -p ~/ws
cd ~/ws

# Clone your repositories
git clone https://github.com/your-org/your-project.git
git clone https://github.com/your-org/another-project.git
```

Your workspace structure should look like:
```
~/ws/
├── your-project/
├── another-project/
└── ...
```

## Step 2: Install DevAC Tools

DevAC packages are published to GitHub Packages. You'll need to configure npm to authenticate with GitHub.

### 2.1 Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name like "npm-github-packages"
4. Select the `read:packages` scope
5. Click "Generate token"
6. Copy the token (you won't see it again!)

### 2.2 Configure npm for GitHub Packages

Create or edit your global `~/.npmrc` file:

```bash
# Add GitHub Packages registry for @pietgk scope
echo "@pietgk:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

Replace `YOUR_GITHUB_TOKEN` with the token you created.

### 2.3 Install devac-cli Globally

```bash
npm install -g @pietgk/devac-cli
```

### 2.4 Verify Installation

```bash
devac --version
devac --help
```

You should see the version number and available commands.

## Step 3: Analyze Your Codebase

Navigate to your project and run the analysis:

```bash
cd ~/ws/your-project

# Analyze the entire project
devac analyze

# Or analyze a specific package in a monorepo
devac analyze --package ./packages/api
```

**Expected output:**
```
✓ Analyzed 156 files
  Nodes: 2,341
  Edges: 1,892
  External refs: 423
  Time: 3.2s
  Seeds written to: .devac/seed/
```

### Verify the Analysis

Check that the seed files were created:

```bash
ls -la .devac/seed/base/
```

You should see:
```
nodes.parquet
edges.parquet
external_refs.parquet
```

### Optional: Set Up Watch Mode

For continuous updates as you code:

```bash
devac watch
```

This monitors file changes and updates the analysis in real-time.

## Step 4: Configure Your AI Tool

Choose your preferred AI tool and follow the corresponding setup.

### Option A: Claude Code CLI

Claude Code CLI uses MCP servers configured via the `claude mcp` command or configuration files.

#### Add the DevAC MCP Server

```bash
# Add for current project only
claude mcp add devac -s local -- npx -y @pietgk/devac-mcp --package ~/ws/your-project

# Or add globally (available in all projects)
claude mcp add devac -s user -- npx -y @pietgk/devac-mcp --package ~/ws/your-project
```

#### Verify the Configuration

```bash
# List configured MCP servers
claude mcp list

# Test the server
claude mcp get devac
```

#### Alternative: Edit Configuration Directly

You can also edit the configuration file directly. The location depends on your scope:

- **Local scope**: `.claude/mcp.json` in your project directory
- **User scope**: `~/.claude/mcp.json`

Example configuration:
```json
{
  "mcpServers": {
    "devac": {
      "command": "npx",
      "args": ["-y", "@pietgk/devac-mcp", "--package", "/Users/you/ws/your-project"]
    }
  }
}
```

### Option B: VS Code with GitHub Copilot

VS Code with GitHub Copilot supports MCP servers through configuration files.

#### Configure the MCP Server

Create or edit `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "devac": {
      "command": "npx",
      "args": ["-y", "@pietgk/devac-mcp", "--package", "${workspaceFolder}"]
    }
  }
}
```

Or add to your VS Code settings (`settings.json`):

```json
{
  "github.copilot.chat.mcp.servers": {
    "devac": {
      "command": "npx",
      "args": ["-y", "@pietgk/devac-mcp", "--package", "/Users/you/ws/your-project"]
    }
  }
}
```

#### Verify in VS Code

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Search for "MCP: List Servers"
3. You should see "devac" in the list

#### Using with Copilot Agent Mode

1. Open Copilot Chat (click the Copilot icon in the title bar)
2. Select **Agent** mode from the dropdown
3. Click the tools icon to verify "devac" tools are available

## Step 5: Start Asking Questions

Now you're ready to ask questions about your codebase! Here are some examples to get you started.

### Example 1: Architecture Overview

> "Give me a high level system diagram of the complete code base using the C4 model concepts as a markdown file."

This will analyze your codebase structure and generate a C4-style architecture diagram showing:
- System context
- Containers (services, applications)
- Components and their relationships

### Example 2: Communication Patterns

> "What communication channels are used to contact the users of this code base?"

The AI will search for:
- Email sending logic
- SMS/notification services
- Push notification implementations
- Webhook configurations

### Example 3: Dependency Analysis

> "What are the most heavily used internal modules in this codebase?"

### Example 4: Impact Analysis

> "If I change the User class in src/models/user.ts, what other files will be affected?"

### Example 5: Code Patterns

> "Show me all the API endpoints in this project and their authentication requirements."

### Tips for Effective Queries

1. **Be specific** - Instead of "explain the code", ask "explain how user authentication works"
2. **Reference files** - "Looking at src/api/users.ts, what validation is missing?"
3. **Ask for diagrams** - The AI can generate Mermaid diagrams, PlantUML, or markdown tables
4. **Chain questions** - Start broad, then drill down into specific areas

## Troubleshooting

### "Command not found: devac"

Make sure the global npm bin directory is in your PATH:

```bash
# Find npm global bin location
npm config get prefix

# Add to your shell profile (~/.zshrc or ~/.bashrc)
export PATH="$(npm config get prefix)/bin:$PATH"
```

### "401 Unauthorized" when installing packages

Your GitHub token may be invalid or missing the `read:packages` scope:

1. Verify your token in `~/.npmrc`
2. Generate a new token if needed
3. Ensure the token has `read:packages` scope

### "No seeds found" error

Run the analysis first:

```bash
cd ~/ws/your-project
devac analyze
```

### MCP server not connecting

1. Verify the package path is absolute and correct
2. Check that `@pietgk/devac-mcp` is accessible:
   ```bash
   npx -y @pietgk/devac-mcp --help
   ```
3. Restart your AI tool after configuration changes

### Analysis is slow

For large codebases:

```bash
# Analyze incrementally (only changed files)
devac analyze --if-changed

# Use watch mode for continuous updates
devac watch
```

## Next Steps

- [CLI Reference](./cli-reference.md) - Full command documentation
- [MCP Server Guide](./mcp-server.md) - Advanced MCP configuration
- [Data Model](./implementation/data-model.md) - Understanding nodes, edges, and refs
- [Federation](./implementation/federation.md) - Analyze multiple repositories together

## Getting Help

- [GitHub Issues](https://github.com/pietgk/vivief/issues) - Report bugs or request features
- [Documentation](./README.md) - Full documentation index
