/**
 * What the console capture keeps, and what it must not.
 *
 * It intercepted `error` and `warn` only. The lines that answer questions in
 * the dub subsystem are `console.log`, so the tooling could not read them:
 *
 *   [DubRouter] springSlam source=lane origin=lane
 *   [DubBus] stereoDoubler ▶ delay=25ms fb=0.55 wet=0.90
 *
 * On 2026-09-23 that gap sent a whole investigation down the wrong road — four
 * generations of audio statistics to answer "does this move run", when the move
 * says so itself on every fire.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startConsoleCapture, getConsoleEntries, clearConsoleEntries } from '../consoleCapture';

describe('consoleCapture', () => {
  beforeEach(() => {
    startConsoleCapture();
    clearConsoleEntries();
  });

  afterEach(() => {
    clearConsoleEntries();
  });

  it('keeps the DubRouter line that says WHO fired a move', () => {
    // The fastest diagnostic in this subsystem: source=live is a hand,
    // source=lane is pattern data, origin=ai is AutoDub. Three "the deck is
    // playing itself" reports were answered by this column alone.
    console.log('[DubRouter] springSlam source=lane origin=lane');

    const entries = getConsoleEntries();
    expect(entries.some(e => e.message.includes('source=lane'))).toBe(true);
  });

  it('keeps the DubBus line that proves a move ran and with what parameters', () => {
    // stereoDoubler builds its nodes per invocation and throws them away on
    // release, so nothing persistent exists to read afterwards. This line is
    // the only evidence the move engaged.
    console.log('[DubBus] stereoDoubler ▶ delay=25ms fb=0.55 wet=0.90');

    const entry = getConsoleEntries().find(e => e.message.includes('stereoDoubler'));
    expect(entry, 'the only evidence a transient-node move ran was dropped').toBeDefined();
    expect(entry!.level).toBe('log');
    expect(entry!.message).toContain('wet=0.90');
  });

  it('still keeps errors and warnings', () => {
    console.warn('[DubBus] backwardReverb abort — captured SILENCE (peak=7.51e-6)');
    console.error('boom');

    const entries = getConsoleEntries();
    expect(entries.some(e => e.level === 'warn' && e.message.includes('captured SILENCE'))).toBe(true);
    expect(entries.some(e => e.level === 'error' && e.message === 'boom')).toBe(true);
  });

  it('does NOT keep ordinary logs', () => {
    // The ring holds 500 entries. Capturing every log would evict the errors it
    // exists to hold, which is why this is a prefix allowlist and not a switch.
    console.log('[Canvas DOM] playback started: row=34 pattern=7');
    console.log('rendering frame');
    console.log('%c * Tone.js v14.7.39 * ', 'background: #000');

    expect(getConsoleEntries()).toHaveLength(0);
  });

  it('matches the rendered line, not the first argument', () => {
    // `console.log('[DubBus] x', 1, 2)` and a non-string first argument both
    // have to reach the same prefix test.
    console.log('[DubBus] setSettings enabled=%s', true);

    expect(getConsoleEntries().some(e => e.message.startsWith('[DubBus] setSettings'))).toBe(true);
  });
});
