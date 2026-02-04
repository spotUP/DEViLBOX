/**
 * FurnaceDispatchSynth - Tone.js ToneAudioNode wrapper for Furnace chip dispatch
 *
 * Provides a standard synth interface (triggerAttack/triggerRelease) backed by
 * the native Furnace dispatch WASM engine. Currently supports Game Boy.
 */

import * as Tone from 'tone';
import { getNativeContext } from '@utils/audio-context';
import {
  FurnaceDispatchEngine,
  FurnaceDispatchPlatform,
  type OscDataCallback
} from './FurnaceDispatchEngine';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

/** Channel names for each platform */
const PLATFORM_CHANNELS: Record<number, string[]> = {
  [FurnaceDispatchPlatform.GB]: ['PU1', 'PU2', 'WAV', 'NOI'],
  [FurnaceDispatchPlatform.NES]: ['PU1', 'PU2', 'TRI', 'NOI', 'DPCM'],
  [FurnaceDispatchPlatform.SMS]: ['SQ1', 'SQ2', 'SQ3', 'NOI'],
  [FurnaceDispatchPlatform.AY]: ['A', 'B', 'C'],
};

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
      this.engine.createChip(this.platformType, nativeCtx.sampleRate);
      await this.engine.waitForChipCreated();

      // Connect worklet output to our Tone.js gain
      const workletNode = this.engine.getWorkletNode();
      if (workletNode) {
        const targetNode = this.output.input as AudioNode;
        workletNode.connect(targetNode);
      }

      // Set up default GB instrument if Game Boy
      if (this.platformType === FurnaceDispatchPlatform.GB) {
        this.setupDefaultGBInstrument();
      }

      this._ready = true;
      this._resolveReady();

      // Wire oscilloscope data to the store
      const oscStore = useOscilloscopeStore.getState();
      const channelNames = PLATFORM_CHANNELS[this.platformType] || [];
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
   * Get channel names for the current platform.
   */
  getChannelNames(): string[] {
    return PLATFORM_CHANNELS[this.platformType] || [];
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
    const maxVol = this.platformType === FurnaceDispatchPlatform.GB ? 15 : 127;
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
    // Don't dispose the engine singleton — other synths may use it
    this.output.dispose();
    super.dispose();
    return this;
  }
}
