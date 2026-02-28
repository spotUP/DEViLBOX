/**
 * SuperColliderEngine.ts - Singleton scsynth WASM engine wrapper
 *
 * Manages the AudioWorklet node for SuperCollider synthesis. Loads SC.js + SC.wasm
 * into the worklet, then exposes loadSynthDef / noteOn / noteOff / setNodeParams
 * via OSC messages encoded by oscEncoder.ts.
 *
 * Follows the UADEEngine pattern: static getInstance(AudioContext) with WeakMap caching.
 */

import { oscLoadSynthDef, oscNewSynth, oscSetParams } from './oscEncoder';

// One pending-init promise per AudioContext, so concurrent getInstance calls share the same boot.
const instanceCache = new WeakMap<AudioContext, Promise<SuperColliderEngine>>();

export class SuperColliderEngine {
  /** Connect this GainNode to ToneEngine's destination. */
  readonly output: GainNode;

  private _node: AudioWorkletNode;
  private _disposed = false;

  // Private constructor — callers must use getInstance().
  private constructor(node: AudioWorkletNode, output: GainNode) {
    this._node = node;
    this.output = output;
  }

  // ---------------------------------------------------------------------------
  // Singleton factory
  // ---------------------------------------------------------------------------

  /**
   * Returns (or creates) the SuperColliderEngine for the given AudioContext.
   * Concurrent calls for the same context share a single init promise.
   */
  static getInstance(audioContext: AudioContext): Promise<SuperColliderEngine> {
    const cached = instanceCache.get(audioContext);
    if (cached) return cached;

    const promise = SuperColliderEngine._boot(audioContext);
    // Evict on failure so callers can retry (e.g. on transient network error)
    promise.catch(() => instanceCache.delete(audioContext));
    instanceCache.set(audioContext, promise);
    return promise;
  }

  private static async _boot(audioContext: AudioContext): Promise<SuperColliderEngine> {
    // 1. Register the AudioWorklet module.
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    await audioContext.audioWorklet.addModule(`${baseUrl}sc/DEViLBOX.SC.worklet.js`);

    // 2. Fetch SC.js (text) and SC.wasm (binary) in parallel.
    const [jsResponse, wasmResponse] = await Promise.all([
      fetch(`${baseUrl}sc/SC.js`),
      fetch(`${baseUrl}sc/SC.wasm`),
    ]);

    if (!jsResponse.ok) {
      throw new Error(`[SuperColliderEngine] Failed to fetch SC.js: ${jsResponse.status}`);
    }
    if (!wasmResponse.ok) {
      throw new Error(`[SuperColliderEngine] Failed to fetch SC.wasm: ${wasmResponse.status}`);
    }

    const [scJs, wasmBinary] = await Promise.all([
      jsResponse.text(),
      wasmResponse.arrayBuffer(),
    ]);

    // 3. Create the AudioWorkletNode.
    const node = new AudioWorkletNode(audioContext, 'devilbox-sc-processor');

    // 4. Create output GainNode and connect.
    const output = audioContext.createGain();
    node.connect(output);

    // 5. Send init message and wait for 'ready'.
    await new Promise<void>((resolve, reject) => {
      node.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { type: string; message?: string };
        if (data.type === 'ready') {
          resolve();
        } else if (data.type === 'error') {
          reject(new Error(`[SuperColliderEngine] Worklet error: ${data.message ?? '(no message)'}`));
        }
      };

      node.port.postMessage(
        {
          type: 'init',
          scJs,
          wasmBinary,
          blockSize: 128,
          sampleRate: audioContext.sampleRate,
        },
        [wasmBinary],
      );
    });

    // After init the port listener is replaced by the instance method below.
    const engine = new SuperColliderEngine(node, output);
    engine._attachPortListener();
    return engine;
  }

  // ---------------------------------------------------------------------------
  // Port message handler (post-ready messages, e.g. future error reporting)
  // ---------------------------------------------------------------------------

  private _attachPortListener(): void {
    this._node.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; message?: string };
      if (data.type === 'error') {
        console.error('[SuperColliderEngine] Worklet error:', data.message);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // OSC send helper
  // ---------------------------------------------------------------------------

  private sendOsc(packet: Uint8Array): void {
    if (this._disposed) return;
    // Slice to get a plain ArrayBuffer (packet may be a view into a larger buffer).
    const buf = packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength);
    this._node.port.postMessage({ type: 'osc', data: buf }, [buf]);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Load a compiled SynthDef binary into scsynth (/d_recv). */
  loadSynthDef(binary: Uint8Array): void {
    this.sendOsc(oscLoadSynthDef(binary));
  }

  /**
   * Create a new synth node (/s_new).
   * @param nodeId  - Unique node ID (caller is responsible for uniqueness)
   * @param defName - SynthDef name as compiled into the binary
   * @param params  - Initial control values (e.g. { freq: 440, gate: 1 })
   */
  noteOn(nodeId: number, defName: string, params: Record<string, number>): void {
    this.sendOsc(oscNewSynth(defName, nodeId, params));
  }

  /**
   * Release a running synth node by setting gate=0 (/n_set).
   * The SynthDef is expected to respond to gate≤0 and free itself via EnvGen/doneAction.
   */
  noteOff(nodeId: number): void {
    this.sendOsc(oscSetParams(nodeId, { gate: 0 }));
  }

  /**
   * Update named control parameters on a live synth node (/n_set).
   */
  setNodeParams(nodeId: number, params: Record<string, number>): void {
    this.sendOsc(oscSetParams(nodeId, params));
  }

  /** Disconnect and tear down the worklet. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._node.port.postMessage({ type: 'dispose' });
    this._node.disconnect();
  }
}
