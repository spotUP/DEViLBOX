import {
  parseKontaktAudioFrame,
  type BridgeSlotInfo,
  type KontaktBridgeMessage,
  type KontaktErrorMessage,
  type KontaktInstrumentListMessage,
  type KontaktInstrumentLoadedMessage,
  type KontaktPluginListMessage,
  type KontaktPluginLoadedMessage,
  type KontaktSlotListMessage,
  type KontaktStatusMessage,
  type KontaktInstrument,
  type PluginInfo,
} from './protocol';
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export type KontaktBridgeStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface KontaktBridgeSnapshot {
  bridgeStatus: KontaktBridgeStatus;
  connected: boolean;
  pluginName: string | null;
  currentPreset: string | null;
  sampleRate: number;
  error: string | null;
  plugins: PluginInfo[];
  instruments: KontaktInstrument[];
  slots: BridgeSlotInfo[];
}

type KontaktBridgeListener = (snapshot: KontaktBridgeSnapshot) => void;

const EMPTY_SNAPSHOT: KontaktBridgeSnapshot = {
  bridgeStatus: 'disconnected',
  connected: false,
  pluginName: null,
  currentPreset: null,
  sampleRate: 44100,
  error: null,
  plugins: [],
  instruments: [],
  slots: [],
};

// Ring buffer for smooth audio playback — eliminates stutter from network jitter
const RING_SIZE = 44100 * 2; // 2 seconds ring buffer
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
      return;
    }
    const toDrain = Math.min(count, this.available);
    for (let i = 0; i < toDrain; i++) {
      outLeft[i] = this.left[this.readPos];
      outRight[i] = this.right[this.readPos];
      this.readPos = (this.readPos + 1) % RING_SIZE;
    }
    this.available -= toDrain;
    // On underrun, DON'T reset primed — just output partial + silence for remainder
    // This avoids a 93ms re-buffering gap on momentary stalls
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
    return {
      ...this.snapshot,
      plugins: [...this.snapshot.plugins],
      instruments: [...this.snapshot.instruments],
      slots: [...this.snapshot.slots],
    };
  }

  /** Ask the dev server to spawn the bridge process if not already running. */
  private async ensureBridgeRunning(): Promise<void> {
    try {
      const res = await fetch('/api/bridge/start', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn('[KontaktBridge] Bridge auto-start failed:', body);
      } else {
        const body = await res.json();
        console.log('[KontaktBridge] Bridge auto-start:', body.status);
      }
    } catch {
      // Dev server may not be running (production build) — ignore
    }
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

    // Auto-start the bridge process before attempting WebSocket connection
    await this.ensureBridgeRunning();

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(`ws://localhost:${this.port}`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        this.ws = ws;
        void this.ensureAudio();
        this.setSnapshot({ bridgeStatus: 'ready', connected: false, error: null });
        this.requestStatus();
        this.listPlugins();
        this.listInstruments();
        this.listSlots();
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
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setSnapshot({ ...EMPTY_SNAPSHOT });
  }

  noteOn(note: number, velocity: number, channel = 0, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'note_on', note, velocity, channel }, slot));
  }

  noteOff(note: number, channel = 0, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'note_off', note, channel }, slot));
  }

  programChange(program: number, channel = 0, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'program_change', program, channel }, slot));
  }

  cc(ccNum: number, value: number, channel = 0, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'cc', cc: ccNum, value, channel }, slot));
  }

  transportStart(bpm: number, beat = 0): void {
    this.trySend({ type: 'transport', playing: true, bpm, beat });
  }

  transportStop(): void {
    this.trySend({ type: 'transport', playing: false, bpm: 120, beat: 0 });
  }

  transportSetTempo(bpm: number): void {
    this.trySend({ type: 'transport', playing: true, bpm, beat: -1 });
  }

  loadPreset(path: string, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'load_preset', path }, slot));
  }

  listPlugins(): void {
    this.send({ type: 'list_plugins' });
  }

  loadPlugin(name: string): void {
    this.send({ type: 'load_plugin', name });
  }

  unloadPlugin(slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'unload_plugin' }, slot));
  }

  showGUI(slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'show_gui' }, slot));
  }

  closeGUI(slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'close_gui' }, slot));
  }

  listInstruments(): void {
    this.send({ type: 'list_instruments' });
  }

  loadInstrument(name: string): void {
    this.send({ type: 'load_instrument', name });
  }

  cacheState(name: string): void {
    this.send({ type: 'cache_state', name });
  }

  saveState(path: string, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'save_state', path }, slot));
  }

  setState(path: string, slot?: number): void {
    this.send(this.withOptionalSlot({ type: 'set_state', path }, slot));
  }

  listSlots(): void {
    this.send({ type: 'list_slots' });
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

  private withOptionalSlot<T extends Record<string, unknown>>(payload: T, slot?: number): T & { slot?: number } {
    return slot === undefined ? payload : { ...payload, slot };
  }

  private upsertSlot(slotInfo: BridgeSlotInfo): BridgeSlotInfo[] {
    const slots = this.snapshot.slots.filter((entry) => entry.slot !== slotInfo.slot);
    slots.push(slotInfo);
    slots.sort((a, b) => a.slot - b.slot);
    return slots;
  }

  /** Send without throwing if disconnected — for fire-and-forget messages like transport sync. */
  private trySend(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private setSnapshot(partial: Partial<KontaktBridgeSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener({
        ...this.snapshot,
        plugins: [...this.snapshot.plugins],
        instruments: [...this.snapshot.instruments],
        slots: [...this.snapshot.slots],
      });
    }
  }

  private async ensureAudio(): Promise<void> {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      return;
    }

    if (this.processor) return; // Already set up

    // Use the app's main AudioContext (from Tone.js) so we route through the mixer
    const ctx = Tone.getContext().rawContext as AudioContext;

    // ScriptProcessorNode with 4096 buffer — larger buffer reduces underruns
    this.processor = ctx.createScriptProcessor(4096, 0, 2);
    this.processor.onaudioprocess = (event) => {
      this.drainAudio(event.outputBuffer);
    };

    // Connect to Tone.js synthBus so AU plugin audio goes through the mixer/effects chain
    try {
      const { getToneEngine } = await import('@engine/ToneEngine');
      const engine = getToneEngine();
      if (engine?.synthBus) {
        const nativeNode = getNativeAudioNode(engine.synthBus);
        if (nativeNode) {
          this.processor.connect(nativeNode);
        } else {
          this.processor.connect(ctx.destination);
        }
      } else {
        this.processor.connect(ctx.destination);
      }
    } catch {
      this.processor.connect(ctx.destination);
    }

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
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
        pluginName: typeof status.pluginName === 'string' ? status.pluginName : null,
        currentPreset: typeof status.presetName === 'string' ? status.presetName : null,
        sampleRate: Number.isFinite(status.sampleRate) ? status.sampleRate : this.snapshot.sampleRate,
        slots: Array.isArray(status.slots) ? status.slots : this.snapshot.slots,
        error: null,
      });
      return;
    }

    if (type === 'plugin_loaded') {
      const loaded = message as KontaktPluginLoadedMessage;
      this.setSnapshot({
        pluginName: loaded.pluginName,
        slots: this.upsertSlot({
          slot: loaded.slot,
          pluginName: loaded.pluginName,
          presetName: null,
          connected: true,
        }),
        error: null,
      });
      window.setTimeout(() => {
        try {
          this.programChange(0, 0, loaded.slot);
        } catch {
          // Bridge may have disconnected before the slot finished loading.
        }
      }, 500);
      return;
    }

    if (type === 'slot_list') {
      const list = message as KontaktSlotListMessage;
      this.setSnapshot({ slots: Array.isArray(list.slots) ? list.slots : [] });
      return;
    }

    if (type === 'plugin_list') {
      const list = message as KontaktPluginListMessage;
      this.setSnapshot({ plugins: Array.isArray(list.plugins) ? list.plugins : [] });
      return;
    }

    if (type === 'instrument_list') {
      const list = message as KontaktInstrumentListMessage;
      this.setSnapshot({ instruments: Array.isArray(list.instruments) ? list.instruments : [] });
      return;
    }

    if (type === 'instrument_loaded') {
      const loaded = message as KontaktInstrumentLoadedMessage;
      this.setSnapshot({ currentPreset: loaded.name });
      // Refresh instrument list to update cached status
      this.listInstruments();
      return;
    }

    if (type === 'state_cached') {
      // Refresh instrument list to update cached status
      this.listInstruments();
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
