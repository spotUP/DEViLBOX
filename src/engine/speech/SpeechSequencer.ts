/**
 * Generic timed speech frame playback engine.
 *
 * Queues frames with per-frame duration and calls onFrame() for each.
 * Used by all speech synths to sequence phoneme/allophone playback.
 */
export interface SpeechFrame<T> {
  data: T;
  durationMs: number;
}

export class SpeechSequencer<T> {
  private _queue: SpeechFrame<T>[] = [];
  private _currentIndex = 0;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _speaking = false;
  private _onFrame: ((data: T) => void) | null = null;
  private _onDone: (() => void) | null = null;

  constructor(onFrame: (data: T) => void, onDone?: () => void) {
    this._onFrame = onFrame;
    this._onDone = onDone ?? null;
  }

  /** Queue and start speaking a sequence of frames */
  speak(frames: SpeechFrame<T>[]): void {
    this.stop();
    this._queue = frames;
    this._currentIndex = 0;
    this._speaking = true;
    this._playNext();
  }

  /** Stop current playback */
  stop(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._speaking = false;
    this._queue = [];
    this._currentIndex = 0;
  }

  /** Whether speech is currently playing */
  get isSpeaking(): boolean {
    return this._speaking;
  }

  private _playNext(): void {
    if (this._currentIndex >= this._queue.length) {
      this._speaking = false;
      this._onDone?.();
      return;
    }

    const frame = this._queue[this._currentIndex];
    this._onFrame?.(frame.data);
    this._currentIndex++;

    this._timer = setTimeout(() => {
      this._timer = null;
      this._playNext();
    }, frame.durationMs);
  }

  dispose(): void {
    this.stop();
    this._onFrame = null;
    this._onDone = null;
  }
}
