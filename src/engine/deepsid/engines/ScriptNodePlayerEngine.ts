/**
 * ScriptNodePlayerEngine.ts
 *
 * Unified wrapper for all DeepSID WASM backends (WebSID, TinyRSID, WebSIDPlay).
 * These backends all work through ScriptNodePlayer from scriptprocessor_player.min.js.
 *
 * Architecture:
 *   BackendScript (e.g. backend_websid.js) → defines BackendAdapter class + loads WASM
 *   scriptprocessor_player.min.js → defines ScriptNodePlayer + base adapter classes
 *   ScriptNodePlayer.createInstance(adapter) → creates audio pipeline + window.player
 *   window.player.loadMusicFromURL(blobUrl, opts, onOk, onFail) → loads + plays SID data
 */

import type { SIDEngineType } from '../DeepSIDEngineManager';

export interface ScriptNodePlayerConfig {
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

// Backend adapter class lookup — each backend script defines a global class
const ADAPTER_CLASS_MAP: Record<string, string> = {
  websid: 'SIDBackendAdapter',
  tinyrsid: 'LegacySIDBackendAdapter',
  websidplay: 'SIDPlayBackendAdapter',
};

// WASM module state lookup — each backend script stores its Emscripten module in a global
const MODULE_STATE_MAP: Record<string, string> = {
  websid: 'spp_backend_state_SID',
  tinyrsid: 'spp_backend_state_LegacySID',
  websidplay: 'spp_backend_state_SIDPlay',
};

/**
 * Unified engine wrapper for ScriptNodePlayer-based WASM backends
 */
export class ScriptNodePlayerEngine {
  private readonly sidData: Uint8Array;
  private readonly engineType: SIDEngineType;

  private player: any = null;
  private adapter: any = null;
  private blobUrl: string | null = null;
  private playing = false;
  private subsong = 0;
  private numSubsongs = 1;

  constructor(
    sidData: Uint8Array,
    engineType: SIDEngineType,
    _config: ScriptNodePlayerConfig = {},
  ) {
    this.sidData = sidData;
    this.engineType = engineType;
  }

  /**
   * Initialize the engine — creates backend adapter + ScriptNodePlayer
   */
  async init(_module: any): Promise<void> {
    const win = window as any;

    // Ensure WASM search path is set for all backends
    if (typeof win.WASM_SEARCH_PATH === 'undefined') {
      win.WASM_SEARCH_PATH = '/deepsid/';
    }

    // Wait for WASM module to be ready
    const stateKey = MODULE_STATE_MAP[this.engineType];
    if (stateKey) {
      await this.waitForWASM(win[stateKey]);
    }

    // Get the adapter class from the global scope
    const adapterClassName = ADAPTER_CLASS_MAP[this.engineType];
    if (!adapterClassName) {
      throw new Error(`No adapter class mapped for engine: ${this.engineType}`);
    }

    const AdapterClass = win[adapterClassName];
    if (!AdapterClass) {
      throw new Error(
        `Backend adapter class '${adapterClassName}' not found. ` +
        `Is backend script loaded?`,
      );
    }

    // Create backend adapter (pass null for optional ROMs)
    if (this.engineType === 'tinyrsid') {
      this.adapter = new AdapterClass(); // LegacySIDBackendAdapter takes no args
    } else {
      // SIDBackendAdapter and SIDPlayBackendAdapter take (basicROM, charROM, kernalROM, nextFrameCB, enableMd5)
      this.adapter = new AdapterClass(null, null, null, undefined, false);
    }

    // Create ScriptNodePlayer — this sets up the audio pipeline
    const ScriptNodePlayer = win.ScriptNodePlayer;
    if (!ScriptNodePlayer) {
      throw new Error('ScriptNodePlayer not found. Is scriptprocessor_player.min.js loaded?');
    }

    await this.createPlayer(ScriptNodePlayer);

    console.log(`[${this.engineType}] ScriptNodePlayer engine initialized`);
  }

  /**
   * Wait for the Emscripten WASM module to be ready
   */
  private waitForWASM(moduleState: any): Promise<void> {
    if (!moduleState) return Promise.resolve();
    if (!moduleState.notReady) return Promise.resolve();

    return new Promise((resolve, reject) => {
      let resolved = false;
      const origCallback = moduleState.adapterCallback;
      moduleState.adapterCallback = () => {
        if (origCallback) origCallback();
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`${this.engineType} WASM load timed out`));
        }
      }, 15000);
    });
  }

  /**
   * Create ScriptNodePlayer instance with our adapter
   */
  private async createPlayer(ScriptNodePlayer: any): Promise<void> {
    // Ensure WebAudio context exists (Chrome defers this, which can cause crashes)
    if (ScriptNodePlayer._setGlobalWebAudioCtx) {
      ScriptNodePlayer._setGlobalWebAudioCtx();
    }

    // Use the Promise-based initialize API
    await ScriptNodePlayer.initialize(
      this.adapter,  // backendAdapter
      undefined,     // onTrackEnd
      [],            // preloadFiles
      false,         // spectrumEnabled
      undefined,     // externalTicker
    );

    this.player = ScriptNodePlayer.getInstance();
    if (!this.player) {
      throw new Error('ScriptNodePlayer failed to create player instance');
    }
  }

  /**
   * Start playback — feeds SID binary data to ScriptNodePlayer via blob URL.
   *
   * Flow matches DeepSID reference (Chordian/deepsid js/player.js):
   *   1. setVolume(1) before loading
   *   2. loadMusicFromURL(blobUrl, options) — loads SID data into backend
   *   3. player.play() — tells backend to start generating audio
   */
  async play(_audioContext: AudioContext): Promise<void> {
    if (this.playing) return;
    if (!this.player) throw new Error('Player not initialized');

    // Create a blob URL for the SID data
    const blob = new Blob([new Uint8Array(this.sidData)], { type: 'application/octet-stream' });
    this.blobUrl = URL.createObjectURL(blob);

    // Set volume before loading (DeepSID does this in onPlayerReady)
    if (this.player.setVolume) {
      this.player.setVolume(1);
    }

    const ScriptNodePlayer = (window as any).ScriptNodePlayer;

    await ScriptNodePlayer.loadMusicFromURL(
      this.blobUrl,
      { track: this.subsong },
      (err: any) => {
        if (err) console.warn(`[${this.engineType}] Load failed:`, err);
      },
    );

    // Explicitly start playback — loadMusicFromURL only loads data,
    // player.play() calls _backendAdapter.play() which starts audio generation
    this.player.play();

    this.playing = true;
    console.log(`[${this.engineType}] Playback started, subsong:`, this.subsong);
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.playing || !this.player) return;
    this.player.pause();
    this.playing = false;
    console.log(`[${this.engineType}] Playback stopped`);
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.player) this.player.pause();
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.player) this.player.resume();
  }

  /**
   * Set subsong
   */
  setSubsong(subsong: number): void {
    if (subsong >= 0 && subsong < this.numSubsongs) {
      this.subsong = subsong;
      // Reload with new track if currently playing
      if (this.playing && this.player && this.blobUrl) {
        this.player.loadMusicFromURL(
          this.blobUrl,
          { track: subsong },
          () => console.log(`[${this.engineType}] Subsong changed to:`, subsong),
          () => console.warn(`[${this.engineType}] Failed to change subsong`),
        );
      }
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
   * Get voice state (reads SID registers via backend adapter)
   */
  getVoiceState(voice: number): SIDVoiceState | null {
    if (!this.adapter?.getRAM) return null;

    try {
      const baseAddr = 0xd400 + voice * 7;
      const freqLo = this.adapter.getRAM(baseAddr + 0);
      const freqHi = this.adapter.getRAM(baseAddr + 1);
      const pwLo = this.adapter.getRAM(baseAddr + 2);
      const pwHi = this.adapter.getRAM(baseAddr + 3);
      const control = this.adapter.getRAM(baseAddr + 4);
      const ad = this.adapter.getRAM(baseAddr + 5);
      const sr = this.adapter.getRAM(baseAddr + 6);

      return {
        frequency: freqLo | (freqHi << 8),
        pulseWidth: pwLo | ((pwHi & 0x0f) << 8),
        waveform: (control >> 4) & 0x0f,
        adsr: {
          attack: (ad >> 4) & 0x0f,
          decay: ad & 0x0f,
          sustain: (sr >> 4) & 0x0f,
          release: sr & 0x0f,
        },
        gate: (control & 0x01) !== 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Set playback speed
   */
  setSpeed(_multiplier: number): void {
    // ScriptNodePlayer doesn't expose speed control directly
  }

  /**
   * Mute/unmute a voice
   */
  setVoiceMask(_voice: number, _muted: boolean): void {
    // Voice muting is backend-specific, not easily accessible through ScriptNodePlayer
  }

  /**
   * Get metadata from backend
   */
  getMetadata(): any {
    if (!this.player) return null;
    const info = this.player.getSongInfo?.() ?? {};
    // Update subsong count if available
    if (info.songs) this.numSubsongs = info.songs;
    return info;
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

    this.player = null;
    this.adapter = null;
  }
}
