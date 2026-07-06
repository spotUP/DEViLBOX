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
import { renderSonixNoteSync, warmSonixAudition } from './SonixAuditionModule';
import { findSustainLoop, applyLoopCrossfade, type SustainLoop } from './sonixLoop';
import { createTrailingThrottle, type TrailingThrottle } from '@/utils/trailingThrottle';

// Re-rendering a held note through the WASM synth costs ~10ms on the main thread. A knob
// drag fires batched edits ~60/sec; re-rendering on every one starves the audio callback
// and stutters the sustained note. Throttle the held-note re-render (leading + trailing)
// so at most ~1 render per interval runs while the final edit still applies.
const HELD_RERENDER_THROTTLE_MS = 70;

const BASE_NOTE = 'C3';
const WAVE_LEN = 128;
// Reference MIDI note the WASM buffer is rendered at; triggers repitch from here.
const REFERENCE_MIDI = 60;
// Long enough for the sustain loop to contain a full slow modulation cycle (see MAX_LOOP_SEC).
const RENDER_SECONDS = 3.5;
// A held key sustains by looping a short zero-crossing-aligned window at the settled tail
// of the render (findSustainLoop) — seamless, no swell jump or phase click.
const RENDER_VELOCITY = 200; // near-max; per-trigger velocity scales playback gain
// Makeup gain: the WASM render is at Paula per-channel DAC scale (~0.06 peak);
// lift it to a comfortable audition level without clipping.
const AUDITION_GAIN = 6;
// Faithful audition: render each note through the real Sonix synth (blend/ring + 64-band
// envelope-swept filter). Verified faithful vs song playback — filter/blend/EG knobs are
// audible live. baseVol is baked into the render, so it's NOT re-applied as voice gain
// for the WASM path (see startVoice). The base-waveform loop remains the sync fallback.
const USE_WASM_AUDITION = true;

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  note?: string | number;
  /** Target gain (velocity × AUDITION_GAIN) — reused when morphing the voice on an edit. */
  gainTarget: number;
}

// Crossfade time when morphing a held voice to freshly-rendered params (no attack restart).
const MORPH_FADE_SEC = 0.02;

export class SonixSynth implements DevilboxSynth {
  readonly name = 'SonixSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();

  private ctx: AudioContext;
  private volNode: GainNode;
  private baseFreq: number;
  private waveSampleRate = 32000;
  private active = new Set<ActiveVoice>();
  /** Voices fading out during a crossfade/stop — disconnected on their `ended` event. */
  private dying = new Set<ActiveVoice>();
  /** Latest synth params — every note renders synchronously from these (no stale cache). */
  private curParams: SonixSynthParams | null = null;
  /** Single-cycle base-waveform buffer — fallback until the WASM module is loaded. */
  private fallbackBuffer: AudioBuffer | null = null;
  /** Voice gain from baseVol (0..1) for the base-wave fallback. */
  private baseGain = 1;
  /** Rate-limited held-note re-render (see HELD_RERENDER_THROTTLE_MS). */
  private reRenderHeld: TrailingThrottle;

  constructor(config: InstrumentConfig) {
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
    this.baseFreq = noteToFrequency(REFERENCE_MIDI) || noteToFrequency(BASE_NOTE) || 130.81;
    this.reRenderHeld = createTrailingThrottle(
      () => this.morphHeldVoices(), HELD_RERENDER_THROTTLE_MS,
    );
    warmSonixAudition(); // preload the WASM so per-note sync render is ready when played
    this.setParams(config);
  }

  /** Update the live params + base-wave fallback from a config. */
  private setParams(config: InstrumentConfig): void {
    this.curParams = readSonixSynthParams(config);
    this.buildFallbackBuffer(this.curParams);
  }

  /** Single-cycle base-waveform buffer + baseGain (fallback when WASM isn't ready). */
  private buildFallbackBuffer(p: SonixSynthParams | null): void {
    if (!p || !p.wave || p.wave.length < WAVE_LEN) { this.fallbackBuffer = null; return; }
    this.baseGain = Math.max(0, Math.min(1, (p.baseVol ?? 128) / 255));
    this.waveSampleRate = Math.max(3000, Math.min(192000, Math.round(WAVE_LEN * this.baseFreq)));
    const buf = this.ctx.createBuffer(1, WAVE_LEN, this.waveSampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < WAVE_LEN; i++) data[i] = p.wave[i] / 128; // 8-bit signed → -1..1
    this.fallbackBuffer = buf;
  }

  private playbackRateFor(note?: string | number): number {
    if (note === undefined) return 1;
    const hz = noteToFrequency(note);
    return hz > 0 && this.baseFreq > 0 ? hz / this.baseFreq : 1;
  }

  /**
   * Build a playable AudioBuffer from a rendered note: find the sustain loop, crossfade its
   * seam, and copy the (possibly seam-smoothed) PCM into a buffer. Shared by attack + morph.
   */
  private buildLoopedBuffer(pcm: Float32Array, note?: string | number): { buf: AudioBuffer; loop: SustainLoop | null } {
    const sr = this.ctx.sampleRate;
    const loop = findSustainLoop(pcm, sr, noteToFrequency(note ?? BASE_NOTE) || this.baseFreq);
    if (loop) {
      applyLoopCrossfade(pcm, Math.round(loop.loopStartSec * sr), Math.round(loop.loopEndSec * sr), sr);
    }
    const buf = this.ctx.createBuffer(1, pcm.length, sr);
    buf.getChannelData(0).set(pcm);
    return { buf, loop };
  }

  /** MIDI note number for a note name/number (falls back to the reference note). */
  private midiOf(note?: string | number): number {
    if (typeof note === 'number') return note;
    if (typeof note === 'string') {
      const hz = noteToFrequency(note);
      if (hz > 0) return Math.round(69 + 12 * Math.log2(hz / 440));
    }
    return REFERENCE_MIDI;
  }

  /**
   * Start a buffer as one voice, tracking its note (+ target gain) for morphing on edits.
   * If loopStartSec is given, the voice loops [loopStartSec, loopEndSec ?? bufferEnd] so a
   * held key sustains; otherwise it plays once. `startOffsetSec` begins playback partway in
   * (used to skip the attack when morphing); `fadeInSec` ramps the gain up (crossfade in).
   */
  private startBuffer(
    buf: AudioBuffer, rate: number, gainVal: number,
    note: string | number | undefined, time: number,
    loopStartSec?: number, loopEndSec?: number,
    startOffsetSec = 0, fadeInSec = 0,
  ): ActiveVoice {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (loopStartSec !== undefined) {
      const dur = buf.length / buf.sampleRate;
      src.loop = true;
      src.loopStart = Math.max(0, Math.min(loopStartSec, dur - 0.01));
      src.loopEnd = loopEndSec !== undefined ? Math.min(loopEndSec, dur) : dur;
    }
    const gain = this.ctx.createGain();
    if (fadeInSec > 0) {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(gainVal, time + fadeInSec);
    } else {
      gain.gain.value = gainVal;
    }
    src.connect(gain);
    gain.connect(this.volNode);
    const voice: ActiveVoice = { src, gain, note, gainTarget: gainVal };
    this.active.add(voice);
    src.onended = () => this.disposeVoice(voice);
    src.start(time, startOffsetSec);
    return voice;
  }

  /** Disconnect + forget a voice (works whether it's active or dying). */
  private disposeVoice(voice: ActiveVoice): void {
    this.active.delete(voice);
    this.dying.delete(voice);
    try {
      voice.src.disconnect();
      voice.gain.disconnect();
    } catch {
      /* already gone */
    }
  }

  /** Fade a voice out over `fadeSec`, stop it, and retire it (moves active → dying). */
  private retireVoice(voice: ActiveVoice, t: number, fadeSec: number): void {
    this.active.delete(voice);
    this.dying.add(voice);
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
      voice.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
      voice.src.stop(t + fadeSec + 0.005);
    } catch {
      /* already stopped */
    }
    voice.src.onended = () => this.disposeVoice(voice);
  }

  private stopActiveVoices(t: number, fadeSec: number): void {
    for (const voice of [...this.active]) this.retireVoice(voice, t, fadeSec);
  }

  /**
   * Morph held notes to the CURRENT params after an edit WITHOUT restarting the attack:
   * render a fresh buffer, start it inside its sustain loop (skipping the attack) with a
   * short crossfade in, and fade the old voice out. This is what makes a knob drag audibly
   * sweep the sustained note instead of re-triggering it ~14×/sec (which stuttered).
   */
  private morphHeldVoices(): void {
    if (!USE_WASM_AUDITION || !this.curParams || this.active.size === 0) return;
    const sr = this.ctx.sampleRate;
    const frames = Math.round(RENDER_SECONDS * sr);
    const t = audioNow();
    for (const old of [...this.active]) {
      const note = old.note;
      const pcm = renderSonixNoteSync({
        params: this.curParams, note: this.midiOf(note), velocity: RENDER_VELOCITY, sampleRate: sr, frames,
      });
      if (!pcm || pcm.length === 0) continue; // render failed → leave the old voice playing
      const { buf, loop } = this.buildLoopedBuffer(pcm, note);
      // Start the new voice in the sustain window (skip the attack) and crossfade over.
      this.startBuffer(
        buf, 1, old.gainTarget, note, t,
        loop?.loopStartSec, loop?.loopEndSec, loop?.loopStartSec ?? 0, MORPH_FADE_SEC,
      );
      this.retireVoice(old, t, MORPH_FADE_SEC);
    }
  }

  triggerAttack(note?: string | number, time?: number, velocity = 1): void {
    const t = time ?? audioNow();
    // Sonix is a monophonic Paula voice: a new attack cuts the previous note.
    this.stopActiveVoices(t, 0.004);
    const v = Math.max(0, Math.min(1, velocity));
    // Faithful path: render THIS note synchronously from the current params — no cached
    // buffer, no async swap, so every key press / preset switch reflects the live params.
    if (USE_WASM_AUDITION && this.curParams) {
      const sr = this.ctx.sampleRate;
      const frames = Math.round(RENDER_SECONDS * sr);
      const pcm = renderSonixNoteSync({
        params: this.curParams, note: this.midiOf(note), velocity: RENDER_VELOCITY, sampleRate: sr, frames,
      });
      if (pcm && pcm.length > 0) {
        // Rendered at the played note → rate 1. For a held key, loop a correlation-matched
        // window at the settled tail (seam-crossfaded) so the sustain is seamless. If no clean
        // loop exists (silent/short render), play once.
        const { buf, loop } = this.buildLoopedBuffer(pcm, note);
        this.startBuffer(buf, 1, v * AUDITION_GAIN, note, t, loop?.loopStartSec, loop?.loopEndSec);
        return;
      }
    }
    // Fallback (WASM not ready): base-waveform repitched, looped over a single cycle.
    if (this.fallbackBuffer) {
      this.startBuffer(
        this.fallbackBuffer, this.playbackRateFor(note), v * this.baseGain, note, t,
        0, WAVE_LEN / this.waveSampleRate,
      );
    }
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
   * Live edit: update live params, re-render held notes through the faithful WASM synth
   * path (so filter/blend/EG edits are audible), and push the edited params into the running
   * WASM song engine so SONG playback morphs too.
   */
  applyConfig(config: InstrumentConfig): void {
    this.setParams(config);      // update live params + base-wave fallback
    this.reRenderHeld();         // re-render held notes with the new params (rate-limited)
    // Sync the live WASM instrument so the playing SONG reflects the edit too.
    if (this.curParams && SonixEngine.hasInstance()) {
      try {
        SonixEngine.getInstance().setSynthParams(this.curParams);
      } catch {
        /* engine busy */
      }
    }
  }

  updateConfig(config: InstrumentConfig): void {
    this.applyConfig(config);
  }

  dispose(): void {
    this.reRenderHeld.cancel();
    for (const voice of [...this.active, ...this.dying]) {
      try {
        voice.src.stop();
      } catch {
        /* ok */
      }
      this.disposeVoice(voice);
    }
    this.volNode.disconnect();
    this.fallbackBuffer = null;
  }

  get volume(): AudioParam {
    return this.volNode.gain;
  }
}
