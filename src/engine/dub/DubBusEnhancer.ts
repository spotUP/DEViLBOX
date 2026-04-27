/**
 * DubBusEnhancer — signal enhancement for the dub bus input chain.
 *
 * Real-time (all sources): SpectralExciter + TransientSharpener
 * Offline (lo-fi only): DC removal + denoise on sample buffers
 */

import type { InstrumentConfig } from '@/types/instrument/defaults';

// ── SpectralExciter ───────────────────────────────────────────────────────────

class SpectralExciter {
  private hpf: BiquadFilterNode;
  private waveshaper: WaveShaperNode;
  private exciterGain: GainNode;
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.input       = ctx.createGain();
    this.output      = ctx.createGain();
    this.hpf         = ctx.createBiquadFilter();
    this.waveshaper  = ctx.createWaveShaper();
    this.exciterGain = ctx.createGain();

    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 3000;
    this.hpf.Q.value = 0.7;

    // Gentle soft-clip (drive 0.15)
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = (Math.PI + 0.15) * x / (Math.PI + 0.15 * Math.abs(x));
    }
    this.waveshaper.curve = curve;
    this.exciterGain.gain.value = 0.12;

    // Dry + exciter parallel
    this.input.connect(this.output);
    this.input.connect(this.hpf);
    this.hpf.connect(this.waveshaper);
    this.waveshaper.connect(this.exciterGain);
    this.exciterGain.connect(this.output);
  }

  dispose(): void {
    [this.input, this.hpf, this.waveshaper, this.exciterGain, this.output].forEach(n => {
      try { n.disconnect(); } catch { /* ok */ }
    });
  }
}

// ── TransientSharpener ────────────────────────────────────────────────────────

class TransientSharpener {
  private hpf: BiquadFilterNode;
  private sharpenerGain: GainNode;
  readonly input: GainNode;
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.input         = ctx.createGain();
    this.output        = ctx.createGain();
    this.hpf           = ctx.createBiquadFilter();
    this.sharpenerGain = ctx.createGain();

    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 1500;
    this.hpf.Q.value = 0.5;
    this.sharpenerGain.gain.value = 0.2;

    this.input.connect(this.output);
    this.input.connect(this.hpf);
    this.hpf.connect(this.sharpenerGain);
    this.sharpenerGain.connect(this.output);
  }

  dispose(): void {
    [this.input, this.hpf, this.sharpenerGain, this.output].forEach(n => {
      try { n.disconnect(); } catch { /* ok */ }
    });
  }
}

// ── DubBusEnhancer ────────────────────────────────────────────────────────────

export class DubBusEnhancer {
  private exciter: SpectralExciter;
  private sharpener: TransientSharpener;
  private context: AudioContext;
  private _loFiProcessed = new Set<number>();

  constructor(ctx: AudioContext) {
    this.context   = ctx;
    this.exciter   = new SpectralExciter(ctx);
    this.sharpener = new TransientSharpener(ctx);
    this.exciter.output.connect(this.sharpener.input);
  }

  /** Insert the enhancer chain between dubBusInput and nextNode. */
  connect(dubBusInput: GainNode, nextNode: AudioNode): void {
    try { dubBusInput.disconnect(nextNode); } catch { /* ok */ }
    dubBusInput.connect(this.exciter.input);
    this.sharpener.output.connect(nextNode);
  }

  /** Remove the enhancer chain and reconnect dubBusInput directly to nextNode. */
  bypass(dubBusInput: GainNode, nextNode: AudioNode): void {
    try { dubBusInput.disconnect(this.exciter.input); } catch { /* ok */ }
    try { this.sharpener.output.disconnect(nextNode); } catch { /* ok */ }
    dubBusInput.connect(nextNode);
  }

  /** Offline: DC removal + denoise on lo-fi sample buffers. */
  async processLoFiSamples(instruments: InstrumentConfig[]): Promise<void> {
    // Lazy imports to keep startup cost zero
    const [{ WaveformProcessor }, { applyDenoise }] = await Promise.all([
      import('@lib/audio/WaveformProcessor'),
      import('@utils/audio/SampleProcessing'),
    ]);

    for (const inst of instruments) {
      if (this._loFiProcessed.has(inst.id)) continue;
      const url = inst.sample?.url;
      if (!url?.startsWith('data:audio/wav')) continue;

      try {
        const base64 = url.split(',')[1];
        const binary = atob(base64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const buffer = await this.context.decodeAudioData(bytes.buffer.slice(0));

        // DC removal — returns a new AudioBuffer
        const dcCleaned = WaveformProcessor.dcOffsetRemoval(buffer);

        // Denoise — returns Promise<ProcessedResult> with .buffer field
        await applyDenoise(dcCleaned, -50);

        this._loFiProcessed.add(inst.id);
      } catch {
        // Non-fatal
      }
    }
  }

  clearProcessedCache(): void {
    this._loFiProcessed.clear();
  }

  dispose(): void {
    this.exciter.dispose();
    this.sharpener.dispose();
  }
}
