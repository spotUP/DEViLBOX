import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export class AutoGainController {
  private enabled: boolean = false;
  private loopId: ReturnType<typeof setInterval> | null = null;
  private sampleLevelAnalyser: AnalyserNode | null = null;
  private synthLevelAnalyser: AnalyserNode | null = null;
  private sampleCorr: number = 0;
  private synthCorr: number = 0;

  private applyGains: (sampleCorr: number, synthCorr: number) => void;
  private masterInput: Tone.Gain;
  private synthBus: Tone.Gain;

  constructor(
    masterInput: Tone.Gain,
    synthBus: Tone.Gain,
    applyGains: (sampleCorr: number, synthCorr: number) => void
  ) {
    this.masterInput = masterInput;
    this.synthBus = synthBus;
    this.applyGains = applyGains;
  }

  public setAutoGain(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.ensureAnalysers();
      this.startLoop();
    } else {
      this.stopLoop();
      this.sampleCorr = 0;
      this.synthCorr = 0;
      this.applyGains(0, 0);
    }
  }

  public getAutoGain(): boolean {
    return this.enabled;
  }

  /** Returns current auto-gain corrections in dB (informational, for UI display) */
  public getAutoGainCorrections(): { sample: number; synth: number } {
    return { sample: this.sampleCorr, synth: this.synthCorr };
  }

  private ensureAnalysers(): void {
    if (this.sampleLevelAnalyser && this.synthLevelAnalyser) return;
    const ctx = Tone.getContext().rawContext as AudioContext;

    if (!this.sampleLevelAnalyser) {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0;
      (getNativeAudioNode(this.masterInput as any) as GainNode).connect(a);
      this.sampleLevelAnalyser = a;
    }

    if (!this.synthLevelAnalyser) {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0;
      (getNativeAudioNode(this.synthBus as any) as GainNode).connect(a);
      this.synthLevelAnalyser = a;
    }
  }

  private computeRmsDb(data: Float32Array): number {
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
    const rms = Math.sqrt(sumSq / data.length);
    return rms < 1e-10 ? -120 : 20 * Math.log10(rms);
  }

  private startLoop(): void {
    if (this.loopId !== null) return;
    const buf = new Float32Array(2048);
    const RATE = 0.2;
    const SILENCE = -50;
    const MAX_CORR = 12;

    this.loopId = setInterval(() => {
      if (!this.sampleLevelAnalyser || !this.synthLevelAnalyser) return;

      this.sampleLevelAnalyser.getFloatTimeDomainData(buf);
      const sampleDb = this.computeRmsDb(buf);
      this.synthLevelAnalyser.getFloatTimeDomainData(buf);
      const synthDb = this.computeRmsDb(buf);

      // Only balance when both buses have signal
      if (sampleDb < SILENCE || synthDb < SILENCE) return;

      // error > 0 → samples louder; apply symmetric correction
      const error = sampleDb - synthDb;
      this.sampleCorr -= error * RATE * 0.5;
      this.synthCorr += error * RATE * 0.5;

      this.sampleCorr = Math.max(-MAX_CORR, Math.min(MAX_CORR, this.sampleCorr));
      this.synthCorr = Math.max(-MAX_CORR, Math.min(MAX_CORR, this.synthCorr));

      this.applyGains(this.sampleCorr, this.synthCorr);
    }, 100) as unknown as ReturnType<typeof setInterval>;
  }

  private stopLoop(): void {
    if (this.loopId !== null) {
      clearInterval(this.loopId as unknown as number);
      this.loopId = null;
    }
  }

  public dispose(): void {
    this.stopLoop();
    if (this.sampleLevelAnalyser) {
      this.sampleLevelAnalyser.disconnect();
      this.sampleLevelAnalyser = null;
    }
    if (this.synthLevelAnalyser) {
      this.synthLevelAnalyser.disconnect();
      this.synthLevelAnalyser = null;
    }
  }
}
