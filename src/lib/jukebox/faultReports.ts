/**
 * The faults a listener can report in one keystroke, and where they go.
 *
 * Every one of these was found by hand on the night of 2026-09-23/24, one
 * song at a time, and each took minutes to pin down. The point of naming them
 * is that the next sweep costs a keystroke per song instead.
 *
 * Reports go to the format-status server already running on :4444 — 1668
 * entries, an SSE dashboard, and fields (`status`, `patternQuality`, `notes`)
 * that already mean what these mean. Building a second store for the same
 * facts is the mistake this whole session kept paying for.
 */

/** Where the tracker server lives. Same host, fixed port — it is a dev tool. */
const TRACKER = 'http://localhost:4444';

export interface JukeboxFault {
  id: string;
  /** What the listener presses. */
  key: string;
  /** Full words, as every DEViLBOX label is. */
  label: string;
  /** What it means, for the button's title. */
  title: string;
  /** The tracker's own vocabulary. */
  status?: string;
  patternQuality?: string;
}

/**
 * Ordered for the keyboard: 1..6 down the list, worst first.
 *
 * `status` and `patternQuality` are the tracker's existing fields. A fault
 * that is purely about the grid leaves `status` alone, so reporting a frozen
 * play head does not also claim the audio is broken.
 */
export const JUKEBOX_FAULTS: readonly JukeboxFault[] = [
  { id: 'load-failed',    key: '1', label: 'Load Failed',     title: 'The file did not load at all',                       status: 'crashes' },
  { id: 'silent',         key: '2', label: 'Silent',          title: 'Loads and plays, but no audio',                      status: 'silent' },
  { id: 'empty-patterns', key: '3', label: 'Empty Patterns',  title: 'Plays, but the pattern grid has no data',            patternQuality: 'empty' },
  { id: 'frozen-grid',    key: '4', label: 'Frozen Patterns', title: 'Pattern data is there but does not scroll',          patternQuality: 'frozen' },
  { id: 'out-of-sync',    key: '5', label: 'Out Of Sync',     title: 'Grid and audio drift apart',                         patternQuality: 'out-of-sync' },
  { id: 'wrong-sound',    key: '6', label: 'Wrong Sound',     title: 'Plays, but it does not sound like the tune should',  status: 'partial' },
] as const;

/** Nothing wrong — worth recording, so a swept format is not re-swept. */
export const JUKEBOX_OK = { id: 'ok', key: '0', label: 'Good', title: 'Plays and displays correctly', status: 'works' } as const;

export interface ReportContext {
  /** The corpus directory, which is how the corpus names the format. */
  format: string;
  /** The file actually heard. */
  file: string;
  /** Which engine rendered it — the same symptom has different causes per
   *  engine, which cost most of a night to learn. */
  engine?: string;
  note?: string;
}

/**
 * Send one verdict.
 *
 * Fire-and-forget by design: a listener sweeping 186 formats must never wait
 * on a dev server, and the tracker being down is not a reason to lose the
 * rest of the sweep. Returns whether it landed, for the UI to show quietly.
 */
export async function reportFault(
  fault: JukeboxFault | typeof JUKEBOX_OK,
  ctx: ReportContext,
): Promise<boolean> {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const parts = [`${fault.label} — ${ctx.file}`];
  if (ctx.engine) parts.push(`engine=${ctx.engine}`);
  if (ctx.note) parts.push(ctx.note);
  parts.push(`(jukebox ${stamp})`);

  const body: Record<string, unknown> = { notes: parts.join(' · ') };
  if ('status' in fault && fault.status) body.status = fault.status;
  if ('patternQuality' in fault && fault.patternQuality) body.patternQuality = fault.patternQuality;

  try {
    const res = await fetch(`${TRACKER}/push-updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [ctx.format]: body }),
    });
    return res.ok;
  } catch {
    // The server is not running. Say so in the UI rather than throwing the
    // sweep away.
    return false;
  }
}
