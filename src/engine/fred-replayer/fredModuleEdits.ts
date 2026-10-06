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
  const { applyFredGridEdits, walkFredSong, fredLineToCell, fredVoiceStates, FRED_ROWS_PER_PATTERN } = await import('@/lib/import/formats/fredEditorGrid');
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

  // Every other cell whose line changed - or whose carried instrument changed with an edited $83.
  const before = decodeFredModule(current);
  const m = decodeFredModule(next);
  const walkBefore = walkFredSong(before);
  const walk = walkFredSong(m);
  const statesBefore = fredVoiceStates(before, walkBefore);
  const states = fredVoiceStates(m, walk);
  const at = new Set(edits.map((e) => `${e.channel}:${e.pattern * FRED_ROWS_PER_PATTERN + e.row}`));
  const cellAt = (mod: typeof m, w: typeof walk, st: typeof states, channel: number, r: number) => {
    const ref = w.voices[channel][r];
    return fredLineToCell(ref ? mod.patterns[ref.pattern].lines[ref.line] : undefined, st[channel][r]);
  };
  const mirrors: { pattern: number; row: number; channel: number; cell: ReturnType<typeof fredLineToCell> }[] = [];
  walk.voices.forEach((_, channel) => {
    for (let r = 0; r < walk.lines; r++) {
      if (at.has(`${channel}:${r}`)) continue;
      const cell = cellAt(m, walk, states, channel, r);
      if (JSON.stringify(cell) === JSON.stringify(cellAt(before, walkBefore, statesBefore, channel, r))) continue;
      mirrors.push({ pattern: Math.floor(r / FRED_ROWS_PER_PATTERN), row: r % FRED_ROWS_PER_PATTERN, channel, cell });
    }
  });
  if (mirrors.length) {
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    useTrackerStore.setState((state) => {
      for (const { pattern, row, channel, cell } of mirrors) {
        const rows = state.patterns[pattern]?.channels[channel]?.rows;
        if (rows && row < rows.length) rows[row] = cell;
      }
    });
  }
  return module;
}
