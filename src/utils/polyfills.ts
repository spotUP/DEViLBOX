/**
 * Polyfills for older browsers (Tesla Model 3 Chromium, older tablets, etc.)
 *
 * Import this file at the top of main.tsx BEFORE any other imports.
 */

// structuredClone — Chrome 98+, Safari 15.4+
// Fallback uses JSON round-trip which handles the plain data objects DEViLBOX clones
// (patterns, instruments, effects configs — no Date, Map, Set, RegExp, etc.)
if (typeof globalThis.structuredClone !== 'function') {
  (globalThis as Record<string, unknown>).structuredClone = <T>(value: T): T => {
    return JSON.parse(JSON.stringify(value));
  };
}
