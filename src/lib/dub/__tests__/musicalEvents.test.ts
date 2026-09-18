import { describe, it, expect } from 'vitest';
import {
  rowsForWindow,
  eventsInRowWindow,
  eventsInWindow,
  nextEvent,
  rowsUntilNextEvent,
  trackerEventSources,
  type ChannelEventSource,
} from '../musicalEvents';

/** Onsets on beats 1-4 of a 16-row bar, plus one offbeat. */
const SOURCES: ChannelEventSource[] = [
  { channel: 0, onsets: [{ row: 0 }, { row: 4 }, { row: 8 }, { row: 12 }] },
  { channel: 1, onsets: [{ row: 2, strength: 0.5 }, { row: 18 }] },
];

describe('look-ahead windows come from the clock, not constants', () => {
  it('names map to rows at speed 6', () => {
    expect(rowsForWindow('beat', 6)).toBe(4);
    expect(rowsForWindow('bar', 6)).toBe(16);
    expect(rowsForWindow('phrase', 6)).toBe(256);
    expect(rowsForWindow('1/4', 6)).toBe(4);
    expect(rowsForWindow('1/8', 6)).toBe(2);
    expect(rowsForWindow('1/16', 6)).toBe(1);
  });

  it('windows scale with song speed', () => {
    // Speed 3 = 8 rows/beat. A "beat" of look-ahead must be 8 rows, not 4.
    expect(rowsForWindow('beat', 3)).toBe(8);
    expect(rowsForWindow('bar', 3)).toBe(32);
    expect(rowsForWindow('1/16', 3)).toBe(2);
  });

  it('a named note value means the same musical thing across metres', () => {
    // In 6/8 the beat IS an eighth, so '1/8' and 'beat' coincide there while
    // they differ in 4/4 — that is the point of resolving against beat unit.
    const sixEight = { meter: { beatsPerBar: 6, beatUnit: 8 }, phraseBars: 16 };
    expect(rowsForWindow('1/8', 6, sixEight)).toBe(rowsForWindow('beat', 6, sixEight));
    expect(rowsForWindow('1/8', 6)).not.toBe(rowsForWindow('beat', 6));
  });

  it('a shorter phrase setting shortens the phrase window', () => {
    expect(rowsForWindow('phrase', 6, { phraseBars: 8 })).toBe(128);
  });
});

describe('eventsInRowWindow — the half-open contract', () => {
  it('returns upcoming events nearest first', () => {
    const got = eventsInRowWindow(SOURCES, 0, 16);
    expect(got.map(e => e.row)).toEqual([2, 4, 8, 12]);
  });

  it('excludes an event exactly at fromRow — that is NOW, not upcoming', () => {
    // Returning it would make a PREPARE step fire on something already sounding.
    expect(eventsInRowWindow(SOURCES, 0, 16).some(e => e.row === 0)).toBe(false);
  });

  it('excludes the far edge so adjacent windows tile without double-reporting', () => {
    const first = eventsInRowWindow(SOURCES, 0, 4).map(e => e.row);
    const second = eventsInRowWindow(SOURCES, 4, 4).map(e => e.row);
    expect(first).toEqual([2]);
    expect(second).toEqual([]); // row 4 belonged to neither: it is NOW for the second
    expect(first.filter(r => second.includes(r))).toEqual([]);
  });

  it('merges channels and orders ties by channel', () => {
    const tied: ChannelEventSource[] = [
      { channel: 3, onsets: [{ row: 5 }] },
      { channel: 1, onsets: [{ row: 5 }] },
    ];
    expect(eventsInRowWindow(tied, 0, 8).map(e => e.channel)).toEqual([1, 3]);
  });

  it('honours a filter and a limit', () => {
    const onlyCh0 = eventsInRowWindow(SOURCES, 0, 16, { filter: e => e.channel === 0 });
    expect(onlyCh0.map(e => e.row)).toEqual([4, 8, 12]);
    expect(eventsInRowWindow(SOURCES, 0, 16, { limit: 2 }).map(e => e.row)).toEqual([2, 4]);
  });

  it('defaults strength to full and clamps nonsense', () => {
    const src: ChannelEventSource[] = [{ channel: 0, onsets: [{ row: 1 }, { row: 2, strength: 9 }] }];
    expect(eventsInRowWindow(src, 0, 8).map(e => e.strength)).toEqual([1, 1]);
  });

  it('returns nothing for a zero, negative or non-finite window', () => {
    for (const w of [0, -4, Number.NaN]) expect(eventsInRowWindow(SOURCES, 0, w)).toEqual([]);
    expect(eventsInRowWindow(SOURCES, Number.NaN, 16)).toEqual([]);
  });

  it('skips non-finite onset rows rather than sorting them into the result', () => {
    const src: ChannelEventSource[] = [{ channel: 0, onsets: [{ row: Number.NaN }, { row: 3 }] }];
    expect(eventsInRowWindow(src, 0, 8).map(e => e.row)).toEqual([3]);
  });
});

describe('eventsInWindow — named windows over the same data', () => {
  it('a beat of look-ahead at speed 6 sees only the next 4 rows', () => {
    expect(eventsInWindow(SOURCES, 0, 'beat', 6).map(e => e.row)).toEqual([2]);
  });

  it('the same call at speed 3 reaches further in rows', () => {
    expect(eventsInWindow(SOURCES, 0, 'beat', 3).map(e => e.row)).toEqual([2, 4]);
  });

  it('a bar of look-ahead crosses into the next pattern-relative rows', () => {
    expect(eventsInWindow(SOURCES, 12, 'bar', 6).map(e => e.row)).toEqual([18]);
  });
});

describe('nextEvent / rowsUntilNextEvent — what PREPARE schedules against', () => {
  it('finds the next event and the distance to it', () => {
    expect(nextEvent(SOURCES, 0, 16)?.row).toBe(2);
    expect(rowsUntilNextEvent(SOURCES, 0, 16)).toBe(2);
    expect(rowsUntilNextEvent(SOURCES, 5, 16)).toBe(3);
  });

  it('reports null rather than a far-away event when the window is empty', () => {
    expect(nextEvent(SOURCES, 12, 2)).toBeNull();
    expect(rowsUntilNextEvent(SOURCES, 12, 2)).toBeNull();
  });

  it('respects a filter when choosing the next event', () => {
    const next = nextEvent(SOURCES, 0, 16, { filter: e => e.channel === 0 });
    expect(next?.row).toBe(4);
  });
});

describe('trackerEventSources — pattern cells to semantic events', () => {
  const channels = [
    { rows: [{ note: 37 }, null, { note: 0 }, { note: 97 }, { note: 40, volume: 0x30 }] },
    { rows: [{ note: 0 }, { note: 0 }] },
  ];

  it('keeps real notes and drops empties, nulls and note-offs', () => {
    const [ch0] = trackerEventSources(channels);
    expect(ch0.channel).toBe(0);
    expect(ch0.onsets.map(o => o.row)).toEqual([0, 4]);
  });

  it('omits channels with no onsets rather than emitting empty sources', () => {
    expect(trackerEventSources(channels)).toHaveLength(1);
  });

  it('maps the XM volume column onto strength, defaulting to full', () => {
    const [ch0] = trackerEventSources(channels);
    expect(ch0.onsets[0].strength).toBe(1);        // no volume column
    expect(ch0.onsets[1].strength).toBeCloseTo(0.5, 5); // 0x30 = halfway
  });

  it('applies rowOffset so look-ahead does not reset at a pattern boundary', () => {
    const [ch0] = trackerEventSources(channels, { rowOffset: 64 });
    expect(ch0.onsets.map(o => o.row)).toEqual([64, 68]);
  });

  it('skips channels the caller excludes', () => {
    const src = trackerEventSources(channels, { skipChannels: new Set([0]) });
    expect(src).toEqual([]);
  });

  it('attaches the channel profile so downstream stays context-agnostic', () => {
    const profile = { channel: 0 } as never;
    const [ch0] = trackerEventSources(channels, { profiles: new Map([[0, profile]]) });
    expect(ch0.profile).toBe(profile);
    expect(eventsInRowWindow([ch0], -1, 8)[0].profile).toBe(profile);
  });
});

describe('statelessness — a seek cannot leave stale predictions', () => {
  it('a query depends only on its arguments', () => {
    // C3 requires seek to reset prediction state. Holding none is the
    // cheapest way to guarantee it: jumping backwards returns the same
    // answer as querying that row first.
    const forward = eventsInRowWindow(SOURCES, 0, 16);
    eventsInRowWindow(SOURCES, 100, 16); // "seek" far away
    expect(eventsInRowWindow(SOURCES, 0, 16)).toEqual(forward);
  });
});
