/**
 * A Furnace chip's register stream in the form the upstream Furnace CLI's
 * .vgm export stores it, shared by the fixture generator
 * (tools/furnace-audit/vgm-register-fixture.ts) and the register lock-step
 * test (furnaceRegisterLockstep.test.ts).
 */
/** Register file of each VGM chip command; the platform address as the dispatch wrote it. */
export type ChipKind = 'opn' | 'psg' | 'gb' | 'pce' | 'nes';

/** One chip's writes, flat [addr, val, addr, val, ...]: frame 0 (the reset block plus the first tick) and every write after it. */
export interface ChipStream { frame0: number[]; writes: number[] }

export interface RegisterFixture {
  song: string;
  seconds: number;
  /** Per chip kind (KIND_OF_PLATFORM maps the song's platform types onto these). */
  chips: Partial<Record<ChipKind, ChipStream>>;
  reference: { rmsDb: number; peak: number; clipped: number };
  /** Sequencer commands Furnace's `-view commands` prints for ticks below commandTicks: [tick, chan, cmd, v1, v2]. */
  commands: number[][];
  /** seconds * 50: every tick of a 50 Hz song, the first `seconds` of a faster one. */
  commandTicks: number;
}

/** Commands compared tick for tick (`-view commands` prints them; a platform's macros do not emit them). */
export const LOCKSTEP_COMMANDS: Record<string, number> = {
  NOTE_ON: 0, NOTE_OFF: 1, INSTRUMENT: 4, PANNING: 10,
  HINT_VIBRATO: 14, HINT_PITCH: 17, HINT_ARPEGGIO: 18, HINT_PORTA: 21, HINT_LEGATO: 22,
};
/** `-view commands` lines ("   tick | chan: NAME(v1, v2)") below `ticks` as [tick, chan, cmd, v1, v2], sorted within each tick. */
export function parseCommandView(text: string, ticks: number): number[][] {
  const out: number[][] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+) \| (\d+): (\w+)\((-?\d+), (-?\d+)\)/.exec(line);
    if (!m) continue;
    const code = LOCKSTEP_COMMANDS[m[3]];
    const tick = Number(m[1]);
    if (code === undefined || tick >= ticks) continue;
    out.push([tick, Number(m[2]), code, Number(m[4]), Number(m[5])]);
  }
  return sortCommands(out);
}

export function sortCommands(c: number[][]): number[][] {
  return [...c].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
}

/** DivSystem ids of each kind (the platform types a song's chips are created with). */
export const KIND_OF_PLATFORM: Record<number, ChipKind> = {
  20: 'opn', 52: 'opn', 80: 'opn', 81: 'opn', 89: 'opn',
  4: 'psg', 6: 'gb', 7: 'pce', 8: 'nes',
};

/**
 * A dispatch write as the VGM stores it: YM2612 port in bit 8 (0x2a DAC data and the PSG port dropped -
 * Furnace's VGM export streams DAC data, the platform renders it), SN76489 data byte only (GG stereo as
 * address 1), others the low address byte. Pseudo writes (0xffff0000+, sample stream control) drop.
 */
export function normalizeWrite(kind: ChipKind, addr: number, val: number): [number, number] | null {
  if (addr < 0 || addr >= 0x10000) return null;
  if (kind === 'opn') {
    if ((addr >> 8) === 2 || (addr & 0x1ff) === 0x2a) return null;
    return [addr & 0x1ff, val];
  }
  if (kind === 'psg') return [addr === 1 ? 1 : 0, val];
  return [addr & 0xff, val];
}

