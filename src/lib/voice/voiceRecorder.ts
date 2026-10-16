/**
 * voiceRecorder.ts - take recording with a count-in, independent of the audio
 * backend. A VoiceCapture delivers mono 22050 Hz sample blocks; the recorder
 * schedules the count-in clicks, drops the samples recorded during the
 * count-in (so sample 0 of the take is beat 1), and meters the level.
 */
import { PITCH_SAMPLE_RATE } from './pitchNotes';

export interface VoiceCapture {
  readonly sampleRate: number;
  /** Start delivering blocks. */
  start(onBlock: (block: Float32Array) => void): Promise<void>;
  /** Schedule a metronome click `delaySeconds` from now (audio clock). */
  click(delaySeconds: number, accent: boolean): void;
  stop(): void;
}

export type VoiceCaptureFactory = (stream: MediaStream) => VoiceCapture;

export interface RecorderOptions {
  countInBeats: number;
  beatSeconds: number;
  onLevel?: (rms: number) => void;
  /** Fired once, when the count-in is over and the take begins. */
  onTakeStart?: () => void;
}

export function concatBlocks(blocks: readonly Float32Array[]): Float32Array {
  let total = 0;
  for (const b of blocks) total += b.length;
  const out = new Float32Array(total);
  let at = 0;
  for (const b of blocks) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

export class VoiceRecorder {
  private blocks: Float32Array[] = [];
  private skip: number;
  private started = false;
  private takeStarted = false;

  private capture: VoiceCapture;
  private opts: RecorderOptions;

  constructor(capture: VoiceCapture, opts: RecorderOptions) {
    this.capture = capture;
    this.opts = opts;
    this.skip = Math.round(opts.countInBeats * opts.beatSeconds * capture.sampleRate);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.capture.start((block) => this.onBlock(block));
    for (let i = 0; i < this.opts.countInBeats; i++) {
      this.capture.click(i * this.opts.beatSeconds, i === 0);
    }
    if (this.skip === 0) this.beginTake();
  }

  private beginTake(): void {
    if (this.takeStarted) return;
    this.takeStarted = true;
    this.opts.onTakeStart?.();
  }

  private onBlock(block: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    this.opts.onLevel?.(Math.sqrt(sum / Math.max(1, block.length)));

    if (this.skip >= block.length) {
      this.skip -= block.length;
      return;
    }
    const kept = this.skip > 0 ? block.subarray(this.skip) : block;
    this.skip = 0;
    this.beginTake();
    this.blocks.push(new Float32Array(kept));
  }

  /** Copy of everything recorded since the take began (for the live preview). */
  snapshot(): Float32Array {
    return concatBlocks(this.blocks);
  }

  get takeSeconds(): number {
    let n = 0;
    for (const b of this.blocks) n += b.length;
    return n / this.capture.sampleRate;
  }

  /** Stop and return the take. */
  stop(): Float32Array {
    this.capture.stop();
    return concatBlocks(this.blocks);
  }
}

export { PITCH_SAMPLE_RATE };
