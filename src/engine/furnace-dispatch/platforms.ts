/** Furnace platform types (matching C++ DivSystem enum in sysDef.h) */
export const FurnaceDispatchPlatform = {
  // Core / Meta
  NULL: 0,
  YMU759: 1,
  DUMMY: 88,

  // Compound systems (generally use sub-components)
  GENESIS: 2,
  GENESIS_EXT: 3,
  SMS_OPLL: 5,
  ARCADE: 13,
  MSX2: 14,
  NES_VRC7: 9,
  NES_FDS: 10,

  // Console platforms
  SMS: 4,
  GB: 6,
  PCE: 7,
  NES: 8,
  SNES: 26,
  SWAN: 43,
  LYNX: 60,
  VBOY: 47,
  NDS: 103,
  POKEMINI: 45,
  TIA: 21,
  POKEY: 41,

  // Commodore
  C64_6581: 11,
  C64_8580: 12,
  PET: 25,
  VIC20: 24,
  TED: 97,
  C64_PCM: 112,

  // NES Expansion
  FDS: 29,
  MMC5: 30,
  N163: 31,
  VRC6: 27,
  VRC7: 48,

  // PSG Chips
  AY: 17, // Alias for AY8910
  AY8910: 17,
  AY8930: 23,
  SAA1099: 22,
  T6W28: 83,

  // Yamaha FM
  YM2612: 20,
  YM2612_EXT: 52,
  YM2612_DUALPCM: 80,
  YM2612_DUALPCM_EXT: 81,
  YM2612_CSM: 89,
  YM2151: 19,
  TX81Z: 44, // TX81Z uses OPZ chip
  OPZ: 44,
  YM2203: 32,
  YM2203_EXT: 33,
  YM2203_CSM: 92,
  YM2608: 34,
  YM2608_EXT: 35,
  YM2608_CSM: 93,
  YM2610: 57, // Alias for YM2610_FULL
  YM2610_EXT: 58, // Alias for YM2610_FULL_EXT
  YM2610_CRAP: 15,
  YM2610_CRAP_EXT: 16,
  YM2610_FULL: 57,
  YM2610_FULL_EXT: 58,
  YM2610_CSM: 90,
  YM2610B: 49,
  YM2610B_EXT: 63,
  YM2610B_CSM: 91,

  // OPL Family
  OPL: 36,
  OPL2: 37,
  OPL3: 38,
  OPL_DRUMS: 54,
  OPL2_DRUMS: 55,
  OPL3_DRUMS: 56,
  OPL4: 67,
  OPL4_DRUMS: 68,
  OPLL: 28,
  OPLL_DRUMS: 59,
  Y8950: 70,
  Y8950_DRUMS: 71,
  ESFM: 100,

  // Sample-based
  AMIGA: 18,
  SEGAPCM: 46,
  SEGAPCM_COMPAT: 64,
  MULTIPCM: 39,
  QSOUND: 61,
  RF5C68: 42,
  PCM_DAC: 86,
  ES5506: 69,
  K007232: 84,
  K053260: 96,
  GA20: 85,
  C140: 98,
  C219: 99,
  YMZ280B: 76,
  MSM6258: 75,
  MSM6295: 74,

  // Wavetable
  SCC: 53,
  SCC_PLUS: 72,
  NAMCO: 77,
  NAMCO_15XX: 78,
  NAMCO_CUS30: 79,
  BUBSYS_WSG: 66,
  X1_010: 65,
  VERA: 62,
  SOUND_UNIT: 73,

  // Other/Misc
  PCSPKR: 40,
  PONG: 87,
  PV1000: 95,
  MSM5232: 82,
  SM8521: 94,
  DAVE: 102,
  BIFURCATOR: 107,
  POWERNOISE: 101,

  // ZX Spectrum Beeper
  SFX_BEEPER: 50,
  SFX_BEEPER_QUADTONE: 51,

  // GBA
  GBA_DMA: 104,
  GBA_MINMOD: 105,

  // Enhanced/Experimental
  _5E01: 106, // Prefixed with _ since numeric start

  // SID variants
  SID2: 108,
  SID3: 111,

  // Watara Supervision
  SUPERVISION: 109,

  // UPD1771C
  UPD1771C: 110,
} as const;

export type FurnaceDispatchPlatform = typeof FurnaceDispatchPlatform[keyof typeof FurnaceDispatchPlatform];
