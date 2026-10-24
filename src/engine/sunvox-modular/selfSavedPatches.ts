/**
 * Patch bytes a live SunVox instrument saved from its own handle.
 *
 * A SunVox instrument stores its graph as `config.sunvox.patchData` (the
 * sv_save_to_memory bytes of its handle). When the live synth writes those
 * bytes back into the instrument store after an edit, the store must not
 * rebuild the synth from them: the handle already is that patch. The store
 * asks here; only the synth that saved a buffer registers it.
 */
const selfSaved = new WeakSet<ArrayBuffer>();

export function markSelfSavedSunVoxPatch(bytes: ArrayBuffer): void {
  selfSaved.add(bytes);
}

export function isSelfSavedSunVoxPatch(bytes: unknown): boolean {
  return bytes instanceof ArrayBuffer && selfSaved.has(bytes);
}
