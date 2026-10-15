/**
 * "AdLib / OPL3 plays silent when I change preset, and it may have low volume as well" (owner, 2026-10-15;
 * instrument 'OPL3 FM Bass', synth FurnaceOPL - the Furnace chip, not the standalone OPL3Synth).
 *
 * Measured on the real dispatch worklet and WASM (no AudioContext), through the real
 * FurnaceDispatchSynth.uploadInstrumentFromConfig, each preset merged over the instrument as the store merges it:
 *  - every OPL3 preset of the OPL3 'Organ/Slap Bass/Bass Drum/Snare/Brass' set declared chip id 14 (OPNB), the
 *    upload "corrected" it to OPL and kept operators 0 and 2 - for [modulator, carrier, off, off] the carrier became a
 *    disabled operator: -102 dB, silence. OPLL presets declared 9 (VRC6).
 *  - the 'OPL3 FM ...' presets only carried algorithm and feedback, so they sat on the OPN-shaped default
 *    (carrier TL 50): -36 dB.
 *  - every user instrument uploaded into slot 0 of the one shared instrument table, so a silent preset on one
 *    instrument replaced the patch of every other OPL3 instrument.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { startWorklet, stereoOutputs } from './workletHarness';
import { FurnaceDispatchSynth } from '../furnace-dispatch/FurnaceDispatchSynth';
import { SYNTH_TO_DISPATCH } from '../furnace-dispatch/synthPlatforms';
import { furnaceSlotOf, fitFmToChip } from '../furnace-dispatch/fmInstrument';
import { getDefaultFurnaceConfig } from '../factories/FurnaceChipSynthFactory';
import { updateFurnaceInstrument } from '../tone/SynthParameterUpdates';
import { FURNACE_PRESETS } from '@constants/furnacePresets';
import { FURNACE_CHIP_PRESETS } from '@constants/furnaceChipPresets';

type Proc = { process(i: unknown[], o: Float32Array[][]): boolean };
type Preset = { name: string; synthType: string; furnace?: Record<string, unknown> };

let w: Awaited<ReturnType<typeof startWorklet>>;
beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  w = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
}, 60000);

const REFERENCE = 'FurnaceNES';
const OPL_FAMILY = /^Furnace(OPL|OPLL|OPL4|Y8950|VRC7)$/;
const PRESETS = ([...FURNACE_PRESETS, ...FURNACE_CHIP_PRESETS] as Preset[]).filter((p) => OPL_FAMILY.test(p.synthType));
const VOLUME_MAX: Record<number, number> = { 28: 15, 48: 15 };

/** The instrument as the editor leaves it after `preset` is picked: the store shallow-merges `furnace` over the old one. */
function afterPick(preset: Preset, previous?: Preset): Record<string, unknown> {
  const base = previous
    ? { ...getDefaultFurnaceConfig(previous.synthType)!, ...previous.furnace }
    : getDefaultFurnaceConfig(preset.synthType) ?? {};
  return { ...base, ...preset.furnace };
}

function synthFor(synthType: string, id: number, uploads: Array<{ slot: number; data: Uint8Array }>) {
  const pt = SYNTH_TO_DISPATCH[synthType];
  const s = Object.create(FurnaceDispatchSynth.prototype) as FurnaceDispatchSynth & Record<string, unknown>;
  Object.assign(s, {
    platformType: pt, furnaceInstrumentIndex: furnaceSlotOf({ id }), currentChannel: 0, _isReady: true,
    _isReadyPromise: Promise.resolve(),
    engine: { uploadFurnaceInstrument: (slot: number, data: Uint8Array) => uploads.push({ slot, data }), getChannelCount: () => 9, setInstrument() {}, loadIns2() {} },
  });
  return { s, pt };
}

async function playOnFreshChip(pt: number, slot: number, data: Array<{ slot: number; data: Uint8Array }>): Promise<{ rmsDb: number; peakDb: number }> {
  await w.send({ type: 'destroyChip', platformType: pt });
  await w.send({ type: 'createChip', platformType: pt, sampleRate: 48000 });
  for (const d of data) await w.send({ type: 'setInstrumentFull', insIndex: d.slot, insData: d.data, platformType: pt });
  return noteAndRender(pt, slot);
}

async function noteAndRender(pt: number, slot: number) {
  const vmax = VOLUME_MAX[pt] ?? 127;
  await w.send({ type: 'dispatch', platformType: pt, cmd: 4, chan: 0, val1: slot, val2: 1 });
  await w.send({ type: 'dispatch', platformType: pt, cmd: 5, chan: 0, val1: vmax, val2: 0 });
  await w.send({ type: 'dispatch', platformType: pt, cmd: 0, chan: 0, val1: 48, val2: 0 });
  const outs = stereoOutputs(37); let ss = 0, pk = 0;
  const blocks = 200;
  for (let b = 0; b < blocks; b++) {
    (w.proc as unknown as Proc).process([], outs);
    for (const c of [outs[0][0], outs[0][1]]) for (const v of c) { ss += v * v; pk = Math.max(pk, Math.abs(v)); }
  }
  return { rmsDb: 20 * Math.log10(Math.sqrt(ss / (blocks * 256)) + 1e-9), peakDb: 20 * Math.log10(pk + 1e-9) };
}

async function uploadAndPlay(preset: Preset, previous?: Preset, id = 1) {
  const uploads: Array<{ slot: number; data: Uint8Array }> = [];
  const { s, pt } = synthFor(preset.synthType, id, uploads);
  await s.uploadInstrumentFromConfig(afterPick(preset, previous), preset.name);
  expect(uploads.length, 'sentinel: the synth encoded and sent the patch').toBe(1);
  return playOnFreshChip(pt, uploads[0].slot, uploads);
}

async function reference(synthType: string) {
  const uploads: Array<{ slot: number; data: Uint8Array }> = [];
  const { s, pt } = synthFor(synthType, 1, uploads);
  await s.uploadInstrumentFromConfig(getDefaultFurnaceConfig(synthType) as unknown as Record<string, unknown>, 'ref');
  return playOnFreshChip(pt, furnaceSlotOf({ id: 1 }), uploads);
}

describe('every OPL-family Furnace preset sounds after a preset change', () => {
  it('has the presets the select offers', () => {
    expect(PRESETS.length).toBeGreaterThan(25);
    expect(PRESETS.some((p) => p.name === 'OPL3 FM Bass')).toBe(true);
  });

  for (const preset of PRESETS) {
    it(`${preset.name} (${preset.synthType}) is audible and within range of the reference chip`, async () => {
      // Picked from fresh, and picked over another preset of the same synth (the owner's case).
      const other = PRESETS.find((p) => p.synthType === preset.synthType && p.name !== preset.name);
      const fresh = await uploadAndPlay(preset);
      const over = await uploadAndPlay(preset, other);
      const ref = await reference(REFERENCE);
      if (process.env.OPL_REPORT) (await import('node:fs')).appendFileSync(process.env.OPL_REPORT, `${preset.name}\t${fresh.rmsDb.toFixed(1)}\t${over.rmsDb.toFixed(1)}\tref ${ref.rmsDb.toFixed(1)}\n`);
      for (const m of [fresh, over]) {
        expect(m.rmsDb, `${preset.name}: rms ${m.rmsDb.toFixed(1)} dB peak ${m.peakDb.toFixed(1)} dB`).toBeGreaterThan(-45);
        expect(Math.abs(m.rmsDb - ref.rmsDb), `${preset.name} ${m.rmsDb.toFixed(1)} dB vs ${REFERENCE} ${ref.rmsDb.toFixed(1)} dB`).toBeLessThan(6);
      }
    }, 30000);
  }
});

describe('instruments do not overwrite each other on the chip', () => {
  it('a second OPL3 instrument gets its own slot and the first keeps its sound', async () => {
    const bass = PRESETS.find((p) => p.name === 'OPL3 FM Bass')!;
    const snare = PRESETS.find((p) => p.name === 'OPL3 Snare')!;
    expect(furnaceSlotOf({ id: 1 })).not.toBe(furnaceSlotOf({ id: 4 }));
    expect(furnaceSlotOf({ id: 1 })).not.toBe(0);
    expect(furnaceSlotOf({ id: 1, furnace: { furnaceIndex: 7 } })).toBe(7);

    const uploads: Array<{ slot: number; data: Uint8Array }> = [];
    const a = synthFor('FurnaceOPL', 1, uploads);
    const b = synthFor('FurnaceOPL', 4, uploads);
    await a.s.uploadInstrumentFromConfig(afterPick(bass), bass.name);
    await b.s.uploadInstrumentFromConfig(afterPick(snare), snare.name);
    const alone = await playOnFreshChip(a.pt, uploads[0].slot, [uploads[0]]);
    const both = await playOnFreshChip(a.pt, uploads[0].slot, uploads);
    expect(uploads[0].slot).not.toBe(uploads[1].slot);
    expect(Math.abs(both.rmsDb - alone.rmsDb)).toBeLessThan(0.5);
  }, 30000);
});

describe('the live preset-change path uses the synth upload', () => {
  it('updateFurnaceInstrument hands the config to uploadInstrumentFromConfig (slot, chip shape, channel re-select)', () => {
    const calls: Array<[Record<string, unknown>, string]> = [];
    const synth = { uploadInstrumentFromConfig: (c: Record<string, unknown>, n: string) => { calls.push([c, n]); return Promise.resolve(); } };
    const ctx = { instruments: new Map([[1, synth]]), instrumentIdFromKey: (k: number) => k, invalidateInstrument() {} };
    const furnace = afterPick(PRESETS.find((p) => p.name === 'OPL3 FM Bass')!);
    updateFurnaceInstrument(ctx as never, 1, { id: 1, name: 'OPL3 FM Bass', synthType: 'FurnaceOPL', furnace } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(furnace);
  });
});

describe('fitFmToChip', () => {
  it('keeps modulator and carrier of an OPL-layout patch (the carrier was a disabled operator)', () => {
    const p = PRESETS.find((x) => x.name === 'OPL3 Organ')!;
    const fit = fitFmToChip(afterPick(p) as never, 2);
    expect(fit.ops).toBe(2);
    expect(fit.operators.map((o) => o.enabled)).toEqual([true, true]);
  });
  it('still cuts an OPN-shaped patch to a modulator and a full-level carrier', () => {
    const opn = { ...getDefaultFurnaceConfig('FurnaceOPN')! };
    const fit = fitFmToChip(opn, 2);
    expect(fit.operators).toHaveLength(2);
    expect(fit.operators[1].tl).toBe(0);
  });
});
