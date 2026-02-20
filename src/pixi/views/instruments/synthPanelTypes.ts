/**
 * SynthPanelLayout — Declarative layout descriptors for synth panels.
 * Each synth type defines sections of controls that the generic PixiSynthPanel renders.
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

export type ControlDescriptor = KnobDescriptor | ToggleDescriptor | SliderDescriptor | Switch3WayDescriptor;

export interface SectionDescriptor {
  label: string;
  controls: ControlDescriptor[];
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
