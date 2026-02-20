import type { SynthPanelLayout } from '../synthPanelTypes';

const fmtLevel = (v: number) => `${Math.round(v * 99)}`;

const makeOperatorTab = (opNum: number): { id: string; label: string; sections: import('../synthPanelTypes').SectionDescriptor[] } => ({
  id: `op${opNum}`,
  label: `OP ${opNum}`,
  sections: [
    {
      label: `OPERATOR ${opNum}`,
      controls: [
        { type: 'knob', key: `operators.${opNum - 1}.level`, label: 'LEVEL', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.velocity`, label: 'VEL', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.detune`, label: 'DETUNE', defaultValue: 0.5, bipolar: true },
      ],
    },
    {
      label: 'ENVELOPE',
      controls: [
        { type: 'knob', key: `operators.${opNum - 1}.envR1`, label: 'R1', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envR2`, label: 'R2', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envR3`, label: 'R3', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envR4`, label: 'R4', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envL1`, label: 'L1', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envL2`, label: 'L2', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envL3`, label: 'L3', formatValue: fmtLevel },
        { type: 'knob', key: `operators.${opNum - 1}.envL4`, label: 'L4', formatValue: fmtLevel },
      ],
    },
  ],
});

export const DEXED_LAYOUT: SynthPanelLayout = {
  name: 'DX7 (Dexed)',
  configKey: 'dexed',
  tabs: [
    {
      id: 'global',
      label: 'GLOBAL',
      sections: [
        {
          label: 'GLOBAL',
          controls: [
            { type: 'knob', key: 'algorithm', label: 'ALGO', min: 0, max: 31, defaultValue: 0, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'feedback', label: 'FB', formatValue: (v) => `${Math.round(v * 7)}` },
            { type: 'knob', key: 'lfoSpeed', label: 'LFO SPD', formatValue: fmtLevel },
            { type: 'knob', key: 'lfoDelay', label: 'LFO DLY', formatValue: fmtLevel },
            { type: 'knob', key: 'lfoPitchModDepth', label: 'P.MOD', formatValue: fmtLevel },
            { type: 'knob', key: 'lfoAmpModDepth', label: 'A.MOD', formatValue: fmtLevel },
          ],
        },
        {
          label: 'PITCH ENVELOPE',
          controls: [
            { type: 'knob', key: 'pitchEnvR1', label: 'R1', formatValue: fmtLevel },
            { type: 'knob', key: 'pitchEnvR2', label: 'R2', formatValue: fmtLevel },
            { type: 'knob', key: 'pitchEnvR3', label: 'R3', formatValue: fmtLevel },
            { type: 'knob', key: 'pitchEnvR4', label: 'R4', formatValue: fmtLevel },
          ],
        },
      ],
    },
    makeOperatorTab(1),
    makeOperatorTab(2),
    makeOperatorTab(3),
    makeOperatorTab(4),
    makeOperatorTab(5),
    makeOperatorTab(6),
  ],
};
