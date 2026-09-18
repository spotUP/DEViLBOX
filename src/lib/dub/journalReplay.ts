/**
 * Gate M1's last question: does a saved performance play back as the journal
 * says it went?
 *
 * The lanes are the source of truth — they are what actually fires — and the
 * journal only explains them. That separation is deliberate and is what keeps
 * a stale journal from corrupting a replay. But it also means the two can
 * drift apart silently: edit a lane, hand-write a cell, delete an event, and
 * the commentary now describes a performance nobody will hear.
 *
 * So drift has to be DETECTABLE. This compares what a replay actually fired
 * against what the journal claims happened, and names the difference rather
 * than returning a single true/false that gives a reader nothing to act on.
 *
 * Pure: two lists in, a report out. It reads no lanes and drives no audio —
 * the caller replays and hands over what came out.
 */

import type { JournalEntry, PerformanceJournal } from './performanceJournal';
import type { DubLane } from '@/types/dub';

/** One fire as a replay produced it. */
export interface ReplayFire {
  moveId: string;
  channelId?: number;
  row: number;
}

export interface JournalReplayReport {
  /** Entries whose fire came back exactly as described. */
  matched: number;
  /** The journal describes these; the replay never fired them. */
  missing: JournalEntry[];
  /** The replay fired these; the journal says nothing about them. */
  unexplained: ReplayFire[];
  /** Right move, right channel, wrong row — a lane that was nudged. */
  misplaced: Array<{ entry: JournalEntry; firedRow: number }>;
  /** True only when every entry matched and nothing extra fired. */
  reproduces: boolean;
}

/**
 * How far a fire may sit from the row the journal recorded and still count.
 *
 * Not zero: the journal records the row a move FIRED on, live, while the lane
 * stores it quantized to the recording grid. A sixteenth of a row of
 * disagreement is the recorder doing its job, not the performance changing.
 */
export const DEFAULT_ROW_TOLERANCE = 0.5;

export function compareJournalToReplay(
  journal: PerformanceJournal,
  fires: readonly ReplayFire[],
  opts: { rowTolerance?: number } = {},
): JournalReplayReport {
  const tolerance = opts.rowTolerance ?? DEFAULT_ROW_TOLERANCE;

  const unclaimed = fires.map((f, i) => ({ fire: f, index: i, claimed: false }));
  const missing: JournalEntry[] = [];
  const misplaced: Array<{ entry: JournalEntry; firedRow: number }> = [];
  let matched = 0;

  for (const entry of journal.entries) {
    // Nearest unclaimed fire of the same move on the same channel. Nearest
    // rather than first, so two throws on one channel in the same bar pair up
    // with the right one instead of the earlier one swallowing both.
    let best: typeof unclaimed[number] | null = null;
    let bestDistance = Infinity;
    for (const candidate of unclaimed) {
      if (candidate.claimed) continue;
      if (candidate.fire.moveId !== entry.moveId) continue;
      if (candidate.fire.channelId !== entry.channelId) continue;
      const distance = Math.abs(candidate.fire.row - entry.row);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }

    if (!best) { missing.push(entry); continue; }
    best.claimed = true;
    if (bestDistance <= tolerance) matched++;
    else misplaced.push({ entry, firedRow: best.fire.row });
  }

  const unexplained = unclaimed.filter(c => !c.claimed).map(c => c.fire);

  return {
    matched,
    missing,
    unexplained,
    misplaced,
    reproduces:
      missing.length === 0 && unexplained.length === 0 && misplaced.length === 0,
  };
}

/**
 * The report in words, for a log or an MCP answer.
 *
 * Says what to do about it, because "3 missing" on its own does not tell a
 * reader whether they broke something or simply edited a lane on purpose.
 */
export function formatReplayReport(report: JournalReplayReport): string {
  if (report.reproduces) {
    return `Replay reproduces the journal: ${report.matched} moves, all where the journal says.`;
  }
  const lines: string[] = [
    `Replay DIFFERS from the journal (${report.matched} of ${
      report.matched + report.missing.length + report.misplaced.length
    } as described).`,
  ];
  for (const e of report.missing) {
    lines.push(`  missing     ${describe(e)} — the journal describes it; the lane does not play it`);
  }
  for (const { entry, firedRow } of report.misplaced) {
    lines.push(`  moved       ${describe(entry)} — plays at row ${firedRow.toFixed(2)}`);
  }
  for (const f of report.unexplained) {
    const ch = f.channelId !== undefined ? ` ch${f.channelId}` : '';
    lines.push(`  unexplained ${f.moveId}${ch} at row ${f.row.toFixed(2)} — plays, but nothing says why`);
  }
  lines.push('  A lane edited after the take will read like this. The lanes are what plays.');
  return lines.join('\n');
}

function describe(e: JournalEntry): string {
  const ch = e.channelId !== undefined ? ` ch${e.channelId}` : '';
  return `${e.moveId}${ch} at row ${e.row.toFixed(2)}`;
}

/**
 * What a lane WILL fire, without firing it.
 *
 * `DubLanePlayer` walks its events in row order and fires each once; a
 * disabled lane fires nothing. Reproducing that here lets the check run
 * against a saved project without making any sound, which is the only way it
 * can be a diagnostic rather than a performance.
 *
 * The shortcut is legitimate only as long as it agrees with the player, so
 * `journalReplay.test.ts` drives the REAL player over the same lanes and
 * asserts the two produce the same list. If the player ever grows a rule this
 * does not know about, that test fails rather than this quietly lying.
 */
export function firesFromLane(lane: DubLane | null | undefined): ReplayFire[] {
  if (!lane || !lane.enabled) return [];
  return [...lane.events]
    .sort((a, b) => a.row - b.row)
    .map(e => ({ moveId: e.moveId, channelId: e.channelId, row: e.row }));
}
