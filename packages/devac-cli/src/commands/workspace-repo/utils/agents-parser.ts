/**
 * AGENTS.md Parser
 *
 * Parses AGENTS.md files from repositories to extract structured information
 * for generating workspace-level CLAUDE.md documentation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Extracted stack information from an AGENTS.md file
 */
export interface ExtractedStack {
  /** Programming languages used */
  languages: string[];
  /** Frameworks in use */
  frameworks: string[];
  /** Databases used */
  databases: string[];
  /** Other technologies */
  other: string[];
}

/**
 * Extracted commands from an AGENTS.md file
 */
export interface ExtractedCommands {
  /** Development commands */
  dev: string[];
  /** Test commands */
  test: string[];
  /** Build commands */
  build: string[];
  /** Deploy commands */
  deploy: string[];
  /** Other commands */
  other: string[];
}

/**
 * Parsed content from an AGENTS.md file
 */
export interface ParsedAgentsMd {
  /** Absolute path to the repository */
  repoPath: string;
  /** Name of the repository (directory name) */
  repoName: string;
  /** Whether the file was found and parsed */
  found: boolean;
  /** Raw content of the file */
  rawContent?: string;
  /** Description extracted from the file */
  description?: string;
  /** Extracted stack information */
  stack?: ExtractedStack;
  /** Extracted commands */
  commands?: ExtractedCommands;
  /** All section headers found */
  sectionHeaders: string[];
  /** Sections as a map of header to content */
  sections: Map<string, string>;
}

/**
 * Check if an AGENTS.md or CLAUDE.md file exists in the repository
 */
export async function findAgentsMdPath(repoPath: string): Promise<string | null> {
  const candidates = ["AGENTS.md", "CLAUDE.md", "agents.md", "claude.md"];

  for (const candidate of candidates) {
    const filePath = path.join(repoPath, candidate);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}

/**
 * Extract the first paragraph as description
 */
function extractDescription(content: string): string | undefined {
  // Skip any frontmatter or initial headers
  const lines = content.split("\n");
  let inCodeBlock = false;
  let description = "";
  let foundContent = false;

  for (const line of lines) {
    // Track code blocks
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip headers
    if (line.startsWith("#")) continue;

    // Skip empty lines before content
    if (!foundContent && line.trim() === "") continue;

    // Found content
    if (line.trim() !== "") {
      foundContent = true;
      description += `${line} `;
    } else if (foundContent) {
      // End of first paragraph
      break;
    }
  }

  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extract section headers from markdown content
 */
function extractSectionHeaders(content: string): string[] {
  const headers: string[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch?.[2]) {
      headers.push(headerMatch[2].trim());
    }
  }

  return headers;
}

/**
 * Extract sections as a map of header to content
 */
function extractSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split("\n");
  let currentHeader = "";
  let currentContent: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentContent.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch?.[2]) {
        // Save previous section
        if (currentHeader) {
          sections.set(currentHeader, currentContent.join("\n").trim());
        }
        currentHeader = headerMatch[2].trim();
        currentContent = [];
        continue;
      }
    }

    currentContent.push(line);
  }

  // Save last section
  if (currentHeader) {
    sections.set(currentHeader, currentContent.join("\n").trim());
  }

  return sections;
}

/**
 * Extract stack information from content
 */
function extractStack(content: string, sections: Map<string, string>): ExtractedStack | undefined {
  const stack: ExtractedStack = {
    languages: [],
    frameworks: [],
    databases: [],
    other: [],
  };

  // Language patterns
  const languagePatterns = [/\b(TypeScript|JavaScript|Python|C#|Go|Rust|Java|Ruby|PHP)\b/gi];

  // Framework patterns
  const frameworkPatterns = [
    /\b(React|Next\.?js|Vue|Angular|Express|Nest\.?js|Django|Flask|FastAPI|\.NET|Node\.?js)\b/gi,
    /\b(React Native|Expo|Electron|Svelte)\b/gi,
  ];

  // Database patterns
  const databasePatterns = [
    /\b(MySQL|PostgreSQL|Postgres|MongoDB|DynamoDB|Redis|SQLite|DuckDB|Elasticsearch)\b/gi,
  ];

  // Look for tech stack section
  const techStackSections = ["Technical Stack", "Tech Stack", "Technologies", "Stack"];
  let stackContent = content;

  for (const sectionName of techStackSections) {
    const sectionContent = sections.get(sectionName);
    if (sectionContent) {
      stackContent = sectionContent;
      break;
    }
  }

  // Extract languages
  for (const pattern of languagePatterns) {
    const matches = stackContent.match(pattern);
    if (matches) {
      for (const match of matches) {
        const normalized = match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
        if (!stack.languages.includes(normalized)) {
          stack.languages.push(normalized);
        }
      }
    }
  }

  // Extract frameworks
  for (const pattern of frameworkPatterns) {
    const matches = stackContent.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!stack.frameworks.includes(match)) {
          stack.frameworks.push(match);
        }
      }
    }
  }

  // Extract databases
  for (const pattern of databasePatterns) {
    const matches = stackContent.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!stack.databases.includes(match)) {
          stack.databases.push(match);
        }
      }
    }
  }

  // Only return if we found something
  if (stack.languages.length > 0 || stack.frameworks.length > 0 || stack.databases.length > 0) {
    return stack;
  }

  return undefined;
}

/**
 * Extract commands from content
 */
function extractCommands(
  content: string,
  sections: Map<string, string>
): ExtractedCommands | undefined {
  const commands: ExtractedCommands = {
    dev: [],
    test: [],
    build: [],
    deploy: [],
    other: [],
  };

  // Look for commands section
  const commandsSections = [
    "Essential Commands",
    "Commands",
    "Development Commands",
    "Quick Start",
  ];
  let commandsContent = "";

  for (const sectionName of commandsSections) {
    const sectionContent = sections.get(sectionName);
    if (sectionContent) {
      commandsContent = sectionContent;
      break;
    }
  }

  if (!commandsContent) {
    // Try to find code blocks with commands
    const codeBlockMatch = content.match(/```(?:bash|sh|shell)?\n([\s\S]*?)\n```/g);
    if (codeBlockMatch) {
      commandsContent = codeBlockMatch.join("\n");
    }
  }

  // Extract commands from code blocks
  const codeBlocks = commandsContent.match(/```(?:bash|sh|shell)?\n([\s\S]*?)\n```/g) || [];

  for (const block of codeBlocks) {
    const blockContent = block.replace(/```(?:bash|sh|shell)?\n/, "").replace(/\n```/, "");
    const lines = blockContent.split("\n").filter((line) => line.trim() && !line.startsWith("#"));

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Categorize command
      if (trimmed.includes("dev") || trimmed.includes("start")) {
        if (!commands.dev.includes(trimmed)) {
          commands.dev.push(trimmed);
        }
      } else if (trimmed.includes("test")) {
        if (!commands.test.includes(trimmed)) {
          commands.test.push(trimmed);
        }
      } else if (trimmed.includes("build")) {
        if (!commands.build.includes(trimmed)) {
          commands.build.push(trimmed);
        }
      } else if (trimmed.includes("deploy") || trimmed.includes("push")) {
        if (!commands.deploy.includes(trimmed)) {
          commands.deploy.push(trimmed);
        }
      } else {
        if (!commands.other.includes(trimmed)) {
          commands.other.push(trimmed);
        }
      }
    }
  }

  // Only return if we found something
  const hasCommands =
    commands.dev.length > 0 ||
    commands.test.length > 0 ||
    commands.build.length > 0 ||
    commands.deploy.length > 0;

  return hasCommands ? commands : undefined;
}

/**
 * Parse an AGENTS.md file and extract structured information
 */
export async function parseAgentsMd(repoPath: string): Promise<ParsedAgentsMd> {
  const repoName = path.basename(repoPath);

  const result: ParsedAgentsMd = {
    repoPath,
    repoName,
    found: false,
    sectionHeaders: [],
    sections: new Map(),
  };

  const filePath = await findAgentsMdPath(repoPath);
  if (!filePath) {
    return result;
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    result.found = true;
    result.rawContent = content;

    // Extract sections
    result.sections = extractSections(content);
    result.sectionHeaders = extractSectionHeaders(content);

    // Extract description
    result.description = extractDescription(content);

    // Extract stack
    result.stack = extractStack(content, result.sections);

    // Extract commands
    result.commands = extractCommands(content, result.sections);

    return result;
  } catch (_error) {
    // File exists but couldn't be read
    return result;
  }
}

/**
 * Parse AGENTS.md files from multiple repositories
 */
export async function parseAllAgentsMd(repoPaths: string[]): Promise<ParsedAgentsMd[]> {
  const results = await Promise.all(repoPaths.map(parseAgentsMd));
  return results;
}

/**
 * Get a summary of parsed AGENTS.md files
 */
export function summarizeAgentsMd(parsed: ParsedAgentsMd[]): {
  total: number;
  found: number;
  withStack: number;
  withCommands: number;
  allLanguages: string[];
  allFrameworks: string[];
} {
  const allLanguages = new Set<string>();
  const allFrameworks = new Set<string>();

  let found = 0;
  let withStack = 0;
  let withCommands = 0;

  for (const p of parsed) {
    if (p.found) {
      found++;
      if (p.stack) {
        withStack++;
        for (const lang of p.stack.languages) {
          allLanguages.add(lang);
        }
        for (const fw of p.stack.frameworks) {
          allFrameworks.add(fw);
        }
      }
      if (p.commands) {
        withCommands++;
      }
    }
  }

  return {
    total: parsed.length,
    found,
    withStack,
    withCommands,
    allLanguages: Array.from(allLanguages),
    allFrameworks: Array.from(allFrameworks),
  };
}
