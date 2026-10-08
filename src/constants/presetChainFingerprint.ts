/**
 * The identity of a master FX preset's chain as a make-up gain measures it:
 * each effect's category, type, enabled state, wet and parameters. A make-up
 * measured on one chain is wrong for another (Big Room kept the 4.6 dB measured
 * on 2026-09-30 after its compressor went from -12 dB / 30 dB knee to -22 dB /
 * 8 dB knee: the calibration tool skipped presets it already had a row for).
 */
export interface ChainEffect {
  category: string;
  type: string;
  enabled?: boolean;
  wet: number;
  parameters: Record<string, number | string>;
}

export function presetChainFingerprint(effects: readonly ChainEffect[]): string {
  return JSON.stringify(effects.map((e) => [
    e.category, e.type, e.enabled !== false, e.wet,
    Object.keys(e.parameters).sort().map((k) => [k, e.parameters[k]]),
  ]));
}
