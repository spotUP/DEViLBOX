/**
 * JSIDPlay2Engine.ts
 * 
 * Wrapper for JSIDPlay2 - Perfect C64 emulation via Web Worker.
 * 
 * Architecture:
 *   Main thread creates Worker('/deepsid/jsidplay2-004.wasm_gc-worker.js')
 *   Worker loads TeaVM WASM-GC runtime + jsidplay2 WASM module
 *   Communication is via postMessage/addEventListener('message')
 *   Worker emits SAMPLES events with Float32Array left/right buffers
 *   Main thread feeds samples into ScriptProcessorNode ring buffer
 * 
 * Worker API:
 *   INITIALISE → INITIALISED  (load WASM)
 *   OPEN → OPENED             (load SID file)
 *   CLOCK → CLOCKED           (advance emulation, triggers SAMPLES events)
 *   GET_TUNE_INFO → GOT_TUNE_INFO  (metadata)
 */

export interface JSIDPlay2Config {
  chipModel?: '6581' | '8580';
  sampleRate?: number;
  forceSIDModel?: boolean;
  enableStereo?: boolean;
}

export interface SIDVoiceState {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  adsr: { attack: number; decay: number; sustain: number; release: number };
  gate: boolean;
}

/**
 * JSIDPlay2 Engine Wrapper — Worker-based message passing
 */
export class JSIDPlay2Engine {
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private outputNode: AudioNode | null = null;
  private isPlaying = false;
  private subsong = 0;
  private numSubsongs = 1;
  private metadata: any = null;
  private currentTime = 0;
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  // Ring buffer for audio samples from worker
  private sampleBufferL: Float32Array[] = [];
  private sampleBufferR: Float32Array[] = [];
  private sampleReadOffset = 0;

  private readonly sidData: Uint8Array;
  private readonly config: JSIDPlay2Config;

  constructor(sidData: Uint8Array, config: JSIDPlay2Config = {}) {
    this.sidData = sidData;
    this.config = config;
  }

  /**
   * Send a message to the worker and wait for a specific response event
   */
  private workerCall(type: string, data: any = {}, expectedResponse: string, timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) { reject(new Error('Worker not created')); return; }
      const handler = (e: MessageEvent) => {
        if (e.data.eventType === expectedResponse) {
          this.worker?.removeEventListener('message', handler);
          resolve(e.data.eventData);
        }
      };
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ eventType: type, eventData: data });
      setTimeout(() => {
        this.worker?.removeEventListener('message', handler);
        reject(new Error(`JSIDPlay2 ${type} timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Initialize the engine — create worker, load WASM, open SID file
   */
  async init(_module: any): Promise<void> {
    // Create worker
    this.worker = new Worker('/deepsid/jsidplay2-004.wasm_gc-worker.js');

    // Listen for audio samples from the worker
    this.worker.addEventListener('message', (e: MessageEvent) => {
      if (e.data.eventType === 'SAMPLES') {
        const { left, right, length } = e.data.eventData;
        if (left && right && length > 0) {
          this.sampleBufferL.push(new Float32Array(left));
          this.sampleBufferR.push(new Float32Array(right));
        }
      }
    });

    // Initialize WASM runtime (can take several seconds)
    console.log('[JSIDPlay2] Initializing WASM runtime...');
    await this.workerCall('INITIALISE', {}, 'INITIALISED', 30000);
    console.log('[JSIDPlay2] WASM runtime ready');

    // Open the SID file first — WASM internals may not be ready for config before OPEN
    console.log('[JSIDPlay2] Opening SID file (%d bytes)...', this.sidData.byteLength);
    const contents = new Int8Array(this.sidData.buffer, this.sidData.byteOffset, this.sidData.byteLength);
    await this.workerCall('OPEN', {
      contents,
      tuneName: 'loaded.sid',
      startSong: this.subsong,
      nthFrame: 2,
      sidWrites: false,
      songLength: 0,
      sfxSoundExpander: false,
      sfxSoundExpanderType: 0,
    }, 'OPENED', 15000);
    console.log('[JSIDPlay2] SID file opened');

    // Fire-and-forget: try setting sample rate (may not be supported)
    if (this.config.sampleRate && this.worker) {
      this.worker.postMessage({ eventType: 'SET_SAMPLING_RATE', eventData: { samplingRate: this.config.sampleRate } });
    }

    // Fire-and-forget: try setting SID model
    if (this.config.chipModel && this.worker) {
      const model = this.config.chipModel === '8580' ? 1 : 0;
      this.worker.postMessage({ eventType: 'SET_USER_CHIP_MODEL', eventData: { sidNum: 0, chipModel: model } });
    }

    // Get tune info
    try {
      const info = await this.workerCall('GET_TUNE_INFO', {}, 'GOT_TUNE_INFO', 5000);
      this.metadata = info?.tuneInfo ?? null;
      if (this.metadata?.songs) this.numSubsongs = this.metadata.songs;
      console.log('[JSIDPlay2] Tune info:', this.metadata);
    } catch {
      console.warn('[JSIDPlay2] Could not get tune info');
    }

    console.log('[JSIDPlay2] Initialized');
  }

  /**
   * Start playback — create ScriptProcessor and drive CLOCK loop
   */
  async play(audioContext: AudioContext, outputNode?: AudioNode): Promise<void> {
    if (this.isPlaying) return;
    if (!this.worker) throw new Error('Worker not initialized');

    this.audioContext = audioContext;
    this.sampleBufferL = [];
    this.sampleBufferR = [];
    this.sampleReadOffset = 0;

    // Create ScriptProcessor to pull samples from ring buffer
    const bufferSize = 4096;
    this.scriptNode = audioContext.createScriptProcessor(bufferSize, 0, 2);
    this.scriptNode.onaudioprocess = (event) => {
      const outL = event.outputBuffer.getChannelData(0);
      const outR = event.outputBuffer.getChannelData(1);
      let written = 0;

      while (written < outL.length && this.sampleBufferL.length > 0) {
        const srcL = this.sampleBufferL[0];
        const srcR = this.sampleBufferR[0];
        const available = srcL.length - this.sampleReadOffset;
        const needed = outL.length - written;
        const toCopy = Math.min(available, needed);

        outL.set(srcL.subarray(this.sampleReadOffset, this.sampleReadOffset + toCopy), written);
        outR.set(srcR.subarray(this.sampleReadOffset, this.sampleReadOffset + toCopy), written);

        written += toCopy;
        this.sampleReadOffset += toCopy;

        if (this.sampleReadOffset >= srcL.length) {
          this.sampleBufferL.shift();
          this.sampleBufferR.shift();
          this.sampleReadOffset = 0;
        }
      }

      // Fill remainder with silence
      if (written < outL.length) {
        outL.fill(0, written);
        outR.fill(0, written);
      }

      this.currentTime += outL.length / audioContext.sampleRate;
    };

    this.outputNode = outputNode ?? audioContext.destination;
    this.scriptNode.connect(this.outputNode);
    this.isPlaying = true;

    // Pre-buffer: fire a burst of CLOCKs to fill the ring buffer before audio starts
    for (let i = 0; i < 60; i++) {
      this.worker!.postMessage({ eventType: 'CLOCK', eventData: {} });
    }

    // Steady-state: fire CLOCKs at ~4ms interval (fire-and-forget, no await).
    // The worker processes them sequentially and emits SAMPLES as side effects.
    // ~250 clocks/sec keeps the ring buffer ahead of audio consumption at 44.1kHz.
    this.clockInterval = setInterval(() => {
      if (this.worker) {
        this.worker.postMessage({ eventType: 'CLOCK', eventData: {} });
      }
    }, 4);

    console.log('[JSIDPlay2] Playback started, subsong:', this.subsong);
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }

    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }

    this.sampleBufferL = [];
    this.sampleBufferR = [];
    this.sampleReadOffset = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    console.log('[JSIDPlay2] Playback stopped');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    if (this.scriptNode) {
      this.scriptNode.disconnect();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.scriptNode && this.audioContext) {
      this.scriptNode.connect(this.outputNode ?? this.audioContext.destination);
      if (!this.clockInterval && this.worker) {
        this.clockInterval = setInterval(() => {
          if (this.worker) {
            this.worker.postMessage({ eventType: 'CLOCK', eventData: {} });
          }
        }, 4);
      }
    }
  }

  /**
   * Set subsong
   */
  setSubsong(subsong: number): void {
    if (subsong >= 0 && subsong < this.numSubsongs) {
      this.subsong = subsong;
      // Re-open with new start song
      if (this.worker && this.isPlaying) {
        const contents = new Int8Array(this.sidData.buffer, this.sidData.byteOffset, this.sidData.byteLength);
        this.worker.postMessage({
          eventType: 'OPEN',
          eventData: {
            contents,
            tuneName: 'loaded.sid',
            startSong: subsong,
            nthFrame: 2,
            sidWrites: false,
            songLength: 0,
            sfxSoundExpander: false,
            sfxSoundExpanderType: 0,
          },
        });
      }
      this.currentTime = 0;
      console.log('[JSIDPlay2] Subsong changed to:', subsong);
    }
  }

  /**
   * Get current subsong
   */
  getSubsong(): number {
    return this.subsong;
  }

  /**
   * Get number of subsongs
   */
  getNumSubsongs(): number {
    return this.numSubsongs;
  }

  /**
   * Seek to time — sends FAST_FORWARD then NORMAL_SPEED
   */
  seek(timeSeconds: number): void {
    // JSIDPlay2 doesn't have direct seek — approximate with fast-forward
    console.log('[JSIDPlay2] Seek not directly supported, time:', timeSeconds);
    this.currentTime = timeSeconds;
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Get voice state — not easily accessible through worker boundary
   */
  getVoiceState(_voice: number): SIDVoiceState | null {
    return null;
  }

  /**
   * Set playback speed
   */
  setSpeed(multiplier: number): void {
    if (!this.worker) return;
    if (multiplier > 1) {
      this.worker.postMessage({ eventType: 'FAST_FORWARD', eventData: {} });
    } else {
      this.worker.postMessage({ eventType: 'NORMAL_SPEED', eventData: {} });
    }
  }

  /**
   * Mute/unmute a voice
   */
  setVoiceMask(voice: number, muted: boolean): void {
    if (!this.worker) return;
    this.worker.postMessage({
      eventType: 'SET_MUTE',
      eventData: { sidNum: 0, voice, mute: muted },
    });
  }

  /**
   * Force SID chip model
   */
  forceSIDModel(model: '6581' | '8580'): void {
    if (!this.worker) return;
    const chipModel = model === '8580' ? 1 : 0;
    this.worker.postMessage({
      eventType: 'SET_USER_CHIP_MODEL',
      eventData: { sidNum: 0, chipModel },
    });
    console.log('[JSIDPlay2] Forced SID model to:', model);
  }

  /**
   * Get metadata
   */
  getMetadata(): any {
    return this.metadata;
  }

  /**
   * Check if playing
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.audioContext = null;
  }
}
