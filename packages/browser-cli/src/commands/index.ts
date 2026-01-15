/**
 * CLI Commands
 *
 * All command registration functions are exported here.
 */

export { registerSessionCommands } from "./session.js";
export { registerNavigateCommands } from "./navigate.js";
export { registerReadCommands } from "./read.js";
export { registerInteractCommands } from "./interact.js";
export { registerScreenshotCommands } from "./screenshot.js";
export { registerFindCommands } from "./find.js";

// Re-export types
export type { CommandRegister, CommandResult, CommonOptions } from "./types.js";
export { formatOutput, printOutput, printError } from "./types.js";
