/**
 * Gate M1's remaining item: replay reproduces the performance.
 *
 * The lanes are what plays; the journal only explains them. That is what keeps
 * a stale journal from corrupting a replay — and it is also how the two can
 * drift apart without anyone noticing. This drives a REAL lane replay through
 * `DubLanePlayer` and compares what came out against what the journal claims,
 * so drift is something the program can say out loud.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const fired: Array<{ moveId: string; channelId?: number; source: string }> = [];
vi.mock('@/engine/dub/DubRouter', () => ({
  fire: (moveId: string, channelId: number | undefined, _p: unknown, source: string) => {
    fired.push({ moveId, channelId, source });
    return null;
  },
  // DubLanePlayer subscribes at module load to suppress the lane echo of a
  // live fire; the mock must offer it or the import throws.
  subscribeDubRouter: () => () => {},
}));
vi.mock('../../../engine/dub/DubRouter', () => ({
  fire: (moveId: string, channelId: number | undefined, _p: unknown, source: string) => {
    fired.push({ moveId, channelId, source });
    return null;
  },
  // DubLanePlayer subscribes at module load to suppress the lane echo of a
  // live fire; the mock must offer it or the import throws.
  subscribeDubRouter: () => () => {},
}));

import { DubLanePlayer } from '@/engine/dub/DubLanePlayer';
import {
  compareJournalToReplay,
  formatReplayReport,
  firesFromLane,
  firesFromCurves,
  firesForPattern,
  DEFAULT_ROW_TOLERANCE,
  type ReplayFire,
} from '../journalReplay';
import { PerformanceJournalRecorder } from '../performanceJournal';
import type { DubLane, DubEvent } from '@/types/dub';
import type { JournalEntry } from '../performanceJournal';

function entry(over: Partial<JournalEntry>): JournalEntry {
  return {
    invocationId: `inv-${over.row ?? 0}`,
    moveId: 'echoThrow',
    row: 0,
    timeSec: 0,
    origin: 'ai',
    ...over,
  };
}

function event(over: Partial<DubEvent>): DubEvent {
  return {
    id: `e-${over.row ?? 0}-${over.moveId ?? 'echoThrow'}`,
    moveId: 'echoThrow',
    row: 0,
    params: {},
    ...over,
  };
}

function journalOf(entries: JournalEntry[]) {
  const r = new PerformanceJournalRecorder();
  for (const e of entries) r.record(e);
  return r.snapshot();
}

/**
 * Replay a lane the way the tracker does — tick by tick, in order — and
 * report what fired and where. This is the part that has to be real: a
 * comparison against a hand-written list of fires would prove nothing about
 * the player.
 */
function replay(lane: DubLane, lastRow: number): ReplayFire[] {
  fired.length = 0;
  const player = new DubLanePlayer();
  player.setLane(lane);
  const out: ReplayFire[] = [];
  let seen = 0;
  for (let row = 0; row <= lastRow; row++) {
    player.onTick(row);
    for (; seen < fired.length; seen++) {
      out.push({ moveId: fired[seen].moveId, channelId: fired[seen].channelId, row });
    }
  }
  return out;
}

beforeEach(() => { fired.length = 0; });

describe('a performance saved and replayed', () => {
  const entries = [
    entry({ row: 4, channelId: 1, intention: 'ANSWER', reason: 'answering the horn' }),
    entry({ row: 12, moveId: 'springSlam' }),
    entry({ row: 20, moveId: 'channelThrow', channelId: 3 }),
  ];
  const lane: DubLane = {
    enabled: true,
    events: [
      event({ row: 4, channelId: 1 }),
      event({ row: 12, moveId: 'springSlam' }),
      event({ row: 20, moveId: 'channelThrow', channelId: 3 }),
    ],
  };

  it('fires every move the journal describes, on the row it describes', () => {
    const report = compareJournalToReplay(journalOf(entries), replay(lane, 32));
    expect(report.reproduces).toBe(true);
    expect(report.matched).toBe(3);
  });

  it('replays through the lane player, not from the journal', () => {
    // The journal is commentary: nothing in it reaches the router. Everything
    // that fired came from the lane, tagged as a lane fire.
    replay(lane, 32);
    expect(fired).toHaveLength(3);
    expect(new Set(fired.map(f => f.source))).toEqual(new Set(['lane']));
  });

  it('says so in words a reader can act on', () => {
    const text = formatReplayReport(compareJournalToReplay(journalOf(entries), replay(lane, 32)));
    expect(text).toMatch(/reproduces the journal/);
    expect(text).toMatch(/3 moves/);
  });
});

describe('drift between the lanes and the commentary is reported, not hidden', () => {
  const entries = [
    entry({ row: 4, channelId: 1 }),
    entry({ row: 12, moveId: 'springSlam' }),
  ];

  it('an event deleted from the lane shows up as missing', () => {
    const lane: DubLane = { enabled: true, events: [event({ row: 4, channelId: 1 })] };
    const report = compareJournalToReplay(journalOf(entries), replay(lane, 32));
    expect(report.reproduces).toBe(false);
    expect(report.missing.map(e => e.moveId)).toEqual(['springSlam']);
  });

  it('an event added by hand shows up as unexplained', () => {
    const lane: DubLane = {
      enabled: true,
      events: [
        event({ row: 4, channelId: 1 }),
        event({ row: 8, moveId: 'dubSiren' }),
        event({ row: 12, moveId: 'springSlam' }),
      ],
    };
    const report = compareJournalToReplay(journalOf(entries), replay(lane, 32));
    expect(report.unexplained.map(f => f.moveId)).toEqual(['dubSiren']);
    expect(report.reproduces).toBe(false);
  });

  it('an event nudged across the grid shows up as moved, not as missing', () => {
    const lane: DubLane = {
      enabled: true,
      events: [event({ row: 4, channelId: 1 }), event({ row: 16, moveId: 'springSlam' })],
    };
    const report = compareJournalToReplay(journalOf(entries), replay(lane, 32));
    expect(report.missing).toHaveLength(0);
    expect(report.misplaced).toHaveLength(1);
    expect(report.misplaced[0].firedRow).toBe(16);
  });

  it('a disabled lane reads as a performance that no longer plays at all', () => {
    const lane: DubLane = {
      enabled: false,
      events: [event({ row: 4, channelId: 1 }), event({ row: 12, moveId: 'springSlam' })],
    };
    const report = compareJournalToReplay(journalOf(entries), replay(lane, 32));
    expect(report.missing).toHaveLength(2);
  });

  it('names what changed rather than only counting it', () => {
    const lane: DubLane = { enabled: true, events: [event({ row: 4, channelId: 1 })] };
    const text = formatReplayReport(compareJournalToReplay(journalOf(entries), replay(lane, 32)));
    expect(text).toMatch(/missing\s+springSlam at row 12/);
    expect(text).toMatch(/lanes are what plays/);
  });
});

describe('the tolerance is the recorder quantizing, not the performance changing', () => {
  it('accepts a fire inside the tolerance as the same move', () => {
    const j = journalOf([entry({ row: 4.4, channelId: 1 })]);
    const report = compareJournalToReplay(j, [{ moveId: 'echoThrow', channelId: 1, row: 4 }]);
    expect(report.reproduces).toBe(true);
  });

  it('rejects one outside it', () => {
    const j = journalOf([entry({ row: 5.2, channelId: 1 })]);
    const report = compareJournalToReplay(j, [{ moveId: 'echoThrow', channelId: 1, row: 4 }]);
    expect(report.misplaced).toHaveLength(1);
  });

  it('is under a row, so two moves a row apart can never be confused', () => {
    expect(DEFAULT_ROW_TOLERANCE).toBeLessThan(1);
  });
});

describe('pairing when the same move repeats', () => {
  it('matches each fire to its nearest entry, not to the first one', () => {
    const j = journalOf([
      entry({ invocationId: 'a', row: 4, channelId: 1 }),
      entry({ invocationId: 'b', row: 20, channelId: 1 }),
    ]);
    const report = compareJournalToReplay(j, [
      { moveId: 'echoThrow', channelId: 1, row: 20 },
      { moveId: 'echoThrow', channelId: 1, row: 4 },
    ]);
    expect(report.reproduces).toBe(true);
    expect(report.matched).toBe(2);
  });

  it('keeps a global move and a channel move apart', () => {
    const j = journalOf([entry({ row: 4, moveId: 'springSlam' })]);
    const report = compareJournalToReplay(j, [
      { moveId: 'springSlam', channelId: 2, row: 4 },
    ]);
    expect(report.missing).toHaveLength(1);
    expect(report.unexplained).toHaveLength(1);
  });
});

describe('the empty cases', () => {
  it('a performance with no journal and no lane reproduces trivially', () => {
    expect(compareJournalToReplay(journalOf([]), []).reproduces).toBe(true);
  });

  it('a journal with no lane is entirely missing', () => {
    const report = compareJournalToReplay(journalOf([entry({ row: 4 })]), []);
    expect(report.missing).toHaveLength(1);
    expect(report.reproduces).toBe(false);
  });
});

/**
 * The MCP check reads a lane without firing it, which is only honest while
 * that reading agrees with the player. These are the tests that license it.
 */
describe('firesFromLane agrees with the real player', () => {
  const lanes: DubLane[] = [
    {
      enabled: true,
      events: [
        event({ row: 4, channelId: 1 }),
        event({ row: 12, moveId: 'springSlam' }),
        event({ row: 20, moveId: 'channelThrow', channelId: 3 }),
      ],
    },
    // Out of order on disk — the player walks by row, so the reading must too.
    {
      enabled: true,
      events: [
        event({ row: 20, moveId: 'channelThrow', channelId: 3 }),
        event({ row: 4, channelId: 1 }),
      ],
    },
    { enabled: true, events: [] },
  ];

  it('produces exactly what a replay fires, in the same order', () => {
    for (const lane of lanes) {
      const sorted = [...lane.events].sort((a, b) => a.row - b.row);
      expect(firesFromLane(lane)).toEqual(replay({ ...lane, events: sorted }, 32));
    }
  });

  it('fires nothing for a disabled lane, exactly as the player does', () => {
    const lane: DubLane = { enabled: false, events: [event({ row: 4 })] };
    expect(firesFromLane(lane)).toEqual([]);
    expect(replay(lane, 32)).toEqual([]);
  });

  it('is empty for a pattern with no lane at all', () => {
    expect(firesFromLane(null)).toEqual([]);
    expect(firesFromLane(undefined)).toEqual([]);
  });
});

/**
 * Reachability. A check nobody can run is not a check — and the journal's own
 * read tool turned out to have the same problem: the handler existed and the
 * MCP server never declared it, so it was unreachable from the outside.
 */
describe('wiring contract — the check is reachable', () => {
  const handlers = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'handlers', 'readHandlers.ts'), 'utf8',
  );
  const bridge = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'MCPBridge.ts'), 'utf8',
  );
  const server = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'server', 'src', 'mcp', 'mcpServer.ts'), 'utf8',
  );

  it('has a handler that compares the journal to what will actually fire', () => {
    // This assertion originally pinned `firesFromLane(pattern.dubLane)`, which
    // was the bug: lanes are legacy storage that load-migration clears, so the
    // check found nothing for any modern recording. Corrected, not relaxed.
    expect(handlers).toContain('export async function verifyPerformanceJournal');
    expect(handlers).toContain('compareJournalToReplay');
    expect(handlers).toContain('firesForPattern(curves, pattern.dubLane)');
  });

  it('reads the lane instead of firing it, so asking makes no sound', () => {
    expect(handlers).not.toMatch(/verifyPerformanceJournal[\s\S]{0,1400}dubLanePlayer/);
  });

  it('is routed by the bridge', () => {
    expect(bridge).toContain('verify_performance_journal: verifyPerformanceJournal');
  });

  it('is declared by the MCP server, along with the two journal tools that were not', () => {
    expect(server).toContain("'verify_performance_journal'");
    expect(server).toContain("'get_performance_journal'");
    expect(server).toContain("'clear_performance_journal'");
  });
});

/**
 * The verifier shipped reading `pattern.dubLane.events` only — legacy storage
 * that `DubRecorder` stopped writing and that load-migration CLEARS. Against a
 * real session it therefore found nothing, would have called every journal
 * entry "missing", and concluded the take did not reproduce. Exactly backwards,
 * and caught by running the tool instead of trusting it.
 */
function curve(over: Partial<import('@/types/automation').AutomationCurve> = {}) {
  return {
    id: 'c1',
    patternId: 'p1',
    channelIndex: -1,
    parameter: 'dub.springSlam',
    mode: 'steps' as const,
    interpolation: 'linear' as const,
    enabled: true,
    points: [{ row: 8, value: 1 }, { row: 8.05, value: 0 }],
    ...over,
  } as import('@/types/automation').AutomationCurve;
}

describe('firesFromCurves — where a modern recording actually lives', () => {
  it('counts an upward crossing as a fire, the way AutomationPlayer does', () => {
    expect(firesFromCurves([curve()])).toEqual([
      { moveId: 'springSlam', channelId: undefined, row: 8 },
    ]);
  });

  it('carries the channel from the curve it was drawn in', () => {
    const fires = firesFromCurves([curve({ channelIndex: 2, parameter: 'dub.echoThrow' })]);
    expect(fires[0]).toEqual({ moveId: 'echoThrow', channelId: 2, row: 8 });
  });

  it('treats -1 as global, not as channel minus one', () => {
    expect(firesFromCurves([curve()])[0].channelId).toBeUndefined();
  });

  it('counts a hold once, not once per point', () => {
    const held = curve({ points: [{ row: 4, value: 1 }, { row: 20, value: 0 }] });
    expect(firesFromCurves([held])).toHaveLength(1);
  });

  it('counts a repeated move once per press', () => {
    const twice = curve({
      points: [
        { row: 4, value: 1 }, { row: 4.05, value: 0 },
        { row: 12, value: 1 }, { row: 12.05, value: 0 },
      ],
    });
    expect(firesFromCurves([twice]).map(f => f.row)).toEqual([4, 12]);
  });

  it('ignores a disabled curve — it will not play', () => {
    expect(firesFromCurves([curve({ enabled: false })])).toEqual([]);
  });

  it('ignores non-dub automation entirely', () => {
    expect(firesFromCurves([curve({ parameter: 'tb303.cutoff' })])).toEqual([]);
  });

  it('ignores the send ride, which is a movement and not a fire', () => {
    // Counting its points would invent one move per curve point.
    const ride = curve({
      parameter: 'dub.channelSend',
      channelIndex: 1,
      points: [{ row: 0, value: 0 }, { row: 4, value: 0.8 }, { row: 8, value: 0.2 }],
    });
    expect(firesFromCurves([ride])).toEqual([]);
  });

  it('returns fires in row order across several curves', () => {
    const a = curve({ id: 'a', parameter: 'dub.echoThrow', points: [{ row: 16, value: 1 }, { row: 16.05, value: 0 }] });
    const b = curve({ id: 'b', parameter: 'dub.springSlam', points: [{ row: 2, value: 1 }, { row: 2.05, value: 0 }] });
    expect(firesFromCurves([a, b]).map(f => f.row)).toEqual([2, 16]);
  });
});

describe('firesForPattern — curves plus any legacy lane still carried', () => {
  it('finds a performance that lives only in curves', () => {
    const report = compareJournalToReplay(
      journalOf([entry({ row: 8, moveId: 'springSlam', channelId: undefined })]),
      firesForPattern([curve()], null),
    );
    expect(report.reproduces).toBe(true);
  });

  it('still reads a project whose events have not been migrated yet', () => {
    const lane: DubLane = { enabled: true, events: [event({ row: 4, channelId: 1 })] };
    const fires = firesForPattern([], lane);
    expect(fires).toEqual([{ moveId: 'echoThrow', channelId: 1, row: 4 }]);
  });

  it('merges both in row order', () => {
    const lane: DubLane = { enabled: true, events: [event({ row: 20, channelId: 1 })] };
    expect(firesForPattern([curve()], lane).map(f => f.row)).toEqual([8, 20]);
  });
});

describe('wiring contract — the verifier reads curves, not only the legacy lane', () => {
  const handlers = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'handlers', 'readHandlers.ts'), 'utf8',
  );

  it('pulls the pattern\'s automation curves', () => {
    expect(handlers).toContain('useAutomationStore');
    expect(handlers).toContain('firesForPattern(curves, pattern.dubLane)');
  });

  it('no longer reads the lane alone', () => {
    expect(handlers).not.toContain('firesFromLane(pattern.dubLane)');
  });
});
