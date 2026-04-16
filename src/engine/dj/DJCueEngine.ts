/**
 * DJCueEngine - Headphone cueing / PFL (Pre-Fader Listen)
 *
 * Hybrid approach:
 * 1. If AudioContext.setSinkId() is supported: create a separate audio output
 *    routed to the headphone device via MediaStreamDestination + <audio> element.
 * 2. Fallback: split-stereo mode — main→left channel, cue→right channel.
 *    Requires a Y-splitter cable (main to speakers, cue to headphones).
 */

import * as Tone from 'tone';

export type CueMode = 'multi-output' | 'split-stereo' | 'none';

export class DJCueEngine {
  private cueGain: Tone.Gain;       // PFL input from decks
  private masterTap: Tone.Gain;     // Tap of master output
  private cueMixer: Tone.Gain;      // Final cue output (blend of PFL + master)
  private pflGain: Tone.Gain;       // PFL level in cue mix
  private masterMixGain: Tone.Gain; // Master level in cue mix
  private cueMode: CueMode = 'none';
  private cueMix = 0.5;             // 0 = PFL only, 1 = master only

  // Multi-output mode
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  // Split-stereo mode
  private merger: ChannelMergerNode | null = null;
  private mainSplitGain: GainNode | null = null;
  private cueSplitGain: GainNode | null = null;

  // PFL state
  private pflA = false;
  private pflB = false;

  constructor() {
    this.cueGain = new Tone.Gain(1);      // PFL decks feed in here
    this.masterTap = new Tone.Gain(1);     // master output taps here
    this.cueMixer = new Tone.Gain(1);      // final headphone output
    this.pflGain = new Tone.Gain(0.5);     // PFL contribution
    this.masterMixGain = new Tone.Gain(0.5); // master contribution

    // Wire: cueGain → pflGain → cueMixer
    //       masterTap → masterMixGain → cueMixer
    this.cueGain.connect(this.pflGain);
    this.masterTap.connect(this.masterMixGain);
    this.pflGain.connect(this.cueMixer);
    this.masterMixGain.connect(this.cueMixer);
  }

  /** Get the cue mix input node — deck channel gains connect to this when PFL is enabled */
  getCueInput(): Tone.Gain {
    return this.cueGain;
  }

  /** Get the master tap node — connect master output to this for cue mix monitoring */
  getMasterTap(): Tone.Gain {
    return this.masterTap;
  }

  // ==========================================================================
  // FEATURE DETECTION
  // ==========================================================================

  /** Check if the browser supports setSinkId (multi-output mode) */
  static supportsSetSinkId(): boolean {
    return typeof HTMLAudioElement !== 'undefined' &&
      'setSinkId' in HTMLAudioElement.prototype;
  }

  /** Enumerate available audio output devices */
  static async getOutputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audiooutput');
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // MODE SELECTION
  // ==========================================================================

  /** Initialize cue engine in the best available mode */
  async init(): Promise<CueMode> {
    if (DJCueEngine.supportsSetSinkId()) {
      this.cueMode = 'multi-output';
      await this.initMultiOutput();
    } else {
      // Could init split-stereo here, but it requires re-routing the entire
      // audio graph. For now, mark as 'none' and let the user explicitly enable.
      this.cueMode = 'none';
    }
    return this.cueMode;
  }

  getCueMode(): CueMode {
    return this.cueMode;
  }

  // ==========================================================================
  // MULTI-OUTPUT MODE
  // ==========================================================================

  private async initMultiOutput(): Promise<void> {
    const ctx = Tone.getContext().rawContext;

    // Create MediaStreamDestination from the final cue mix output
    this.mediaStreamDest = (ctx as AudioContext).createMediaStreamDestination();
    this.cueMixer.connect(this.mediaStreamDest as unknown as AudioNode);

    // Create an <audio> element to play the stream
    this.audioElement = new Audio();
    this.audioElement.srcObject = this.mediaStreamDest!.stream;
    this.audioElement.autoplay = true;
  }

  /** Set the output device for cue/headphone monitoring */
  async setCueDevice(deviceId: string): Promise<void> {
    if (this.cueMode === 'multi-output' && this.audioElement) {
      try {
        // setSinkId routes the audio element's output to a specific device
        await (this.audioElement as any).setSinkId(deviceId);
      } catch (err) {
        console.error('[DJCueEngine] Failed to set cue device:', err);
      }
    }
  }

  // ==========================================================================
  // SPLIT-STEREO MODE
  // ==========================================================================

  /** Initialize split-stereo: main→L, cue→R */
  initSplitStereo(mainSource: Tone.ToneAudioNode): void {
    const ctx = Tone.getContext().rawContext;

    this.merger = ctx.createChannelMerger(2);
    this.mainSplitGain = ctx.createGain();
    this.cueSplitGain = ctx.createGain();

    // Main → left channel (input 0)
    mainSource.connect(this.mainSplitGain as unknown as Tone.ToneAudioNode);
    this.mainSplitGain.connect(this.merger, 0, 0);

    // Cue → right channel (input 1)
    this.cueMixer.connect(this.cueSplitGain as unknown as AudioNode);
    this.cueSplitGain.connect(this.merger, 0, 1);

    // Merger → destination
    this.merger.connect(ctx.destination);

    this.cueMode = 'split-stereo';
  }

  // ==========================================================================
  // PFL CONTROL
  // ==========================================================================

  /** Enable/disable PFL for a deck. The caller (DJEngine) must connect/disconnect
   *  the deck's channel gain to/from this.cueGain accordingly. */
  setPFL(deck: 'A' | 'B' | 'C', enabled: boolean): void {
    if (deck === 'A') this.pflA = enabled;
    else this.pflB = enabled;
  }

  getPFL(deck: 'A' | 'B' | 'C'): boolean {
    return deck === 'A' ? this.pflA : this.pflB;
  }

  /** Set cue volume (overall headphone level) */
  setCueVolume(volume: number): void {
    this.cueMixer.gain.rampTo(Math.max(0, Math.min(1.5, volume)), 0.02);
  }

  /** Set cue mix balance: 0 = PFL only, 0.5 = blend, 1 = master only */
  setCueMix(mix: number): void {
    this.cueMix = Math.max(0, Math.min(1, mix));
    // Equal-power-ish crossfade
    this.pflGain.gain.rampTo(1 - this.cueMix, 0.02);
    this.masterMixGain.gain.rampTo(this.cueMix, 0.02);
  }

  getCueMix(): number {
    return this.cueMix;
  }

  // ==========================================================================
  // TEST TONE (for headphone setup wizard)
  // ==========================================================================

  /** Play a short test tone to a specific audio output device.
   *  Used by the headphone setup wizard so the user can identify their headphones. */
  static async playTestTone(deviceId: string): Promise<void> {
    const ctx = new AudioContext();
    try {
      // Create a short 880Hz beep (A5) — 3 quick pips
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = 0.3;

        const dest = ctx.createMediaStreamDestination();
        osc.connect(gain);
        gain.connect(dest);

        const audio = new Audio();
        audio.srcObject = dest.stream;
        await (audio as any).setSinkId(deviceId);
        await audio.play();

        osc.start();
        osc.stop(ctx.currentTime + 0.08);
        await new Promise(r => setTimeout(r, 200));

        audio.pause();
        audio.srcObject = null;
        osc.disconnect();
        gain.disconnect();
        dest.disconnect();
      }
    } finally {
      await ctx.close();
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
    if (this.mediaStreamDest) {
      this.mediaStreamDest = null;
    }
    if (this.merger) {
      this.merger.disconnect();
      this.merger = null;
    }
    if (this.mainSplitGain) {
      this.mainSplitGain.disconnect();
      this.mainSplitGain = null;
    }
    if (this.cueSplitGain) {
      this.cueSplitGain.disconnect();
      this.cueSplitGain = null;
    }
    this.cueGain.dispose();
    this.masterTap.dispose();
    this.pflGain.dispose();
    this.masterMixGain.dispose();
    this.cueMixer.dispose();
  }
}
