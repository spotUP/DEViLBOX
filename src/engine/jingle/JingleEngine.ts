/**
 * JingleEngine — startup jingle audio engine.
 * Plays the DEViLBOX startup jingle (.mp3) with an analyser for visualization.
 */

let instance: JingleEngine | null = null;

/** Below this peak level (dBFS) the rest of the jingle counts as silence. */
export const AUDIBLE_FLOOR_DB = -40;

/**
 * Seconds from the start of `buffer` to its last sample above `floorDb`.
 * The jingle asset has a 5 s near-silent tail after the music; playing only
 * the audible part lets the end handler (and the lips teardown) run when the
 * sound stops, not seconds later.
 */
export function audibleDurationSeconds(buffer: AudioBuffer, floorDb: number = AUDIBLE_FLOOR_DB): number {
  const floor = Math.pow(10, floorDb / 20);
  let last = -1;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i]!) > floor) {
        last = i;
        break;
      }
    }
  }
  return last < 0 ? 0 : (last + 1) / buffer.sampleRate;
}

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

  /** True once the asset is fetched and decoded and play() can start at once. */
  isReady(): boolean {
    return !!this.audioCtx && !!this.buffer && !!this.analyserNode;
  }

  /**
   * Resume the context. Must run synchronously inside the user gesture: the
   * context made at page load is suspended until then.
   */
  unlock(): void {
    if (this.audioCtx && this.audioCtx.state !== 'running') void this.audioCtx.resume();
  }

  /** Play the audible part of the jingle; `onEnd` fires when that part is over. */
  play(): void {
    if (!this.audioCtx || !this.buffer || !this.analyserNode) return;
    this.unlock();
    this.source = this.audioCtx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.analyserNode);
    this.source.onended = () => {
      this.endCallback?.();
    };
    this.source.start(0, 0, audibleDurationSeconds(this.buffer));
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
