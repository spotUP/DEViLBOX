/**
 * A user-made song's effect columns and volume column must reach a Furnace chip instrument.
 * Before routeRowToChip, ToneEngine.applyFurnaceEffect had no caller: only Cxx on a note row
 * (through the note velocity) reached the chip. Sentinel: the dispatch calls that the real
 * FurnaceEffectRouter produces, recorded on a fake dispatch engine behind a real
 * FurnaceDispatchSynth, driven through the replayer's real row-processing entry points.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@engine/ToneEngine', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getToneEngine: () => holder.engine }));
vi.mock('@/engine/ToneEngine', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getToneEngine: () => holder.engine }));
vi.mock('../ToneEngine', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getToneEngine: () => holder.engine }));

vi.mock('tone', async (orig) => {
  const t = await orig<Record<string, unknown>>();
  return { ...t, Draw: { schedule: () => undefined } };
});

import { TrackerReplayer } from '../TrackerReplayer';
import { ToneEngine } from '../ToneEngine';
import { FurnaceDispatchSynth } from '../furnace-dispatch/FurnaceDispatchSynth';
import { FurnaceDispatchEngine } from '../furnace-dispatch/FurnaceDispatchEngine';
import { FurnaceEffectRouter } from '../furnace-dispatch/FurnaceEffectRouter';
import { FurnaceDispatchPlatform, DivCmd } from '../furnace-dispatch/FurnaceDispatchEngine';
import { chipChannelFor } from '../furnace-dispatch/chipChannel';
import { FurnaceTickEffects } from '../furnace-dispatch/FurnaceTickEffects';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resetStore } from '@/stores/__tests__/_harness';

const PT = FurnaceDispatchPlatform.YM2610;
const CHIP_CHANNELS = 13;
const INST_ID = 1;

interface Call { cmd: number; chan: number; val1: number; val2: number }

function fakeChip(calls: Call[]): FurnaceDispatchEngine {
  const e = Object.create(FurnaceDispatchEngine.prototype) as Record<string, unknown>;
  e.effectRouter = new FurnaceEffectRouter();
  e.dispatch = (cmd: number, chan: number, val1 = 0, val2 = 0) => { calls.push({ cmd, chan, val1, val2 }); };
  e.getChannelCount = () => CHIP_CHANNELS;
  e.chips = new Map(); // chipSpansOf iterates it; empty = single chip of the synth's platform
  return e as unknown as FurnaceDispatchEngine;
}

function build(furnaceNative = false) {
  const calls: Call[] = [];
  const synth = Object.create(FurnaceDispatchSynth.prototype) as Record<string, unknown>;
  synth.engine = fakeChip(calls);
  synth._isReady = true;
  synth._disposed = false;
  synth.platformType = PT;
  synth.currentChannel = 0;
  const tone = Object.create(ToneEngine.prototype) as { instruments: Map<number, unknown>; getInstrumentKey(i: number, c: number): number };
  tone.instruments = new Map([[(INST_ID << 16) | 0xFFFF, synth]]);
  // The note itself is not under test; only the effect calls on the chip are.
  (tone as unknown as Record<string, unknown>).triggerNote = () => undefined;
  holder.engine = tone;

  const config = { id: INST_ID, name: 'x', type: 'synth', synthType: 'FurnaceOPNB', furnace: {} };
  const r = Object.create(TrackerReplayer.prototype) as Record<string, unknown>;
  r.song = { songPositions: [0], furnaceNative: furnaceNative ? {} : undefined };
  r.coordinator = { songPos: 0, pattPos: 0, context: {}, stateRing: {} };
  r.instrumentMap = new Map([[INST_ID, config]]);
  r._replacedInstruments = new Set([INST_ID]);
  r.channels = [0, 1, 2].map(() => ({ instrument: config, volume: 64, gainNode: { gain: { setValueAtTime: () => undefined, cancelScheduledValues: () => undefined, linearRampToValueAtTime: () => undefined, value: 1 } } }));
  r.isChannelMuted = () => false;
  // Object.create skips the class field initialisers.
  r.furnaceTick = new FurnaceTickEffects();
  r.furnaceTickChannels = new Map<number, number>();
  r._bpm = 125;
  r.speed = 6;
  return { r, calls };
}

function setRow(channel: number, cell: Record<string, number>) {
  useTrackerStore.setState((s) => {
    const p = s.patterns[0];
    p.channels[channel].rows[0] = { ...p.channels[channel].rows[0], ...cell };
  });
}

/** Both ways a row reaches a synth; a song runs through exactly one of them. */
const entries: Array<[string, (r: Record<string, unknown>) => void]> = [
  ['processRowForSynths (TS scheduler)', (r) => (r as { processRowForSynths(t: number): void }).processRowForSynths(0)],
  ['fireHybridNotesForRow (engine-driven)', (r) => (r as { fireHybridNotesForRow(t: number): void }).fireHybridNotesForRow(0)],
];

describe.each(entries)('cell effects reach the Furnace chip via %s', (_name, run) => {
  beforeEach(() => { resetStore(useTrackerStore); });

  const chipChan = (songChannel: number) => chipChannelFor(songChannel, CHIP_CHANNELS, undefined);

  it('(a) an effect on a note row', () => {
    const { r, calls } = build();
    setRow(1, { note: 49, instrument: INST_ID, effTyp: 0x10, eff: 0x05 });
    run(r);
    expect(calls.some((c) => c.chan === chipChan(1) && c.cmd !== DivCmd.NOTE_ON && c.cmd !== DivCmd.INSTRUMENT)).toBe(true);
  });

  it('(b) an effect on a row without a note', () => {
    const { r, calls } = build();
    setRow(2, { note: 0, instrument: 0, effTyp: 0x10, eff: 0x05 });
    run(r);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.chan === chipChan(2))).toBe(true);
  });

  it('(c) a volume-column value on a row without a note is a volume command', () => {
    const { r, calls } = build();
    setRow(0, { note: 0, instrument: 0, volume: 0x50 });
    run(r);
    const vol = calls.filter((c) => c.cmd === DivCmd.VOLUME);
    expect(vol.length).toBeGreaterThan(0);
    expect(vol.every((c) => c.chan === chipChan(0))).toBe(true);
  });

  it('does not route tracker-owned effects (Cxx/Bxx/Dxx/Fxx) as chip effects', () => {
    const { r, calls } = build();
    setRow(0, { note: 0, instrument: 0, effTyp: 0x0F, eff: 0x03, effTyp2: 0x0B, eff2: 0x00, effTyp3: 0x0D, eff3: 0x00 });
    run(r);
    expect(calls).toEqual([]);
  });

  it('an imported .fur song (furnaceNative) is not routed here', () => {
    const { r, calls } = build(true);
    setRow(2, { note: 0, instrument: 0, effTyp: 0x10, eff: 0x05, volume: 0x50 });
    run(r);
    expect(calls).toEqual([]);
  });
});

/**
 * Symptom: "arps are nowhere to be heard" in a user-made Neo Geo song. Such a song runs engine-driven
 * (one callback per row, _suppressNotes true), where the TS tick handler does not step Furnace cell
 * effects, so 0xy sent its base note once and never cycled.
 */
describe('arpeggio 0xy steps every tick of an engine-driven row', () => {
  beforeEach(() => { resetStore(useTrackerStore); });

  function buildTicking() {
    const built = build();
    const times: number[] = [];
    const tone = holder.engine as { applyFurnaceChipCommand: (...a: unknown[]) => boolean };
    const real = ToneEngine.prototype.applyFurnaceChipCommand;
    tone.applyFurnaceChipCommand = function (this: unknown, ...a: unknown[]) {
      if (a[3] === DivCmd.LEGATO) times.push(a[6] as number);
      return (real as (...x: unknown[]) => boolean).apply(this, a);
    };
    built.r._suppressNotes = true;
    return { ...built, times };
  }

  it('cycles base, +x, +y across the six ticks of the row, 20 ms apart', () => {
    const { r, calls, times } = buildTicking();
    setRow(1, { note: 49, instrument: INST_ID, effTyp: 0, eff: 0x47 });
    (r as { fireHybridNotesForRow(t: number): void }).fireHybridNotesForRow(10);
    const chan = chipChannelFor(1, CHIP_CHANNELS, undefined);
    const legato = calls.filter((c) => c.cmd === DivCmd.LEGATO && c.chan === chan).map((c) => c.val1);
    const base = legato[0];
    expect(legato).toEqual([base, base + 4, base + 7, base, base + 4, base + 7]);
    expect(times.map((t) => Math.round((t - 10) * 1000))).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('a row without 0xy sends no per-tick note change', () => {
    const { r, calls } = buildTicking();
    setRow(1, { note: 49, instrument: INST_ID });
    (r as { fireHybridNotesForRow(t: number): void }).fireHybridNotesForRow(10);
    expect(calls.filter((c) => c.cmd === DivCmd.LEGATO)).toEqual([]);
  });
});

/**
 * Symptom: vibrato, slides, portamento, volume slide and tremolo "do nothing" in a tracker-made chip
 * song. The router sent one command (or only an annotation a chip ignores) at the row start; Furnace
 * sends a pitch or volume command on every tick (playback.cpp nextTick).
 */
describe('Furnace cell effects step on every tick of an engine-driven row', () => {
  beforeEach(() => { resetStore(useTrackerStore); });

  const chan = chipChannelFor(1, CHIP_CHANNELS, undefined);
  const VOL_MAX = 127; // YM2610 FM channel volume range

  function play(cell: Record<string, number>, rows: Array<Record<string, number>> = []) {
    const { r, calls } = build();
    r._suppressNotes = true;
    setRow(1, { instrument: INST_ID, ...cell });
    const fire = r.fireHybridNotesForRow as (t: number) => void;
    for (const extra of rows) {
      fire.call(r, 10);
      setRow(1, extra);
    }
    calls.length = 0;
    fire.call(r, 10);
    return calls.filter((c) => c.chan === chan);
  }
  const ofCmd = (calls: Call[], cmd: number) => calls.filter((c) => c.cmd === cmd);

  it('a pitch slide up (1xx) keeps sliding on all six ticks instead of one jump', () => {
    const calls = play({ note: 49, effTyp: 1, eff: 0x04 });
    const slide = ofCmd(calls, DivCmd.NOTE_PORTA);
    expect(slide.length).toBe(6);
    expect(slide.every((c) => c.val1 === 16 && c.val2 === 255)).toBe(true);
  });

  it('a pitch slide down (2xx) keeps sliding on all six ticks instead of one jump', () => {
    const calls = play({ note: 49, effTyp: 2, eff: 0x04 });
    const slide = ofCmd(calls, DivCmd.NOTE_PORTA);
    expect(slide.length).toBe(6);
    expect(slide.every((c) => c.val1 === 16 && c.val2 === -60)).toBe(true);
  });

  it('a tone portamento (3xx) slides toward the note on every tick and does not retrigger it', () => {
    const calls = play({ note: 49, effTyp: 3, eff: 0x02 }, [{ note: 53, effTyp: 3, eff: 0x02 }]);
    const slide = ofCmd(calls, DivCmd.NOTE_PORTA);
    expect(slide.length).toBe(6);
    expect(slide.every((c) => c.val1 === 8)).toBe(true);
    expect(ofCmd(calls, DivCmd.NOTE_ON).length).toBe(0);
  });

  it('vibrato (4xy) moves the pitch on every tick along the sine table', () => {
    const calls = play({ note: 49, effTyp: 4, eff: 0x48 });
    const pitch = ofCmd(calls, DivCmd.PITCH).map((c) => c.val1);
    // 1 immediate + 6 ticks; depth 8, rate 4: pos 4,8,... table value * 8 * 15 >> 4 / 15
    expect(pitch.length).toBe(7);
    expect(pitch[0]).toBe(0);
    expect(pitch.slice(1).some((v) => v !== 0)).toBe(true);
    expect(new Set(pitch).size).toBeGreaterThan(3);
  });

  it('a volume slide (Axy) fades the volume on every tick', () => {
    const calls = play({ note: 49, volume: 0x50, effTyp: 0x0A, eff: 0x04 });
    const vol = ofCmd(calls, DivCmd.VOLUME).map((c) => c.val1);
    const tail = vol.slice(-6);
    expect(tail.length).toBe(6);
    for (let i = 1; i < tail.length; i++) expect(tail[i]).toBeLessThanOrEqual(tail[i - 1]);
    expect(tail[5]).toBeLessThan(tail[0]);
    expect(tail[0]).toBeLessThan(VOL_MAX);
  });

  it('vibrato with volume slide (5xy) moves pitch and volume on every tick', () => {
    const calls = play({ note: 49, effTyp: 4, eff: 0x48 }, [{ note: 0, instrument: 0, effTyp: 5, eff: 0x02 }]);
    const lastRow = calls.slice(-30);
    expect(ofCmd(lastRow, DivCmd.PITCH).length).toBeGreaterThanOrEqual(6);
    expect(ofCmd(lastRow, DivCmd.VOLUME).length).toBeGreaterThanOrEqual(6);
  });

  it('portamento with volume slide (6xy) slides the pitch and fades the volume on every tick', () => {
    const calls = play({ note: 49, effTyp: 3, eff: 0x02 }, [{ note: 53, effTyp: 6, eff: 0x02 }]);
    const lastRow = calls.slice(-30);
    expect(ofCmd(lastRow, DivCmd.NOTE_PORTA).length).toBeGreaterThanOrEqual(6);
    expect(ofCmd(lastRow, DivCmd.VOLUME).length).toBeGreaterThanOrEqual(6);
  });

  it('tremolo (7xy) moves the volume on every tick', () => {
    const calls = play({ note: 49, effTyp: 7, eff: 0x48 });
    const vol = ofCmd(calls, DivCmd.VOLUME).map((c) => c.val1);
    expect(vol.length).toBeGreaterThanOrEqual(6);
    expect(new Set(vol.slice(-6)).size).toBeGreaterThan(2);
  });
});
