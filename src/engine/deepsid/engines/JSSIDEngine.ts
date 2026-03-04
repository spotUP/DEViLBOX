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

import { getASIDDeviceManager } from '@lib/sid/ASIDDeviceManager';
import { useSettingsStore } from '@stores/useSettingsStore';

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
  private readonly sidData: Uint8Array;
  private readonly config: JSSIDConfig;

  private playing = false;
  private subsong = 0;
  private numSubsongs = 1;
  private asidEnabled = false;
  private blobUrl: string | null = null;

  constructor(sidData: Uint8Array, config: JSSIDConfig = {}) {
    this.sidData = sidData;
    this.config = config;
  }

  /**
   * Initialize the engine
   */
  async init(module: any): Promise<void> {
    // Check if ASID hardware is enabled in settings
    const settings = useSettingsStore.getState();
    const asidEnabled = settings.asidEnabled && this.config.enableASID !== false;
    
    // If ASID is enabled, set up MIDI output
    if (asidEnabled) {
      const asidManager = getASIDDeviceManager();
      await asidManager.init();
      
      const port = asidManager.getSelectedPort();
      if (port) {
        (window as any).selectedMidiOutput = port;
        this.asidEnabled = true;
        console.log('[jsSID] ASID hardware enabled, output:', port.name);
      } else {
        console.warn('[jsSID] ASID enabled but no device selected, falling back to software');
      }
    }
    
    // Create jsSID instance — it creates its own AudioContext internally
    this.jsSID = new module.jsSID(
      this.config.bufferSize || 16384,
      0.0005,
      this.asidEnabled,
      false
    );

    // Load SID data via blob URL (jsSID.loadinit uses XHR internally)
    await this.loadSIDData();

    console.log('[jsSID] Initialized:', {
      title: this.jsSID.gettitle(),
      author: this.jsSID.getauthor(),
      subsongs: this.numSubsongs,
      asid: this.asidEnabled ? 'ENABLED' : 'disabled',
    });
  }

  /**
   * Load SID binary data into jsSID via a blob URL
   */
  private loadSIDData(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const blob = new Blob([this.sidData], { type: 'application/octet-stream' });
      this.blobUrl = URL.createObjectURL(blob);

      // jsSID calls the load callback when XHR completes
      this.jsSID.setloadcallback(() => {
        if (!resolved) {
          resolved = true;
          this.numSubsongs = this.jsSID.getsubtunes() || 1;
          resolve();
        }
      });

      // loadinit fetches the URL, parses the SID header, and calls init(subtune)
      this.jsSID.loadinit(this.blobUrl, this.subsong);

      // Timeout fallback in case XHR fails silently
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('jsSID load timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Start playback — jsSID manages its own AudioContext and ScriptProcessor
   */
  async play(_audioContext: AudioContext): Promise<void> {
    if (this.playing) return;
    if (!this.jsSID) throw new Error('jsSID not initialized');

    this.jsSID.start(this.subsong);
    this.playing = true;
    console.log('[jsSID] Playback started, subsong:', this.subsong);
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.playing || !this.jsSID) return;
    this.jsSID.stop();
    this.playing = false;
    console.log('[jsSID] Playback stopped');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.jsSID) this.jsSID.pause();
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.jsSID) this.jsSID.playcont();
  }

  /**
   * Set subsong
   */
  setSubsong(subsong: number): void {
    if (subsong >= 0 && subsong < this.numSubsongs) {
      this.subsong = subsong;
      if (this.jsSID && this.playing) {
        // start() reinitializes with new subtune and resumes playback
        this.jsSID.start(subsong);
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
      
      const freqLo = this.jsSID.readregister(baseAddr + 0);
      const freqHi = this.jsSID.readregister(baseAddr + 1);
      const frequency = freqLo | (freqHi << 8);
      
      const pwLo = this.jsSID.readregister(baseAddr + 2);
      const pwHi = this.jsSID.readregister(baseAddr + 3);
      const pulseWidth = pwLo | ((pwHi & 0x0f) << 8);
      
      const control = this.jsSID.readregister(baseAddr + 4);
      const waveform = (control >> 4) & 0x0f;
      const gate = (control & 0x01) !== 0;
      
      const ad = this.jsSID.readregister(baseAddr + 5);
      const sr = this.jsSID.readregister(baseAddr + 6);
      
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
    if (this.jsSID?.setSpeedMultiplier) {
      this.jsSID.setSpeedMultiplier(multiplier);
    }
  }

  /**
   * Mute/unmute a voice — jsSID uses a bitmask via enableVoices(mask)
   * where bit N=1 means voice N is enabled (up to 9 voices for 3SID)
   */
  setVoiceMask(voice: number, muted: boolean): void {
    if (this.jsSID?.enableVoices) {
      // enableVoices expects a bitmask where 1 = enabled
      // We don't have a getter, so we track externally
      this.jsSID.enableVoices(muted ? 0 : 0x1FF);
    }
  }

  /**
   * Get metadata
   */
  getMetadata(): any {
    if (!this.jsSID) return null;
    return {
      name: this.jsSID.gettitle?.() ?? '',
      author: this.jsSID.getauthor?.() ?? '',
      copyright: this.jsSID.getinfo?.() ?? '',
      songs: this.numSubsongs,
      sidModel: this.jsSID.getmodel?.() ?? 6581,
      prefModel: this.jsSID.getprefmodel?.() ?? 6581,
    };
  }

  /**
   * Check if playing
   */
  isActive(): boolean {
    return this.playing;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }

    if (this.asidEnabled) {
      (window as any).selectedMidiOutput = null;
    }
    
    this.jsSID = null;
  }
  
  /**
   * Check if ASID hardware is currently active
   */
  isASIDActive(): boolean {
    return this.asidEnabled;
  }
}
