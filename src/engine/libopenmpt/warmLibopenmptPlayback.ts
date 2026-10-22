/**
 * Warm the libopenmpt playback path when a song is opened, not when it is
 * first played.
 *
 * A song that plays through libopenmpt (a MOD / XM / IT, or a .dbx whose
 * instruments are driven by the empty XM TrackerReplayer.play() builds) used
 * to pay three one-time costs inside the first play() after a page load, all
 * before the first row: the OpenMPTSoundlib script + WASM compile (~370 ms,
 * for the empty-XM build), the libopenmpt AudioWorklet addModule + engine
 * node (~77 ms, and the worklet's own libopenmpt warm-up runs on the audio
 * thread right then), and the SynthEffectProcessor chunk (~47 ms). Row 1 came
 * ~500 ms late on the first play only (findings doc 2026-10-15_dx7-double,
 * "First-play 500 ms delay"). Every step below is cached by its owner, so
 * play() then awaits work that is already done.
 *
 * A song without module data also builds its module on every play()
 * (OpenMPTEditBridge.createModuleForSong); the first build after a page load
 * held the main thread ~60-80 ms inside createNewModule, so the first notes of
 * the first play stuttered on every synth (2026-10-23). One throw-away build
 * at open pays that cost here.
 */

/** The song fields that decide how it plays (applySong's SongEngineData). */
export type LibopenmptRoutingFields = {
  libopenmptFileData?: ArrayBuffer;
  furnaceNative?: unknown;
  nativeSamplePlayback?: boolean;
} & { [field: string]: unknown };

/** A field carrying a song for a native engine other than libopenmpt. */
const NATIVE_PAYLOAD_FIELD = /(FileData|Native|StoreData)$|^goatTrackerData$/;

/**
 * Whether play() will route this song through libopenmpt: it has module data,
 * or it carries no other engine's song (the empty-XM path in
 * TrackerReplayer.play() for instrument-level songs).
 */
export function routesThroughLibopenmpt(song: LibopenmptRoutingFields): boolean {
  if (song.libopenmptFileData) return true;
  if (song.nativeSamplePlayback) return false;
  for (const [field, value] of Object.entries(song)) {
    if (value != null && field !== 'libopenmptFileData' && NATIVE_PAYLOAD_FIELD.test(field)) return false;
  }
  return true;
}

/** Start the one-time libopenmpt work now; play() awaits the same cached promises. */
export async function warmLibopenmptPlayback(song: LibopenmptRoutingFields): Promise<void> {
  try {
    const [osl, { LibopenmptEngine }, bridge] = await Promise.all([
      import('@lib/import/wasm/OpenMPTSoundlib'),
      import('@engine/libopenmpt/LibopenmptEngine'),
      import('@engine/libopenmpt/OpenMPTEditBridge'),
      import('@engine/replayer/SynthEffectProcessor'),
    ]);
    await Promise.all([osl.preloadSoundlib(), LibopenmptEngine.getInstance().ready()]);
    // A song with module data plays that module; only the empty-XM path builds one.
    if (!song.libopenmptFileData) await bridge.warmModuleBuild();
  } catch (err) {
    // play() still does the same work itself, so a failed warm-up only costs time.
    console.warn('[warmLibopenmptPlayback] warm-up failed:', err);
  }
}
