import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { AUDIO_CONSTANTS } from '../../constants/audioConstants';
import { InstrumentManager } from './InstrumentManager';
import { EnvelopeProcessor } from '../../utils/envelopeProcessor';

interface ActiveVoice {
  instrumentId: number;
  channelIndex?: number;
  startTime: number;
  releaseTime?: number;
  config: InstrumentConfig;
}

export class PlaybackManager {
  private lastTriggerTime: number = 0;
  private instrumentManager: InstrumentManager;
  private activeVoices: Map<string, ActiveVoice> = new Map(); 
  private envelopeLoopStarted: boolean = false;

  constructor(instrumentManager: InstrumentManager) {
    this.instrumentManager = instrumentManager;
    this.startEnvelopeLoop();
  }

  private startEnvelopeLoop() {
    if (this.envelopeLoopStarted) return;
    this.envelopeLoopStarted = true;

    const updateEnvelopes = () => {
      const now = Tone.now();
      const bpm = Tone.getTransport().bpm.value;
      const ticksPerSec = (bpm * 6) / 60; 

      this.activeVoices.forEach((voice, key) => {
        const elapsedSecs = now - voice.startTime;
        const elapsedTicks = elapsedSecs * ticksPerSec;
        const isReleased = voice.releaseTime !== undefined;

        const instKey = this.instrumentManager.getInstrumentKey(voice.instrumentId, voice.channelIndex);
        const instrument = this.instrumentManager.getInstrumentInstance(instKey);
        if (!instrument) return;

        // Process Volume Fadeout (FT2 style)
        let fadeoutMult = 1.0;
        if (isReleased && voice.config.volumeFadeout !== undefined && voice.config.volumeFadeout > 0) {
          const secsSinceRelease = now - voice.releaseTime!;
          const ticksSinceRelease = secsSinceRelease * (bpm * 6 / 60);
          fadeoutMult = Math.max(0, 1.0 - (voice.config.volumeFadeout / 65536) * ticksSinceRelease);
        }

        // Process Volume Envelope
        if (voice.config.volumeEnvelope?.enabled) {
          const tick = EnvelopeProcessor.getEffectiveTick(voice.config.volumeEnvelope, elapsedTicks, isReleased);
          const volMult = EnvelopeProcessor.getValueAtTick(voice.config.volumeEnvelope, tick) * fadeoutMult;
          const baseVol = voice.config.volume || -12;
          const targetVol = baseVol + (volMult > 0 ? 20 * Math.log10(volMult) : -100);
          if ((instrument as any).volume) {
            const volNode = (instrument as any).isTB303 ? (instrument as any).volume : (instrument as any).volume;
            if (volNode instanceof Tone.Signal || volNode instanceof Tone.Param) {
               volNode.rampTo(targetVol, 0.016);
            }
          }
        } else if (fadeoutMult < 1.0) {
          const baseVol = voice.config.volume || -12;
          const targetVol = baseVol + (fadeoutMult > 0 ? 20 * Math.log10(fadeoutMult) : -100);
          if ((instrument as any).volume) {
            const volNode = (instrument as any).isTB303 ? (instrument as any).volume : (instrument as any).volume;
            if (volNode instanceof Tone.Signal || volNode instanceof Tone.Param) {
               volNode.rampTo(targetVol, 0.016);
            }
          }
        }

        // Process Auto-Vibrato
        if (voice.config.vibrato?.enabled) {
          const vib = voice.config.vibrato;
          const sweepMult = vib.sweep > 0 ? Math.min(1.0, (elapsedSecs * 1000) / vib.sweep) : 1.0;
          const phase = elapsedSecs * vib.rate * Math.PI * 2;
          let mod = 0;
          switch (vib.waveform) {
            case 'sine': mod = Math.sin(phase); break;
            case 'square': mod = Math.sin(phase) >= 0 ? 1 : -1; break;
            case 'triangle': mod = (Math.abs((phase / Math.PI) % 2 - 1) * 2 - 1); break;
            case 'sawtooth': mod = (phase / Math.PI) % 2 - 1; break;
          }
          const depthCents = vib.depth * 100 * sweepMult * mod;
          if ((instrument as any).setTuning) (instrument as any).setTuning(depthCents);
          else if ((instrument as any).detune) (instrument as any).detune.rampTo(depthCents, 0.016);
        }

        // Clean up
        if (isReleased && now > voice.releaseTime! + 2.0) {
          this.activeVoices.delete(key);
        }
      });

      requestAnimationFrame(updateEnvelopes);
    };

    updateEnvelopes();
  }

  public getSafeTime(time?: number): number | null {
    if (Tone.getContext().state !== 'running') return null;
    const now = Tone.now();
    let targetTime = (time !== undefined && time !== null && !isNaN(time) && time > 0) ? time : now + 0.005;
    if (targetTime < this.lastTriggerTime) targetTime = this.lastTriggerTime;
    this.lastTriggerTime = targetTime;
    return targetTime;
  }

  public triggerNote(id: number, note: string, dur: number, time: number, vel: number, cfg: InstrumentConfig, acc?: boolean, slide?: boolean, ch?: number): void {
    const key = this.instrumentManager.getInstrumentKey(id, ch);
    const instrument = this.instrumentManager.getInstrumentInstance(key);
    if (!instrument) return;
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) return;

    this.activeVoices.set(`${ch ?? 0}-${note}`, { instrumentId: id, channelIndex: ch, startTime: safeTime, config: cfg });

    try {
      if ((instrument as any).isTB303) (instrument as any).triggerAttackRelease(note, dur, safeTime, vel, acc, slide);
      else if (cfg.synthType === 'NoiseSynth') (instrument as any).triggerAttackRelease(dur, safeTime, vel);
      else if (typeof (instrument as any).triggerAttackRelease === 'function') (instrument as any).triggerAttackRelease(note, dur, safeTime, vel);
    } catch (error) { console.error(`[PlaybackManager] Trigger error:`, error); }
  }

  public triggerNoteAttack(id: number, note: string, time: number, vel: number, cfg: InstrumentConfig, ch?: number): void {
    const key = this.instrumentManager.getInstrumentKey(id, ch);
    const instrument = this.instrumentManager.getInstrumentInstance(key);
    if (!instrument) return;
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) return;

    this.activeVoices.set(`${ch ?? 0}-${note}`, { instrumentId: id, channelIndex: ch, startTime: safeTime, config: cfg });

    try {
      if (typeof (instrument as any).triggerAttack === 'function') {
        if (cfg.synthType === 'NoiseSynth') (instrument as any).triggerAttack(safeTime, vel);
        else (instrument as any).triggerAttack(note, safeTime, vel);
      }
    } catch (error) { console.error(`[PlaybackManager] Attack error:`, error); }
  }

  public triggerNoteRelease(id: number, note: string, time: number, _cfg: InstrumentConfig, ch?: number): void {
    const key = this.instrumentManager.getInstrumentKey(id, ch);
    const instrument = this.instrumentManager.getInstrumentInstance(key);
    if (!instrument) return;
    const safeTime = this.getSafeTime(time);
    if (safeTime === null) return;

    const voice = this.activeVoices.get(`${ch ?? 0}-${note}`);
    if (voice) voice.releaseTime = safeTime;

    try {
      if (typeof (instrument as any).triggerRelease === 'function') {
        if ((instrument as any).isTB303) (instrument as any).triggerRelease(safeTime);
        else (instrument as any).triggerRelease(note, safeTime);
      }
    } catch (error) { console.error(`[PlaybackManager] Release error:`, error); }
  }

  public applyAutomation(instrument: any, parameter: string, value: number): void {
    const now = this.getSafeTime();
    if (now === null) return;
    try {
      switch (parameter) {
        case 'cutoff': {
          const cutoffHz = AUDIO_CONSTANTS.FILTER.MIN_CUTOFF_HZ * Math.pow(AUDIO_CONSTANTS.FILTER.EXP_BASE, value);
          if (instrument.isTB303) instrument.setCutoff(cutoffHz);
          else if (instrument.filter) instrument.filter.frequency.setValueAtTime(cutoffHz, now);
          break;
        }
        case 'resonance':
          if (instrument.isTB303) instrument.setResonance(value * 100);
          else if (instrument.filter) instrument.filter.Q.setValueAtTime(value * 10, now);
          break;
        case 'volume': {
          const volNode = instrument.isTB303 ? instrument.volume : instrument.volume;
          if (volNode instanceof Tone.Signal || volNode instanceof Tone.Param) {
            volNode.setValueAtTime(AUDIO_CONSTANTS.VOLUME.MIN_DB + value * (AUDIO_CONSTANTS.VOLUME.MAX_DB - AUDIO_CONSTANTS.VOLUME.MIN_DB), now);
          }
          break;
        }
      }
    } catch (error) { console.error(`[PlaybackManager] Automation error:`, error); }
  }
}