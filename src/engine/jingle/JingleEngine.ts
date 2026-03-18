/**
 * JingleEngine — Singleton for startup jingle playback.
 * Exposes an AnalyserNode for audio-reactive visuals in PixiVisualizer.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class JingleEngine {
  private static _instance: JingleEngine | null = null;

  static getInstance(): JingleEngine {
    return (JingleEngine._instance ??= new JingleEngine());
  }

  private buffer: AudioBuffer | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _isPlaying = false;
  private _endCallbacks: Array<() => void> = [];

  /** Fetch + decode the jingle. Call before play(). */
  async preload(url: string): Promise<void> {
    const ctx = getDevilboxAudioContext();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch jingle: ${resp.status}`);
    const ab = await resp.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(ab);
  }

  /** Start playback. Creates source → analyser → destination. */
  play(): void {
    if (!this.buffer || this._isPlaying) return;
    const ctx = getDevilboxAudioContext();

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.source.onended = () => {
      this._isPlaying = false;
      this._endCallbacks.forEach(cb => cb());
      this._endCallbacks = [];
    };
    this.source.start(0);
    this._isPlaying = true;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  onEnd(cb: () => void): void {
    this._endCallbacks.push(cb);
  }

  stop(): void {
    try {
      this.source?.stop();
    } catch {
      // Ignore already-stopped errors
    }
    this._isPlaying = false;
  }
}

export function getJingleEngine(): JingleEngine {
  return JingleEngine.getInstance();
}
