/**
 * SynthPanelLayout — Declarative layout descriptors for synth panels.
 * Each synth type defines sections of controls that the generic DOMSynthPanel renders.
 */

export interface KnobDescriptor {
  type: 'knob';
  key: string;
  label: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  color?: string;
  formatValue?: (v: number) => string;
  bipolar?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface ToggleDescriptor {
  type: 'toggle';
  key: string;
  label: string;
  labels?: [string, string]; // [off, on]
}

export interface SliderDescriptor {
  type: 'slider';
  key: string;
  label: string;
  min?: number;
  max?: number;
  orientation?: 'horizontal' | 'vertical';
  centerDetent?: boolean;
}

export interface Switch3WayDescriptor {
  type: 'switch3way';
  key: string;
  label: string;
  labels: [string, string, string];
}

export interface SelectDescriptor {
  type: 'select';
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export type ControlDescriptor = KnobDescriptor | ToggleDescriptor | SliderDescriptor | Switch3WayDescriptor | SelectDescriptor;

/** One drawn line of a curve: points are [x, y] in the curve's own units (seconds, Hz, dB, 0..1). */
export interface CurveSeries {
  points: ReadonlyArray<readonly [number, number]>;
  /** Defaults to the section accent. */
  color?: string;
  /** Fill down to the bottom of the plot (an envelope), instead of only stroking the line. */
  fill?: boolean;
}

/**
 * A realtime curve that shows what a section's knobs do to the sound (a filter response, an envelope, an LFO shape).
 * `series` is a pure function of the layout's current values, so the curve redraws as a knob moves, with no note
 * held. `marker` is the live part: where the playing voice is right now, reported by the engine.
 */
export interface CurveDescriptor {
  label: string;
  /** Plot height in px (default 72). */
  height?: number;
  xScale?: 'linear' | 'log';
  xDomain: readonly [number, number];
  yDomain: readonly [number, number];
  xUnit?: string;
  yUnit?: string;
  /** Layout values in, lines out. `get` returns the numeric value of a layout key. */
  series: (get: (key: string) => number) => CurveSeries[];
  /** Live voice position on the x axis (null = no voice); the canvas redraws the marker without re-rendering. */
  marker?: { subscribe: (onPosition: (x: number | null) => void) => () => void };
}

export interface SectionDescriptor {
  label: string;
  controls: ControlDescriptor[];
  /** Curves drawn at the top of the section, above its knobs. */
  curves?: CurveDescriptor[];
  /** Number of columns in the control grid (default: auto) */
  columns?: number;
}

export interface SynthPanelLayout {
  /** Display name for the synth */
  name: string;
  /** Config key on the instrument (e.g. 'tb303', 'dexed', 'dubSiren') */
  configKey: string;
  sections?: SectionDescriptor[];
  /** Tabs for multi-page panels */
  tabs?: { id: string; label: string; sections: SectionDescriptor[] }[];
}
