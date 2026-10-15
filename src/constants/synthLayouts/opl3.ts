import type { ControlDescriptor, SynthPanelLayout } from '@/types/synthPanel';
import {
  oplOperatorEnvelopeCurve, oplSpectrumCurve, oplTremoloCurve, oplVibratoCurve, oplWaveformCurve, type OplLayoutContext,
} from '@/components/instruments/curves/fmCurveModels';

const WAVEFORM_NAMES = ['Sine', 'Half-S', 'Abs-S', 'Pulse', 'Sine2x', 'Abs2x', 'Square', 'DSaw'];
const fmtWF = (v: number) => WAVEFORM_NAMES[Math.round(v)] || '?';

/**
 * The layout default of a key, read from the controls below (one table: the knobs' own defaults). The curves use it for a
 * key the config does not hold, so a curve and the knob next to it show the same patch.
 */
let layoutDefaults: Map<string, number> | null = null;
function layoutDefault(key: string): number {
  if (layoutDefaults === null) {
    layoutDefaults = new Map();
    for (const tab of OPL3_LAYOUT.tabs ?? []) {
      for (const section of tab.sections) {
        for (const c of section.controls as ControlDescriptor[]) if (c.type === 'knob') layoutDefaults.set(c.key, c.defaultValue ?? 0);
      }
    }
  }
  return layoutDefaults.get(key) ?? 0;
}
const curveContext: OplLayoutContext = { defaultOf: layoutDefault };

export const OPL3_LAYOUT: SynthPanelLayout = {
  name: 'OPL3 FM Synth',
  configKey: 'opl3',
  tabs: [
    {
      id: 'op1',
      label: 'OP1 MOD',
      sections: [
        {
          label: 'ENVELOPE',
          curves: [oplOperatorEnvelopeCurve(1, curveContext)],
          columns: 4,
          controls: [
            { type: 'knob', key: 'op1Attack', label: 'ATTACK', color: '#33ccff', min: 0, max: 15, defaultValue: 15, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Decay', label: 'DECAY', color: '#33ccff', min: 0, max: 15, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Sustain', label: 'SUSTAIN', color: '#33ccff', min: 0, max: 15, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Release', label: 'RELEASE', color: '#33ccff', min: 0, max: 15, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'OSCILLATOR',
          curves: [oplWaveformCurve(1, curveContext)],
          columns: 3,
          controls: [
            { type: 'knob', key: 'op1Level', label: 'LEVEL', color: '#66ff99', min: 0, max: 63, defaultValue: 32, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Multi', label: 'MULTI', color: '#ffcc33', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op1Waveform', label: 'WAVE', color: '#ff66cc', min: 0, max: 7, defaultValue: 0, formatValue: fmtWF },
          ],
        },
        {
          label: 'FLAGS',
          curves: [oplTremoloCurve(1, curveContext), oplVibratoCurve(1, curveContext)],
          controls: [
            { type: 'toggle', key: 'op1Tremolo', label: 'TREM' },
            { type: 'toggle', key: 'op1Vibrato', label: 'VIB' },
            { type: 'toggle', key: 'op1SustainHold', label: 'HOLD' },
            { type: 'toggle', key: 'op1KSR', label: 'KSR' },
            { type: 'knob', key: 'op1KSL', label: 'KSL', min: 0, max: 3, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
      ],
    },
    {
      id: 'op2',
      label: 'OP2 CAR',
      sections: [
        {
          label: 'ENVELOPE',
          curves: [oplOperatorEnvelopeCurve(2, curveContext)],
          columns: 4,
          controls: [
            { type: 'knob', key: 'op2Attack', label: 'ATTACK', color: '#ff6633', min: 0, max: 15, defaultValue: 15, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Decay', label: 'DECAY', color: '#ff6633', min: 0, max: 15, defaultValue: 4, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Sustain', label: 'SUSTAIN', color: '#ff6633', min: 0, max: 15, defaultValue: 2, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Release', label: 'RELEASE', color: '#ff6633', min: 0, max: 15, defaultValue: 5, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
        {
          label: 'OSCILLATOR',
          curves: [oplWaveformCurve(2, curveContext)],
          columns: 3,
          controls: [
            { type: 'knob', key: 'op2Level', label: 'LEVEL', color: '#66ff99', min: 0, max: 63, defaultValue: 63, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Multi', label: 'MULTI', color: '#ffcc33', min: 0, max: 15, defaultValue: 1, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'op2Waveform', label: 'WAVE', color: '#ff66cc', min: 0, max: 7, defaultValue: 0, formatValue: fmtWF },
          ],
        },
        {
          label: 'FLAGS',
          curves: [oplTremoloCurve(2, curveContext), oplVibratoCurve(2, curveContext)],
          controls: [
            { type: 'toggle', key: 'op2Tremolo', label: 'TREM' },
            { type: 'toggle', key: 'op2Vibrato', label: 'VIB' },
            { type: 'toggle', key: 'op2SustainHold', label: 'HOLD' },
            { type: 'toggle', key: 'op2KSR', label: 'KSR' },
            { type: 'knob', key: 'op2KSL', label: 'KSL', min: 0, max: 3, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
          ],
        },
      ],
    },
    {
      id: 'global',
      label: 'GLOBAL',
      sections: [
        {
          label: 'ALGORITHM',
          curves: [oplSpectrumCurve(curveContext)],
          controls: [
            { type: 'knob', key: 'feedback', label: 'FEEDBACK', color: '#cc66ff', min: 0, max: 7, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
            { type: 'toggle', key: 'connection', label: 'ADDITIVE' },
          ],
        },
      ],
    },
  ],
};
