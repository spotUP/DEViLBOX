/**
 * Owner (2026-10-19): "when i add more than one channel of softsynths everything gets distorted ... if i solo 1
 * channel it sounds fine".
 *
 * An UpRough instrument at -12 dB played at unity. applyInstrumentOutputLevel wrote the level to `output.gain`, and
 * ToneEngine.releaseAll faded that same gain to 0 on every stop and 100 ms later put it back at 1 ("the output
 * GainNode is a pass-through"). The two "stuck at 0" safety writes did the same. So after the first stop every
 * DevilboxSynth ran at full scale, and four of them summed past the limiter.
 *
 * One owner now: instrumentOutputLevel remembers the level it applied per instance, and every stop-time write of
 * `output.gain` goes back to that level. The fade helper is driven here with the real code and fake timers; the
 * ToneEngine wiring is checked by reading the source, as toneEngineSurvivesModuleReload.test.ts does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  applyInstrumentOutputLevel,
  instrumentOutputGain,
  restoreInstrumentOutputGain,
  fadeOutThenRestoreInstrumentOutput,
  type OutputGainParam,
} from '../instrumentOutputLevel';

const db = (gain: number) => 20 * Math.log10(gain);

/** A native AudioParam stand-in that records its automation. */
function fakeGain(value = 1) {
  const g = {
    value,
    events: [] as string[],
    cancelScheduledValues(t: number) { g.events.push(`cancel@${t}`); },
    setValueAtTime(v: number, t: number) { g.events.push(`set:${v.toFixed(3)}@${t}`); g.value = v; },
    linearRampToValueAtTime(v: number, t: number) { g.events.push(`ramp:${v}@${t}`); g.value = v; },
  };
  return g;
}

afterEach(() => { vi.useRealTimers(); });

describe('instrument volume survives stop', () => {
  it('releaseAll fade restores the applied level, not unity (-12 dB stays -12 dB)', () => {
    vi.useFakeTimers();
    const gain = fakeGain();
    const synth = { output: { gain } };
    applyInstrumentOutputLevel(synth, 'UpRoughSoftsynth', -12);
    const applied = gain.value;
    expect(db(applied)).toBeCloseTo(-12, 5);

    let restored = 0;
    fadeOutThenRestoreInstrumentOutput(synth, gain as OutputGainParam, 2, () => { restored++; });
    expect(gain.events).toEqual(['cancel@2', `set:${applied.toFixed(3)}@2`, 'ramp:0@2.05']);
    expect(gain.value).toBe(0);

    vi.advanceTimersByTime(99);
    expect(gain.value).toBe(0);
    vi.advanceTimersByTime(1);
    expect(restored).toBe(1);
    expect(gain.value).toBe(applied);
    expect(db(gain.value)).toBeCloseTo(-12, 5);
  });

  it('a volume change between plays is what the next restore comes back to', () => {
    vi.useFakeTimers();
    const gain = fakeGain();
    const synth = { output: { gain } };
    applyInstrumentOutputLevel(synth, 'UpRoughSoftsynth', -12);
    applyInstrumentOutputLevel(synth, 'UpRoughSoftsynth', -8);
    fadeOutThenRestoreInstrumentOutput(synth, gain as OutputGainParam, 0, () => {});
    vi.advanceTimersByTime(100);
    expect(db(gain.value)).toBeCloseTo(-8, 5);
  });

  it('a second release while the gain sits at 0 fades from the applied level, not from 0 or unity', () => {
    vi.useFakeTimers();
    const gain = fakeGain();
    const synth = { output: { gain } };
    applyInstrumentOutputLevel(synth, 'UpRoughSoftsynth', -12);
    const applied = gain.value;
    fadeOutThenRestoreInstrumentOutput(synth, gain as OutputGainParam, 0, () => {});
    gain.events.length = 0;
    fadeOutThenRestoreInstrumentOutput(synth, gain as OutputGainParam, 1, () => {});
    expect(gain.events[1]).toBe(`set:${applied.toFixed(3)}@1`);
  });

  it('the stuck-at-0 safety write restores the applied level; an instance never levelled restores to unity', () => {
    const gain = fakeGain(0);
    const synth = { output: { gain } };
    applyInstrumentOutputLevel(synth, 'UpRoughSoftsynth', -12);
    gain.value = 0;
    expect(restoreInstrumentOutputGain(synth, gain as OutputGainParam)).toBe(instrumentOutputGain(synth));
    expect(db(gain.value)).toBeCloseTo(-12, 5);

    const bare = fakeGain(0);
    const never = { output: { gain: bare } };
    expect(instrumentOutputGain(never)).toBe(1);
    restoreInstrumentOutputGain(never, bare as OutputGainParam);
    expect(bare.value).toBe(1);
  });
});

describe('ToneEngine writes a DevilboxSynth output gain only through instrumentOutputLevel', () => {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const src = readFileSync(resolve(ROOT, 'engine/ToneEngine.ts'), 'utf8');

  it('releaseAll fades DevilboxSynths with fadeOutThenRestoreInstrumentOutput', () => {
    const body = src.match(/public releaseAll\(\): void \{([\s\S]*?)\n {2}\}/)?.[1] ?? '';
    expect(body).toContain('fadeOutThenRestoreInstrumentOutput(instrument, outputGain, now');
    expect(body).not.toMatch(/outputGain\.value = 1\b/);
  });

  it('the two stuck-at-0 safety sites restore the applied level', () => {
    expect(src.match(/if \(gain\.value === 0\) restoreInstrumentOutputGain\(/g)).toHaveLength(2);
    expect(src).not.toMatch(/gain\.value === 0\) \{ gain\.cancelScheduledValues\(0\); gain\.value = 1; \}/);
  });
});
