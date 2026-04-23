/**
 * Contract tests for the DubBus echo-engine swap and RE-201 WASM swap.
 *
 * Background (2026-04-24): picking a character preset whose `echoEngine`
 * differs from the current engine (e.g. King Tubby switches to 're201')
 * silenced the entire dub bus with 5× Chrome
 * `BiquadFilterNode: state is bad, probably due to unstable filter caused
 * by fast parameter automation.` — meaning the biquads in the bus chain
 * latched to NaN, permanently dead.
 *
 * Two root causes (both fixed, both covered here):
 *
 *   1. `DubBus._swapEchoEngine` only muted `return_.gain` during the
 *      splice. The forward chain (hpf→bassShelf→tapeSat) and the external
 *      feedback tap (echo.output → feedback → feedbackShelfComp → input)
 *      were still live while the ToneAudioNode was disposed / recreated.
 *      Transients from that non-atomic surgery poisoned the biquad state.
 *      Fix: the swap quiesces `input.gain` AND `feedback.gain` AND
 *      `return_.gain`, splices, then ramps them back.
 *
 *   2. `RE201Effect.swapToWasm` connected the WASM worklet into the wet
 *      summing node BEFORE disconnecting the JS fallback. The wet node was
 *      briefly double-driven by the fallback's internal recursive delay
 *      loop AND the worklet, which surfaced as a one-block transient
 *      upstream. Fix: disconnect fallback FIRST, then wire the worklet.
 *
 * Both are static grep contracts (no audio, no WASM, <50 ms). The point
 * isn't to prove the fix — it's to make sure a future refactor can't
 * silently revert either one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function extractFn(src: string, name: string): string {
  /* Grab the body of a private method — from its signature line to the
     matching closing brace at the same indentation level. Good enough
     for these well-formatted files; throws if the method is missing. */
  const sigRe = new RegExp(`\\bprivate\\s+${name}\\s*\\(`);
  const m = sigRe.exec(src);
  if (!m) throw new Error(`method ${name} not found`);
  const start = m.index;
  /* Find the opening brace of the method body */
  const braceOpen = src.indexOf('{', start);
  if (braceOpen === -1) throw new Error(`method ${name} has no body`);
  let depth = 1;
  let i = braceOpen + 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return src.slice(start, i);
}

describe('DubBus._swapEchoEngine — transactional quiesce contract', () => {
  const src = read('src/engine/dub/DubBus.ts');
  const fn = extractFn(src, '_swapEchoEngine');

  it('mutes `return_.gain` during the splice (baseline masking)', () => {
    expect(fn).toMatch(/this\.return_\.gain\.linearRampToValueAtTime\(\s*0\s*,/);
  });

  it('mutes `input.gain` during the splice — stops forward chain from processing while echo is disposed', () => {
    expect(fn).toMatch(/this\.input\.gain\.linearRampToValueAtTime\(\s*0\s*,/);
  });

  it('mutes `feedback.gain` during the splice — breaks external feedback loop while graph is in flux', () => {
    expect(fn).toMatch(/this\.feedback\.gain\.linearRampToValueAtTime\(\s*0\s*,/);
  });

  it('restores `input.gain` after the splice', () => {
    /* The unmute ramp rises from 0 back to a non-zero captured value. */
    expect(fn).toMatch(/this\.input\.gain\.linearRampToValueAtTime\(\s*priorInputGain/);
  });

  it('restores `feedback.gain` after the splice', () => {
    expect(fn).toMatch(/this\.feedback\.gain\.linearRampToValueAtTime\(\s*priorFeedbackGain/);
  });

  it('captures prior input + feedback gain values BEFORE scheduling the mute ramp', () => {
    /* Capture must be from `.value`, not the post-ramp scheduled values,
       so the restore targets the value the user sees in the UI. */
    expect(fn).toMatch(/const\s+priorInputGain\s*=\s*this\.input\.gain\.value/);
    expect(fn).toMatch(/const\s+priorFeedbackGain\s*=\s*this\.feedback\.gain\.value/);
  });

  it('uses fresh `ctx.currentTime` for the unmute ramp (not the stale pre-splice `now`)', () => {
    /* The setTimeout callback runs ~25 ms after the outer function. Using
       the outer `now` would schedule the ramp in the past, firing it
       instantly — defeats the smoothing. */
    const inner = fn.slice(fn.indexOf('setTimeout'));
    expect(inner).toMatch(/const\s+now2\s*=\s*ctx\.currentTime/);
  });

  it('has a recovery path that restores gains on swap failure', () => {
    /* If the try/catch inside setTimeout throws, the bus would otherwise
       stay permanently muted (input + feedback + return all at 0). */
    expect(fn).toMatch(/catch\s*\(\s*err[^)]*\)[\s\S]*priorInputGain/);
  });
});

describe('RE201Effect.swapToWasm — fallback-disconnect-first contract', () => {
  const src = read('src/engine/effects/RE201Effect.ts');
  const fn = extractFn(src, 'swapToWasm');

  it('calls `disconnectFallback()` BEFORE connecting the worklet to the wet node', () => {
    const disconnectIdx = fn.indexOf('this.disconnectFallback()');
    const workletConnectIdx = fn.indexOf('this.workletNode.connect(rawWet)');
    expect(disconnectIdx, 'disconnectFallback call must be present').toBeGreaterThan(-1);
    expect(workletConnectIdx, 'worklet→wet connect must be present').toBeGreaterThan(-1);
    expect(disconnectIdx).toBeLessThan(workletConnectIdx);
  });

  it('also disconnects fallback before connecting input to worklet', () => {
    /* Both wet-side (worklet→wet) and input-side (input→worklet) must
       happen after fallback teardown so the wet node and input fan-out
       are never double-driven. */
    const disconnectIdx = fn.indexOf('this.disconnectFallback()');
    const inputConnectIdx = fn.indexOf('rawInput.connect(this.workletNode)');
    expect(inputConnectIdx, 'input→worklet connect must be present').toBeGreaterThan(-1);
    expect(disconnectIdx).toBeLessThan(inputConnectIdx);
  });
});
