/**
 * Volume maxima of the Furnace chips: PLATFORM_VOL_MAX and the per-channel
 * rules must equal upstream DIV_CMD_GET_VOLMAX
 * (third-party/furnace-master/src/engine/platform/<file>:<line>, recorded
 * below). Platforms with per-channel maxima list their first-kind (FM) value
 * in the table; the per-channel values are asserted separately.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../FurnaceDispatchEngine', async (importActual) => {
  const actual = await importActual<typeof import('../FurnaceDispatchEngine')>();
  return { ...actual, FurnaceDispatchEngine: { getInstance: () => ({}) } };
});
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({ routeNativeEngineOutput: vi.fn() }) }));

import { PLATFORM_VOL_MAX, maxVolumeOfChannel } from '../FurnaceDispatchSynth';
import { FurnaceDispatchPlatform as P } from '../FurnaceDispatchEngine';

/** Platform name -> [upstream GET_VOLMAX value for the first channel, upstream file:line]. */
const UPSTREAM: Record<string, [number, string]> = {
  GB: [15, 'gb.cpp:589'],
  SMS: [15, 'sms.cpp:459'],
  NES: [15, 'nes.cpp:763'],
  AY: [15, 'ay.cpp:945'],
  C64_6581: [15, 'c64.cpp:589'],
  C64_8580: [15, 'c64.cpp:589'],
  SAA1099: [15, 'saa.cpp:316'],
  SCC: [15, 'scc.cpp:261'],
  SCC_PLUS: [15, 'scc.cpp:261'],
  VIC20: [15, 'vic20.cpp:255'],
  TIA: [15, 'tia.cpp:393'],
  POKEY: [15, 'pokey.cpp:391'],
  MMC5: [15, 'mmc5.cpp:321'],
  SWAN: [15, 'swan.cpp:546'],
  VRC6: [15, 'vrc6.cpp:446'],
  VBOY: [15, 'vb.cpp:453'],
  N163: [15, 'n163.cpp:495'],
  OPLL: [15, 'opll.cpp:954'],
  T6W28: [15, 't6w28.cpp:278'],
  NAMCO: [15, 'namcowsg.cpp:448'],
  NAMCO_15XX: [15, 'namcowsg.cpp:448'],
  NAMCO_CUS30: [15, 'namcowsg.cpp:448'],
  BUBSYS_WSG: [15, 'bubsyswsg.cpp:251'],
  X1_010: [15, 'x1_010.cpp:809'],
  K007232: [15, 'k007232.cpp:417'],
  POWERNOISE: [15, 'powernoise.cpp:383'],
  SID2: [15, 'sid2.cpp:456'],
  SUPERVISION: [15, 'supervision.cpp:392'],
  AY8930: [31, 'ay8930.cpp:762'],
  PCE: [31, 'pce.cpp:484'],
  SM8521: [31, 'sm8521.cpp:301'],
  ESFM: [63, 'esfm.cpp:986'],
  DAVE: [63, 'dave.cpp:484'],
  VERA: [63, 'vera.cpp:450'],
  OPL: [63, 'opl.cpp:2578'],
  OPL2: [63, 'opl.cpp:2578'],
  OPL3: [63, 'opl.cpp:2578'],
  OPL_DRUMS: [63, 'opl.cpp:2578'],
  OPL2_DRUMS: [63, 'opl.cpp:2578'],
  OPL3_DRUMS: [63, 'opl.cpp:2578'],
  OPL4: [63, 'opl.cpp:2578'],
  OPL4_DRUMS: [63, 'opl.cpp:2578'],
  Y8950: [63, 'opl.cpp:2578'],
  Y8950_DRUMS: [63, 'opl.cpp:2578'],
  FDS: [32, 'fds.cpp:398'],
  TED: [8, 'ted.cpp:238'],
  MSM6258: [8, 'msm6258.cpp:251'],
  MSM6295: [8, 'msm6295.cpp:239'],
  POKEMINI: [2, 'pokemini.cpp:249'],
  GBA_DMA: [2, 'gbadma.cpp:333'],
  SFX_BEEPER: [1, 'zxbeeper.cpp:220'],
  SFX_BEEPER_QUADTONE: [2, 'zxbeeperquadtone.cpp:301'],
  PCSPKR: [1, 'pcspkr.cpp:545'],
  PONG: [1, 'pong.cpp:176'],
  PV1000: [1, 'pv1000.cpp:190'],
  PET: [1, 'pet.cpp:235'],
  QSOUND: [255, 'qsound.cpp:609'],
  RF5C68: [255, 'rf5c68.cpp:296'],
  GA20: [255, 'ga20.cpp:344'],
  C140: [255, 'c140.cpp:457'],
  C219: [255, 'c140.cpp:457'],
  YMZ280B: [255, 'ymz280b.cpp:328'],
  BIFURCATOR: [255, 'bifurcator.cpp:264'],
  SID3: [255, 'sid3.cpp:1026'],
  GBA_MINMOD: [255, 'gbaminmod.cpp:518'],
  SNES: [127, 'snes.cpp:608'],
  NDS: [127, 'nds.cpp:436'],
  LYNX: [127, 'lynx.cpp:463'],
  GENESIS: [127, 'genesis.cpp:1567'],
  YM2612: [127, 'genesis.cpp:1567'],
  YM2612_EXT: [127, 'genesisext.cpp:421'],
  YM2612_DUALPCM: [127, 'genesis.cpp:1567'],
  YM2612_DUALPCM_EXT: [127, 'genesisext.cpp:421'],
  YM2612_CSM: [127, 'genesisext.cpp:421'],
  YM2151: [127, 'arcade.cpp:861'],
  TX81Z: [127, 'tx81z.cpp:1005'],
  ARCADE: [127, 'arcade.cpp:861'],
  YM2203: [127, 'ym2203.cpp:1171'],
  YM2203_EXT: [127, 'ym2203ext.cpp:375'],
  YM2203_CSM: [127, 'ym2203.cpp:1171'],
  YM2608: [127, 'ym2608.cpp:1648'],
  YM2608_EXT: [127, 'ym2608ext.cpp:410'],
  YM2608_CSM: [127, 'ym2608.cpp:1648'],
  YM2610_FULL: [127, 'ym2610.cpp:1591'],
  YM2610_FULL_EXT: [127, 'ym2610ext.cpp:406'],
  YM2610_CSM: [127, 'ym2610.cpp:1591'],
  YM2610B: [127, 'ym2610b.cpp:1660'],
  YM2610B_EXT: [127, 'ym2610bext.cpp:406'],
  YM2610B_CSM: [127, 'ym2610b.cpp:1660'],
  SEGAPCM: [127, 'segapcm.cpp:333'],
  K053260: [127, 'k053260.cpp:349'],
  MSM5232: [127, 'msm5232.cpp:299'],
  MULTIPCM: [127, 'multipcm.cpp:388'],
  SOUND_UNIT: [127, 'su.cpp:533'],
  AMIGA: [64, 'amiga.cpp:778'],};

describe('PLATFORM_VOL_MAX against upstream GET_VOLMAX', () => {
  it('has exactly the platforms recorded from upstream', () => {
    const ids = Object.keys(UPSTREAM).map((n) => (P as Record<string, number>)[n]);
    expect(ids.every((id) => id !== undefined)).toBe(true);
    expect(ids.map(String).sort()).toEqual(Object.keys(PLATFORM_VOL_MAX).sort());
  });

  it.each(Object.entries(UPSTREAM))('%s = %i (%s)', (name, [value]) => {
    expect(PLATFORM_VOL_MAX[(P as Record<string, number>)[name]]).toBe(value);
  });
});

describe('per-channel maxima against upstream GET_VOLMAX', () => {
  it('VRC6: saw (channel 2) 63, pulses 15 (vrc6.cpp:446-448)', () => {
    expect([0, 1, 2].map((c) => maxVolumeOfChannel(P.VRC6, c))).toEqual([15, 15, 63]);
  });

  it('VERA: PSG channels below 16 are 63, the PCM channel 15 (vera.cpp:450-455)', () => {
    expect([0, 15, 16].map((c) => maxVolumeOfChannel(P.VERA, c))).toEqual([63, 63, 15]);
  });

  it('OPL, OPL2, OPL3: FM 63 (opl.cpp:2582)', () => {
    for (const p of [P.OPL, P.OPL2, P.OPL3]) expect(maxVolumeOfChannel(p, 0)).toBe(63);
  });

  it('Y8950: FM 63, ADPCM channel (the 10th) 255 (opl.cpp:2580, 2582)', () => {
    expect([0, 8, 9].map((c) => maxVolumeOfChannel(P.Y8950, c))).toEqual([63, 63, 255]);
  });

  it('OPL4: FM 63, the 24 PCM channels from 18 on are 127 (opl.cpp:2579, 2582)', () => {
    expect([0, 17, 18, 41].map((c) => maxVolumeOfChannel(P.OPL4, c))).toEqual([63, 63, 127, 127]);
  });

  it('YM2610 keeps FM 127, SSG 15, ADPCM-A 31, ADPCM-B 255 (ym2610.cpp:1591-1595)', () => {
    expect([0, 4, 7, 13].map((c) => maxVolumeOfChannel(P.YM2610_FULL, c))).toEqual([127, 15, 31, 255]);
  });
});
