/**
 * Note and volume tables for the 6809 PT3 core (public/vectrex/pt3core.asm), built the way S.V. Bulba's player INIT
 * builds them (public/zx/pt3player.asm: NT_DATA, T_PACK depack, TCOLD_/TCNEW_ corrections, volume table loop), so the
 * Vectrex cart plays the module with the ZX player's numbers. A clock other than the ZX 1773400 Hz scales every
 * note period (the Vectrex AY runs at 1.5 MHz); furnaceToPt3 is run with the same clock.
 */
export const ZX_PT3_CLOCK = 1773400;
export const VECTREX_AY_CLOCK = 1500000;

const BASE: Record<string, number[]> = {
  t0: [0xC22, 0xB73, 0xACF, 0xA33, 0x9A1, 0x917, 0x894, 0x819, 0x7A4, 0x737, 0x6CF, 0x66D],
  t1: [0xEF8, 0xE10, 0xD60, 0xC80, 0xBD8, 0xB28, 0xA88, 0x9F0, 0x960, 0x8E0, 0x858, 0x7E0],
  t2old: [0xD3E, 0xC80, 0xBCC, 0xB22, 0xA82, 0x9EC, 0x95C, 0x8D6, 0x858, 0x7E0, 0x76E, 0x704],
  t2new: [0xD10, 0xC55, 0xBA4, 0xAFC, 0xA5F, 0x9CA, 0x93D, 0x8B8, 0x83B, 0x7C5, 0x755, 0x6EC],
  t3: [0xCDA, 0xC22, 0xB73, 0xACF, 0xA33, 0x9A1, 0x917, 0x894, 0x819, 0x7A4, 0x737, 0x6CF],
};
const TCOLD_0 = [0x01, 0x05, 0x09, 0x0B, 0x0D, 0x0F, 0x13, 0x15, 0x19, 0x25, 0x3D];
const TCOLD_1 = [0x5D];
const TCOLD_2 = [0x31, 0x37, 0x4D, 0x53, 0x5F, 0x71, 0x82, 0x8C, 0x9C, 0x9E, 0xA0, 0xA6, 0xA8, 0xAA, 0xAC, 0xAE, 0xAE];
const TCOLD_3 = [0x1F, 0x23, 0x25, 0x29, 0x2D, 0x2F, 0x33, 0xBF];
const TCNEW_0 = [0x1D, 0x21, 0x23, 0x27, 0x2B, 0x2D, 0x31, 0x55, 0xBD, 0xBF];
const TCNEW_2 = [0x1B, 0x21, 0x25, 0x29, 0x2B, 0x3B, 0x4D, 0x5F, 0xBB, 0xBD, 0xBF];
const TCNEW_3 = [0x57, ...TCOLD_3];
/** NT_DATA order: NEW_0, OLD_0, NEW_1, OLD_1, NEW_2, OLD_2, NEW_3, OLD_3. */
const NT_DATA: Array<{ base: number[]; round: boolean; corr: number[] }> = [
  { base: BASE.t0, round: true, corr: TCNEW_0 },
  { base: BASE.t0, round: false, corr: TCOLD_0 },
  { base: BASE.t1, round: false, corr: TCOLD_1 },
  { base: BASE.t1, round: false, corr: TCOLD_1 },
  { base: BASE.t2new, round: true, corr: TCNEW_2 },
  { base: BASE.t2old, round: true, corr: TCOLD_2 },
  { base: BASE.t3, round: true, corr: TCNEW_3 },
  { base: BASE.t3, round: true, corr: TCOLD_3 },
];

/** Header version digit (byte 13), 6 when it is not a digit, as Bulba reads it. */
export function pt3Version(module: Uint8Array): number {
  const v = module[13] - 0x30;
  return v >= 0 && v <= 9 ? v : 6;
}

/** 96 note periods Bulba's player uses for this module (header table byte 99), scaled to clock. */
export function pt3NoteTable(module: Uint8Array, clock = ZX_PT3_CLOCK): number[] {
  const e = NT_DATA[(module[99] & 3) * 2 + (pt3Version(module) < 4 ? 1 : 0)];
  const nt: number[] = [];
  for (let o = 0; o < 8; o++) for (let i = 0; i < 12; i++) {
    const base = e.base[i] * 2;
    nt[o * 12 + i] = (base >> (o + 1)) + (e.round ? (base >> o) & 1 : 0);
  }
  if (e.corr === TCOLD_1) nt[23] = (nt[23] & 0xFF00) | 0xFD;
  for (const c of e.corr) {
    const k = c >> 1;
    nt[k] = (nt[k] & 0xFF00) | ((nt[k] + (c & 1 ? -1 : 1)) & 0xFF);
  }
  return clock === ZX_PT3_CLOCK ? nt : nt.map((p) => Math.max(1, Math.min(4095, Math.round(p * clock / ZX_PT3_CLOCK))));
}

/** 16x16 volume table (row = channel volume, column = sample amplitude) for this module's version. */
export function pt3VolumeTable(module: Uint8Array): Uint8Array {
  const vt = new Uint8Array(256);
  const newer = pt3Version(module) >= 5;
  const hl = newer ? 0x11 : 0x10;
  let de = newer ? 0 : 0x10;
  for (let r = 1; r < 16; r++) {
    de = (de + hl) & 0xFFFF;
    let acc = 0;
    for (let a = 0; a < 16; a++) {
      vt[r * 16 + a] = ((acc >> 8) + (newer && acc & 0x80 ? 1 : 0)) & 0xFF;
      acc = (acc + de) & 0xFFFF;
    }
    if ((de & 0xFF) === 0x77) de++;
  }
  return vt;
}
