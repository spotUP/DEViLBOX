/**
 * Grid edits for a Fred Editor song playing on FredReplayer2.
 *
 * A grid cell is one line of one pattern (fredEditorGrid.ts): the edit is
 * written into that pattern, the module re-encoded (applyFredGridEdits), and
 * the replayer swaps the new module in where it plays (fred_replace_module:
 * every voice keeps its place). The new module becomes the song's module, so
 * the next load, save and export carry the edit.
 *
 * A pattern plays wherever a track list names it, so the same line shows in
 * other grid cells too (rebels.fred voice 1 plays one 16-line pattern 36
 * times); those cells are updated to the edited line.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

/** Re-encode `edits` into the song's module and hand it to the replayer. Returns the new module, or null when nothing changed. */
export async function applyFredModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.fredReplayerFileData) return null;
  const { applyFredGridEdits, walkFredSong, fredLineToCell, FRED_ROWS_PER_PATTERN } = await import('@/lib/import/formats/fredEditorGrid');
  const { decodeFredModule } = await import('@/lib/import/formats/FredEditorModule');
  const current = new Uint8Array(song.fredReplayerFileData);
  const next = applyFredGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.fredReplayerFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ fredReplayerFileData: module });

  const { FredReplayerEngine } = await import('./FredReplayerEngine');
  if (FredReplayerEngine.hasInstance()) FredReplayerEngine.getInstance().replaceModule(module.slice(0));

  // Every other cell showing an edited line.
  const m = decodeFredModule(next);
  const walk = walkFredSong(m);
  const key = (pattern: number, line: number): string => `${pattern}:${line}`;
  const edited = new Set<string>();
  const at = new Set<string>();
  for (const e of edits) {
    const ref = walk.voices[e.channel]?.[e.pattern * FRED_ROWS_PER_PATTERN + e.row];
    if (ref) { edited.add(key(ref.pattern, ref.line)); at.add(`${e.channel}:${e.pattern * FRED_ROWS_PER_PATTERN + e.row}`); }
  }
  const mirrors: { pattern: number; row: number; channel: number; line: (typeof m.patterns)[number]['lines'][number] }[] = [];
  walk.voices.forEach((refs, channel) => refs.forEach((ref, r) => {
    if (!ref || !edited.has(key(ref.pattern, ref.line)) || at.has(`${channel}:${r}`)) return;
    mirrors.push({ pattern: Math.floor(r / FRED_ROWS_PER_PATTERN), row: r % FRED_ROWS_PER_PATTERN, channel, line: m.patterns[ref.pattern].lines[ref.line] });
  }));
  if (mirrors.length) {
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    useTrackerStore.setState((state) => {
      for (const { pattern, row, channel, line } of mirrors) {
        const rows = state.patterns[pattern]?.channels[channel]?.rows;
        if (rows && row < rows.length) rows[row] = fredLineToCell(line);
      }
    });
  }
  return module;
}
