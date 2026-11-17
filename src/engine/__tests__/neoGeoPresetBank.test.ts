/**
 * Neo Geo preset bank: every YM2610 / YM2610B preset is distinct, within chip ranges, listed
 * by the selector the preset dropdown and the New Song Wizard use, and audible on its channel.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { startWorklet, stereoOutputs } from './workletHarness';
import { FACTORY_PRESETS } from '../../constants/factoryPresets';
import { getInstrumentPresetsForSystem } from '../../constants/uadeInstrumentPresets';
import { NEO_GEO_FM_VOICES, NEO_GEO_SSG_VOICES } from '../../constants/neoGeoPresetBank';
import { FurnaceDispatchSynth } from '../furnace-dispatch/FurnaceDispatchSynth';
import { SYNTH_TO_DISPATCH } from '../furnace-dispatch/synthPlatforms';
import { furnaceSlotOf } from '../furnace-dispatch/fmInstrument';
import { fmCarrierStorageIndices } from '../../lib/furnace/fmOperatorModel';
import { getDefaultFurnaceConfig } from '../factories/FurnaceChipSynthFactory';
import { voiceKindOfInstrument } from '../furnace-dispatch/chipVoiceKinds';
import { resolveInsType, DIV_INS_AY, DIV_INS_FM } from '../../lib/export/FurnaceInstrumentEncoder';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { FurnaceConfig } from '@typedefs/instrument/furnace';

type Chip = 'FurnaceOPNB' | 'FurnaceOPNBB';
const CHIPS: Array<{ synthType: Chip; label: string }> = [
  { synthType: 'FurnaceOPNB', label: 'YM2610' },
  { synthType: 'FurnaceOPNBB', label: 'YM2610B' },
];
/** The list the user sees: PresetDropdown and the wizard both filter FACTORY_PRESETS by synthType. */
interface BankPreset {
  name: string;
  furnace: {
    algorithm: number; feedback: number; previewChannel?: number;
    operators: Array<{ tl: number; ar: number; dr: number; d2r: number; sl: number; rr: number; mult: number; dt: number }>;
    macros: Array<{ code?: number; data: number[] }>;
  };
}
const listFor = (synthType: Chip): BankPreset[] =>
  FACTORY_PRESETS.filter((p) => p.synthType === synthType && p.name && / (FM|SSG) /.test(p.name)) as unknown as BankPreset[];
const isSsg = (name: string) => / SSG /.test(name);

describe.each(CHIPS)('$label preset list', ({ synthType, label }) => {
  const list = listFor(synthType);
  const fmList = list.filter((p) => !isSsg(p.name));
  const ssgList = list.filter((p) => isSsg(p.name));

  it('lists every bank voice exactly once (at least 40 FM and 10 SSG)', () => {
    expect(NEO_GEO_FM_VOICES.length).toBeGreaterThanOrEqual(40);
    expect(NEO_GEO_SSG_VOICES.length).toBeGreaterThanOrEqual(10);
    expect(fmList).toHaveLength(NEO_GEO_FM_VOICES.length);
    expect(ssgList).toHaveLength(NEO_GEO_SSG_VOICES.length);
    expect(list.every((p) => p.name.startsWith(`${label} `))).toBe(true);
    expect(new Set(list.map((p) => p.name)).size).toBe(list.length);
    expect(list.some((p) => p.name === `${label} FM Lead`)).toBe(true);
  });

  it('marks SSG presets as SSG voices and FM presets as FM voices (pattern editor and Furnace export)', () => {
    for (const p of list) {
      const inst = p as unknown as Pick<InstrumentConfig, 'synthType' | 'furnace'>;
      const want = isSsg(p.name) ? 'ssg' : 'fm';
      expect(voiceKindOfInstrument(inst)?.kind.id, p.name).toBe(want);
      expect(resolveInsType(inst.furnace as FurnaceConfig), p.name).toBe(isSsg(p.name) ? DIV_INS_AY : DIV_INS_FM);
    }
  });

  it('keeps every FM voice and SSG voice pairwise distinct and within chip ranges', () => {
    const seen = new Set<string>();
    for (const p of fmList) {
      const f = p.furnace;
      expect(f.algorithm).toBeGreaterThanOrEqual(0); expect(f.algorithm).toBeLessThanOrEqual(7);
      expect(f.feedback).toBeGreaterThanOrEqual(0); expect(f.feedback).toBeLessThanOrEqual(7);
      expect(f.operators).toHaveLength(4);
      for (const o of f.operators) {
        expect(o.tl).toBeGreaterThanOrEqual(0); expect(o.tl).toBeLessThanOrEqual(127);
        for (const k of ['ar', 'dr', 'd2r'] as const) { expect(o[k]).toBeGreaterThanOrEqual(0); expect(o[k]).toBeLessThanOrEqual(31); }
        for (const k of ['sl', 'rr', 'mult'] as const) { expect(o[k]).toBeGreaterThanOrEqual(0); expect(o[k]).toBeLessThanOrEqual(15); }
        expect(o.dt).toBeGreaterThanOrEqual(-3); expect(o.dt).toBeLessThanOrEqual(3);
      }
      // a carrier that is silent (tl 127 or ar 0) would make the voice mute
      const cars = fmCarrierStorageIndices(f.algorithm, 4).map((i: number) => f.operators[i]);
      expect(cars.some((o) => o.tl <= 60 && o.ar > 0), p.name).toBe(true);
      // storage order (operators 1, 3, 2, 4): the carriers sit at the algorithm's storage carrier indices, so they are the loudest operators
      const carrierIndices = fmCarrierStorageIndices(f.algorithm, 4);
      const mods = f.operators.filter((_, i) => !carrierIndices.includes(i));
      if (mods.length > 0) {
        const mean = (xs: Array<{ tl: number }>) => xs.reduce((n, o) => n + o.tl, 0) / xs.length;
        expect(mean(cars), `${p.name}: carriers louder than modulators`).toBeLessThanOrEqual(mean(mods));
      }
      const key = JSON.stringify([f.algorithm, f.feedback, f.operators]);
      expect(seen.has(key), `duplicate FM data: ${p.name}`).toBe(false);
      seen.add(key);
    }
    for (const p of ssgList) {
      const f = p.furnace;
      expect(f.previewChannel).toBe(synthType === 'FurnaceOPNB' ? 4 : 6);
      for (const m of f.macros) {
        expect(m.data.length).toBeGreaterThan(0);
        if (m.code === 0) m.data.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(15); });
        if (m.code === 2) m.data.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(31); });
      }
      const key = JSON.stringify(f.macros);
      expect(seen.has(key), `duplicate SSG data: ${p.name}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('YM2610 and YM2610B share one table', () => {
  it('carries identical voice data under both chips', () => {
    const strip = (t: Chip) => listFor(t).map((p) => JSON.stringify([p.name.replace(/^YM2610B? /, ''), p.furnace.algorithm, p.furnace.operators, p.furnace.macros]));
    expect(strip('FurnaceOPNBB')).toEqual(strip('FurnaceOPNB'));
  });
});

describe('New Song Wizard starters on Neo Geo', () => {
  it.each(['ym2610_full', 'ym2610b'])('%s gives four distinct, role-named voices', (id) => {
    const starters = getInstrumentPresetsForSystem(id);
    expect(starters.map((s) => s.name)).toEqual(['Lead', 'Bass', 'Chord', 'Arp']);
    const keys = starters.map((s) => JSON.stringify([s.furnace?.algorithm, s.furnace?.operators]));
    expect(new Set(keys).size).toBe(4);
  });
});

describe('Neo Geo presets are audible on their channel', () => {
  let w: Awaited<ReturnType<typeof startWorklet>>;
  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    w = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  }, 60000);

  async function levelDb(synthType: Chip, furnace: Record<string, unknown>, chan: number): Promise<number> {
    const uploads: Array<{ slot: number; data: Uint8Array }> = [];
    const pt = SYNTH_TO_DISPATCH[synthType];
    const s = Object.create(FurnaceDispatchSynth.prototype) as any;
    Object.assign(s, {
      platformType: pt, furnaceInstrumentIndex: furnaceSlotOf({ id: 1 }), currentChannel: 0, _isReady: true, _isReadyPromise: Promise.resolve(),
      engine: { uploadFurnaceInstrument: (slot: number, data: Uint8Array) => uploads.push({ slot, data }), getChannelCount: () => 14, setInstrument() {}, loadIns2() {} },
    });
    await s.uploadInstrumentFromConfig({ ...getDefaultFurnaceConfig(synthType), ...furnace }, 'x');
    await w.send({ type: 'destroyChip', platformType: pt });
    await w.send({ type: 'createChip', platformType: pt, sampleRate: 48000 });
    await w.send({ type: 'setInstrumentFull', insIndex: uploads[0].slot, insData: uploads[0].data, platformType: pt });
    await w.send({ type: 'dispatch', platformType: pt, cmd: 4, chan, val1: uploads[0].slot, val2: 1 });
    await w.send({ type: 'dispatch', platformType: pt, cmd: 5, chan, val1: 15, val2: 0 });
    await w.send({ type: 'dispatch', platformType: pt, cmd: 0, chan, val1: 48, val2: 0 });
    const outs = stereoOutputs(37); let ss = 0;
    for (let b = 0; b < 200; b++) { (w.proc as any).process([], outs); for (const c of [outs[0][0], outs[0][1]]) for (const v of c) ss += v * v; }
    return 20 * Math.log10(Math.sqrt(ss / (200 * 256)) + 1e-9);
  }

  const FM_SAMPLE = ['Lead', 'Bass Slap', 'Pad Warm', 'Organ Church', 'Perc Kick', 'FX Laser', 'Perc Hat'];
  it.each(CHIPS)('$label: SSG presets sound on the SSG channel, sampled FM voices on FM channel 0', async ({ synthType, label }) => {
    for (const p of listFor(synthType).filter((x) => isSsg(x.name))) {
      expect(await levelDb(synthType, p.furnace as never, p.furnace.previewChannel!), p.name).toBeGreaterThan(-60);
    }
    for (const n of FM_SAMPLE) {
      const p = listFor(synthType).find((x) => x.name === `${label} FM ${n}`)!;
      expect(await levelDb(synthType, p.furnace as never, 0), p.name).toBeGreaterThan(-60);
    }
  }, 240000);
});
