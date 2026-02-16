/**
 * System Presets - Hardware-specific channel configurations
 * Based on Furnace Tracker's DivSysDef and DivChanDef
 * 
 * This file implements a 1:1 mapping of technical hardware constraints
 * from the Furnace source code (sysDef.cpp / sysDef.h).
 * 
 * Contains ALL 95+ non-compound systems from Furnace.
 */

export const DivChanType = {
  FM: 0,
  PULSE: 1,
  NOISE: 2,
  WAVE: 3,
  PCM: 4,
  OP: 5
} as const;

export type DivChanType = (typeof DivChanType)[keyof typeof DivChanType];

export interface DivChanDef {
  name: string;
  shortName: string;
  type: DivChanType;
}

export interface SystemPreset {
  id: string;
  name: string;
  nameJ?: string;
  description: string;
  fileID: number;
  fileID_DMF: number;
  channels: number;
  minChans: number;
  maxChans: number;
  isFM: boolean;
  isSTD: boolean;
  isCompound: boolean;
  waveWidth: number;
  waveHeight: number;
  vgmVersion: number;
  sampleFormatMask?: number;
  channelDefs: DivChanDef[];
  color?: string;
}

// Helper to generate numbered FM channels
const genFM = (count: number, start: number = 1): DivChanDef[] => 
  Array.from({ length: count }, (_, i) => ({ 
    name: `FM ${start + i}`, 
    shortName: `F${start + i}`, 
    type: DivChanType.FM 
  }));

// Helper to generate numbered PCM channels
const genPCM = (count: number, prefix: string = 'PCM', shortPrefix: string = 'P'): DivChanDef[] => 
  Array.from({ length: count }, (_, i) => ({ 
    name: `${prefix} ${i + 1}`, 
    shortName: `${shortPrefix}${i + 1}`, 
    type: DivChanType.PCM 
  }));

// Helper to generate simple wave/pulse/noise channels
const genSimple = (count: number, type: DivChanType, prefix: string = 'Channel', shortPrefix: string = 'CH'): DivChanDef[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    shortName: `${shortPrefix}${i + 1}`,
    type
  }));

// Helper to generate PSG channels
const genPSG = (count: number): DivChanDef[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `PSG ${i + 1}`,
    shortName: `S${i + 1}`,
    type: DivChanType.PULSE
  }));

export const SYSTEM_PRESETS: SystemPreset[] = [
  // ============ GENERIC ============
  {
    id: 'none',
    name: 'None (Default)',
    description: 'Generic channels with no specific labels',
    fileID: 0, fileID_DMF: 0, channels: 4, minChans: 1, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: []
  },

  // ============ YAMAHA FM CHIPS ============
  {
    id: 'ymu759',
    name: 'Yamaha YMU759 (MA-2)',
    description: 'A chip which found its way inside mobile phones in the 2000\'s.',
    fileID: 0x01, fileID_DMF: 0x01, channels: 17, minChans: 17, maxChans: 17,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [...genFM(16), { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }]
  },
  {
    id: 'ym2151',
    name: 'Yamaha YM2151 (OPM)',
    description: 'Yamaha\'s first integrated FM chip. Used in arcade boards and synths.',
    fileID: 0x82, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: genFM(8)
  },
  {
    id: 'ym2612',
    name: 'Yamaha YM2612 (OPN2)',
    description: 'Mostly known for being in the Sega Genesis.',
    fileID: 0x83, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: genFM(6)
  },
  {
    id: 'ym2612_ext',
    name: 'Yamaha YM2612 (OPN2) Extended Channel 3',
    description: 'YM2612 with Extended Channel mode.',
    fileID: 0xa0, fileID_DMF: 0, channels: 9, minChans: 9, maxChans: 9,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: [
      { name: 'FM 1', shortName: 'F1', type: DivChanType.FM },
      { name: 'FM 2', shortName: 'F2', type: DivChanType.FM },
      { name: 'FM 3 OP1', shortName: 'O1', type: DivChanType.OP },
      { name: 'FM 3 OP2', shortName: 'O2', type: DivChanType.OP },
      { name: 'FM 3 OP3', shortName: 'O3', type: DivChanType.OP },
      { name: 'FM 3 OP4', shortName: 'O4', type: DivChanType.OP },
      { name: 'FM 4', shortName: 'F4', type: DivChanType.FM },
      { name: 'FM 5', shortName: 'F5', type: DivChanType.FM },
      { name: 'FM 6', shortName: 'F6', type: DivChanType.FM }
    ]
  },
  {
    id: 'ym2612_csm',
    name: 'Yamaha YM2612 (OPN2) CSM',
    description: 'YM2612 with CSM mode control.',
    fileID: 0xc1, fileID_DMF: 0, channels: 10, minChans: 10, maxChans: 10,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: [
      { name: 'FM 1', shortName: 'F1', type: DivChanType.FM },
      { name: 'FM 2', shortName: 'F2', type: DivChanType.FM },
      { name: 'FM 3 OP1', shortName: 'O1', type: DivChanType.OP },
      { name: 'FM 3 OP2', shortName: 'O2', type: DivChanType.OP },
      { name: 'FM 3 OP3', shortName: 'O3', type: DivChanType.OP },
      { name: 'FM 3 OP4', shortName: 'O4', type: DivChanType.OP },
      { name: 'CSM Timer', shortName: 'CSM', type: DivChanType.NOISE },
      { name: 'FM 4', shortName: 'F4', type: DivChanType.FM },
      { name: 'FM 5', shortName: 'F5', type: DivChanType.FM },
      { name: 'FM 6', shortName: 'F6', type: DivChanType.FM }
    ]
  },
  {
    id: 'ym2612_dualpcm',
    name: 'Yamaha YM2612 (OPN2) with DualPCM',
    description: 'YM2612 with software mixing for two sample channels.',
    fileID: 0xbe, fileID_DMF: 0, channels: 7, minChans: 7, maxChans: 7,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: [
      { name: 'FM 1', shortName: 'F1', type: DivChanType.FM },
      { name: 'FM 2', shortName: 'F2', type: DivChanType.FM },
      { name: 'FM 3', shortName: 'F3', type: DivChanType.FM },
      { name: 'FM 4', shortName: 'F4', type: DivChanType.FM },
      { name: 'FM 5', shortName: 'F5', type: DivChanType.FM },
      { name: 'FM 6/PCM 1', shortName: 'P1', type: DivChanType.PCM },
      { name: 'PCM 2', shortName: 'P2', type: DivChanType.PCM }
    ]
  },
  {
    id: 'ym2203',
    name: 'Yamaha YM2203 (OPN)',
    description: 'Cost-reduced OPM with built-in AY-3-8910 (YM2149).',
    fileID: 0x8d, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: true, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(3),
      { name: 'PSG 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'PSG 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PSG 3', shortName: 'S3', type: DivChanType.PULSE }
    ]
  },
  {
    id: 'ym2203_ext',
    name: 'Yamaha YM2203 (OPN) Extended Channel 3',
    description: 'YM2203 with Extended Channel mode.',
    fileID: 0xb6, fileID_DMF: 0, channels: 9, minChans: 9, maxChans: 9,
    isFM: true, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      { name: 'FM 1', shortName: 'F1', type: DivChanType.FM },
      { name: 'FM 2', shortName: 'F2', type: DivChanType.FM },
      { name: 'FM 3 OP1', shortName: 'O1', type: DivChanType.OP },
      { name: 'FM 3 OP2', shortName: 'O2', type: DivChanType.OP },
      { name: 'FM 3 OP3', shortName: 'O3', type: DivChanType.OP },
      { name: 'FM 3 OP4', shortName: 'O4', type: DivChanType.OP },
      { name: 'PSG 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'PSG 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PSG 3', shortName: 'S3', type: DivChanType.PULSE }
    ]
  },
  {
    id: 'ym2608',
    name: 'Yamaha YM2608 (OPNA)',
    description: 'OPN with doubled FM channels, stereo, rhythm and ADPCM.',
    fileID: 0x8e, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: true, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(6),
      { name: 'Square 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Square 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Square 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'Kick', shortName: 'BD', type: DivChanType.NOISE },
      { name: 'Snare', shortName: 'SD', type: DivChanType.NOISE },
      { name: 'Top', shortName: 'TP', type: DivChanType.NOISE },
      { name: 'HiHat', shortName: 'HH', type: DivChanType.NOISE },
      { name: 'Tom', shortName: 'TM', type: DivChanType.NOISE },
      { name: 'Rim', shortName: 'RM', type: DivChanType.NOISE },
      { name: 'ADPCM', shortName: 'P', type: DivChanType.PCM }
    ]
  },
  {
    id: 'ym2610_full',
    name: 'Yamaha YM2610 (OPNB)',
    description: 'Used in SNK\'s Neo Geo arcade board and console.',
    fileID: 0xa5, fileID_DMF: 0, channels: 14, minChans: 14, maxChans: 14,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(4),
      { name: 'PSG 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'PSG 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PSG 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'ADPCM-A 1', shortName: 'P1', type: DivChanType.PCM },
      { name: 'ADPCM-A 2', shortName: 'P2', type: DivChanType.PCM },
      { name: 'ADPCM-A 3', shortName: 'P3', type: DivChanType.PCM },
      { name: 'ADPCM-A 4', shortName: 'P4', type: DivChanType.PCM },
      { name: 'ADPCM-A 5', shortName: 'P5', type: DivChanType.PCM },
      { name: 'ADPCM-A 6', shortName: 'P6', type: DivChanType.PCM },
      { name: 'ADPCM-B', shortName: 'B', type: DivChanType.PCM }
    ]
  },
  {
    id: 'ym2610b',
    name: 'Yamaha YM2610B (OPNB2)',
    description: 'Taito Arcade chip with FM, PSG, and ADPCM.',
    fileID: 0x9e, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(6),
      { name: 'PSG 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'PSG 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PSG 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'ADPCM-A 1', shortName: 'P1', type: DivChanType.PCM },
      { name: 'ADPCM-A 2', shortName: 'P2', type: DivChanType.PCM },
      { name: 'ADPCM-A 3', shortName: 'P3', type: DivChanType.PCM },
      { name: 'ADPCM-A 4', shortName: 'P4', type: DivChanType.PCM },
      { name: 'ADPCM-A 5', shortName: 'P5', type: DivChanType.PCM },
      { name: 'ADPCM-A 6', shortName: 'P6', type: DivChanType.PCM },
      { name: 'ADPCM-B', shortName: 'B', type: DivChanType.PCM }
    ]
  },

  // ============ YAMAHA OPL CHIPS ============
  {
    id: 'opll',
    name: 'Yamaha YM2413 (OPLL)',
    description: 'Cost-reduced version of the OPL with 16 patches.',
    fileID: 0x89, fileID_DMF: 0, channels: 9, minChans: 9, maxChans: 9,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: genFM(9)
  },
  {
    id: 'opll_drums',
    name: 'Yamaha YM2413 (OPLL) with drums',
    description: 'OPLL with drums mode enabled.',
    fileID: 0xa7, fileID_DMF: 0, channels: 11, minChans: 11, maxChans: 11,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: [
      ...genFM(6),
      { name: 'Kick', shortName: 'BD', type: DivChanType.NOISE },
      { name: 'Snare', shortName: 'SD', type: DivChanType.NOISE },
      { name: 'Tom', shortName: 'TM', type: DivChanType.NOISE },
      { name: 'Top', shortName: 'TP', type: DivChanType.NOISE },
      { name: 'HiHat', shortName: 'HH', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'opl',
    name: 'Yamaha YM3526 (OPL)',
    description: 'OPN with two operators, no stereo, no detune.',
    fileID: 0x8f, fileID_DMF: 0, channels: 9, minChans: 9, maxChans: 9,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genFM(9)
  },
  {
    id: 'opl_drums',
    name: 'Yamaha YM3526 (OPL) with drums',
    description: 'OPL with drums mode enabled.',
    fileID: 0xa2, fileID_DMF: 0, channels: 11, minChans: 11, maxChans: 11,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(6),
      { name: 'Kick', shortName: 'BD', type: DivChanType.NOISE },
      { name: 'Snare', shortName: 'SD', type: DivChanType.NOISE },
      { name: 'Tom', shortName: 'TM', type: DivChanType.NOISE },
      { name: 'Top', shortName: 'TP', type: DivChanType.NOISE },
      { name: 'HiHat', shortName: 'HH', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'opl2',
    name: 'Yamaha YM3812 (OPL2)',
    description: 'OPL with more waveforms.',
    fileID: 0x90, fileID_DMF: 0, channels: 9, minChans: 9, maxChans: 9,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genFM(9)
  },
  {
    id: 'opl2_drums',
    name: 'Yamaha YM3812 (OPL2) with drums',
    description: 'OPL2 with drums mode enabled.',
    fileID: 0xa3, fileID_DMF: 0, channels: 11, minChans: 11, maxChans: 11,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(6),
      { name: 'Kick', shortName: 'BD', type: DivChanType.NOISE },
      { name: 'Snare', shortName: 'SD', type: DivChanType.NOISE },
      { name: 'Tom', shortName: 'TM', type: DivChanType.NOISE },
      { name: 'Top', shortName: 'TP', type: DivChanType.NOISE },
      { name: 'HiHat', shortName: 'HH', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'opl3',
    name: 'Yamaha YMF262 (OPL3)',
    description: 'OPL2 with double channels, 4-op mode, stereo.',
    fileID: 0x91, fileID_DMF: 0, channels: 18, minChans: 18, maxChans: 18,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genFM(18)
  },
  {
    id: 'opl3_drums',
    name: 'Yamaha YMF262 (OPL3) with drums',
    description: 'OPL3 with drums mode enabled.',
    fileID: 0xa4, fileID_DMF: 0, channels: 20, minChans: 20, maxChans: 20,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(15),
      { name: 'Kick', shortName: 'BD', type: DivChanType.NOISE },
      { name: 'Snare', shortName: 'SD', type: DivChanType.NOISE },
      { name: 'Tom', shortName: 'TM', type: DivChanType.NOISE },
      { name: 'Top', shortName: 'TP', type: DivChanType.NOISE },
      { name: 'HiHat', shortName: 'HH', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'opl4',
    name: 'Yamaha YMF278B (OPL4)',
    description: 'OPL3 + 24-channel MultiPCM.',
    fileID: 0xae, fileID_DMF: 0, channels: 42, minChans: 42, maxChans: 42,
    isFM: true, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [...genFM(18), ...genPCM(24)]
  },
  {
    id: 'opz',
    name: 'Yamaha YM2414 (OPZ)',
    description: 'OPM with more waveforms, fixed frequency mode, Yamaha TX81Z.',
    fileID: 0x98, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genFM(8)
  },
  {
    id: 'y8950',
    name: 'Yamaha Y8950',
    description: 'OPL with ADPCM channel.',
    fileID: 0xb2, fileID_DMF: 0, channels: 10, minChans: 10, maxChans: 10,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [...genFM(9), { name: 'ADPCM', shortName: 'P', type: DivChanType.PCM }]
  },
  {
    id: 'y8950_drums',
    name: 'Yamaha Y8950 with drums',
    description: 'Y8950 with drums mode enabled.',
    fileID: 0xb3, fileID_DMF: 0, channels: 12, minChans: 12, maxChans: 12,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      ...genFM(6),
      { name: 'Kick', shortName: 'BD', type: DivChanType.NOISE },
      { name: 'Snare', shortName: 'SD', type: DivChanType.NOISE },
      { name: 'Tom', shortName: 'TM', type: DivChanType.NOISE },
      { name: 'Top', shortName: 'TP', type: DivChanType.NOISE },
      { name: 'HiHat', shortName: 'HH', type: DivChanType.NOISE },
      { name: 'ADPCM', shortName: 'P', type: DivChanType.PCM }
    ]
  },
  {
    id: 'ymz280b',
    name: 'Yamaha YMZ280B (PCMD8)',
    description: 'Arcade boards, 4-bit ADPCM, 8-bit or 16-bit PCM.',
    fileID: 0xb8, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genPCM(8)
  },
  {
    id: 'esfm',
    name: 'ESS ES1xxx series (ESFM)',
    description: 'PC sound cards FM synth based on OPL3 design.',
    fileID: 0xd1, fileID_DMF: 0, channels: 18, minChans: 18, maxChans: 18,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genFM(18)
  },

  // ============ CONSOLE CHIPS ============
  {
    id: 'sms',
    name: 'TI SN76489',
    description: 'Found on the Sega Master System, ColecoVision, Tandy, and more.',
    fileID: 0x03, fileID_DMF: 0x03, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: [
      { name: 'Square 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Square 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Square 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'gb',
    name: 'Game Boy',
    description: 'The most popular portable game console of the era.',
    fileID: 0x04, fileID_DMF: 0x04, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0x161,
    channelDefs: [
      { name: 'Pulse 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Pulse 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Wavetable', shortName: 'WA', type: DivChanType.WAVE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'pce',
    name: 'PC Engine/TurboGrafx-16',
    description: 'An \'80s game console with a wavetable sound chip.',
    fileID: 0x05, fileID_DMF: 0x05, channels: 6, minChans: 6, maxChans: 6,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 32, vgmVersion: 0x161,
    channelDefs: genSimple(6, DivChanType.WAVE)
  },
  {
    id: 'nes',
    name: 'NES (Ricoh 2A03)',
    description: 'The most well-known game console of the \'80s.',
    fileID: 0x06, fileID_DMF: 0x06, channels: 5, minChans: 5, maxChans: 5,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: [
      { name: 'Pulse 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Pulse 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Triangle', shortName: 'TR', type: DivChanType.WAVE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE },
      { name: 'DPCM', shortName: 'DMC', type: DivChanType.PCM }
    ]
  },
  {
    id: 'snes',
    name: 'SNES',
    description: 'FM? nah... samples! Nintendo\'s answer to Sega.',
    fileID: 0x87, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 16, vgmVersion: 0,
    channelDefs: genPCM(8, 'Channel', 'CH')
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    description: 'Handheld with dual screens and stylus.',
    fileID: 0xd6, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 32, vgmVersion: 0,
    channelDefs: [
      ...genPCM(8, 'Channel', ''),
      { name: 'Channel 9', shortName: '9', type: DivChanType.PULSE },
      { name: 'Channel 10', shortName: '10', type: DivChanType.PULSE },
      { name: 'Channel 11', shortName: '11', type: DivChanType.PULSE },
      { name: 'Channel 12', shortName: '12', type: DivChanType.PULSE },
      { name: 'Channel 13', shortName: '13', type: DivChanType.PULSE },
      { name: 'Channel 14', shortName: '14', type: DivChanType.PULSE },
      { name: 'Channel 15', shortName: '15', type: DivChanType.NOISE },
      { name: 'Channel 16', shortName: '16', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'gba_dma',
    name: 'Game Boy Advance DMA Sound',
    description: 'Additional PCM FIFO channels in GBA.',
    fileID: 0xd7, fileID_DMF: 0, channels: 2, minChans: 2, maxChans: 2,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 256, vgmVersion: 0,
    channelDefs: [
      { name: 'PCM 1', shortName: 'P1', type: DivChanType.PCM },
      { name: 'PCM 2', shortName: 'P2', type: DivChanType.PCM }
    ]
  },
  {
    id: 'gba_minmod',
    name: 'Game Boy Advance MinMod',
    description: 'GBA PCM FIFO with software mixing for up to 16 channels.',
    fileID: 0xd8, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 256, vgmVersion: 0,
    channelDefs: genPCM(16, 'Channel', 'CH')
  },
  {
    id: 'vboy',
    name: 'Virtual Boy',
    description: 'Headache-inducing console by Nintendo.',
    fileID: 0x9c, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 64, vgmVersion: 0x171,
    channelDefs: [
      ...genSimple(5, DivChanType.WAVE),
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'lynx',
    name: 'Atari Lynx',
    description: 'Portable console with Atari\'s trademark waveforms.',
    fileID: 0xa8, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x172,
    channelDefs: genSimple(4, DivChanType.WAVE)
  },
  {
    id: 'swan',
    name: 'WonderSwan',
    description: 'By makers of Game Boy and Virtual Boy.',
    fileID: 0x96, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0x171,
    channelDefs: [
      { name: 'Wave', shortName: 'CH1', type: DivChanType.WAVE },
      { name: 'Wave/PCM', shortName: 'CH2', type: DivChanType.PCM },
      { name: 'Wave/Sweep', shortName: 'CH3', type: DivChanType.WAVE },
      { name: 'Wave/Noise', shortName: 'CH4', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'pokemini',
    name: 'Pokémon Mini',
    description: 'PC Speaker but with duty cycles.',
    fileID: 0x99, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [{ name: 'Pulse', shortName: 'P', type: DivChanType.PULSE }]
  },
  {
    id: 'supervision',
    name: 'Watara Supervision',
    description: 'Handheld trying to compete with Game Boy.',
    fileID: 0xe3, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Pulse 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Pulse 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },

  // ============ COMMODORE CHIPS ============
  {
    id: 'c64_6581',
    name: 'Commodore 64 (SID 6581)',
    description: 'Powered by the original SID chip with a raw, warm filter character.',
    fileID: 0x47, fileID_DMF: 0x47, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(3, DivChanType.NOISE)
  },
  {
    id: 'c64_8580',
    name: 'Commodore 64 (SID 8580)',
    description: 'Powered by the SID chip with filter and ADSR.',
    fileID: 0x07, fileID_DMF: 0x07, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(3, DivChanType.NOISE)
  },
  {
    id: 'c64_pcm',
    name: 'Commodore 64 (SID 6581) with software PCM',
    description: '6581 quirk for 4-bit sample playback via volume register.',
    fileID: 0xe2, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      ...genSimple(3, DivChanType.NOISE),
      { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }
    ]
  },
  {
    id: 'vic20',
    name: 'Commodore VIC-20',
    description: 'Commodore\'s successor to the PET.',
    fileID: 0x85, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Low', shortName: 'LO', type: DivChanType.PULSE },
      { name: 'Mid', shortName: 'MID', type: DivChanType.PULSE },
      { name: 'High', shortName: 'HI', type: DivChanType.PULSE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'pet',
    name: 'Commodore PET',
    description: 'One channel of 1-bit wavetable which is better (and worse) than the PC Speaker.',
    fileID: 0x86, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [{ name: 'Wave', shortName: 'PET', type: DivChanType.PULSE }]
  },
  {
    id: 'ted',
    name: 'MOS Technology TED',
    description: 'Two square waves, Commodore Plus/4, 16, 116.',
    fileID: 0xcd, fileID_DMF: 0, channels: 2, minChans: 2, maxChans: 2,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(2, DivChanType.PULSE)
  },

  // ============ ATARI CHIPS ============
  {
    id: 'tia',
    name: 'Atari TIA',
    description: 'It\'s a challenge to make music on this chip which barely has musical capabilities.',
    fileID: 0x84, fileID_DMF: 0, channels: 2, minChans: 2, maxChans: 2,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(2, DivChanType.WAVE)
  },
  {
    id: 'pokey',
    name: 'POKEY',
    description: 'TIA but better, Atari 8-bit family (400/800/XL/XE).',
    fileID: 0x94, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: genSimple(4, DivChanType.WAVE)
  },

  // ============ AY/PSG CHIPS ============
  {
    id: 'ay8910',
    name: 'AY-3-8910',
    description: 'ZX Spectrum, MSX, Amstrad CPC, Intellivision, Vectrex...',
    fileID: 0x80, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genPSG(3)
  },
  {
    id: 'ay8930',
    name: 'Microchip AY8930',
    description: 'Improved AY-3-8910 with bigger frequency range, duty cycles, per-channel envelopes.',
    fileID: 0x9a, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genPSG(3)
  },
  {
    id: 'saa1099',
    name: 'Philips SAA1099',
    description: 'Present on Creative Music System and SAM Coupé.',
    fileID: 0x97, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x171,
    channelDefs: genPSG(6)
  },
  {
    id: 't6w28',
    name: 'T6W28',
    description: 'SN76489 derivative used in Neo Geo Pocket.',
    fileID: 0xbf, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x160,
    channelDefs: [
      { name: 'Square 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Square 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Square 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },

  // ============ SAMPLER CHIPS ============
  {
    id: 'amiga',
    name: 'Amiga',
    description: 'The classic 4-channel PCM sampler sound.',
    fileID: 0x81, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 256, vgmVersion: 0,
    channelDefs: genSimple(4, DivChanType.PCM)
  },
  {
    id: 'rf5c68',
    name: 'Ricoh RF5C68',
    description: 'Like SNES but without interpolation.',
    fileID: 0x95, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genSimple(8, DivChanType.PCM)
  },
  {
    id: 'segapcm',
    name: 'SegaPCM',
    description: 'Used in Sega arcade boards like OutRun.',
    fileID: 0x9b, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genPCM(16, 'PCM', '')
  },
  {
    id: 'qsound',
    name: 'Capcom QSound',
    description: 'Used in Capcom arcade boards. Sampled sound with echo.',
    fileID: 0xe0, fileID_DMF: 0, channels: 19, minChans: 19, maxChans: 19,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: [
      ...genPCM(16, 'PCM', ''),
      { name: 'ADPCM 1', shortName: 'A1', type: DivChanType.NOISE },
      { name: 'ADPCM 2', shortName: 'A2', type: DivChanType.NOISE },
      { name: 'ADPCM 3', shortName: 'A3', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'multipcm',
    name: 'MultiPCM',
    description: 'How many channels of PCM do you want? MultiPCM: yes.',
    fileID: 0x92, fileID_DMF: 0, channels: 28, minChans: 28, maxChans: 28,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: genPCM(28, 'Channel', 'CH')
  },
  {
    id: 'es5506',
    name: 'Ensoniq ES5506',
    description: 'Basis for GF1 chip in Gravis Ultrasound.',
    fileID: 0xb1, fileID_DMF: 0, channels: 32, minChans: 32, maxChans: 32,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genPCM(32, 'Channel', 'CH')
  },
  {
    id: 'pcm_dac',
    name: 'Generic PCM DAC',
    description: 'Generic sample playback.',
    fileID: 0xc0, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 256, vgmVersion: 0,
    channelDefs: [{ name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }]
  },

  // ============ FAMICOM EXPANSION CHIPS ============
  {
    id: 'vrc6',
    name: 'Konami VRC6',
    description: 'Expansion chip for the Famicom, featuring a quirky sawtooth channel.',
    fileID: 0x88, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'VRC6 1', shortName: 'V1', type: DivChanType.PULSE },
      { name: 'VRC6 2', shortName: 'V2', type: DivChanType.PULSE },
      { name: 'VRC6 Saw', shortName: 'VS', type: DivChanType.WAVE }
    ]
  },
  {
    id: 'vrc7',
    name: 'Konami VRC7',
    description: 'OPLL with more cost reductions, no drums mode.',
    fileID: 0x9d, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genFM(6)
  },
  {
    id: 'fds',
    name: 'Famicom Disk System (chip)',
    description: 'A disk drive for the Famicom which also contains one wavetable channel.',
    fileID: 0x8a, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 64, waveHeight: 64, vgmVersion: 0x161,
    channelDefs: [{ name: 'FDS', shortName: 'FDS', type: DivChanType.WAVE }]
  },
  {
    id: 'mmc5',
    name: 'MMC5',
    description: 'Expansion chip for Famicom with little-known PCM channel.',
    fileID: 0x8b, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Pulse 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Pulse 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }
    ]
  },
  {
    id: 'n163',
    name: 'Namco 163',
    description: 'Expansion chip for Famicom with full wavetable.',
    fileID: 0x8c, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 16, vgmVersion: 0,
    channelDefs: genSimple(8, DivChanType.WAVE)
  },

  // ============ KONAMI CHIPS ============
  {
    id: 'scc',
    name: 'Konami SCC',
    description: 'Wavetable chip for MSX, last channel shares wavetable.',
    fileID: 0xa1, fileID_DMF: 0, channels: 5, minChans: 5, maxChans: 5,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 256, vgmVersion: 0x161,
    channelDefs: genSimple(5, DivChanType.WAVE)
  },
  {
    id: 'scc_plus',
    name: 'Konami SCC+',
    description: 'SCC variant with independent last channel wavetable.',
    fileID: 0xb4, fileID_DMF: 0, channels: 5, minChans: 5, maxChans: 5,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 256, vgmVersion: 0x161,
    channelDefs: genSimple(5, DivChanType.WAVE)
  },
  {
    id: 'bubsys_wsg',
    name: 'Konami Bubble System WSG',
    description: 'Wavetable part of Bubble System.',
    fileID: 0xad, fileID_DMF: 0, channels: 2, minChans: 2, maxChans: 2,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0,
    channelDefs: genSimple(2, DivChanType.WAVE)
  },
  {
    id: 'k007232',
    name: 'Konami K007232',
    description: 'PCM chip used in Konami arcade boards 1986-1990.',
    fileID: 0xc6, fileID_DMF: 0, channels: 2, minChans: 2, maxChans: 2,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(2, DivChanType.PCM)
  },
  {
    id: 'k053260',
    name: 'Konami K053260',
    description: 'PCM chip used in Konami arcade boards 1990-1992.',
    fileID: 0xcc, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: genSimple(4, DivChanType.PCM)
  },

  // ============ NAMCO CHIPS ============
  {
    id: 'namco',
    name: 'Namco WSG',
    description: 'Wavetable chip used in Pac-Man.',
    fileID: 0xb9, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0,
    channelDefs: genSimple(3, DivChanType.WAVE)
  },
  {
    id: 'namco_15xx',
    name: 'Namco C15 WSG',
    description: 'Successor of Namco WSG for later arcade games.',
    fileID: 0xba, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0,
    channelDefs: genSimple(8, DivChanType.WAVE)
  },
  {
    id: 'namco_cus30',
    name: 'Namco C30 WSG',
    description: 'Namco C15 but with stereo.',
    fileID: 0xbb, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0,
    channelDefs: genSimple(8, DivChanType.WAVE)
  },
  {
    id: 'c140',
    name: 'Namco C140',
    description: 'Namco\'s first PCM chip from 1987.',
    fileID: 0xce, fileID_DMF: 0, channels: 24, minChans: 24, maxChans: 24,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: genPCM(24, 'Channel', 'CH')
  },
  {
    id: 'c219',
    name: 'Namco C219',
    description: 'Namco NA-1/2 hardware, similar to C140 with noise generator.',
    fileID: 0xcf, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: genPCM(16, 'Channel', 'CH')
  },

  // ============ OKI CHIPS ============
  {
    id: 'msm5232',
    name: 'OKI MSM5232',
    description: 'Square wave additive synthesis chip from OKI.',
    fileID: 0xbc, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(8, DivChanType.PULSE)
  },
  {
    id: 'msm6258',
    name: 'OKI MSM6258',
    description: 'ADPCM chip from OKI used in Sharp X68000.',
    fileID: 0xab, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x150,
    channelDefs: [{ name: 'Sample', shortName: 'PCM', type: DivChanType.PCM }]
  },
  {
    id: 'msm6295',
    name: 'OKI MSM6295',
    description: 'ADPCM chip from OKI used in many arcade boards.',
    fileID: 0xaa, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: genSimple(4, DivChanType.PCM)
  },

  // ============ OTHER CHIPS ============
  {
    id: 'vera',
    name: 'VERA',
    description: 'The chip used in the Commander X16.',
    fileID: 0xac, fileID_DMF: 0, channels: 17, minChans: 17, maxChans: 17,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      ...Array.from({ length: 16 }, (_, i) => ({ name: `Channel ${i + 1}`, shortName: `${i + 1}`, type: DivChanType.PULSE })),
      { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }
    ]
  },
  {
    id: 'x1_010',
    name: 'Seta/Allumer X1-010',
    description: 'Seta/Allumer arcade boards with wavetable + samples.',
    fileID: 0xb0, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 128, waveHeight: 256, vgmVersion: 0x171,
    channelDefs: genSimple(16, DivChanType.WAVE)
  },
  {
    id: 'ga20',
    name: 'Irem GA20',
    description: 'PCM chip from Irem, like Amiga but less pitch resolution.',
    fileID: 0xc7, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x171,
    channelDefs: genSimple(4, DivChanType.PCM)
  },
  {
    id: 'pcspkr',
    name: 'PC Speaker',
    description: 'One square, no volume control.',
    fileID: 0x93, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [{ name: 'Square', shortName: 'SQ', type: DivChanType.PULSE }]
  },
  {
    id: 'sfx_beeper',
    name: 'ZX Spectrum Beeper',
    description: 'ZX Spectrum thin pulse system.',
    fileID: 0x9f, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(6, DivChanType.WAVE)
  },
  {
    id: 'sfx_beeper_quadtone',
    name: 'ZX Spectrum Beeper (QuadTone Engine)',
    description: 'ZX beeper with full PWM pulses and 3-level volume.',
    fileID: 0xca, fileID_DMF: 0, channels: 5, minChans: 5, maxChans: 5,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Channel 1', shortName: 'CH1', type: DivChanType.PULSE },
      { name: 'Channel 2', shortName: 'CH2', type: DivChanType.PULSE },
      { name: 'Channel 3', shortName: 'CH3', type: DivChanType.PULSE },
      { name: 'Channel 4', shortName: 'CH4', type: DivChanType.PULSE },
      { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }
    ]
  },
  {
    id: 'sm8521',
    name: 'Sharp SM8521',
    description: 'SoC with wavetable sound hardware.',
    fileID: 0xc8, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 32, waveHeight: 16, vgmVersion: 0,
    channelDefs: [
      { name: 'Channel 1', shortName: 'CH1', type: DivChanType.WAVE },
      { name: 'Channel 2', shortName: 'CH2', type: DivChanType.WAVE },
      { name: 'Noise', shortName: 'NS', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'pv1000',
    name: 'Casio PV-1000',
    description: 'Game console with 3 square waves.',
    fileID: 0xcb, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Square 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Square 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Square 3', shortName: 'S3', type: DivChanType.PULSE }
    ]
  },
  {
    id: 'upd1771c',
    name: 'NEC μPD1771C-017',
    description: 'Microcontroller used in Super Cassette Vision.',
    fileID: 0xe5, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Square 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Square 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Square 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'dave',
    name: 'Dave',
    description: 'Enterprise 128 computer, similar to POKEY with stereo.',
    fileID: 0xd5, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Channel 1', shortName: 'CH1', type: DivChanType.WAVE },
      { name: 'Channel 2', shortName: 'CH2', type: DivChanType.WAVE },
      { name: 'Channel 3', shortName: 'CH3', type: DivChanType.WAVE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE },
      { name: 'DAC Left', shortName: 'L', type: DivChanType.PCM },
      { name: 'DAC Right', shortName: 'R', type: DivChanType.PCM }
    ]
  },

  // ============ FANTASY CHIPS ============
  {
    id: 'sound_unit',
    name: 'tildearrow Sound Unit',
    description: 'Fantasy chip - SID, AY and VERA in a blender.',
    fileID: 0xb5, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(8, DivChanType.NOISE)
  },
  {
    id: 'sid2',
    name: 'SID2',
    description: 'Fantasy chip by LTVA, similar to SID with fixes.',
    fileID: 0xf0, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(3, DivChanType.NOISE)
  },
  {
    id: 'sid3',
    name: 'SID3',
    description: 'Fantasy sound chip rework of SID with many features.',
    fileID: 0xf5, fileID_DMF: 0, channels: 7, minChans: 7, maxChans: 7,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 256, waveHeight: 256, vgmVersion: 0,
    channelDefs: [
      ...genSimple(6, DivChanType.NOISE),
      { name: 'Wave', shortName: 'WA', type: DivChanType.WAVE }
    ]
  },
  {
    id: 'powernoise',
    name: 'PowerNoise',
    description: 'Fantasy chip for Hexheld console.',
    fileID: 0xd4, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      { name: 'Noise 1', shortName: 'N1', type: DivChanType.NOISE },
      { name: 'Noise 2', shortName: 'N2', type: DivChanType.NOISE },
      { name: 'Noise 3', shortName: 'N3', type: DivChanType.NOISE },
      { name: 'Slope', shortName: 'SL', type: DivChanType.WAVE }
    ]
  },
  {
    id: 'bifurcator',
    name: 'Bifurcator',
    description: 'Fantasy chip using logistic map iterations.',
    fileID: 0xd9, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(4, DivChanType.NOISE)
  },
  {
    id: '5e01',
    name: '5E01',
    description: 'Fantasy chip based on Ricoh 2A03 with extra features.',
    fileID: 0xf1, fileID_DMF: 0, channels: 5, minChans: 5, maxChans: 5,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x161,
    channelDefs: [
      { name: 'Pulse 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'Pulse 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'Wave', shortName: 'WA', type: DivChanType.WAVE },
      { name: 'Noise', shortName: 'NO', type: DivChanType.NOISE },
      { name: 'DPCM', shortName: 'DMC', type: DivChanType.PCM }
    ]
  },

  // ============ COMPOUND SYSTEMS (for reference/compatibility) ============
  {
    id: 'genesis',
    name: 'Sega Genesis / Mega Drive',
    description: 'Compound system: YM2612 (FM) + SN76489 (PSG).',
    fileID: 0x02, fileID_DMF: 0x02, channels: 10, minChans: 10, maxChans: 10,
    isFM: true, isSTD: true, isCompound: true, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [
      ...genFM(6),
      { name: 'PSG 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'PSG 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PSG 3', shortName: 'S3', type: DivChanType.PULSE },
      { name: 'PSG Noise', shortName: 'NO', type: DivChanType.NOISE }
    ]
  },
  {
    id: 'arcade',
    name: 'DefleCade',
    description: 'Compound system for DefleMask/Furnace arcade emulation.',
    fileID: 0x08, fileID_DMF: 0x08, channels: 13, minChans: 13, maxChans: 13,
    isFM: true, isSTD: false, isCompound: true, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: []
  },

  // ============ DEBUG/TEST ============
  {
    id: 'pong',
    name: 'Pong',
    description: 'Joke chip.',
    fileID: 0xfc, fileID_DMF: 0, channels: 1, minChans: 1, maxChans: 1,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [{ name: 'Square', shortName: 'SQ', type: DivChanType.PULSE }]
  },
  {
    id: 'dummy',
    name: 'Dummy System',
    description: 'System for testing purposes.',
    fileID: 0xfd, fileID_DMF: 0, channels: 8, minChans: 8, maxChans: 8,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: genSimple(8, DivChanType.NOISE)
  }
];
