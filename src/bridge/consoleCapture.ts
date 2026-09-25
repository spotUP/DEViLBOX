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

/**
 * Diagnostic logs worth keeping, by prefix.
 *
 * Only `error` and `warn` were captured, and the lines that actually answer
 * questions in the dub subsystem are `console.log`:
 *
 *   [DubRouter] springSlam source=lane origin=lane
 *   [DubBus] stereoDoubler ▶ delay=25ms fb=0.55 wet=0.90
 *
 * The first says WHO fired a move — a hand, the AI, or pattern data — and
 * answered three separate "the deck is playing itself" reports on 2026-09-22 by
 * itself. The second proves a move's method ran and with what parameters, which
 * for moves that build their nodes per invocation (stereoDoubler, tapeWobble,
 * madProfPingPong) is the ONLY evidence there is: nothing persistent exists
 * afterwards to read.
 *
 * Neither was reachable from `get_console_errors`, so on 2026-09-23 the
 * question "do these seven toggles do anything" was attacked with four
 * generations of audio statistics — measuring a bus return diluted into a
 * four-channel master — when the answer was one log line per move.
 *
 * Narrow on purpose: a prefix allowlist, not all of `console.log`. The ring
 * holds 500 entries and a general log capture would evict the errors it exists
 * to hold.
 */
const CAPTURED_LOG_PREFIXES = /^\[(DubRouter|DubBus|DubBusCtrl|DubPanic|DubLane|DubRecorder|FurnaceDispatch|FurnaceDispatchSynth|NativeEngineRouting)\]/;

/** Start capturing console errors/warnings and unhandled rejections */
export function startConsoleCapture(): void {
  if (_installed) return;
  _installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  const origLog = console.log.bind(console);

  console.log = (...args: unknown[]) => {
    // Formatted first: the prefix test has to see the rendered line, and the
    // first argument is not always the string (`console.log('%c…', style)`).
    const msg = argsToString(args);
    if (CAPTURED_LOG_PREFIXES.test(msg)) push('log', msg);
    origLog(...args);
  };

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
    // An Error's message can be empty (DOMException aborts, bare `new Error()`),
    // so keep its name and where it came from, or the entry says nothing.
    const r = ev.reason;
    const reason = r instanceof Error
      ? `${r.name}${r.message ? `: ${r.message}` : ''}${r.stack ? `\n${r.stack.split('\n').slice(0, 6).join('\n')}` : ''}`
      : String(r);
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
