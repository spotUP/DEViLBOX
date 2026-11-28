/**
 * The Up Rough demo's scratch `param_schema` (tools/scratch.py :1299) as the Auto Scratch panel's overrides
 * (SCR D2): the Density, Vocabulary, Velocity Response, Placement Velocity and Channel FX groups. Records and
 * the per-record boxes are the store's `autoDJScratchRecords`; Style and Render have their own selects.
 * The demo's render-tool options (bars, bpm, seed, section, source, gesture, macro, paula, vinyl) and the
 * juggle / three-deck sub-groups are not live Auto DJ settings and are left out.
 * An absent key = the demo's default (the profile's own value for the style-scoped groups).
 */
import { DEMO_VEL, type DemoFx, type ScratchVel } from './scratchRender';
import { PLAN_VEL, type PlanVel } from './scratchPlacement';
import { SCRATCH_GESTURE_IDS } from './scratchGestureCatalog';

export type ScratchParamGroup = 'Density' | 'Vocabulary' | 'Velocity Response' | 'Placement Velocity' | 'Channel FX';

export interface ScratchParamSpec {
  key: string;
  label: string;
  group: ScratchParamGroup;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** The demo's default; null = the style's profile value (style-scoped). */
  default: number | null;
}

const v = (key: keyof typeof DEMO_VEL, label: string, min: number, max: number, step: number, unit?: string): ScratchParamSpec =>
  ({ key: `vel_${key}`, label, group: 'Velocity Response', min, max, step, ...(unit ? { unit } : {}), default: DEMO_VEL[key] });
const pv = (key: keyof typeof PLAN_VEL, label: string): ScratchParamSpec =>
  ({ key: `plan_vel_${key}`, label, group: 'Placement Velocity', min: 0, max: 1, step: 0.01, default: PLAN_VEL[key] });
const fx = (key: keyof DemoFx, label: string, max: number, step: number, unit?: string): ScratchParamSpec =>
  ({ key: `fx_${key}`, label, group: 'Channel FX', min: 0, max, step, ...(unit ? { unit } : {}), default: null });

/** The demo's schema order, labels, ranges and steps. */
export const SCRATCH_PARAMS: readonly ScratchParamSpec[] = [
  { key: 'density_rate', label: 'Density Rate', group: 'Density', min: 0, max: 2, step: 0.01, default: null },
  { key: 'scale', label: 'Scratchiness Scale', group: 'Density', min: 0, max: 2, step: 0.01, default: null },
  { key: 'gesture_count', label: 'Gesture Variety', group: 'Vocabulary', min: 1, max: SCRATCH_GESTURE_IDS.length, step: 1, default: null },
  v('amp_base', 'Stroke Energy Base', 0, 2, 0.01),
  v('amp_span', 'Stroke Energy Span', 0, 2, 0.01),
  v('gain_base', 'Output Level Base', 0, 2, 0.01),
  v('gain_span', 'Output Level Span', 0, 2, 0.01),
  v('lp_thresh', 'Low-Pass Velocity Threshold', 0, 1, 0.01),
  v('lp_base', 'Low-Pass Cutoff Base', 200, 12000, 50, 'Hz'),
  v('lp_span', 'Low-Pass Cutoff Span', 0, 12000, 50, 'Hz'),
  v('hp_thresh', 'High-Pass Velocity Threshold', 0, 1, 0.01),
  v('hp_freq', 'High-Pass Cutoff', 500, 12000, 50, 'Hz'),
  v('hp_mix', 'High-Pass Sparkle Mix', 0, 1, 0.01),
  pv('base', 'Hit Velocity Base'),
  pv('rand', 'Hit Velocity Randomness'),
  pv('energy', 'Hit Velocity Energy Weight'),
  fx('hp', 'High Pass', 2000, 10, 'Hz'),
  fx('lp', 'Low Pass', 12000, 50, 'Hz'),
  fx('drive', 'Drive', 1, 0.01),
  fx('delay_mix', 'Delay Mix', 1, 0.01),
  fx('delay_s', 'Delay Time', 1, 0.01, 's'),
  fx('reverb_mix', 'Reverb Mix', 1, 0.01),
];

/** Overrides by schema key; absent = the demo's default. */
export type ScratchParams = Readonly<Record<string, number>>;

function pick<K extends string>(p: ScratchParams | undefined, prefix: string, base: Readonly<Record<K, unknown>>): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!p) return out;
  for (const k of Object.keys(base) as K[]) {
    const val = p[prefix + k];
    if (val !== undefined) out[k] = val;
  }
  return out;
}

/** The velocity-response curves (`VEL`) with the overrides on top. */
export function scratchVelOf(p: ScratchParams | undefined): ScratchVel {
  return { ...DEMO_VEL, ...pick(p, 'vel_', DEMO_VEL) };
}

/** The placement velocity weights (`PLAN_VEL`) overridden. */
export function scratchPlanVelOf(p: ScratchParams | undefined): Partial<PlanVel> {
  return pick(p, 'plan_vel_', PLAN_VEL);
}

const FX_KEYS: Required<DemoFx> = { hp: 0, lp: 0, drive: 0, delay_mix: 0, delay_s: 0, reverb_mix: 0 };

/** The style's channel FX (`prof["fx"]`) with the overrides on top. */
export function scratchFxOf(p: ScratchParams | undefined, base: DemoFx): DemoFx {
  return { ...base, ...pick(p, 'fx_', FX_KEYS) };
}
