import type { DevilboxSynth } from '@/types/synth';

/**
 * PreTrackerEngine - TypeScript layer for PreTracker WASM playback
 *
 * Bridges the AudioWorklet to the TypeScript/React UI layer.
 * Handles WASM module initialization, module loading, and playback control.
 */
export class PreTrackerEngine implements DevilboxSynth {
  private worklet: AudioWorkletNode | null = null;
  private audioContext: AudioContext | null = null;
  private moduleData: ArrayBuffer | null = null;
  private isPlaying = false;
  private currentSubsong = 0;
  private _output: AudioNode | null = null;
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();

  readonly name = 'PreTracker';

  get output(): AudioNode {
    if (!this._output) {
      throw new Error('PreTrackerEngine not initialized. Call init() first.');
    }
    return this._output;
  }

  /**
   * Initialize the PreTrackerEngine
   * @param audioContext The AudioContext instance
   */
  async init(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;

    try {
      // Load PreTracker WASM JS code
      const jsResponse = await fetch('/pretracker/Pretracker.js');
      if (!jsResponse.ok) {
        throw new Error(`Failed to fetch Pretracker.js: ${jsResponse.statusText}`);
      }
      const jsCode = await jsResponse.text();

      // Load PreTracker WASM binary
      const wasmResponse = await fetch('/pretracker/Pretracker.wasm');
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch Pretracker.wasm: ${wasmResponse.statusText}`);
      }
      const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());

      // Register AudioWorklet processor
      try {
        await audioContext.audioWorklet.addModule('/pretracker/PreTracker.worklet.js');
      } catch (error) {
        console.error('Failed to load AudioWorklet module:', error);
        throw error;
      }

      // Create AudioWorkletNode
      this.worklet = new AudioWorkletNode(audioContext, 'pretracker-processor', {
        processorOptions: { sampleRate: audioContext.sampleRate },
      });
      this._output = this.worklet;

      // Set up message event listener
      this.setupMessageListener();

      // Wait for worklet 'ready' signal before sending init
      await this.waitForMessage('ready');

      // Send init with WASM code + binary
      this.worklet.port.postMessage({
        type: 'init',
        sampleRate: audioContext.sampleRate,
        wasmBinary,
        jsCode,
      });

      console.log('[PreTrackerEngine] Initialized successfully');
    } catch (error) {
      console.error('[PreTrackerEngine] Initialization failed:', error);
      this.dispose();
      throw error;
    }
  }

  /**
   * Load a tracker module (e.g., XM, IT, etc.)
   * @param data ArrayBuffer containing the module data
   */
  async load(data: ArrayBuffer): Promise<void> {
    if (!this.worklet) {
      throw new Error('Engine not initialized. Call init() first.');
    }

    this.moduleData = data;

    // Send loadModule message
    this.worklet.port.postMessage({ type: 'loadModule', moduleData: data });

    // Wait for moduleLoaded confirmation
    await this.waitForMessage('moduleLoaded');

    console.log('[PreTrackerEngine] Module loaded successfully');
  }

  /**
   * Start playback
   */
  play(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isPlaying = true;
    console.log('[PreTrackerEngine] Playing');
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.worklet) return;
    this.worklet.port.postMessage({ type: 'stop' });
    this.isPlaying = false;
    console.log('[PreTrackerEngine] Stopped');
  }

  /**
   * Switch to a different subsong
   * @param index The subsong index
   */
  setSubsong(index: number): void {
    if (!this.worklet) return;
    this.currentSubsong = index;
    this.worklet.port.postMessage({ type: 'setSubsong', subsong: index });
    console.log('[PreTrackerEngine] Subsong set to:', index);
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current subsong index
   */
  getCurrentSubsong(): number {
    return this.currentSubsong;
  }

  /**
   * Dispose and clean up all resources
   */
  dispose(): void {
    if (this.worklet) {
      try {
        this.worklet.port.postMessage({ type: 'dispose' });
        this.worklet.disconnect();
      } catch (error) {
        console.warn('[PreTrackerEngine] Error during dispose:', error);
      }
      this.worklet = null;
    }
    this._output = null;
    this.messageHandlers.clear();
    this.audioContext = null;
    this.moduleData = null;
    this.isPlaying = false;
    console.log('[PreTrackerEngine] Disposed');
  }

  /**
   * Set up message listener on the worklet port
   */
  private setupMessageListener(): void {
    if (!this.worklet) return;

    this.worklet.port.onmessage = (event: MessageEvent) => {
      const { type, ...data } = event.data;

      // Handle error messages
      if (type === 'error') {
        console.error('[PreTrackerEngine] Worklet error:', data.message);
        return;
      }

      // Trigger handlers for this message type
      if (this.messageHandlers.has(type)) {
        const handlers = this.messageHandlers.get(type)!;
        for (const handler of handlers) {
          handler(data);
        }
      }
    };
  }

  /**
   * Wait for a specific message type from the worklet
   * @param messageType The message type to wait for
   * @param timeout Maximum wait time in milliseconds (default: 5000)
   */
  private waitForMessage(messageType: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.messageHandlers.has(messageType)) {
          const handlers = this.messageHandlers.get(messageType)!;
          handlers.delete(handler);
        }
        reject(new Error(`Timeout waiting for message type: ${messageType}`));
      }, timeout);

      const handler = (data: any) => {
        clearTimeout(timer);
        if (this.messageHandlers.has(messageType)) {
          const handlers = this.messageHandlers.get(messageType)!;
          handlers.delete(handler);
        }
        resolve(data);
      };

      if (!this.messageHandlers.has(messageType)) {
        this.messageHandlers.set(messageType, new Set());
      }
      this.messageHandlers.get(messageType)!.add(handler);
    });
  }
}
