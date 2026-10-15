/**
 * DX7 declarative layout: every VCED parameter (bytes 0..144; the voice name, bytes 145..154, has its own text field)
 * appears here exactly once, grouped as the DX7 manual groups them. The tabs are Voice, Operator 1..6 and Modulation;
 * the editor (DX7LayoutPanel) shows the six operator tabs behind one Operators tab with an operator selector, and adds
 * the Library tab, which is not a knob layout.
 *
 * Ranges come from VCED_MAX (dx7sysex.ts), the one table of what the firmware accepts, so a knob can never offer a
 * value the voice format cannot hold. VCED offsets: operator 6 starts at 0, operator 1 at 105, 21 bytes each.
 */
import type { ControlDescriptor, SectionDescriptor, SynthPanelLayout } from '@/types/synthPanel';
import {
  dx7AlgorithmCurve, dx7AllOperatorsCurve, dx7LevelScalingCurve, dx7LfoCurve, dx7OperatorEnvelopeCurve, dx7PitchEgCurve, dx7SpectrumCurve,
  type Dx7LayoutContext,
} from '@/components/instruments/curves/fmCurveModels';
import { VCED_MAX } from '@/engine/dx7/dx7sysex';

const fmtInt = (v: number) => `${Math.round(v)}`;
const fmtSigned = (v: number) => { const n = Math.round(v); return n > 0 ? `+${n}` : `${n}`; };

/** First byte of the 10-character voice name inside the VCED; the name field writes bytes 145..154. */
export const DX7_NAME_FIRST_BYTE = 145;
export const DX7_NAME_LENGTH = 10;
/** Operator `opNum` (1..6) starts here in the VCED (operator 6 is first). */
export const dx7OperatorBase = (opNum: number): number => (6 - opNum) * 21;

const CURVE_OPTIONS = [
  { value: '0', label: 'Negative Linear' }, { value: '1', label: 'Negative Exponential' },
  { value: '2', label: 'Positive Exponential' }, { value: '3', label: 'Positive Linear' },
];

const LFO_WAVE_OPTIONS = [
  { value: '0', label: 'Triangle' }, { value: '1', label: 'Saw Down' },
  { value: '2', label: 'Saw Up' }, { value: '3', label: 'Square' },
  { value: '4', label: 'Sine' }, { value: '5', label: 'Sample and Hold' },
];

const ON_OFF: [string, string] = ['Off', 'On'];

/** Break point 0..99 is the key A-1 .. C8 (the DX7 names middle C "C3", so 39 is middle C). */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function dx7BreakPointName(v: number): string {
  const midi = Math.round(v) + 21;
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 2}`;
}

const knob = (n: number, label: string, defaultValue: number, formatValue: (v: number) => string = fmtInt): ControlDescriptor =>
  ({ type: 'knob', key: `vced.${n}`, label, min: 0, max: VCED_MAX[n], defaultValue, formatValue });
const toggle = (n: number, label: string, labels: [string, string]): ControlDescriptor => ({ type: 'toggle', key: `vced.${n}`, label, labels });
const select = (n: number, label: string, options: { value: string; label: string }[]): ControlDescriptor => ({ type: 'select', key: `vced.${n}`, label, options });

/**
 * The layout default of `vced.N`, read from the controls below (one table: the knobs' own defaults). The curves use it
 * for a key the config does not hold, so a curve and the knob next to it show the same voice.
 */
let vcedDefaults: Map<number, number> | null = null;
function vcedDefault(n: number): number {
  if (vcedDefaults === null) {
    vcedDefaults = new Map();
    for (const tab of DX7_LAYOUT.tabs ?? []) {
      for (const section of tab.sections) {
        for (const c of section.controls) {
          const m = /^vced\.(\d+)$/.exec(c.key);
          if (m && c.type === 'knob') vcedDefaults.set(Number(m[1]), c.defaultValue ?? 0);
        }
      }
    }
  }
  return vcedDefaults.get(n) ?? 0;
}
const curveContext: Dx7LayoutContext = { defaultOf: vcedDefault };

/** The four sections of one operator tab. */
function operatorSections(opNum: number): SectionDescriptor[] {
  const base = dx7OperatorBase(opNum);
  const op = `Operator ${opNum}`;
  return [
    {
      label: `${op} Frequency`,
      curves: [dx7SpectrumCurve(curveContext)],
      controls: [
        knob(base + 18, 'Coarse Frequency', 1),
        knob(base + 19, 'Fine Frequency', 0),
        knob(base + 20, 'Detune', 7, (v) => fmtSigned(Math.round(v) - 7)),
        toggle(base + 17, 'Frequency Mode', ['Ratio', 'Fixed']),
      ],
    },
    {
      label: `${op} Level and Sensitivity`,
      controls: [
        knob(base + 16, 'Output Level', opNum === 1 ? 99 : 0),
        knob(base + 15, 'Velocity Sensitivity', 0),
        knob(base + 14, 'Amplitude Modulation Sensitivity', 0),
        knob(base + 13, `Rate Scaling`, 0),
      ],
    },
    {
      label: `${op} Envelope`,
      curves: [dx7OperatorEnvelopeCurve(opNum, curveContext)],
      controls: [
        knob(base + 0, `Rate 1`, 99), knob(base + 1, `Rate 2`, 99), knob(base + 2, `Rate 3`, 99), knob(base + 3, `Rate 4`, 99),
        knob(base + 4, `Level 1`, 99), knob(base + 5, `Level 2`, 99), knob(base + 6, `Level 3`, 99), knob(base + 7, `Level 4`, 0),
      ],
    },
    {
      label: `${op} Keyboard Level Scaling`,
      curves: [dx7LevelScalingCurve(opNum, curveContext)],
      controls: [
        knob(base + 8, 'Break Point', 39, dx7BreakPointName),
        knob(base + 9, 'Left Depth', 0),
        knob(base + 10, 'Right Depth', 0),
        select(base + 11, 'Left Curve', CURVE_OPTIONS),
        select(base + 12, 'Right Curve', CURVE_OPTIONS),
      ],
    },
  ];
}

const VOICE_SECTIONS: SectionDescriptor[] = [
  {
    label: 'Algorithm',
    curves: [dx7AlgorithmCurve(curveContext), dx7AllOperatorsCurve(curveContext), dx7SpectrumCurve(curveContext)],
    controls: [
      knob(134, 'Algorithm', 0, (v) => `${Math.round(v) + 1}`),
      knob(135, 'Feedback', 0),
      toggle(136, 'Oscillator Key Sync', ON_OFF),
      knob(144, 'Transpose', 24, (v) => fmtSigned(Math.round(v) - 24)),
    ],
  },
  {
    label: 'Output',
    controls: [
      { type: 'knob', key: '~volume', label: 'Volume', min: -40, max: 6, defaultValue: -6, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
    ],
  },
];

const MODULATION_SECTIONS: SectionDescriptor[] = [
  {
    label: 'LFO',
    curves: [dx7LfoCurve(curveContext)],
    controls: [
      knob(137, 'LFO Speed', 0),
      knob(138, 'LFO Delay', 0),
      knob(139, 'Pitch Modulation Depth', 0),
      knob(140, 'Amplitude Modulation Depth', 0),
      knob(143, 'Pitch Modulation Sensitivity', 0),
      toggle(141, 'LFO Key Sync', ON_OFF),
      select(142, 'LFO Wave', LFO_WAVE_OPTIONS),
    ],
  },
  {
    label: 'Pitch Envelope',
    curves: [dx7PitchEgCurve(curveContext)],
    controls: [
      knob(126, 'Pitch Rate 1', 99), knob(127, 'Pitch Rate 2', 99), knob(128, 'Pitch Rate 3', 99), knob(129, 'Pitch Rate 4', 99),
      knob(130, 'Pitch Level 1', 50), knob(131, 'Pitch Level 2', 50), knob(132, 'Pitch Level 3', 50), knob(133, 'Pitch Level 4', 50),
    ],
  },
];

export const DX7_OPERATOR_TAB_IDS = ['op1', 'op2', 'op3', 'op4', 'op5', 'op6'] as const;

export const DX7_LAYOUT: SynthPanelLayout = {
  name: 'Yamaha DX7',
  configKey: 'dx7',
  tabs: [
    { id: 'voice', label: 'Voice', sections: VOICE_SECTIONS },
    ...DX7_OPERATOR_TAB_IDS.map((id, i) => ({ id, label: `Operator ${i + 1}`, sections: operatorSections(i + 1) })),
    { id: 'modulation', label: 'Modulation', sections: MODULATION_SECTIONS },
  ],
};

/** One tab of DX7_LAYOUT as a layout of its own (no tab bar): the editor draws its tabs itself. */
export function dx7LayoutForTab(tabId: string): SynthPanelLayout {
  const tab = (DX7_LAYOUT.tabs ?? []).find((t) => t.id === tabId);
  return { name: DX7_LAYOUT.name, configKey: DX7_LAYOUT.configKey, sections: tab?.sections ?? [] };
}
