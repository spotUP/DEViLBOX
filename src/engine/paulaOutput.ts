/**
 * Which synth engines hand over raw Paula output, unfiltered.
 *
 * Every Amiga 500 put an analog RC filter between Paula's DAC and the audio
 * jacks. It was not optional — every piece of Amiga music anyone ever heard
 * through real hardware was coloured by it: a fixed ~4.4 kHz 6 dB/octave
 * roll-off, plus the switchable ~3.1 kHz "LED" stage.
 *
 * DEViLBOX owns a 1:1 emulation of it (`effects/AmigaFilter.ts`, from
 * ProTracker 2.3D's `pt2_rcfilters.c`) and puts it on the TRACKER path only.
 * The synth bus deliberately bypasses it, and the manual says why: "WASM chip
 * engines like Furnace and UADE already emulate their own hardware filters
 * internally."
 *
 * True of Furnace and UADE. FALSE of the in-house Amiga replayers, and
 * measurably so. Surveyed 2026-09-24: 48 `*-wasm/src/*.c` mixers carry Amiga
 * period/clock maths and NOT ONE filters its output. `deltamusic1.c:957` is
 * the shape they share —
 *
 *     uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
 *     float sample = (float)c->ch_sample_data[pos] / 128.0f;
 *
 * nearest-neighbour lookup, no interpolation, no band-limiting, summed
 * straight out. A 48-second capture of `delta-music/triplex1.dm` measured
 * 27537 one-sample jumps over 0.3 full scale (~570 per second) and 2.05 % of
 * its energy above 8 kHz, with content to 24 kHz. On real hardware none of
 * that survives. The owner heard it as "delta music has clicky synths".
 *
 * So the fix is not forty copies of one RC filter in forty C files. It is to
 * stop routing these engines as though something had already filtered them.
 */

/**
 * Synth types whose engine emulates Paula and does NOT filter its own output.
 *
 * Membership is evidence, not vibes: a synth belongs here when its engine's C
 * mixer does Amiga period playback and contains no filter stage. Engines that
 * DO filter — UADE, which runs the real replayer through its own Paula
 * emulation, and Furnace, which models each chip's output stage — are
 * deliberately absent and must stay absent, or their audio is filtered twice.
 *
 * Non-Amiga chips are absent for the same reason: a SID, an AY, a YM2612 or a
 * PC-98 OPN never went through an Amiga's output stage, so applying one is a
 * colour nobody's hardware ever had.
 */
export const PAULA_SYNTH_TYPES: ReadonlySet<string> = new Set([
  'ActionamicsWasmSynth',
  'ActivisionProWasmSynth',
  'ArtOfNoiseSynth',
  'BenDaglishSynth',
  'Cinter4Synth',
  'DavidWhittakerWasmSynth',
  'DeltaMusic1WasmSynth',
  'DeltaMusic2WasmSynth',
  'DigMugWasmSynth',
  'DssWasmSynth',
  'FaceTheMusicWasmSynth',
  'FredEditorReplayerSynth',
  'FredReplayerWasmSynth2',
  'FutureComposerWasmSynth',
  'FuturePlayerSynth',
  'HippelSynth',
  'InStereo1WasmSynth',
  'InStereo2WasmSynth',
  'JamCrackerSynth',
  'MaxTraxSynth',
  'MusicAssemblerSynth',
  'MusicLineSynth',
  // MusicMaker.worklet.js: nearest-sample Paula playback, no output stage.
  // Against UADE's MusicMaker players it measured +8 dB above 10 kHz and
  // within 1-2 dB below 6 kHz (2026-10-05).
  'MusicMakerSynth',
  'OktalyzerWasmSynth',
  'PreTrackerSynth',
  'PumaTrackerSynth',
  'QuadraComposerWasmSynth',
  'RonKlarenWasmSynth',
  'SidMon1Synth',
  'SidMon2Synth',
  'SonicArrangerWasmSynth',
  'SonixSynth',
  'SoundControlWasmSynth',
  'SoundFactory2WasmSynth',
  'SoundMonWasmSynth',
  'SteveTurnerSynth',
  'SunTronicSongSynth',
  'SynthesisWasmSynth',
  'TFMXModuleSynth',
]);

/** Does this synth need the Amiga output stage applied for it? */
export function needsPaulaOutputStage(synthType: string | undefined): boolean {
  return !!synthType && PAULA_SYNTH_TYPES.has(synthType);
}
