import { describe, it, expect } from 'vitest';
import { isTimeBasedLaneMode } from '../laneMode';
import type { EditorMode } from '@/types/tracker';
import type { DubLane, DubEvent } from '@/types/dub';

describe('isTimeBasedLaneMode', () => {
  it('returns true for raw SID (classic + c64SidFileData present)', () => {
    expect(isTimeBasedLaneMode('classic', true)).toBe(true);
  });

  it('returns true for SC68', () => {
    expect(isTimeBasedLaneMode('sc68', false)).toBe(true);
  });

  it('returns false for classic without SID data (MOD/XM/IT)', () => {
    expect(isTimeBasedLaneMode('classic', false)).toBe(false);
  });

  it.each<EditorMode>(['cheesecutter', 'sidfactory2', 'goattracker'])(
    'returns false for editable SID variant (%s) even though it emits SID audio',
    (mode) => {
      expect(isTimeBasedLaneMode(mode, false)).toBe(false);
    },
  );

  it.each<EditorMode>(['furnace', 'hively', 'klystrack', 'jamcracker', 'musicline', 'tfmx'])(
    'returns false for editable format (%s)',
    (mode) => {
      expect(isTimeBasedLaneMode(mode, false)).toBe(false);
    },
  );
});

describe('DubLane JSON roundtrip for time-mode', () => {
  it('preserves kind, timeSec, durationSec, and lane durationSec through JSON.stringify', () => {
    const original: DubLane = {
      enabled: true,
      events: [
        {
          id: 'e1',
          row: 0,              // row kept for back-compat but ignored in time mode
          timeSec: 1.25,
          durationSec: 0.8,
          moveId: 'dub.echo',
          channelId: 0,
          params: {},
        } as DubEvent,
        {
          id: 'e2',
          row: 0,
          timeSec: 4.5,
          moveId: 'dub.mute',
          channelId: 1,
          params: { fc: 800 },
        } as DubEvent,
      ],
      kind: 'time',
      durationSec: 90,
    };

    const roundTripped = JSON.parse(JSON.stringify(original)) as DubLane;

    expect(roundTripped.kind).toBe('time');
    expect(roundTripped.durationSec).toBe(90);
    expect(roundTripped.events).toHaveLength(2);
    expect(roundTripped.events[0].timeSec).toBe(1.25);
    expect(roundTripped.events[0].durationSec).toBe(0.8);
    expect(roundTripped.events[1].timeSec).toBe(4.5);
    expect(roundTripped.events[1].params).toEqual({ fc: 800 });
  });

  it('row-mode lanes without kind field stay row-mode after roundtrip', () => {
    const original: DubLane = {
      enabled: true,
      events: [
        { id: 'e1', row: 4, moveId: 'dub.echo', channelId: 0, params: {} } as DubEvent,
      ],
    };
    const roundTripped = JSON.parse(JSON.stringify(original)) as DubLane;
    expect(roundTripped.kind).toBeUndefined();
    expect(roundTripped.events[0].row).toBe(4);
    expect(roundTripped.events[0].timeSec).toBeUndefined();
  });
});
