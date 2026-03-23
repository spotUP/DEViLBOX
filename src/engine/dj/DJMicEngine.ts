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
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'; // Safari fallback

    this._chunks = [];
    this._recorder = new MediaRecorder(this._stream, { mimeType });
    this._recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };
    this._recorder.start(1000); // 1s chunks
    this._recording = true;
  }

  /** Stop recording and return the audio blob */
  stopRecording(): Blob | null {
    if (!this._recording || !this._recorder) return null;
    this._recorder.stop();
    this._recording = false;

    const blob = new Blob(this._chunks, { type: this._recorder.mimeType });
    this._chunks = [];
    this._recorder = null;
    return blob;
  }

  /** Dispose all resources */
  dispose(): void {
    this.stop();
    this._gainNode.disconnect();
  }
}
