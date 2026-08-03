/**
 * TB303 overdrive config → worklet drive-stage parameters.
 *
 * Canonical config scale (matches JC303StyledKnobPanel and the DevilFish
 * presets): amount and dryWet are 0-100 (%), modelIndex is 0 = Soft, 1 = RAT.
 * The worklet drive stage takes 0-1 normalized values.
 */

export interface TB303OverdriveConfig {
  amount: number;      // 0-100 (%)
  modelIndex?: number; // 0 = Soft (tilt-EQ + 2x-OS asymmetric tanh), 1 = RAT (ProCo RAT port)
  drive?: number;      // legacy GuitarML field, unused
  dryWet?: number;     // 0-100 (%), default 100 (full wet)
}

export interface DriveStageParams {
  amount: number; // 0-1
  model: 0 | 1;
  mix: number;    // 0-1
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function tb303OverdriveToParams(od: TB303OverdriveConfig): DriveStageParams {
  return {
    amount: clamp01((od.amount ?? 0) / 100),
    model: (od.modelIndex ?? 0) >= 1 ? 1 : 0,
    mix: clamp01((od.dryWet ?? 100) / 100),
  };
}
