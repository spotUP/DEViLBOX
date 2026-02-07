/**
 * FurnaceDispatchSynth - Tone.js ToneAudioNode wrapper for Furnace chip dispatch
 *
 * Provides a standard synth interface (triggerAttack/triggerRelease) backed by
 * the native Furnace dispatch WASM engine. Supports 57+ platforms.
 */

import * as Tone from 'tone';
import { getNativeContext } from '@utils/audio-context';
import {
  FurnaceDispatchEngine,
  FurnaceDispatchPlatform,
  SampleDepth,
  DivCmd,
  type OscDataCallback
} from './FurnaceDispatchEngine';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

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
  [FurnaceDispatchPlatform.GB]: 15,
  [FurnaceDispatchPlatform.SMS]: 15,
  [FurnaceDispatchPlatform.NES]: 15,
  [FurnaceDispatchPlatform.PCE]: 31,       // 5-bit volume
  [FurnaceDispatchPlatform.VIC20]: 15,
  [FurnaceDispatchPlatform.TIA]: 15,
  [FurnaceDispatchPlatform.POKEY]: 15,
  [FurnaceDispatchPlatform.PV1000]: 15,
  [FurnaceDispatchPlatform.POKEMINI]: 3,   // 2-bit volume
  [FurnaceDispatchPlatform.PONG]: 1,       // on/off
  [FurnaceDispatchPlatform.PCSPKR]: 1,     // on/off
  [FurnaceDispatchPlatform.SFX_BEEPER]: 15,
  [FurnaceDispatchPlatform.TED]: 8,        // 3-bit volume
  [FurnaceDispatchPlatform.VRC6]: 15,
  [FurnaceDispatchPlatform.MMC5]: 15,
  [FurnaceDispatchPlatform.SWAN]: 15,
  [FurnaceDispatchPlatform.LYNX]: 127,     // 7-bit volume
};

function getMaxVolume(platform: number): number {
  return PLATFORM_VOL_MAX[platform] ?? 127;
}

export class FurnaceDispatchSynth extends Tone.ToneAudioNode {
  readonly name = 'FurnaceDispatchSynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private engine: FurnaceDispatchEngine;
  private _disposed = false;
  private _ready = false;
  private _readyPromise: Promise<void>;
  private _resolveReady!: () => void;
  private currentChannel = 0;
  private platformType: number;
  private activeNotes: Map<number, number> = new Map(); // midiNote -> channel
  private _volumeOffsetDb = 0; // Volume normalization offset in dB

  constructor(platformType: number = FurnaceDispatchPlatform.GB) {
    super();
    this.output = new Tone.Gain(1);
    this.platformType = platformType;
    this.engine = FurnaceDispatchEngine.getInstance();
    this._readyPromise = new Promise((resolve) => { this._resolveReady = resolve; });
    this.initialize();
  }

  /**
   * Returns a promise that resolves when the synth is fully initialized and ready to play.
   */
  get ready(): Promise<void> {
    return this._readyPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this._readyPromise;
  }

  /**
   * Set volume normalization offset in dB.
   * Applied to the native GainNode in the audio path.
   */
  public setVolumeOffset(db: number): void {
    this._volumeOffsetDb = db;
    const nativeGain = (this as any)._nativeGain as GainNode | undefined;
    if (nativeGain) {
      nativeGain.gain.value = Math.pow(10, db / 20);
    }
  }

  private async initialize(): Promise<void> {
    try {
      const toneContext = this.context as any;
      const nativeCtx = toneContext.rawContext || toneContext._context || getNativeContext(this.context);

      if (!nativeCtx) {
        throw new Error('Could not get native AudioContext');
      }

      await this.engine.init(nativeCtx);
      if (this._disposed) return;

      // Create the chip and wait for worklet to confirm creation
      const engineSampleRate = this.engine.getNativeCtx()?.sampleRate ?? nativeCtx.sampleRate;
      this.engine.createChip(this.platformType, engineSampleRate);
      await this.engine.waitForChipCreated();

      // Connect worklet output through a native GainNode for volume control.
      // The worklet lives in the engine's true native AudioContext. Tone.js uses
      // standardized-audio-context (SAC) which wraps native nodes — cross-context
      // connect() calls fail or silently don't route audio. We route entirely
      // through native nodes: worklet → nativeGain → destination.
      const workletNode = this.engine.getWorkletNode();
      const engineCtx = this.engine.getNativeCtx();
      if (workletNode && engineCtx) {
        const nativeGain = engineCtx.createGain();
        workletNode.connect(nativeGain);
        nativeGain.connect(engineCtx.destination);

        // Store for volume control and cleanup
        (this as any)._nativeGain = nativeGain;
        // Apply any pending volume normalization offset
        if (this._volumeOffsetDb !== 0) {
          nativeGain.gain.value = Math.pow(10, this._volumeOffsetDb / 20);
        }
      }

      // Set up default instrument for this platform
      this.setupDefaultInstrument();

      this._ready = true;
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
    const numCh = this.engine.channelCount || 4;
    const maxVol = getMaxVolume(this.platformType);

    // Platform-specific setup
    switch (this.platformType) {
      // === Game Boy (already has custom setup) ===
      case P.GB:
        this.setupDefaultGBInstrument();
        break;

      // === Wavetable chips: need wavetable + WAVE command ===
      case P.PCE:
        this.setupDefaultWavetable(32, 31); // 5-bit, 32 samples
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;
      case P.SCC:
      case P.SCC_PLUS:
        this.setupDefaultWavetable(32, 255); // 8-bit, 32 samples
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;
      case P.VBOY:
        this.setupDefaultWavetable(32, 63); // 6-bit, 32 samples
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;
      case P.NAMCO:
      case P.NAMCO_15XX:
      case P.NAMCO_CUS30:
      case P.BUBSYS_WSG:
        this.setupDefaultWavetable(32, 15); // 4-bit, 32 samples
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;
      case P.SWAN:
        // WonderSwan: 4-bit wavetable, 32 samples
        this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;
      case P.FDS:
        // FDS: 6-bit wavetable, 64 samples
        this.setupDefaultWavetable(64, 63);
        this.engine.dispatch(DivCmd.WAVE, 0, 0, 0);
        break;
      case P.N163:
        // N163: 4-bit wavetable, 32 samples
        this.setupDefaultWavetable(32, 15);
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;
      case P.X1_010:
      case P.SOUND_UNIT:
        // X1-010 and Sound Unit have wavetable mode
        this.setupDefaultWavetable(32, 255);
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.dispatch(DivCmd.WAVE, ch, 0, 0);
        }
        break;

      // === Sample-based chips: need test sample + renderSamples ===
      // IMPORTANT: Load samples FIRST (creates default instrument), then set instrument on channels
      case P.AMIGA:
      case P.SEGAPCM:
      case P.SEGAPCM_COMPAT:
      case P.RF5C68:
      case P.K007232:
      case P.K053260:
      case P.GA20:
      case P.GBA_DMA:
      case P.GBA_MINMOD:
      case P.NDS:
      case P.MSM6295:
      case P.YMZ280B:
      case P.QSOUND:
      case P.MULTIPCM:
        this.loadTestSample8bit();          // Creates instrument 0 in WASM
        this.engine.renderSamples();
        // NOW set instrument on all channels (instrument 0 exists now)
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.setInstrument(ch, 0);
          this.engine.setVolume(ch, maxVol);
        }
        break;
      case P.MSM6258:
        // MSM6258 requires VOX ADPCM format (4-bit)
        this.loadTestSampleVOX();           // Creates instrument 0 in WASM
        this.engine.renderSamples();
        // NOW set instrument on all channels
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.setInstrument(ch, 0);
          this.engine.setVolume(ch, maxVol);
        }
        break;
      case P.ES5506:
      case P.C140:
      case P.C219:
      case P.PCM_DAC:
        this.loadTestSample16bit();         // Creates instrument 0 in WASM
        this.engine.renderSamples();
        // NOW set instrument on all channels
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.setInstrument(ch, 0);
          this.engine.setVolume(ch, maxVol);
        }
        break;
      case P.SNES:
        // SNES uses BRR format - load a BRR test sample
        this.loadTestSampleBRR();           // Creates instrument 0 in WASM
        this.engine.renderSamples();
        // NOW set instrument on all channels
        for (let ch = 0; ch < numCh; ch++) {
          this.engine.setInstrument(ch, 0);
          this.engine.setVolume(ch, maxVol);
        }
        break;
    }

    // For non-sample chips, set instrument and volume normally
    // (These chips don't need the instrument to exist first)
    const sampleBasedChips: number[] = [
      P.AMIGA, P.SEGAPCM, P.SEGAPCM_COMPAT, P.RF5C68, P.K007232, P.K053260,
      P.GA20, P.GBA_DMA, P.GBA_MINMOD, P.NDS, P.MSM6295, P.YMZ280B,
      P.QSOUND, P.MULTIPCM, P.MSM6258, P.ES5506, P.C140, P.C219, P.PCM_DAC, P.SNES
    ];
    if (!sampleBasedChips.includes(this.platformType)) {
      for (let ch = 0; ch < numCh; ch++) {
        this.engine.setInstrument(ch, 0);
        this.engine.setVolume(ch, maxVol);
      }
    }
  }

  private setupDefaultGBInstrument(): void {
    // Default GB instrument: envVol=15, envDir=0(down), envLen=2, soundLen=0
    // No hw sequence
    const data = new Uint8Array([
      15,  // envVol
      0,   // envDir (0=decrease)
      2,   // envLen
      0,   // soundLen (0=infinite)
      0,   // softEnv
      1,   // alwaysInit
      0,   // doubleWave
      0,   // hwSeqLen
    ]);
    this.engine.setGBInstrument(0, data);

    // Set all channels to instrument 0 and full volume
    for (let ch = 0; ch < 4; ch++) {
      this.engine.setInstrument(ch, 0);
      this.engine.setVolume(ch, 15);
    }

    // Set up a default wavetable for channel 2 (WAV)
    const waveLen = 32;
    const waveMax = 15;
    const waveData = new Uint8Array(8 + waveLen * 4);
    const view = new DataView(waveData.buffer);
    view.setInt32(0, waveLen, true);
    view.setInt32(4, waveMax, true);
    // Triangle wave
    for (let i = 0; i < waveLen; i++) {
      const val = i < waveLen / 2
        ? Math.round((i / (waveLen / 2)) * waveMax)
        : Math.round(((waveLen - i) / (waveLen / 2)) * waveMax);
      view.setInt32(8 + i * 4, val, true);
    }
    this.engine.setWavetable(0, waveData);
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
    this.engine.setWavetable(0, waveData);
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
    this.engine.setSample(0, data);
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
    this.engine.setSample(0, data);
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
    this.engine.setSample(0, data);
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
    this.engine.setSample(0, data);
  }

  /**
   * Get channel names for the current platform.
   */
  getChannelNames(): string[] {
    const known = PLATFORM_CHANNELS[this.platformType];
    if (known) return known;
    // Generate fallback channel names from engine channel count
    const numCh = this.engine.channelCount || 1;
    return Array.from({ length: numCh }, (_, i) => `CH${i + 1}`);
  }

  /**
   * Get the number of channels.
   */
  getNumChannels(): number {
    return this.engine.channelCount;
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
    if (!this._ready || this._disposed) return;

    const midiNote = typeof note === 'string'
      ? Tone.Frequency(note).toMidi()
      : (note > 127
        ? Math.round(12 * Math.log2(note / 440) + 69)
        : note);

    // Find a channel to use (simple round-robin for the platform)
    // For GB: channels 0-1 are pulse, 2 is wave, 3 is noise
    // Use channel 0 for now (can be made smarter later)
    const chan = this.currentChannel;

    // Set volume based on velocity
    const maxVol = getMaxVolume(this.platformType);
    const vol = Math.round(velocity * maxVol);
    this.engine.setVolume(chan, vol);

    // Furnace dispatch uses (midiNote - 12) as the note value
    // The dispatch expects 12 = C-1, so MIDI 60 (C4) = note 60
    this.engine.noteOn(chan, midiNote);

    // Track active note
    this.activeNotes.set(midiNote, chan);
  }

  triggerRelease(note?: string | number, _time?: number): void {
    if (!this._ready || this._disposed) return;

    if (note !== undefined) {
      // Release a specific note
      const midiNote = typeof note === 'string'
        ? Tone.Frequency(note).toMidi()
        : (note > 127
          ? Math.round(12 * Math.log2(note / 440) + 69)
          : note);

      const chan = this.activeNotes.get(midiNote);
      if (chan !== undefined) {
        this.engine.noteOff(chan);
        this.activeNotes.delete(midiNote);
      }
    } else {
      // Release all active notes
      for (const [, chan] of this.activeNotes) {
        this.engine.noteOff(chan);
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
    this.currentChannel = chan;
  }

  /**
   * Send a raw dispatch command.
   */
  sendCommand(cmd: number, chan: number, val1: number = 0, val2: number = 0): void {
    if (!this._ready || this._disposed) return;
    this.engine.dispatch(cmd, chan, val1, val2);
  }

  /**
   * Apply a tracker effect command, translating it to dispatch commands.
   * @param effect Effect code (0x00-0xFF)
   * @param param Effect parameter (0x00-0xFF)
   * @param chan Optional channel (defaults to currentChannel)
   */
  applyEffect(effect: number, param: number, chan?: number): void {
    if (!this._ready || this._disposed) return;
    this.engine.applyEffect(chan ?? this.currentChannel, effect, param);
  }

  /**
   * Apply an extended effect (Exy format).
   * @param x Effect subtype (0x0-0xF)
   * @param y Effect value (0x0-0xF)
   * @param chan Optional channel (defaults to currentChannel)
   */
  applyExtendedEffect(x: number, y: number, chan?: number): void {
    if (!this._ready || this._disposed) return;
    this.engine.applyExtendedEffect(chan ?? this.currentChannel, x, y);
  }

  /**
   * Apply a platform-specific effect.
   * @param effect Effect code
   * @param param Effect parameter
   * @param chan Optional channel (defaults to currentChannel)
   */
  applyPlatformEffect(effect: number, param: number, chan?: number): void {
    if (!this._ready || this._disposed) return;
    this.engine.applyPlatformEffect(chan ?? this.currentChannel, effect, param);
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
    this.engine.setGBInstrument(insIndex, insData);
  }

  /**
   * Set a wavetable.
   */
  setWavetable(waveIndex: number, waveData: Uint8Array): void {
    this.engine.setWavetable(waveIndex, waveData);
  }

  /**
   * Copy uploaded samples into chip's internal memory.
   * Must be called after setSample() for sample-based chips.
   */
  renderSamples(): void {
    this.engine.renderSamples();
  }

  /**
   * Set parameter by name (compatibility with other synths).
   */
  setParam(param: string, value: number): void {
    // Map param names to dispatch commands
    switch (param) {
      case 'volume':
        this.engine.setVolume(this.currentChannel, value);
        break;
      case 'channel':
        this.currentChannel = value;
        break;
    }
  }

  dispose(): this {
    this._disposed = true;
    this.activeNotes.clear();

    // Disconnect our native gain from the worklet and destination
    const nativeGain = (this as any)._nativeGain as GainNode | undefined;
    if (nativeGain) {
      try { nativeGain.disconnect(); } catch {}
      (this as any)._nativeGain = null;
    }

    // Don't dispose the engine singleton — other synths may use it
    this.output.dispose();
    super.dispose();
    return this;
  }
}
