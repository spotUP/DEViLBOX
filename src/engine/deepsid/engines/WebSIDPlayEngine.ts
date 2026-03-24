/**
 * WebSIDPlayEngine.ts
 * 
 * Wrapper for WebSIDPlay - Best quality WASM reSID emulator
 * 
 * Features:
 * - reSID 1.0 with highest quality
 * - Excellent accuracy (best available)
 * - Audio encoding support
 * - Larger file size (318KB WASM)
 */

export interface WebSIDPlayConfig {
  chipModel?: '6581' | '8580';
  sampleRate?: number;
  filter?: boolean;
  quality?: 'fast' | 'interpolate' | 'resample' | 'resample-fast';
}

export interface SIDVoiceState {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  adsr: { attack: number; decay: number; sustain: number; release: number };
  gate: boolean;
}

/**
 * WebSIDPlay Engine Wrapper
 */
export class WebSIDPlayEngine {
  private backend: any;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioWorkletNode | null = null;
  private isPlaying = false;
  private subsong = 0;
  private numSubsongs = 1;
  private metadata: any = null;

  private readonly sidData: Uint8Array;
  private readonly config: WebSIDPlayConfig;

  constructor(sidData: Uint8Array, config: WebSIDPlayConfig = {}) {
    this.sidData = sidData;
    this.config = config;
  }
  /**
   * Initialize the engine
   */
  async init(module: any): Promise<void> {
    // Create backend instance with quality settings
    this.backend = new module.backend({
      sampleRate: this.config.sampleRate || 44100,
      filter: this.config.filter !== false,
      quality: this.config.quality || 'resample', // Best quality by default
    });

    // Load SID data
    const success = await this.backend.loadFile(this.sidData.buffer);
    if (!success) {
      throw new Error('Failed to load SID file into WebSIDPlay');
    }

    // Get metadata
    this.metadata = this.backend.getMetadata();
    this.numSubsongs = this.metadata?.songs || 1;
    
    console.log('[WebSIDPlay] Initialized:', {
      title: this.metadata?.name,
      author: this.metadata?.author,
      copyright: this.metadata?.copyright,
      subsongs: this.numSubsongs,
      chipModel: this.metadata?.sidModel,
      quality: this.config.quality || 'resample',
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
      this.backend.setSubsong(this.subsong);
    }

    // WebSIDPlay prefers AudioWorklet for best quality
    if (audioContext.audioWorklet) {
      try {
        this.sourceNode = await this.backend.createWorkletNode(audioContext);
        if (this.sourceNode) {
          this.sourceNode.connect(audioContext.destination);
        }
      } catch (_error) {
        console.warn('[WebSIDPlay] AudioWorklet not available, using ScriptProcessor fallback');
        this.playWithScriptProcessor(audioContext);
        return;
      }
    } else {
      this.playWithScriptProcessor(audioContext);
      return;
    }

    this.isPlaying = true;
    console.log('[WebSIDPlay] Playback started, subsong:', this.subsong);
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
      
      // Generate audio from backend
      if (this.backend && this.backend.generateAudio) {
        const buffer = this.backend.generateAudio(outputL.length);
        
        // WebSIDPlay outputs stereo
        for (let i = 0; i < outputL.length; i++) {
          outputL[i] = buffer[i * 2];
          outputR[i] = buffer[i * 2 + 1];
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

    if (this.backend && this.backend.stop) {
      this.backend.stop();
    }

    this.isPlaying = false;
    console.log('[WebSIDPlay] Playback stopped');
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
      if (this.backend && this.backend.setSubsong) {
        this.backend.setSubsong(subsong);
      }
      console.log('[WebSIDPlay] Subsong changed to:', subsong);
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
   * Get voice state for pattern extraction
   */
  getVoiceState(voice: number): SIDVoiceState | null {
    if (!this.backend || !this.backend.getVoiceState) return null;

    try {
      const state = this.backend.getVoiceState(voice);
      return state || null;
    } catch (error) {
      console.warn('[WebSIDPlay] Failed to read voice state:', error);
      return null;
    }
  }

  /**
   * Set playback speed (fast forward)
   */
  setSpeed(multiplier: number): void {
    if (this.backend && this.backend.setSpeed) {
      this.backend.setSpeed(multiplier);
    }
  }

  /**
   * Mute/unmute a voice
   */
  setVoiceMask(voice: number, muted: boolean): void {
    if (this.backend && this.backend.setVoiceMask) {
      this.backend.setVoiceMask(voice, muted);
    }
  }

  /**
   * Set sampling quality
   */
  setQuality(quality: 'fast' | 'interpolate' | 'resample' | 'resample-fast'): void {
    if (this.backend && this.backend.setQuality) {
      this.backend.setQuality(quality);
      console.log('[WebSIDPlay] Quality changed to:', quality);
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
   * Encode to WAV (WebSIDPlay supports encoding)
   */
  async encodeToWAV(durationSeconds: number): Promise<Uint8Array | null> {
    if (!this.backend || !this.backend.encode) {
      console.warn('[WebSIDPlay] Encoding not supported');
      return null;
    }

    try {
      const wavData = await this.backend.encode(durationSeconds);
      return new Uint8Array(wavData);
    } catch (error) {
      console.error('[WebSIDPlay] Encoding failed:', error);
      return null;
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    if (this.backend && this.backend.dispose) {
      this.backend.dispose();
    }
    this.backend = null;
    this.audioContext = null;
  }
}
