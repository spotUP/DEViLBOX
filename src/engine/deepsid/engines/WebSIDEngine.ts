/**
 * WebSIDEngine.ts
 * 
 * Wrapper for WebSID - Fast WASM reSID emulator
 * 
 * Features:
 * - reSID 1.0 in WASM
 * - Fast playback (very fast)
 * - Good accuracy
 * - Audio encoding support
 * - Recommended default engine
 */

export interface WebSIDConfig {
  chipModel?: '6581' | '8580';
  sampleRate?: number;
  filter?: boolean;
}

export interface SIDVoiceState {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  adsr: { attack: number; decay: number; sustain: number; release: number };
  gate: boolean;
}

/**
 * WebSID Engine Wrapper
 */
export class WebSIDEngine {
  private backend: any;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioWorkletNode | null = null;
  private isPlaying = false;
  private subsong = 0;
  private numSubsongs = 1;
  private metadata: any = null;

  constructor(
    private sidData: Uint8Array,
    private config: WebSIDConfig = {}
  ) {}

  /**
   * Initialize the engine
   */
  async init(module: any): Promise<void> {
    // Create backend instance
    this.backend = new module.backend({
      sampleRate: this.config.sampleRate || 44100,
      filter: this.config.filter !== false,
    });

    // Load SID data
    const success = await this.backend.loadFile(this.sidData.buffer);
    if (!success) {
      throw new Error('Failed to load SID file into WebSID');
    }

    // Get metadata
    this.metadata = this.backend.getMetadata();
    this.numSubsongs = this.metadata?.songs || 1;
    
    console.log('[WebSID] Initialized:', {
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

    // Create audio worklet node (WebSID uses AudioWorklet if available)
    if (audioContext.audioWorklet) {
      try {
        // Note: This assumes WebSID backend has worklet support
        this.sourceNode = await this.backend.createWorkletNode(audioContext);
        this.sourceNode.connect(audioContext.destination);
      } catch (error) {
        console.warn('[WebSID] AudioWorklet not available, using ScriptProcessor fallback');
        this.playWithScriptProcessor(audioContext);
        return;
      }
    } else {
      this.playWithScriptProcessor(audioContext);
      return;
    }

    this.isPlaying = true;
    console.log('[WebSID] Playback started, subsong:', this.subsong);
  }

  /**
   * ScriptProcessor fallback for older browsers
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
        
        // WebSID outputs stereo
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
    console.log('[WebSID] Playback stopped');
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
      console.log('[WebSID] Subsong changed to:', subsong);
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
      console.warn('[WebSID] Failed to read voice state:', error);
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
   * Encode to WAV (WebSID supports encoding)
   */
  async encodeToWAV(durationSeconds: number): Promise<Uint8Array | null> {
    if (!this.backend || !this.backend.encode) {
      console.warn('[WebSID] Encoding not supported');
      return null;
    }

    try {
      const wavData = await this.backend.encode(durationSeconds);
      return new Uint8Array(wavData);
    } catch (error) {
      console.error('[WebSID] Encoding failed:', error);
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
