/**
 * UpRoughSoftsynth: a tracker instrument that plays one Up Rough voice (808 bass, piano, a drum).
 * Each note is rendered whole by the voice's pure render function at SOFTSYNTH_RATE, cached per
 * (voice, params, seed, midi, duration, velocity) as an AudioBuffer and played through a BufferSource
 * into `output`. The buffer's own rate is 22050 Hz; the context resamples. The cache is shared by every
 * instance (one per tracker channel), and `warmUp` fills it with the song's notes at load, so a trigger
 * starts a cached buffer and no render runs on the trigger path.
 */
import type { DevilboxSynth } from '@/types/synth';
import type { UpRoughSoftsynthConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { DEVILBOX_TO_HOST_MIDI, SOFTSYNTH_RATE, voiceDefaults, type SoftsynthVoice } from './softsynthVoice';
import { getSoftsynthVoice, SOFTSYNTH_VOICES } from './voiceRegistry';
import { recordNoteTrigger } from '@/engine/debug/noteTriggerLog';

const CACHE_MAX = 512;
const NATURAL_DUR_SEC = 2;
const RELEASE_FADE_SEC = 0.05;
/** Voices whose tail a note-off cuts; drums ring out. */
const RELEASABLE = new Set(['bass808', 'piano', 'bassSampled', 'bassElectric', 'bassWarmsub', 'bassGfunk', 'bassElectro', 'bassReese', 'bassVoice808']);

let renderCount = 0;
/** Sentinel: number of actual voice renders (cache hits excluded). */
export function softsynthRenderCount(): number { return renderCount; }
export function resetSoftsynthRenderCount(): void { renderCount = 0; }

interface Playing { src: AudioBufferSourceNode; gain: GainNode }

/** Rendered notes, least recently used first. Module-level: every instance of a voice shares them. */
const cache = new Map<string, AudioBuffer>();

export class UpRoughSoftsynth implements DevilboxSynth {
  readonly name = 'UpRoughSoftsynth';
  readonly output: GainNode;

  private ctx: AudioContext;
  private voiceId: string;
  private params: Record<string, number>;
  private seed: number;
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

  /** The tracker note (DEViLBOX MIDI, C-4 = 60) as the host's number (C-4 = 48), the only note conversion. */
  private midiOf(note: string | number): number {
    const midi = typeof note === 'number' && Number.isInteger(note) && note >= 0 && note <= 127 ? note : noteToMidi(note);
    return midi - DEVILBOX_TO_HOST_MIDI;
  }

  private merged(): Record<string, number> {
    return { ...voiceDefaults(this.voice()), ...this.params };
  }

  private render(midi: number, durSec: number, velocity: number): AudioBuffer {
    const voice = this.voice();
    const merged = this.merged();
    // Humanize on: every trigger is a new hit (counter -> seed and cache key, see humanize.ts); off: one render per key.
    if ((merged.humanize ?? 0) > 0) merged.hit = this.hitCounter++;
    const key = `${voice.id}|${JSON.stringify(merged)}|${this.seed}|${midi}|${durSec}|${velocity}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    renderCount++;
    const samples = voice.render(merged, { midi, durSec, velocity }, SOFTSYNTH_RATE, this.seed);
    const buf = this.ctx.createBuffer(1, Math.max(1, samples.length), SOFTSYNTH_RATE);
    buf.copyToChannel(Float32Array.from(samples), 0);
    cache.set(key, buf);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return buf;
  }

  /**
   * Render the song's notes now, at the length and velocity a tracker note triggers with, so the
   * trigger finds them cached. Silent: nothing is played. A humanized voice renders a new hit per
   * trigger, so there is nothing to render ahead for it.
   */
  warmUp(notes?: readonly string[]): void {
    if (!notes || (this.merged().humanize ?? 0) > 0) return;
    for (const note of notes) this.render(this.midiOf(note), NATURAL_DUR_SEC, 1);
  }

  private play(note: string | number, durSec: number, time: number | undefined, velocity: number): void {
    const buf = this.render(this.midiOf(note), durSec, velocity);
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
    const startAt = time ?? this.ctx.currentTime;
    // Voice-level entry: the scheduled start beside the clock, so a late or repeated start shows up next to
    // the ToneEngine.triggerNote entry that asked for it.
    recordNoteTrigger(`UpRoughSoftsynth.start ${this.voiceId} at=${startAt.toFixed(4)} now=${this.ctx.currentTime.toFixed(4)}`, -1, String(note));
    src.start(startAt);
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
    this.output.disconnect();
  }
}
