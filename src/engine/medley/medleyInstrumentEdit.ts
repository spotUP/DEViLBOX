/**
 * medleyInstrumentEdit.ts - the write-back of the Medley instrument editor.
 *
 * The song's module bytes (useFormatStore.nuadeFileData, the same buffer as song.nuadeFileData) are the single source of
 * truth: a field is written into them in place, so the native export (nativeExportRouter maps nuadeFileData to the
 * exporter's input), the session save (restoreFromStoredBytes) and the next play (engineLoadArgs) all carry it.
 *
 * Heard at once:
 * - keyboard voice: MedleySynth sends the module to the worklet's parked key player on each attack, cached by buffer
 *   identity; forgetKeyModule makes the next key send the edited bytes.
 * - playing song: the 'engine-swap' route (applyEditedModuleToEngine) hands nuade the module, which runs it silently
 *   to the frame already played and plays on. The replayer copies an instrument at its next Instrument command.
 */
import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { NuadeEngine } from '@/engine/nuade/NuadeEngine';
import { applyMedleyWrite, type MedleyWrite } from '@/lib/import/formats/medleyInstrument';

/** The module bytes the editor reads and writes, or null when no Medley song plays on nuade. */
export function medleyEditableModule(): Uint8Array | null {
  const f = useFormatStore.getState();
  if (f.nuadePlayerId !== 'medley' || !f.nuadeFileData) return null;
  return new Uint8Array(f.nuadeFileData);
}

/** Write the fields and make both voices hear them. False when no Medley module is loaded or no byte changed. */
export function applyMedleyInstrumentWrites(writes: MedleyWrite[]): boolean {
  const buf = medleyEditableModule();
  if (!buf) return false;
  let changed = false;
  for (const w of writes) changed = applyMedleyWrite(buf, w) || changed;
  if (!changed) return false;
  if (NuadeEngine.hasInstance()) {
    NuadeEngine.getInstance().forgetKeyModule();
    if (useTransportStore.getState().isPlaying) void swapIntoPlayingSong(buf);
  }
  return true;
}

async function swapIntoPlayingSong(buf: Uint8Array): Promise<void> {
  const [{ WASM_ENGINES }, { applyEditedModuleToEngine }, { peekTrackerReplayer }, { liveTrackerSong }] = await Promise.all([
    import('@/engine/replayer/wasmEngineRegistry'),
    import('@/engine/replayer/engineModuleSwap'),
    import('@/engine/TrackerReplayer'),
    import('@/lib/song/liveSong'),
  ]);
  const desc = WASM_ENGINES.find((d) => d.key === 'Nuade');
  if (!desc) return;
  const song = peekTrackerReplayer()?.getSong() ?? liveTrackerSong();
  await applyEditedModuleToEngine(song, desc, buf);
}
