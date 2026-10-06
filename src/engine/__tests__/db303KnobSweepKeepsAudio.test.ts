/**
 * "a 303 knob sweep does not flatten the audio" (owner, recurring: the 303
 * goes flat while a knob is pulled).
 *
 * Drives the UI's own entry point - useInstrumentStore.updateInstrumentRealtime
 * with the update shape the TB-303 panel sends - through the real
 * updateTB303Parameters and DB303Synth.applyConfig into the real DB303 worklet
 * and WASM (node harness), while a pattern plays. Compared with the same
 * pattern rendered with no knob moved: no non-finite sample, no step whose
 * level collapses, and the decay knob still changes the sound.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, stereoOutputs } from './workletHarness';
import { DB303Synth } from '../db303/DB303Synth';
import { updateTB303Parameters } from '../tone/SynthParameterUpdates';
import { DEFAULT_TB303 } from '@typedefs/instrument';

const sentinel = { engineCalls: 0, target: null as unknown as { synth: DB303Synth } | null };
vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    instruments: new Map(), invalidateInstrument: () => {},
    updateTB303Parameters: (id: number, cfg: never) => {
      sentinel.engineCalls++;
      const synth = sentinel.target!.synth;
      updateTB303Parameters({ instruments: new Map([[1, synth]]), instrumentIdFromKey: (k: number) => k, getInstrumentKey: (i: number) => i, invalidateInstrument() {}, getInstrument() {} } as never, 1, cfg);
      void id;
    },
  }),
}));
import { useInstrumentStore } from '../../stores/useInstrumentStore';

const STEP = 5538, STEPS = 16;
const NOTES = [36, 36, 48, 36, 39, 36, 51, 36, 36, 48, 36, 43, 36, 39, 46, 36];
type Knob = 'none' | 'cutoff' | 'resonance' | 'envMod' | 'decay' | 'decayMidi' | 'accent';

async function render(knob: Knob) {
  const { proc, send } = await startWorklet('db303', 'DB303', (DB303Synth as unknown as { transformDB303Glue(c: string): string }).transformDB303Glue);
  const synth = Object.create(DB303Synth.prototype) as DB303Synth;
  const priv = synth as unknown as Record<string, unknown>;
  priv.workletNode = { port: { postMessage: (m: unknown) => { void send(m); } } };
  priv._disposed = false; priv._pendingParams = [];
  sentinel.target = { synth };
  const id = useInstrumentStore.getState().createInstrument({ name: 'k', type: 'synth', synthType: 'TB303', tb303: structuredClone(DEFAULT_TB303) } as never);
  synth.applyConfig(structuredClone(DEFAULT_TB303));
  const L = new Float32Array(STEP * STEPS + 256);
  let pos = 0, blk = 0;
  while (pos < STEP * STEPS) {
    if (pos % STEP < 128) { const s = Math.floor(pos / STEP); await send({ type: 'noteOn', note: NOTES[s], velocity: s % 4 === 2 ? 127 : 90, slide: s % 8 === 5 }); }
    if (knob !== 'none') {
      const t = (blk % 40) / 40, v = t < 0.5 ? t * 2 : 2 - t * 2;
      const tb = useInstrumentStore.getState().instruments.find((i) => i.id === id)!.tb303!;
      // The panel's updateFilter / updateFilterEnvelope / updateAccent shapes.
      const u = knob === 'cutoff' ? { filter: { ...tb.filter, cutoff: v } }
        : knob === 'resonance' ? { filter: { ...tb.filter, resonance: v } }
        : knob === 'envMod' ? { filterEnvelope: { ...tb.filterEnvelope, envMod: v } }
        : knob === 'decay' ? { filterEnvelope: { ...tb.filterEnvelope, decay: v }, devilFish: { ...tb.devilFish, normalDecay: v } }
        // MIDI / automation (parameterRouter 'decay' route): only filterEnvelope.decay is written.
        : knob === 'decayMidi' ? { filterEnvelope: { ...tb.filterEnvelope, decay: v } }
        : { accent: { ...tb.accent, amount: v } };
      useInstrumentStore.getState().updateInstrumentRealtime(id, { tb303: { ...tb, ...u } } as never);
    }
    const out = stereoOutputs(1, 128); proc.process([], out);
    L.set(out[0][0], pos); pos += 128; blk++;
  }
  return L;
}
const stepRms = (L: Float32Array) => Array.from({ length: STEPS }, (_, s) => { let e = 0; for (let i = s * STEP; i < (s + 1) * STEP; i++) e += L[i] * L[i]; return Math.sqrt(e / STEP); });

describe('a 303 knob sweep does not flatten the audio', () => {
  it('keeps every step audible and finite for each main knob, and the knob moves the sound', async () => {
    const base = await render('none');
    const baseRms = stepRms(base);
    expect(Math.min(...baseRms)).toBeGreaterThan(0.05);
    for (const k of ['cutoff', 'resonance', 'envMod', 'decay', 'decayMidi', 'accent'] as Knob[]) {
      const before = sentinel.engineCalls;
      const L = await render(k);
      expect(sentinel.engineCalls - before, `${k}: knob path reached the synth`).toBeGreaterThan(50);
      expect(L.every(Number.isFinite), `${k}: finite`).toBe(true);
      const r = stepRms(L);
      r.forEach((x, s) => expect(x, `${k} step ${s} level collapsed`).toBeGreaterThan(baseRms[s] * 0.35));
      let diff = 0; for (let i = 0; i < L.length; i++) diff += Math.abs(L[i] - base[i]);
      expect(diff, `${k}: sweeping the knob changes the sound`).toBeGreaterThan(1);
    }
  }, 120000);
});
