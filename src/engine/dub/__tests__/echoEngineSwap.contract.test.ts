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

describe('DubBus — biquad automation safety contract (Chrome "state is bad" prevention)', () => {
  const src = read('src/engine/dub/DubBus.ts');

  it('exposes a `rampBiquadParam` helper', () => {
    /* The helper MUST use cancelScheduledValues + setValueAtTime +
       linearRampToValueAtTime — Chrome's biquad destabilizes with
       `setTargetAtTime` when freq/Q/gain change simultaneously (the
       exponential approach has no deterministic endpoint and can leave
       the filter's internal state in an unstable region). */
    expect(src).toMatch(/function\s+rampBiquadParam\s*\(/);
    const fnMatch = /function\s+rampBiquadParam[\s\S]*?^}/m.exec(src);
    expect(fnMatch, 'rampBiquadParam body must parse').toBeTruthy();
    const body = fnMatch![0];
    expect(body).toMatch(/cancelScheduledValues/);
    expect(body).toMatch(/setValueAtTime/);
    expect(body).toMatch(/linearRampToValueAtTime/);
    /* NaN guard — prevents a stale NaN in param.value from propagating
       into the ramp's origin and poisoning the linear interpolation. */
    expect(body).toMatch(/Number\.isFinite/);
  });

  it('routes the at-risk biquad params through the helper (no raw setTargetAtTime on feedback-loop biquads)', () => {
    /* These biquads sit INSIDE the echo feedback loop or the forward
       chain that feeds it — `bassShelf`, `feedbackShelfComp`, the hpf
       cascade, `midScoop`, and their master-insert counterparts. A
       setTargetAtTime on any of them during a Tubby-style multi-param
       transition (gain 0→+9 dB with simultaneous freq + Q change) will
       flag "state is bad" and NaN the filter. */
    const atRiskIdentifiers = [
      'this.hpf.frequency',
      'this.hpf2.frequency',
      'this.hpf3.frequency',
      'this.bassShelf.frequency',
      'this.bassShelf.Q',
      'this.bassShelf.gain',
      'this.feedbackShelfComp.frequency',
      'this.feedbackShelfComp.Q',
      'this.feedbackShelfComp.gain',
      'this.midScoop.frequency',
      'this.midScoop.Q',
      'this.midScoop.gain',
      'this.masterBassShelf.frequency',
      'this.masterBassShelf.Q',
      'this.masterBassShelf.gain',
      'this.masterMidScoop.frequency',
      'this.masterMidScoop.Q',
      'this.masterMidScoop.gain',
    ];
    for (const id of atRiskIdentifiers) {
      const esc = id.replace(/\./g, '\\.');
      const bad = new RegExp(`${esc}\\.setTargetAtTime`);
      expect(src, `${id} must not use setTargetAtTime — route through rampBiquadParam`).not.toMatch(bad);
    }
  });
});

describe('Echo effect swapToWasm — fallback-disconnect-first contract (all dub-bus echoes)', () => {
  /* Three of the four DubBus echo engines have a JS fallback → WASM
     swap path: RE-201 (Tubby, Mad Professor), RETapeEcho (Mad Professor
     alternate), AnotherDelay (Perry). All three must disconnect the
     fallback BEFORE wiring the worklet into the wet summing node —
     otherwise the fallback's internal recursive delay loop briefly
     overlaps with the worklet output, producing a transient that
     poisons upstream biquads in the DubBus feedback chain. */
  const echoFiles = [
    { path: 'src/engine/effects/RE201Effect.ts', label: 'RE-201' },
    { path: 'src/engine/effects/RETapeEchoEffect.ts', label: 'RETapeEcho' },
    { path: 'src/engine/effects/AnotherDelayEffect.ts', label: 'AnotherDelay' },
  ];

  for (const { path, label } of echoFiles) {
    describe(label, () => {
      const src = read(path);
      const fn = extractFn(src, 'swapToWasm');

      it('calls `disconnectFallback()` BEFORE connecting the worklet to the wet node', () => {
        const disconnectIdx = fn.indexOf('this.disconnectFallback()');
        const workletConnectIdx = fn.indexOf('this.workletNode.connect(rawWet)');
        expect(disconnectIdx, `${label}: disconnectFallback must be present`).toBeGreaterThan(-1);
        expect(workletConnectIdx, `${label}: worklet→wet connect must be present`).toBeGreaterThan(-1);
        expect(disconnectIdx).toBeLessThan(workletConnectIdx);
      });

      it('disconnects fallback before wiring input to worklet', () => {
        const disconnectIdx = fn.indexOf('this.disconnectFallback()');
        const inputConnectIdx = fn.indexOf('rawInput.connect(this.workletNode)');
        expect(inputConnectIdx, `${label}: input→worklet connect must be present`).toBeGreaterThan(-1);
        expect(disconnectIdx).toBeLessThan(inputConnectIdx);
      });
    });
  }
});

describe('DubBus — NaN-scrubber contract on feedback tap', () => {
  /* 2026-04-29: after fixes 1+2+3 (transactional quiesce, biquad ramp
     helper, fallback-disconnect-first) the Tubby preset crash still
     reproduced — meaning a non-finite sample can still enter the
     feedback tap (echo.output → feedback → shelf → input) from a source
     we haven't identified. A single NaN sample latches the hpf cascade +
     bassShelf + feedbackShelfComp to "state is bad" permanently because
     `0 * NaN === NaN` in IEEE-754, so even `feedback.gain = 0` doesn't
     stop the poison.

     Defence: insert an AudioWorklet-based sample-level NaN/Inf scrubber
     between `this.feedback` and `this.feedbackShelfComp`. Any non-finite
     sample is replaced with 0 before it reaches the biquads. */
  const src = read('src/engine/dub/DubBus.ts');
  const worklet = read('public/worklets/nan-scrubber.worklet.js');

  it('declares the `_feedbackScrubber` node field', () => {
    expect(src).toMatch(/private\s+_feedbackScrubber\s*:/);
  });

  it('wires feedback → _feedbackScrubber → feedbackShelfComp', () => {
    expect(src).toMatch(/this\.feedback\.connect\(this\._feedbackScrubber\)/);
    expect(src).toMatch(/this\._feedbackScrubber\.connect\(this\.feedbackShelfComp\)/);
  });

  it('no longer wires feedback directly into feedbackShelfComp (scrubber must be in the path)', () => {
    expect(src).not.toMatch(/this\.feedback\.connect\(this\.feedbackShelfComp\)/);
  });

  it('loads the scrubber worklet module at construction', () => {
    expect(src).toMatch(/_loadFeedbackScrubberWorklet/);
    expect(src).toMatch(/addModule\(.*worklets\/nan-scrubber\.worklet\.js/);
  });

  it('scrubber worklet replaces NaN/Inf with 0', () => {
    expect(worklet).toMatch(/registerProcessor\(\s*['"]nan-scrubber['"]/);
    /* NaN self-inequality check or equivalent, and both Infinities */
    expect(worklet).toMatch(/s\s*!==\s*s|isNaN|Number\.isNaN/);
    expect(worklet).toMatch(/Infinity/);
  });
});


