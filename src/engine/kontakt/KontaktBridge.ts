import {
  parseKontaktAudioFrame,
  type KontaktBridgeMessage,
  type KontaktErrorMessage,
  type KontaktStatusMessage,
} from './protocol';

export type KontaktBridgeStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface KontaktBridgeSnapshot {
  bridgeStatus: KontaktBridgeStatus;
  connected: boolean;
  currentPreset: string | null;
  sampleRate: number;
  error: string | null;
}

type KontaktBridgeListener = (snapshot: KontaktBridgeSnapshot) => void;

const EMPTY_SNAPSHOT: KontaktBridgeSnapshot = {
  bridgeStatus: 'disconnected',
  connected: false,
  currentPreset: null,
  sampleRate: 44100,
  error: null,
};

// Ring buffer for smooth audio playback — eliminates stutter from network jitter
const RING_SIZE = 44100; // 1 second ring buffer
const PREFILL_SAMPLES = 4096; // ~93ms pre-buffer before starting drain

class AudioRingBuffer {
  private left = new Float32Array(RING_SIZE);
  private right = new Float32Array(RING_SIZE);
  private writePos = 0;
  private readPos = 0;
  private available = 0;
  private primed = false;

  push(leftData: Float32Array, rightData: Float32Array, count: number): void {
    for (let i = 0; i < count; i++) {
      this.left[this.writePos] = leftData[i];
      this.right[this.writePos] = rightData[i];
      this.writePos = (this.writePos + 1) % RING_SIZE;
    }
    this.available = Math.min(this.available + count, RING_SIZE);
    if (this.available >= PREFILL_SAMPLES) {
      this.primed = true;
    }
  }

  drain(outLeft: Float32Array, outRight: Float32Array, count: number): void {
    if (!this.primed) {
      // Still buffering — output silence
      return;
    }
    const toDrain = Math.min(count, this.available);
    for (let i = 0; i < toDrain; i++) {
      outLeft[i] = this.left[this.readPos];
      outRight[i] = this.right[this.readPos];
      this.readPos = (this.readPos + 1) % RING_SIZE;
    }
    this.available -= toDrain;
    // If we underrun, reset prime to re-buffer
    if (this.available === 0) {
      this.primed = false;
    }
  }

  clear(): void {
    this.writePos = 0;
    this.readPos = 0;
    this.available = 0;
    this.primed = false;
  }
}

export class KontaktBridge {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private ringBuffer = new AudioRingBuffer();
  private listeners = new Set<KontaktBridgeListener>();
  private connectPromise: Promise<void> | null = null;
  private snapshot: KontaktBridgeSnapshot = { ...EMPTY_SNAPSHOT };

  readonly port = 4009;

  subscribe(listener: KontaktBridgeListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): KontaktBridgeSnapshot {
    return { ...this.snapshot };
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      await this.ensureAudio();
      this.requestStatus();
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.setSnapshot({ bridgeStatus: 'connecting', error: null });

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(`ws://localhost:${this.port}`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        this.ws = ws;
        void this.ensureAudio();
        this.setSnapshot({ bridgeStatus: 'ready', connected: true, error: null });
        this.requestStatus();
        settled = true;
        resolve();
      };

      ws.onmessage = (event) => {
        void this.handleMessage(event);
      };

      ws.onerror = () => {
        const message = 'Could not connect to Kontakt bridge on ws://localhost:4009';
        this.setSnapshot({ bridgeStatus: 'error', connected: false, error: message });
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.ringBuffer.clear();
        this.setSnapshot({ bridgeStatus: 'disconnected', connected: false });
        if (!settled) {
          settled = true;
          reject(new Error('Kontakt bridge disconnected before it became ready'));
        }
      };
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise ?? Promise.resolve();
  }

  disconnect(): void {
    this.ringBuffer.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setSnapshot({ ...EMPTY_SNAPSHOT });
  }

  noteOn(note: number, velocity: number, channel = 0): void {
    this.send({ type: 'note_on', note, velocity, channel });
  }

  noteOff(note: number, channel = 0): void {
    this.send({ type: 'note_off', note, channel });
  }

  cc(ccNum: number, value: number, channel = 0): void {
    this.send({ type: 'cc', cc: ccNum, value, channel });
  }

  loadPreset(path: string): void {
    this.send({ type: 'load_preset', path });
  }

  requestStatus(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'get_status' }));
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('Kontakt bridge not connected');
    }
    this.ws.send(JSON.stringify(payload));
  }

  private setSnapshot(partial: Partial<KontaktBridgeSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener({ ...this.snapshot });
    }
  }

  private async ensureAudio(): Promise<void> {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      return;
    }

    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
      this.processor = this.audioCtx.createScriptProcessor(2048, 0, 2);
      this.processor.onaudioprocess = (event) => {
        this.drainAudio(event.outputBuffer);
      };
      this.processor.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
  }

  private drainAudio(outputBuffer: AudioBuffer): void {
    const left = outputBuffer.getChannelData(0);
    const right = outputBuffer.getChannelData(1);
    left.fill(0);
    right.fill(0);
    this.ringBuffer.drain(left, right, outputBuffer.length);
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data) as KontaktBridgeMessage;
      this.handleJsonMessage(message);
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      this.handleAudioFrame(event.data);
      return;
    }

    if (event.data instanceof Blob) {
      this.handleAudioFrame(await event.data.arrayBuffer());
    }
  }

  private handleJsonMessage(message: KontaktBridgeMessage): void {
    const type = typeof message.type === 'string' ? message.type : null;
    if (type === 'status') {
      const status = message as KontaktStatusMessage;
      this.setSnapshot({
        bridgeStatus: 'ready',
        connected: Boolean(status.connected),
        currentPreset: typeof status.presetName === 'string' ? status.presetName : null,
        sampleRate: Number.isFinite(status.sampleRate) ? status.sampleRate : this.snapshot.sampleRate,
        error: null,
      });
      return;
    }

    if (type === 'error') {
      const error = message as KontaktErrorMessage;
      this.setSnapshot({
        bridgeStatus: 'error',
        error: error.message,
      });
    }
  }

  private handleAudioFrame(buffer: ArrayBuffer): void {
    const frame = parseKontaktAudioFrame(buffer);
    if (!frame) {
      return;
    }

    this.ringBuffer.push(frame.left, frame.right, frame.sampleCount);
    void this.ensureAudio();
  }
}

export const kontaktBridge = new KontaktBridge();
