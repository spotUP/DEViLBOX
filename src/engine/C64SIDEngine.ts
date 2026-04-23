/**
 * C64SIDEngine.ts
 * 
 * Unified C64 SID playback engine that uses DeepSID emulators.
 * Handles playback while SIDParser extracts patterns for the tracker.
 * 
 * Architecture:
 * - SIDParser: 6502 emulation to extract NOTE data for tracker patterns
 * - C64SIDEngine: Real SID chip emulation for audio playback
 */

import { deepSIDManager, type SIDEngineType } from './deepsid/DeepSIDEngineManager';
import { JSSIDEngine } from './deepsid/engines/JSSIDEngine';
import { ScriptNodePlayerEngine } from './deepsid/engines/ScriptNodePlayerEngine';
import { JSIDPlay2Engine } from './deepsid/engines/JSIDPlay2Engine';
import { useSettingsStore } from '@stores/useSettingsStore';

type EngineInstance = JSSIDEngine | ScriptNodePlayerEngine | JSIDPlay2Engine;

export interface C64SIDMetadata {
  title: string;
  author: string;
  copyright: string;
  subsongs: number;
  defaultSubsong: number;
  chipModel: '6581' | '8580';
  clockSpeed: number; // PAL: 985248, NTSC: 1022727
}

/**
 * C64SIDEngine - High-level wrapper for DeepSID playback
 */
// Per-engine volume compensation (linear gain multipliers).
// Tuned so all engines produce roughly the same perceived loudness.
const ENGINE_GAIN: Record<SIDEngineType, number> = {
  jssid: 0.7,
  websid: 1.0,
  tinyrsid: 0.65,
  websidplay: 0.8,
  jsidplay2: 0.75,
};

type HardwareChangeCallback = (enabled: boolean) => void;

export class C64SIDEngine {
  private engine: EngineInstance | null = null;
  private engineType: SIDEngineType | null = null;
  private audioContext: AudioContext | null = null;
  private metadata: C64SIDMetadata | null = null;
  private sidData: Uint8Array;
  private gainNode: GainNode | null = null;
  private masterVolume = 1.0; // 0-1 linear
  private playbackRate = 1.0; // pitch multiplier (1.0 = normal)
  private dubBoost = 1.0; // dub-mode make-up gain multiplier on top of ENGINE_GAIN

  // Hardware SID output — reads emulated SID registers at audio-clock rate
  // and forwards them to SIDHardwareManager (USB-SID-Pico / ASID). Skipped
  // when the jsSID backend is active since it has its own cycle-exact bridge.
  private hwEnabled = false;
  private hwEngineGain = 1.0; // saved gain before mute
  private hwListeners = new Set<HardwareChangeCallback>();

  constructor(sidData: Uint8Array) {
    this.sidData = sidData;
    this.extractMetadata();
  }

  /**
   * Extract basic metadata from SID header (PSID/RSID format)
   */
  private extractMetadata(): void {
    const view = new DataView(this.sidData.buffer, this.sidData.byteOffset);
    
    // Check magic
    const magic = String.fromCharCode(
      this.sidData[0], this.sidData[1], this.sidData[2], this.sidData[3]
    );
    
    if (magic !== 'PSID' && magic !== 'RSID') {
      throw new Error('Invalid SID file: missing PSID/RSID magic');
    }
    
    // Version (offset 4, 2 bytes BE)
    const version = view.getUint16(4, false);
    
    // Data offset (offset 6, 2 bytes BE)
    const dataOffset = view.getUint16(6, false);
    
    // Songs count (offset 14, 2 bytes BE)
    const songs = view.getUint16(14, false);
    
    // Default song (offset 16, 2 bytes BE, 1-based)
    const startSong = view.getUint16(16, false);
    
    // Title, author, copyright (offset 22, 32 bytes each)
    const title = this.readStr(22, 32);
    const author = this.readStr(54, 32);
    const copyright = this.readStr(86, 32);
    
    // Flags (offset 118, 2 bytes BE) - for PSID v2+
    let chipModel: '6581' | '8580' = '6581';
    let clockSpeed = 985248; // PAL default
    
    if (version >= 2 && dataOffset >= 0x7C) {
      const flags = view.getUint16(118, false);
      
      // Bits 4-5: SID model (00=unknown, 01=6581, 10=8580, 11=both)
      const sidModel = (flags >> 4) & 0x03;
      if (sidModel === 0x02) chipModel = '8580';
      
      // Bits 2-3: Clock speed (00=unknown, 01=PAL, 10=NTSC, 11=both)
      const clock = (flags >> 2) & 0x03;
      if (clock === 0x02) clockSpeed = 1022727; // NTSC
    }
    
    this.metadata = {
      title,
      author,
      copyright,
      subsongs: songs,
      defaultSubsong: startSong - 1, // Convert to 0-based
      chipModel,
      clockSpeed,
    };
    
    console.log('[C64SIDEngine] Metadata:', this.metadata);
  }

  /**
   * Read null-terminated string from SID header
   */
  private readStr(offset: number, maxLen: number): string {
    let str = '';
    for (let i = 0; i < maxLen && this.sidData[offset + i] !== 0; i++) {
      str += String.fromCharCode(this.sidData[offset + i]);
    }
    return str.trim();
  }

  /**
   * Initialize the SID engine
   */
  async init(audioContext: AudioContext, destination?: AudioNode): Promise<void> {
    this.audioContext = audioContext;
    
    // Share Tone.js's already-unlocked AudioContext with ScriptNodePlayer.
    // Always overwrite to ensure we use Tone.js's context (which is unlocked).
    (window as any)._gPlayerAudioCtx = audioContext;
    console.log('[C64SIDEngine] AudioContext state:', audioContext.state, 'sampleRate:', audioContext.sampleRate);
    
    // Create a master GainNode for volume control + per-engine level compensation.
    // All engine outputs connect here instead of directly to destination.
    this.gainNode = audioContext.createGain();
    this.gainNode.connect(destination ?? audioContext.destination);

    // Get user's preferred engine from settings
    const engineType = useSettingsStore.getState().sidEngine || 'websid';
    
    console.log('[C64SIDEngine] Loading engine:', engineType);
    
    // Load the engine module
    const engineModule = await deepSIDManager.loadEngine(engineType);
    
    // Create engine instance
    this.engineType = engineType;

    // Apply per-engine gain compensation only (master volume handled by ToneEngine)
    const engineGain = ENGINE_GAIN[engineType] ?? 1.0;
    this.gainNode.gain.value = engineGain;
    
    switch (engineType) {
      case 'jssid':
        this.engine = new JSSIDEngine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
        });
        break;
      
      case 'websid':
      case 'tinyrsid':
      case 'websidplay':
        this.engine = new ScriptNodePlayerEngine(this.sidData, engineType, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
        });
        break;

      case 'jsidplay2':
        // JSIDPlay2 uses its own worker-based architecture (not ScriptNodePlayer)
        this.engine = new JSIDPlay2Engine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
        });
        break;
    }
    
    // Initialize the engine with the loaded module
    // jsSID gets the shared AudioContext for per-voice output routing
    if (engineType === 'jssid') {
      await (this.engine as JSSIDEngine).init(engineModule, audioContext);
    } else {
      await this.engine!.init(engineModule);
    }
    
    console.log('[C64SIDEngine] Engine initialized:', engineType);
  }

  /**
   * Start playback
   */
  async play(): Promise<void> {
    if (!this.engine || !this.audioContext) {
      throw new Error('Engine not initialized');
    }
    
    await this.engine.play(this.audioContext, this.gainNode ?? undefined);

    // Apply initial volume for jsSID (uses separate AudioContext)
    if (this.engineType === 'jssid') {
      const engineGain = ENGINE_GAIN.jssid;
      (this.engine as JSSIDEngine).setVolume(this.masterVolume * engineGain);
    }
  }

  /**
   * Set per-voice mute mask (SID has 3 voices per chip, bit N=1 means voice N active).
   * Delegates to the active DeepSID engine's setVoiceMask().
   */
  setMuteMask(mask: number): void {
    if (!this.engine) return;
    for (let v = 0; v < 3; v++) {
      const muted = (mask & (1 << v)) === 0;
      this.engine.setVoiceMask(v, muted);
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (this.engine) {
      this.engine.stop();
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.engine) {
      this.engine.pause();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.engine) {
      this.engine.resume();
    }
  }

  /**
   * Set subsong
   */
  setSubsong(subsong: number): void {
    if (this.engine) {
      this.engine.setSubsong(subsong);
    }
  }

  /**
   * Get current subsong
   */
  getSubsong(): number {
    return this.engine?.getSubsong() ?? 0;
  }

  /**
   * Get metadata
   */
  getMetadata(): C64SIDMetadata | null {
    return this.metadata;
  }

  /**
   * Get engine metadata (may have more details)
   */
  getEngineMetadata(): any {
    return this.engine?.getMetadata() ?? null;
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.engine?.isActive() ?? false;
  }

  /**
   * Get current engine type
   */
  getEngineType(): SIDEngineType | null {
    return this.engineType;
  }
  
  /**
   * Check if ASID hardware output is active
   * Only jsSID engine supports ASID
   */
  isASIDActive(): boolean {
    if (this.engineType === 'jssid' && this.engine) {
      return (this.engine as JSSIDEngine).isASIDActive();
    }
    return false;
  }
  
  /**
   * Get engine info including ASID status
   */
  getEngineInfo(): { name: string; type: SIDEngineType | null; asid: boolean } {
    return {
      name: this.engineType || 'none',
      type: this.engineType,
      asid: this.isASIDActive(),
    };
  }

  /**
   * Seek to time position (JSIDPlay2 only)
   */
  seek(timeSeconds: number): void {
    if (this.engine && this.engine instanceof JSIDPlay2Engine) {
      this.engine.seek(timeSeconds);
    }
  }

  /**
   * Get current playback time (JSIDPlay2 only)
   */
  getCurrentTime(): number {
    if (this.engine && this.engine instanceof JSIDPlay2Engine) {
      return this.engine.getCurrentTime();
    }
    return 0;
  }

  /**
   * Set playback speed multiplier
   */
  setSpeed(multiplier: number): void {
    if (this.engine && 'setSpeed' in this.engine) {
      (this.engine as any).setSpeed(multiplier);
    }
  }

  /**
   * Set playback rate for pitch control (1.0 = normal, 2.0 = +1 octave).
   * Adjusts both the emulation speed and the effective BPM.
   */
  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.25, Math.min(4.0, rate));
    // Forward to underlying engine's speed control
    if (this.engine && 'setSpeed' in this.engine) {
      (this.engine as any).setSpeed(this.playbackRate);
    }
  }

  /**
   * Get current playback rate
   */
  getPlaybackRate(): number {
    return this.playbackRate;
  }

  /**
   * Reconnect GainNode output to a new destination (e.g. synthBus for master FX).
   * Disconnects from all previous destinations first.
   */
  connectTo(destination: AudioNode): void {
    if (!this.gainNode) return;
    try { this.gainNode.disconnect(); } catch { /* already disconnected */ }
    this.gainNode.connect(destination);
    // Re-attach dub send if it was connected
    if (this.dubSendGain) {
      try { this.gainNode.connect(this.dubSendGain); } catch { /* ok */ }
    }
  }

  // ── Dub bus send ─────────────────────────────────────────────────────
  private dubSendGain: GainNode | null = null;

  /**
   * Connect a parallel dub bus send. SID audio feeds both the synthBus
   * (for master FX / main output) AND the dub bus input (for echo/spring).
   * The send starts at gain=0 (silent) — echo throws ramp it up.
   * This is a WET SEND: audio entering the dub bus goes through echo+reverb.
   */
  connectDubSend(dubBusInput: AudioNode, amount = 0): void {
    if (!this.gainNode) return;
    // Tear down existing send if present
    this.disconnectDubSend();
    const ctx = this.gainNode.context;
    this.dubSendGain = ctx.createGain();
    this.dubSendGain.gain.value = amount;
    this.gainNode.connect(this.dubSendGain);
    this.dubSendGain.connect(dubBusInput);
  }

  /** Set the dub send level (0-1). */
  setDubSendAmount(amount: number): void {
    if (!this.dubSendGain) return;
    const now = this.dubSendGain.context.currentTime;
    this.dubSendGain.gain.cancelScheduledValues(now);
    this.dubSendGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, amount)), now, 0.02,
    );
  }

  /** Disconnect the dub bus send. */
  disconnectDubSend(): void {
    if (!this.dubSendGain) return;
    try { this.dubSendGain.disconnect(); } catch { /* ok */ }
    // Disconnect the specific connection from gainNode to dubSendGain
    if (this.gainNode) {
      try { this.gainNode.disconnect(this.dubSendGain); } catch { /* ok */ }
    }
    this.dubSendGain = null;
  }

  /** Get the dub send GainNode (for DubBus to boost during echo throws). */
  getDubSendGain(): GainNode | null {
    return this.dubSendGain;
  }

  /**
   * Get per-voice output GainNodes (for per-channel dub echo throws).
   * Only available when using jsSID backend with external AudioContext.
   * Returns 3 GainNodes [voice0, voice1, voice2] or null if unavailable.
   */
  getVoiceOutputs(): GainNode[] | null {
    if (this.engineType === 'jssid' && this.engine) {
      return (this.engine as JSSIDEngine).getVoiceOutputs();
    }
    return null;
  }

  /** Whether per-voice output routing is available. */
  hasPerVoiceOutput(): boolean {
    if (this.engineType === 'jssid' && this.engine) {
      return (this.engine as JSSIDEngine).hasPerVoiceOutput();
    }
    return false;
  }

  /**
   * Get voice state for oscilloscope/pattern extraction
   */
  getVoiceState(voice: number): any {
    if (this.engine && 'getVoiceState' in this.engine) {
      return (this.engine as any).getVoiceState(voice);
    }
    return null;
  }

  // ── C64 Memory Access (for live editing) ─────────────────────────────

  /**
   * Read a byte from emulated C64 RAM.
   * Requires websid or tinyrsid backend.
   */
  readRAM(address: number): number | null {
    if (this.engine && 'readRAM' in this.engine) {
      return (this.engine as ScriptNodePlayerEngine).readRAM(address);
    }
    return null;
  }

  /**
   * Write a byte to emulated C64 RAM.
   * Requires websid backend (only one with setRAM).
   * Returns true if write succeeded.
   */
  writeRAM(address: number, value: number): boolean {
    if (this.engine && 'writeRAM' in this.engine) {
      return (this.engine as ScriptNodePlayerEngine).writeRAM(address, value);
    }
    return false;
  }

  /**
   * Read a block of bytes from emulated C64 RAM.
   */
  readRAMBlock(address: number, length: number): Uint8Array | null {
    if (this.engine && 'readRAMBlock' in this.engine) {
      return (this.engine as ScriptNodePlayerEngine).readRAMBlock(address, length);
    }
    return null;
  }

  /**
   * Write a block of bytes to emulated C64 RAM.
   */
  writeRAMBlock(address: number, data: Uint8Array): boolean {
    if (this.engine && 'writeRAMBlock' in this.engine) {
      return (this.engine as ScriptNodePlayerEngine).writeRAMBlock(address, data);
    }
    return false;
  }

  /**
   * Check if the current engine supports memory read access.
   */
  hasReadAccess(): boolean {
    if (this.engine && 'hasReadAccess' in this.engine) {
      return (this.engine as ScriptNodePlayerEngine).hasReadAccess();
    }
    return false;
  }

  /**
   * Check if the current engine supports memory write access.
   */
  hasWriteAccess(): boolean {
    if (this.engine && 'hasWriteAccess' in this.engine) {
      return (this.engine as ScriptNodePlayerEngine).hasWriteAccess();
    }
    return false;
  }

  /**
   * Install a callback that fires after each ScriptProcessorNode buffer fill.
   * The C64 emulator advances inside onaudioprocess, so RAM reads in this
   * callback see the freshest state — no polling jitter.
   */
  setAfterProcessCallback(cb: () => void): void {
    if (this.engine && 'setAfterProcessCallback' in this.engine) {
      (this.engine as ScriptNodePlayerEngine).setAfterProcessCallback(cb);
    }
  }

  removeAfterProcessCallback(): void {
    if (this.engine && 'removeAfterProcessCallback' in this.engine) {
      (this.engine as ScriptNodePlayerEngine).removeAfterProcessCallback();
    }
  }

  /**
   * Set master volume (0-1 linear). Combined with per-engine gain compensation.
   * NOTE: When routed through synthBus (default), the Tone.js masterChannel
   * handles the actual master volume. This method only applies per-engine
   * gain compensation. The volume param is retained for jsSID which manages
   * its own audio pipeline.
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.engineType) {
      const engineGain = ENGINE_GAIN[this.engineType] ?? 1.0;
      const effective = engineGain * this.dubBoost;

      // jsSID uses its own AudioContext — control volume via its API
      if (this.engineType === 'jssid' && this.engine) {
        (this.engine as JSSIDEngine).setVolume(this.masterVolume * effective);
      }
      // For engines routed through synthBus, only apply engine-specific compensation.
      // Master volume is handled by ToneEngine's masterChannel.
      if (this.gainNode) {
        this.gainNode.gain.value = effective;
      }
    }
  }

  /**
   * Dub-boost make-up gain. When the user enables the dub deck in SID mode
   * the SID's dry signal often sits much quieter than the dub effects
   * (especially CheeseCutter/webSID imports). DubBus calls this with
   * boost > 1 on enable to bring the SID up to parity with the wet chain,
   * and 1 on disable to restore the baseline. Applied multiplicatively on
   * top of the engine-specific ENGINE_GAIN so per-engine calibration is
   * preserved.
   */
  setDubBoost(boost: number): void {
    const b = Math.max(0.25, Math.min(4, boost));
    this.dubBoost = b;
    if (!this.engineType) return;
    const engineGain = ENGINE_GAIN[this.engineType] ?? 1.0;
    const target = engineGain * b;
    if (this.engineType === 'jssid' && this.engine) {
      try { (this.engine as JSSIDEngine).setVolume(this.masterVolume * target); } catch { /* ok */ }
    }
    if (this.gainNode) {
      try {
        const ctx = this.gainNode.context;
        const now = ctx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(target, now + 0.12);
      } catch { /* ok */ }
    }
  }

  /**
   * Get the GainNode that all engine output routes through.
   * Can be used to reroute SID audio into the main mixer.
   */
  getOutputNode(): GainNode | null {
    return this.gainNode;
  }

  // ── Hardware SID Output ─────────────────────────────────────────────
  //
  // Reads the 25 SID registers ($D400-$D418) from emulated C64 RAM on
  // each audio-process callback (~43 Hz with a 1024-sample buffer at
  // 44.1 kHz) and forwards changed registers to SIDHardwareManager.
  //
  // The jsSID backend has its own cycle-exact WebUSB bridge that writes
  // registers individually as the SID emulator produces them — much
  // more accurate. This register-dump bridge is for the other backends
  // (websid, tinyrsid, websidplay) that don't have built-in hardware
  // output but DO expose readRAMBlock().

  get isHardwareOutputEnabled(): boolean { return this.hwEnabled; }

  onHardwareChange(cb: HardwareChangeCallback): () => void {
    this.hwListeners.add(cb);
    return () => this.hwListeners.delete(cb);
  }

  async enableHardwareOutput(): Promise<void> {
    if (this.hwEnabled) return;
    if (this.engineType === 'jssid') {
      console.log('[C64SIDEngine HW] jsSID has its own WebUSB bridge — skipping register-dump bridge');
      return;
    }
    this.hwEnabled = true;

    const { getSIDHardwareManager } = await import('@/lib/sid/SIDHardwareManager');
    const mgr = getSIDHardwareManager();
    mgr.clearDiffCache();
    void mgr.applyClockFromSettings();

    // Mute softsynth — hardware plays instead
    if (this.gainNode) {
      this.hwEngineGain = this.gainNode.gain.value;
      this.gainNode.gain.value = 0;
    }

    // Install afterProcess hook to dump registers at audio-clock rate.
    // We chain with any existing callback by wrapping it.
    const hwProcess = () => {
      if (!this.hwEnabled) return;
      const regs = this.readRAMBlock(0xD400, 25);
      if (!regs) return;
      const m = getSIDHardwareManager();
      for (let r = 0; r < 25; r++) {
        m.writeRegister(0, r, regs[r]);
      }
    };
    this.setAfterProcessCallback(hwProcess);

    console.log('[C64SIDEngine HW] Bridge enabled, mode:', mgr.mode);
    this.hwListeners.forEach(cb => cb(true));
  }

  async disableHardwareOutput(): Promise<void> {
    if (!this.hwEnabled) return;
    this.hwEnabled = false;

    // Restore softsynth gain
    if (this.gainNode) {
      this.gainNode.gain.value = this.hwEngineGain;
    }

    // Silence hardware
    try {
      const { getSIDHardwareManager } = await import('@/lib/sid/SIDHardwareManager');
      const mgr = getSIDHardwareManager();
      if (mgr.isActive) {
        mgr.writeRegister(0, 0x18, 0); // volume = 0
        mgr.flush();
      }
    } catch { /* ignore */ }

    console.log('[C64SIDEngine HW] Bridge disabled');
    this.hwListeners.forEach(cb => cb(false));
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.disconnectDubSend();
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    this.audioContext = null;
  }
}

/**
 * Create a C64 SID engine instance
 */
export function createC64SIDEngine(sidData: Uint8Array): C64SIDEngine {
  return new C64SIDEngine(sidData);
}
