/**
 * Scratch baseline lock (SCR-P0.1, plan 2026-10-11-scratch-dj-progress.md,
 * owner plan Gate A). Freezes what the scratch system is before the scratch
 * DJ work changes it, so every later phase can show which number it moved:
 *
 *   - 19 patterns in `SCRATCH_PATTERNS`, in the canonical order the keyboard
 *     commands and the `Xnn` tracker effect index into;
 *   - 25 `ScratchActionId` values (19 patterns + stop + 5 fader LFO);
 *   - the release timing in `DeckEngine.stopScratch`: decay 200 ms, hard
 *     reset at decay + 50 ms, phase align at decay + 350 ms; pattern stop
 *     decays over 300 ms; the pattern clock ticks every 10 ms.
 *
 * Numbers documented in thoughts/shared/research/2026-10-11_scratch-baseline.md.
 * Pure-data: no AudioContext. The timing constants are read from the source
 * because they are default-parameter and literal values with no runtime
 * handle (a class instance needs the audio graph).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCRATCH_PATTERNS } from '../DJScratchEngine';
import type { ScratchActionId } from '@typedefs/drumpad';

const ROOT = process.cwd();
const deckEngineSrc = readFileSync(resolve(ROOT, 'src/engine/dj/DeckEngine.ts'), 'utf8');
const scratchEngineSrc = readFileSync(resolve(ROOT, 'src/engine/dj/DJScratchEngine.ts'), 'utf8');

export const BASELINE_PATTERN_ORDER: readonly string[] = [
  'Baby Scratch', 'Transformer', 'Flare', 'Hydroplane', 'Crab', 'Orbit',
  'Chirp', 'Stab', 'Scribble', 'Tear', 'Uzi', 'Twiddle', '8-Finger Crab',
  '3-Click Flare', 'Laser', 'Phaser', 'Tweak', 'Drag', 'Vibrato',
];

// `Record<ScratchActionId, 1>` is exhaustive: adding or removing a member of
// the union without touching this table is a type error, so the count below
// is checked by the compiler as well as at run time.
const SCRATCH_ACTION_IDS: Record<ScratchActionId, 1> = {
  scratch_baby: 1, scratch_trans: 1, scratch_flare: 1, scratch_hydro: 1, scratch_crab: 1,
  scratch_orbit: 1, scratch_chirp: 1, scratch_stab: 1, scratch_scribble: 1, scratch_tear: 1,
  scratch_uzi: 1, scratch_twiddle: 1, scratch_8crab: 1, scratch_3flare: 1, scratch_laser: 1,
  scratch_phaser: 1, scratch_tweak: 1, scratch_drag: 1, scratch_vibrato: 1,
  scratch_stop: 1,
  fader_lfo_off: 1, fader_lfo_1_4: 1, fader_lfo_1_8: 1, fader_lfo_1_16: 1, fader_lfo_1_32: 1,
};

export const BASELINE = {
  patternCount: 19,
  actionIdCount: 25,
  stopScratchDecayMs: 200,
  hardResetAfterDecayMs: 50,
  phaseAlignAfterDecayMs: 350,
  patternStopDecayMs: 300,
  patternTickMs: 10,
  jogDirectionSwitchCooldownMs: 20,
} as const;

describe('scratch baseline lock (SCR-P0.1)', () => {
  it('has 19 patterns in the canonical order', () => {
    expect(SCRATCH_PATTERNS).toHaveLength(BASELINE.patternCount);
    expect(SCRATCH_PATTERNS.map(p => p.name)).toEqual(BASELINE_PATTERN_ORDER);
  });

  it('has 25 scratch action ids: 19 patterns, stop, 5 fader LFO', () => {
    const ids = Object.keys(SCRATCH_ACTION_IDS);
    expect(ids).toHaveLength(BASELINE.actionIdCount);
    expect(ids.filter(id => id.startsWith('scratch_') && id !== 'scratch_stop')).toHaveLength(19);
    expect(ids.filter(id => id.startsWith('fader_lfo_'))).toHaveLength(5);
  });

  it('releases a jog scratch with decay 200 ms, hard reset +50 ms, phase align +350 ms', () => {
    expect(deckEngineSrc).toMatch(/stopScratch\(decayMs = 200\)/);
    expect(deckEngineSrc).toMatch(/\}, decayMs \+ 50\);/);
    expect(deckEngineSrc).toMatch(/\}, decayMs \+ 350\);/);
    expect(deckEngineSrc).toMatch(/JOG_DIR_SWITCH_COOLDOWN_MS = 20;/);
  });

  it('stops a pattern with a 300 ms decay and ticks the pattern clock every 10 ms', () => {
    expect(deckEngineSrc).toMatch(/this\._decayToRest\(300\);/);
    expect(scratchEngineSrc).toMatch(/setInterval\(\(\) => this\._tickPattern\(\), 10\);/);
  });
});
