/**
 * GearmulatorSynth — DSP56300-based VA synth engine (Access Virus, Waldorf, etc.)
 *
 * Loads original firmware ROMs via DSP56300 interpreter emulation in WASM.
 * DSP runs in a Web Worker (with pthreads), audio flows via SAB to an AudioWorklet.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { GearmulatorConfig } from '@typedefs/instrument';
import { getDevilboxAudioContext, noteToMidi, audioNow } from '@/utils/audio-context';

/** Gearmulator synth device types */
export const GM_SYNTH_TYPES = {
  VIRUS_ABC: 0,
  VIRUS_TI: 1,
  WALDORF_MQ: 2,
  WALDORF_XT: 3,
  NORD_LEAD_2X: 4,
  ROLAND_JP8K: 5,
} as const;

export const GM_SYNTH_NAMES: Record<number, string> = {
  0: 'Access Virus A/B/C',
  1: 'Access Virus TI',
  2: 'Waldorf microQ',
  3: 'Waldorf Microwave II/XT',
  4: 'Nord Lead 2x',
  5: 'Roland JP-8000',
};

const DB_NAME = 'devilbox-gearmulator-roms';
const STORE_NAME = 'roms';

/** SAB ring buffer layout constants — must match Gearmulator.worker.js and worklet */
const HEADER_BYTES = 16;
const RING_FRAMES = 8192;

export class GearmulatorSynth implements DevilboxSynth {
  readonly name = 'GearmulatorSynth';
  readonly output: GainNode;

  private workletNode: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();
  private static wasmBinary: ArrayBuffer | null = null;

  public audioContext: AudioContext;
  private _disposed = false;
  private _ready = false;
  private _resolveInit: (() => void) | null = null;
  private _stateResolve: ((data: ArrayBuffer | null) => void) | null = null;
  private config: GearmulatorConfig;
  private channel: number;

  constructor(config: GearmulatorConfig) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this.config = config;
    this.channel = config.channel ?? 0;
  }

  async ensureInitialized(): Promise<void> {
    if (this._disposed) return;
    await GearmulatorSynth.ensureModuleLoaded(this.audioContext);
    await this.createNode();
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}gearmulator/Gearmulator.worklet.js`);
      } catch {
        // Module might already be loaded
      }

      if (!this.wasmBinary) {
        const wasmResponse = await fetch(`${baseUrl}gearmulator/gearmulator_wasm.wasm`);
        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private async createNode(): Promise<void> {
    if (this._disposed) return;

    const romData = await this.loadROM();
    if (!romData) {
      throw new Error(`No ROM loaded for ${GM_SYNTH_NAMES[this.config.synthType] || 'unknown synth'}`);
    }

    const ctx = this.audioContext;

    // Create SharedArrayBuffer for Worker → Worklet audio transfer
    const sabSize = HEADER_BYTES + RING_FRAMES * 2 * 4; // header + interleaved L/R float32
    const sab = new SharedArrayBuffer(sabSize);

    // Create AudioWorkletNode (SAB reader → audio output)
    this.workletNode = new AudioWorkletNode(ctx, 'gearmulator-processor', {
      outputChannelCount: [2],
    });
    this.workletNode.port.postMessage({ type: 'setSAB', sab });
    this.workletNode.connect(this.output);

    // Create Web Worker (runs DSP56300 emulator, writes to SAB)
    const baseUrl = import.meta.env.BASE_URL || '/';
    this.worker = new Worker(`${baseUrl}gearmulator/Gearmulator.worker.js`);

    const readyPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'ready') {
        console.log(`[Gearmulator] Device ready — ${GM_SYNTH_NAMES[this.config.synthType]}, sampleRate=${data.sampleRate}`);
        this._ready = true;
        if (this._resolveInit) {
          this._resolveInit();
          this._resolveInit = null;
        }
      } else if (data.type === 'error') {
        console.error('[Gearmulator] Worker error:', data.message);
      } else if (data.type === 'state') {
        if (this._stateResolve) {
          this._stateResolve(data.data);
          this._stateResolve = null;
        }
      }
    };
    this.worker.onerror = (e) => {
      console.error('[Gearmulator] Worker crashed:', e.message);
    };

    // Send init to worker with ROM, WASM binary, and SAB
    // ROM from IndexedDB may be Uint8Array or ArrayBuffer — normalize to ArrayBuffer for transfer
    const wasmCopy = GearmulatorSynth.wasmBinary!.slice(0);
    const romBuffer = romData instanceof ArrayBuffer ? romData.slice(0)
      : (romData as Uint8Array).buffer.slice(0);
    this.worker.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: wasmCopy,
      jsCode: null,
      romData: romBuffer,
      synthType: this.config.synthType,
      sab,
    }, [wasmCopy, romBuffer]);

    // Wait for ready signal (with timeout)
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Gearmulator init timeout (30s)')), 30000)
    );
    await Promise.race([readyPromise, timeout]);

    // Restore state if available
    if (this.config.stateBase64) {
      const binary = atob(this.config.stateBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      this.worker.postMessage({ type: 'setState', data: bytes.buffer }, [bytes.buffer]);
    }

    // Set clock percent if configured
    if (this.config.clockPercent && this.config.clockPercent !== 100) {
      this.worker.postMessage({ type: 'setClockPercent', percent: this.config.clockPercent });
    }
  }

  // ─── ROM Management (IndexedDB) ────────────────────────────────────────────

  private async loadROM(): Promise<ArrayBuffer | Uint8Array | null> {
    const key = this.config.romKey;
    if (!key) return null;

    return GearmulatorSynth.loadROMFromDB(key);
  }

  static async loadROMFromDB(key: string): Promise<ArrayBuffer | Uint8Array | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const get = store.get(key);
        get.onsuccess = () => resolve(get.result as ArrayBuffer | null);
        get.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  }

  static async saveROMToDB(key: string, data: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async listROMs(): Promise<string[]> {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const keys = store.getAllKeys();
        keys.onsuccess = () => resolve(keys.result as string[]);
        keys.onerror = () => resolve([]);
      };
      request.onerror = () => resolve([]);
    });
  }

  static async deleteROM(key: string): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      request.onerror = () => resolve();
    });
  }

  // ─── MIDI API ──────────────────────────────────────────────────────────────

  triggerAttack(note: string | number, _time?: number, velocity?: number): void {
    if (!this._ready || !this.worker) return;
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    this.worker.postMessage({
      type: 'noteOn',
      note: midi,
      velocity: velocity ?? 100,
      channel: this.channel,
    });
  }

  triggerRelease(note?: string | number, _time?: number): void {
    if (!this._ready || !this.worker) return;
    const midi = note != null ? (typeof note === 'string' ? noteToMidi(note) : note) : 60;
    this.worker.postMessage({
      type: 'noteOff',
      note: midi,
      channel: this.channel,
    });
  }

  triggerAttackRelease(note: string | number, duration: number, time?: number, velocity?: number): void {
    this.triggerAttack(note, time, velocity);
    const releaseTime = (time ?? audioNow()) + duration;
    setTimeout(() => this.triggerRelease(note), releaseTime * 1000 - Date.now());
  }

  /** Send a MIDI CC message */
  sendCC(cc: number, value: number): void {
    if (!this._ready || !this.worker) return;
    this.worker.postMessage({
      type: 'cc',
      cc,
      value,
      channel: this.channel,
    });
  }

  /** Send a program change */
  sendProgramChange(program: number): void {
    if (!this._ready || !this.worker) return;
    this.worker.postMessage({
      type: 'programChange',
      program,
      channel: this.channel,
    });
  }

  /** Send a raw sysex message */
  sendSysex(data: Uint8Array): void {
    if (!this._ready || !this.worker) return;
    const copy = new Uint8Array(data);
    this.worker.postMessage({ type: 'sysex', data: copy.buffer }, [copy.buffer]);
  }

  /** Set DSP clock percentage for performance tuning */
  setClockPercent(percent: number): void {
    if (!this._ready || !this.worker) return;
    this.worker.postMessage({ type: 'setClockPercent', percent });
  }

  /** Request current state (returned via onState callback) */
  async getState(): Promise<ArrayBuffer | null> {
    if (!this._ready || !this.worker) return null;
    return new Promise((resolve) => {
      this._stateResolve = resolve;
      this.worker!.postMessage({ type: 'getState' });
      setTimeout(() => {
        if (this._stateResolve === resolve) {
          this._stateResolve = null;
          resolve(null);
        }
      }, 5000);
    });
  }

  set(param: string, value: number): void {
    // Gearmulator uses MIDI CCs for parameter control
    // Map common param names to CC numbers
    this.sendCC(parseInt(param) || 0, Math.round(value * 127));
  }

  get(_param: string): number | undefined {
    return undefined;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._ready = false;

    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' });
      this.worker.terminate();
      this.worker = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    this.output.disconnect();
  }
}

/** Create a GearmulatorSynth and initialize it */
export async function createGearmulatorSynth(
  config: GearmulatorConfig,
  volume?: number,
): Promise<GearmulatorSynth> {
  const synth = new GearmulatorSynth(config);
  if (volume !== undefined) {
    const gain = Math.pow(10, volume / 20); // dB to linear
    synth.output.gain.value = gain;
  }
  await synth.ensureInitialized();
  return synth;
}
