/**
 * The song reports the instruments it triggers, so the sample editor's
 * playhead moves and the instrument lists light up while a song plays.
 *
 * Owner request 2026-09-29: "when a song plays and i am in the instrument
 * editor i should see the playhead move if i am editing an instrument that
 * plays in the tracker". Only the keyboard reported attacks; song notes
 * never reached the tracker. Driven through the transport's row update,
 * the path every engine's play position takes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/audio-context', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDevilboxAudioContext: () => ({ currentTime: 1.5 }),
}));

import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { getInstrumentLastAttack, getInstrumentLastAttackRate, isInstrumentReleased, subscribeInstrumentAttacks, clearInstrumentAttack } from '../instrumentPlaybackTracker';
import '../songInstrumentTriggers';
import type { Pattern, TrackerCell } from '@typedefs/tracker';
import type { InstrumentConfig } from '@typedefs/instrument';

const EMPTY: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
const cell = (note: number, instrument = 0, effTyp = 0): TrackerCell => ({ ...EMPTY, note, instrument, effTyp });

function pattern(rows: Record<number, TrackerCell>): Pattern {
  return {
    id: 'p', name: 'p', length: 16,
    channels: [{ id: 'c0', name: '', muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, (_, r) => rows[r] ?? { ...EMPTY }) }],
  } as Pattern;
}

const MOD_SAMPLE = { id: 9, name: 'lead', synthType: 'Sampler', sample: { sampleRate: 8363, baseNote: 'C3' },
  metadata: { modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 } } } as unknown as InstrumentConfig;

function play(p: Pattern) {
  useTrackerStore.setState({ patterns: [p], currentPatternIndex: 0 } as never);
  useInstrumentStore.setState({ instruments: [MOD_SAMPLE] } as never);
  useTransportStore.setState({ isPlaying: true, currentRow: -1 } as never);
}
const row = (r: number) => useTransportStore.getState().setCurrentRow(r, 16);

describe('song instrument triggers', () => {
  beforeEach(() => clearInstrumentAttack(9));

  it('a note in the playing row reports its instrument at the speed it plays', () => {
    play(pattern({ 0: cell(37, 9) }));  // C-3 = period 214
    const heard: number[] = [];
    const off = subscribeInstrumentAttacks((id) => heard.push(id));
    row(0);
    off();
    expect(heard).toEqual([9]);
    expect(getInstrumentLastAttack(9)).toBe(1.5);
    expect(getInstrumentLastAttackRate(9)).toBeCloseTo(3546895 / 214 / 8363, 6);
  });

  it('rows skipped by the throttled display are still read', () => {
    play(pattern({ 0: cell(25, 9), 2: cell(25) }));
    row(0);
    clearInstrumentAttack(9);
    row(3);   // rows 1-3 in one update: row 2's note, no instrument, plays the channel's 9
    expect(getInstrumentLastAttack(9)).toBe(1.5);
  });

  it('a tone portamento is no attack; a note-off releases', () => {
    play(pattern({ 0: cell(25, 9), 1: cell(28, 0, 3), 2: cell(97) }));
    row(0);
    clearInstrumentAttack(9);
    row(1);
    expect(getInstrumentLastAttack(9)).toBeNull();
    row(0); row(1);   // back to a fresh attack, then the portamento
    row(2);
    expect(isInstrumentReleased(9)).toBe(true);
  });
});
