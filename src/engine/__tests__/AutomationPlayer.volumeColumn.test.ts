/**
 * The volume column never reaches an instrument's persistent volume.
 *
 * The rig song (TB303 / TR808 / DX7) carried an XM volume byte of 0x10
 * ("set volume 0") on every row. AutomationPlayer read that column and
 * called `instrument.set('volume', 0)`: DX7 wrote 0 into the firmware
 * volume, DB303 called setVolume(0), the TR808 Tone instrument went to
 * -40 dB. None of these are restored on stop, so the song made one thud,
 * went silent, and stayed silent on the next play.
 *
 * The volume column is a per-channel, per-row level. The replayer channel
 * path (SynthEffectProcessor baseVolume -> velocity / channel gain) owns
 * it. AutomationPlayer must not forward it to any instrument, at any
 * level, while the other hex columns keep driving instrument parameters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/midi/performance/parameterRouter', () => ({
  routeParameterToEngine: vi.fn(),
  DUB_MOVE_KINDS: {} as Record<string, 'trigger' | 'hold'>,
}));

// The pre-fix code read the editor mode from the format store to decode the
// volume byte. Stub the store accessor so that path resolves without loading
// the store graph; with the fix in place this module is never imported.
vi.mock('@/stores/storeAccess', () => ({
  getFormatStoreRefOrNull: () => null,
}));

vi.mock('@/engine/ManualOverrideManager', () => ({
  getManualOverrideManager: () => ({
    isOverridden: () => false,
  }),
}));

// One DX7-like instrument on channel 2 as instrument 3, the rig's layout.
// `isDevilboxSynth` needs an `output` with connect/disconnect and a numeric
// `numberOfOutputs`; `set` is the sink every column write lands in.
const INSTRUMENT_ID = 3;
const CHANNEL = 2;
const setSpy = vi.fn();
const instruments = new Map<number, unknown>();
instruments.set((INSTRUMENT_ID << 16) | CHANNEL, {
  output: { connect() {}, disconnect() {}, numberOfOutputs: 1 },
  set: setSpy,
});

const setChannelVolume = vi.fn();
vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({
    instruments,
    getInstrumentSynthType: () => 'DX7Synth',
    setChannelVolume,
    setChannelPan: vi.fn(),
    setChannelMute: vi.fn(),
    setMasterVolume: vi.fn(),
  }),
}));

vi.mock('@/engine/ChannelFilterManager', () => ({
  getChannelFilterManager: () => ({
    setPosition: vi.fn(),
    setResonance: vi.fn(),
  }),
}));

import { AutomationPlayer, TRACKER_COLUMN_PARAMS } from '../AutomationPlayer';
import type { Pattern, TrackerCell } from '@/types/tracker';

const EMPTY_CELL = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

function mkPattern(cellOnRow0: Partial<TrackerCell>): Pattern {
  const blank = () => ({ ...EMPTY_CELL });
  const channel = (id: string, first: Partial<TrackerCell>) => ({
    id,
    name: id,
    instrumentId: null,
    rows: [{ ...EMPTY_CELL, ...first }, blank(), blank(), blank()],
  });
  return {
    id: 'rig',
    name: 'Rig',
    length: 4,
    channels: [channel('ch0', {}), channel('ch1', {}), channel('ch2', cellOnRow0)],
    dubLane: { enabled: false, events: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function playRow0(cell: Partial<TrackerCell>): void {
  const player = new AutomationPlayer();
  player.setPattern(mkPattern(cell));
  player.setAutomationData({});
  player.processPatternRow(0);
}

const volumeWrites = () => setSpy.mock.calls.filter(([param]) => param === 'volume');

describe('the volume column never reaches an instrument\'s persistent volume', () => {
  beforeEach(() => {
    setSpy.mockClear();
    setChannelVolume.mockClear();
  });

  it('a note-less rig row with instrument 03 and XM volume 0x10 ("set volume 0") writes no volume', () => {
    playRow0({ note: 0, instrument: INSTRUMENT_ID, volume: 0x10 });
    expect(volumeWrites()).toEqual([]);
    expect(setChannelVolume).not.toHaveBeenCalled();
  });

  it('a non-zero volume byte writes no instrument volume either: the level is the channel\'s, not the instrument\'s', () => {
    playRow0({ note: 49, instrument: INSTRUMENT_ID, volume: 0x30 });
    expect(volumeWrites()).toEqual([]);
  });

  it('the other hex columns still drive the instrument (sentinel: cutoff 0x80 arrives as ~0.5)', () => {
    playRow0({ note: 49, instrument: INSTRUMENT_ID, volume: 0x10, cutoff: 0x80 });
    expect(setSpy).toHaveBeenCalledWith('cutoff', 0x80 / 0xff);
    expect(volumeWrites()).toEqual([]);
  });

  it('the column list itself excludes volume, so processRow and processPatternRow cannot disagree', () => {
    expect(TRACKER_COLUMN_PARAMS).not.toContain('volume');
    expect(TRACKER_COLUMN_PARAMS).toEqual(['cutoff', 'resonance', 'envMod', 'pan']);
  });
});
