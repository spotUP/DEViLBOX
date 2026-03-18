/**
 * Console Capture — circular buffer of browser console errors and warnings.
 *
 * Call startConsoleCapture() early in main.tsx to intercept console.error,
 * console.warn, window.onerror, and unhandledrejection events.
 */

export interface ConsoleEntry {
  level: 'error' | 'warn';
  message: string;
  timestamp: number;
}

const MAX_ENTRIES = 200;
const _entries: ConsoleEntry[] = [];

export function startConsoleCapture(): void {
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    _entries.push({ level: 'error', message: args.map(String).join(' '), timestamp: Date.now() });
    if (_entries.length > MAX_ENTRIES) _entries.shift();
    origError(...args);
  };

  console.warn = (...args: unknown[]) => {
    _entries.push({ level: 'warn', message: args.map(String).join(' '), timestamp: Date.now() });
    if (_entries.length > MAX_ENTRIES) _entries.shift();
    origWarn(...args);
  };

  window.addEventListener('error', (e) => {
    _entries.push({
      level: 'error',
      message: `Uncaught: ${e.message} at ${e.filename}:${e.lineno}`,
      timestamp: Date.now(),
    });
    if (_entries.length > MAX_ENTRIES) _entries.shift();
  });

  window.addEventListener('unhandledrejection', (e) => {
    _entries.push({
      level: 'error',
      message: `UnhandledRejection: ${String(e.reason)}`,
      timestamp: Date.now(),
    });
    if (_entries.length > MAX_ENTRIES) _entries.shift();
  });
}

export function getConsoleEntries(): ConsoleEntry[] {
  return [..._entries];
}

export function clearConsoleEntries(): void {
  _entries.length = 0;
}
