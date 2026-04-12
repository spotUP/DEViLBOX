/**
 * DJVideoRecorder — Records a MediaStream to a downloadable WebM/MP4 file.
 *
 * Uses MediaRecorder with the best available codec (VP9 > VP8 > default).
 * Tracks duration and estimated file size during recording.
 */

export class DJVideoRecorder {
  private _recorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];
  private _startTime = 0;
  private _recording = false;
  private _mimeType = '';
  private _totalBytes = 0;
  private _partIndex = 0;
  private _lastAutoSaveTime = 0;
  private static readonly AUTO_SAVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  /** Callbacks */
  onDataAvailable?: (sizeBytes: number, durationMs: number) => void;

  /** Start recording a MediaStream */
  startRecording(stream: MediaStream): void {
    if (this._recording) return;

    // Pick best available video codec
    this._mimeType = pickMimeType();
    this._chunks = [];
    this._totalBytes = 0;
    this._partIndex = 0;
    this._lastAutoSaveTime = Date.now();

    this._recorder = new MediaRecorder(stream, {
      mimeType: this._mimeType,
      videoBitsPerSecond: 4_000_000, // 4 Mbps
      audioBitsPerSecond: 128_000,   // 128 kbps
    });

    this._recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this._chunks.push(e.data);
        this._totalBytes += e.data.size;
        this.onDataAvailable?.(this._totalBytes, this.durationMs);

        // Periodically flush chunks to disk to prevent unbounded RAM growth
        const now = Date.now();
        if (now - this._lastAutoSaveTime >= DJVideoRecorder.AUTO_SAVE_INTERVAL_MS) {
          this._autoSaveChunks();
          this._lastAutoSaveTime = now;
        }
      }
    };

    this._recorder.start(1000); // 1-second chunks for progress updates
    this._startTime = performance.now();
    this._recording = true;
    console.log(`[DJVideoRecorder] Started: mimeType=${this._mimeType}`);
  }

  /** Stop recording and return the video Blob */
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this._recorder || !this._recording) {
        resolve(new Blob([], { type: this._mimeType }));
        return;
      }

      this._recorder.onstop = () => {
        const blob = new Blob(this._chunks, { type: this._mimeType });
        this._chunks = [];
        this._recording = false;
        console.log(`[DJVideoRecorder] Stopped: ${(blob.size / 1024 / 1024).toFixed(1)}MB, ${(this.durationMs / 1000).toFixed(0)}s`);
        resolve(blob);
      };

      this._recorder.stop();
    });
  }

  /** Flush accumulated chunks to a downloaded partial file and clear from RAM */
  private _autoSaveChunks(): void {
    if (this._chunks.length === 0) return;
    const blob = new Blob(this._chunks, { type: this._mimeType });
    this._chunks = [];
    this._partIndex++;
    const ext = this._mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    const filename = `set-part${this._partIndex}-${Date.now()}.${ext}`;
    DJVideoRecorder.download(blob, filename);
    console.log(`[DJVideoRecorder] Auto-saved part ${this._partIndex}: ${(blob.size / 1024 / 1024).toFixed(1)}MB → ${filename}`);
  }

  /** Download the blob as a file */
  static download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  get isRecording(): boolean { return this._recording; }
  get durationMs(): number { return this._recording ? performance.now() - this._startTime : 0; }
  get totalBytes(): number { return this._totalBytes; }
  get mimeType(): string { return this._mimeType; }
}

/** Pick the best available video MIME type */
function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }

  return 'video/webm'; // fallback
}
