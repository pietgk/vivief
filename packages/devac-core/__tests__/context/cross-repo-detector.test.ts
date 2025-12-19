/**
 * Cross-Repo Detector Tests
 *
 * Tests for detecting unresolved imports that point to sibling repositories.
 */

import { describe, expect, it } from "vitest";
import {
  CrossRepoDetector,
  createCrossRepoDetector,
  formatCrossRepoNeed,
} from "../../src/context/cross-repo-detector.js";
import type { RepoContext } from "../../src/context/types.js";
import type { ParsedExternalRef } from "../../src/types/external-refs.js";

/**
 * Create a mock RepoContext for testing
 */
function createMockContext(repos: string[], issueNumber?: number): RepoContext {
  return {
    currentDir: "/ws/my-app",
    parentDir: "/ws",
    repos: repos.map((name) => {
      const parts = name.split("-");
      const isWorktree = name.includes("-") && parts.length >= 3;
      return {
        path: `/ws/${name}`,
        name,
        hasSeeds: true,
        isWorktree,
        issueNumber: isWorktree ? Number.parseInt(parts[1] ?? "0", 10) : undefined,
        slug: isWorktree ? parts.slice(2).join("-") : undefined,
      };
    }),
    issueNumber,
    worktrees: issueNumber
      ? repos
          .filter((name) => name.includes(`-${issueNumber}-`))
          .map((name) => {
            const parts = name.split("-");
            return {
              path: `/ws/${name}`,
              name,
              hasSeeds: true,
              isWorktree: true as const,
              issueNumber: issueNumber,
              slug: parts.slice(2).join("-"),
              mainRepoPath: `/ws/${parts[0] ?? ""}`,
              mainRepoName: parts[0] ?? "",
              branch: `issue-${issueNumber}`,
            };
          })
      : undefined,
  };
}

/**
 * Create a mock external ref
 */
function createMockRef(
  moduleSpecifier: string,
  importedSymbol: string,
  isResolved = false
): ParsedExternalRef {
  return {
    source_entity_id: "test:file.ts:function:abc123",
    module_specifier: moduleSpecifier,
    imported_symbol: importedSymbol,
    local_alias: null,
    import_style: "named",
    is_type_only: false,
    source_file_path: "src/index.ts",
    source_line: 1,
    source_column: 0,
    target_entity_id: null,
    is_resolved: isResolved,
    is_reexport: false,
    export_alias: null,
    source_file_hash: "abc123",
    branch: "base",
    is_deleted: false,
    updated_at: new Date().toISOString(),
  };
}

describe("CrossRepoDetector", () => {
  describe("matchModuleToSiblingRepo", () => {
    it("matches exact repo name", () => {
      const context = createMockContext(["my-app", "shared", "api"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      expect(detector.matchModuleToSiblingRepo("shared")).toBe("shared");
      expect(detector.matchModuleToSiblingRepo("api")).toBe("api");
    });

    it("matches scoped package to repo name", () => {
      const context = createMockContext(["my-app", "shared", "utils"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      expect(detector.matchModuleToSiblingRepo("@myorg/shared")).toBe("shared");
      expect(detector.matchModuleToSiblingRepo("@company/utils")).toBe("utils");
    });

    it("does not match current repo", () => {
      const context = createMockContext(["my-app", "shared"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      expect(detector.matchModuleToSiblingRepo("my-app")).toBeNull();
    });

    it("does not match node builtins", () => {
      const context = createMockContext(["my-app", "path", "fs"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      expect(detector.matchModuleToSiblingRepo("path")).toBeNull();
      expect(detector.matchModuleToSiblingRepo("fs")).toBeNull();
      expect(detector.matchModuleToSiblingRepo("node:path")).toBeNull();
    });

    it("does not match relative imports", () => {
      const context = createMockContext(["my-app", "shared"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      expect(detector.matchModuleToSiblingRepo("./shared")).toBeNull();
      expect(detector.matchModuleToSiblingRepo("../shared")).toBeNull();
    });

    it("does not match unknown packages", () => {
      const context = createMockContext(["my-app", "shared"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      expect(detector.matchModuleToSiblingRepo("lodash")).toBeNull();
      expect(detector.matchModuleToSiblingRepo("@types/node")).toBeNull();
    });
  });

  describe("analyzeExternalRefs", () => {
    it("returns empty needs for resolved refs", () => {
      const context = createMockContext(["my-app", "shared"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      const refs = [
        createMockRef("shared", "validateToken", true),
        createMockRef("shared", "AuthConfig", true),
      ];

      const result = detector.analyzeExternalRefs(refs, "/ws/my-app/src/index.ts");

      expect(result.needs).toHaveLength(0);
      expect(result.unresolvedRefsCount).toBe(0);
    });

    it("detects unresolved refs to sibling repos", () => {
      const context = createMockContext(["my-app", "shared"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      const refs = [
        createMockRef("shared", "validateToken", false),
        createMockRef("shared", "AuthConfig", false),
      ];

      const result = detector.analyzeExternalRefs(refs, "/ws/my-app/src/index.ts");

      expect(result.needs).toHaveLength(1);
      const need = result.needs[0];
      expect(need).toBeDefined();
      expect(need?.targetRepo).toBe("shared");
      expect(need?.symbols).toContain("validateToken");
      expect(need?.symbols).toContain("AuthConfig");
    });

    it("groups symbols by target repo", () => {
      const context = createMockContext(["my-app", "shared", "utils"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      const refs = [
        createMockRef("shared", "validateToken", false),
        createMockRef("utils", "formatDate", false),
        createMockRef("shared", "AuthConfig", false),
      ];

      const result = detector.analyzeExternalRefs(refs, "/ws/my-app/src/index.ts");

      expect(result.needs).toHaveLength(2);
      const sharedNeed = result.needs.find((n) => n.targetRepo === "shared");
      const utilsNeed = result.needs.find((n) => n.targetRepo === "utils");

      expect(sharedNeed?.symbols).toHaveLength(2);
      expect(utilsNeed?.symbols).toHaveLength(1);
    });

    it("ignores unresolved refs to unknown packages", () => {
      const context = createMockContext(["my-app", "shared"]);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
      });

      const refs = [
        createMockRef("lodash", "debounce", false),
        createMockRef("@types/node", "Buffer", false),
      ];

      const result = detector.analyzeExternalRefs(refs, "/ws/my-app/src/index.ts");

      expect(result.needs).toHaveLength(0);
      expect(result.unresolvedRefsCount).toBe(2);
      expect(result.matchedRefsCount).toBe(0);
    });

    it("includes issue number in suggestion when in worktree", () => {
      const context = createMockContext(["my-app", "my-app-123-auth", "shared"], 123);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
        issueNumber: 123,
      });

      const refs = [createMockRef("shared", "validateToken", false)];

      const result = detector.analyzeExternalRefs(refs, "/ws/my-app-123-auth/src/index.ts");

      expect(result.needs).toHaveLength(1);
      const need = result.needs[0];
      expect(need).toBeDefined();
      expect(need?.issueNumber).toBe(123);
      expect(need?.suggestion).toContain("devac worktree start 123 --also shared");
    });
  });

  describe("formatCrossRepoNeed", () => {
    it("formats a cross-repo need for console output", () => {
      const context = createMockContext(["my-app", "shared"], 123);
      const detector = new CrossRepoDetector({
        context,
        currentRepoName: "my-app",
        issueNumber: 123,
      });

      const refs = [createMockRef("shared", "validateToken", false)];
      const result = detector.analyzeExternalRefs(refs, "/ws/my-app/src/index.ts");
      const need = result.needs[0];
      expect(need).toBeDefined();
      const formatted = formatCrossRepoNeed(need!);

      expect(formatted).toContain("💡");
      expect(formatted).toContain("shared");
      expect(formatted).toContain("validateToken");
      expect(formatted).toContain("devac worktree start 123 --also shared");
    });
  });
});

describe("createCrossRepoDetector", () => {
  it("creates a detector with correct configuration", () => {
    const context = createMockContext(["my-app", "shared"]);
    const detector = createCrossRepoDetector(context, "my-app", 123);

    expect(detector).toBeInstanceOf(CrossRepoDetector);

    const refs = [createMockRef("shared", "validateToken", false)];
    const result = detector.analyzeExternalRefs(refs, "/ws/my-app/src/index.ts");

    expect(result.needs).toHaveLength(1);
    expect(result.needs[0]?.issueNumber).toBe(123);
  });
});
