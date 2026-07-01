/**
 * Cinter4Synth — first-class Cinter4 Amiga synth voice.
 *
 * Cinter is a rendered-sample synth: its 12 params bake a one-shot (optionally
 * looping) PCM waveform, which the Amiga plays back through Paula. So unlike a
 * live-oscillator synth, this voice renders a buffer from the params and plays it
 * via BufferSource, pitched per note — structurally like RadioRiser/SubSwell in
 * DubDerivedSynths (render a buffer, fire it on attack), but the buffer comes from
 * cinter4SynthCore instead of noise.
 *
 * Params live in `config.parameters` (cinter:1, p0..p11, lengthWords, replenWords,
 * version) — the single source of truth the editor and exporter already use
 * (readCinter4InstrumentParams). No parallel config type.
 *
 * `.cinter4` SONG replay does NOT use this voice — those songs play through the
 * WASM replayer with note-suppression (TrackerReplayer._suppressNotes), so these
 * per-instrument voices are never triggered during song playback. This voice is
 * for editor auditioning, harvested presets, and manual instrument use.
 *
 * Live editing: applyConfig re-renders the buffer and swaps it into any held
 * (looping) note in place, so knob moves are audible on a sustaining note.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { InstrumentConfig } from '@typedefs/instrument';
import { getDevilboxAudioContext, audioNow, noteToFrequency } from '@/utils/audio-context';
import { renderCinter4Sample } from './cinter4SynthCore';
import { readCinter4InstrumentParams, CINTER4_SAMPLE_RATE } from './cinter4Instrument';

/** Base note the rendered buffer is tuned to (matches the sample-bridge baseNote). */
const BASE_NOTE = 'C4';

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  playbackRate: number;
  looping: boolean;
}

export class Cinter4Synth implements DevilboxSynth {
  readonly name = 'Cinter4Synth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();

  private ctx: AudioContext;
  private volNode: GainNode;
  private buffer: AudioBuffer | null = null;
  private loopStart = 0;   // seconds
  private loopEnd = 0;     // seconds
  private looping = false;
  private baseFreq: number;
  private active = new Set<ActiveVoice>();

  constructor(config: InstrumentConfig) {
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
    this.baseFreq = noteToFrequency(BASE_NOTE) || 261.63;
    this.renderFromConfig(config);
  }

  /** Render the PCM buffer from the config's Cinter params (null params → silent). */
  private renderFromConfig(config: InstrumentConfig): void {
    const p = readCinter4InstrumentParams(config);
    if (!p || p.lengthWords <= 0) {
      this.buffer = null;
      this.looping = false;
      return;
    }
    const lengthSamples = Math.max(2, p.lengthWords * 2);
    const repeatStart = p.replenWords > 0 ? (p.lengthWords - p.replenWords) * 2 : null;
    const pcm = renderCinter4Sample(p.params, lengthSamples, repeatStart, p.version); // Int8Array

    const buf = this.ctx.createBuffer(1, lengthSamples, CINTER4_SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < lengthSamples; i++) data[i] = pcm[i] / 128; // 8-bit signed → -1..1

    this.buffer = buf;
    this.looping = repeatStart != null;
    this.loopStart = (repeatStart ?? 0) / CINTER4_SAMPLE_RATE;
    this.loopEnd = lengthSamples / CINTER4_SAMPLE_RATE;
  }

  private playbackRateFor(note?: string | number): number {
    if (note === undefined) return 1;
    const hz = noteToFrequency(note);
    return hz > 0 && this.baseFreq > 0 ? hz / this.baseFreq : 1;
  }

  /** Start a voice for `note`. Looping voices are tracked for live buffer swaps. */
  private startVoice(playbackRate: number, gainVal: number, time: number): ActiveVoice | null {
    if (!this.buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = playbackRate;
    if (this.looping) {
      src.loop = true;
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = gainVal;
    src.connect(gain);
    gain.connect(this.volNode);
    const voice: ActiveVoice = { src, gain, playbackRate, looping: this.looping };
    this.active.add(voice);
    src.start(time);
    if (!this.looping) {
      // One-shot: schedule cleanup after it plays out at this rate.
      const durSec = (this.buffer.length / CINTER4_SAMPLE_RATE) / playbackRate;
      src.stop(time + durSec + 0.02);
      src.onended = () => { this.cleanup(voice); };
    }
    return voice;
  }

  private cleanup(voice: ActiveVoice): void {
    if (!this.active.has(voice)) return;
    this.active.delete(voice);
    try { voice.src.disconnect(); voice.gain.disconnect(); } catch { /* already gone */ }
  }

  triggerAttack(note?: string | number, time?: number, velocity = 1): void {
    const t = time ?? audioNow();
    this.startVoice(this.playbackRateFor(note), Math.max(0, Math.min(1, velocity)), t);
  }

  triggerRelease(_note?: string | number, time?: number): void {
    const t = time ?? audioNow();
    // Fade + stop all voices (monophonic-ish auditioning; harmless if none).
    for (const voice of [...this.active]) {
      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
        voice.gain.gain.linearRampToValueAtTime(0, t + 0.03);
        voice.src.stop(t + 0.04);
      } catch { /* already stopped */ }
      const v = voice;
      v.src.onended = () => { this.cleanup(v); };
    }
  }

  triggerAttackRelease(note: string | number, duration: number, time?: number, velocity = 1): void {
    const t = time ?? audioNow();
    this.triggerAttack(note, t, velocity);
    this.triggerRelease(note, t + duration);
  }

  releaseAll(): void {
    this.triggerRelease(undefined, audioNow());
  }

  /**
   * Live parameter update: re-render the buffer and swap it into any HELD
   * (looping) voice so a sustaining note morphs as knobs move. One-shot voices
   * are transient and left to play out.
   */
  applyConfig(config: InstrumentConfig): void {
    this.renderFromConfig(config);
    if (!this.buffer) return;
    const t = audioNow();
    for (const voice of [...this.active]) {
      if (!voice.looping) continue;
      // Restart the looping voice with the new buffer at the same pitch/level.
      const gainVal = voice.gain.gain.value;
      try { voice.src.stop(t); } catch { /* ok */ }
      this.cleanup(voice);
      this.startVoice(voice.playbackRate, gainVal, t);
    }
  }

  /** Alias — updateNativeSynthConfig calls updateConfig; applyConfig is the impl. */
  updateConfig(config: InstrumentConfig): void {
    this.applyConfig(config);
  }

  dispose(): void {
    for (const voice of [...this.active]) {
      try { voice.src.stop(); } catch { /* ok */ }
      this.cleanup(voice);
    }
    this.volNode.disconnect();
    this.buffer = null;
  }

  get volume(): AudioParam { return this.volNode.gain; }
}
