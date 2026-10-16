/**
 * JingleEngine — startup jingle audio engine.
 * Plays the DEViLBOX startup jingle (.mp3) with an analyser for visualization.
 */

let instance: JingleEngine | null = null;

/**
 * The startup jingle asset, served from public/. It must be a tracked file:
 * an untracked copy plays on one machine only, and a missing file makes the
 * SPA fallback answer with index.html, which decodes to nothing.
 */
export const STARTUP_JINGLE_URL = '/devilbox1.mp3';

export class JingleEngine {
  private audioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private endCallback: (() => void) | null = null;

  async preload(url: string): Promise<void> {
    this.audioCtx = new AudioContext();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.connect(this.audioCtx.destination);
    const resp = await fetch(url);
    const contentType = resp.headers.get('content-type') ?? '';
    if (!resp.ok || contentType.startsWith('text/html')) {
      throw new Error(`Startup jingle not found at ${url} (HTTP ${resp.status}, ${contentType || 'no content type'})`);
    }
    const buf = await resp.arrayBuffer();
    this.buffer = await this.audioCtx.decodeAudioData(buf);
  }

  play(): void {
    if (!this.audioCtx || !this.buffer || !this.analyserNode) return;
    this.source = this.audioCtx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.analyserNode);
    this.source.onended = () => {
      this.endCallback?.();
    };
    this.source.start();
  }

  stop(): void {
    try { this.source?.stop(); } catch { /* already stopped */ }
  }

  onEnd(cb: () => void): void {
    this.endCallback = cb;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  dispose(): void {
    this.stop();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.analyserNode = null;
    this.source = null;
    this.buffer = null;
    instance = null;
  }
}

export function getJingleEngine(): JingleEngine {
  if (!instance) instance = new JingleEngine();
  return instance;
}
