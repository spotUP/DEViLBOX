/**
 * Playing the subsongs of a whole-song engine's file (lib/tracker/nativeSubsongs):
 * the auto-advance when a subsong ends, and the scope view's subsong control.
 * The format store's `nativeSubsongs` (the engine's own report) says what
 * plays; the engine says what it started, and the store follows that.
 */
import { useFormatStore } from '@stores/useFormatStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { isSubsongPlayer, nextSubsong } from '@/lib/tracker/nativeSubsongs';

/**
 * A subsong of `engineKey`'s file went silent: start the next one. False with
 * the setting off (an artist on one subsong stays on it), on the last
 * subsong, for an engine without subsongs, or when none from the next on
 * makes a sound - the song then ends as before.
 */
export async function advanceNativeSubsong(engineKey: string, instance: unknown): Promise<boolean> {
  if (!useSettingsStore.getState().autoAdvanceSubsongs) return false;
  const subsongs = useFormatStore.getState().nativeSubsongs;
  if (!subsongs || subsongs.engine !== engineKey || !isSubsongPlayer(instance)) return false;
  const next = nextSubsong(subsongs);
  if (next === null) return false;
  return (await instance.playSubsong(next, { skipSilent: true })) >= 0;
}

/**
 * The subsong control picked `index`: while the song plays, the engine starts
 * it now; stopped, the store's start field takes it and play starts there.
 */
export async function selectNativeSubsong(index: number): Promise<void> {
  const store = useFormatStore.getState();
  const subsongs = store.nativeSubsongs;
  if (!subsongs || index < 0 || index >= subsongs.count || index === subsongs.current) return;
  const { useTransportStore } = await import('@stores/useTransportStore');
  if (useTransportStore.getState().isPlaying) {
    const { runningEngineInstance } = await import('./NativeEngineRouting');
    const instance = await runningEngineInstance(subsongs.engine);
    if (isSubsongPlayer(instance)) {
      await instance.playSubsong(index);
      return;
    }
  }
  store.reportNativeSubsongs({ ...subsongs, current: index });
}
