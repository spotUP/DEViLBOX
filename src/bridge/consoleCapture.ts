/**
 * Console capture — intercepts console.error/warn and window.onerror for MCP debugging.
 * Stub module — real implementation pending.
 */

interface ConsoleEntry {
  level: string;
  message: string;
  timestamp: number;
}

const entries: ConsoleEntry[] = [];

/** Start capturing console errors/warnings and unhandled rejections */
export function startConsoleCapture(): void {
  // Stub — no-op
}

/** Get all captured console entries since last clear */
export function getConsoleEntries(): ConsoleEntry[] {
  return entries;
}

/** Clear all captured console entries */
export function clearConsoleEntries(): void {
  entries.length = 0;
}
