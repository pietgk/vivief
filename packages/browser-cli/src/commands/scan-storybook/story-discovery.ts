/**
 * Story Discovery
 *
 * Fetches and filters stories from Storybook's /index.json endpoint.
 */

import type { StoryEntry } from "./types.js";

/**
 * Storybook index.json format (v7+)
 */
interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookEntry>;
}

/**
 * Entry in Storybook's index.json
 */
interface StorybookEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  tags?: string[];
  type?: "story" | "docs";
}

/**
 * Fetch stories from Storybook's /index.json endpoint
 *
 * @param storybookUrl - Base URL of Storybook (e.g., http://localhost:6006)
 * @returns Array of story entries
 * @throws Error if Storybook is not running or index.json is not found
 */
export async function fetchStoryIndex(storybookUrl: string): Promise<StoryEntry[]> {
  const indexUrl = `${storybookUrl.replace(/\/$/, "")}/index.json`;

  let response: Response;
  try {
    response = await fetch(indexUrl, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to connect to Storybook at ${storybookUrl}. ` +
        `Is Storybook running? Error: ${message}`
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Storybook index.json not found at ${indexUrl}. Make sure Storybook is running and using Storybook 7+ format.`
      );
    }
    throw new Error(`Failed to fetch Storybook index: ${response.status} ${response.statusText}`);
  }

  const index = (await response.json()) as StorybookIndex;

  // Convert entries to StoryEntry array, filtering for stories only
  const stories: StoryEntry[] = [];

  for (const entry of Object.values(index.entries)) {
    // Skip docs entries, only include stories
    if (entry.type === "docs") {
      continue;
    }

    stories.push({
      id: entry.id,
      title: entry.title,
      name: entry.name,
      importPath: entry.importPath,
      tags: entry.tags || [],
    });
  }

  return stories;
}

/**
 * Filter stories by title pattern and exclude tags
 *
 * @param stories - Array of story entries
 * @param filter - Title pattern to match (case-insensitive, supports wildcards)
 * @param excludeTags - Tags to exclude (stories with any of these tags are skipped)
 * @returns Filtered array of story entries
 */
export function filterStories(
  stories: StoryEntry[],
  filter?: string,
  excludeTags?: string[]
): { included: StoryEntry[]; excluded: StoryEntry[] } {
  const included: StoryEntry[] = [];
  const excluded: StoryEntry[] = [];

  for (const story of stories) {
    // Check exclude tags first
    if (excludeTags && excludeTags.length > 0) {
      const hasExcludedTag = story.tags.some((tag) =>
        excludeTags.some((excludeTag) => tag.toLowerCase() === excludeTag.toLowerCase())
      );
      if (hasExcludedTag) {
        excluded.push(story);
        continue;
      }
    }

    // Check title filter
    if (filter) {
      const fullTitle = `${story.title}/${story.name}`;
      if (!matchesFilter(fullTitle, filter)) {
        excluded.push(story);
        continue;
      }
    }

    included.push(story);
  }

  return { included, excluded };
}

/**
 * Check if a title matches a filter pattern
 *
 * Supports:
 * - Simple substring matching (case-insensitive)
 * - Wildcards (*) for matching any characters
 *
 * @param title - Full story title
 * @param filter - Filter pattern
 * @returns True if title matches the filter
 */
function matchesFilter(title: string, filter: string): boolean {
  // Convert filter to regex pattern
  const pattern = filter
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
    .replace(/\\\*/g, ".*"); // Convert * to .*

  const regex = new RegExp(pattern, "i");
  return regex.test(title);
}

/**
 * Parse comma-separated tags string into array
 *
 * @param tagsString - Comma-separated tags (e.g., "a11y-skip,wip")
 * @returns Array of trimmed, non-empty tags
 */
export function parseTagsString(tagsString?: string): string[] {
  if (!tagsString) {
    return [];
  }
  return tagsString
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
