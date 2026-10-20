/**
 * The song drum bank against tools/hiphop.py drum_bank + hiphop_kit add_snare_accent / add_snare_ghost (plan
 * 2026-10-19 O6b). fixtures/drum_bank.json holds every style at seed 0 (jazz_rap and east_coast also at seed 3) and
 * _boombap_snare over hard x dark x seed (tools/softsynth-fixtures/gen_drum_bank.py). The style-independent voices
 * are stored once per drum machine. Float64 with the same op order and RNG draws: 1e-9 per kept sample, equal
 * lengths, the same voice set in the same order.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/drum_bank.json';
import {
  SNARE_ACCENT_VOICE, SNARE_GHOST_VOICE, STYLE_DRUMS, addSnareAccent, addSnareGhost, boombapSnare, songDrumBank,
  type HipHopStyle,
} from '../drumBank';

interface Pinned { n: number; kept: number[]; rms: number }
interface Bank { style: HipHopStyle; seed: number; machine: string; keys: string[]; voices: Record<string, Pinned> }
interface Snare { hard: boolean; dark: boolean; seed: number; y: Pinned }
const ref = fixture as unknown as {
  rate: number; keep: number; banks: Bank[]; shared: Record<string, Record<string, Pinned>>; boombap_snares: Snare[];
};
const { rate, keep } = ref;

function expectPinned(y: Float64Array, p: Pinned): void {
  expect(y.length).toBe(p.n);
  let worst = 0;
  p.kept.forEach((r, k) => { worst = Math.max(worst, Math.abs(y[k * keep]! - r)); });
  expect(worst).toBeLessThanOrEqual(1e-9);
  let sq = 0;
  for (let k = 0; k < y.length; k++) sq += y[k]! * y[k]!;
  expect(Math.abs(Math.sqrt(sq / y.length) - p.rms)).toBeLessThanOrEqual(1e-9);
}

describe('song drum bank matches hiphop.py', () => {
  it('covers every style', () => {
    expect([...new Set(ref.banks.map((b) => b.style))]).toEqual(Object.keys(STYLE_DRUMS));
  });

  it.each(ref.banks.map((b) => [`${b.style} seed ${b.seed}`, b] as const))('%s is sample-exact', (_, b) => {
    const bank = songDrumBank(b.style, rate, b.seed);
    expect(Object.keys(bank)).toEqual(b.keys);
    for (const [name, p] of Object.entries({ ...ref.shared[b.machine]!, ...b.voices })) expectPinned(bank[name]!, p);
  });

  it.each(ref.boombap_snares.map((s) => [`hard ${s.hard} dark ${s.dark} seed ${s.seed}`, s] as const))(
    'boombap snare %s is sample-exact', (_, s) => expectPinned(boombapSnare(rate, { hard: s.hard, dark: s.dark }, s.seed), s.y),
  );

  it('moves the snare with the seed', () => {
    const a = songDrumBank('east_coast', rate, 0).snare!;
    const b = songDrumBank('east_coast', rate, 3).snare!;
    expect(a.some((v, i) => v !== b[i])).toBe(true);
  });

  it('adds no accent without a snare and a clap, and no ghost without a snare', () => {
    const clapOnly = { clap: new Float64Array(4) };
    expect(addSnareAccent(clapOnly)).toBe(clapOnly);
    expect(SNARE_ACCENT_VOICE in addSnareAccent({ snare: new Float64Array(4) })).toBe(false);
    expect(addSnareGhost(clapOnly, rate)).toBe(clapOnly);
    expect(SNARE_GHOST_VOICE in addSnareGhost(clapOnly, rate)).toBe(false);
  });
});
