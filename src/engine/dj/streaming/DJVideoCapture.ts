/**
 * DJVideoCapture — Combines a visual canvas with DJ master audio
 * into a single MediaStream for recording or live streaming.
 *
 * Visual sources:
 *  - 'vj'      → Butterchurn/ProjectM canvas (60fps)
 *  - 'dj-ui'   → PixiJS renderer canvas (30fps)
 *  - 'overlay'  → Composite canvas with visualizer + track info
 *
 * Audio source: Tone.Destination → MediaStreamDestination
 */

import * as Tone from 'tone';

export type VideoSource = 'vj' | 'dj-ui' | 'overlay';

/** Registry for canvas sources — components register their canvas here */
const _canvasRegistry = new Map<VideoSource, HTMLCanvasElement>();

/** Register a canvas for video capture (called by VJView, PixiApp, etc.) */
export function registerCaptureCanvas(source: VideoSource, canvas: HTMLCanvasElement | null): void {
  if (canvas) {
    _canvasRegistry.set(source, canvas);
  } else {
    _canvasRegistry.delete(source);
  }
}

/** Get a registered canvas */
export function getCaptureCanvas(source: VideoSource): HTMLCanvasElement | null {
  return _canvasRegistry.get(source) ?? null;
}

export class DJVideoCapture {
  private _stream: MediaStream | null = null;
  private _audioDestination: MediaStreamAudioDestinationNode | null = null;
  private _source: VideoSource | null = null;
  private _active = false;

  /** Start capturing video + audio into a combined MediaStream */
  startCapture(source: VideoSource, fps = 30): MediaStream {
    if (this._active) this.stopCapture();

    const canvas = getCaptureCanvas(source);
    if (!canvas) {
      throw new Error(`No canvas registered for source "${source}". Make sure the view is active.`);
    }

    // Video track from canvas
    const videoStream = canvas.captureStream(fps);
    const videoTrack = videoStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error(`Canvas "${source}" produced no video track`);
    }

    // Audio track from Tone.js master output
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    this._audioDestination = rawCtx.createMediaStreamDestination();

    // Connect Tone.Destination's output to our stream destination
    // Tone.Destination wraps a native GainNode — connect it
    const destNode = (Tone.getDestination() as any).output as AudioNode
      ?? (Tone.getDestination() as any)._gainNode as AudioNode
      ?? Tone.getDestination();

    try {
      // Try connecting the native node directly
      const nativeNode = (destNode as any)._nativeAudioNode ?? (destNode as any).input ?? destNode;
      if (nativeNode && typeof nativeNode.connect === 'function') {
        nativeNode.connect(this._audioDestination);
      }
    } catch {
      // Fallback: connect via Tone.js API
      console.warn('[DJVideoCapture] Direct node connect failed, trying Tone.connect');
      Tone.connect(Tone.getDestination(), this._audioDestination as any);
    }

    const audioTrack = this._audioDestination.stream.getAudioTracks()[0];

    // Combine video + audio into one stream
    this._stream = new MediaStream([videoTrack]);
    if (audioTrack) {
      this._stream.addTrack(audioTrack);
    }

    this._source = source;
    this._active = true;

    console.log(`[DJVideoCapture] Started: source=${source}, fps=${fps}, hasAudio=${!!audioTrack}`);
    return this._stream;
  }

  /** Stop capturing and release all resources */
  stopCapture(): void {
    if (!this._active) return;

    // Disconnect audio tap
    if (this._audioDestination) {
      try {
        const destNode = (Tone.getDestination() as any).output as AudioNode
          ?? (Tone.getDestination() as any)._gainNode as AudioNode;
        const nativeNode = (destNode as any)?._nativeAudioNode ?? (destNode as any)?.input ?? destNode;
        if (nativeNode && typeof nativeNode.disconnect === 'function') {
          try { nativeNode.disconnect(this._audioDestination); } catch { /* not connected */ }
        }
      } catch { /* cleanup best-effort */ }
      this._audioDestination = null;
    }

    // Stop all tracks
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._source = null;
    this._active = false;

    console.log('[DJVideoCapture] Stopped');
  }

  get isActive(): boolean { return this._active; }
  get currentSource(): VideoSource | null { return this._source; }
  get stream(): MediaStream | null { return this._stream; }
}
