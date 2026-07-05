/**
 * SonixSynth — first-class Sonix synth voice.
 *
 * Faithful Sonix synthesis (blend/ring + 64-band envelope-swept filter bank) runs in
 * the WASM engine during song playback. This voice provides:
 *   1. an editor preview/audition — the 128-byte base waveform looped as a tone, and
 *   2. live edit sync — applyConfig pushes edited params into the running WASM engine
 *      (SonixEngine.setSynthParams; set_wave rebuilds the filter bank) so the SONG
 *      reflects knob moves, exactly like Cinter4's live buffer swap.
 *
 * Params live in config.parameters.sonix (readSonixSynthParams), mirrored from the WASM
 * by the param bridge. The base-waveform preview is a timbre approximation — the true
 * per-note filter sweep is only heard in WASM song playback; a faithful per-note render
 * export (render-one-note) is a planned follow-up.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { InstrumentConfig } from '@typedefs/instrument';
import { getDevilboxAudioContext, audioNow, noteToFrequency } from '@/utils/audio-context';
import { readSonixSynthParams } from './sonixInstrument';
import { SonixEngine } from './SonixEngine';

const BASE_NOTE = 'C3';
const WAVE_LEN = 128;

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  playbackRate: number;
}

export class SonixSynth implements DevilboxSynth {
  readonly name = 'SonixSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();

  private ctx: AudioContext;
  private volNode: GainNode;
  private buffer: AudioBuffer | null = null;
  private baseFreq: number;
  private waveSampleRate = 32000;
  private active = new Set<ActiveVoice>();

  constructor(config: InstrumentConfig) {
    this.ctx = getDevilboxAudioContext();
    this.volNode = this.ctx.createGain();
    this.volNode.gain.value = 1;
    this.output = this.volNode;
    this.baseFreq = noteToFrequency(BASE_NOTE) || 130.81;
    this.renderFromConfig(config);
  }

  /** Build a looping single-cycle buffer from the 128-byte base waveform. */
  private renderFromConfig(config: InstrumentConfig): void {
    const p = readSonixSynthParams(config);
    if (!p || !p.wave || p.wave.length < WAVE_LEN) {
      this.buffer = null;
      return;
    }
    // 128 samples = one cycle at baseFreq → sample rate = 128 * baseFreq (clamped valid).
    this.waveSampleRate = Math.max(3000, Math.min(192000, Math.round(WAVE_LEN * this.baseFreq)));
    const buf = this.ctx.createBuffer(1, WAVE_LEN, this.waveSampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < WAVE_LEN; i++) data[i] = p.wave[i] / 128; // 8-bit signed → -1..1
    this.buffer = buf;
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
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = WAVE_LEN / this.waveSampleRate;
    const gain = this.ctx.createGain();
    gain.gain.value = gainVal;
    src.connect(gain);
    gain.connect(this.volNode);
    const voice: ActiveVoice = { src, gain, playbackRate };
    this.active.add(voice);
    src.start(time);
  }

  private cleanup(voice: ActiveVoice): void {
    if (!this.active.has(voice)) return;
    this.active.delete(voice);
    try { voice.src.disconnect(); voice.gain.disconnect(); } catch { /* already gone */ }
  }

  private stopActiveVoices(t: number, fadeSec: number): void {
    for (const voice of [...this.active]) {
      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
        voice.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
        voice.src.stop(t + fadeSec + 0.005);
      } catch { /* already stopped */ }
      const v = voice;
      v.src.onended = () => { this.cleanup(v); };
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
   * Live edit: re-render the preview buffer, swap it into held voices, and push the
   * edited params into the running WASM engine so SONG playback morphs too.
   */
  applyConfig(config: InstrumentConfig): void {
    const p = readSonixSynthParams(config);
    this.renderFromConfig(config);
    const t = audioNow();
    if (this.buffer) {
      for (const voice of [...this.active]) {
        const gainVal = voice.gain.gain.value;
        try { voice.src.stop(t); } catch { /* ok */ }
        this.cleanup(voice);
        this.startVoice(voice.playbackRate, gainVal, t);
      }
    }
    // Sync the live WASM instrument so the playing song reflects the edit.
    if (p && SonixEngine.hasInstance()) {
      try { SonixEngine.getInstance().setSynthParams(p); } catch { /* engine busy */ }
    }
  }

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
