/**
 * amigaSynthLayouts.ts — Declarative layout descriptors for all Amiga synth formats.
 * Used by PixiAmigaSynthPanel to render GL-native instrument editors.
 */

import type { AmigaSynthLayout } from './PixiAmigaSynthPanel';

// ── SonicArranger ────────────────────────────────────────────────────────────

export const SONIC_ARRANGER_LAYOUT: AmigaSynthLayout = {
  formatName: 'Sonic Arranger',
  configKey: 'sonicArranger',
  sections: [
    { type: 'label', text: 'WAVEFORM' },
    { type: 'waveform', key: 'waveformData', label: 'WAVEFORM', maxLen: 128 },
    { type: 'knobs', label: 'VOLUME & TUNING', knobs: [
      { key: 'volume', label: 'Vol', min: 0, max: 64 },
      { key: 'fineTuning', label: 'Fine', min: -128, max: 127 },
      { key: 'waveformLength', label: 'WavLen', min: 1, max: 128 },
    ]},
    { type: 'barChart', key: 'adsrTable', label: 'ADSR ENVELOPE' },
    { type: 'knobs', knobs: [
      { key: 'adsrLength', label: 'Len', min: 0, max: 127 },
      { key: 'adsrRepeat', label: 'Rep', min: 0, max: 127 },
      { key: 'sustainPoint', label: 'Sus', min: 0, max: 127 },
      { key: 'sustainDelay', label: 'SDly', min: 0, max: 255 },
    ]},
    { type: 'barChart', key: 'amfTable', label: 'AMF (PITCH MODULATION)', signed: true },
    { type: 'knobs', knobs: [
      { key: 'amfLength', label: 'Len', min: 0, max: 127 },
      { key: 'amfRepeat', label: 'Rep', min: 0, max: 127 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibratoDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Speed', min: 0, max: 65535 },
      { key: 'vibratoLevel', label: 'Level', min: 0, max: 65535 },
    ]},
    { type: 'knobs', label: 'PORTAMENTO', knobs: [
      { key: 'portamentoSpeed', label: 'Speed', min: 0, max: 65535 },
    ]},
    { type: 'arpeggios', key: 'arpeggios' },
  ],
};

// ── InStereo! 2.0 ────────────────────────────────────────────────────────────

export const INSTEREO2_LAYOUT: AmigaSynthLayout = {
  formatName: 'InStereo! 2.0',
  configKey: 'inStereo2',
  sections: [
    { type: 'waveform', key: 'waveform1', label: 'WAVEFORM 1', maxLen: 256 },
    { type: 'waveform', key: 'waveform2', label: 'WAVEFORM 2', maxLen: 256, color: 0x00CC99 },
    { type: 'knobs', label: 'VOLUME & WAVEFORM', knobs: [
      { key: 'volume', label: 'Vol', min: 0, max: 64 },
      { key: 'waveformLength', label: 'WavLen', min: 2, max: 256 },
    ]},
    { type: 'barChart', key: 'adsrTable', label: 'ADSR ENVELOPE' },
    { type: 'knobs', knobs: [
      { key: 'adsrLength', label: 'Len', min: 0, max: 127 },
      { key: 'adsrRepeat', label: 'Rep', min: 0, max: 127 },
      { key: 'sustainPoint', label: 'Sus', min: 0, max: 127 },
      { key: 'sustainSpeed', label: 'SSpd', min: 0, max: 255 },
    ]},
    { type: 'barChart', key: 'lfoTable', label: 'LFO (PITCH MODULATION)', signed: true },
    { type: 'knobs', knobs: [
      { key: 'amfLength', label: 'Len', min: 0, max: 127 },
      { key: 'amfRepeat', label: 'Rep', min: 0, max: 127 },
    ]},
    { type: 'barChart', key: 'egTable', label: 'ENVELOPE GENERATOR' },
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibratoDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Speed', min: 0, max: 255 },
      { key: 'vibratoLevel', label: 'Level', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'PORTAMENTO', knobs: [
      { key: 'portamentoSpeed', label: 'Speed', min: 0, max: 255 },
    ]},
    { type: 'arpeggios', key: 'arpeggios' },
  ],
};

// ── SoundMon ─────────────────────────────────────────────────────────────────

export const SOUNDMON_LAYOUT: AmigaSynthLayout = {
  formatName: 'SoundMon II/III',
  configKey: 'soundMon',
  sections: [
    { type: 'waveform', key: 'wavePCM', label: 'WAVEFORM', maxLen: 64 },
    { type: 'knobs', label: 'OSCILLATOR', knobs: [
      { key: 'waveType', label: 'Wave', min: 0, max: 15 },
      { key: 'waveSpeed', label: 'Morph', min: 0, max: 15 },
    ]},
    { type: 'knobs', label: 'ADSR ENVELOPE', knobs: [
      { key: 'attackVolume', label: 'AtkVol', min: 0, max: 64 },
      { key: 'attackSpeed', label: 'AtkSpd', min: 0, max: 63 },
      { key: 'decayVolume', label: 'DecVol', min: 0, max: 64 },
      { key: 'decaySpeed', label: 'DecSpd', min: 0, max: 63 },
      { key: 'sustainVolume', label: 'SusVol', min: 0, max: 64 },
      { key: 'sustainLength', label: 'SusLen', min: 0, max: 255 },
      { key: 'releaseVolume', label: 'RelVol', min: 0, max: 64 },
      { key: 'releaseSpeed', label: 'RelSpd', min: 0, max: 63 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibratoDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'vibratoDepth', label: 'Depth', min: 0, max: 63 },
    ]},
    { type: 'knobs', label: 'PORTAMENTO', knobs: [
      { key: 'portamentoSpeed', label: 'Speed', min: 0, max: 63 },
    ]},
    { type: 'sequence', key: 'arpTable', label: 'ARPEGGIO (16 STEPS)', length: 16, min: -128, max: 127, signed: true },
    { type: 'knobs', knobs: [
      { key: 'arpSpeed', label: 'ArpSpd', min: 0, max: 15 },
    ]},
  ],
};

// ── SidMon ───────────────────────────────────────────────────────────────────

export const SIDMON_LAYOUT: AmigaSynthLayout = {
  formatName: 'SidMon II',
  configKey: 'sidMon',
  sections: [
    { type: 'knobs', label: 'OSCILLATOR', knobs: [
      { key: 'waveform', label: 'Wave', min: 0, max: 3 },
      { key: 'pulseWidth', label: 'PW', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'SID ADSR', knobs: [
      { key: 'attack', label: 'Atk', min: 0, max: 15 },
      { key: 'decay', label: 'Dec', min: 0, max: 15 },
      { key: 'sustain', label: 'Sus', min: 0, max: 15 },
      { key: 'release', label: 'Rel', min: 0, max: 15 },
    ]},
    { type: 'knobs', label: 'FILTER', knobs: [
      { key: 'filterCutoff', label: 'Cutoff', min: 0, max: 255 },
      { key: 'filterResonance', label: 'Reso', min: 0, max: 15 },
      { key: 'filterMode', label: 'Mode', min: 0, max: 2 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'vibDepth', label: 'Depth', min: 0, max: 63 },
    ]},
    { type: 'sequence', key: 'arpTable', label: 'ARPEGGIO (8 STEPS)', length: 8, min: -128, max: 127, signed: true },
    { type: 'knobs', knobs: [
      { key: 'arpSpeed', label: 'ArpSpd', min: 0, max: 15 },
    ]},
  ],
};

// ── SidMon 1.0 ───────────────────────────────────────────────────────────────

export const SIDMON1_LAYOUT: AmigaSynthLayout = {
  formatName: 'SidMon 1.0',
  configKey: 'sidMon1',
  sections: [
    { type: 'waveform', key: 'mainWave', label: 'MAIN WAVEFORM', maxLen: 32 },
    { type: 'waveform', key: 'phaseWave', label: 'PHASE WAVEFORM', maxLen: 32, color: 0x00CC99 },
    { type: 'knobs', label: 'ADSR ENVELOPE', knobs: [
      { key: 'attackSpeed', label: 'AtkSpd', min: 0, max: 15 },
      { key: 'attackMax', label: 'AtkMax', min: 0, max: 255 },
      { key: 'decaySpeed', label: 'DecSpd', min: 0, max: 15 },
      { key: 'decayMin', label: 'DecMin', min: 0, max: 255 },
      { key: 'sustain', label: 'Sus', min: 0, max: 255 },
      { key: 'releaseSpeed', label: 'RelSpd', min: 0, max: 15 },
      { key: 'releaseMin', label: 'RelMin', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'PHASE', knobs: [
      { key: 'phaseShift', label: 'Shift', min: 0, max: 255 },
      { key: 'phaseSpeed', label: 'Speed', min: 0, max: 15 },
    ]},
    { type: 'knobs', label: 'TUNING', knobs: [
      { key: 'finetune', label: 'Fine', min: 0, max: 15 },
      { key: 'pitchFall', label: 'Fall', min: -128, max: 127 },
    ]},
    { type: 'sequence', key: 'arpeggio', label: 'ARPEGGIO (16 STEPS)', length: 16, min: -128, max: 127, signed: true },
  ],
};

// ── Digital Mugician ─────────────────────────────────────────────────────────

export const DIGMUG_LAYOUT: AmigaSynthLayout = {
  formatName: 'Digital Mugician',
  configKey: 'digMug',
  sections: [
    { type: 'knobs', label: 'WAVETABLE BLEND', knobs: [
      { key: 'waveBlend', label: 'Blend', min: 0, max: 63 },
      { key: 'waveSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'volume', label: 'Vol', min: 0, max: 64 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'vibDepth', label: 'Depth', min: 0, max: 63 },
    ]},
    { type: 'sequence', key: 'arpTable', label: 'ARPEGGIO (8 STEPS)', length: 8, min: -128, max: 127, signed: true },
    { type: 'knobs', knobs: [
      { key: 'arpSpeed', label: 'ArpSpd', min: 0, max: 15 },
    ]},
  ],
};

// ── Future Composer ──────────────────────────────────────────────────────────

export const FC_LAYOUT: AmigaSynthLayout = {
  formatName: 'Future Composer',
  configKey: 'fc',
  sections: [
    { type: 'waveform', key: 'wavePCM', label: 'WAVEFORM', maxLen: 64 },
    { type: 'knobs', label: 'WAVEFORM', knobs: [
      { key: 'waveNumber', label: 'Wave#', min: 0, max: 46 },
      { key: 'synthSpeed', label: 'SynSpd', min: 0, max: 15 },
    ]},
    { type: 'knobs', label: 'ADSR ENVELOPE', knobs: [
      { key: 'atkLength', label: 'AtkLen', min: 0, max: 255 },
      { key: 'atkVolume', label: 'AtkVol', min: 0, max: 64 },
      { key: 'decLength', label: 'DecLen', min: 0, max: 255 },
      { key: 'decVolume', label: 'DecVol', min: 0, max: 64 },
      { key: 'sustVolume', label: 'SusVol', min: 0, max: 64 },
      { key: 'relLength', label: 'RelLen', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'vibDepth', label: 'Depth', min: 0, max: 63 },
    ]},
    { type: 'sequence', key: 'arpTable', label: 'ARPEGGIO (16 STEPS)', length: 16, min: -128, max: 127, signed: true },
  ],
};

// ── Fred Editor ──────────────────────────────────────────────────────────────

export const FRED_LAYOUT: AmigaSynthLayout = {
  formatName: 'Fred Editor',
  configKey: 'fred',
  sections: [
    { type: 'knobs', label: 'ADSR ENVELOPE', knobs: [
      { key: 'envelopeVol', label: 'EnvVol', min: 0, max: 64 },
      { key: 'attackSpeed', label: 'AtkSpd', min: 0, max: 64 },
      { key: 'attackVol', label: 'AtkVol', min: 0, max: 64 },
      { key: 'decaySpeed', label: 'DecSpd', min: 0, max: 64 },
      { key: 'decayVol', label: 'DecVol', min: 0, max: 64 },
      { key: 'sustainTime', label: 'SusTm', min: 0, max: 255 },
      { key: 'releaseSpeed', label: 'RelSpd', min: 0, max: 64 },
      { key: 'releaseVol', label: 'RelVol', min: 0, max: 64 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibratoDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'vibratoDepth', label: 'Depth', min: 0, max: 63 },
    ]},
    { type: 'knobs', label: 'PWM SYNTHESIS', knobs: [
      { key: 'pulseSpeed', label: 'PulSpd', min: 0, max: 63 },
      { key: 'pulseRateNeg', label: 'Neg', min: 0, max: 255 },
      { key: 'pulseRatePos', label: 'Pos', min: 0, max: 255 },
      { key: 'pulseDelay', label: 'Delay', min: 0, max: 255 },
    ]},
    { type: 'sequence', key: 'arpeggio', label: 'ARPEGGIO (16 STEPS)', length: 16, min: -128, max: 127, signed: true },
    { type: 'knobs', knobs: [
      { key: 'arpeggioLimit', label: 'Limit', min: 0, max: 15 },
      { key: 'arpeggioSpeed', label: 'Speed', min: 0, max: 63 },
    ]},
  ],
};

// ── TFMX ─────────────────────────────────────────────────────────────────────

export const TFMX_LAYOUT: AmigaSynthLayout = {
  formatName: 'TFMX',
  configKey: 'tfmx',
  sections: [
    { type: 'label', text: 'TFMX INSTRUMENT' },
    { type: 'knobs', label: 'METADATA', knobs: [
      { key: 'sndSeqsCount', label: 'SndSeqs', min: 0, max: 255 },
      { key: 'sampleCount', label: 'Samples', min: 0, max: 255 },
    ]},
  ],
};

// ── Hippel CoSo ──────────────────────────────────────────────────────────────

export const HIPPEL_COSO_LAYOUT: AmigaSynthLayout = {
  formatName: 'Hippel CoSo',
  configKey: 'hippelCoSo',
  sections: [
    { type: 'sequence', key: 'fseq', label: 'FREQUENCY SEQUENCE', length: 64, min: -127, max: 127, signed: true },
    { type: 'sequence', key: 'vseq', label: 'VOLUME SEQUENCE', length: 64, min: 0, max: 63 },
    { type: 'knobs', label: 'VOLUME', knobs: [
      { key: 'volSpeed', label: 'VolSpd', min: 0, max: 63 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibSpeed', label: 'Speed', min: 0, max: 63 },
      { key: 'vibDepth', label: 'Depth', min: 0, max: 63 },
      { key: 'vibDelay', label: 'Delay', min: 0, max: 255 },
    ]},
  ],
};

// ── Rob Hubbard ──────────────────────────────────────────────────────────────

export const ROB_HUBBARD_LAYOUT: AmigaSynthLayout = {
  formatName: 'Rob Hubbard',
  configKey: 'robHubbard',
  sections: [
    { type: 'waveform', key: 'sampleData', label: 'SAMPLE DATA' },
    { type: 'sequence', key: 'vibTable', label: 'VIBRATO TABLE', length: 64, min: -128, max: 127, signed: true },
    { type: 'knobs', label: 'PARAMETERS', knobs: [
      { key: 'sampleVolume', label: 'Vol', min: 0, max: 64 },
      { key: 'vibratoIdx', label: 'VibIdx', min: 0, max: 255 },
      { key: 'hiPos', label: 'HiPos', min: 0, max: 255 },
      { key: 'loPos', label: 'LoPos', min: 0, max: 255 },
      { key: 'divider', label: 'Div', min: 0, max: 255 },
      { key: 'relative', label: 'Rel', min: 0, max: 255 },
    ]},
  ],
};

// ── OctaMED ──────────────────────────────────────────────────────────────────

export const OCTAMED_LAYOUT: AmigaSynthLayout = {
  formatName: 'OctaMED Synth',
  configKey: 'octaMED',
  sections: [
    { type: 'barChart', key: 'voltbl', label: 'VOLUME TABLE (128 BYTES)' },
    { type: 'barChart', key: 'wftbl', label: 'WAVEFORM TABLE (128 BYTES)' },
    { type: 'knobs', label: 'PARAMETERS', knobs: [
      { key: 'volume', label: 'Vol', min: 0, max: 64 },
      { key: 'voltblSpeed', label: 'VolSpd', min: 0, max: 15 },
      { key: 'wfSpeed', label: 'WfSpd', min: 0, max: 15 },
      { key: 'vibratoSpeed', label: 'Vib', min: 0, max: 255 },
      { key: 'loopStart', label: 'Loop', min: 0, max: 127 },
      { key: 'loopLen', label: 'LpLen', min: 0, max: 255 },
    ]},
  ],
};

// ── David Whittaker ──────────────────────────────────────────────────────────

export const DAVID_WHITTAKER_LAYOUT: AmigaSynthLayout = {
  formatName: 'David Whittaker',
  configKey: 'davidWhittaker',
  sections: [
    { type: 'sequence', key: 'volseq', label: 'VOLUME SEQUENCE', length: 64, min: 0, max: 64 },
    { type: 'sequence', key: 'frqseq', label: 'FREQUENCY SEQUENCE', length: 64, min: -128, max: 127, signed: true },
    { type: 'knobs', label: 'PARAMETERS', knobs: [
      { key: 'defaultVolume', label: 'Vol', min: 0, max: 64 },
      { key: 'relative', label: 'Rel', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'VibSpd', min: 0, max: 63 },
      { key: 'vibratoDepth', label: 'VibDpt', min: 0, max: 63 },
    ]},
  ],
};

// ── Delta Music 1.0 ──────────────────────────────────────────────────────────

export const DELTA_MUSIC1_LAYOUT: AmigaSynthLayout = {
  formatName: 'Delta Music 1.0',
  configKey: 'deltaMusic1',
  sections: [
    { type: 'sequence', key: 'table', label: 'SOUND TABLE (48 BYTES)', length: 48, min: 0, max: 255 },
    { type: 'knobs', label: 'ADSR ENVELOPE', knobs: [
      { key: 'volume', label: 'Vol', min: 0, max: 64 },
      { key: 'attackStep', label: 'AtkStp', min: 0, max: 255 },
      { key: 'attackDelay', label: 'AtkDly', min: 0, max: 255 },
      { key: 'decayStep', label: 'DecStp', min: 0, max: 255 },
      { key: 'decayDelay', label: 'DecDly', min: 0, max: 255 },
      { key: 'sustain', label: 'Sus', min: 0, max: 255 },
      { key: 'releaseStep', label: 'RelStp', min: 0, max: 255 },
      { key: 'releaseDelay', label: 'RelDly', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'VIBRATO & BEND', knobs: [
      { key: 'vibratoWait', label: 'Wait', min: 0, max: 255 },
      { key: 'vibratoStep', label: 'Step', min: 0, max: 255 },
      { key: 'vibratoLength', label: 'Depth', min: 0, max: 255 },
      { key: 'bendRate', label: 'Bend', min: -128, max: 127 },
      { key: 'portamento', label: 'Porta', min: 0, max: 255 },
      { key: 'tableDelay', label: 'TblDly', min: 0, max: 255 },
    ]},
    { type: 'sequence', key: 'arpeggio', label: 'ARPEGGIO (8 STEPS)', length: 8, min: -128, max: 127, signed: true },
  ],
};

// ── Delta Music 2.0 ──────────────────────────────────────────────────────────

export const DELTA_MUSIC2_LAYOUT: AmigaSynthLayout = {
  formatName: 'Delta Music 2.0',
  configKey: 'deltaMusic2',
  sections: [
    { type: 'knobs', label: 'PITCH', knobs: [
      { key: 'pitchBend', label: 'Bend', min: 0, max: 65535 },
    ]},
    { type: 'label', text: 'VOLUME / VIBRATO ENVELOPES (5 STAGES EACH)' },
    { type: 'label', text: 'Volume and vibrato envelopes are shown in the DOM editor' },
  ],
};

// ── StarTrekker AM ───────────────────────────────────────────────────────────

export const STARTREKKER_AM_LAYOUT: AmigaSynthLayout = {
  formatName: 'StarTrekker AM',
  configKey: 'startrekkerAM',
  sections: [
    { type: 'select', key: 'waveform', label: 'WAVEFORM', options: [
      { value: 0, name: 'Sine' },
      { value: 1, name: 'Sawtooth' },
      { value: 2, name: 'Square' },
      { value: 3, name: 'Noise' },
    ]},
    { type: 'knobs', label: 'BASE', knobs: [
      { key: 'basePeriod', label: 'Period', min: 0, max: 65535 },
      { key: 'periodShift', label: 'Shift', min: 0, max: 15 },
    ]},
    { type: 'knobs', label: 'ATTACK', knobs: [
      { key: 'attackTarget', label: 'Target', min: -32768, max: 32767 },
      { key: 'attackRate', label: 'Rate', min: -32768, max: 32767 },
    ]},
    { type: 'knobs', label: 'ATTACK 2', knobs: [
      { key: 'attack2Target', label: 'Target', min: -32768, max: 32767 },
      { key: 'attack2Rate', label: 'Rate', min: -32768, max: 32767 },
    ]},
    { type: 'knobs', label: 'DECAY', knobs: [
      { key: 'decayTarget', label: 'Target', min: -32768, max: 32767 },
      { key: 'decayRate', label: 'Rate', min: -32768, max: 32767 },
    ]},
    { type: 'knobs', label: 'SUSTAIN / RELEASE', knobs: [
      { key: 'sustainCount', label: 'SusCnt', min: 0, max: 65535 },
      { key: 'releaseRate', label: 'RelRate', min: -32768, max: 32767 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibFreqStep', label: 'FrqStep', min: 0, max: 500 },
      { key: 'vibAmplitude', label: 'Amp', min: -32768, max: 32767 },
    ]},
  ],
};

// ── MusicLine ────────────────────────────────────────────────────────────────

export const MUSICLINE_LAYOUT: AmigaSynthLayout = {
  formatName: 'MusicLine Editor',
  configKey: 'mlSynthConfig',
  sections: [
    { type: 'label', text: 'MUSICLINE EDITOR INSTRUMENT' },
    { type: 'label', text: 'Wavetable synthesis — parameters shown in DOM editor' },
  ],
};

// ── Layout registry ──────────────────────────────────────────────────────────

// ── InStereo! 1.0 ────────────────────────────────────────────────────────────

export const INSTEREO1_LAYOUT: AmigaSynthLayout = {
  formatName: 'InStereo! 1.0',
  configKey: 'inStereo1',
  sections: [
    { type: 'waveform', key: 'waveform1', label: 'WAVEFORM', maxLen: 256 },
    { type: 'knobs', label: 'VOLUME & WAVEFORM', knobs: [
      { key: 'volume', label: 'Vol', min: 0, max: 64 },
      { key: 'waveformLength', label: 'WavLen', min: 2, max: 256 },
    ]},
    { type: 'barChart', key: 'adsrTable', label: 'ADSR ENVELOPE' },
    { type: 'knobs', knobs: [
      { key: 'adsrLength', label: 'Len', min: 0, max: 127 },
    ]},
    { type: 'barChart', key: 'egTable', label: 'EGC TABLE' },
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibratoDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Speed', min: 0, max: 255 },
      { key: 'vibratoLevel', label: 'Level', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'PORTAMENTO', knobs: [
      { key: 'portamentoSpeed', label: 'Speed', min: 0, max: 255 },
    ]},
  ],
};

// ── Steve Turner ─────────────────────────────────────────────────────────────

export const STEVE_TURNER_LAYOUT: AmigaSynthLayout = {
  formatName: 'Steve Turner',
  configKey: 'steveTurner',
  sections: [
    { type: 'knobs', label: 'ENVELOPE', knobs: [
      { key: 'initDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'env1Duration', label: 'Seg1Dur', min: 0, max: 255 },
      { key: 'env1Delta', label: 'Seg1Dlt', min: -128, max: 127 },
      { key: 'env2Duration', label: 'Seg2Dur', min: 0, max: 255 },
      { key: 'env2Delta', label: 'Seg2Dlt', min: -128, max: 127 },
      { key: 'decayDelta', label: 'Decay', min: -128, max: 127 },
    ]},
    { type: 'knobs', label: 'OSCILLATION', knobs: [
      { key: 'oscDelta', label: 'Delta', min: -128, max: 127 },
      { key: 'oscLoop', label: 'Loop', min: 0, max: 255 },
    ]},
    { type: 'knobs', label: 'VIBRATO', knobs: [
      { key: 'vibratoDelay', label: 'Delay', min: 0, max: 255 },
      { key: 'vibratoSpeed', label: 'Speed', min: 0, max: 255 },
      { key: 'vibratoMaxDepth', label: 'Depth', min: 0, max: 255 },
      { key: 'pitchShift', label: 'Shift', min: 0, max: 7 },
    ]},
    { type: 'knobs', label: 'MISC', knobs: [
      { key: 'priority', label: 'Prio', min: 0, max: 255 },
      { key: 'sampleIdx', label: 'Sample', min: 0, max: 29 },
      { key: 'chain', label: 'Chain', min: 0, max: 32 },
    ]},
  ],
};

/** Map synthType → layout descriptor */
export const AMIGA_SYNTH_LAYOUTS: Record<string, AmigaSynthLayout> = {
  SonicArrangerSynth: SONIC_ARRANGER_LAYOUT,
  InStereo2Synth: INSTEREO2_LAYOUT,
  InStereo1Synth: INSTEREO1_LAYOUT,
  SoundMonSynth: SOUNDMON_LAYOUT,
  SidMonSynth: SIDMON_LAYOUT,
  SidMon1Synth: SIDMON1_LAYOUT,
  DigMugSynth: DIGMUG_LAYOUT,
  FCSynth: FC_LAYOUT,
  FredSynth: FRED_LAYOUT,
  TFMXSynth: TFMX_LAYOUT,
  HippelCoSoSynth: HIPPEL_COSO_LAYOUT,
  RobHubbardSynth: ROB_HUBBARD_LAYOUT,
  SteveTurnerSynth: STEVE_TURNER_LAYOUT,
  OctaMEDSynth: OCTAMED_LAYOUT,
  DavidWhittakerSynth: DAVID_WHITTAKER_LAYOUT,
  DeltaMusic1Synth: DELTA_MUSIC1_LAYOUT,
  DeltaMusic2Synth: DELTA_MUSIC2_LAYOUT,
  StartrekkerAMSynth: STARTREKKER_AM_LAYOUT,
  MusicLineSynth: MUSICLINE_LAYOUT,
};
