import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotManager } from "../src/screenshot/screenshot-manager.js";
import type { PageContext } from "../src/session/page-context.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now(), isDirectory: () => true }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

const createMockLocator = () => ({
  screenshot: vi.fn().mockResolvedValue(undefined),
  boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 200, height: 100 }),
});

const createMockPage = () => ({
  screenshot: vi.fn().mockResolvedValue(undefined),
  viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
  locator: vi.fn().mockReturnValue(createMockLocator()),
  evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 2000 }),
});

const createMockPageContext = (mockPage: ReturnType<typeof createMockPage>) => {
  const mockLocator = createMockLocator();

  return {
    getPlaywrightPage: vi.fn().mockReturnValue(mockPage),
    getLocator: vi.fn().mockReturnValue(mockLocator),
    mockPage,
    mockLocator,
  } as unknown as PageContext & {
    mockPage: ReturnType<typeof createMockPage>;
    mockLocator: ReturnType<typeof createMockLocator>;
  };
};

describe("ScreenshotManager", () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let mockPageContext: PageContext & {
    mockPage: ReturnType<typeof createMockPage>;
    mockLocator: ReturnType<typeof createMockLocator>;
  };
  let screenshotManager: ScreenshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
    mockPageContext = createMockPageContext(mockPage);
    screenshotManager = new ScreenshotManager(mockPageContext, {
      baseDir: "/tmp/test-screenshots",
      autoCleanup: false, // Disable auto-cleanup for tests
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("capture", () => {
    it("captures viewport screenshot", async () => {
      const result = await screenshotManager.capture("session-1");

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.stringContaining("session-1"),
        fullPage: false,
        type: "png",
      });
      expect(result.width).toBe(1280);
      expect(result.height).toBe(720);
      expect(result.path).toContain("session-1");
    });

    it("captures full-page screenshot", async () => {
      const result = await screenshotManager.capture("session-1", { fullPage: true });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.stringContaining("session-1"),
        fullPage: true,
        type: "png",
      });
      expect(result.width).toBe(1280);
      expect(result.height).toBe(2000);
    });

    it("uses custom filename when provided", async () => {
      const result = await screenshotManager.capture("session-1", { name: "my-screenshot" });

      expect(result.path).toContain("my-screenshot.png");
    });

    it("generates timestamped filename by default", async () => {
      const result = await screenshotManager.capture("session-1");

      expect(result.path).toMatch(/screenshot_\d+\.png$/);
    });

    it("captures element screenshot by selector", async () => {
      const result = await screenshotManager.capture("session-1", { selector: ".my-element" });

      expect(mockPage.locator).toHaveBeenCalledWith(".my-element");
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it("captures clipped region screenshot", async () => {
      const clip = { x: 100, y: 100, width: 300, height: 200 };
      const result = await screenshotManager.capture("session-1", { clip });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.any(String),
        clip,
        type: "png",
      });
      expect(result.width).toBe(300);
      expect(result.height).toBe(200);
    });

    it("includes timestamp in result", async () => {
      const before = Date.now();
      const result = await screenshotManager.capture("session-1");
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("captureRef", () => {
    it("captures screenshot by element ref", async () => {
      const result = await screenshotManager.captureRef("session-1", "submit-btn");

      expect(mockPageContext.getLocator).toHaveBeenCalledWith("submit-btn");
      expect(mockPageContext.mockLocator.screenshot).toHaveBeenCalled();
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it("uses ref name in filename by default", async () => {
      const result = await screenshotManager.captureRef("session-1", "submit-btn");

      expect(result.path).toContain("submit-btn_");
    });

    it("uses custom name when provided", async () => {
      const result = await screenshotManager.captureRef("session-1", "submit-btn", "custom-name");

      expect(result.path).toContain("custom-name.png");
    });
  });

  describe("list", () => {
    it("returns empty array for new session", async () => {
      const result = await screenshotManager.list("session-1");

      expect(result).toEqual([]);
    });

    it("handles directory not existing", async () => {
      const { readdir } = await import("node:fs/promises");
      (readdir as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

      const result = await screenshotManager.list("nonexistent-session");

      expect(result).toEqual([]);
    });
  });

  describe("delete", () => {
    it("deletes screenshot file", async () => {
      const { unlink } = await import("node:fs/promises");

      const result = await screenshotManager.delete(
        "/tmp/test-screenshots/session-1/screenshot.png"
      );

      expect(unlink).toHaveBeenCalledWith("/tmp/test-screenshots/session-1/screenshot.png");
      expect(result).toBe(true);
    });

    it("returns false on deletion error", async () => {
      const { unlink } = await import("node:fs/promises");
      (unlink as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));

      const result = await screenshotManager.delete("/tmp/nonexistent.png");

      expect(result).toBe(false);
    });
  });

  describe("getBaseDir", () => {
    it("returns configured base directory", () => {
      const baseDir = screenshotManager.getBaseDir();

      expect(baseDir).toBe("/tmp/test-screenshots");
    });
  });

  describe("getSessionDir", () => {
    it("returns session-specific directory", () => {
      const sessionDir = screenshotManager.getSessionDir("session-123");

      expect(sessionDir).toBe("/tmp/test-screenshots/session-123");
    });
  });

  describe("cleanup", () => {
    it("returns cleanup statistics", async () => {
      const result = await screenshotManager.cleanup();

      expect(result).toHaveProperty("deleted");
      expect(result).toHaveProperty("remaining");
    });

    it("handles errors gracefully", async () => {
      const { readdir } = await import("node:fs/promises");
      (readdir as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await screenshotManager.cleanup();

      expect(result.deleted).toBe(0);
      expect(result.remaining).toBe(0);
    });
  });

  describe("configuration", () => {
    it("uses default config when not provided", () => {
      const manager = new ScreenshotManager(mockPageContext);
      const baseDir = manager.getBaseDir();

      expect(baseDir).toContain(".vivief/browser/screenshots");
    });

    it("merges custom config with defaults", () => {
      const manager = new ScreenshotManager(mockPageContext, {
        baseDir: "/custom/path",
      });

      expect(manager.getBaseDir()).toBe("/custom/path");
    });
  });
});
