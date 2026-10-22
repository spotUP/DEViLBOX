/**
 * Native (WASM / AudioWorklet) synths that get ONE INSTANCE PER TRACKER CHANNEL.
 *
 * Every type in `ToneEngine.getInstrument`'s shared list used to be keyed
 * `(instrumentId, -1)`: one instance per instrument, played by every channel,
 * with its effect chain ending in `synthBus`. The per-channel mixer strip
 * (volume, pan, mute, channel effects, strip filter) therefore never touched
 * native synth audio; mute only "worked" because the replayer skipped new
 * note-ons. Owner report 2026-10-18 (SYNTH-MUTE-SOLO): a song whose channels
 * all play TB303 / TR808 / V2 ignores the mixer.
 *
 * Types listed here are standalone: each instance owns its own worklet or
 * WASM module, so a second instance for a second channel is plain. Their
 * instances are keyed per tracker channel and their effect chain ends in the
 * channel's synth lane (`ToneEngine.getChannelSynthLane`), which feeds the strip.
 *
 * Some Tone-built graphs are listed too (DubSiren, SpaceLaser, Synare,
 * WobbleBass): one shared filter / filter envelope / LFO per instance, so a
 * shared instance let one channel's note-off cut another channel's note
 * (owner 2026-10-20, WobbleBass on two channels).
 *
 * NOT listed, on purpose:
 * - Pooled Amiga per-note replayers (`POOLED_NATIVE_SYNTH_TYPES`): one engine
 *   singleton per type with a fixed player-handle pool; per-channel instances
 *   would multiply handle use by channels and exhaust the pool. Shared in phase 1.
 * - Whole-song replayers (`WHOLE_SONG_SYNTH_TYPES`): one instance IS the song.
 * - `OPL3`: hard singleton with `setChannel`. `WAM`: one module per instance,
 *   too costly per channel. MAME / Furnace / Buzzmachine / VST bridge: one chip
 *   emulation per instrument; a second instance per channel is unconfirmed.
 *
 * Leaf module: `ToneEngine` and the tests both import it; nothing here may
 * import the engine.
 */
import type { SynthType } from '@/types/instrument/base';
import { LIVE_VOICE_BASE_CHANNEL } from './furnace-dispatch/chipChannel';

export const PER_CHANNEL_NATIVE_SYNTH_TYPES: ReadonlySet<SynthType> = new Set<SynthType>([
  'TB303', 'Buzz3o3', 'V2', 'V2Speech', 'Sam', 'DECtalk', 'PinkTrombone', 'DubSiren',
  'SpaceLaser', 'Synare', 'TR808', 'TR909', 'WaveSabreSynth', 'OidosSynth',
  'TunefishSynth', 'MdaEPiano', 'MdaJX10', 'MdaDX10', 'Amsynth', 'RaffoSynth', 'CalfMono',
  'SetBfree', 'SynthV1', 'TalNoizeMaker', 'Aeolus', 'FluidSynth', 'Sfizz', 'ZynAddSubFX',
  'Monique', 'VL1', 'DX7', 'OpenWurli', 'WobbleBass', 'UpRoughSoftsynth',
]);

/** Pooled Amiga per-note replayers: one engine singleton, fixed player pool. Shared across channels. */
export const POOLED_NATIVE_SYNTH_TYPES: ReadonlySet<SynthType> = new Set<SynthType>([
  'SonicArrangerSynth', 'InStereo2Synth', 'InStereo1Synth', 'SoundMonSynth', 'SidMonSynth',
  'DigMugSynth', 'DeltaMusic1Synth', 'DeltaMusic2Synth', 'FCSynth', 'TFMXSynth', 'FredSynth',
  'HippelCoSoSynth', 'RobHubbardSynth', 'HippelStSynth', 'StartrekkerAMSynth', 'OctaMEDSynth',
  'DavidWhittakerSynth', 'SunTronicSynth',
]);

export function isPerChannelNativeSynthType(synthType: string | undefined): boolean {
  return synthType !== undefined && PER_CHANNEL_NATIVE_SYNTH_TYPES.has(synthType as SynthType);
}

/**
 * The channels a song load creates instances of one instrument on.
 *
 * A per-channel native synth type gets one instance per tracker channel it
 * plays on (`used`, from `instrumentChannelUsage`). Anything else, and an
 * instrument that plays on no tracker channel, gets `[undefined]`: the single
 * shared instance under the `-1` key. Live-voice channels (100 and up) are
 * not tracker channels and never get a preloaded instance.
 */
export function perChannelInstanceChannels(
  synthType: string | undefined,
  used: ReadonlySet<number> | undefined,
): Array<number | undefined> {
  if (!isPerChannelNativeSynthType(synthType) || !used) return [undefined];
  const channels = [...used].filter((ch) => Number.isInteger(ch) && ch >= 0 && ch < LIVE_VOICE_BASE_CHANNEL).sort((a, b) => a - b);
  return channels.length > 0 ? channels : [undefined];
}
