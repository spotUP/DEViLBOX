/**
 * TinyRSIDEngine.ts
 * 
 * Wrapper for TinyRSID - Lightweight WASM reSID emulator
 * 
 * Features:
 * - Smallest WASM option (78KB)
 * - Very fast playback
 * - Good accuracy
 * - Best for mobile/low-bandwidth
 */

export interface TinyRSIDConfig {
  chipModel?: '6581' | '8580';
  sampleRate?: number;
}

export interface SIDVoiceState {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  adsr: { attack: number; decay: number; sustain: number; release: number };
  gate: boolean;
}

/**
 * TinyRSID Engine Wrapper
 */
export class TinyRSIDEngine {
  private backend: any;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isPlaying = false;
  private subsong = 0;
  private numSubsongs = 1;
  private metadata: any = null;

  private readonly sidData: Uint8Array;
  private readonly config: TinyRSIDConfig;  ) {}
  constructor(sidData: Uint8Array, config: TinyRSIDConfig = {}) {
    this.sidData = sidData;
    this.config = config;
  }
  /**
   * Initialize the engine
   */
  async init(module: any): Promise<void> {
    // Create backend instance (TinyRSID shares backend interface with WebSID)
    this.backend = new module.backend({
      sampleRate: this.config.sampleRate || 44100,
    });

    // Load SID data
    const success = await this.backend.loadFile(this.sidData.buffer);
    if (!success) {
      throw new Error('Failed to load SID file into TinyRSID');
    }

    // Get metadata
    this.metadata = this.backend.getMetadata();
    this.numSubsongs = this.metadata?.songs || 1;
    
    console.log('[TinyRSID] Initialized:', {
      title: this.metadata?.name,
      author: this.metadata?.author,
      copyright: this.metadata?.copyright,
      subsongs: this.numSubsongs,
      chipModel: this.metadata?.sidModel,
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

    // TinyRSID uses ScriptProcessor (lightweight, no AudioWorklet overhead)
    const bufferSize = 4096;
    this.scriptProcessor = audioContext.createScriptProcessor(bufferSize, 0, 2);
    
    this.scriptProcessor.onaudioprocess = (event) => {
      const outputL = event.outputBuffer.getChannelData(0);
      const outputR = event.outputBuffer.getChannelData(1);
      
      // Generate audio from backend
      if (this.backend && this.backend.generateAudio) {
        const buffer = this.backend.generateAudio(outputL.length);
        
        // TinyRSID outputs stereo
        for (let i = 0; i < outputL.length; i++) {
          outputL[i] = buffer[i * 2];
          outputR[i] = buffer[i * 2 + 1];
        }
      }
    };

    this.scriptProcessor.connect(audioContext.destination);
    this.isPlaying = true;

    console.log('[TinyRSID] Playback started, subsong:', this.subsong);
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.isPlaying) {
      return;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.backend && this.backend.stop) {
      this.backend.stop();
    }

    this.isPlaying = false;
    console.log('[TinyRSID] Playback stopped');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.scriptProcessor && this.audioContext) {
      this.scriptProcessor.disconnect();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.scriptProcessor && this.audioContext) {
      this.scriptProcessor.connect(this.audioContext.destination);
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
      console.log('[TinyRSID] Subsong changed to:', subsong);
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
      console.warn('[TinyRSID] Failed to read voice state:', error);
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
    if (this.backend && this.backend.dispose) {
      this.backend.dispose();
    }
    this.backend = null;
    this.audioContext = null;
  }
}
