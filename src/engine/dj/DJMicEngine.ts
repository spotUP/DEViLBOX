/**
 * DJMicEngine — Microphone input for DJ mode.
 *
 * Routes mic audio through a gain node to the mixer's samplerInput
 * (bypasses crossfader). Optionally records to Opus/WebM via MediaRecorder.
 */

import * as Tone from 'tone';

export class DJMicEngine {
  private _stream: MediaStream | null = null;
  private _sourceNode: MediaStreamAudioSourceNode | null = null;
  private _gainNode: GainNode;
  private _recorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];
  private _active = false;
  private _recording = false;
  private _recMimeType = '';
  private _partIndex = 0;
  private _lastAutoSaveTime = 0;
  private static readonly AUTO_SAVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(mixerSamplerInput: GainNode) {
    const ctx = Tone.getContext().rawContext as AudioContext;
    this._gainNode = ctx.createGain();
    this._gainNode.gain.value = 0.8;
    this._gainNode.connect(mixerSamplerInput);
  }

  /** Check if getUserMedia is available */
  static isSupported(): boolean {
    return !!(navigator.mediaDevices?.getUserMedia);
  }

  /** Start mic input (requests permission if needed) */
  async start(): Promise<void> {
    if (this._active) return;
    if (!DJMicEngine.isSupported()) throw new Error('Microphone not supported');

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });

    const ctx = Tone.getContext().rawContext as AudioContext;
    this._sourceNode = ctx.createMediaStreamSource(this._stream);
    this._sourceNode.connect(this._gainNode);
    this._active = true;
  }

  /** Stop mic input */
  stop(): void {
    if (!this._active) return;
    this.stopRecording();
    this._sourceNode?.disconnect();
    this._sourceNode = null;
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._active = false;
  }

  /** Set mic gain (0-1) */
  setGain(gain: number): void {
    this._gainNode.gain.value = Math.max(0, Math.min(2, gain));
  }

  get gain(): number { return this._gainNode.gain.value; }
  get isActive(): boolean { return this._active; }
  get isRecording(): boolean { return this._recording; }

  // ── Recording ─────────────────────────────────────────────────────────

  /** Start recording mic audio to Opus/WebM */
  startRecording(): void {
    if (this._recording || !this._stream) return;

    // Pick best available codec
    this._recMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'; // Safari fallback

    this._chunks = [];
    this._partIndex = 0;
    this._lastAutoSaveTime = Date.now();
    this._recorder = new MediaRecorder(this._stream, { mimeType: this._recMimeType });
    this._recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this._chunks.push(e.data);

        // Periodically flush chunks to disk to prevent unbounded RAM growth
        const now = Date.now();
        if (now - this._lastAutoSaveTime >= DJMicEngine.AUTO_SAVE_INTERVAL_MS) {
          this._autoSaveChunks();
          this._lastAutoSaveTime = now;
        }
      }
    };
    this._recorder.start(1000); // 1s chunks
    this._recording = true;
  }

  /** Stop recording and return the audio blob */
  stopRecording(): Blob | null {
    if (!this._recording || !this._recorder) return null;
    this._recorder.stop();
    this._recording = false;

    const blob = new Blob(this._chunks, { type: this._recMimeType });
    this._chunks = [];
    this._recorder = null;
    return blob;
  }

  /** Flush accumulated chunks to a downloaded partial file and clear from RAM */
  private _autoSaveChunks(): void {
    if (this._chunks.length === 0) return;
    const blob = new Blob(this._chunks, { type: this._recMimeType });
    this._chunks = [];
    this._partIndex++;
    const ext = this._recMimeType.startsWith('audio/mp4') ? 'm4a' : 'webm';
    const filename = `mic-part${this._partIndex}-${Date.now()}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[DJMicEngine] Auto-saved mic part ${this._partIndex}: ${(blob.size / 1024 / 1024).toFixed(1)}MB → ${filename}`);
  }

  /** Dispose all resources */
  dispose(): void {
    this.stop();
    this._gainNode.disconnect();
  }
}
