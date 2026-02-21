/**
 * StereoSeparationNode — OpenMPT/ModPlug stereo separation algorithm.
 *
 * Implements the exact mid-side decomposition from Sndmix.cpp::ApplyStereoSeparation.
 * Inserted into the TrackerReplayer audio chain between masterGain and the destination.
 *
 * percent: 0-200 (libopenmpt public API scale)
 *   0%   = mono
 *   100% = normal stereo (identity)
 *   200% = enhanced stereo width
 */

import * as Tone from 'tone';

export interface StereoGains {
  gainLL: number; // Left  → Left
  gainRR: number; // Right → Right
  gainLR: number; // Left  → Right (crossfeed)
  gainRL: number; // Right → Left  (crossfeed)
}

/**
 * Pure function — computes the gain matrix for a given separation percentage.
 * Exported for unit testing; not dependent on Web Audio.
 */
export function computeStereoGains(percent: number): StereoGains {
  const f = Math.max(0, Math.min(200, percent)) / 100; // 0.0–2.0; 1.0 = identity
  return {
    gainLL: (1 + f) / 2,
    gainRR: (1 + f) / 2,
    gainLR: (1 - f) / 2,
    gainRL: (1 - f) / 2,
  };
}

export class StereoSeparationNode {
  /** Connect upstream Tone.js nodes here (replaces direct masterGain → dest connection). */
  readonly inputTone: Tone.Gain;
  /** Connect this to the downstream destination Tone.js node. */
  readonly outputTone: Tone.Gain;

  private readonly splitter: ChannelSplitterNode;
  private readonly merger: ChannelMergerNode;
  private readonly gainLL: GainNode;
  private readonly gainLR: GainNode;
  private readonly gainRL: GainNode;
  private readonly gainRR: GainNode;

  constructor() {
    const ctx = Tone.getContext().rawContext;

    this.inputTone  = new Tone.Gain(1);
    this.outputTone = new Tone.Gain(1);

    this.splitter = ctx.createChannelSplitter(2);
    this.merger   = ctx.createChannelMerger(2);
    this.gainLL   = ctx.createGain();
    this.gainLR   = ctx.createGain();
    this.gainRL   = ctx.createGain();
    this.gainRR   = ctx.createGain();

    // Wire the graph:
    // inputTone → splitter → [gain matrix] → merger → outputTone
    this.inputTone.connect(this.splitter);

    // L channel (splitter output 0) → LL and LR gains
    this.splitter.connect(this.gainLL, 0);
    this.splitter.connect(this.gainLR, 0);
    // R channel (splitter output 1) → RL and RR gains
    this.splitter.connect(this.gainRL, 1);
    this.splitter.connect(this.gainRR, 1);

    // Merge into L output (merger input 0): LL + RL
    this.gainLL.connect(this.merger, 0, 0);
    this.gainRL.connect(this.merger, 0, 0);
    // Merge into R output (merger input 1): LR + RR
    this.gainLR.connect(this.merger, 0, 1);
    this.gainRR.connect(this.merger, 0, 1);

    // merger → outputTone's underlying AudioNode
    this.merger.connect(this.outputTone.input);

    // Default: identity (100% = normal stereo)
    this.setSeparation(100);
  }

  /**
   * Set stereo separation. percent: 0–200 (OpenMPT libopenmpt scale).
   * 0 = mono, 100 = identity, 200 = enhanced width.
   *
   * NOTE: Values above 100% increase gain coefficients above 1.0.
   * With hard-panned content, 200% can push instantaneous gain to 2x.
   * Ensure a downstream limiter or low master gain is in place.
   */
  setSeparation(percent: number): void {
    const g = computeStereoGains(percent);
    this.gainLL.gain.value = g.gainLL;
    this.gainRR.gain.value = g.gainRR;
    this.gainLR.gain.value = g.gainLR;
    this.gainRL.gain.value = g.gainRL;
  }

  dispose(): void {
    this.inputTone.dispose();
    this.splitter.disconnect();
    this.gainLL.disconnect();
    this.gainLR.disconnect();
    this.gainRL.disconnect();
    this.gainRR.disconnect();
    this.merger.disconnect();
    this.outputTone.dispose();
  }
}
