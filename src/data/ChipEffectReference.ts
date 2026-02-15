import { FurnaceChipType } from '../engine/chips/FurnaceChipEngine';

export interface ChipEffect {
  command: string;
  name: string;
  desc: string;
}

/**
 * Common FM effects shared by OPN (YM2203, YM2608, YM2610, YM2612) and OPM (YM2151)
 */
const FM_COMMON_EFFECTS: ChipEffect[] = [
  { command: '11xx', name: 'Feedback', desc: 'Set feedback level (0-7).' },
  { command: '12xx', name: 'Op1 Level', desc: 'Set level of operator 1 (0: max, 7F: min).' },
  { command: '13xx', name: 'Op2 Level', desc: 'Set level of operator 2 (0: max, 7F: min).' },
  { command: '14xx', name: 'Op3 Level', desc: 'Set level of operator 3 (0: max, 7F: min).' },
  { command: '15xx', name: 'Op4 Level', desc: 'Set level of operator 4 (0: max, 7F: min).' },
  { command: '16xy', name: 'Multiplier', desc: 'Set op multiplier (x: op 1-4, y: multiplier 0-F).' },
  { command: '19xx', name: 'Attack All', desc: 'Set attack rate for all operators (0-1F).' },
  { command: '1Axx', name: 'Attack Op1', desc: 'Set attack rate for op 1 (0-1F).' },
  { command: '1Bxx', name: 'Attack Op2', desc: 'Set attack rate for op 2 (0-1F).' },
  { command: '1Cxx', name: 'Attack Op3', desc: 'Set attack rate for op 3 (0-1F).' },
  { command: '1Dxx', name: 'Attack Op4', desc: 'Set attack rate for op 4 (0-1F).' },
  { command: '30xx', name: 'Hard Reset', desc: 'Toggle hard envelope reset on new notes.' },
  { command: '50xy', name: 'Set AM', desc: 'x: op 1-4 (0=all), y: AM on/off.' },
  { command: '51xy', name: 'Sustain Level', desc: 'x: op 1-4 (0=all), y: sustain level (0-F).' },
  { command: '52xy', name: 'Release Rate', desc: 'x: op 1-4 (0=all), y: release rate (0-F).' },
  { command: '53xy', name: 'Detune', desc: 'x: op 1-4 (0=all), y: detune (3 is center).' },
  { command: '54xy', name: 'Env Scale', desc: 'x: op 1-4 (0=all), y: envelope scale (0-3).' },
  { command: '56xx', name: 'Decay All', desc: 'Set decay rate for all operators (0-1F).' },
  { command: '61xx', name: 'Algorithm', desc: 'Set FM algorithm (0-7).' },
  { command: '62xx', name: 'LFO FMS', desc: 'Set LFO frequency modulation depth (0-7).' },
  { command: '63xx', name: 'LFO AMS', desc: 'Set LFO amplitude modulation depth (0-3).' },
];

/**
 * Common OPL effects (YM3526, YM3812, YMF262)
 */
const OPL_COMMON_EFFECTS: ChipEffect[] = [
  { command: '10xx', name: 'AM Depth', desc: 'Global AM depth (0: 1dB, 1: 4.8dB).' },
  { command: '11xx', name: 'Feedback', desc: 'Set feedback level (0-7).' },
  { command: '12xx', name: 'Op1 Level', desc: 'Set level of operator 1 (0: max, 3F: min).' },
  { command: '13xx', name: 'Op2 Level', desc: 'Set level of operator 2 (0: max, 3F: min).' },
  { command: '14xx', name: 'Op3 Level', desc: 'Set level of operator 3 (0: max, 3F: min, OPL3 only).' },
  { command: '15xx', name: 'Op4 Level', desc: 'Set level of operator 4 (0: max, 3F: min, OPL3 only).' },
  { command: '19xx', name: 'Attack All', desc: 'Set attack rate for all operators (0-F).' },
  { command: '2Axy', name: 'Waveform', desc: 'x: op 1-4 (0=all), y: waveform (0-3 in OPL2, 0-7 in OPL3).' },
  { command: '30xx', name: 'Hard Reset', desc: 'Toggle hard envelope reset on new notes.' },
  { command: '50xy', name: 'Set AM', desc: 'x: op 1-4 (0=all), y: AM on/off.' },
  { command: '51xy', name: 'Sustain Level', desc: 'x: op 1-4 (0=all), y: sustain level (0-F).' },
  { command: '52xy', name: 'Release Rate', desc: 'x: op 1-4 (0=all), y: release rate (0-F).' },
  { command: '53xy', name: 'Set Vibrato', desc: 'x: op 1-4 (0=all), y: enabled.' },
  { command: '54xy', name: 'Env Scale', desc: 'x: op 1-4 (0=all), y: scale (0-3).' },
  { command: '5Bxy', name: 'KSR', desc: 'Key scale rate. x: op 1-4 (0=all), y: enabled.' },
];

/**
 * NES Effects
 */
const NES_EFFECTS: ChipEffect[] = [
  { command: '11xx', name: 'DMC Counter', desc: 'Write to delta modulation counter (00-7F).' },
  { command: '12xx', name: 'Duty/Noise', desc: 'Pulse: 0-3 (12.5%, 25%, 50%, 75%). Noise: 0 (long), 1 (short).' },
  { command: '13xy', name: 'Sweep Up', desc: 'x: time, y: shift.' },
  { command: '14xy', name: 'Sweep Down', desc: 'x: time, y: shift.' },
  { command: '15xx', name: 'Env Mode', desc: '0: env, 1: length, 2: looping, 3: constant.' },
  { command: '16xx', name: 'Length', desc: 'Set length counter (see manual table).' },
  { command: '17xx', name: 'Frame Mode', desc: '0: 4-step, 1: 5-step.' },
  { command: '18xx', name: 'Sample Mode', desc: '0: PCM, 1: DPCM.' },
  { command: '19xx', name: 'Linear Counter', desc: 'Triangle linear counter (00-7F), 80+ halts.' },
  { command: '20xx', name: 'DPCM Freq', desc: 'Set DPCM frequency (0-F).' },
];

/**
 * SID Effects
 */
const SID_EFFECTS: ChipEffect[] = [
  { command: '10xx', name: 'Waveform', desc: '01: Tri, 02: Saw, 04: Pulse, 08: Noise. Combinable.' },
  { command: '11xx', name: 'Coarse Cutoff', desc: '00-64. (Discouraged, use 4xxx).' },
  { command: '12xx', name: 'Coarse Duty', desc: '00-64. (Discouraged, use 3xxx).' },
  { command: '13xx', name: 'Resonance', desc: 'Set resonance (0-F).' },
  { command: '14xx', name: 'Filter Mode', desc: '0: off, 1: LP, 2: BP, 4: HP. Combinable.' },
  { command: '15xx', name: 'Env Reset', desc: 'Envelope reset time in ticks.' },
  { command: '1Axx', name: 'No Env Reset', desc: 'Disable envelope reset for this channel.' },
  { command: '20xy', name: 'Set AD', desc: 'Attack (x) and Decay (y) (0-F).' },
  { command: '21xy', name: 'Set SR', desc: 'Sustain (x) and Release (y) (0-F).' },
  { command: '22xx', name: 'PW Slide Up', desc: 'Pulse width slide up speed.' },
  { command: '23xx', name: 'PW Slide Dn', desc: 'Pulse width slide down speed.' },
  { command: '24xx', name: 'Cutoff Up', desc: 'Filter cutoff slide up speed.' },
  { command: '25xx', name: 'Cutoff Dn', desc: 'Filter cutoff slide down speed.' },
  { command: '3xxx', name: 'Set Duty', desc: 'Set pulse width (000-FFF).' },
  { command: '4xxx', name: 'Set Cutoff', desc: 'Set filter cutoff (000-7FF).' },
];

export const CHIP_EFFECT_REFERENCE: Record<number, ChipEffect[]> = {
  // === NES Family ===
  [FurnaceChipType.NES]: NES_EFFECTS,
  [FurnaceChipType.MMC5]: NES_EFFECTS,
  [FurnaceChipType.VRC6]: [
    ...NES_EFFECTS,
    { command: '12xx', name: 'Duty Cycle', desc: 'Pulse duty cycle (0-7).' },
  ],

  // === GAME BOY ===
  [FurnaceChipType.GB]: [
    { command: '10xx', name: 'Set Wave', desc: 'Set waveform index.' },
    { command: '11xx', name: 'Noise Length', desc: '0: long, 1: short.' },
    { command: '12xx', name: 'Duty Cycle', desc: '0-3 (12.5%, 25%, 50%, 75%).' },
    { command: '13xy', name: 'Sweep Setup', desc: 'x: time, y: shift.' },
    { command: '14xx', name: 'Sweep Dir', desc: '0: up, 1: down.' },
  ],

  // === SID Family ===
  [FurnaceChipType.SID]: SID_EFFECTS,
  [FurnaceChipType.SID_6581]: SID_EFFECTS,
  [FurnaceChipType.SID_8580]: SID_EFFECTS,

  // === SNES ===
  [FurnaceChipType.SNES]: [
    { command: '10xx', name: 'Waveform', desc: 'Set sample index.' },
    { command: '12xx', name: 'Echo Toggle', desc: 'Toggle echo for this channel.' },
    { command: '13xx', name: 'Pitch Mod', desc: 'Toggle pitch modulation for this channel.' },
    { command: '15xx', name: 'Env Mode', desc: '0: ADSR, 1: direct, 2: dec, 3: exp, 4: inc, 5: bent.' },
    { command: '16xx', name: 'Set Gain', desc: '00-7F (direct) or 00-1F (others).' },
    { command: '18xx', name: 'Echo Buffer', desc: 'Enable echo buffer.' },
    { command: '19xx', name: 'Echo Delay', desc: 'Set echo delay (0-F).' },
    { command: '1Cxx', name: 'Echo FB', desc: 'Set echo feedback.' },
    { command: '1Dxx', name: 'Noise Freq', desc: 'Set noise frequency (00-1F).' },
    { command: '20xx', name: 'Set Attack', desc: 'Attack rate (0-F).' },
    { command: '21xx', name: 'Set Decay', desc: 'Decay rate (0-7).' },
    { command: '22xx', name: 'Set Sustain', desc: 'Sustain level (0-7).' },
    { command: '23xx', name: 'Set Release', desc: 'Release rate (00-1F).' },
  ],

  // === AMIGA ===
  [FurnaceChipType.AMIGA]: [
    { command: '10xx', name: 'Filter Toggle', desc: '0: off, 1: on (Amiga LED filter).' },
    { command: '11xx', name: 'Toggle AM', desc: 'Toggle amplitude modulation with next channel.' },
    { command: '12xx', name: 'Toggle PM', desc: 'Toggle period modulation with next channel.' },
    { command: '13xx', name: 'Set Wave', desc: 'Set waveform index.' },
  ],

  // === PCE ===
  [FurnaceChipType.PCE]: [
    { command: '10xx', name: 'Set Wave', desc: 'Set waveform index.' },
    { command: '11xx', name: 'Noise Toggle', desc: 'Toggle noise mode.' },
    { command: '12xx', name: 'LFO Setup', desc: '0: off, 1: 1x, 2: 16x, 3: 256x depth.' },
    { command: '13xx', name: 'LFO Speed', desc: 'Set LFO speed.' },
  ],

  // === POKEY ===
  [FurnaceChipType.POKEY]: [
    { command: '10xx', name: 'Waveform', desc: 'Set waveform (0-7).' },
    { command: '11xx', name: 'AUDCTL', desc: 'Set AUDCTL register bits.' },
    { command: '12xx', name: 'Two-Tone', desc: 'Toggle two-tone mode.' },
  ],

  // === FM Systems ===
  [FurnaceChipType.OPN]: FM_COMMON_EFFECTS,
  [FurnaceChipType.OPN2]: FM_COMMON_EFFECTS,
  [FurnaceChipType.OPM]: [
    ...FM_COMMON_EFFECTS,
    { command: '10xx', name: 'Noise Freq', desc: 'Set noise frequency (0: off).' },
    { command: '17xx', name: 'LFO Speed', desc: 'Set LFO speed.' },
    { command: '18xx', name: 'LFO Wave', desc: '0: saw, 1: sq, 2: tri, 3: noise.' },
    { command: '1Exx', name: 'AM Depth', desc: 'Set LFO AM depth (00-7F).' },
    { command: '1Fxx', name: 'PM Depth', desc: 'Set LFO PM depth (00-7F).' },
  ],
  [FurnaceChipType.OPNA]: [
    ...FM_COMMON_EFFECTS,
    { command: '1Fxx', name: 'ADPCM-A Vol', desc: 'Set ADPCM-A global volume (00-3F).' },
  ],
  [FurnaceChipType.OPNB]: FM_COMMON_EFFECTS,
  [FurnaceChipType.OPNB_B]: FM_COMMON_EFFECTS,
  [FurnaceChipType.OPZ]: [
    ...FM_COMMON_EFFECTS,
    { command: '2Fxx', name: 'Hard Reset', desc: 'Toggle hard envelope reset.' },
    { command: '2Axy', name: 'Waveform', desc: 'x: op 1-4 (0=all), y: wave 0-7.' },
  ],
  [FurnaceChipType.OPLL]: [
    { command: '10xx', name: 'Set Patch', desc: 'Select preset patch (0-F).' },
    { command: '11xx', name: 'Feedback', desc: 'Set feedback level (0-7).' },
    { command: '12xx', name: 'Op1 Level', desc: 'Set Op1 level (00-3F).' },
    { command: '13xx', name: 'Op2 Level', desc: 'Set Op2 level (0-F).' },
    { command: '16xy', name: 'Multiplier', desc: 'x: op 1-2, y: multiplier.' },
  ],

  // === OPL Systems ===
  [FurnaceChipType.OPL3]: OPL_COMMON_EFFECTS,
  [FurnaceChipType.OPL4]: OPL_COMMON_EFFECTS,
  [FurnaceChipType.Y8950]: OPL_COMMON_EFFECTS,
  [FurnaceChipType.ESFM]: OPL_COMMON_EFFECTS,
};
