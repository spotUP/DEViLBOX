/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 808 / 909 drum machines as a playable instrument: one class parameterised by kit.
 * Each MIDI note maps to a drum voice (see rebirthDrumLayout.ts); every hit is scheduled as its
 * own short-lived Web Audio graph (rebirthDrumVoices.ts), so the synth is polyphonic.
 * Accent (the trigger's accent flag) boosts the hit by the Accent Level knob.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import {
  drumKitDefaults, drumNoteMap, drumParamKey, REBIRTH_LAYOUTS, type DrumKitId,
} from './rebirthDrumLayout';
import { playHit, R808, R909, type DrumKitState, type KitVoice } from './rebirthDrumVoices';

const VOICES: Record<DrumKitId, Record<string, KitVoice>> = { '808': R808, '909': R909 };
/** Accent depth per kit (engine.js AC_DEPTH): gain = 1 + accentLevel * depth. */
const AC_DEPTH: Record<DrumKitId, number> = { '808': 0.8, '909': 6 };
/** Fixed input gain of the drum channel (engine.js INPUT_GAIN r808 / r909), part of the voice calibration. */
const INPUT_GAIN = 0.55;

export type ReBirthDrumParams = Record<string, number>;

export class ReBirthDrumSynth implements DevilboxSynth {
  readonly name: 'ReRebirth808' | 'ReRebirth909';
  readonly output: GainNode;

  private readonly kit: DrumKitId;
  private readonly ctx: BaseAudioContext;
  private readonly noise: AudioBuffer;
  private readonly kitState: DrumKitState = { openHat: null };
  private readonly notes: Map<number, string>;
  private params: ReBirthDrumParams;
  private disposed = false;

  constructor(kit: DrumKitId, config: object = {}, context?: BaseAudioContext) {
    this.kit = kit;
    this.name = kit === '808' ? 'ReRebirth808' : 'ReRebirth909';
    const ctx = context ?? getDevilboxAudioContext();
    this.ctx = ctx;
    this.notes = drumNoteMap(REBIRTH_LAYOUTS[kit]);
    this.params = { ...drumKitDefaults(REBIRTH_LAYOUTS[kit]) };
    this.applyConfig(config);
    this.output = ctx.createGain();
    this.output.gain.value = INPUT_GAIN;
    // The source runs channels in stereo from the input on (engine.js).
    this.output.channelCount = 2;
    this.output.channelCountMode = 'explicit';
    // 2 s of white noise shared by every hit of this synth.
    const len = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Apply a partial config (knob moves). Non-numeric and unknown fields are ignored. */
  applyConfig(config: object): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number' && key in this.params) this.params[key] = value;
    }
  }

  set(param: string, value: number): void {
    this.applyConfig({ [param]: value });
  }

  get(param: string): number | undefined {
    return this.params[param];
  }

  triggerAttack(note: string | number, time?: number, _velocity?: number, accent = false): void {
    if (this.disposed) return;
    const midi = typeof note === 'number' ? note : noteToMidi(note);
    const voiceId = this.notes.get(midi);
    if (!voiceId) return;
    const kv = VOICES[this.kit][voiceId];
    if (!kv) return;
    const t = time ?? this.ctx.currentTime;
    const p = this.params;
    const acc = accent ? 1 + (p[drumParamKey('ac', 'level')] ?? 0) * AC_DEPTH[this.kit] : 1;
    playHit(kv.voice, this.ctx, this.output, this.noise, this.kitState, t, acc, (key) => p[drumParamKey(kv.group, key)] ?? 0);
  }

  /** Drum hits are one-shots: release does nothing. */
  triggerRelease(_note?: string | number, _time?: number): void {}

  releaseAll(): void {}

  dispose(): void {
    this.disposed = true;
    this.output.disconnect();
  }
}
