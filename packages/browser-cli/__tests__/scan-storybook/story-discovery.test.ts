/**
 * Tests for Story Discovery
 *
 * Tests the fetchStoryIndex, filterStories, and parseTagsString functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchStoryIndex,
  filterStories,
  parseTagsString,
} from "../../src/commands/scan-storybook/story-discovery.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("story-discovery", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchStoryIndex", () => {
    it("should fetch and parse stories from Storybook index.json", async () => {
      const mockIndex = {
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            title: "Components/Button",
            name: "Primary",
            importPath: "./src/Button.stories.tsx",
            tags: ["autodocs"],
            type: "story",
          },
          "button--secondary": {
            id: "button--secondary",
            title: "Components/Button",
            name: "Secondary",
            importPath: "./src/Button.stories.tsx",
            tags: [],
            type: "story",
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockIndex,
      });

      const stories = await fetchStoryIndex("http://localhost:6006");

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json", {
        headers: { Accept: "application/json" },
      });
      expect(stories).toHaveLength(2);
      expect(stories[0]).toEqual({
        id: "button--primary",
        title: "Components/Button",
        name: "Primary",
        importPath: "./src/Button.stories.tsx",
        tags: ["autodocs"],
      });
    });

    it("should strip trailing slash from URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ v: 5, entries: {} }),
      });

      await fetchStoryIndex("http://localhost:6006/");

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6006/index.json", {
        headers: { Accept: "application/json" },
      });
    });

    it("should filter out docs entries, keeping only stories", async () => {
      const mockIndex = {
        v: 5,
        entries: {
          "button--docs": {
            id: "button--docs",
            title: "Components/Button",
            name: "Docs",
            importPath: "./src/Button.stories.tsx",
            type: "docs",
          },
          "button--primary": {
            id: "button--primary",
            title: "Components/Button",
            name: "Primary",
            importPath: "./src/Button.stories.tsx",
            type: "story",
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockIndex,
      });

      const stories = await fetchStoryIndex("http://localhost:6006");

      expect(stories).toHaveLength(1);
      expect(stories[0]?.id).toBe("button--primary");
    });

    it("should handle entries without type field as stories", async () => {
      const mockIndex = {
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            title: "Components/Button",
            name: "Primary",
            importPath: "./src/Button.stories.tsx",
            // No type field
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockIndex,
      });

      const stories = await fetchStoryIndex("http://localhost:6006");

      expect(stories).toHaveLength(1);
      expect(stories[0]?.id).toBe("button--primary");
    });

    it("should default tags to empty array when not provided", async () => {
      const mockIndex = {
        v: 5,
        entries: {
          "button--primary": {
            id: "button--primary",
            title: "Components/Button",
            name: "Primary",
            importPath: "./src/Button.stories.tsx",
            // No tags
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockIndex,
      });

      const stories = await fetchStoryIndex("http://localhost:6006");

      expect(stories[0]?.tags).toEqual([]);
    });

    it("should throw error when fetch fails with network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(fetchStoryIndex("http://localhost:6006")).rejects.toThrow(
        "Failed to connect to Storybook at http://localhost:6006"
      );
    });

    it("should throw error when response is 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(fetchStoryIndex("http://localhost:6006")).rejects.toThrow(
        "Storybook index.json not found"
      );
    });

    it("should throw error for other HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(fetchStoryIndex("http://localhost:6006")).rejects.toThrow(
        "Failed to fetch Storybook index: 500 Internal Server Error"
      );
    });
  });

  describe("filterStories", () => {
    const sampleStories = [
      {
        id: "button--primary",
        title: "Components/Button",
        name: "Primary",
        importPath: "./src/Button.stories.tsx",
        tags: ["autodocs"],
      },
      {
        id: "button--secondary",
        title: "Components/Button",
        name: "Secondary",
        importPath: "./src/Button.stories.tsx",
        tags: ["a11y-skip"],
      },
      {
        id: "input--default",
        title: "Components/Input",
        name: "Default",
        importPath: "./src/Input.stories.tsx",
        tags: [],
      },
      {
        id: "card--with-header",
        title: "Layouts/Card",
        name: "With Header",
        importPath: "./src/Card.stories.tsx",
        tags: ["wip", "a11y-skip"],
      },
    ];

    it("should return all stories when no filter or excludeTags provided", () => {
      const result = filterStories(sampleStories);

      expect(result.included).toHaveLength(4);
      expect(result.excluded).toHaveLength(0);
    });

    it("should filter by title pattern (case-insensitive)", () => {
      const result = filterStories(sampleStories, "button");

      expect(result.included).toHaveLength(2);
      expect(result.included.map((s) => s.id)).toEqual(["button--primary", "button--secondary"]);
      expect(result.excluded).toHaveLength(2);
    });

    it("should filter by full title/name pattern", () => {
      const result = filterStories(sampleStories, "Components/Button/Primary");

      expect(result.included).toHaveLength(1);
      expect(result.included[0]?.id).toBe("button--primary");
    });

    it("should support wildcard patterns", () => {
      const result = filterStories(sampleStories, "*/Button/*");

      expect(result.included).toHaveLength(2);
      expect(result.included.map((s) => s.id)).toEqual(["button--primary", "button--secondary"]);
    });

    it("should exclude stories with specified tags", () => {
      const result = filterStories(sampleStories, undefined, ["a11y-skip"]);

      expect(result.included).toHaveLength(2);
      expect(result.included.map((s) => s.id)).toEqual(["button--primary", "input--default"]);
      expect(result.excluded).toHaveLength(2);
    });

    it("should handle case-insensitive tag matching", () => {
      const result = filterStories(sampleStories, undefined, ["A11Y-SKIP"]);

      expect(result.included).toHaveLength(2);
      expect(result.excluded).toHaveLength(2);
    });

    it("should exclude stories with any of the specified tags", () => {
      const result = filterStories(sampleStories, undefined, ["wip", "autodocs"]);

      expect(result.included).toHaveLength(2);
      expect(result.included.map((s) => s.id)).toEqual(["button--secondary", "input--default"]);
    });

    it("should apply both filter and excludeTags", () => {
      const result = filterStories(sampleStories, "button", ["a11y-skip"]);

      expect(result.included).toHaveLength(1);
      expect(result.included[0]?.id).toBe("button--primary");
    });

    it("should exclude by tags before filtering by title", () => {
      const result = filterStories(sampleStories, "card", ["a11y-skip"]);

      // Card has a11y-skip tag, so it should be excluded even though it matches the filter
      expect(result.included).toHaveLength(0);
    });

    it("should handle empty stories array", () => {
      const result = filterStories([], "button", ["skip"]);

      expect(result.included).toHaveLength(0);
      expect(result.excluded).toHaveLength(0);
    });

    it("should handle empty excludeTags array", () => {
      const result = filterStories(sampleStories, undefined, []);

      expect(result.included).toHaveLength(4);
    });
  });

  describe("parseTagsString", () => {
    it("should parse comma-separated tags", () => {
      const result = parseTagsString("a11y-skip,wip,test");

      expect(result).toEqual(["a11y-skip", "wip", "test"]);
    });

    it("should trim whitespace from tags", () => {
      const result = parseTagsString("  a11y-skip , wip  ,  test ");

      expect(result).toEqual(["a11y-skip", "wip", "test"]);
    });

    it("should filter out empty tags", () => {
      const result = parseTagsString("a11y-skip,,wip, ,test");

      expect(result).toEqual(["a11y-skip", "wip", "test"]);
    });

    it("should return empty array for undefined input", () => {
      const result = parseTagsString(undefined);

      expect(result).toEqual([]);
    });

    it("should return empty array for empty string", () => {
      const result = parseTagsString("");

      expect(result).toEqual([]);
    });

    it("should handle single tag", () => {
      const result = parseTagsString("a11y-skip");

      expect(result).toEqual(["a11y-skip"]);
    });
  });
});
