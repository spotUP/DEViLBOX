import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const VOICE_WAVE = [
  { value: '0', label: 'Sine' }, { value: '1', label: 'Tri' }, { value: '2', label: 'Saw' },
  { value: '3', label: 'Square' }, { value: '4', label: 'Noise' }, { value: '5', label: 'Voice' }, { value: '6', label: 'Chirp' },
];
const FILTER_TYPE = [
  { value: '0', label: 'LP' }, { value: '1', label: 'HP' }, { value: '2', label: 'BP' },
  { value: '3', label: 'Notch' }, { value: '4', label: 'Peak' }, { value: '5', label: 'LShelf' },
];
const SUB_MAG_TYPE = [
  { value: '0', label: 'Linear' }, { value: '1', label: 'dB' },
  { value: '2', label: '-40dB' }, { value: '3', label: '-60dB' },
];
const fmtOct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

export const ZYNADDSUBFX_LAYOUT: SynthPanelLayout = {
  name: 'ZynAddSubFX',
  configKey: 'zynaddsubfx',
  tabs: [
    {
      id: 'add',
      label: 'ADD',
      sections: [
        {
          label: 'ADD SYNTH',
          controls: [
            { type: 'toggle', key: 'addEnable', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'addVolume', label: 'VOL', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'addPanning', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'addDetune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'addOctave', label: 'OCT', color: '#66ccff', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtOct },
          ],
        },
        {
          label: 'VOICE 1',
          controls: [
            { type: 'select', key: 'addVoice1Wave', label: 'WAVE', options: VOICE_WAVE },
            { type: 'knob', key: 'addVoice1Volume', label: 'VOL', color: '#ff9900', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'addVoice1Detune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
        {
          label: 'VOICE 2',
          controls: [
            { type: 'select', key: 'addVoice2Wave', label: 'WAVE', options: VOICE_WAVE },
            { type: 'knob', key: 'addVoice2Volume', label: 'VOL', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'addVoice2Detune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'addVoice2Octave', label: 'OCT', color: '#66ccff', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtOct },
          ],
        },
        {
          label: 'VOICE 3',
          controls: [
            { type: 'select', key: 'addVoice3Wave', label: 'WAVE', options: VOICE_WAVE },
            { type: 'knob', key: 'addVoice3Volume', label: 'VOL', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'addVoice3Detune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'addVoice3Octave', label: 'OCT', color: '#66ccff', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtOct },
          ],
        },
        {
          label: 'VOICE 4',
          controls: [
            { type: 'select', key: 'addVoice4Wave', label: 'WAVE', options: VOICE_WAVE },
            { type: 'knob', key: 'addVoice4Volume', label: 'VOL', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'addVoice4Detune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'addVoice4Octave', label: 'OCT', color: '#66ccff', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtOct },
          ],
        },
      ],
    },
    {
      id: 'sub',
      label: 'SUB',
      sections: [
        {
          label: 'SUB SYNTH',
          controls: [
            { type: 'toggle', key: 'subEnable', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'subVolume', label: 'VOL', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'subBandwidth', label: 'BWIDTH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'subNumHarmonics', label: 'HARMS', color: '#9966ff', min: 1, max: 64, defaultValue: 8, formatValue: (v) => `${Math.round(v)}` },
            { type: 'knob', key: 'subPanning', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'subOctave', label: 'OCT', color: '#66ccff', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtOct },
            { type: 'knob', key: 'subDetune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'subBandwidthScale', label: 'BW SCL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'select', key: 'subMagType', label: 'MAG TYPE', options: SUB_MAG_TYPE },
          ],
        },
        {
          label: 'SUB HARMONICS',
          controls: [
            { type: 'knob', key: 'subHarmonic1', label: 'H1', color: '#9966ff', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'subHarmonic2', label: 'H2', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'subHarmonic3', label: 'H3', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'subHarmonic4', label: 'H4', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'subHarmonic5', label: 'H5', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'subHarmonic6', label: 'H6', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'PAD SYNTH',
          controls: [
            { type: 'toggle', key: 'padEnable', label: 'ENABLE', labels: ['OFF', 'ON'] },
            { type: 'knob', key: 'padVolume', label: 'VOL', color: '#00ff99', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'padBandwidth', label: 'BWIDTH', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'select', key: 'padQuality', label: 'QUALITY', options: [
              { value: '0', label: 'Low' }, { value: '1', label: 'Med' },
              { value: '2', label: 'High' }, { value: '3', label: 'Ultra' },
            ]},
            { type: 'knob', key: 'padPanning', label: 'PAN', color: '#66ccff', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
            { type: 'knob', key: 'padBandwidthScale', label: 'BW SCL', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'padOctave', label: 'OCT', color: '#66ccff', min: -4, max: 4, defaultValue: 0, bipolar: true, formatValue: fmtOct },
            { type: 'knob', key: 'padDetune', label: 'DETUNE', color: '#ffcc00', min: -1, max: 1, defaultValue: 0, bipolar: true, formatValue: (v) => `${Math.round(v * 100)}%` },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'FILTER',
      sections: [
        {
          label: 'FILTER',
          controls: [
            { type: 'select', key: 'filterType', label: 'TYPE', options: FILTER_TYPE },
            { type: 'knob', key: 'filterCutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'filterResonance', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
            { type: 'knob', key: 'filterEnvAmount', label: 'ENV AMT', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filterKeyTrack', label: 'KEY TRK', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'filterVelocity', label: 'VEL', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'filterAttack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'filterDecay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
            { type: 'knob', key: 'filterSustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 0.7, formatValue: fmtPct },
            { type: 'knob', key: 'filterRelease', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'ampAttack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0.01, formatValue: fmtPct },
            { type: 'knob', key: 'ampDecay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0.1, formatValue: fmtPct },
            { type: 'knob', key: 'ampSustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'ampRelease', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0.2, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'REVERB',
          controls: [
            { type: 'knob', key: 'reverbWet', label: 'WET', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbSize', label: 'SIZE', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'CHORUS',
          controls: [
            { type: 'knob', key: 'chorusWet', label: 'WET', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'chorusRate', label: 'RATE', color: '#33ccff', min: 0, max: 1, defaultValue: 0.3, formatValue: fmtPct },
          ],
        },
        {
          label: 'DISTORTION',
          controls: [
            { type: 'knob', key: 'distortionWet', label: 'WET', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'distortionDrive', label: 'PRESET', color: '#ff3366', min: 0, max: 7, defaultValue: 0, formatValue: (v: number) => `${Math.round(v)}` },
          ],
        },
      ],
    },
  ],
};
