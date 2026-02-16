/**
 * FurnaceDispatchSynth - DevilboxSynth wrapper for Furnace chip dispatch
 *
 * Provides a standard synth interface (triggerAttack/triggerRelease) backed by
 * the native Furnace dispatch WASM engine. Supports 57+ platforms.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import {
  FurnaceDispatchEngine,
  FurnaceDispatchPlatform,
  SampleDepth,
  DivCmd,
  type OscDataCallback
} from './FurnaceDispatchEngine';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { encodeFurnaceInstrument } from '@lib/export/FurnaceInstrumentEncoder';
import type { FurnaceConfig } from '@typedefs/instrument';

/** Channel names for each platform */
const PLATFORM_CHANNELS: Record<number, string[]> = {
  [FurnaceDispatchPlatform.GB]: ['PU1', 'PU2', 'WAV', 'NOI'],
  [FurnaceDispatchPlatform.NES]: ['PU1', 'PU2', 'TRI', 'NOI', 'DPCM'],
  [FurnaceDispatchPlatform.SMS]: ['SQ1', 'SQ2', 'SQ3', 'NOI'],
  [FurnaceDispatchPlatform.AY]: ['A', 'B', 'C'],
  [FurnaceDispatchPlatform.AY8930]: ['A', 'B', 'C'],
  [FurnaceDispatchPlatform.PCE]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6'],
  [FurnaceDispatchPlatform.SNES]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'],
  [FurnaceDispatchPlatform.VRC6]: ['PU1', 'PU2', 'SAW'],
  [FurnaceDispatchPlatform.FDS]: ['FDS'],
  [FurnaceDispatchPlatform.MMC5]: ['PU1', 'PU2', 'PCM'],
  [FurnaceDispatchPlatform.N163]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'],
  [FurnaceDispatchPlatform.C64_6581]: ['V1', 'V2', 'V3'],
  [FurnaceDispatchPlatform.C64_8580]: ['V1', 'V2', 'V3'],
  [FurnaceDispatchPlatform.VIC20]: ['BASS', 'ALT', 'SOP', 'NOI'],
  [FurnaceDispatchPlatform.SAA1099]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6'],
  [FurnaceDispatchPlatform.TIA]: ['AUD0', 'AUD1'],
  [FurnaceDispatchPlatform.POKEY]: ['CH1', 'CH2', 'CH3', 'CH4'],
  [FurnaceDispatchPlatform.LYNX]: ['CH1', 'CH2', 'CH3', 'CH4'],
  [FurnaceDispatchPlatform.SWAN]: ['CH1', 'CH2', 'CH3', 'CH4'],
  [FurnaceDispatchPlatform.VERA]: ['PU1', 'PU2', 'PU3', 'PU4', 'PU5', 'PU6', 'PU7', 'PU8', 'PU9', 'PU10', 'PU11', 'PU12', 'PU13', 'PU14', 'PU15', 'PU16', 'PCM'],
  [FurnaceDispatchPlatform.SCC]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5'],
  [FurnaceDispatchPlatform.VBOY]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6'],
  [FurnaceDispatchPlatform.AMIGA]: ['CH1', 'CH2', 'CH3', 'CH4'],
  [FurnaceDispatchPlatform.PET]: ['CH'],
  [FurnaceDispatchPlatform.PCSPKR]: ['SPK'],
  [FurnaceDispatchPlatform.SFX_BEEPER]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6'],
  [FurnaceDispatchPlatform.PONG]: ['CH'],
  [FurnaceDispatchPlatform.TED]: ['SQ1', 'SQ2'],
  [FurnaceDispatchPlatform.POKEMINI]: ['CH'],
  [FurnaceDispatchPlatform.PV1000]: ['CH1', 'CH2', 'CH3'],
  [FurnaceDispatchPlatform.SOUND_UNIT]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'],
  [FurnaceDispatchPlatform.NAMCO]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'],
  [FurnaceDispatchPlatform.QSOUND]: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8', 'CH9', 'CH10', 'CH11', 'CH12', 'CH13', 'CH14', 'CH15', 'CH16'],
  [FurnaceDispatchPlatform.DAVE]: ['CH1', 'CH2', 'CH3', 'NOI'],
};

/** Platform volume maximums (matching Furnace GET_VOLMAX per chip) */
const PLATFORM_VOL_MAX: Record<number, number> = {
  // Core/Meta
  [FurnaceDispatchPlatform.NULL]: 15,
  [FurnaceDispatchPlatform.YMU759]: 127,
  [FurnaceDispatchPlatform.DUMMY]: 15,

  // Compound systems
  [FurnaceDispatchPlatform.GENESIS]: 127,
  [FurnaceDispatchPlatform.GENESIS_EXT]: 127,
  [FurnaceDispatchPlatform.SMS_OPLL]: 15,
  [FurnaceDispatchPlatform.ARCADE]: 127,
  [FurnaceDispatchPlatform.MSX2]: 127,
  [FurnaceDispatchPlatform.NES_VRC7]: 127,
  [FurnaceDispatchPlatform.NES_FDS]: 32,

  // Console platforms
  [FurnaceDispatchPlatform.SMS]: 15,
  [FurnaceDispatchPlatform.GB]: 15,
  [FurnaceDispatchPlatform.PCE]: 31,
  [FurnaceDispatchPlatform.NES]: 15,
  [FurnaceDispatchPlatform.SNES]: 127,
  [FurnaceDispatchPlatform.SWAN]: 15,
  [FurnaceDispatchPlatform.LYNX]: 127,
  [FurnaceDispatchPlatform.VBOY]: 15,
  [FurnaceDispatchPlatform.NDS]: 127,
  [FurnaceDispatchPlatform.POKEMINI]: 2,
  [FurnaceDispatchPlatform.TIA]: 15,
  [FurnaceDispatchPlatform.POKEY]: 15,

  // Commodore
  [FurnaceDispatchPlatform.C64_6581]: 15,
  [FurnaceDispatchPlatform.C64_8580]: 15,
  [FurnaceDispatchPlatform.PET]: 1,
  [FurnaceDispatchPlatform.VIC20]: 15,
  [FurnaceDispatchPlatform.TED]: 8,
  [FurnaceDispatchPlatform.C64_PCM]: 255,

  // NES Expansion
  [FurnaceDispatchPlatform.FDS]: 32,
  [FurnaceDispatchPlatform.MMC5]: 15,
  [FurnaceDispatchPlatform.N163]: 15,
  [FurnaceDispatchPlatform.VRC6]: 63,
  [FurnaceDispatchPlatform.VRC7]: 127,

  // PSG Chips
  [FurnaceDispatchPlatform.AY8910]: 15,  // AY is alias for AY8910
  [FurnaceDispatchPlatform.AY8930]: 31,
  [FurnaceDispatchPlatform.SAA1099]: 15,
  [FurnaceDispatchPlatform.T6W28]: 15,

  // Yamaha FM
  [FurnaceDispatchPlatform.YM2612]: 127,
  [FurnaceDispatchPlatform.YM2612_EXT]: 127,
  [FurnaceDispatchPlatform.YM2612_DUALPCM]: 127,
  [FurnaceDispatchPlatform.YM2612_DUALPCM_EXT]: 127,
  [FurnaceDispatchPlatform.YM2612_CSM]: 127,
  [FurnaceDispatchPlatform.YM2151]: 127,
  [FurnaceDispatchPlatform.OPZ]: 127,  // TX81Z is alias for OPZ
  [FurnaceDispatchPlatform.YM2203]: 15,
  [FurnaceDispatchPlatform.YM2203_EXT]: 127,
  [FurnaceDispatchPlatform.YM2203_CSM]: 15,
  [FurnaceDispatchPlatform.YM2608]: 255,
  [FurnaceDispatchPlatform.YM2608_EXT]: 127,
  [FurnaceDispatchPlatform.YM2608_CSM]: 255,
  [FurnaceDispatchPlatform.YM2610_CRAP]: 255,
  [FurnaceDispatchPlatform.YM2610_CRAP_EXT]: 127,
  [FurnaceDispatchPlatform.YM2610_FULL]: 255,  // YM2610 is alias for YM2610_FULL
  [FurnaceDispatchPlatform.YM2610_FULL_EXT]: 127,  // YM2610_EXT is alias for YM2610_FULL_EXT
  [FurnaceDispatchPlatform.YM2610_CSM]: 255,
  [FurnaceDispatchPlatform.YM2610B]: 255,
  [FurnaceDispatchPlatform.YM2610B_EXT]: 127,
  [FurnaceDispatchPlatform.YM2610B_CSM]: 255,

  // OPL Family
  [FurnaceDispatchPlatform.OPL]: 127,
  [FurnaceDispatchPlatform.OPL2]: 127,
  [FurnaceDispatchPlatform.OPL3]: 127,
  [FurnaceDispatchPlatform.OPL_DRUMS]: 127,
  [FurnaceDispatchPlatform.OPL2_DRUMS]: 127,
  [FurnaceDispatchPlatform.OPL3_DRUMS]: 127,
  [FurnaceDispatchPlatform.OPL4]: 127,
  [FurnaceDispatchPlatform.OPL4_DRUMS]: 127,
  [FurnaceDispatchPlatform.OPLL]: 15,
  [FurnaceDispatchPlatform.OPLL_DRUMS]: 15,
  [FurnaceDispatchPlatform.Y8950]: 127,
  [FurnaceDispatchPlatform.Y8950_DRUMS]: 127,
  [FurnaceDispatchPlatform.ESFM]: 63,

  // Sample-based
  [FurnaceDispatchPlatform.AMIGA]: 64,
  [FurnaceDispatchPlatform.SEGAPCM]: 127,
  [FurnaceDispatchPlatform.SEGAPCM_COMPAT]: 127,
  [FurnaceDispatchPlatform.MULTIPCM]: 127,
  [FurnaceDispatchPlatform.QSOUND]: 255,
  [FurnaceDispatchPlatform.RF5C68]: 255,
  [FurnaceDispatchPlatform.PCM_DAC]: 255,
  [FurnaceDispatchPlatform.ES5506]: 255,  // 255 for native mode, 64 for amigaVol mode
  [FurnaceDispatchPlatform.K007232]: 15,
  [FurnaceDispatchPlatform.K053260]: 127,
  [FurnaceDispatchPlatform.GA20]: 255,
  [FurnaceDispatchPlatform.C140]: 255,
  [FurnaceDispatchPlatform.C219]: 15,
  [FurnaceDispatchPlatform.YMZ280B]: 255,
  [FurnaceDispatchPlatform.MSM6258]: 8,
  [FurnaceDispatchPlatform.MSM6295]: 8,

  // Wavetable
  [FurnaceDispatchPlatform.SCC]: 15,
  [FurnaceDispatchPlatform.SCC_PLUS]: 15,
  [FurnaceDispatchPlatform.NAMCO]: 15,
  [FurnaceDispatchPlatform.NAMCO_15XX]: 15,
  [FurnaceDispatchPlatform.NAMCO_CUS30]: 15,
  [FurnaceDispatchPlatform.BUBSYS_WSG]: 15,
  [FurnaceDispatchPlatform.X1_010]: 15,
  [FurnaceDispatchPlatform.VERA]: 63,
  [FurnaceDispatchPlatform.SOUND_UNIT]: 127,

  // Other/Misc
  [FurnaceDispatchPlatform.PCSPKR]: 1,
  [FurnaceDispatchPlatform.PONG]: 1,
  [FurnaceDispatchPlatform.PV1000]: 1,
  [FurnaceDispatchPlatform.MSM5232]: 127,
  [FurnaceDispatchPlatform.SM8521]: 31,
  [FurnaceDispatchPlatform.DAVE]: 63,
  [FurnaceDispatchPlatform.BIFURCATOR]: 255,
  [FurnaceDispatchPlatform.POWERNOISE]: 15,

  // ZX Spectrum Beeper
  [FurnaceDispatchPlatform.SFX_BEEPER]: 1,
  [FurnaceDispatchPlatform.SFX_BEEPER_QUADTONE]: 2,

  // GBA
  [FurnaceDispatchPlatform.GBA_DMA]: 2,
  [FurnaceDispatchPlatform.GBA_MINMOD]: 255,

  // Enhanced/Experimental
  [FurnaceDispatchPlatform._5E01]: 15,

  // SID variants
  [FurnaceDispatchPlatform.SID2]: 15,
  [FurnaceDispatchPlatform.SID3]: 15,

  // Watara Supervision
  [FurnaceDispatchPlatform.SUPERVISION]: 15,

  // UPD1771C
  [FurnaceDispatchPlatform.UPD1771C]: 31,
};

function getMaxVolume(platform: number): number {
  return PLATFORM_VOL_MAX[platform] ?? 127;
}

export class FurnaceDispatchSynth implements DevilboxSynth {
  readonly name = 'FurnaceDispatchSynth';
  readonly output: GainNode;

  private engine: FurnaceDispatchEngine;
  private _disposed = false;
  /** Exposed as public for test runner init-state detection (matches _isReady pattern) */
  public _isReady = false;
  private _isReadyPromise!: Promise<void>;
  private _resolveReady!: () => void;
  private currentChannel = 0;
  private platformType: number;
  private activeNotes: Map<number, number> = new Map(); // midiNote -> channel
  private _releaseTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map(); // chan -> pending release timeout
  private _volumeOffsetDb = 0; // Volume normalization offset in dB
  private furnaceInstrumentIndex = 0; // Which Furnace instrument slot this synth uses
  private _nativeGain: GainNode | null = null; // Shared native GainNode for audio routing

  constructor(platformType: number = FurnaceDispatchPlatform.GB) {
    this.output = getDevilboxAudioContext().createGain();
    this.platformType = platformType;
    this.engine = FurnaceDispatchEngine.getInstance();
    this._isReadyPromise = new Promise((resolve) => { this._resolveReady = resolve; });
    this.initialize();
  }

  /**
   * Returns a promise that resolves when the synth is fully initialized and ready to play.
   */
  get ready(): Promise<void> {
    return this._isReadyPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this._isReadyPromise;
  }

  /**
   * Set which Furnace instrument index this synth uses (0-255).
   */
  public setFurnaceInstrumentIndex(index: number): void {
    this.furnaceInstrumentIndex = index;
  }

  /**
   * Upload Furnace instrument from config by encoding to FINS format
   * @param config - FurnaceConfig to encode
   * @param name - Instrument name
   */
  public async uploadInstrumentFromConfig(config: Record<string, unknown>, name: string): Promise<void> {
    await this.ensureInitialized();
    console.log(`[FurnaceDispatchSynth] Encoding and uploading instrument ${this.furnaceInstrumentIndex} "${name}" to platform ${this.platformType}`);

    // Encode from config using our encoder
    // The raw binary data from .fur files is in INS2 format, but the WASM expects
    // the 0xF0 0xB1 format with proper offsets. Our encoder handles this conversion.
    const { updateFurnaceInstrument } = await import('@lib/export/FurnaceInstrumentEncoder');
    const binaryData = updateFurnaceInstrument(config as unknown as import('@typedefs/instrument').FurnaceConfig, name, this.furnaceInstrumentIndex);
    console.log(`[FurnaceDispatchSynth] Encoded ${binaryData.length} bytes for instrument ${this.furnaceInstrumentIndex}`);
    this.engine.uploadFurnaceInstrument(this.furnaceInstrumentIndex, binaryData, this.platformType);

    // Force insChanged on all channels so the new instrument data (waveform,
    // ADSR, filter, etc.) gets applied on the next note-on. Without this,
    // the Furnace dispatch sees the same instrument index and skips copying
    // the updated params to channel state — making all presets sound identical.
    const numCh = this.engine.getChannelCount(this.platformType) || 3;
    for (let ch = 0; ch < numCh; ch++) {
      this.engine.setInstrument(ch, this.furnaceInstrumentIndex, this.platformType, true);
    }
  }

  /**
   * Upload Furnace instrument binary data to the engine (legacy)
   * @param rawData - Raw binary instrument data from .fur file
   * @deprecated Use uploadInstrumentFromConfig instead
   */
  public async uploadInstrumentData(rawData: Uint8Array): Promise<void> {
    if (!rawData || rawData.length === 0) {
      console.warn(`[FurnaceDispatchSynth] No instrument data to upload for index ${this.furnaceInstrumentIndex}`);
      return;
    }
    await this.ensureInitialized();
    console.log(`[FurnaceDispatchSynth] Uploading instrument ${this.furnaceInstrumentIndex} (${rawData.length} bytes) to platform ${this.platformType}`);
    this.engine.uploadFurnaceInstrument(this.furnaceInstrumentIndex, rawData, this.platformType);
  }

  /**
   * Set volume normalization offset in dB.
   * Applied to the native GainNode in the audio path.
   */
  public setVolumeOffset(db: number): void {
    this._volumeOffsetDb = db;
    if (this._nativeGain) {
      const nativeGain = this._nativeGain;
      nativeGain.gain.value = Math.pow(10, db / 20);
    }
  }

  private async initialize(): Promise<void> {
    try {
      const nativeCtx = getDevilboxAudioContext();

      await this.engine.init(nativeCtx as unknown as Record<string, unknown>);
      if (this._disposed) return;

      // Create the chip and wait for worklet to confirm creation
      const engineSampleRate = this.engine.getNativeCtx()?.sampleRate ?? nativeCtx.sampleRate;
      await this.engine.createChip(this.platformType, engineSampleRate);
      await this.engine.waitForChipCreated();

      // Connect worklet output through a shared native GainNode.
      // The worklet lives in the engine's true native AudioContext. Tone.js uses
      // standardized-audio-context (SAC) which wraps native nodes — cross-context
      // connect() calls fail or silently don't route audio. We route entirely
      // through native nodes: worklet → sharedGain → destination.
      // Multiple FurnaceDispatchSynths share one chip/worklet, so only one
      // audio route should exist (managed by the engine).
      const sharedGain = this.engine.getOrCreateSharedGain();
      if (sharedGain) {
        this._nativeGain = sharedGain;
        // Apply volume normalization (last writer wins — acceptable since
        // all instruments share the same chip output)
        if (this._volumeOffsetDb !== 0) {
          sharedGain.gain.value = Math.pow(10, this._volumeOffsetDb / 20);
        }
      }

      // Set up default instrument for this platform
      this.setupDefaultInstrument();

      this._isReady = true;
      this._resolveReady();

      // Wire oscilloscope data to the store
      const oscStore = useOscilloscopeStore.getState();
      const channelNames = this.getChannelNames();
      oscStore.setChipInfo(channelNames.length, this.platformType);

      this.engine.onOscData((channels) => {
        useOscilloscopeStore.getState().updateChannelData(channels);
      });

      console.log('[FurnaceDispatchSynth] Ready, platform:', this.platformType);
    } catch (err) {
      console.error('[FurnaceDispatchSynth] Init failed:', err);
      // Resolve the promise even on failure to prevent ensureInitialized() from hanging
      this._resolveReady();
    }
  }

  private setupDefaultInstrument(): void {
    const P = FurnaceDispatchPlatform;
    const pt = this.platformType;
    const numCh = this.engine.getChannelCount(pt) || 4;
    const maxVol = getMaxVolume(pt);

    // Helper: dispatch with platformType
    const disp = (cmd: number, ch: number, v1 = 0, v2 = 0) => this.engine.dispatch(cmd, ch, v1, v2, pt);
    const setIns = (ch: number, ins: number) => this.engine.setInstrument(ch, ins, pt);
    const setVol = (ch: number, vol: number) => this.engine.setVolume(ch, vol, pt);

    // Platform-specific setup
    switch (pt) {
      case P.GB:
        this.setupDefaultGBInstrument();
        break;

      // === C64 SID needs waveform in instrument ===
      case P.C64_6581:
      case P.C64_8580:
        this.setupDefaultC64Instrument();
        break;

      // === AY needs mixer register (reg 7) set to enable tone output ===
      // Without STD_NOISE_MODE, psgMode=0 → reg 7 = 0xFF → all outputs disabled
      case P.AY:
      case P.AY8930:
        for (let ch = 0; ch < numCh; ch++) {
          // STD_NOISE_MODE with value 0 → psgMode=(0+1)&3=1 (tone on, noise off)
          disp(DivCmd.STD_NOISE_MODE, ch, 0, 0);
        }
        break;

      // === SAA1099 needs psgMode set for tone enable ===
      // Register 0x14 (tone enable) uses bit 0 of psgMode per channel
      case P.SAA1099:
        for (let ch = 0; ch < numCh; ch++) {
          // STD_NOISE_MODE with value 1 → psgMode=(1&1)|((1&16)>>3)=1 (tone on)
          disp(DivCmd.STD_NOISE_MODE, ch, 1, 0);
        }
        break;

      // === Wavetable chips ===
      case P.PCE:
        this.setupDefaultWavetable(32, 31);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.SCC:
      case P.SCC_PLUS:
        this.setupDefaultWavetable(32, 255);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.VBOY:
        this.setupDefaultWavetable(32, 63);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.NAMCO:
      case P.NAMCO_15XX:
      case P.NAMCO_CUS30:
      case P.BUBSYS_WSG:
        this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.SWAN:
        this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.FDS:
        this.setupDefaultWavetable(64, 63);
        disp(DivCmd.WAVE, 0, 0, 0);
        break;
      case P.N163:
        this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.X1_010:
      case P.SOUND_UNIT:
        this.setupDefaultWavetable(32, 255);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;

      // === Sample-based chips (signed 8-bit PCM) ===
      case P.AMIGA:
      case P.SEGAPCM:
      case P.SEGAPCM_COMPAT:
      case P.K007232:
      case P.K053260:
      case P.GBA_DMA:
      case P.GBA_MINMOD:
      case P.NDS:
      case P.YMZ280B:
      case P.QSOUND:
      case P.MULTIPCM:
        this.loadTestSample8bit();
        this.engine.renderSamples(pt);
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      // === RF5C68 and GA20: standard signed 8-bit (WASM renderSamples converts) ===
      case P.RF5C68:
      case P.GA20:
        this.loadTestSample8bit();
        this.engine.renderSamples(pt);
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      // === VOX ADPCM chips ===
      case P.MSM6258:
      case P.MSM6295:
        this.loadTestSampleVOX();
        this.engine.renderSamples(pt);
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      case P.ES5506:
      case P.C140:
      case P.C219:
      case P.PCM_DAC:
        this.loadTestSample16bit();
        this.engine.renderSamples(pt);
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      case P.SNES:
        this.loadTestSampleBRR();
        this.engine.renderSamples(pt);
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
    }

    // For non-sample chips, set instrument and volume normally
    const sampleBasedChips: number[] = [
      P.AMIGA, P.SEGAPCM, P.SEGAPCM_COMPAT, P.RF5C68, P.K007232, P.K053260,
      P.GA20, P.GBA_DMA, P.GBA_MINMOD, P.NDS, P.MSM6295, P.YMZ280B,
      P.QSOUND, P.MULTIPCM, P.MSM6258, P.ES5506, P.C140, P.C219, P.PCM_DAC, P.SNES
    ];
    if (!sampleBasedChips.includes(pt)) {
      for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
    }
  }

  private setupDefaultGBInstrument(): void {
    const pt = this.platformType;
    const data = new Uint8Array([
      15, 0, 2, 0, 0, 1, 0, 0, // envVol, envDir, envLen, soundLen, softEnv, alwaysInit, doubleWave, hwSeqLen
    ]);
    this.engine.setGBInstrument(0, data, pt);

    for (let ch = 0; ch < 4; ch++) {
      this.engine.setInstrument(ch, 0, pt);
      this.engine.setVolume(ch, 15, pt);
    }

    // Default wavetable for channel 2 (WAV)
    const waveLen = 32;
    const waveMax = 15;
    const waveData = new Uint8Array(8 + waveLen * 4);
    const view = new DataView(waveData.buffer);
    view.setInt32(0, waveLen, true);
    view.setInt32(4, waveMax, true);
    for (let i = 0; i < waveLen; i++) {
      const val = i < waveLen / 2
        ? Math.round((i / (waveLen / 2)) * waveMax)
        : Math.round(((waveLen - i) / (waveLen / 2)) * waveMax);
      view.setInt32(8 + i * 4, val, true);
    }
    this.engine.setWavetable(0, waveData, pt);
  }

  /**
   * Set up a default C64 SID instrument with pulse waveform.
   * C64 SID requires waveform bits set in the instrument — without them,
   * the voice control register has no waveform and produces silence.
   */
  private setupDefaultC64Instrument(): void {
    const pt = this.platformType;
    const numCh = this.engine.getChannelCount(pt) || 3;

    // Build a minimal C64 instrument: pulse wave, fast ADSR, 50% duty
    const config: FurnaceConfig = {
      chipType: 3, // DIV_INS_C64
      algorithm: 0, feedback: 0, fms: 0, ams: 0, fms2: 0, ams2: 0,
      ops: 0, opllPreset: 0, fixedDrums: false,
      operators: [],
      macros: [
        // Volume macro: full volume (15)
        { code: 0, type: 0, data: [15], loop: -1, release: -1, mode: 0 },
      ],
      opMacros: [],
      wavetables: [],
      c64: {
        triOn: false,
        sawOn: false,
        pulseOn: true,   // Pulse waveform — required for sound!
        noiseOn: false,
        a: 0,  // Instant attack
        d: 0,  // No decay
        s: 15, // Max sustain
        r: 1,  // Short release
        duty: 2048, // 50% duty cycle
        ringMod: false,
        oscSync: false,
      },
    };

    const binaryData = encodeFurnaceInstrument(config, 'Default C64');
    this.engine.uploadFurnaceInstrument(0, binaryData, pt);

    for (let ch = 0; ch < numCh; ch++) {
      this.engine.setInstrument(ch, 0, pt);
      this.engine.setVolume(ch, 15, pt);
    }
  }

  /**
   * Set up a default wavetable (sawtooth) for wavetable-based chips.
   * @param waveLen - Number of samples (typically 32 or 64)
   * @param waveMax - Maximum value (depends on chip bit depth)
   */
  private setupDefaultWavetable(waveLen: number, waveMax: number): void {
    const waveData = new Uint8Array(8 + waveLen * 4);
    const view = new DataView(waveData.buffer);
    view.setInt32(0, waveLen, true);
    view.setInt32(4, waveMax, true);
    // Sawtooth wave: ramps from 0 to waveMax
    for (let i = 0; i < waveLen; i++) {
      const val = Math.round((i / (waveLen - 1)) * waveMax);
      view.setInt32(8 + i * 4, val, true);
    }
    this.engine.setWavetable(0, waveData, this.platformType);
  }

  /**
   * Build a sample binary header (32 bytes) for the WASM dispatch engine.
   */
  private buildSampleHeader(
    sampleCount: number,
    depth: number,
    centerRate: number = 8363,
    loopStart: number = 0,
    loopEnd?: number,
    loop: boolean = true
  ): DataView {
    const header = new DataView(new ArrayBuffer(32));
    header.setUint32(0, sampleCount, true);   // samples
    header.setInt32(4, loopStart, true);       // loopStart
    header.setInt32(8, loopEnd ?? sampleCount, true); // loopEnd
    header.setUint8(12, depth);                // depth
    header.setUint8(13, loop ? 0 : 0);        // loopMode: forward
    header.setUint8(14, 0);                    // brrEmphasis
    header.setUint8(15, 0);                    // dither
    header.setUint32(16, centerRate, true);    // centerRate
    header.setUint8(22, loop ? 1 : 0);        // loop flag
    return header;
  }

  /**
   * Generate a test 8-bit signed PCM square wave sample and upload it.
   * Used for Amiga, SEGAPCM, RF5C68, QSound, and other 8-bit sample chips.
   */
  private loadTestSample8bit(): void {
    const sampleLen = 32;
    const headerSize = 32;
    const data = new Uint8Array(headerSize + sampleLen);
    const header = this.buildSampleHeader(sampleLen, 8, 8363);
    // Copy header
    new Uint8Array(data.buffer, 0, headerSize).set(new Uint8Array(header.buffer));
    // Square wave: first half positive, second half negative
    for (let i = 0; i < sampleLen; i++) {
      data[headerSize + i] = i < sampleLen / 2 ? 0x7F : 0x80; // 127, -128 signed
    }
    this.engine.setSample(0, data, this.platformType);
  }

  /**
   * Generate a test 16-bit signed PCM square wave sample and upload it.
   * Used for ES5506, C140, C219, MultiPCM, and other 16-bit sample chips.
   */
  private loadTestSample16bit(): void {
    const sampleLen = 32;
    const headerSize = 32;
    const dataBytes = sampleLen * 2;
    const data = new Uint8Array(headerSize + dataBytes);
    const header = this.buildSampleHeader(sampleLen, 16, 8363);
    new Uint8Array(data.buffer, 0, headerSize).set(new Uint8Array(header.buffer));
    // Square wave in 16-bit
    const view = new DataView(data.buffer);
    for (let i = 0; i < sampleLen; i++) {
      const val = i < sampleLen / 2 ? 32767 : -32768;
      view.setInt16(headerSize + i * 2, val, true);
    }
    this.engine.setSample(0, data, this.platformType);
  }

  /**
   * Generate a test BRR (Bit Rate Reduction) sample for SNES.
   * BRR format: 9 bytes per 16 samples (1 header + 8 data bytes).
   * Simple square wave encoded in BRR format.
   */
  private loadTestSampleBRR(): void {
    const sampleLen = 32; // 32 samples = 2 BRR blocks
    const brrBlockSize = 9; // 9 bytes per 16 samples
    const numBlocks = Math.ceil(sampleLen / 16);
    const brrSize = numBlocks * brrBlockSize;
    const headerSize = 32;
    const data = new Uint8Array(headerSize + brrSize);
    const header = this.buildSampleHeader(sampleLen, 9 /* DIV_SAMPLE_DEPTH_BRR */, 8363);
    new Uint8Array(data.buffer, 0, headerSize).set(new Uint8Array(header.buffer));
    // BRR encoding: header byte sets range/filter/loop/end flags
    // Simple approach: range=12 (max shift), filter=0 (no filter)
    for (let b = 0; b < numBlocks; b++) {
      const offset = headerSize + b * brrBlockSize;
      // Header: range=12 (bits 4-7), filter=0 (bits 2-3), loop=1 (bit 1), end=last block (bit 0)
      const isLast = b === numBlocks - 1;
      data[offset] = (12 << 4) | (0 << 2) | (1 << 1) | (isLast ? 1 : 0);
      // 8 data bytes, each has two 4-bit nibbles (high=sample N, low=sample N+1)
      // For a square wave: first 8 samples positive (+7), next 8 negative (-8)
      for (let i = 0; i < 8; i++) {
        const sampleIdx = b * 16 + i * 2;
        const hi = sampleIdx < 16 ? 0x07 : 0x08; // +7 or -8 (4-bit signed)
        const lo = (sampleIdx + 1) < 16 ? 0x07 : 0x08;
        data[offset + 1 + i] = ((hi & 0x0F) << 4) | (lo & 0x0F);
      }
    }
    this.engine.setSample(0, data, this.platformType);
  }

  /**
   * Generate a test VOX ADPCM sample for MSM6258.
   * VOX format: 4 bits per sample (2 samples per byte).
   */
  private loadTestSampleVOX(): void {
    const sampleLen = 32; // 32 samples
    const bytesNeeded = (sampleLen + 1) / 2; // 16 bytes (2 samples per byte)
    const headerSize = 32;
    const data = new Uint8Array(headerSize + bytesNeeded);
    const header = this.buildSampleHeader(sampleLen, SampleDepth.DEPTH_VOX, 8363);
    new Uint8Array(data.buffer, 0, headerSize).set(new Uint8Array(header.buffer));

    // VOX ADPCM: Each byte contains 2 nibbles (high nibble = sample N, low nibble = sample N+1)
    // Simple square wave: first 16 samples high (0xF), next 16 samples low (0x0)
    for (let i = 0; i < bytesNeeded; i++) {
      const sampleIdx = i * 2;
      const hi = sampleIdx < sampleLen / 2 ? 0xF : 0x0;
      const lo = (sampleIdx + 1) < sampleLen / 2 ? 0xF : 0x0;
      data[headerSize + i] = (hi << 4) | lo;
    }
    this.engine.setSample(0, data, this.platformType);
  }

  /**
   * Get channel names for the current platform.
   */
  getChannelNames(): string[] {
    const known = PLATFORM_CHANNELS[this.platformType];
    if (known) return known;
    // Generate fallback channel names from engine channel count
    const numCh = this.engine.getChannelCount(this.platformType) || 1;
    return Array.from({ length: numCh }, (_, i) => `CH${i + 1}`);
  }

  /**
   * Get the number of channels.
   */
  getNumChannels(): number {
    return this.engine.getChannelCount(this.platformType);
  }

  /**
   * Subscribe to oscilloscope data updates.
   */
  onOscData(callback: OscDataCallback): () => void {
    return this.engine.onOscData(callback);
  }

  /**
   * Get latest oscilloscope data.
   */
  getOscData(): (Int16Array | null)[] {
    return this.engine.getOscData();
  }

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this._isReady || this._disposed) {
      console.warn(`[FurnaceDispatchSynth] triggerAttack blocked: ready=${this._isReady} disposed=${this._disposed} platform=${this.platformType}`);
      return;
    }

    const midiNote = typeof note === 'string'
      ? noteToMidi(note)
      : (note > 127
        ? Math.round(12 * Math.log2(note / 440) + 69)
        : note);

    // Find a channel to use (simple round-robin for the platform)
    // For GB: channels 0-1 are pulse, 2 is wave, 3 is noise
    // Use channel 0 for now (can be made smarter later)
    const chan = this.currentChannel;

    // Cancel any pending release timeout on this channel.
    // Without this, the PREVIOUS note's scheduled noteOff kills the
    // CURRENT note because they share the same chip channel.
    const pendingRelease = this._releaseTimeouts.get(chan);
    if (pendingRelease) {
      clearTimeout(pendingRelease);
      this._releaseTimeouts.delete(chan);
    }

    const pt = this.platformType;
    // Set the instrument for this channel BEFORE playing the note.
    // Use force=true so insChanged is always set — the instrument data
    // in slot 0 may have been replaced by a preset load, and without
    // forcing, the dispatch skips copying params when the index matches.
    console.log(`[FurnaceDispatchSynth] triggerAttack: note=${midiNote} chan=${chan} inst=${this.furnaceInstrumentIndex} platform=${pt}`);
    this.engine.setInstrument(chan, this.furnaceInstrumentIndex, pt, true);

    // Set volume based on velocity
    const maxVol = getMaxVolume(pt);
    const vol = Math.round(velocity * maxVol);
    this.engine.setVolume(chan, vol, pt);

    // Furnace dispatch uses (midiNote - 12) as the note value
    // The dispatch expects 12 = C-1, so MIDI 60 (C4) = note 60
    this.engine.noteOn(chan, midiNote, pt);

    // Track active note
    this.activeNotes.set(midiNote, chan);
  }

  triggerAttackRelease(
    note: string | number,
    duration: number,
    time?: number,
    velocity: number = 1,
  ): void {
    this.triggerAttack(note, time, velocity);
    // Schedule release after duration
    const ctx = this.engine.getNativeCtx();
    if (ctx) {
      const chan = this.currentChannel;
      const releaseTime = (time ?? ctx.currentTime) + duration;
      const timeoutId = setTimeout(() => {
        this._releaseTimeouts.delete(chan);
        this.triggerRelease(note);
      }, Math.max(0, (releaseTime - ctx.currentTime) * 1000));
      // Store so triggerAttack can cancel if a new note arrives before release
      this._releaseTimeouts.set(chan, timeoutId);
    }
  }

  triggerRelease(note?: string | number, time?: number): void {
    void time;
    if (!this._isReady || this._disposed) return;

    if (note !== undefined) {
      // Release a specific note
      const midiNote = typeof note === 'string'
        ? noteToMidi(note)
        : (note > 127
          ? Math.round(12 * Math.log2(note / 440) + 69)
          : note);

      const chan = this.activeNotes.get(midiNote);
      if (chan !== undefined) {
        this.engine.noteOff(chan, this.platformType);
        this.activeNotes.delete(midiNote);
      }
    } else {
      // Release all active notes
      for (const [, chan] of this.activeNotes) {
        this.engine.noteOff(chan, this.platformType);
      }
      this.activeNotes.clear();
    }
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  /**
   * Set which channel to play notes on.
   */
  setChannel(chan: number): void {
    console.log(`[FurnaceDispatchSynth] setChannel: ${chan} (platform ${this.platformType})`);
    this.currentChannel = chan;
  }

  /**
   * Send a raw dispatch command.
   */
  sendCommand(cmd: number, chan: number, val1: number = 0, val2: number = 0): void {
    if (!this._isReady || this._disposed) return;
    this.engine.dispatch(cmd, chan, val1, val2, this.platformType);
  }

  applyEffect(effect: number, param: number, chan?: number): void {
    if (!this._isReady || this._disposed) return;
    this.engine.applyEffect(chan ?? this.currentChannel, effect, param, this.platformType);
  }

  applyExtendedEffect(x: number, y: number, chan?: number): void {
    if (!this._isReady || this._disposed) return;
    this.engine.applyExtendedEffect(chan ?? this.currentChannel, x, y, this.platformType);
  }

  applyPlatformEffect(effect: number, param: number, chan?: number): void {
    if (!this._isReady || this._disposed) return;
    this.engine.applyPlatformEffect(chan ?? this.currentChannel, effect, param, this.platformType);
  }

  /**
   * Reset effect memory (call on song stop/restart).
   */
  resetEffectMemory(): void {
    this.engine.resetEffectMemory();
  }

  /**
   * Set a Game Boy instrument.
   */
  setGBInstrument(insIndex: number, insData: Uint8Array): void {
    this.engine.setGBInstrument(insIndex, insData, this.platformType);
  }

  setWavetable(waveIndex: number, waveData: Uint8Array): void {
    this.engine.setWavetable(waveIndex, waveData, this.platformType);
  }

  renderSamples(): void {
    this.engine.renderSamples(this.platformType);
  }

  /**
   * Set parameter by name (compatibility with other synths).
   */
  setParam(param: string, value: number): void {
    // Map param names to dispatch commands
    switch (param) {
      case 'volume':
        this.engine.setVolume(this.currentChannel, value, this.platformType);
        break;
      case 'channel':
        this.currentChannel = value;
        break;
    }
  }

  dispose(): void {
    this._disposed = true;
    this.activeNotes.clear();
    // Cancel all pending release timeouts
    for (const timeout of this._releaseTimeouts.values()) {
      clearTimeout(timeout);
    }
    this._releaseTimeouts.clear();

    // The _nativeGain is the engine's shared gain node — don't disconnect it
    // here as other synths may still be using it. The engine manages its lifecycle.
    this._nativeGain = null;

    // Don't dispose the engine singleton — other synths may use it
    this.output.disconnect();
  }
}
