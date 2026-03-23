/**
 * DJLiveStream — Live stream DJ set to YouTube Live via server RTMP relay.
 *
 * Architecture:
 *   Browser MediaRecorder → WebSocket → Server → ffmpeg → RTMP → YouTube
 *
 * The browser sends WebM video chunks over a WebSocket connection.
 * The server pipes them through ffmpeg to remux to FLV and forward
 * to YouTube's RTMP ingest server.
 */

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://devilbox.uprough.net';

export class DJLiveStream {
  private _ws: WebSocket | null = null;
  private _recorder: MediaRecorder | null = null;
  private _active = false;
  private _startTime = 0;

  /** Callbacks */
  onStatusChange?: (status: 'connecting' | 'live' | 'error' | 'stopped') => void;
  onError?: (error: string) => void;

  /** Start live streaming a MediaStream to a platform (youtube, twitch, or custom RTMP) */
  async startStream(stream: MediaStream, streamKey: string, platform: 'youtube' | 'twitch' | 'custom' = 'youtube'): Promise<void> {
    if (this._active) return;

    // Pick best video codec
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm;codecs=vp8,opus';

    // Connect WebSocket to server relay
    this.onStatusChange?.('connecting');

    this._ws = new WebSocket(`${WS_URL}/api/stream/ingest?key=${encodeURIComponent(streamKey)}&platform=${platform}`);
    this._ws.binaryType = 'arraybuffer';

    await new Promise<void>((resolve, reject) => {
      if (!this._ws) { reject(new Error('No WebSocket')); return; }
      this._ws.onopen = () => resolve();
      this._ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this._ws.onclose = (e) => {
        if (this._active) {
          this.onStatusChange?.('error');
          this.onError?.(`Stream disconnected: ${e.reason || 'unknown'}`);
          this._active = false;
        }
      };
      // Timeout
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    // Start recording and streaming chunks
    this._recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000,
    });

    this._recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this._ws?.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then(buf => {
          this._ws?.send(buf);
        });
      }
    };

    this._recorder.start(1000); // 1-second chunks for low latency
    this._active = true;
    this._startTime = performance.now();
    this.onStatusChange?.('live');
    console.log('[DJLiveStream] Started streaming to YouTube');
  }

  /** Stop the live stream */
  stopStream(): void {
    if (!this._active) return;
    this._active = false;

    try { this._recorder?.stop(); } catch { /* ignore */ }
    this._recorder = null;

    try { this._ws?.close(1000, 'stream ended'); } catch { /* ignore */ }
    this._ws = null;

    this.onStatusChange?.('stopped');
    console.log('[DJLiveStream] Stopped');
  }

  get isActive(): boolean { return this._active; }
  get durationMs(): number { return this._active ? performance.now() - this._startTime : 0; }
}
