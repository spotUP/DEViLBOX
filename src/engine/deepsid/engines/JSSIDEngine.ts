/**
 * JSSIDEngine.ts
 * 
 * Wrapper for jsSID - Pure JavaScript SID emulator by Hermit
 * 
 * Features:
 * - No WASM required
 * - ASID hardware support (Web MIDI)
 * - WebUSB hardware support (USB-SID-Pico, cycle-exact)
 * - OPL/FM chip support (SFX Sound Expander, FM-YAM)
 * - Multi-SID support (2SID/3SID/4SID)
 */

import { getASIDDeviceManager } from '@lib/sid/ASIDDeviceManager';
import { getUSBSIDPico, type ClockRateValue } from '@lib/sid/USBSIDPico';
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
  private webusbEnabled = false;
  private blobUrl: string | null = null;
  private voiceMask = 0x1FF; // bitmask: bit N=1 → voice N enabled (all on)
  // Per-voice output nodes — populated when initialized with external AudioContext
  private _voiceGains: GainNode[] | null = null;
  private _splitter: ChannelSplitterNode | null = null;
  private _externalCtx: AudioContext | null = null;

  constructor(sidData: Uint8Array, config: JSSIDConfig = {}) {
    this.sidData = sidData;
    this.config = config;
  }

  /**
   * Initialize the engine
   */
  async init(module: any, externalCtx?: AudioContext): Promise<void> {
    this._externalCtx = externalCtx ?? null;
    const settings = useSettingsStore.getState();
    const hwMode = settings.sidHardwareMode;

    // WebUSB mode: connect USB-SID-Pico directly
    if (hwMode === 'webusb') {
      const pico = getUSBSIDPico();
      if (pico.isConnected || await pico.reconnect()) {
        // Bridge our USBSIDPicoDevice to jsSID's global webusb object
        this.setupWebusbBridge(pico);
        this.webusbEnabled = true;
        // Apply clock rate setting
        const clockRate = settings.webusbClockRate;
        if (clockRate >= 0 && clockRate <= 3) pico.setClock(clockRate as ClockRateValue);
        console.log('[jsSID] WebUSB hardware enabled:', pico.deviceInfo?.productName);
      } else {
        console.warn('[jsSID] WebUSB enabled but device not connected, falling back to software');
      }
    }

    // ASID mode: set up MIDI output (legacy path)
    if (hwMode === 'asid' && !this.webusbEnabled) {
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
    
    // Create jsSID instance — 4th param enables WebUSB mode in jsSID
    // 5th param: external AudioContext for per-voice output routing
    this.jsSID = new module.jsSID(
      this.config.bufferSize || 16384,
      0.0005,
      this.asidEnabled,
      this.webusbEnabled,
      externalCtx || null
    );

    // Set up per-voice routing if using external AudioContext
    if (externalCtx && this.jsSID.hasPerVoiceOutput?.()) {
      this._setupPerVoiceRouting(externalCtx);
    }

    // Load SID data
    await this.loadSIDData();

    const hwStatus = this.webusbEnabled ? 'WebUSB' : this.asidEnabled ? 'ASID' : 'software';
    console.log('[jsSID] Initialized:', {
      title: this.jsSID.gettitle(),
      author: this.jsSID.getauthor(),
      subsongs: this.numSubsongs,
      hardware: hwStatus,
    });
  }

  /**
   * Bridge our USBSIDPicoDevice to jsSID's global `webusb` object.
   * jsSID calls `webusb.writeReg([cmd, addr, value])` for each SID write.
   * We route those to our device which handles USB bulk transfers.
   */
  private setupWebusbBridge(pico: InstanceType<typeof import('@lib/sid/USBSIDPico').USBSIDPicoDevice>): void {
    const win = window as any;

    // jsSID expects a global `webusb` object with writeReg, connect, autoConnect, etc.
    if (!win.webusb) win.webusb = {};

    // Core write method — jsSID calls this for every SID register write
    win.webusb.writeReg = (array: number[]) => {
      if (!pico.isConnected || array.length < 3) return;
      // array = [cmd_byte, chip_addr | reg, value]
      // cmd_byte is typically 0x00 (WRITE)
      // chip_addr = (chip * 0x20) | reg — already calculated by jsSID
      const addr = array[1];
      const value = array[2];
      const chip = (addr >> 5) & 3;
      const reg = addr & 0x1F;
      try {
        pico.write(chip, reg, value);
      } catch (_err) {
        // write() is synchronous but queues async USB transfers —
        // errors are handled by USBSIDPico's consecutive error counter
      }
    };

    // autoConnect — jsSID calls this during init if savedport exists
    win.webusb.autoConnect = () => {
      // Already connected via our device manager — no-op
      console.log('[jsSID WebUSB] autoConnect bridged (already connected)');
    };

    // Mark WebUSB as "connected" for jsSID's internal checks
    win.webusbconnected = true;
  }

  /**
   * Load SID binary data into jsSID.
   * Uses loaddata() for direct buffer loading (no XHR/blob URL needed).
   */
  private loadSIDData(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      this.jsSID.setloadcallback(() => {
        if (!resolved) {
          resolved = true;
          this.numSubsongs = this.jsSID.getsubtunes() || 1;
          console.log('[jsSID] loadcallback fired, subtunes:', this.numSubsongs);
          resolve();
        }
      });

      // Feed SID data directly from buffer — bypasses blob URL + XHR entirely
      if (this.jsSID.loaddata) {
        const buf = this.sidData.buffer.slice(
          this.sidData.byteOffset,
          this.sidData.byteOffset + this.sidData.byteLength,
        );
        console.log('[jsSID] Loading SID data directly (%d bytes)', this.sidData.byteLength);
        this.jsSID.loaddata(buf, this.subsong);
        // loaddata calls loadcallback synchronously
        if (!resolved) {
          resolved = true;
          this.numSubsongs = this.jsSID.getsubtunes() || 1;
          resolve();
        }
        return;
      }

      // Fallback: blob URL + XHR (for older jsSID without loaddata)
      console.log('[jsSID] Falling back to blob URL loading');
      const blob = new Blob([new Uint8Array(this.sidData)], { type: 'application/octet-stream' });
      this.blobUrl = URL.createObjectURL(blob);
      this.jsSID.playcont();
      this.jsSID.loadinit(this.blobUrl, this.subsong);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('jsSID load timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Start playback — jsSID manages its own AudioContext and ScriptProcessor.
   * Volume is controlled via jsSID.setvolume() since it uses a separate AudioContext.
   * When initialized with externalCtx, the ScriptProcessor is connected to
   * outputNode instead of audioContext.destination.
   */
  async play(_audioContext: AudioContext, outputNode?: AudioNode): Promise<void> {
    if (this.playing) return;
    if (!this.jsSID) throw new Error('jsSID not initialized');

    this.jsSID.start(this.subsong);

    // If using external AudioContext, route ScriptProcessor to the provided output node
    if (this._externalCtx && outputNode) {
      const scriptNode = this.jsSID.getScriptNode?.();
      if (scriptNode) {
        try { scriptNode.disconnect(); } catch { /* ok */ }
        if (this._splitter && this._voiceGains) {
          // 4-channel ScriptProcessor → splitter → ch0 to output, ch1-3 to voice gains
          scriptNode.connect(this._splitter);
          this._splitter.connect(outputNode, 0); // ch0 = mix → main output
          for (let i = 0; i < 3; i++) {
            this._splitter.connect(this._voiceGains[i], i + 1); // ch1-3 → voice taps
          }
        } else {
          scriptNode.connect(outputNode);
        }
      }
    }

    this.playing = true;
    console.log('[jsSID] Playback started, subsong:', this.subsong,
      this._voiceGains ? '(per-voice routing active)' : '');
  }

  /**
   * Set volume (0-1 linear). jsSID uses its own AudioContext so volume
   * is controlled via its internal setvolume() API.
   */
  setVolume(vol: number): void {
    if (this.jsSID?.setvolume) {
      this.jsSID.setvolume(Math.max(0, Math.min(1, vol)));
    }
  }

  /**
   * Set up per-voice audio routing from jsSID's 4-channel ScriptProcessor.
   * Splits channels 1-3 into individual GainNodes for dub bus echo throws.
   */
  private _setupPerVoiceRouting(ctx: AudioContext): void {
    // 4-channel splitter: ch0=mix, ch1=voice0, ch2=voice1, ch3=voice2
    this._splitter = ctx.createChannelSplitter(4);
    this._voiceGains = [];
    for (let i = 0; i < 3; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      // Connect splitter output (i+1) to the corresponding voice GainNode
      // Connection happens in play() after scriptNode is connected
      this._voiceGains.push(gain);
    }
    console.log('[jsSID] Per-voice routing set up (3 voice tap nodes)');
  }

  /**
   * Get per-voice GainNodes for dub bus echo throw routing.
   * Returns null if not initialized with external AudioContext.
   * Each node outputs one SID voice's pre-filter audio.
   */
  getVoiceOutputs(): GainNode[] | null {
    return this._voiceGains;
  }

  /** Whether per-voice output is available. */
  hasPerVoiceOutput(): boolean {
    return this._voiceGains !== null && this._voiceGains.length === 3;
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
    if (!this.jsSID?.enableVoices) return;
    if (muted) {
      this.voiceMask &= ~(1 << voice);
    } else {
      this.voiceMask |= (1 << voice);
    }
    this.jsSID.enableVoices(this.voiceMask);
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

    if (this.webusbEnabled) {
      // Flush any remaining buffered writes
      getUSBSIDPico().flush();
    }
    
    this.jsSID = null;
  }
  
  /**
   * Check if hardware output is currently active (ASID or WebUSB)
   */
  isASIDActive(): boolean {
    return this.asidEnabled || this.webusbEnabled;
  }

  /**
   * Check if WebUSB hardware is currently active
   */
  isWebusbActive(): boolean {
    return this.webusbEnabled;
  }
}
