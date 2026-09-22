import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Reverse Echo captured silence on AHX.
 *
 * The dub-channel enable is posted to an engine's AudioWorklet, and the
 * worklets disagree about the envelope: LibOpenMPT switches on `cmd`, while
 * Hively, UADE and Furnace switch on `type`. Two of the three call sites sent
 * both fields; `rebuildDubConnections` sent only `cmd`.
 *
 * On Hively that message matched no case and was dropped without a word, while
 * the caller went on to record the channel as active. Measured 2026-09-22 on
 * jennipha.ahx, bus on, all four sends open: `dubChannelEnabled` false for
 * every channel, `dubPasses: 0`, `bus.input` RMS 0.000005 against a main
 * render of 0.13. Every move that CAPTURES the bus read that silence.
 *
 * This is asserted against the SOURCE rather than by driving the class,
 * because the fault is a message that is silently ignored: a mock worklet
 * would happily accept the broken envelope too, and only the real worklet's
 * `switch (data.type)` rejects it. The check is therefore the one thing that
 * actually matters — that no site builds the envelope by hand.
 */

const ROOT = resolve(__dirname, '../../../..');
const SOURCE = resolve(ROOT, 'src/engine/tone/ChannelRoutedEffects.ts');
const HIVELY_WORKLET = resolve(ROOT, 'public/hively/Hively.worklet.js');

describe('the dub channel enable message', () => {
  const src = readFileSync(SOURCE, 'utf-8');

  it('is never built inline — every site goes through the one builder', () => {
    // An inline `postMessage({ cmd: 'dubChannel...` is how the envelopes drifted.
    const inline = [...src.matchAll(/postMessage\(\s*\{[^}]*dubChannel(Enable|Disable)/g)];
    expect(inline.map(m => m[0])).toEqual([]);
  });

  it('carries both `cmd` and `type`, because the worklets disagree', () => {
    const builder = src.match(/function dubChannelMessage\([\s\S]*?\n\}/);
    expect(builder).not.toBeNull();
    const body = builder![0];
    expect(body).toMatch(/cmd:\s*action/);
    expect(body).toMatch(/type:\s*action/);
  });

  it('posts it at every site that enables or disables a channel', () => {
    const calls = [...src.matchAll(/postMessage\(dubChannelMessage\(/g)];
    // Two enables (activate + rebuild) and one disable.
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the Hively worklet, which is what rejected the short envelope', () => {
  const worklet = readFileSync(HIVELY_WORKLET, 'utf-8');

  it('dispatches on `type`, so a `cmd`-only message reaches no case', () => {
    expect(worklet).toMatch(/switch\s*\(\s*data\.type\s*\)/);
  });

  it('still has the cases the builder names', () => {
    expect(worklet).toMatch(/case 'dubChannelEnable'/);
    expect(worklet).toMatch(/case 'dubChannelDisable'/);
  });
});
