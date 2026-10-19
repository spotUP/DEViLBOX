/**
 * UpRoughSoftsynth: a tracker instrument that plays one Up Rough voice (808 bass, piano, a drum).
 * Each note is rendered whole by the voice's pure render function at SOFTSYNTH_RATE, cached per
 * (voice, params, seed, midi, duration, velocity), copied into an AudioBuffer and played through a
 * BufferSource into `output`. The buffer's own rate is 22050 Hz; the context resamples.
 */
import type { DevilboxSynth } from '@/types/synth';
import type { UpRoughSoftsynthConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SOFTSYNTH_RATE, voiceDefaults, type SoftsynthVoice } from './softsynthVoice';
import { getSoftsynthVoice, SOFTSYNTH_VOICES } from './voiceRegistry';

const CACHE_MAX = 256;
const NATURAL_DUR_SEC = 2;
const RELEASE_FADE_SEC = 0.05;
/** Voices whose tail a note-off cuts; drums ring out. */
const RELEASABLE = new Set(['bass808', 'piano']);

let renderCount = 0;
/** Sentinel: number of actual voice renders (cache hits excluded). */
export function softsynthRenderCount(): number { return renderCount; }
export function resetSoftsynthRenderCount(): void { renderCount = 0; }

interface Playing { src: AudioBufferSourceNode; gain: GainNode }

export class UpRoughSoftsynth implements DevilboxSynth {
  readonly name = 'UpRoughSoftsynth';
  readonly output: GainNode;

  private ctx: AudioContext;
  private voiceId: string;
  private params: Record<string, number>;
  private seed: number;
  private cache = new Map<string, Float64Array>();
  /** Triggers rendered with humanize on; folded into the humanize seed and the cache key so each hit differs. */
  private hitCounter = 0;
  private playing = new Set<Playing>();

  constructor(config: UpRoughSoftsynthConfig) {
    this.ctx = getDevilboxAudioContext();
    this.output = this.ctx.createGain();
    this.output.gain.value = 1;
    this.voiceId = config.voice;
    this.params = { ...config.params };
    this.seed = config.seed;
  }

  private voice(): SoftsynthVoice {
    const v = getSoftsynthVoice(this.voiceId) ?? SOFTSYNTH_VOICES[0]!;
    return v;
  }

  /** Replace voice/params/seed (live edit). A different voice with no params given resets to its defaults. */
  applyConfig(config: UpRoughSoftsynthConfig): void {
    this.voiceId = config.voice;
    this.params = { ...config.params };
    this.seed = config.seed;
  }

  private midiOf(note: string | number): number {
    if (typeof note === 'number' && Number.isInteger(note) && note >= 0 && note <= 127) return note;
    return noteToMidi(note);
  }

  private render(midi: number, durSec: number, velocity: number): Float64Array {
    const voice = this.voice();
    const merged: Record<string, number> = { ...voiceDefaults(voice), ...this.params };
    // Humanize on: every trigger is a new hit (counter -> seed and cache key, see humanize.ts); off: one render per key.
    if ((merged.humanize ?? 0) > 0) merged.hit = this.hitCounter++;
    const key = `${voice.id}|${JSON.stringify(merged)}|${this.seed}|${midi}|${durSec}|${velocity}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    renderCount++;
    const out = voice.render(merged, { midi, durSec, velocity }, SOFTSYNTH_RATE, this.seed);
    this.cache.set(key, out);
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
    return out;
  }

  private play(note: string | number, durSec: number, time: number | undefined, velocity: number): void {
    const samples = this.render(this.midiOf(note), durSec, velocity);
    const buf = this.ctx.createBuffer(1, Math.max(1, samples.length), SOFTSYNTH_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i]!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    src.connect(gain);
    gain.connect(this.output);
    const entry: Playing = { src, gain };
    this.playing.add(entry);
    src.onended = () => {
      this.playing.delete(entry);
      try { src.disconnect(); gain.disconnect(); } catch { /* already gone */ }
    };
    src.start(time ?? this.ctx.currentTime);
  }

  triggerAttack(note: string | number, time?: number, velocity = 1): void {
    this.play(note, NATURAL_DUR_SEC, time, velocity);
  }

  triggerAttackRelease(note: string | number, duration: number, time?: number, velocity = 1): void {
    this.play(note, duration, time, velocity);
  }

  triggerRelease(_note?: string | number, time?: number): void {
    if (!RELEASABLE.has(this.voiceId)) return;
    const t = time ?? this.ctx.currentTime;
    for (const { gain } of this.playing) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(1, t);
      gain.gain.linearRampToValueAtTime(0, t + RELEASE_FADE_SEC);
    }
  }

  set(param: string, value: number): void {
    if (param === 'seed') { this.seed = value; return; }
    if (param === 'voice') {
      const v = SOFTSYNTH_VOICES[Math.round(value)];
      if (v) { this.voiceId = v.id; this.params = voiceDefaults(v); }
      return;
    }
    this.params[param] = value;
  }

  get(param: string): number | undefined {
    if (param === 'seed') return this.seed;
    if (param === 'voice') return SOFTSYNTH_VOICES.findIndex((v) => v.id === this.voiceId);
    return this.params[param] ?? voiceDefaults(this.voice())[param];
  }

  dispose(): void {
    for (const { src, gain } of this.playing) {
      try { src.stop(); src.disconnect(); gain.disconnect(); } catch { /* already stopped */ }
    }
    this.playing.clear();
    this.cache.clear();
    this.output.disconnect();
  }
}
