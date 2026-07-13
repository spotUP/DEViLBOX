/**
 * SunTronicSynth — first-class SunTronic V1.3 wavetable synth voice.
 *
 * SunTronic synth records are a per-tick evolving wavetable: every replayer
 * frame MEGAEFFECTS regenerates the play buffer and EFFECTS updates the Paula
 * period + volume. This voice bakes a fixed-length preview of that evolution
 * (SunTronicVoiceRenderer) into a PCM buffer at the note's pitch and plays it on
 * a loop — structurally like Cinter4Synth (render a buffer, fire on attack), but
 * the buffer comes from the native SunTronic engine and the pitch is baked in
 * (period drives the render), so no playbackRate re-pitching is applied.
 *
 * WHY THIS EXISTS: without a native voice, auditioning a SunTronic synth
 * instrument fell through to whole-module UADE playback (`withFallback.ts`
 * forces every instrument to `UADEEditableSynth`) — the "playing a synth
 * instrument plays the whole song" bug. This voice IS the single instrument.
 *
 * `.src` SONG replay is a separate path (Phase 4 grid renderer / UADE oracle);
 * this voice is for editor auditioning and manual instrument use.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';
import { getDevilboxAudioContext, audioNow, noteToMidi } from '@/utils/audio-context';
import { SUN_PERIODS } from './SunTronicEffects';
import { renderSunSynthPreview, sunConfigToInstrument } from './SunTronicVoiceRenderer';

/** Baked preview length (seconds) — long enough to hear the envelope evolve. */
const PREVIEW_SECONDS = 1.5;
/**
 * Map a MIDI note to a SUN_PERIODS semitone index. SUN_PERIODS note 0 sits at
 * index 12 (12 guard words precede it); MIDI 60 (C4) → index 36, a mid-table
 * pitch. Audition pitch need not be musically exact yet — the fix is producing
 * the correct single voice, not whole-song playback.
 */
function midiToPeriodIndex(note: string | number): number {
  const midi = noteToMidi(note);
  const idx = midi - 24;
  return Math.max(0, Math.min(SUN_PERIODS.length - 1, idx));
}

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class SunTronicSynth implements DevilboxSynth {
  readonly name = 'SunTronicSynth';
  readonly output: GainNode;
  readonly ready = Promise.resolve();

  private ctx: AudioContext;
  private cfg: SunTronicConfig | null;
  private active = new Set<ActiveVoice>();

  constructor(config: InstrumentConfig) {
    this.ctx = getDevilboxAudioContext();
    this.output = this.ctx.createGain();
    this.output.gain.value = 1;
    this.cfg = config.sunTronic ?? null;
  }

  /** Render the note's PCM buffer from the native engine at the note's pitch. */
  private renderBuffer(note: string | number): AudioBuffer | null {
    if (!this.cfg || this.cfg.waveWordLen <= 0) return null;
    const inst = sunConfigToInstrument(this.cfg);
    const pcm = renderSunSynthPreview(inst, {
      periodIndex: midiToPeriodIndex(note),
      seconds: PREVIEW_SECONDS,
      sampleRate: this.ctx.sampleRate,
    });
    if (pcm.length === 0) return null;
    const buf = this.ctx.createBuffer(1, pcm.length, this.ctx.sampleRate);
    buf.getChannelData(0).set(pcm);
    return buf;
  }

  private startVoice(buffer: AudioBuffer, gainVal: number, time: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true; // sustain by looping the baked preview
    const gain = this.ctx.createGain();
    gain.gain.value = gainVal;
    src.connect(gain);
    gain.connect(this.output);
    const voice: ActiveVoice = { src, gain };
    this.active.add(voice);
    src.start(time);
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

  private cleanup(voice: ActiveVoice): void {
    if (!this.active.has(voice)) return;
    this.active.delete(voice);
    try { voice.src.disconnect(); voice.gain.disconnect(); } catch { /* already gone */ }
  }

  triggerAttack(note: string | number = 'C4', time?: number, velocity = 1): void {
    const t = time ?? audioNow();
    // Monophonic Paula voice: a new attack cuts the previous note.
    this.stopActiveVoices(t, 0.004);
    const buf = this.renderBuffer(note);
    if (buf) this.startVoice(buf, Math.max(0, Math.min(1, velocity)), t);
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

  /** Live update: swap the config; next attack renders from it. */
  applyConfig(config: InstrumentConfig): void {
    this.cfg = config.sunTronic ?? null;
  }

  updateConfig(config: InstrumentConfig): void {
    this.applyConfig(config);
  }

  dispose(): void {
    for (const voice of [...this.active]) {
      try { voice.src.stop(); } catch { /* ok */ }
      this.cleanup(voice);
    }
    this.output.disconnect();
    this.cfg = null;
  }

  get volume(): AudioParam { return this.output.gain; }
}
