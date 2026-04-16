import type { SynthPanelLayout } from '@/types/synthPanel';

const fmtDb = (v: number) => `${Math.round(v)}dB`;
const fmtPan = (v: number) => v === 0 ? 'C' : v > 0 ? `R${Math.round(v)}` : `L${Math.round(-v)}`;
const fmtInt = (v: number) => String(Math.round(v));

/** Minimal layout shared by all Furnace chip types (volume + pan). */
export const FURNACE_LAYOUT: SynthPanelLayout = {
  name: 'Furnace Chip',
  configKey: '',
  sections: [
    {
      label: 'AMP',
      controls: [
        { type: 'knob', key: 'volume', label: 'VOLUME', color: '#00ff99', min: -60, max: 0, defaultValue: -12, formatValue: fmtDb },
        { type: 'knob', key: 'pan', label: 'PAN', color: '#66ccff', min: -100, max: 100, defaultValue: 0, bipolar: true, formatValue: fmtPan },
      ],
    },
  ],
};

// ============================================================================
// GB HW SEQUENCE
// ============================================================================

/** GB Hardware Sequence — toggle + sequence length knob.
 *  The actual sequence list is a dynamic editor rendered separately;
 *  this layout covers the static controls only. */
export const FURNACE_GB_HWSEQ_LAYOUT: SynthPanelLayout = {
  name: 'GB HW Sequence',
  configKey: 'gb',
  sections: [
    {
      label: 'HW SEQUENCE',
      controls: [
        { type: 'toggle', key: 'hwSeqEnabled', label: 'ENABLED', labels: ['OFF', 'ON'] },
        { type: 'knob', key: 'hwSeqLen', label: 'SEQ LEN', color: '#34d399', min: 0, max: 64, defaultValue: 0, formatValue: fmtInt },
      ],
    },
  ],
};

// ============================================================================
// WAVETABLE SYNTH
// ============================================================================

const WAVE_SYNTH_EFFECT_NAMES = [
  'None', 'Invert', 'Add', 'Subtract', 'Average', 'Phase', 'Chorus',
];

/** Furnace Wavetable Synth panel — wave morphing / effects. */
export const FURNACE_WAVESYNTH_LAYOUT: SynthPanelLayout = {
  name: 'Wavetable Synth',
  configKey: 'ws',
  sections: [
    {
      label: 'WAVE SYNTH',
      controls: [
        { type: 'toggle', key: 'enabled', label: 'ENABLED', labels: ['OFF', 'ON'] },
        {
          type: 'select', key: 'effect', label: 'EFFECT',
          options: WAVE_SYNTH_EFFECT_NAMES.map((name, i) => ({ value: String(i), label: name })),
        },
      ],
    },
    {
      label: 'WAVES',
      columns: 2,
      controls: [
        { type: 'knob', key: 'wave1', label: 'WAVE 1', color: '#06b6d4', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
        { type: 'knob', key: 'wave2', label: 'WAVE 2', color: '#22d3ee', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
      ],
    },
    {
      label: 'PARAMETERS',
      columns: 4,
      controls: [
        { type: 'knob', key: 'speed', label: 'SPEED', color: '#67e8f9', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
        { type: 'knob', key: 'rateDivider', label: 'RATE', color: '#a5f3fc', min: 1, max: 255, defaultValue: 1, formatValue: fmtInt },
        { type: 'knob', key: 'param1', label: 'AMOUNT', color: '#0891b2', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
        { type: 'knob', key: 'param2', label: 'POWER', color: '#0e7490', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
      ],
    },
    {
      label: 'FLAGS',
      controls: [
        { type: 'toggle', key: 'global', label: 'GLOBAL', labels: ['OFF', 'ON'] },
        { type: 'toggle', key: 'oneShot', label: 'ONE-SHOT', labels: ['OFF', 'ON'] },
      ],
    },
  ],
};

// ============================================================================
// SID3
// ============================================================================

/** Furnace SID3 panel — full waveform, envelope, modulation, and filter controls. */
export const FURNACE_SID3_LAYOUT: SynthPanelLayout = {
  name: 'SID3',
  configKey: 'sid3',
  tabs: [
    {
      id: 'waveform',
      label: 'WAVEFORM',
      sections: [
        {
          label: 'OSCILLATOR',
          controls: [
            { type: 'toggle', key: 'triOn', label: 'TRI' },
            { type: 'toggle', key: 'sawOn', label: 'SAW' },
            { type: 'toggle', key: 'pulseOn', label: 'PULSE' },
            { type: 'toggle', key: 'noiseOn', label: 'NOISE' },
          ],
        },
        {
          label: 'MODULATION',
          controls: [
            { type: 'toggle', key: 'ringMod', label: 'RING' },
            { type: 'toggle', key: 'oscSync', label: 'SYNC' },
            { type: 'toggle', key: 'phaseMod', label: 'PHASE MOD' },
            { type: 'toggle', key: 'specialWaveOn', label: 'SPCL WAVE' },
            { type: 'toggle', key: 'resetDuty', label: 'RESET DUTY' },
            { type: 'toggle', key: 'oneBitNoise', label: '1-BIT NOISE' },
            { type: 'toggle', key: 'doWavetable', label: 'WAVETABLE' },
          ],
        },
      ],
    },
    {
      id: 'envelope',
      label: 'ENVELOPE',
      sections: [
        {
          label: 'ADSR + SR',
          columns: 5,
          controls: [
            { type: 'knob', key: 'a', label: 'A', color: '#8b5cf6', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'd', label: 'D', color: '#7c3aed', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 's', label: 'S', color: '#6d28d9', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'sr', label: 'SR', color: '#5b21b6', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'r', label: 'R', color: '#4c1d95', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
          ],
        },
      ],
    },
    {
      id: 'controls',
      label: 'CONTROLS',
      sections: [
        {
          label: 'VOICE',
          columns: 4,
          controls: [
            { type: 'knob', key: 'duty', label: 'DUTY', color: '#a78bfa', min: 0, max: 4095, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'mixMode', label: 'MIX', color: '#c4b5fd', min: 0, max: 3, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'feedback', label: 'FB', color: '#ddd6fe', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'phaseInv', label: 'PH INV', color: '#ede9fe', min: 0, max: 15, defaultValue: 0, formatValue: fmtInt },
          ],
        },
        {
          label: 'MOD SOURCES',
          columns: 4,
          controls: [
            { type: 'knob', key: 'phaseModSource', label: 'PM SRC', color: '#8b5cf6', min: 0, max: 7, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'ringModSource', label: 'RM SRC', color: '#7c3aed', min: 0, max: 7, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'syncSource', label: 'SYNC SRC', color: '#6d28d9', min: 0, max: 7, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'specialWave', label: 'SPCL WAVE', color: '#5b21b6', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
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
          columns: 5,
          controls: [
            { type: 'knob', key: 'filter_cutoff', label: 'CUT', color: '#a78bfa', min: 0, max: 65535, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'filter_resonance', label: 'RES', color: '#8b5cf6', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'filter_outputVolume', label: 'VOL', color: '#7c3aed', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'filter_distortion', label: 'DIST', color: '#6d28d9', min: 0, max: 255, defaultValue: 0, formatValue: fmtInt },
            { type: 'knob', key: 'filter_mode', label: 'MODE', color: '#5b21b6', min: 0, max: 15, defaultValue: 0, formatValue: fmtInt },
          ],
        },
        {
          label: 'FILTER FLAGS',
          controls: [
            { type: 'toggle', key: 'filter_enabled', label: 'ENABLED', labels: ['OFF', 'ON'] },
            { type: 'toggle', key: 'filter_absoluteCutoff', label: 'ABS CUT' },
          ],
        },
      ],
    },
  ],
};

// ============================================================================
// OPL DRUMS
// ============================================================================

/** Furnace OPL Drums panel — fixed drum frequency controls. */
export const FURNACE_OPL_DRUMS_LAYOUT: SynthPanelLayout = {
  name: 'OPL Drums',
  configKey: '',
  sections: [
    {
      label: 'OPL DRUMS',
      controls: [
        { type: 'toggle', key: 'fixedDrums', label: 'FIXED DRUMS', labels: ['OFF', 'ON'] },
        { type: 'knob', key: 'kickFreq', label: 'KICK', color: '#f59e0b', min: 0, max: 65535, defaultValue: 0, formatValue: fmtInt },
        { type: 'knob', key: 'snareHatFreq', label: 'SNARE/HAT', color: '#fbbf24', min: 0, max: 65535, defaultValue: 0, formatValue: fmtInt },
        { type: 'knob', key: 'tomTopFreq', label: 'TOM/TOP', color: '#d97706', min: 0, max: 65535, defaultValue: 0, formatValue: fmtInt },
      ],
    },
  ],
};
