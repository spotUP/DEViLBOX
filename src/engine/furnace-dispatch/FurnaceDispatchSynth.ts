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
import { FurnaceChipType } from '@engine/chips/FurnaceChipEngine';
import { getToneEngine } from '@engine/ToneEngine';

// DivInstrumentType constants (matching FurnaceInstrumentEncoder)
const DIV_INS_FM = 1;
const DIV_INS_OPM = 33;
const DIV_INS_OPL = 14;

const DIV_INS_OPZ = 19;
const DIV_INS_ESFM = 55;

/**
 * Map FurnaceDispatchPlatform → correct chipType for instrument encoding.
 * This ensures that when a generic config (e.g. DEFAULT_FURNACE with chipType=1)
 * is uploaded to a specific chip, the instrument type matches what the chip expects.
 * Without this, a 4-op OPN2 instrument could be uploaded to a 2-op OPL chip,
 * causing silence or wrong register writes.
 */
const PLATFORM_TO_CHIPTYPE: Record<number, number> = Object.fromEntries([
  // OPN family → chipType 0
  [FurnaceDispatchPlatform.GENESIS, 0],
  [FurnaceDispatchPlatform.YM2612, 0],
  [FurnaceDispatchPlatform.YM2612_EXT, 0],
  [FurnaceDispatchPlatform.YM2612_DUALPCM, 0],
  [FurnaceDispatchPlatform.YM2612_DUALPCM_EXT, 0],
  [FurnaceDispatchPlatform.YM2612_CSM, 0],
  [FurnaceDispatchPlatform.YM2203, 0],
  [FurnaceDispatchPlatform.YM2203_EXT, 0],
  [FurnaceDispatchPlatform.YM2203_CSM, 0],
  [FurnaceDispatchPlatform.YM2608, 0],
  [FurnaceDispatchPlatform.YM2608_EXT, 0],
  [FurnaceDispatchPlatform.YM2608_CSM, 0],
  [FurnaceDispatchPlatform.YM2610_FULL, 0],
  [FurnaceDispatchPlatform.YM2610_FULL_EXT, 0],
  [FurnaceDispatchPlatform.YM2610_CSM, 0],
  [FurnaceDispatchPlatform.YM2610B, 0],
  [FurnaceDispatchPlatform.YM2610B_EXT, 0],
  [FurnaceDispatchPlatform.YM2610B_CSM, 0],
  // OPM → chipType 1
  [FurnaceDispatchPlatform.YM2151, 1],
  // OPL family → chipType 2
  [FurnaceDispatchPlatform.OPL, 2],
  [FurnaceDispatchPlatform.OPL2, 2],
  [FurnaceDispatchPlatform.OPL3, 2],
  [FurnaceDispatchPlatform.OPL_DRUMS, 2],
  [FurnaceDispatchPlatform.OPL2_DRUMS, 2],
  [FurnaceDispatchPlatform.OPL3_DRUMS, 2],
  [FurnaceDispatchPlatform.OPL4, 2],
  [FurnaceDispatchPlatform.OPL4_DRUMS, 2],
  [FurnaceDispatchPlatform.Y8950, 2],
  [FurnaceDispatchPlatform.Y8950_DRUMS, 2],
  // OPLL → chipType 11
  [FurnaceDispatchPlatform.OPLL, 11],
  [FurnaceDispatchPlatform.OPLL_DRUMS, 11],
  [FurnaceDispatchPlatform.VRC7, 11],
  // OPZ → chipType 22
  [FurnaceDispatchPlatform.TX81Z, 22],
  // ESFM → chipType 49
  [FurnaceDispatchPlatform.ESFM, 49],
]);

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
  [FurnaceDispatchPlatform.SID3]: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'WAV'],
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
// volMax values from upstream Furnace GET_VOLMAX dispatch (per-platform .cpp files).
// Some platforms have per-channel volMax (e.g. YM2608 FM=127, PSG=15, ADPCM-A=31, ADPCM-B=255).
// For those, we use the FM channel volMax since that's the primary channel for live play.
// The WASM sequencer handles per-channel volMax correctly for .fur playback.
const PLATFORM_VOL_MAX: Record<number, number> = {
  // PSG / simple chips (4-bit volume = 15)
  [FurnaceDispatchPlatform.GB]: 15,
  [FurnaceDispatchPlatform.SMS]: 15,
  [FurnaceDispatchPlatform.NES]: 15,
  [FurnaceDispatchPlatform.AY]: 15,
  [FurnaceDispatchPlatform.C64_6581]: 15,
  [FurnaceDispatchPlatform.C64_8580]: 15,
  [FurnaceDispatchPlatform.SAA1099]: 15,
  [FurnaceDispatchPlatform.SCC]: 15,
  [FurnaceDispatchPlatform.SCC_PLUS]: 15,
  [FurnaceDispatchPlatform.VIC20]: 15,
  [FurnaceDispatchPlatform.TIA]: 15,
  [FurnaceDispatchPlatform.POKEY]: 15,
  [FurnaceDispatchPlatform.MMC5]: 15,
  [FurnaceDispatchPlatform.SWAN]: 15,
  [FurnaceDispatchPlatform.VRC6]: 15,        // pulse=15, saw=63 (per-channel)
  [FurnaceDispatchPlatform.VBOY]: 15,
  [FurnaceDispatchPlatform.N163]: 15,
  [FurnaceDispatchPlatform.OPLL]: 15,
  [FurnaceDispatchPlatform.T6W28]: 15,
  [FurnaceDispatchPlatform.NAMCO]: 15,
  [FurnaceDispatchPlatform.NAMCO_15XX]: 15,
  [FurnaceDispatchPlatform.NAMCO_CUS30]: 15,
  [FurnaceDispatchPlatform.BUBSYS_WSG]: 15,
  [FurnaceDispatchPlatform.X1_010]: 15,
  [FurnaceDispatchPlatform.K007232]: 15,
  [FurnaceDispatchPlatform.POWERNOISE]: 15,
  [FurnaceDispatchPlatform.SID2]: 15,
  [FurnaceDispatchPlatform.SUPERVISION]: 15,
  // 5-bit volume = 31
  [FurnaceDispatchPlatform.AY8930]: 31,
  [FurnaceDispatchPlatform.PCE]: 31,
  [FurnaceDispatchPlatform.SM8521]: 31,
  // 6-bit volume = 63
  [FurnaceDispatchPlatform.ESFM]: 63,
  [FurnaceDispatchPlatform.DAVE]: 63,
  [FurnaceDispatchPlatform.VERA]: 63,
  // Special small volumes
  [FurnaceDispatchPlatform.FDS]: 32,
  [FurnaceDispatchPlatform.TED]: 8,
  [FurnaceDispatchPlatform.MSM6258]: 8,
  [FurnaceDispatchPlatform.MSM6295]: 8,
  [FurnaceDispatchPlatform.POKEMINI]: 2,
  [FurnaceDispatchPlatform.GBA_DMA]: 2,       // upstream gbadma.cpp returns 2
  [FurnaceDispatchPlatform.SFX_BEEPER]: 1,
  [FurnaceDispatchPlatform.SFX_BEEPER_QUADTONE]: 2,
  [FurnaceDispatchPlatform.PCSPKR]: 1,
  [FurnaceDispatchPlatform.PONG]: 1,
  [FurnaceDispatchPlatform.PV1000]: 1,
  [FurnaceDispatchPlatform.PET]: 1,
  // Sample-based (8-bit volume = 255)
  [FurnaceDispatchPlatform.QSOUND]: 255,
  [FurnaceDispatchPlatform.RF5C68]: 255,
  [FurnaceDispatchPlatform.GA20]: 255,
  [FurnaceDispatchPlatform.C140]: 255,
  [FurnaceDispatchPlatform.C219]: 255,
  [FurnaceDispatchPlatform.YMZ280B]: 255,
  [FurnaceDispatchPlatform.BIFURCATOR]: 255,
  [FurnaceDispatchPlatform.SID3]: 255,
  [FurnaceDispatchPlatform.GBA_MINMOD]: 255,
  // 7-bit volume = 127
  [FurnaceDispatchPlatform.SNES]: 127,
  [FurnaceDispatchPlatform.NDS]: 127,
  [FurnaceDispatchPlatform.LYNX]: 127,
  [FurnaceDispatchPlatform.GENESIS]: 127,
  [FurnaceDispatchPlatform.YM2612]: 127,
  [FurnaceDispatchPlatform.YM2612_EXT]: 127,
  [FurnaceDispatchPlatform.YM2612_DUALPCM]: 127,
  [FurnaceDispatchPlatform.YM2612_DUALPCM_EXT]: 127,
  [FurnaceDispatchPlatform.YM2612_CSM]: 127,
  [FurnaceDispatchPlatform.YM2151]: 127,
  [FurnaceDispatchPlatform.TX81Z]: 127,
  [FurnaceDispatchPlatform.ARCADE]: 127,
  [FurnaceDispatchPlatform.YM2203]: 127,      // FM=127, PSG=15 (per-channel)
  [FurnaceDispatchPlatform.YM2203_EXT]: 127,
  [FurnaceDispatchPlatform.YM2203_CSM]: 127,
  [FurnaceDispatchPlatform.YM2608]: 127,      // FM=127, PSG=15, ADPCM-A=31, ADPCM-B=255
  [FurnaceDispatchPlatform.YM2608_EXT]: 127,
  [FurnaceDispatchPlatform.YM2608_CSM]: 127,
  [FurnaceDispatchPlatform.YM2610_FULL]: 127,  // FM=127, PSG=15, ADPCM-A=31, ADPCM-B=255
  [FurnaceDispatchPlatform.YM2610_FULL_EXT]: 127,
  [FurnaceDispatchPlatform.YM2610_CSM]: 127,
  [FurnaceDispatchPlatform.YM2610B]: 127,
  [FurnaceDispatchPlatform.YM2610B_EXT]: 127,
  [FurnaceDispatchPlatform.YM2610B_CSM]: 127,
  [FurnaceDispatchPlatform.SEGAPCM]: 127,
  [FurnaceDispatchPlatform.K053260]: 127,
  [FurnaceDispatchPlatform.MSM5232]: 127,
  [FurnaceDispatchPlatform.MULTIPCM]: 127,
  [FurnaceDispatchPlatform.SOUND_UNIT]: 127,
  // Amiga (6-bit + sign = 64)
  [FurnaceDispatchPlatform.AMIGA]: 64,
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
  private _initFailed = false; // Track if initialization failed (e.g., suspended AudioContext on page reload)
  private _pendingUploadConfig: { config: Record<string, unknown>, name: string } | null = null; // Stored for re-upload after retry init
  private currentChannel = 0;
  private platformType: number;
  private activeNotes: Map<number, number> = new Map(); // midiNote -> channel
  private _releaseTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map(); // chan -> pending release timeout
  // Volume normalization is handled per-chip by the worklet's POST_AMP table
  // (matching upstream Furnace 1:1). No JS-side offset on the shared gain node.
  private furnaceInstrumentIndex = 0; // Which Furnace instrument slot this synth uses
  private _nativeGain: GainNode | null = null; // Shared native GainNode for audio routing
  private _instrumentUploadPromise: Promise<void> | null = null; // Pending instrument upload

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
    await this._isReadyPromise;

    // If initialization failed previously (e.g., AudioContext was suspended on page reload),
    // retry now that the caller presumably has a running AudioContext (user gesture).
    if (this._initFailed && !this._isReady && !this._disposed) {
      console.log('[FurnaceDispatchSynth] Retrying initialization after previous failure, platform:', this.platformType);
      this._initFailed = false;
      // Create a fresh promise for the retry
      this._isReadyPromise = new Promise((resolve) => { this._resolveReady = resolve; });
      this.initialize();
      await this._isReadyPromise;

      // If retry succeeded and we have pending instrument data, re-upload it
      if (this._isReady && this._pendingUploadConfig) {
        const { config, name } = this._pendingUploadConfig;
        this._pendingUploadConfig = null;
        console.log('[FurnaceDispatchSynth] Re-uploading instrument after successful retry init');
        const uploadPromise = this.uploadInstrumentFromConfig(config, name).catch(err => {
          console.error('[FurnaceDispatchSynth] Re-upload failed:', err);
        });
        this._instrumentUploadPromise = uploadPromise as Promise<void>;
      }
    }

    // Also wait for any pending instrument upload to complete
    if (this._instrumentUploadPromise) {
      await this._instrumentUploadPromise;
    }
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
    // Store config for re-upload if init needs to be retried (e.g., page reload with suspended AudioContext)
    this._pendingUploadConfig = { config, name };

    await this._isReadyPromise; // Wait for chip init, but NOT for previous upload (avoid circular wait)

    // If init failed, don't try to upload — ensureInitialized() will retry and re-upload
    if (!this._isReady) {
      console.warn(`[FurnaceDispatchSynth] Skipping upload for "${name}" — init not ready (will retry on ensureInitialized)`);
      return;
    }

    console.log(`[FurnaceDispatchSynth] Encoding and uploading instrument ${this.furnaceInstrumentIndex} "${name}" to platform ${this.platformType}`);

    const configFurnace = config as unknown as FurnaceConfig;

    // If we have rawBinaryData from a .fur file, use it directly.
    // This is the native INS2 format that the WASM dispatch already knows how to parse.
    // It contains the correct macros for ALL platforms (Lynx duty, GB envelope, etc.)
    // and bypasses our TS encoder which may have bugs or skip non-FM platforms.
    const rawData = (configFurnace as unknown as Record<string, unknown>).rawBinaryData as Uint8Array | undefined;
    if (rawData && rawData.length > 4 &&
        rawData[0] === 0x49 && rawData[1] === 0x4E && rawData[2] === 0x53 && rawData[3] === 0x32) { // "INS2"
      console.log(`[FurnaceDispatchSynth] Using rawBinaryData INS2 (${rawData.length} bytes) for instrument ${this.furnaceInstrumentIndex}`);
      this.engine.loadIns2(this.furnaceInstrumentIndex, rawData);

      this._pendingUploadConfig = null;

      const numCh = this.engine.getChannelCount(this.platformType) || 3;
      for (let ch = 0; ch < numCh; ch++) {
        this.engine.setInstrument(ch, this.furnaceInstrumentIndex, this.platformType, true);
      }
      return;
    }

    // Skip FM instrument upload for non-FM platforms (sample/wavetable/PSG chips).
    // This only applies when we DON'T have rawBinaryData (user-created instruments).
    // initPlatform already sets up the correct instrument (sample, wavetable, etc.).
    // Uploading an FM instrument would overwrite it, causing silence.
    const correctChipType = PLATFORM_TO_CHIPTYPE[this.platformType];
    if (correctChipType === undefined && configFurnace.operators && configFurnace.operators.length > 0) {
      console.log(`[FurnaceDispatchSynth] Skipping FM instrument upload for non-FM platform ${this.platformType}`);
      this._pendingUploadConfig = null;
      return;
    }

    // Inject chip-required macros that the platform needs to produce sound.
    // Some platforms (e.g., Lynx) need a duty macro to oscillate — without it,
    // the LFSR feedback register stays 0 and no waveform is generated.
    // Spread-copy first: the config may be a frozen immer proxy from the store,
    // and we need to mutate chipType/ops/algorithm below for platform correction.
    const enriched = { ...this.injectChipRequiredMacros(config as unknown as FurnaceConfig) };

    // Correct chipType to match the platform's FM family.
    // A generic config (e.g. DEFAULT_FURNACE chipType=1/OPN2) uploaded to an OPL chip
    // would produce a mismatched instrument type, causing silence or wrong register writes.
    if (correctChipType !== undefined && enriched.chipType !== correctChipType) {
      console.log(`[FurnaceDispatchSynth] Correcting chipType ${enriched.chipType} → ${correctChipType} for platform ${this.platformType}`);
      enriched.chipType = correctChipType;

      // If converting from 4-op to 2-op (OPL family), fix operator config
      if (correctChipType === 2 && enriched.ops !== 2) {
        enriched.ops = 2;
        enriched.algorithm = 0; // OPL alg 0 = FM (modulator→carrier)
        if (enriched.operators && enriched.operators.length >= 2) {
          // Ensure carrier (op[1]) has tl=0 for full output
          enriched.operators = [
            { ...enriched.operators[0], tl: Math.min(enriched.operators[0].tl, 30) },
            { ...enriched.operators[enriched.operators.length > 2 ? 2 : 1], tl: 0 },
          ];
        }
      }
    }

    // Encode from config using our encoder
    // The raw binary data from .fur files is in INS2 format, but the WASM expects
    // the 0xF0 0xB1 format with proper offsets. Our encoder handles this conversion.
    const { updateFurnaceInstrument } = await import('@lib/export/FurnaceInstrumentEncoder');
    const binaryData = updateFurnaceInstrument(enriched as unknown as import('@typedefs/instrument').FurnaceConfig, name, this.furnaceInstrumentIndex);
    console.log(`[FurnaceDispatchSynth] Encoded ${binaryData.length} bytes for instrument ${this.furnaceInstrumentIndex}`);
    this.engine.uploadFurnaceInstrument(this.furnaceInstrumentIndex, binaryData, this.platformType);

    // Clear pending config — upload succeeded
    this._pendingUploadConfig = null;

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
   * Set the pending instrument upload promise so ensureInitialized() can wait for it.
   */
  public setInstrumentUploadPromise(promise: Promise<void>): void {
    this._instrumentUploadPromise = promise;
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
   * No-op on FurnaceDispatchSynth: volume normalization lives in the worklet's
   * POST_AMP table (per-chip, matches upstream). Applying a per-instrument
   * offset to the shared gain node caused "last writer wins" + POST_AMP
   * double-compensation, producing up to +37 dB of spurious gain.
   */
  public setVolumeOffset(_db: number): void { /* intentionally ignored */ }

  private async initialize(): Promise<void> {
    try {
      const nativeCtx = getDevilboxAudioContext();

      await this.engine.init(nativeCtx as unknown as Record<string, unknown>);
      if (this._disposed) return;

      // Create the chip and wait for worklet to confirm creation
      const engineSampleRate = this.engine.getNativeCtx()?.sampleRate ?? nativeCtx.sampleRate;
      await this.engine.createChip(this.platformType, engineSampleRate);
      await this.engine.waitForChipCreated(this.platformType);

      // Worklet → sharedGain → synthBus is routed ONCE by ToneEngine.routeNativeEngineOutput
      // (deduped per engineKey). `this.output` is kept as a silent stub so the DevilboxSynth
      // shape stays consistent with other synths — but it is intentionally NOT fed from
      // sharedGain. Connecting sharedGain → this.output per synth duplicated the signal
      // N times (once per instrument), causing multi-chip .fur songs to clip ~NxPOST_AMP.
      // Per-channel effects use the worklet's isolation slots, not per-instrument chains.
      //
      // NOTE: `_volumeOffsetDb` from the registry is designed for per-instrument synths
      // that each own their audio output. It MUST NOT be applied to sharedGain — that
      // node is shared across every instrument on this engine, so "last writer wins"
      // produces nondeterministic gain, and the worklet's per-chip POST_AMP already
      // handles loudness normalization (matching upstream Furnace 1:1). Stacking both
      // caused +7 dB residual clipping on Genesis and +37 dB MMC5 catastrophes.
      const sharedGain = this.engine.getOrCreateSharedGain();
      if (sharedGain) {
        this._nativeGain = sharedGain;
      }

      // Set up default instrument for this platform
      this.setupDefaultInstrument();

      // Ensure chip engine audio is routed through master effects chain
      try { getToneEngine().routeNativeEngineOutput(this); } catch { /* ToneEngine not ready yet */ }

      this._isReady = true;
      this._resolveReady();

      // Wire oscilloscope data to the store
      const oscStore = useOscilloscopeStore.getState();
      const channelNames = this.getChannelNames();
      oscStore.setChipInfo(channelNames.length, this.platformType, channelNames);

      this.engine.onOscData((channels) => {
        // Empty array is the engine's signal that the worklet sequencer
        // stopped and the scope should go flat — use clear() so the
        // `isActive` flag drops along with the data.
        if (channels.length === 0) {
          useOscilloscopeStore.getState().clear();
        } else {
          useOscilloscopeStore.getState().updateChannelData(channels);
        }
      });

      console.log('[FurnaceDispatchSynth] Ready, platform:', this.platformType);
    } catch (err) {
      console.error('[FurnaceDispatchSynth] Init failed:', err);
      // Mark as failed so ensureInitialized() can retry when AudioContext is running
      this._initFailed = true;
      // Resolve the promise even on failure to prevent ensureInitialized() from hanging forever
      this._resolveReady();
    }
  }

  private setupDefaultInstrument(): void {
    const P = FurnaceDispatchPlatform;
    const pt = this.platformType;
    const numCh = this.engine.getChannelCount(pt) || 4;
    const maxVol = getMaxVolume(pt);

    // Upload module-level wavetables/samples from .fur file (if available)
    // These overwrite any test data loaded below, so upload FIRST to let
    // platform-specific setup below still work (e.g., WAVE command dispatch)
    const hasModuleWaves = this.engine.getModuleWavetables() !== null;
    const hasModuleSamples = this.engine.getModuleSamples() !== null;
    if (hasModuleWaves) {
      this.engine.uploadModuleWavetablesToPlatform(pt);
    }
    if (hasModuleSamples) {
      this.engine.uploadModuleSamplesToPlatform(pt);
    }

    // Helper: dispatch with platformType
    const disp = (cmd: number, ch: number, v1 = 0, v2 = 0) => this.engine.dispatch(cmd, ch, v1, v2, pt);
    const setIns = (ch: number, ins: number) => this.engine.setInstrument(ch, ins, pt);
    const setVol = (ch: number, vol: number) => this.engine.setVolume(ch, vol, pt);

    // Platform-specific setup
    switch (pt) {
      case P.GB:
        this.setupDefaultGBInstrument();
        break;

      // === FM chips need a playable default instrument ===
      // Without explicit FM operator data, the WASM default instrument has AR=0
      // (no attack envelope) → silence. Upload a basic electric piano patch.
      case P.GENESIS:
      case P.GENESIS_EXT:
      case P.YM2203:
      case P.YM2203_EXT:
      case P.YM2608:
      case P.YM2608_EXT:
      case P.YM2610:
      case P.YM2610_EXT:
      case P.YM2610B:
      case P.YM2610B_EXT:
        this.setupDefaultFMInstrument(DIV_INS_FM);
        break;
      case P.ARCADE:
        this.setupDefaultFMInstrument(DIV_INS_OPM);
        break;
      case P.OPL:
      case P.OPL2:
      case P.OPL3:
      case P.OPL2_DRUMS:
      case P.OPL3_DRUMS:
      case P.Y8950:
      case P.Y8950_DRUMS:
      case P.OPL4:
      case P.OPL4_DRUMS:
        this.setupDefaultFMInstrument(DIV_INS_OPL);
        break;
      case P.OPLL:
      case P.OPLL_DRUMS:
      case P.VRC7:
        this.setupDefaultOPLLInstrument();
        break;
      case P.OPZ:
        this.setupDefaultFMInstrument(DIV_INS_OPZ);
        break;
      case P.ESFM:
        this.setupDefaultFMInstrument(DIV_INS_ESFM);
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
      // Skip test wavetable when module data was already uploaded above
      case P.PCE:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 31);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.SCC:
      case P.SCC_PLUS:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 255);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.VBOY:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 63);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.NAMCO:
      case P.NAMCO_15XX:
      case P.NAMCO_CUS30:
      case P.BUBSYS_WSG:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.SWAN:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.FDS:
        if (!hasModuleWaves) this.setupDefaultWavetable(64, 63);
        disp(DivCmd.WAVE, 0, 0, 0);
        break;
      case P.N163:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;
      case P.X1_010:
      case P.SOUND_UNIT:
        if (!hasModuleWaves) this.setupDefaultWavetable(32, 255);
        for (let ch = 0; ch < numCh; ch++) disp(DivCmd.WAVE, ch, 0, 0);
        break;

      // === Sample-based chips (signed 8-bit PCM) ===
      // Skip test samples when module data was already uploaded above
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
        if (!hasModuleSamples) { this.loadTestSample8bit(); this.uploadSampleInstrument(); this.engine.renderSamples(pt); }
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      // === RF5C68 and GA20: standard signed 8-bit (WASM renderSamples converts) ===
      case P.RF5C68:
      case P.GA20:
        if (!hasModuleSamples) { this.loadTestSample8bit(); this.uploadSampleInstrument(); this.engine.renderSamples(pt); }
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      // === VOX ADPCM chips ===
      case P.MSM6258:
      case P.MSM6295:
        if (!hasModuleSamples) { this.loadTestSampleVOX(); this.uploadSampleInstrument(); this.engine.renderSamples(pt); }
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      case P.ES5506:
      case P.C140:
      case P.C219:
      case P.PCM_DAC:
        if (!hasModuleSamples) { this.loadTestSample16bit(); this.uploadSampleInstrument(); this.engine.renderSamples(pt); }
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;
      case P.SNES:
        if (!hasModuleSamples) { this.loadTestSampleBRR(); this.uploadSampleInstrument(); this.engine.renderSamples(pt); }
        for (let ch = 0; ch < numCh; ch++) { setIns(ch, 0); setVol(ch, maxVol); }
        break;

      // === Atari Lynx Mikey: needs non-zero FEEDBACK (duty) to oscillate ===
      // The Mikey LFSR audio engine uses FEEDBACK register to select XOR tap.
      // With duty=0 → feedback=0 → mTapSelector=0 → shift register fills with 1s →
      // constant DC output → silence. Uploading a DIV_INS_MIKEY instrument with a
      // duty macro of 1 causes the FEEDBACK register to be written on the first tick,
      // giving mTapSelector=1 → alternating ±output → audible square wave.
      case P.LYNX:
        this.setupDefaultLynxInstrument();
        break;

      // === Commander X16 VERA PSG: needs waveform set (default is 0 after reset) ===
      // VERA PSG has 4 waveforms: 0=pulse, 1=sawtooth, 2=triangle, 3=noise
      // Without an explicit WAVE command, the waveform register is 0 (pulse) which
      // should work, but we need to ensure the duty cycle is also set.
      // VERA dispatch uses STD_NOISE_MODE for panning/enable and WAVE for waveform.
      case P.VERA:
        for (let ch = 0; ch < Math.min(numCh, 16); ch++) {
          disp(DivCmd.WAVE, ch, 0, 0); // Pulse waveform
        }
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

    // Default wavetable for channel 2 (WAV) — skip if module wavetables were already uploaded
    if (!this.engine.getModuleWavetables()) {
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
   * Inject chip-required defaults into a user-supplied config before encoding.
   * Some chips need specific macros or instrument fields to produce any sound:
   * - Lynx: duty macro (code=2) with value [1] for LFSR feedback
   * - VERA: wave macro (code=3) with value [0] for pulse waveform
   * - C64: c64 block with waveform, ADSR, and duty settings
   */
  private injectChipRequiredMacros(config: FurnaceConfig): FurnaceConfig {
    const P = FurnaceDispatchPlatform;
    const pt = this.platformType;
    const macros = [...(config.macros || [])];
    let modified = false;
    let result = config;

    if (pt === P.LYNX) {
      // Lynx needs duty macro to set LFSR feedback register
      if (!macros.some(m => (m.code ?? m.type) === 2)) {
        macros.push({ code: 2, type: 0, data: [1], loop: -1, release: -1, mode: 0 });
        modified = true;
      }
    } else if (pt === P.VERA) {
      // VERA PSG needs wave macro for waveform selection
      if (!macros.some(m => (m.code ?? m.type) === 3)) {
        macros.push({ code: 3, type: 0, data: [0], loop: -1, release: -1, mode: 0 });
        modified = true;
      }
    } else if (pt === P.C64_6581 || pt === P.C64_8580) {
      // C64 SID needs c64 block with waveform bits set — without them, the voice
      // control register has waveform=0 and produces silence.
      if (!config.c64) {
        result = { ...config, c64: {
          triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
          a: 0, d: 0, s: 15, r: 1, duty: 2048,
          ringMod: false, oscSync: false,
        }};
        modified = true;
      }
    }

    return modified ? { ...result, macros } : result;
  }

  /**
   * Set up a default Atari Lynx Mikey instrument with duty=1.
   *
   * The Mikey LFSR generates audio via an LFSR shift register. The FEEDBACK register
   * (set by DivInstrumentMikey::duty) controls which bit is XOR'd back as input.
   * With duty=0 (the default): feedback=0 → mTapSelector=0 → xorGate always 0 →
   * shift register fills with 1s → constant positive DC → silence.
   * With duty=1: feedback=1 → mTapSelector=1 → alternating parity → ±output → square wave.
   *
   * The FEEDBACK register is only written when std.duty.had=true (macro change).
   * We upload a DIV_INS_MIKEY instrument with a one-shot duty macro (value=1) so
   * FEEDBACK is written on the first tick after note-on, enabling LFSR oscillation.
   */
  private setupDefaultLynxInstrument(): void {
    const pt = this.platformType;
    const numCh = this.engine.getChannelCount(pt) || 4;

    const config: FurnaceConfig = {
      chipType: FurnaceChipType.LYNX, // 25 — falls through to type=25 in binary; getIns() ignores type
      algorithm: 0, feedback: 0, fms: 0, ams: 0, fms2: 0, ams2: 0,
      ops: 0, opllPreset: 0, fixedDrums: false,
      operators: [],
      macros: [
        // code=2 → dutyMacro slot → MikeyDuty(1).feedback=1 → mTapSelector=1 → LFSR oscillates
        { code: 2, type: 0, data: [1], loop: -1, release: -1, mode: 0 },
      ],
      opMacros: [],
      wavetables: [],
    };

    const binaryData = encodeFurnaceInstrument(config, 'Default Lynx');
    this.engine.uploadFurnaceInstrument(0, binaryData, pt);

    for (let ch = 0; ch < numCh; ch++) {
      this.engine.setInstrument(ch, 0, pt);
      this.engine.setVolume(ch, getMaxVolume(pt), pt);
    }
  }

  /**
   * Set up a default FM instrument (OPN2/OPM/OPL/OPZ/ESFM).
   * Without this, the WASM default has AR=0 → envelope never opens → silence.
   */
  private setupDefaultFMInstrument(insType: number): void {
    const pt = this.platformType;
    const numCh = this.engine.getChannelCount(pt) || 6;

    // Basic electric piano: algorithm 4 (parallel carriers), moderate feedback
    const config: FurnaceConfig = {
      chipType: insType === DIV_INS_OPM ? 1 : insType === DIV_INS_OPL ? 2 : insType === DIV_INS_OPZ ? 22 : insType === DIV_INS_ESFM ? 49 : 0,
      algorithm: insType === DIV_INS_OPL ? 0 : 4,
      feedback: 4,
      fms: 0, ams: 0, fms2: 0, ams2: 0,
      ops: insType === DIV_INS_OPL ? 2 : 4,
      opllPreset: 0, fixedDrums: false,
      operators: insType === DIV_INS_OPL ? [
        // 2-op OPL: modulator + carrier
        { enabled: true, mult: 2, tl: 30, ar: 15, dr: 4, d2r: 0, sl: 4, rr: 8, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 15, dr: 6, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
      ] : [
        // 4-op FM: two modulators + two carriers
        { enabled: true, mult: 2, tl: 40, ar: 31, dr: 8, d2r: 2, sl: 4, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 50, ar: 28, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 31, dr: 10, d2r: 4, sl: 2, rr: 6, dt: 0, am: false },
        { enabled: true, mult: 1, tl: 0, ar: 31, dr: 8, d2r: 3, sl: 3, rr: 5, dt: 0, am: false },
      ],
      macros: [],
      opMacros: Array.from({ length: insType === DIV_INS_OPL ? 2 : 4 }, () => ({})),
      wavetables: [],
    };

    const binaryData = encodeFurnaceInstrument(config, 'Default FM');
    this.engine.uploadFurnaceInstrument(0, binaryData, pt);

    for (let ch = 0; ch < numCh; ch++) {
      this.engine.setInstrument(ch, 0, pt);
      this.engine.setVolume(ch, getMaxVolume(pt), pt);
    }
  }

  /**
   * Set up a default OPLL/VRC7 instrument using built-in preset 1 (violin).
   * OPLL is 2-op and has 15 built-in ROM patches. Using a preset is more
   * reliable than custom patch data which requires specific register format.
   */
  private setupDefaultOPLLInstrument(): void {
    const pt = this.platformType;
    const numCh = this.engine.getChannelCount(pt) || 9;

    const config: FurnaceConfig = {
      chipType: 11, // OPLL
      algorithm: 0, feedback: 0, fms: 0, ams: 0, fms2: 0, ams2: 0,
      ops: 2, opllPreset: 1, fixedDrums: false, // Preset 1 = violin
      operators: [
        // Modulator
        { enabled: true, mult: 1, tl: 20, ar: 15, dr: 5, d2r: 0, sl: 2, rr: 7, dt: 0, am: false },
        // Carrier
        { enabled: true, mult: 1, tl: 0, ar: 15, dr: 7, d2r: 0, sl: 3, rr: 7, dt: 0, am: false },
      ],
      macros: [],
      opMacros: [{}, {}],
      wavetables: [],
    };

    const binaryData = encodeFurnaceInstrument(config, 'Default OPLL');
    this.engine.uploadFurnaceInstrument(0, binaryData, pt);

    for (let ch = 0; ch < numCh; ch++) {
      this.engine.setInstrument(ch, 0, pt);
      this.engine.setVolume(ch, getMaxVolume(pt), pt);
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
   * Upload a sample-pointing Amiga instrument to slot 0.
   * This ensures the chip's dispatch uses `amiga.useSample=true` when playing notes.
   * Without this, the default FM/PSG instrument (uploaded by the user config or
   * setupDefaultInstrument) doesn't reference any sample → silence on sample chips.
   *
   * Binary format: [type(1), initSample(2), flags(1), waveLen(1)]
   */
  private uploadSampleInstrument(): void {
    const data = new Uint8Array(5);
    data[0] = 4; // DIV_INS_AMIGA
    data[1] = 0; data[2] = 0; // initSample = 0 (little-endian short)
    data[3] = 0x02; // flags: bit1 = useSample
    data[4] = 0;    // waveLen = 0
    this.engine.setAmigaInstrument(0, data, this.platformType);
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
    // Use range=10 to avoid clipping (range=12 at ±7/8 = near full-scale 16-bit)
    for (let b = 0; b < numBlocks; b++) {
      const offset = headerSize + b * brrBlockSize;
      // Header: range=10 (bits 4-7), filter=0 (bits 2-3), loop=1 (bit 1), end=last block (bit 0)
      const isLast = b === numBlocks - 1;
      data[offset] = (10 << 4) | (0 << 2) | (1 << 1) | (isLast ? 1 : 0);
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
    if ((window as any).FURNACE_DEBUG) console.log(`[FurnaceDispatchSynth] triggerAttack: note=${midiNote} chan=${chan} inst=${this.furnaceInstrumentIndex} platform=${pt} time=${_time?.toFixed(4)}`);
    this.engine.setInstrument(chan, this.furnaceInstrumentIndex, pt, true, _time);

    // Set volume based on velocity
    const maxVol = getMaxVolume(pt);
    const vol = Math.round(velocity * maxVol);
    this.engine.setVolume(chan, vol, pt, _time);

    // Furnace dispatch note 0 = C-0, which is MIDI note 12.
    // So dispatch note = midiNote - 12.
    this.engine.noteOn(chan, midiNote - 12, pt, _time);

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
    // Schedule release using timestamped dispatch for sample-accurate timing
    const ctx = this.engine.getNativeCtx();
    if (ctx) {
      const chan = this.currentChannel;
      const releaseTime = (time ?? ctx.currentTime) + duration;
      // Send note-off with scheduled time — the worklet will apply it
      // at the exact sample position, avoiding setTimeout's ±15ms jitter
      const timeoutId = setTimeout(() => {
        this._releaseTimeouts.delete(chan);
        // Fallback: if the scheduled command wasn't processed yet, release now
        this.triggerRelease(note);
      }, Math.max(0, (releaseTime - ctx.currentTime) * 1000) + 50); // +50ms grace
      this._releaseTimeouts.set(chan, timeoutId);
      // Also send the release as a scheduled command for sample-accurate timing
      this.triggerRelease(note, releaseTime);
    }
  }

  triggerRelease(note?: string | number, time?: number): void {
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
        this.engine.noteOff(chan, this.platformType, time);
        this.activeNotes.delete(midiNote);
      }
    } else {
      // Release all active notes
      for (const [, chan] of this.activeNotes) {
        this.engine.noteOff(chan, this.platformType, time);
      }
      this.activeNotes.clear();
    }
  }

  releaseAll(): void {
    // Clear any pending release timeouts
    for (const [, timeout] of this._releaseTimeouts) {
      clearTimeout(timeout);
    }
    this._releaseTimeouts.clear();

    // Release tracked notes
    this.triggerRelease();

    // SAFETY NET: Brute-force noteOff on ALL chip channels.
    // If activeNotes tracking is out of sync (e.g., notes triggered via
    // tracker replayer with channel routing), some notes may not be tracked.
    // Send noteOff to every channel to guarantee silence.
    if (this._isReady && !this._disposed) {
      const numCh = this.engine.getChannelCount(this.platformType) || 3;
      for (let ch = 0; ch < numCh; ch++) {
        this.engine.noteOff(ch, this.platformType);
      }
    }
  }

  /**
   * Set which channel to play notes on.
   */
  setChannel(chan: number): void {
    if ((window as any).FURNACE_DEBUG) console.log(`[FurnaceDispatchSynth] setChannel: ${chan} (platform ${this.platformType})`);
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

  set(param: string, value: number): void {
    const ch = this.currentChannel;
    const pt = this.platformType;

    // FM operator params: fmOp0TL, fmOp1AR, fmOp2DR, etc.
    const opMatch = param.match(/^fmOp(\d+)(TL|AR|DR|SL|RR|DT|MULT)$/);
    if (opMatch) {
      const op = parseInt(opMatch[1]);
      const opParam = opMatch[2];
      const cmdMap: Record<string, number> = {
        'TL': DivCmd.FM_TL, 'AR': DivCmd.FM_AR, 'DR': DivCmd.FM_DR,
        'SL': DivCmd.FM_SL, 'RR': DivCmd.FM_RR, 'DT': DivCmd.FM_DT,
        'MULT': DivCmd.FM_MULT,
      };
      const cmd = cmdMap[opParam];
      if (cmd !== undefined) {
        // TL is inverted (0=max, 127=min), others are direct
        const maxVal = opParam === 'TL' ? 127 : opParam === 'AR' ? 31 : opParam === 'MULT' ? 15 : 31;
        const mapped = opParam === 'TL'
          ? Math.round((1 - value) * maxVal)
          : Math.round(value * maxVal);
        this.engine.dispatch(cmd, ch, op, mapped, pt);
      }
      return;
    }

    switch (param) {
      // ── Universal ──
      case 'volume':
        this.output.gain.setValueAtTime(value, this.output.context.currentTime);
        this.engine.dispatch(DivCmd.VOLUME, ch, Math.round(value * 127), 0, pt);
        break;
      case 'panning':
        this.engine.dispatch(DivCmd.PANNING, ch, Math.round((value * 2 - 1) * 127), 0, pt);
        break;

      // ── FM Global ──
      case 'fmFB':
        this.engine.dispatch(DivCmd.FM_FB, ch, Math.round(value * 7), 0, pt);
        break;
      case 'fmALG':
        this.engine.dispatch(DivCmd.FM_ALG, ch, Math.round(value * 7), 0, pt);
        break;

      // ── FM Operator shortcuts (op0 = carrier) ──
      case 'fmTL':
        this.engine.dispatch(DivCmd.FM_TL, ch, 0, Math.round((1 - value) * 127), pt);
        break;

      // ── C64/SID ──
      case 'cutoff':
        this.engine.dispatch(DivCmd.C64_CUTOFF, ch, Math.round(value * 2047), 0, pt);
        break;
      case 'resonance':
        this.engine.dispatch(DivCmd.C64_RESONANCE, ch, Math.round(value * 15), 0, pt);
        break;
      case 'filterMode':
        // 0=off, 1=LP, 2=BP, 4=HP (bit flags)
        this.engine.dispatch(DivCmd.C64_FILTER_MODE, ch, Math.round(value * 7), 0, pt);
        break;
      case 'fineDuty':
        this.engine.dispatch(DivCmd.C64_FINE_DUTY, ch, Math.round(value * 4095), 0, pt);
        break;

      // ── PSG / Waveform ──
      case 'duty':
        this.engine.dispatch(DivCmd.WAVE, ch, Math.round(value * 3), 0, pt);
        break;
      case 'noiseFreq':
        this.engine.dispatch(DivCmd.STD_NOISE_FREQ, ch, Math.round(value * 31), 0, pt);
        break;
      case 'noiseMode':
        this.engine.dispatch(DivCmd.STD_NOISE_MODE, ch, Math.round(value), 0, pt);
        break;

      // ── Game Boy ──
      case 'gbSweepTime':
        this.engine.dispatch(DivCmd.GB_SWEEP_TIME, ch, Math.round(value * 7), 0, pt);
        break;
      case 'gbSweepDir':
        this.engine.dispatch(DivCmd.GB_SWEEP_DIR, ch, value >= 0.5 ? 1 : 0, 0, pt);
        break;

      // ── AY/YM ──
      case 'ayNoiseMaskAnd':
        this.engine.dispatch(DivCmd.AY_NOISE_MASK_AND, ch, Math.round(value * 255), 0, pt);
        break;
      case 'ayNoiseMaskOr':
        this.engine.dispatch(DivCmd.AY_NOISE_MASK_OR, ch, Math.round(value * 255), 0, pt);
        break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume': return this.output.gain.value;
      default: return undefined;
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

    // The _nativeGain is the engine's shared gain node — don't fully disconnect it
    // here as other synths may still be using it. Only remove the tap to this.output.
    if (this._nativeGain) {
      try { this._nativeGain.disconnect(this.output); } catch { /* already disconnected */ }
    }
    this._nativeGain = null;

    // Don't dispose the engine singleton — other synths may use it
    this.output.disconnect();
  }
}
