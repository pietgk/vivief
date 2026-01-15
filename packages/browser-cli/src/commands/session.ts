/**
 * Session Commands
 *
 * browser session start [--headed] [--viewport 1280x720]
 * browser session stop [sessionId]
 * browser session list [--json]
 */

import { type SessionConfig, SessionManager } from "@pietgk/browser-core";
import type { Command } from "commander";
import { type CommandRegister, type CommonOptions, printError, printOutput } from "./types.js";

interface SessionStartOptions extends CommonOptions {
  headed?: boolean;
  viewport?: string;
}

interface SessionStopOptions extends CommonOptions {}

interface SessionListOptions extends CommonOptions {}

/**
 * Register session commands
 */
export const registerSessionCommands: CommandRegister = (program: Command) => {
  const session = program.command("session").description("Manage browser sessions");

  // session start
  session
    .command("start")
    .description("Start a new browser session")
    .option("--headed", "Run browser in headed mode (visible)", false)
    .option("--viewport <dimensions>", "Viewport dimensions (WIDTHxHEIGHT)", "1280x720")
    .option("--json", "Output as JSON")
    .action(async (options: SessionStartOptions) => {
      try {
        const config: SessionConfig = {
          headless: !options.headed,
        };

        // Parse viewport
        if (options.viewport) {
          const [width, height] = options.viewport.split("x").map(Number);
          if (width && height && !Number.isNaN(width) && !Number.isNaN(height)) {
            config.viewport = { width, height };
          } else {
            printError(
              `Invalid viewport format: ${options.viewport}. Use WIDTHxHEIGHT (e.g., 1280x720)`
            );
            process.exit(1);
          }
        }

        const manager = SessionManager.getInstance();
        const session = await manager.createSession(config);

        printOutput(
          {
            sessionId: session.id,
            message: `Browser session started: ${session.id}`,
            headless: config.headless,
            viewport: config.viewport,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // session stop
  session
    .command("stop")
    .description("Stop a browser session")
    .argument("[sessionId]", "Session ID to stop (optional, defaults to current)")
    .option("--json", "Output as JSON")
    .action(async (sessionIdArg: string | undefined, options: SessionStopOptions) => {
      try {
        const manager = SessionManager.getInstance();
        let sessionId = sessionIdArg;

        if (sessionId) {
          await manager.closeSession(sessionId);
        } else {
          const current = manager.getCurrentSession();
          if (current) {
            await manager.closeSession(current.id);
            sessionId = current.id;
          } else {
            printError("No active session to stop");
            process.exit(1);
          }
        }

        printOutput(
          {
            message: `Session stopped: ${sessionId}`,
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // session list
  session
    .command("list")
    .description("List all active browser sessions")
    .option("--json", "Output as JSON")
    .action(async (options: SessionListOptions) => {
      try {
        const manager = SessionManager.getInstance();
        const sessions = manager.listSessions();
        const current = manager.getCurrentSession();

        if (options.json) {
          printOutput(
            {
              sessions: sessions.map((s) => ({
                id: s.id,
                startTime: s.startTime,
                currentUrl: s.currentUrl,
                headless: s.headless,
                isCurrent: s.id === current?.id,
              })),
              count: sessions.length,
            },
            options
          );
        } else {
          if (sessions.length === 0) {
            console.log("No active sessions");
          } else {
            console.log(`Active sessions (${sessions.length}):`);
            for (const s of sessions) {
              const marker = s.id === current?.id ? " (current)" : "";
              console.log(`  ${s.id}${marker}`);
              console.log(`    URL: ${s.currentUrl || "about:blank"}`);
              console.log(`    Mode: ${s.headless ? "headless" : "headed"}`);
            }
          }
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
};
