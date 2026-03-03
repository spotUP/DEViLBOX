/**
 * JSSIDEngine.ts
 * 
 * Wrapper for jsSID - Pure JavaScript SID emulator by Hermit
 * 
 * Features:
 * - No WASM required
 * - ASID hardware support (Web MIDI)
 * - OPL/FM chip support (SFX Sound Expander, FM-YAM)
 * - Multi-SID support (2SID/3SID)
 */

import type { SIDEngineType } from '../DeepSIDEngineManager';

export interface JSSIDConfig {
  chipModel?: '6581' | '8580';
  sampleRate?: number;
  bufferSize?: number;
  enableASID?: boolean;
  enableOPL?: boolean;
}

export interface SIDVoiceState {
  frequency: number;
  pulseWidth: number;
  waveform: number;
  adsr: { attack: number; decay: number; sustain: number; release: number };
  gate: boolean;
}

/**
 * jsSID Engine Wrapper
 */
export class JSSIDEngine {
  private jsSID: any;
  private player: any;
  private readonly sidData: Uint8Array;
  private readonly config: JSSIDConfig;  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isPlaying = false;
  private subsong = 0;
  private numSubsongs = 1;

  constructor(sidData: Uint8Array, config: JSSIDConfig = {}) {
    this.sidData = sidData;
    this.config = config;
  }  ) {}

  /**
   * Initialize the engine
   */
  async init(module: any): Promise<void> {
    this.jsSID = new module.jsSID(
      this.config.bufferSize || 16384,
      0.0005 // Decay factor
    );

    // Load SID data
    const success = this.jsSID.loadFileData(this.sidData);
    if (!success) {
      throw new Error('Failed to load SID file into jsSID');
    }

    // Get metadata
    const metadata = this.jsSID.getInfo();
    this.numSubsongs = metadata.songs || 1;
    
    console.log('[jsSID] Initialized:', {
      title: metadata.name,
      author: metadata.author,
      copyright: metadata.copyright,
      subsongs: this.numSubsongs,
      chipModel: metadata.sidModel === 1 ? '6581' : '8580',
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
      this.jsSID.setSubsong(this.subsong);
    }

    // Create script processor for audio output
    const bufferSize = this.config.bufferSize || 16384;
    this.scriptProcessor = audioContext.createScriptProcessor(bufferSize, 0, 2);
    
    this.scriptProcessor.onaudioprocess = (event) => {
      const outputL = event.outputBuffer.getChannelData(0);
      const outputR = event.outputBuffer.getChannelData(1);
      
      // Generate audio from jsSID
      const buffer = this.jsSID.generateAudio(outputL.length);
      
      // Copy to output (stereo)
      for (let i = 0; i < outputL.length; i++) {
        outputL[i] = buffer[i];
        outputR[i] = buffer[i]; // jsSID is mono, duplicate for stereo
      }
    };

    this.scriptProcessor.connect(audioContext.destination);
    this.isPlaying = true;

    console.log('[jsSID] Playback started, subsong:', this.subsong);
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

    this.isPlaying = false;
    console.log('[jsSID] Playback stopped');
  }

  /**
   * Pause playback
   */
  pause(): void {
    // jsSID doesn't have pause, just disconnect audio
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
      if (this.jsSID) {
        this.jsSID.setSubsong(subsong);
      }
      console.log('[jsSID] Subsong changed to:', subsong);
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
    if (!this.jsSID) return null;

    try {
      // Read SID registers directly
      const baseAddr = 0xd400 + (voice * 7);
      
      const freqLo = this.jsSID.readRegister(baseAddr + 0);
      const freqHi = this.jsSID.readRegister(baseAddr + 1);
      const frequency = freqLo | (freqHi << 8);
      
      const pwLo = this.jsSID.readRegister(baseAddr + 2);
      const pwHi = this.jsSID.readRegister(baseAddr + 3);
      const pulseWidth = pwLo | ((pwHi & 0x0f) << 8);
      
      const control = this.jsSID.readRegister(baseAddr + 4);
      const waveform = (control >> 4) & 0x0f;
      const gate = (control & 0x01) !== 0;
      
      const ad = this.jsSID.readRegister(baseAddr + 5);
      const sr = this.jsSID.readRegister(baseAddr + 6);
      
      return {
        frequency,
        pulseWidth,
        waveform,
        adsr: {
          attack: (ad >> 4) & 0x0f,
          decay: ad & 0x0f,
          sustain: (sr >> 4) & 0x0f,
          release: sr & 0x0f,
        },
        gate,
      };
    } catch (error) {
      console.warn('[jsSID] Failed to read voice state:', error);
      return null;
    }
  }

  /**
   * Set playback speed (fast forward)
   */
  setSpeed(multiplier: number): void {
    if (this.jsSID && this.jsSID.setSpeed) {
      this.jsSID.setSpeed(multiplier);
    }
  }

  /**
   * Mute/unmute a voice
   */
  setVoiceMask(voice: number, muted: boolean): void {
    if (this.jsSID && this.jsSID.setVoiceMask) {
      const currentMask = this.jsSID.getVoiceMask() || 0;
      const bit = 1 << voice;
      const newMask = muted ? (currentMask | bit) : (currentMask & ~bit);
      this.jsSID.setVoiceMask(newMask);
    }
  }

  /**
   * Get metadata
   */
  getMetadata(): any {
    if (!this.jsSID) return null;
    return this.jsSID.getInfo();
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
    this.jsSID = null;
    this.player = null;
    this.audioContext = null;
  }
}
