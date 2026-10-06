/**
 * Grid edits for eagleplayer formats whose grid is a reading of the module,
 * not a byte layout of it: the edit is re-encoded into a new module and the
 * runner (EaglePlayerEngine) is handed that module.
 *
 * Formats with a fixed cell layout (song.uadePatternLayout) write their cells
 * in place (writeCellToChipRam). A format here has an encoder from grid edits
 * to the whole module instead - MIDI Loriciel: the grid is the player's
 * schedule of a MIDI file, an edit moves MIDI events (MIDILoricielEncoder).
 *
 * The new module becomes the song's module (the next load and a save play
 * it) and the runner reloads it; a song that was playing plays on, from the
 * top (the runner has no seek).
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

/** Module + companions + grid edits -> the edited module. */
type ModuleEncoder = (module: Uint8Array, fileName: string, companions: Map<string, ArrayBuffer> | undefined, edits: readonly LiveCellEdit[]) => Uint8Array;

const ENCODERS: Record<string, () => Promise<ModuleEncoder>> = {
  MIDILoriciel: async () => {
    const [{ encodeMIDILoricielGridEdits }, { findLoricielBank }] = await Promise.all([
      import('@/lib/import/formats/MIDILoricielEncoder'),
      import('@/lib/import/formats/MIDILoricielParser'),
    ]);
    return (module, fileName, companions, edits) => {
      const bank = findLoricielBank(fileName, companions);
      if (!bank) throw new Error('MIDI Loriciel: the song carries no SMPL bank');
      return encodeMIDILoricielGridEdits(module, bank, edits);
    };
  },
};

/** True when the song's eagleplayer format takes grid edits by re-encoding its module. */
export function hasModuleEncoder(song: TrackerSong): boolean {
  return !!(song.eaglePlayerId && ENCODERS[song.eaglePlayerId] && song.eaglePlayerFileData);
}

/**
 * Re-encode `edits` into the song's module and hand it to the runner.
 * Returns the new module, or null when no event changed.
 */
export async function applyEaglePlayerModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  const get = song.eaglePlayerId ? ENCODERS[song.eaglePlayerId] : undefined;
  if (!get || !song.eaglePlayerFileData) return null;
  const encode = await get();
  const current = new Uint8Array(song.eaglePlayerFileData);
  const next = encode(current, song.eaglePlayerFileName ?? song.name, song.uadeCompanionFiles, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.eaglePlayerFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ eaglePlayerFileData: module });
  const { EaglePlayerEngine } = await import('./EaglePlayerEngine');
  if (EaglePlayerEngine.hasInstance()) {
    const engine = EaglePlayerEngine.getInstance();
    const { useTransportStore } = await import('@stores/useTransportStore');
    const playing = useTransportStore.getState().isPlaying;
    await engine.loadTune(module.slice(0), song.eaglePlayerId, song.eaglePlayerFileName ?? song.name, song.eaglePlayerSubsong, song.uadeCompanionFiles);
    if (playing) engine.play();
  }
  return module;
}
