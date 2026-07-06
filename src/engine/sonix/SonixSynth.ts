/**
 * SonixSynth — first-class Sonix synth voice.
 *
 * The editor audition now renders ONE note through the REAL Sonix synth path
 * (blend/ring + 64-band envelope-swept filter + volume/pitch envelope) via the
 * WASM `sonix_render_synth_note` entry (see SonixAuditionModule), so every knob
 * audibly changes the preview. The rendered ~1.5 s note is cached as an
 * AudioBuffer at a reference pitch and repitched per trigger via playbackRate.
 *
 * Robustness: the WASM render is async (module load) and can fail; the voice
 * always keeps a synchronous base-waveform buffer as an immediate fallback so
 * the editor never blocks or crashes. When the faithful WASM buffer arrives it
 * replaces the fallback and any held note re-triggers so the change is heard.
 *
 * Live sync: applyConfig also pushes edited params into the running SONG engine
 * (SonixEngine.setSynthParams; set_wave rebuilds the filter bank) exactly like
 * Cinter4's live buffer swap, so song playback morphs with knob moves too.
 *
 * Params live in config.parameters.sonix (readSonixSynthParams), mirrored from
 * the WASM by the param bridge.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { InstrumentConfig } from '@typedefs/instrument';
import { getDevilboxAudioContext, audioNow, noteToFrequency } from '@/utils/audio-context';
import { readSonixSynthParams } from './sonixInstrument';
import { SonixEngine, type SonixSynthParams } from './SonixEngine';
import { renderSonixNote } from './SonixAuditionModule';

const BASE_NOTE = 'C3';
const WAVE_LEN = 128;
// Reference MIDI note the WASM buffer is rendered at; triggers repitch from here.
const REFERENCE_MIDI = 60;
const RENDER_SECONDS = 1.5;
const RENDER_VELOCITY = 200; // near-max; per-trigger velocity scales playback gain
// Makeup gain: the WASM render is at Paula per-channel DAC scale (~0.06 peak);
// lift it to a comfortable audition level without clipping.
const AUDITION_GAIN = 6;

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  playbackRate: number;
  gainVal: number;
}

export class SonixSynth implements DevilboxSynth {
  readonly name = 'SonixSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();

  private ctx: AudioContext;
  private volNode: GainNode;
  private buffer: AudioBuffer | null = null;
  /** True once buffer holds the faithful WASM render (vs the fallback loop). */
  private bufferIsWasm = false;
  private baseFreq: number;
  private waveSampleRate = 32000;
  private active = new Set<ActiveVoice>();
  /** Bumped on every re-render so a stale async render result is discarded. */
  private renderToken = 0;

  constructor(config: InstrumentConfig) {
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
    this.baseFreq = noteToFrequency(REFERENCE_MIDI) || noteToFrequency(BASE_NOTE) || 130.81;
    this.renderFromConfig(config);
  }

  /**
   * Build the immediate base-waveform fallback buffer, then kick off the
   * faithful WASM render which replaces it when ready.
   */
  private renderFromConfig(config: InstrumentConfig): void {
    const p = readSonixSynthParams(config);
    this.buildFallbackBuffer(p);
    this.renderWasm(p);
  }

  /** Single-cycle looping buffer from the raw 128-byte base waveform (fallback). */
  private buildFallbackBuffer(p: SonixSynthParams | null): void {
    if (!p || !p.wave || p.wave.length < WAVE_LEN) {
      if (!this.bufferIsWasm) this.buffer = null;
      return;
    }
    // 128 samples = one cycle at the reference pitch → loop rate.
    this.waveSampleRate = Math.max(3000, Math.min(192000, Math.round(WAVE_LEN * this.baseFreq)));
    const buf = this.ctx.createBuffer(1, WAVE_LEN, this.waveSampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < WAVE_LEN; i++) data[i] = p.wave[i] / 128; // 8-bit signed → -1..1
    // Only install the fallback if we don't already have a faithful WASM buffer.
    if (!this.bufferIsWasm) {
      this.buffer = buf;
      this.bufferIsWasm = false;
    }
  }

  /** Render the note through the real Sonix synth path and swap it in. */
  private renderWasm(p: SonixSynthParams | null): void {
    if (!p) return;
    const token = ++this.renderToken;
    const sampleRate = this.ctx.sampleRate;
    const frames = Math.round(RENDER_SECONDS * sampleRate);
    void renderSonixNote({ params: p, note: REFERENCE_MIDI, velocity: RENDER_VELOCITY, sampleRate, frames })
      .then((pcm) => {
        // Discard if a newer render started or the voice was disposed.
        if (token !== this.renderToken || !pcm || pcm.length === 0) return;
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) {
          const a = pcm[i] < 0 ? -pcm[i] : pcm[i];
          if (a > peak) peak = a;
        }
        console.info(
          '[SonixSynth] render baseVol=%d filterBase=%d c2=%d wave0=%d envScan=%d → peak=%s',
          p.baseVol, p.filterBase, p.c2, p.wave?.[0], p.envScanRate, peak.toFixed(4),
        );
        if (peak <= 0) return; // silent render → keep fallback
        const buf = this.ctx.createBuffer(1, pcm.length, sampleRate);
        buf.getChannelData(0).set(pcm);
        this.buffer = buf;
        if (!this.bufferIsWasm) console.info('[SonixSynth] faithful WASM audition active (knobs live)');
        this.bufferIsWasm = true;
        this.retriggerHeldVoices();
      })
      .catch(() => {
        /* keep fallback */
      });
  }

  private playbackRateFor(note?: string | number): number {
    if (note === undefined) return 1;
    const hz = noteToFrequency(note);
    return hz > 0 && this.baseFreq > 0 ? hz / this.baseFreq : 1;
  }

  private startVoice(playbackRate: number, gainVal: number, time: number): void {
    if (!this.buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = playbackRate;
    if (this.bufferIsWasm) {
      // The buffer is a full ~1.5 s note (attack → sweep → tail). Looping the WHOLE
      // buffer re-plays the attack every cycle and pulses into a "beep". Loop only the
      // developed SUSTAIN window (past the attack, before the tail) so held keys hold
      // the actual timbre. The attack still plays once from t=0 before the loop point.
      const dur = this.buffer.length / this.buffer.sampleRate;
      src.loop = true;
      src.loopStart = Math.min(dur * 0.35, dur - 0.05);
      src.loopEnd = Math.max(src.loopStart + 0.02, dur * 0.85);
    } else {
      // Single-cycle fallback: loop one cycle for a continuous tone.
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = WAVE_LEN / this.waveSampleRate;
    }
    const gain = this.ctx.createGain();
    const g = gainVal * (this.bufferIsWasm ? AUDITION_GAIN : 1);
    gain.gain.value = g;
    src.connect(gain);
    gain.connect(this.volNode);
    const voice: ActiveVoice = { src, gain, playbackRate, gainVal };
    this.active.add(voice);
    src.start(time);
  }

  private cleanup(voice: ActiveVoice): void {
    if (!this.active.has(voice)) return;
    this.active.delete(voice);
    try {
      voice.src.disconnect();
      voice.gain.disconnect();
    } catch {
      /* already gone */
    }
  }

  private stopActiveVoices(t: number, fadeSec: number): void {
    for (const voice of [...this.active]) {
      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
        voice.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
        voice.src.stop(t + fadeSec + 0.005);
      } catch {
        /* already stopped */
      }
      const v = voice;
      v.src.onended = () => {
        this.cleanup(v);
      };
    }
  }

  /** Swap the current buffer into any held voices (short crossfade). */
  private retriggerHeldVoices(): void {
    if (!this.buffer || this.active.size === 0) return;
    const t = audioNow();
    for (const voice of [...this.active]) {
      const { playbackRate, gainVal } = voice;
      try {
        voice.src.stop(t);
      } catch {
        /* ok */
      }
      this.cleanup(voice);
      this.startVoice(playbackRate, gainVal, t);
    }
  }

  triggerAttack(note?: string | number, time?: number, velocity = 1): void {
    const t = time ?? audioNow();
    // Sonix is a monophonic Paula voice: a new attack cuts the previous note.
    this.stopActiveVoices(t, 0.004);
    this.startVoice(this.playbackRateFor(note), Math.max(0, Math.min(1, velocity)), t);
  }

  triggerRelease(_note?: string | number, time?: number): void {
    this.stopActiveVoices(time ?? audioNow(), 0.03);
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
   * Live edit: re-render the audition buffer (WASM, param-accurate), swap it into
   * held voices, and push the edited params into the running WASM engine so SONG
   * playback morphs too.
   */
  applyConfig(config: InstrumentConfig): void {
    const p = readSonixSynthParams(config);
    // Re-render through the WASM synth with the edited params. Keep the CURRENT buffer
    // playing until the new render lands — renderWasm swaps it in and retriggers held
    // voices on completion. Dropping to the base-waveform fallback here (as before) made
    // every edit stutter through the raw tone, masking the param-accurate render.
    if (!this.buffer) this.buildFallbackBuffer(p); // only if we have nothing to play yet
    this.renderWasm(p);
    // Sync the live WASM instrument so the playing song reflects the edit.
    if (p && SonixEngine.hasInstance()) {
      try {
        SonixEngine.getInstance().setSynthParams(p);
      } catch {
        /* engine busy */
      }
    }
  }

  updateConfig(config: InstrumentConfig): void {
    this.applyConfig(config);
  }

  dispose(): void {
    this.renderToken++; // discard any in-flight render
    for (const voice of [...this.active]) {
      try {
        voice.src.stop();
      } catch {
        /* ok */
      }
      this.cleanup(voice);
    }
    this.volNode.disconnect();
    this.buffer = null;
  }

  get volume(): AudioParam {
    return this.volNode.gain;
  }
}
