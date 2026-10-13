/**
 * Edit-path tests guard the engine that takes the edit (UADE chip-RAM writes, the format's own track-index engine), so they
 * pin it: the table's default for these rows follows the playback verdicts (plan D8 / DN-1), and a test of the edit path must
 * not move with a rollout verdict. The engine pinned is the row's legacyEngine, the one that sounded these edits before nuade.
 */
import { NUADE_FORMATS } from '@/engine/nuade/nuadeFormats';
import { useSettingsStore } from '@/stores/useSettingsStore';

export function pinEditPathEngine(...rowIds: string[]): void {
  for (const id of rowIds) {
    const row = NUADE_FORMATS[id];
    if (!row) throw new Error(`pinEditPathEngine: no nuade row ${id}`);
    useSettingsStore.getState().setFormatEngine(row.prefKey as never, row.legacyEngine);
  }
}
