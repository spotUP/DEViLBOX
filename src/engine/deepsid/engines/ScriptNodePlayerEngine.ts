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
import { BASIC_ROM, KERNAL_ROM, CHAR_ROM } from '../c64roms';

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
  private playing = false;
  private subsong = 0;
  private numSubsongs = 1;
  private voiceMask = 0x1FF; // bitmask: bit N=1 → voice N enabled
  private _originalOnaudioprocess: ((e: AudioProcessingEvent) => void) | null = null;

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

    // Get the adapter class from the global scope.
    // Class declarations (ES6) don't auto-create window properties — the backend
    // scripts explicitly assign to window, but poll briefly as a safety net.
    const adapterClassName = ADAPTER_CLASS_MAP[this.engineType];
    if (!adapterClassName) {
      throw new Error(`No adapter class mapped for engine: ${this.engineType}`);
    }

    let AdapterClass = win[adapterClassName];
    if (!AdapterClass) {
      // Poll for up to 3 seconds in case of timing race
      for (let i = 0; i < 30 && !AdapterClass; i++) {
        await new Promise((r) => setTimeout(r, 100));
        AdapterClass = win[adapterClassName];
      }
    }
    if (!AdapterClass) {
      throw new Error(
        `Backend adapter class '${adapterClassName}' not found. ` +
        `Is backend script loaded?`,
      );
    }

    // Create backend adapter
    if (this.engineType === 'tinyrsid') {
      this.adapter = new AdapterClass(); // LegacySIDBackendAdapter takes no args
    } else {
      // SIDBackendAdapter and SIDPlayBackendAdapter take (basicROM, charROM, kernalROM, nextFrameCB, enableMd5)
      // WebSIDPlay (libsidplayfp) REQUIRES C64 ROMs to properly emulate the CPU and play real SID tunes.
      // Without ROMs, only direct SID register writes work (test beeps), not actual C64 player routines.
      this.adapter = new AdapterClass(BASIC_ROM, CHAR_ROM, KERNAL_ROM, undefined, false);
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

    // Reduce ScriptProcessorNode buffer from default 2048 to 1024 samples.
    // 2048 samples @ 44.1kHz = ~46ms between emulator advances, causing
    // visibly jerky pattern scrolling. 1024 = ~23ms = smoother without underruns.
    if (this.adapter?.setProcessorBufSize) {
      this.adapter.setProcessorBufSize(1024);
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
   * Start playback — feeds SID binary data directly to ScriptNodePlayer internals.
   *
   * Bypasses the blob URL + XHR pipeline entirely to avoid ScriptNodePlayer's
   * URL path mangling (mapToVirtualFilename replaces ':' with '{3]') which can
   * break Emscripten FS registration and filename-based format detection.
   *
   * Calls _prepareTrackForPlayback directly, which invokes:
   *   _loadMusicData → backend.loadMusicData → WASM emu_load_file
   */
  async play(_audioContext: AudioContext, outputNode?: AudioNode): Promise<void> {
    if (this.playing) return;
    if (!this.player) throw new Error('Player not initialized');

    // Ensure audio pipeline is set up (Chrome defers until user gesture)
    this.player._initByUserGesture();

    // Set the track-ready callback — createInstance leaves it undefined,
    // causing a TypeError in _initIfNeeded on first file load.
    if (!this.player._onTrackReadyToPlay) {
      this.player._onTrackReadyToPlay = () => {};
    }

    // Set volume to full — volume control is handled by C64SIDEngine's GainNode
    this.player.setVolume(1);

    // If an output node is provided, reroute ScriptNodePlayer's internal
    // gain node through it instead of going directly to audioContext.destination.
    if (outputNode && this.player._gainNode) {
      try {
        this.player._gainNode.disconnect();
        this.player._gainNode.connect(outputNode);
      } catch { /* disconnect may throw if not connected */ }
    }

    // Create a standalone ArrayBuffer copy of the SID data
    const dataBuffer = this.sidData.buffer.slice(
      this.sidData.byteOffset,
      this.sidData.byteOffset + this.sidData.byteLength,
    );

    const filename = 'loaded.sid';
    const options = { track: this.subsong };

    console.log(`[${this.engineType}] Loading SID data directly (%d bytes)`, this.sidData.byteLength);

    // Pre-populate ScriptNodePlayer's internal file cache so that when the WASM
    // requests the file via _fileRequestCallback → _preloadFile, it finds it in
    // cache and returns immediately (with flag=false, no re-init callback).
    // Without this, _preloadFile triggers an XHR (404), then calls _initIfNeeded
    // which runs _loadMusicData (including teardown()) → corrupts emulator state.
    if (this.player._getCache) {
      const cacheData = new Uint8Array(dataBuffer);
      this.player._getCache().setFile(filename, cacheData);
      this.player._getCache().setFile('/' + filename, cacheData);
    }

    // Feed data directly: _prepareTrackForPlayback → _initIfNeeded → _loadMusicData → WASM
    const success = this.player._prepareTrackForPlayback(
      filename,
      dataBuffer,
      options,
      () => {}, // onCompletion
      (err: any) => console.error(`[${this.engineType}] Track prep failed:`, err),
    );

    if (!success) {
      // Log diagnostic state
      console.error(`[${this.engineType}] _prepareTrackForPlayback returned false`, {
        isSongReady: this.player._isSongReady,
        isPaused: this.player._isPaused,
        sampleRate: this.player._sampleRate,
        ctxState: (window as any)._gPlayerAudioCtx?.state,
      });
      throw new Error(`[${this.engineType}] Failed to load SID data into WASM backend`);
    }

    this.playing = true;
    console.log(`[${this.engineType}] Playback started, subsong:`, this.subsong,
      'isSongReady:', this.player._isSongReady,
      'isPaused:', this.player._isPaused,
      'ctxState:', (window as any)._gPlayerAudioCtx?.state);
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
      if (this.playing && this.player) {
        const dataBuffer = this.sidData.buffer.slice(
          this.sidData.byteOffset,
          this.sidData.byteOffset + this.sidData.byteLength,
        );
        this.player._prepareTrackForPlayback(
          'loaded.sid',
          dataBuffer,
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
   * Read a byte from emulated C64 RAM.
   * Only works with backends that expose getRAM (websid, tinyrsid).
   */
  readRAM(address: number): number | null {
    if (!this.adapter?.getRAM) return null;
    try {
      return this.adapter.getRAM(address) & 0xFF;
    } catch {
      return null;
    }
  }

  /**
   * Write a byte to emulated C64 RAM.
   * Only works with websid backend (has setRAM).
   */
  writeRAM(address: number, value: number): boolean {
    if (!this.adapter?.setRAM) return false;
    try {
      this.adapter.setRAM(address, value & 0xFF);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a block of bytes from emulated C64 RAM.
   */
  readRAMBlock(address: number, length: number): Uint8Array | null {
    if (!this.adapter?.getRAM) return null;
    try {
      const data = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        data[i] = this.adapter.getRAM(address + i) & 0xFF;
      }
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Write a block of bytes to emulated C64 RAM.
   */
  writeRAMBlock(address: number, data: Uint8Array): boolean {
    if (!this.adapter?.setRAM) return false;
    try {
      for (let i = 0; i < data.length; i++) {
        this.adapter.setRAM(address + i, data[i] & 0xFF);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if this engine supports memory read access.
   */
  hasReadAccess(): boolean {
    return !!this.adapter?.getRAM;
  }

  /**
   * Check if this engine supports memory write access.
   */
  hasWriteAccess(): boolean {
    return !!this.adapter?.setRAM;
  }

  /**
   * Set playback speed
   */
  setSpeed(_multiplier: number): void {
    // ScriptNodePlayer doesn't expose speed control directly
  }

  /**
   * Mute/unmute a voice — tinyrsid adapter has enableVoices(mask)
   */
  setVoiceMask(voice: number, muted: boolean): void {
    if (muted) {
      this.voiceMask &= ~(1 << voice);
    } else {
      this.voiceMask |= (1 << voice);
    }
    // tinyrsid backend exposes enableVoices on its adapter
    if (this.adapter?.enableVoices) {
      this.adapter.enableVoices(this.voiceMask);
    }
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
    this.removeAfterProcessCallback();
    // Call WASM _emu_teardown to reset emulator state for reuse.
    // The spp_backend_state_* globals ARE the Emscripten Modules.
    const stateKey = MODULE_STATE_MAP[this.engineType];
    if (stateKey) {
      try {
        const mod = (window as any)[stateKey];
        if (mod?._emu_teardown) mod._emu_teardown();
      } catch { /* ignore */ }
    }
    this.player = null;
    this.adapter = null;
  }

  /**
   * Install a callback that fires immediately after each ScriptProcessorNode
   * audio buffer fill. The C64 emulator advances inside onaudioprocess, so
   * reading RAM in this callback gives the freshest possible position data
   * — no polling jitter.
   */
  setAfterProcessCallback(cb: () => void): void {
    this.removeAfterProcessCallback();

    // Wrap the ScriptProcessorNode's onaudioprocess to call our callback after
    const node = this.player?._producerNode;
    if (node && node.onaudioprocess) {
      this._originalOnaudioprocess = node.onaudioprocess;
      const original = this._originalOnaudioprocess!;
      node.onaudioprocess = (e: AudioProcessingEvent) => {
        original(e);
        cb();
      };
    } else {
      console.warn('[ScriptNodePlayerEngine] setAfterProcessCallback: _producerNode not available, position updates will not work');
    }
  }

  removeAfterProcessCallback(): void {
    if (this._originalOnaudioprocess && this.player?._producerNode) {
      this.player._producerNode.onaudioprocess = this._originalOnaudioprocess;
    }
    this._originalOnaudioprocess = null;
  }
}
