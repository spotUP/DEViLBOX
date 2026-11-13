/**
 * Compose BossGame (Konami Scramble, two AY-3-8910) songs in code: the NeoGeoSongBuilder cell
 * writer on the AY channel layout, built for exportFurnaceAyScramble (0x80 once for 1-3 channels,
 * twice for 4-6; 1789772 Hz; 58.3 Hz tick). The exporter's warnings are the lint.
 */
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import type { FurnaceConfig, FurnaceMacro } from '@/types/instrument';
import type { FurnaceModuleSong } from '../FurnaceModuleExporter';
import { FUR_AY_SCRAMBLE_BPM, FUR_AY_SCRAMBLE_TICK_HZ } from '../FurnaceExporter';
import { xmVolToFurnace } from '@/lib/import/furnaceEditorCells';
import { NeoGeoSongBuilder, INS_SSG, type NeoGeoPattern } from './neoGeoCompose';

/** Channel index of each voice. AY2 is the core (never interrupted); AY1 loses channels to sound effects. */
export const AY = { LEAD: 0, BASS: 1, DRUMS: 2, AY1_A: 3, AY1_B: 4, AY1_C: 5 } as const;
const AY_NAMES = ['AY2 A', 'AY2 B', 'AY2 C', 'AY1 A', 'AY1 B', 'AY1 C'];

/** Macro codes: volume 0-15, arpeggio, duty = noise period 0-31, wave = mixer bits (1 tone, 2 noise, 4 envelope),
 *  envelope shape (8 buzz, 12 saw) and envelope period. */
export const AY_MACRO = { VOL: 0, ARP: 1, NOISE: 2, MIXER: 3, ENV_SHAPE: 6, ENV_PERIOD: 16 } as const;

/** Sequence macro, optional loop step. */
export function ayMacro(code: number, data: number[], loop = -1): FurnaceMacro {
  return { code, type: 0, data, loop, release: -1, mode: 0, delay: 0, speed: 1 } as FurnaceMacro;
}

/** AY instrument body for ScrambleSongBuilder.addInstrument. */
export function ayInstrument(macros: FurnaceMacro[]): FurnaceConfig {
  return { ...DEFAULT_FURNACE, chipType: 6, divInsType: INS_SSG, operators: [], macros, opMacros: [] } as FurnaceConfig;
}

/** `vol` for put() that the exporter writes as AY volume `v` (0-15): the exporter scales the 0-127 column by 15/127. */
export function ayVol(v: number): number {
  for (let x = 0x10; x <= 0x50; x++) if (Math.round(xmVolToFurnace(x) * 15 / 127) === v) return xmVolToFurnace(x);
  throw new Error(`AY volume ${v} is outside 0-15`);
}

export class ScrambleSongBuilder extends NeoGeoSongBuilder {
  readonly channels: number;
  /** `channels` 6 = both chips (every game tune); 3 = one chip (sketches the one-chip compiler can read). */
  constructor(name: string, speed: number, rows: number, channels: 3 | 6 = 6) {
    super(name, speed, rows);
    this.channels = channels;
  }

  addInstrument(name: string, furnace: FurnaceConfig): number {
    const id = super.addInstrument(name, furnace);
    (this.instruments[id - 1] as { synthType: string }).synthType = 'FurnaceAY';
    return id;
  }

  // shortcut: put() problem lines still name the Neo Geo channel of the same index, rename when a spec trips on it
  pattern(from?: NeoGeoPattern): NeoGeoPattern {
    const p = super.pattern(from);
    p.pattern.channels.length = this.channels;
    p.pattern.channels.forEach((c, i) => { c.name = AY_NAMES[i]; });
    return p;
  }

  build(): FurnaceModuleSong {
    return { ...super.build(), hz: FUR_AY_SCRAMBLE_TICK_HZ, initialBPM: FUR_AY_SCRAMBLE_BPM, extendedFm: false };
  }
}
