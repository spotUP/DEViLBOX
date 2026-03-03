/**
 * JSIDPlay2Engine.ts
 * 
 * Wrapper for JSIDPlay2 - Perfect C64 emulation
 * 
 * Features:
 * - Full Commodore 64 emulation
 * - Perfect accuracy (cycle-exact)
 * - Seeking support
 * - Force SID model
 * - Audio encoding support
 * - Largest file size (3.6MB WASM)
 * - Slower performance
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
 * JSIDPlay2 Engine Wrapper
 */
export class JSIDPlay2Engine {
  private player: any;
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioWorkletNode | null = null;
  private isPlaying = false;
  private subsong = 0;
  private numSubsongs = 1;
  private metadata: any = null;
  private currentTime = 0;

  private readonly sidData: Uint8Array;
  private readonly config: JSIDPlay2Config;

  constructor(sidData: Uint8Array, config: JSIDPlay2Config = {}) {
    this.sidData = sidData;
    this.config = config;
  }
  /**
   * Initialize the engine
   */
  async init(module: any): Promise<void> {
    // JSIDPlay2 uses a Web Worker for emulation
    this.worker = new Worker('/deepsid/jsidplay2-004.wasm_gc-worker.js');
    
    // Create player instance
    this.player = new module.player({
      worker: this.worker,
      sampleRate: this.config.sampleRate || 44100,
      forceSIDModel: this.config.forceSIDModel,
    });

    // Load SID data
    const success = await this.player.loadFile(this.sidData.buffer);
    if (!success) {
      throw new Error('Failed to load SID file into JSIDPlay2');
    }

    // Get metadata
    this.metadata = this.player.getMetadata();
    this.numSubsongs = this.metadata?.songs || 1;
    
    console.log('[JSIDPlay2] Initialized:', {
      title: this.metadata?.name,
      author: this.metadata?.author,
      copyright: this.metadata?.copyright,
      subsongs: this.numSubsongs,
      chipModel: this.metadata?.sidModel,
      forceSIDModel: this.config.forceSIDModel,
    });
  }

  /**
   * Start playback
   */
  async play(audioContext: AudioContext): Promise<void> {
    if (this.isPlaying) {
      return;
    }

    this.audioContext = audioContext;

    // Set subsong
    if (this.subsong >= 0 && this.subsong < this.numSubsongs) {
      this.player.setSubsong(this.subsong);
    }

    // JSIDPlay2 uses AudioWorklet for best performance
    if (audioContext.audioWorklet) {
      try {
        // Register JSIDPlay2 worklet processor
        await audioContext.audioWorklet.addModule('/deepsid/jsidplay2-processor.js');
        
        this.sourceNode = new AudioWorkletNode(audioContext, 'jsidplay2-processor');
        
        // Connect to worker
        this.sourceNode.port.postMessage({
          type: 'init',
          worker: this.worker,
        });
        
        this.sourceNode.connect(audioContext.destination);
      } catch (error) {
        console.warn('[JSIDPlay2] AudioWorklet setup failed, using ScriptProcessor fallback');
        this.playWithScriptProcessor(audioContext);
        return;
      }
    } else {
      this.playWithScriptProcessor(audioContext);
      return;
    }

    this.isPlaying = true;
    console.log('[JSIDPlay2] Playback started, subsong:', this.subsong);
  }

  /**
   * ScriptProcessor fallback
   */
  private playWithScriptProcessor(audioContext: AudioContext): void {
    const bufferSize = 4096;
    const scriptNode = audioContext.createScriptProcessor(bufferSize, 0, 2);
    
    scriptNode.onaudioprocess = (event) => {
      const outputL = event.outputBuffer.getChannelData(0);
      const outputR = event.outputBuffer.getChannelData(1);
      
      // Generate audio from player
      if (this.player && this.player.generateAudio) {
        const buffer = this.player.generateAudio(outputL.length);
        
        // JSIDPlay2 outputs stereo
        for (let i = 0; i < outputL.length; i++) {
          outputL[i] = buffer[i * 2];
          outputR[i] = buffer[i * 2 + 1];
          
          // Update current time (rough estimate)
          this.currentTime += 1 / audioContext.sampleRate;
        }
      }
    };

    scriptNode.connect(audioContext.destination);
    this.sourceNode = scriptNode as any;
    this.isPlaying = true;
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.isPlaying) {
      return;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.player && this.player.stop) {
      this.player.stop();
    }

    this.currentTime = 0;
    this.isPlaying = false;
    console.log('[JSIDPlay2] Playback stopped');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.sourceNode && this.audioContext) {
      this.sourceNode.disconnect();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.sourceNode && this.audioContext) {
      this.sourceNode.connect(this.audioContext.destination);
    }
  }

  /**
   * Set subsong
   */
  setSubsong(subsong: number): void {
    if (subsong >= 0 && subsong < this.numSubsongs) {
      this.subsong = subsong;
      if (this.player && this.player.setSubsong) {
        this.player.setSubsong(subsong);
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
   * Seek to time (JSIDPlay2 supports seeking!)
   */
  seek(timeSeconds: number): void {
    if (this.player && this.player.seek) {
      this.player.seek(timeSeconds);
      this.currentTime = timeSeconds;
      console.log('[JSIDPlay2] Seeked to:', timeSeconds);
    }
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (this.player && this.player.getCurrentTime) {
      return this.player.getCurrentTime();
    }
    return this.currentTime;
  }

  /**
   * Get voice state for pattern extraction
   */
  getVoiceState(voice: number): SIDVoiceState | null {
    if (!this.player || !this.player.getVoiceState) return null;

    try {
      const state = this.player.getVoiceState(voice);
      return state || null;
    } catch (error) {
      console.warn('[JSIDPlay2] Failed to read voice state:', error);
      return null;
    }
  }

  /**
   * Set playback speed (fast forward)
   */
  setSpeed(multiplier: number): void {
    if (this.player && this.player.setSpeed) {
      this.player.setSpeed(multiplier);
    }
  }

  /**
   * Mute/unmute a voice
   */
  setVoiceMask(voice: number, muted: boolean): void {
    if (this.player && this.player.setVoiceMask) {
      this.player.setVoiceMask(voice, muted);
    }
  }

  /**
   * Force SID chip model
   */
  forceSIDModel(model: '6581' | '8580'): void {
    if (this.player && this.player.forceSIDModel) {
      this.player.forceSIDModel(model);
      console.log('[JSIDPlay2] Forced SID model to:', model);
    }
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
   * Encode to WAV (JSIDPlay2 supports encoding)
   */
  async encodeToWAV(durationSeconds: number): Promise<Uint8Array | null> {
    if (!this.player || !this.player.encode) {
      console.warn('[JSIDPlay2] Encoding not supported');
      return null;
    }

    try {
      const wavData = await this.player.encode(durationSeconds);
      return new Uint8Array(wavData);
    } catch (error) {
      console.error('[JSIDPlay2] Encoding failed:', error);
      return null;
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    
    if (this.player && this.player.dispose) {
      this.player.dispose();
    }
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.player = null;
    this.audioContext = null;
  }
}
