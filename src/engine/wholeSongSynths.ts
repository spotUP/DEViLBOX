/**
 * Which synths play a whole song by themselves.
 *
 * These are native replayers: the WASM engine owns the pattern data, the
 * channel mixing and the per-channel volumes, and DEViLBOX's tracker grid is a
 * VIEW of what the replayer is doing rather than a set of instructions to it.
 * One synth instance is shared by every channel of the song, and its output
 * GainNode carries the entire mix.
 *
 * That makes them the wrong target for anything derived from a single pattern
 * cell. Measured 2026-09-22 on jennipha.ahx: `AutomationPlayer` read channel
 * 1's volume column at row 0x2E and called `HivelySynth.set('volume', 0)`,
 * which is `output.gain.value = 0` — the whole song, silenced from one
 * channel's cell, with nothing to restore it. The transport kept running and
 * the replayer kept rendering, so every meter upstream of that node looked
 * healthy; the fault was invisible until the room went quiet.
 *
 * This list is a leaf module on purpose: `AutomationPlayer` and the native
 * routing layer both need it, and importing the routing layer into the
 * automation path would pull the whole engine graph behind it.
 *
 * `NativeEngineRouting` asserts in its own tests that every engine it
 * registers appears here, so the two cannot drift apart.
 */
export const WHOLE_SONG_SYNTH_TYPES: ReadonlySet<string> = new Set([
  'ActionamicsWasmSynth', 'ActivisionProWasmSynth', 'ArtOfNoiseSynth', 'AsapSynth',
  'BenDaglishSynth', 'Cinter4Synth', 'CpsycleSynth', 'DavidWhittakerWasmSynth',
  'DeltaMusic1WasmSynth', 'DeltaMusic2WasmSynth', 'DigMugWasmSynth', 'DssWasmSynth',
  'EupminiSynth', 'FaceTheMusicWasmSynth', 'FmplayerSynth', 'FredEditorReplayerSynth',
  'FredReplayerWasmSynth2', 'FutureComposerWasmSynth', 'FuturePlayerSynth',
  'HippelSynth', 'HivelySynth', 'InStereo1WasmSynth', 'InStereo2WasmSynth',
  'IxalanceSynth', 'JamCrackerSynth', 'KlysSynth', 'MaxTraxSynth', 'MdxminiSynth',
  'MusicAssemblerSynth', 'MusicLineSynth', 'OktalyzerWasmSynth', 'OrganyaSynth',
  'PmdminiSynth', 'PreTrackerSynth', 'PumaTrackerSynth', 'PxtoneSynth', 'QsfSynth',
  'QuadraComposerWasmSynth', 'RonKlarenWasmSynth', 'SawteethSynth', 'Sc68Synth',
  'SidMon1Synth', 'SidMon2Synth', 'SonicArrangerWasmSynth', 'SonixSynth',
  'SoundControlWasmSynth', 'SoundFactory2WasmSynth', 'SoundMonWasmSynth',
  'SteveTurnerSynth', 'SunTronicSongSynth', 'SynthesisWasmSynth', 'TFMXModuleSynth',
  'UADEEditableSynth', 'V2MSynth', 'ZxtuneSynth', 'AyletSynth', 'PiyoPiyoSynth',
  'TFMSynth',
  // Routed alongside the WASM engine registry but defined elsewhere.
  'UADESynth', 'SunVoxSynth', 'SunVoxModular',
  // Symphonie and the C64 engines are whole-song replayers too; they reach the
  // automation path through the same shared-instance rule.
  'SymphonieSynth', 'C64SID',
]);

/** Does this synth type render a complete song on its own? */
export function isWholeSongSynth(synthType: string | null | undefined): boolean {
  return !!synthType && WHOLE_SONG_SYNTH_TYPES.has(synthType);
}
