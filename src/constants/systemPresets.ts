/**
 * System Presets - Hardware-specific channel configurations
 * Based on Furnace Tracker's DivSysDef and DivChanDef
 * 
 * This file implements a 1:1 mapping of technical hardware constraints
 * from the Furnace source code (sysDef.cpp / sysDef.h).
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

/**
 * Helper to generate numbered FM channels
 */
const genFM = (count: number, start: number = 1): DivChanDef[] => 
  Array.from({ length: count }, (_, i) => ({ 
    name: `FM ${start + i}`, 
    shortName: `F${start + i}`, 
    type: DivChanType.FM 
  }));

/**
 * Helper to generate numbered PCM channels
 */
const genPCM = (count: number, prefix: string = 'PCM', shortPrefix: string = 'P'): DivChanDef[] => 
  Array.from({ length: count }, (_, i) => ({ 
    name: `${prefix} ${i + 1}`, 
    shortName: `${shortPrefix}${i + 1}`, 
    type: DivChanType.PCM 
  }));

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: 'none',
    name: 'None (Default)',
    description: 'Generic channels with no specific labels',
    fileID: 0, fileID_DMF: 0, channels: 4, minChans: 1, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: []
  },
  {
    id: 'ymu759',
    name: 'Yamaha YMU759 (MA-2)',
    description: 'A chip which found its way inside mobile phones in the 2000\'s.',
    fileID: 0x01, fileID_DMF: 0x01, channels: 17, minChans: 17, maxChans: 17,
    isFM: true, isSTD: false, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: [...genFM(16), { name: 'PCM', shortName: 'PCM', type: DivChanType.PCM }]
  },
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
    channelDefs: Array.from({ length: 6 }, (_, i) => ({ name: `Channel ${i + 1}`, shortName: `CH${i + 1}`, type: DivChanType.WAVE }))
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
    id: 'c64_8580',
    name: 'Commodore 64 (SID 8580)',
    description: 'Powered by the SID chip with filter and ADSR.',
    fileID: 0x07, fileID_DMF: 0x07, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: Array.from({ length: 3 }, (_, i) => ({ name: `Channel ${i + 1}`, shortName: `CH${i + 1}`, type: DivChanType.NOISE }))
  },
  {
    id: 'ay8910',
    name: 'AY-3-8910',
    description: 'ZX Spectrum, MSX, Amstrad CPC, Intellivision, Vectrex...',
    fileID: 0x80, fileID_DMF: 0, channels: 3, minChans: 3, maxChans: 3,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: [
      { name: 'PSG 1', shortName: 'S1', type: DivChanType.PULSE },
      { name: 'PSG 2', shortName: 'S2', type: DivChanType.PULSE },
      { name: 'PSG 3', shortName: 'S3', type: DivChanType.PULSE }
    ]
  },
  {
    id: 'amiga',
    name: 'Amiga',
    description: 'The classic 4-channel PCM sampler sound.',
    fileID: 0x81, fileID_DMF: 0, channels: 4, minChans: 4, maxChans: 4,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 256, vgmVersion: 0,
    channelDefs: Array.from({ length: 4 }, (_, i) => ({ name: `Channel ${i + 1}`, shortName: `CH${i + 1}`, type: DivChanType.PCM }))
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
    id: 'saa1099',
    name: 'Philips SAA1099',
    description: 'Present on Creative Music System and SAM Coupé.',
    fileID: 0x97, fileID_DMF: 0, channels: 6, minChans: 6, maxChans: 6,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x171,
    channelDefs: Array.from({ length: 6 }, (_, i) => ({ name: `PSG ${i + 1}`, shortName: `S${i + 1}`, type: DivChanType.PULSE }))
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
    id: 'segapcm',
    name: 'SegaPCM',
    description: 'Used in Sega arcade boards like OutRun.',
    fileID: 0x9b, fileID_DMF: 0, channels: 16, minChans: 16, maxChans: 16,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 0, waveHeight: 0, vgmVersion: 0x151,
    channelDefs: genPCM(16, 'PCM', '')
  },
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
    id: 'sid3',
    name: 'SID3',
    description: 'Fantasy sound chip rework of SID with many features.',
    fileID: 0xf5, fileID_DMF: 0, channels: 7, minChans: 7, maxChans: 7,
    isFM: false, isSTD: true, isCompound: false, waveWidth: 256, waveHeight: 256, vgmVersion: 0,
    channelDefs: [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `Channel ${i + 1}`, shortName: `CH${i + 1}`, type: DivChanType.NOISE })),
      { name: 'Wave', shortName: 'WA', type: DivChanType.WAVE }
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
    id: 'arcade',
    name: 'DefleCade',
    description: 'Compound system for DefleMask/Furnace arcade emulation.',
    fileID: 0x08, fileID_DMF: 0x08, channels: 13, minChans: 13, maxChans: 13,
    isFM: true, isSTD: false, isCompound: true, waveWidth: 0, waveHeight: 0, vgmVersion: 0,
    channelDefs: []
  }
];
