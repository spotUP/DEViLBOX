/**
 * Which instruments hybrid playback fires through ToneEngine.
 *
 * When a whole-song engine drives playback (libopenmpt, UADE, Hively, the
 * Furnace WASM sequencer…), its position callbacks also fire ToneEngine notes
 * for "replaced" instruments — ones the user swapped for a DEViLBOX synth —
 * so the swapped sound plays over the engine's own. Anything the engine
 * already plays must NOT be in that set, or every note is played twice.
 *
 * The Furnace sequencer was missing from this rule: its instruments are
 * FurnaceOPN, FurnacePSG and the like, not Sampler/Player and not a known
 * whole-player type, so every instrument of every Furnace song counted as
 * replaced. Each note then went out twice — once from the sequencer and once
 * through the instrument's own synth, with a forced instrument, full volume
 * and its own pitch rounding — on the same chip channel: detuned, retriggered,
 * one voice apparently broken.
 */
import { moduleIns2Of } from '@engine/furnace-dispatch/ins2Uploads';
import type { InstrumentConfig } from '@typedefs/instrument';

/** Synth types a whole-song player drives internally through its own engine. */
export const NATIVE_WHOLE_PLAYER_TYPES: ReadonlySet<string> = new Set([
  'HivelySynth', 'UADESynth', 'UADEEditableSynth', 'SymphonieSynth',
  'MusicLineSynth', 'JamCrackerSynth', 'MaxTraxSynth', 'PreTrackerSynth', 'FuturePlayerSynth',
  'TFMXSynth', 'FCSynth', 'C64SID',
  // OPL3: AdPlug streaming player handles audio when adplugFileData is present.
  // The replayer displays patterns and follows position — same as UADE editable.
  'OPL3',
  // WASM player-pool synths — each has a fixed-size pool, must dedup
  'SoundMonSynth', 'SidMonSynth', 'SidMon1Synth', 'DigMugSynth',
  'FredSynth', 'FredEditorReplayerSynth', 'OctaMEDSynth',
  'HippelCoSoSynth', 'RobHubbardSynth', 'SteveTurnerSynth',
  'DavidWhittakerSynth', 'SonicArrangerSynth',
  'InStereo2Synth', 'InStereo1Synth', 'StartrekkerAMSynth',
  'DeltaMusic1Synth', 'DeltaMusic2Synth',
]);

/**
 * Is this instrument one hybrid playback must fire itself?
 *
 * `furnaceSequencer` — the song is played by the Furnace WASM sequencer
 * (it carries `furnaceNative`). The sequencer plays every instrument that
 * still carries its module's INS2; one the user swapped for another synth
 * no longer does, and stays hybrid.
 */
export function isReplacedInstrument(inst: InstrumentConfig, furnaceSequencer: boolean): boolean {
  if (inst.synthType === 'Sampler' || inst.synthType === 'Player') return false;
  if (NATIVE_WHOLE_PLAYER_TYPES.has(inst.synthType || '')) return false;
  if (furnaceSequencer && moduleIns2Of(inst) !== null) return false;
  return true;
}
