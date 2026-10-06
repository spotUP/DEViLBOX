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
  // Distinct from empty and from frozen: the grid is populated and it moves,
  // but what it shows is not the song — wrong notes, wrong channels, garbage
  // cells. A parser that half-works looks like this, and calling it "empty"
  // would send the next reader to the wrong half of the code.
  { id: 'wrong-patterns', key: '7', label: 'Incorrect Pattern Data', title: 'Pattern data is present and moving, but wrong', patternQuality: 'incorrect' },
  // Narrower than incorrect data: what the grid shows is right, but some notes
  // the song plays have no cell (an arpeggio table, a skipped row, a voice the
  // decoder misses). The fix lives in a different place from wrong cells.
  { id: 'missing-notes',  key: '9', label: 'Missing Notes',   title: 'The grid is right but some played notes have no cell', patternQuality: 'missing-notes' },
  // The song plays, but its instruments make no sound when played from the
  // computer or MIDI keyboard - an instrument-preview fault, not a playback one.
  { id: 'keyboard-silent', key: '', label: 'Keyboard Silent', title: 'The instruments make no sound when played on the keyboard', status: 'partial' },
] as const;

/**
 * The Visualizer mark: this song shows the scope view instead of the pattern
 * editor. An observation, not a fault — it never touches `status` or
 * `patternQuality`, is never cleared by Good, and has its own switch and key.
 */
export const JUKEBOX_VISUALIZER = {
  id: 'visualizer', key: '8', label: 'Visualizer',
  title: 'This song shows the visualizer instead of the pattern editor',
  /** The value stored in the row's `view` field. */
  value: 'visualizer',
} as const;

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

/** Fault ids in canonical (keyboard, worst first) order, unknown ids dropped. */
function canonical(ids: readonly string[]): string[] {
  return JUKEBOX_FAULTS.filter((f) => ids.includes(f.id)).map((f) => f.id);
}

/**
 * The set after one fault is switched on or off. Pure, and independent per
 * fault: switching one never touches another.
 */
export function setFault(current: readonly string[], id: string, on: boolean): string[] {
  const without = current.filter((x) => x !== id);
  return canonical(on ? [...without, id] : without);
}

/**
 * The tracker's two shared fields, derived from a fault set. First match in
 * JUKEBOX_FAULTS order wins, which is worst first.
 */
export function deriveFields(ids: readonly string[]): { status: string; patternQuality: string } {
  const held = JUKEBOX_FAULTS.filter((f) => ids.includes(f.id));
  return {
    status: held.find((f) => f.status)?.status ?? '',
    patternQuality: held.find((f) => f.patternQuality)?.patternQuality ?? '',
  };
}

/** The faults a stored verdict carries, whichever shape wrote it. */
export function faultsOf(v: JukeboxVerdict | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v.faults)) {
    const d = deriveFields(v.faults);
    // Consistent with the shared fields -> the set is the truth. Otherwise the
    // dashboard changed the fields after the set was written.
    if (d.status === (v.status ?? '') && d.patternQuality === (v.patternQuality ?? '')) {
      return canonical(v.faults);
    }
  }
  return JUKEBOX_FAULTS
    .filter((f) => (f.status && f.status === v.status) || (f.patternQuality && f.patternQuality === v.patternQuality))
    .map((f) => f.id);
}

/** The verdict a fault set writes, so the UI shows it without a round trip. */
export function verdictFromFaults(ids: readonly string[], notes?: string): JukeboxVerdict {
  const faults = canonical(ids);
  const d = deriveFields(faults);
  return { faults, status: d.status || undefined, patternQuality: d.patternQuality || undefined, notes };
}

/** Whether a verdict carries the Visualizer mark. */
export function isVisualizer(v: JukeboxVerdict | undefined): boolean {
  return v?.view === JUKEBOX_VISUALIZER.value;
}

/** A verdict rewritten by a fault or Good keeps the row's Visualizer mark. */
export function keepView(next: JukeboxVerdict, prev: JukeboxVerdict | undefined): JukeboxVerdict {
  return prev?.view ? { ...next, view: prev.view } : next;
}

/** Switch the Visualizer mark on or off. Writes only `view`; the rest is merged by the server. */
export async function reportVisualizer(on: boolean, ctx: ReportContext): Promise<boolean> {
  return push(ctx, { view: on ? JUKEBOX_VISUALIZER.value : '' });
}

async function push(ctx: ReportContext, body: Record<string, unknown>): Promise<boolean> {
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

function stampOf(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Send a row's whole fault set.
 *
 * The full set goes every time (not a delta), so the server never has to merge
 * two faults and a reload shows exactly what was set.
 *
 * Fire-and-forget by design: a listener sweeping 186 formats must never wait
 * on a dev server, and the tracker being down is not a reason to lose the
 * rest of the sweep. Returns whether it landed, for the UI to show quietly.
 *
 * @param changed the fault just switched, for the note
 */
export async function reportFaults(
  faults: readonly string[],
  changed: JukeboxFault,
  on: boolean,
  ctx: ReportContext,
): Promise<boolean> {
  const stamp = stampOf();
  const parts = [`${on ? '' : 'cleared '}${changed.label} — ${ctx.file}`];
  if (on && ctx.engine) parts.push(`engine=${ctx.engine}`);
  if (on && ctx.note) parts.push(ctx.note);
  parts.push(`(jukebox ${stamp})`);
  const set = canonical(faults);
  const d = deriveFields(set);
  return push(ctx, { faults: set, status: d.status, patternQuality: d.patternQuality, notes: parts.join(' · ') });
}

/** Mark a row good. Exclusive: the fault set is emptied. */
export async function reportGood(ctx: ReportContext): Promise<boolean> {
  return push(ctx, {
    faults: [],
    status: JUKEBOX_OK.status,
    patternQuality: '',
    notes: `${JUKEBOX_OK.label} — ${ctx.file} (jukebox ${stampOf()})`,
  });
}

/**
 * A row's recorded verdict, in the tracker's own vocabulary.
 *
 * `status` and `patternQuality` are independent, so a row can carry both: a
 * song may be silent AND show empty patterns, and the sweep needs to see both
 * when it comes back.
 */
export interface JukeboxVerdict {
  /** 'visualizer' when the song shows the scope view; see JUKEBOX_VISUALIZER. */
  view?: string;
  /** Fault ids; see the header for how it relates to the two fields below. */
  faults?: string[];
  status?: string;
  patternQuality?: string;
  notes?: string;
}

/**
 * The labels to print on a row, worst first.
 *
 * "in the jukebox list i cant see how the songs marked broken are broken"
 * (2026-09-24) — every fault used to collapse into a single "!", so a swept
 * row could not be read back, which is the entire point of sweeping.
 *
 * Falls back to the raw tracker value for a verdict written by something other
 * than the jukebox: the dashboard has its own vocabulary and a row set there
 * must still say something rather than nothing.
 */
export function verdictLabels(v: JukeboxVerdict | undefined): string[] {
  if (!v) return [];
  if (isGoodVerdict(v)) return [JUKEBOX_OK.label];
  const ids = faultsOf(v);
  const out = ids.map((id) => JUKEBOX_FAULTS.find((f) => f.id === id)!.label);
  for (const field of ['status', 'patternQuality'] as const) {
    const value = v[field];
    if (!value || value === 'untested') continue;
    if (!JUKEBOX_FAULTS.some((f) => f[field] === value)) out.push(value);
  }
  return out;
}

/** True when this verdict means there is nothing to come back to. */
export function isGoodVerdict(v: JukeboxVerdict | undefined): boolean {
  return v?.status === JUKEBOX_OK.status && faultsOf(v).length === 0;
}

/**
 * What the tracker already knows, so a sweep survives a reload.
 *
 * Verdicts were kept in React state alone and vanished on refresh — which is
 * the one thing a long audit cannot afford. They were being WRITTEN to the
 * server the whole time; nothing read them back.
 *
 * Returns a map of row id to the verdict the server holds, or an empty map
 * when the tracker is not running.
 */
export async function loadVerdicts(): Promise<Record<string, JukeboxVerdict>> {
  try {
    const res = await fetch(`${TRACKER}/get-data`);
    if (!res.ok) return {};
    const data = await res.json() as Record<string, JukeboxVerdict>;
    const out: Record<string, JukeboxVerdict> = {};
    for (const [key, entry] of Object.entries(data)) {
      if ((!entry?.status || entry.status === 'untested') && !entry?.patternQuality && !entry?.faults?.length && !entry?.view) continue;
      out[key] = {
        faults: Array.isArray(entry.faults) ? entry.faults : undefined,
        view: entry.view || undefined,
        status: entry.status, patternQuality: entry.patternQuality, notes: entry.notes,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** The verdict one fault alone writes (or Good). */
export function verdictOf(fault: JukeboxFault | typeof JUKEBOX_OK): JukeboxVerdict {
  if (fault.id === JUKEBOX_OK.id) return { faults: [], status: JUKEBOX_OK.status };
  return verdictFromFaults([fault.id]);
}

/** The fault a failed load reports — looked up, never duplicated. */
export const LOAD_FAILED = JUKEBOX_FAULTS.find((f) => f.id === 'load-failed')!;
