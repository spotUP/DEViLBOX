/**
 * Klystrack edits - ONE write path for the klystrack view's pattern grid and sequence matrix.
 *
 * The cells the view draws are `klysNative` (patterns + per-channel sequences, the model the engine plays and
 * the exporter serializes through the engine). An edit writes the store and then the running engine's own
 * memory (klys_set_pattern_step / klys_set_sequence_entry), so it is heard the next time the song reaches it.
 * Before this the grid mutated the store's step object in place and the matrix never told the engine.
 */
import { useFormatStore } from '@stores/useFormatStore';
import type { OnCellChange } from '@/components/shared/format-editor-types';
import { klysCellAt, type KlysWindow } from './klysAdapter';

type StepField = 'note' | 'instrument' | 'ctrl' | 'volume' | 'command';
const STEP_FIELDS: readonly string[] = ['note', 'instrument', 'ctrl', 'volume', 'command'];

/** Hand one pattern step to the running engine. No engine yet: the next load reads the edited store via export. */
function pushStep(patternIdx: number, stepIdx: number): void {
  const step = useFormatStore.getState().klysNative?.patterns[patternIdx]?.steps[stepIdx];
  if (!step) return;
  void import('@/engine/klystrack/KlysEngine').then(({ KlysEngine }) => {
    if (!KlysEngine.hasInstance()) return;
    KlysEngine.getInstance().setPatternStep(
      patternIdx, stepIdx, step.note, step.instrument, step.ctrl, step.volume,
      step.command & 0xFF, (step.command >> 8) & 0xFF,
    );
  });
}

/**
 * The pattern grid's cell edit for a window of song rows (klysToFormatChannels): row r of channel ch is the
 * step that channel plays at song row window.start + r. A row where the channel plays nothing has no step to edit.
 */
export function klysCellChangeFor(window: KlysWindow): OnCellChange {
  return (channelIdx, rowIdx, columnKey, value) => {
    if (!STEP_FIELDS.includes(columnKey)) return;
    const native = useFormatStore.getState().klysNative;
    if (!native) return;
    const at = klysCellAt(native, channelIdx, window.start + rowIdx);
    if (!at) return;
    useFormatStore.getState().setKlysPatternStep(at.patternIdx, at.stepIdx, columnKey as StepField, value);
    pushStep(at.patternIdx, at.stepIdx);
  };
}

/** The sequence matrix's edit of channel `ch`'s entry at song row `songRow`. */
export function klysSequenceChange(ch: number, songRow: number, field: 'pattern' | 'noteOffset', value: number): void {
  useFormatStore.getState().setKlysSequenceEntry(ch, songRow, field, value);
  const entries = useFormatStore.getState().klysNative?.sequences[ch]?.entries ?? [];
  const pos = entries.findIndex((e) => e.position === songRow);
  if (pos < 0) return;
  const e = entries[pos];
  void import('@/engine/klystrack/KlysEngine').then(({ KlysEngine }) => {
    if (!KlysEngine.hasInstance()) return;
    KlysEngine.getInstance().setSequenceEntry(ch, pos, e.position, e.pattern, e.noteOffset);
  });
}
