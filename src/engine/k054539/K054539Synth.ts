import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToK054539 } from '@engine/mame/MAMEPitchUtils';
import { loadK054539ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * K054539 Parameter IDs (matching C++ enum)
 */
const K054539Param = {
  MASTER_VOLUME: 0,
  REVERB_ENABLE: 1,
  CHANNEL_GAIN: 2
} as const;

/**
 * K054539 Sample Types
 */
const K054539SampleType = {
  PCM8: 0x0,    // 8-bit signed PCM
  PCM16: 0x4,   // 16-bit signed PCM (LSB first)
  DPCM4: 0x8    // 4-bit differential PCM
} as const;

/**
 * K054539 Synthesizer - Konami PCM/ADPCM Sound Chip (WASM)
 *
 * Based on MAME's K054539 emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The K054539 is an 8-channel PCM/ADPCM chip used in many Konami arcade games:
 * - Mystic Warriors
 * - Violent Storm
 * - Metamorphic Force
 * - Martial Champion
 * - Gaiapolis
 * - Run and Gun
 * - Lethal Enforcers II
 * - And many more...
 *
 * Features:
 * - 8 independent channels
 * - 8-bit PCM, 16-bit PCM, and 4-bit DPCM modes
 * - Per-channel volume and panning
 * - Hardware reverb with 32KB buffer
 * - Loop points
 * - Reverse playback
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Per-channel control
 * - Velocity scaling
 * - Oscilloscope support
 */
export class K054539Synth extends MAMEBaseSynth {
  readonly name = 'K054539Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'K054539';
  protected readonly workletFile = 'K054539.worklet.js';
  protected readonly processorName = 'k054539-processor';

  // K054539-specific state
  private currentChannel: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  /**
   * Override initialize to load ROMs before worklet initialization
   */
  protected async initialize(): Promise<void> {
    try {
      // Load sample ROM data
      const romData = await loadK054539ROMs();

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Load ROMs into the synth
      this.loadROM(0, romData);

      this.romLoaded = true;
      console.log('[K054539] ROM loaded successfully');
    } catch (error) {
      console.error('[K054539] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/k054539/ - see /public/roms/README.md');
      // Continue anyway - synth will initialize but be silent without samples
    }
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      channel: this.currentChannel,
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
      channel: this.currentChannel,
    });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    // K054539 uses delta value for pitch
    const delta = freqToK054539(freq);

    this.workletNode.port.postMessage({
      type: 'setChannelPitch',
      channel: this.currentChannel,
      delta,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // K054539 volume: 0=max, 0x40=-36dB
    // Invert: 0 = silent, 0x40 = max
    const vol = Math.round((1 - volume) * 0x40);

    this.workletNode.port.postMessage({
      type: 'setChannelVolume',
      channel: this.currentChannel,
      volume: vol,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // K054539 pan: 0=left, 7=center, 14=right
    const kPan = Math.round((pan / 255) * 14);

    this.workletNode.port.postMessage({
      type: 'setChannelPan',
      channel: this.currentChannel,
      pan: kPan,
    });
  }

  // ===========================================================================
  // K054539-Specific Methods
  // ===========================================================================

  /**
   * Select which channel to control (0-7)
   */
  setChannel(channel: number): void {
    this.currentChannel = Math.max(0, Math.min(7, channel));
  }

  /**
   * Load sample ROM data
   */
  loadROM(offset: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadROM',
      offset,
      data: data.buffer,
      size: data.length
    }, [data.buffer.slice(0)]);
  }

  /**
   * Configure a channel for sample playback
   */
  configureChannel(channel: number, startAddr: number, loopAddr: number,
                   sampleType: number = 0, loopEnable: boolean = false,
                   reverse: boolean = false): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'configureChannel',
      channel,
      startAddr,
      loopAddr,
      sampleType,
      loopEnable,
      reverse
    });
  }

  /**
   * Set channel pitch directly (delta value)
   */
  setChannelPitch(channel: number, delta: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelPitch',
      channel,
      delta
    });
  }

  /**
   * Set channel volume directly
   */
  setChannelVolume(channel: number, volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelVolume',
      channel,
      volume
    });
  }

  /**
   * Set channel pan directly
   */
  setChannelPan(channel: number, pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelPan',
      channel,
      pan
    });
  }

  /**
   * Set channel gain multiplier
   */
  setChannelGain(channel: number, gain: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setChannelGain',
      channel,
      gain
    });
  }

  /**
   * Key on a channel directly
   */
  keyOn(channel: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOn',
      channel
    });
  }

  /**
   * Key off a channel directly
   */
  keyOff(channel: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOff',
      channel
    });
  }

  // ===========================================================================
  // Parameter Interface
  // ===========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      'master_volume': K054539Param.MASTER_VOLUME,
      'volume': K054539Param.MASTER_VOLUME,
      'reverb_enable': K054539Param.REVERB_ENABLE,
      'reverb': K054539Param.REVERB_ENABLE
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(K054539Param.MASTER_VOLUME, val);
  }

  setReverbEnable(enable: boolean): void {
    this.setParameterById(K054539Param.REVERB_ENABLE, enable ? 1.0 : 0.0);
  }
}

// Export constants
export { K054539Param, K054539SampleType };

export default K054539Synth;
