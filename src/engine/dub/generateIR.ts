/**
 * generateIR — Algorithmic impulse response generator for club simulation.
 *
 * Creates synthetic IRs that model the acoustic character of different
 * listening environments (small club, sound system dance, studio monitors).
 * Uses exponentially decaying filtered noise with early reflections.
 *
 * No sample files needed — pure algorithmic generation.
 */

export interface IRPreset {
  name: string;
  /** Reverb tail length in seconds */
  duration: number;
  /** Pre-delay before first reflection (ms) */
  preDelay: number;
  /** Number of early reflections */
  earlyCount: number;
  /** Decay time constant (seconds) */
  decayTime: number;
  /** Low-pass cutoff on the tail (Hz) — smaller rooms are darker */
  lpfCutoff: number;
  /** High-pass cutoff to remove sub rumble (Hz) */
  hpfCutoff: number;
  /** Stereo spread (0 = mono, 1 = wide) */
  stereoSpread: number;
  /** Early reflection level relative to tail */
  earlyLevel: number;
}

export const CLUB_IR_PRESETS: Record<string, IRPreset> = {
  smallClub: {
    name: 'Small Club',
    duration: 1.2,
    preDelay: 8,
    earlyCount: 12,
    decayTime: 0.6,
    lpfCutoff: 6000,
    hpfCutoff: 80,
    stereoSpread: 0.4,
    earlyLevel: 0.8,
  },
  soundSystem: {
    name: 'Sound System Dance',
    duration: 2.5,
    preDelay: 25,
    earlyCount: 20,
    decayTime: 1.4,
    lpfCutoff: 4000,
    hpfCutoff: 60,
    stereoSpread: 0.7,
    earlyLevel: 0.5,
  },
  studioMonitor: {
    name: 'Studio Monitor',
    duration: 0.4,
    preDelay: 2,
    earlyCount: 6,
    decayTime: 0.15,
    lpfCutoff: 12000,
    hpfCutoff: 100,
    stereoSpread: 0.3,
    earlyLevel: 1.0,
  },
};

/**
 * Generate a stereo impulse response buffer for a given preset.
 */
export function generateIR(
  ctx: BaseAudioContext,
  preset: IRPreset,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(preset.duration * sampleRate);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const preDelaySamples = Math.round((preset.preDelay / 1000) * sampleRate);
  const decaySamples = preset.decayTime * sampleRate;

  // Generate exponentially decaying noise tail
  for (let i = preDelaySamples; i < length; i++) {
    const t = (i - preDelaySamples) / decaySamples;
    const envelope = Math.exp(-3 * t); // -60dB at ~t=decayTime
    const noiseL = (Math.random() * 2 - 1) * envelope;
    const noiseR = (Math.random() * 2 - 1) * envelope;

    // Stereo decorrelation: blend between correlated and independent
    const spread = preset.stereoSpread;
    const mid = (noiseL + noiseR) * 0.5;
    left[i] = mid * (1 - spread) + noiseL * spread;
    right[i] = mid * (1 - spread) + noiseR * spread;
  }

  // Add early reflections as discrete impulses
  for (let r = 0; r < preset.earlyCount; r++) {
    const frac = (r + 1) / (preset.earlyCount + 1);
    const delaySamples = preDelaySamples + Math.round(frac * preDelaySamples * 8);
    if (delaySamples >= length) continue;

    const level = preset.earlyLevel * (1 - frac * 0.6); // decay with distance
    const pan = (Math.random() - 0.5) * preset.stereoSpread;

    left[delaySamples] += level * (0.5 + pan);
    right[delaySamples] += level * (0.5 - pan);
  }

  // Simple 1-pole LPF on the buffer (offline)
  const lpfCoeff = Math.exp(-2 * Math.PI * preset.lpfCutoff / sampleRate);
  let prevL = 0, prevR = 0;
  for (let i = 0; i < length; i++) {
    left[i] = prevL = prevL * lpfCoeff + left[i] * (1 - lpfCoeff);
    right[i] = prevR = prevR * lpfCoeff + right[i] * (1 - lpfCoeff);
  }

  // Simple 1-pole HPF on the buffer (offline)
  const hpfCoeff = Math.exp(-2 * Math.PI * preset.hpfCutoff / sampleRate);
  prevL = 0; prevR = 0;
  for (let i = 0; i < length; i++) {
    const inL = left[i], inR = right[i];
    left[i] = inL - prevL; prevL = inL * (1 - hpfCoeff) + prevL * hpfCoeff;
    right[i] = inR - prevR; prevR = inR * (1 - hpfCoeff) + prevR * hpfCoeff;
  }

  // Normalize to prevent clipping
  let peak = 0;
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (peak > 0) {
    const norm = 0.9 / peak;
    for (let i = 0; i < length; i++) {
      left[i] *= norm;
      right[i] *= norm;
    }
  }

  return buffer;
}
