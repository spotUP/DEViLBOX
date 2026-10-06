/**
 * The per-channel sound-shaping slot: one effect on a channel's dub SEND,
 * shaping the audio before it joins the dub bus. Owner, 2026-10-06: "add the
 * sound shaping ones per channel".
 *
 * Space effects (echo, spring, plate, sweep, width) stay on the bus: they are
 * the room every channel shares. These are the colours a dub engineer puts on
 * ONE channel before the send: a filter, a ring modulator, a bitcrusher, a
 * tape wobble, tape saturation. At most one per channel, so a channel's
 * character is one decision, readable at a glance on the strip.
 *
 * This module is the single source of truth for the slot's kinds, their one
 * main parameter (label, unit, range, default) and the legacy-filter
 * migration. The store, the engine stage, the deck, the MCP tool and the
 * AutoDub shape move all read it.
 */

export type ChannelShapeKind = 'off' | 'hpf' | 'lpf' | 'ringMod' | 'lofi' | 'wobble' | 'saturation';

export interface ChannelShapeParamSpec {
  /** Full English label for the slot dropdown. */
  label: string;
  /** The one main parameter's label, shown on the knob. */
  paramLabel: string;
  unit: string;
  min: number;
  max: number;
  /** Value a freshly chosen effect starts at. */
  defaultValue: number;
  /** Log knob taper (frequencies). */
  logarithmic: boolean;
  step?: number;
}

export const CHANNEL_SHAPE_KINDS: readonly ChannelShapeKind[] = ['off', 'hpf', 'lpf', 'ringMod', 'lofi', 'wobble', 'saturation'];

export const CHANNEL_SHAPES: Readonly<Record<ChannelShapeKind, ChannelShapeParamSpec>> = {
  off:        { label: 'Off',        paramLabel: '',        unit: '',   min: 0,   max: 1,    defaultValue: 0,   logarithmic: false },
  hpf:        { label: 'High Pass',  paramLabel: 'Cutoff',  unit: 'Hz', min: 40,  max: 8000, defaultValue: 200, logarithmic: true },
  lpf:        { label: 'Low Pass',   paramLabel: 'Cutoff',  unit: 'Hz', min: 40,  max: 8000, defaultValue: 800, logarithmic: true },
  // The bus ring modulator's carrier range and default (DubBusSettings.ringModFreq).
  ringMod:    { label: 'Ring Mod',   paramLabel: 'Carrier', unit: 'Hz', min: 20,  max: 2000, defaultValue: 440, logarithmic: true },
  // Bitta's crush range, 1..16 bits. Lower is dirtier.
  lofi:       { label: 'Lo-fi',      paramLabel: 'Bits',    unit: '',   min: 1,   max: 16,   defaultValue: 4,   logarithmic: false, step: 1 },
  // Peak delay swing of the wobbling tape head, ms. 2 ms at 2.5 Hz is about a
  // third of a semitone of wow.
  wobble:     { label: 'Wobble',     paramLabel: 'Depth',   unit: 'ms', min: 0.2, max: 8,    defaultValue: 2,   logarithmic: false },
  // makeTapeSatCurve drive, 0..1.
  saturation: { label: 'Saturation', paramLabel: 'Drive',   unit: '',   min: 0,   max: 1,    defaultValue: 0.6, logarithmic: false },
};

/** The wobble's rate: the bus Wobble move's default (DubBus.startTapeWobble). */
export const CHANNEL_WOBBLE_RATE_HZ = 2.5;

export function isChannelShapeKind(v: unknown): v is ChannelShapeKind {
  return typeof v === 'string' && (CHANNEL_SHAPE_KINDS as readonly string[]).includes(v);
}

/** Clamp a value into the kind's range; NaN/undefined give the kind's default. */
export function clampChannelShapeValue(kind: ChannelShapeKind, value: number | undefined): number {
  const spec = CHANNEL_SHAPES[kind];
  if (value === undefined || !Number.isFinite(value)) return spec.defaultValue;
  return Math.max(spec.min, Math.min(spec.max, value));
}

/** Map 0..1 onto the kind's range, honouring its taper (AutoDub amounts, MIDI). */
export function channelShapeValueFromNorm(kind: ChannelShapeKind, norm: number): number {
  const spec = CHANNEL_SHAPES[kind];
  const t = Math.max(0, Math.min(1, norm));
  const v = spec.logarithmic
    ? spec.min * Math.pow(spec.max / spec.min, t)
    : spec.min + (spec.max - spec.min) * t;
  return spec.step ? Math.round(v / spec.step) * spec.step : v;
}

/** One-line description of a channel's slot for logs, tooltips and the MCP. */
export function describeChannelShape(kind: ChannelShapeKind, value: number): string {
  if (kind === 'off') return 'Off';
  const spec = CHANNEL_SHAPES[kind];
  const shown = kind === 'saturation' ? `${Math.round(value * 100)}%` : `${Math.round(value * 10) / 10}${spec.unit ? ` ${spec.unit}` : ''}`;
  return `${spec.label} ${spec.paramLabel} ${shown}`;
}

/** Inverse of `channelShapeValueFromNorm`. */
export function channelShapeNormFromValue(kind: ChannelShapeKind, value: number): number {
  const spec = CHANNEL_SHAPES[kind];
  const v = clampChannelShapeValue(kind, value);
  if (spec.max === spec.min) return 0;
  return spec.logarithmic
    ? Math.log(v / spec.min) / Math.log(spec.max / spec.min)
    : (v - spec.min) / (spec.max - spec.min);
}

/**
 * A slot as ONE automation value in 0..1, for the `dub.channelShape` lane.
 * Lanes carry one number per point, so the kind takes the band
 * [i/7, (i+0.9)/7) and the parameter its position inside the band. The lane
 * is a step curve, so a replayed point decodes exactly.
 */
const SHAPE_BANDS = CHANNEL_SHAPE_KINDS.length;
const BAND_FILL = 0.9;

export function encodeChannelShapeLane(kind: ChannelShapeKind, value: number): number {
  const i = CHANNEL_SHAPE_KINDS.indexOf(kind);
  return (i + BAND_FILL * channelShapeNormFromValue(kind, value)) / SHAPE_BANDS;
}

export function decodeChannelShapeLane(lane: number): { kind: ChannelShapeKind; value: number } {
  const x = Math.max(0, Math.min(1, lane)) * SHAPE_BANDS;
  const i = Math.min(SHAPE_BANDS - 1, Math.floor(x + 1e-9));
  const kind = CHANNEL_SHAPE_KINDS[i];
  const norm = Math.max(0, Math.min(1, (x - i) / BAND_FILL));
  return { kind, value: kind === 'off' ? 0 : channelShapeValueFromNorm(kind, norm) };
}

/**
 * The `channelShape` move's params, as a slot. Move params are numbers (they
 * travel through the router, lanes and MIDI as such): `effect` is the index
 * into CHANNEL_SHAPE_KINDS (1 High Pass … 6 Saturation), `amount` 0..1 across
 * the kind's parameter range with its taper. Null for Off or garbage.
 */
export function channelShapeMoveTarget(params: Record<string, number | undefined>): { kind: ChannelShapeKind; value: number } | null {
  const kind = CHANNEL_SHAPE_KINDS[Math.round(params.effect ?? -1)];
  if (!kind || kind === 'off') return null;
  const amount = params.amount;
  return {
    kind,
    value: amount === undefined || !Number.isFinite(amount)
      ? CHANNEL_SHAPES[kind].defaultValue
      : channelShapeValueFromNorm(kind, amount),
  };
}

/** Index of a kind for the move's `effect` param. */
export function channelShapeEffectIndex(kind: ChannelShapeKind): number {
  return CHANNEL_SHAPE_KINDS.indexOf(kind);
}
