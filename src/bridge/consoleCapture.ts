/**
 * Console capture — intercepts console.error/warn and window.onerror for MCP debugging.
 */

interface ConsoleEntry {
  level: string;
  message: string;
  timestamp: number;
}

const entries: ConsoleEntry[] = [];
const MAX_ENTRIES = 500;
let _installed = false;

function push(level: string, message: string): void {
  if (entries.length >= MAX_ENTRIES) entries.shift();
  entries.push({ level, message, timestamp: Date.now() });
}

function argsToString(args: unknown[]): string {
  return args.map(a => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

/** Start capturing console errors/warnings and unhandled rejections */
export function startConsoleCapture(): void {
  if (_installed) return;
  _installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    push('error', argsToString(args));
    origError(...args);
  };

  console.warn = (...args: unknown[]) => {
    push('warn', argsToString(args));
    origWarn(...args);
  };

  window.addEventListener('error', (ev) => {
    push('error', `Uncaught: ${ev.message} at ${ev.filename}:${ev.lineno}`);
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
    push('error', `UnhandledRejection: ${reason}`);
  });
}

/** Get all captured console entries since last clear */
export function getConsoleEntries(): ConsoleEntry[] {
  return entries;
}

/** Clear all captured console entries */
export function clearConsoleEntries(): void {
  entries.length = 0;
}
