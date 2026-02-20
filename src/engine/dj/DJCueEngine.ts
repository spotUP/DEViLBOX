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
  private cueGain: Tone.Gain;
  private cueMode: CueMode = 'none';

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
    this.cueGain = new Tone.Gain(1);
  }

  /** Get the cue mix input node — deck channel gains connect to this when PFL is enabled */
  getCueInput(): Tone.Gain {
    return this.cueGain;
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

    // Create MediaStreamDestination from the cue mix
    this.mediaStreamDest = (ctx as AudioContext).createMediaStreamDestination();
    this.cueGain.connect(this.mediaStreamDest as unknown as AudioNode);

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
    this.cueGain.connect(this.cueSplitGain as unknown as AudioNode);
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
  setPFL(deck: 'A' | 'B', enabled: boolean): void {
    if (deck === 'A') this.pflA = enabled;
    else this.pflB = enabled;
  }

  getPFL(deck: 'A' | 'B'): boolean {
    return deck === 'A' ? this.pflA : this.pflB;
  }

  /** Set cue volume */
  setCueVolume(volume: number): void {
    this.cueGain.gain.rampTo(Math.max(0, Math.min(1.5, volume)), 0.02);
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
  }
}
