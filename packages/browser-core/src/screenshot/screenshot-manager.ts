/**
 * ScreenshotManager - Capture and manage browser screenshots
 *
 * Features:
 * - File-based storage in ~/.vivief/browser/screenshots/
 * - Auto-cleanup of old screenshots
 * - Support for full-page, element, and viewport screenshots
 */

import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { PageContext } from "../session/page-context.js";
import type { ScreenshotOptions, ScreenshotResult } from "../types/index.js";

export interface ScreenshotManagerConfig {
  /** Base directory for screenshots (default: ~/.vivief/browser/screenshots) */
  baseDir?: string;
  /** Maximum age of screenshots in ms (default: 24 hours) */
  maxAge?: number;
  /** Maximum total screenshots to keep (default: 100) */
  maxCount?: number;
  /** Run cleanup on initialization (default: true) */
  autoCleanup?: boolean;
}

const DEFAULT_CONFIG: Required<ScreenshotManagerConfig> = {
  baseDir: join(homedir(), ".vivief", "browser", "screenshots"),
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  maxCount: 100,
  autoCleanup: true,
};

export class ScreenshotManager {
  private readonly config: Required<ScreenshotManagerConfig>;
  private readonly pageContext: PageContext;
  private readonly page: Page;
  private initialized = false;

  constructor(pageContext: PageContext, config: ScreenshotManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pageContext = pageContext;
    this.page = pageContext.getPlaywrightPage();
  }

  /**
   * Initialize the screenshot directory
   */
  private async ensureDir(sessionId: string): Promise<string> {
    const dir = join(this.config.baseDir, sessionId);
    await mkdir(dir, { recursive: true });

    if (!this.initialized && this.config.autoCleanup) {
      this.initialized = true;
      // Run cleanup in background (don't await)
      this.cleanup().catch(() => {
        // Silently ignore cleanup errors
      });
    }

    return dir;
  }

  /**
   * Take a screenshot
   */
  async capture(sessionId: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    const dir = await this.ensureDir(sessionId);
    const timestamp = Date.now();
    const filename = options.name || `screenshot_${timestamp}`;
    const path = join(dir, `${filename}.png`);

    // Capture screenshot based on options
    if (options.selector) {
      // Element screenshot
      return await this.captureElement(path, options.selector, timestamp);
    }
    if (options.clip) {
      // Clipped region screenshot
      return await this.captureClip(path, options.clip, timestamp);
    }
    // Viewport or full-page screenshot
    return await this.capturePage(path, options.fullPage || false, timestamp);
  }

  /**
   * Capture full page or viewport screenshot
   */
  private async capturePage(
    path: string,
    fullPage: boolean,
    timestamp: number
  ): Promise<ScreenshotResult> {
    await this.page.screenshot({
      path,
      fullPage,
      type: "png",
    });

    // Get dimensions
    const viewport = this.page.viewportSize();
    let width = viewport?.width || 0;
    let height = viewport?.height || 0;

    if (fullPage) {
      // Get full page dimensions
      const dimensions = (await this.page.evaluate(`
        (function() {
          return {
            width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
          };
        })()
      `)) as { width: number; height: number };
      width = dimensions.width;
      height = dimensions.height;
    }

    return {
      path,
      width,
      height,
      timestamp,
    };
  }

  /**
   * Capture element screenshot
   */
  private async captureElement(
    path: string,
    selector: string,
    timestamp: number
  ): Promise<ScreenshotResult> {
    const locator = this.page.locator(selector);

    await locator.screenshot({
      path,
      type: "png",
    });

    // Get element dimensions
    const box = await locator.boundingBox();

    return {
      path,
      width: box ? Math.round(box.width) : 0,
      height: box ? Math.round(box.height) : 0,
      timestamp,
    };
  }

  /**
   * Capture clipped region screenshot
   */
  private async captureClip(
    path: string,
    clip: { x: number; y: number; width: number; height: number },
    timestamp: number
  ): Promise<ScreenshotResult> {
    await this.page.screenshot({
      path,
      clip,
      type: "png",
    });

    return {
      path,
      width: clip.width,
      height: clip.height,
      timestamp,
    };
  }

  /**
   * Capture element by ref
   */
  async captureRef(sessionId: string, ref: string, name?: string): Promise<ScreenshotResult> {
    const dir = await this.ensureDir(sessionId);
    const timestamp = Date.now();
    const filename = name || `${ref}_${timestamp}`;
    const path = join(dir, `${filename}.png`);

    const locator = this.pageContext.getLocator(ref);

    await locator.screenshot({
      path,
      type: "png",
    });

    const box = await locator.boundingBox();

    return {
      path,
      width: box ? Math.round(box.width) : 0,
      height: box ? Math.round(box.height) : 0,
      timestamp,
    };
  }

  /**
   * List screenshots for a session
   */
  async list(sessionId: string): Promise<ScreenshotResult[]> {
    const dir = join(this.config.baseDir, sessionId);

    try {
      const files = await readdir(dir);
      const screenshots: ScreenshotResult[] = [];

      for (const file of files) {
        if (!file.endsWith(".png")) continue;

        const filepath = join(dir, file);
        const stats = await stat(filepath);

        screenshots.push({
          path: filepath,
          width: 0, // Would need to parse PNG header for this
          height: 0,
          timestamp: stats.mtimeMs,
        });
      }

      return screenshots.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  /**
   * Delete a specific screenshot
   */
  async delete(path: string): Promise<boolean> {
    try {
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all screenshots for a session
   */
  async deleteSession(sessionId: string): Promise<number> {
    const screenshots = await this.list(sessionId);
    let deleted = 0;

    for (const screenshot of screenshots) {
      if (await this.delete(screenshot.path)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clean up old screenshots based on config
   */
  async cleanup(): Promise<{ deleted: number; remaining: number }> {
    const now = Date.now();
    let deleted = 0;
    const allScreenshots: { path: string; timestamp: number }[] = [];

    try {
      // List all session directories
      const sessions = await readdir(this.config.baseDir);

      for (const sessionId of sessions) {
        const sessionDir = join(this.config.baseDir, sessionId);
        const sessionStats = await stat(sessionDir);

        if (!sessionStats.isDirectory()) continue;

        const files = await readdir(sessionDir);

        for (const file of files) {
          if (!file.endsWith(".png")) continue;

          const filepath = join(sessionDir, file);
          const fileStats = await stat(filepath);

          // Check age
          const age = now - fileStats.mtimeMs;
          if (age > this.config.maxAge) {
            await unlink(filepath);
            deleted++;
          } else {
            allScreenshots.push({
              path: filepath,
              timestamp: fileStats.mtimeMs,
            });
          }
        }
      }

      // Check total count (remove oldest if over limit)
      if (allScreenshots.length > this.config.maxCount) {
        // Sort by timestamp (oldest first)
        allScreenshots.sort((a, b) => a.timestamp - b.timestamp);

        const toDelete = allScreenshots.length - this.config.maxCount;
        for (let i = 0; i < toDelete; i++) {
          const screenshot = allScreenshots[i];
          if (!screenshot) continue;
          try {
            await unlink(screenshot.path);
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      return {
        deleted,
        remaining: Math.min(allScreenshots.length, this.config.maxCount),
      };
    } catch {
      return { deleted, remaining: 0 };
    }
  }

  /**
   * Get the base directory for screenshots
   */
  getBaseDir(): string {
    return this.config.baseDir;
  }

  /**
   * Get the directory for a specific session
   */
  getSessionDir(sessionId: string): string {
    return join(this.config.baseDir, sessionId);
  }
}
