import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

const OSC_WAVE = [
  { value: '0', label: 'Saw' }, { value: '1', label: 'Pulse' },
  { value: '2', label: 'Noise' }, { value: '3', label: 'Triangle' }, { value: '4', label: 'Sine' },
];
const LFO_WAVE = [
  { value: '0', label: 'Tri' }, { value: '1', label: 'Saw' },
  { value: '2', label: 'Square' }, { value: '3', label: 'S&H' }, { value: '4', label: 'Sine' },
];
const LFO_DEST = [
  { value: '0', label: 'Off' }, { value: '1', label: 'Filter' },
  { value: '2', label: 'Osc' }, { value: '3', label: 'PW' }, { value: '4', label: 'Pan' },
];
const FREE_AD_DEST = [
  { value: '0', label: 'Off' }, { value: '1', label: 'Filter' },
  { value: '2', label: 'Osc' }, { value: '3', label: 'PW' }, { value: '4', label: 'Pan' },
];
const PORTA_MODE = [
  { value: '0', label: 'Auto' }, { value: '1', label: 'Always' },
];
const FILTER_TYPE = [
  { value: '0', label: 'LP 24' }, { value: '1', label: 'LP 12' },
  { value: '2', label: 'HP' }, { value: '3', label: 'BP' },
];

export const TAL_NOIZEMAKER_LAYOUT: SynthPanelLayout = {
  name: 'TAL-NoiseMaker',
  configKey: 'talNoizeMaker',
  tabs: [
    {
      id: 'osc',
      label: 'OSC',
      sections: [
        {
          label: 'OSCILLATOR 1',
          controls: [
            { type: 'select', key: 'osc1Waveform', label: 'WAVE', options: OSC_WAVE },
            { type: 'knob', key: 'osc1Volume', label: 'VOL', color: '#ff9900', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'osc1PW', label: 'PW', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'osc1Tune', label: 'TUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.25, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 48)} st` },
            { type: 'knob', key: 'osc1FineTune', label: 'FINE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 200)} ct` },
            { type: 'knob', key: 'osc1Phase', label: 'PHASE', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'OSCILLATOR 2',
          controls: [
            { type: 'select', key: 'osc2Waveform', label: 'WAVE', options: OSC_WAVE },
            { type: 'knob', key: 'osc2Volume', label: 'VOL', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'osc2Tune', label: 'TUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 48)} st` },
            { type: 'knob', key: 'osc2FineTune', label: 'FINE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 200)} ct` },
            { type: 'knob', key: 'osc2Phase', label: 'PHASE', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'osc2FM', label: 'FM', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'oscSync', label: 'SYNC', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'SUB & MIX',
          controls: [
            { type: 'knob', key: 'osc3Volume', label: 'SUB VOL', color: '#ff6600', min: 0, max: 1, defaultValue: 0.8, formatValue: fmtPct },
            { type: 'knob', key: 'ringModulation', label: 'RING', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'masterTune', label: 'M.TUNE', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 200)} ct` },
            { type: 'knob', key: 'transpose', label: 'XPOSE', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, bipolar: true, formatValue: (v) => `${Math.round((v - 0.5) * 48)} st` },
            { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
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
            { type: 'knob', key: 'cutoff', label: 'CUTOFF', color: '#ffcc00', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'resonance', label: 'RESO', color: '#ff6600', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'keyFollow', label: 'KEY FLW', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filterDrive', label: 'DRIVE', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filterContour', label: 'CONTOUR', color: '#22c55e', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'FILTER ENVELOPE',
          controls: [
            { type: 'knob', key: 'filterAttack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filterDecay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'filterSustain', label: 'SUS', color: '#22c55e', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'filterRelease', label: 'REL', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'AMP ENVELOPE',
          controls: [
            { type: 'knob', key: 'ampAttack', label: 'ATK', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'ampDecay', label: 'DEC', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'ampSustain', label: 'SUS', color: '#ff3366', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'ampRelease', label: 'REL', color: '#ff3366', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
    {
      id: 'mod',
      label: 'MOD',
      sections: [
        {
          label: 'LFO 1',
          controls: [
            { type: 'select', key: 'lfo1Waveform', label: 'WAVE', options: LFO_WAVE },
            { type: 'knob', key: 'lfo1Rate', label: 'RATE', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo1Amount', label: 'AMOUNT', color: '#9966ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'select', key: 'lfo1Destination', label: 'DEST', options: LFO_DEST },
            { type: 'knob', key: 'lfo1Phase', label: 'PHASE', color: '#9966ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'lfo1Sync', label: 'SYNC', labels: ['FREE', 'SYNC'] },
            { type: 'toggle', key: 'lfo1KeyTrigger', label: 'KEY', labels: ['FREE', 'KEY'] },
          ],
        },
        {
          label: 'LFO 2',
          controls: [
            { type: 'select', key: 'lfo2Waveform', label: 'WAVE', options: LFO_WAVE },
            { type: 'knob', key: 'lfo2Rate', label: 'RATE', color: '#06b6d4', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'lfo2Amount', label: 'AMOUNT', color: '#06b6d4', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'select', key: 'lfo2Destination', label: 'DEST', options: LFO_DEST },
            { type: 'knob', key: 'lfo2Phase', label: 'PHASE', color: '#06b6d4', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'lfo2Sync', label: 'SYNC', labels: ['FREE', 'SYNC'] },
            { type: 'toggle', key: 'lfo2KeyTrigger', label: 'KEY', labels: ['FREE', 'KEY'] },
          ],
        },
        {
          label: 'FREE AD ENVELOPE',
          controls: [
            { type: 'knob', key: 'freeAdAttack', label: 'ATK', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'freeAdDecay', label: 'DEC', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'freeAdAmount', label: 'AMOUNT', color: '#22c55e', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'select', key: 'freeAdDestination', label: 'DEST', options: FREE_AD_DEST },
          ],
        },
        {
          label: 'PERFORMANCE',
          controls: [
            { type: 'knob', key: 'portamento', label: 'PORTA', color: '#33ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'voices', label: 'VOICES', color: '#66ccff', min: 0, max: 1, defaultValue: 1, formatValue: (v) => `${1 + Math.floor(15 * v)}` },
            { type: 'knob', key: 'detune', label: 'DETUNE', color: '#ffcc00', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'select', key: 'portamentoMode', label: 'PORT MODE', options: PORTA_MODE },
          ],
        },
        {
          label: 'VELOCITY',
          controls: [
            { type: 'knob', key: 'velocityVolume', label: 'VOLUME', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'velocityContour', label: 'CONTOUR', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'velocityCutoff', label: 'CUTOFF', color: '#ff9900', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
          ],
        },
        {
          label: 'PITCH WHEEL',
          controls: [
            { type: 'knob', key: 'pitchwheelCutoff', label: 'CUTOFF', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'pitchwheelPitch', label: 'PITCH', color: '#66ccff', min: 0, max: 1, defaultValue: 0.08, formatValue: (v) => `${Math.round(v * 24)} st` },
          ],
        },
      ],
    },
    {
      id: 'fx',
      label: 'FX',
      sections: [
        {
          label: 'CHORUS',
          controls: [
            { type: 'toggle', key: 'chorus1Enable', label: 'CHR I', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'chorus2Enable', label: 'CHR II', labels: ['OFF', 'ON'] },
          ],
        },
        {
          label: 'REVERB',
          controls: [
            { type: 'knob', key: 'reverbWet', label: 'WET', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbDecay', label: 'DECAY', color: '#cc66ff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'reverbPreDelay', label: 'PREDLY', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'reverbHighCut', label: 'HI CUT', color: '#cc66ff', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'reverbLowCut', label: 'LO CUT', color: '#cc66ff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
        {
          label: 'DELAY',
          controls: [
            { type: 'knob', key: 'delayWet', label: 'WET', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delayTime', label: 'TIME', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delayFeedback', label: 'FDBK', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'delayFactorL', label: 'FAC L', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'delayFactorR', label: 'FAC R', color: '#66ccff', min: 0, max: 1, defaultValue: 0.5, formatValue: fmtPct },
            { type: 'knob', key: 'delayHighShelf', label: 'HI SHELF', color: '#66ccff', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'delayLowShelf', label: 'LO SHELF', color: '#66ccff', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'toggle', key: 'delaySync', label: 'SYNC', labels: ['FREE', 'SYNC'] },
          ],
        },
        {
          label: 'LO-FI',
          controls: [
            { type: 'knob', key: 'oscBitcrusher', label: 'BITCRUSH', color: '#ff3366', min: 0, max: 1, defaultValue: 1, formatValue: fmtPct },
            { type: 'knob', key: 'highPass', label: 'HI PASS', color: '#ffcc00', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
            { type: 'knob', key: 'vintageNoise', label: 'NOISE', color: '#ff9900', min: 0, max: 1, defaultValue: 0, formatValue: fmtPct },
          ],
        },
      ],
    },
  ],
};
