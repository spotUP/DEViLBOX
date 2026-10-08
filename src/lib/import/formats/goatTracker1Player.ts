/**
 * GoatTracker 1.53 playroutine 1 ("standard"), as player1.bin sits unrelocated
 * at $1000 in goattrk.dat (GoatTracker v1.53, GPL, src/goattrk.dat entry
 * PLAYER1.BIN, 1373 bytes). The 1.53 packer (goattrk.c relocator()) copies this
 * image in front of the song data and rewrites only: the absolute operands of
 * 3-byte instructions (code at $1000+ becomes the start address, $40xx-$47xx
 * become the song-data tables), four hard-restart parameter slots (opcode $FF in
 * the source image) and bytes $20-$3F (author text). Everything else is byte
 * for byte this image, which lets GoatTracker1Sid.ts prove a SID is a 1.53
 * build instead of guessing at its layout.
 */

const PLAYER1_B64 =
  'TAYQTEAQjQsQCmkAjXQQYLjExMfE193jsxwhTSdKSkoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKX8SKX9SKAA' +
  '0AqpAPASIOsSTGAQzkcQrWEQGGkAjWEQqQCNFtSpAI0X1KkPKf+NGNSiAKkAMCydiRTudBCK0A6iFZ1IFMrQ+o0V1CDrEqkF' +
  'nYwU/wCdixSp/51PFJ14FExzEt6LFPAuEBO9jBTJArAJqEkBnYwUuQJHnYsUvEoU0BGE/bx1FLkYEI3REL12FEwcE0xTEb1z' +
  'FKgp+PADnXkUmCkHnXUUqLkQEI31EL10FJ12FEzjE714FDBSnXcUqf+deBSdZBS8eRS5AkDwEynwnWEUnQLUuQJAKQ+dYBSd' +
  'A9S5B0CdShS5AECdBdS9dRTJBvAGuQFAnQbUqQmdSRSdBNS5BkDwAyDrEkyIErxKFPBPuQBByQiwCt2IFPAI/ogU0D6dSRS5' +
  'AEIwBBh9dxQpf4X8uQFByf+QD7kBQvAMvHkUeQdAaf7QAsiYnUoUpPypAJ2IFLn9FJ1eFLmdFJ1fFL2LFP8A8GC9TxTJ/9AD' +
  'TJ8SvHkUuQNAKf7wNoX8vWEUSrASCmX8SL1gFGkAnWAU2QVATOcRCjjl/Ei9YBTpAJ1gFNkEQJ0D1GhpAJ1hFJ0C1ExzErxL' +
  'FNADnUsU/ksU0AP+TxRMcxK8ihS5AEWF/LkARoX9vE8UsfzIyWCQC8nAsNLpX41FErAPjUUSsfydcxTIsfyddBTIsfzJ//AB' +
  'mJ1PFKkAyV7wJLAnfU0UnXgUvXMUKQfJA/AYvHkUuQNASrAK/wCdBdT/AJ0G1Kn+nWQUvV4UnQDUvV8UnQHUvUkUPWQUnQTU' +
  '4A6wB4ppB6pMcxCp/410EGiF/WiF/GC8iRS5AEOF/LkARIX9vUwU8AbeTBRM5RK8ThSx/MjJ0JAdyeCwB+nPnUwUsO7J/5AG' +
  'sfyoTLoS6e+dTRRMuhKdihSYnU4U/k8UTHMSqLkAR/AVjWYQuQFHjWsQuQJH8AONYRCpAPAJuQJHjVwQuQFHjUcQmPADuQNH' +
  'jUsQYCA/FJBZID8UOLBxqCnwhfyYKQ+NOBO9iBQwCMkAkAXwAkn/GGkCnYgUSpAysE5MohG8dxTJAPBZID8Uuf0UOP1eFI2O' +
  'E7mdFP1fFI2SEzAhpf3NkhPQBaX8zY4TsDG9XhRl/J1eFL1fFGX9nV8UTKIRqQBl/KkAZf0QFDi9XhTl/J1eFL1fFOX9nV8U' +
  'TKIRqQCddhRMkRHw80wLFPAKvXgUEAW8ShTwR0z3EL14FDD4nXcUqf+deBRM9xAg6xJM9xCdBtRM9xAwDI2MFI2TFI2aFEz3' +
  'EMnv8AqwDil/nYwUTPcQ7kgUTPcQjW0QTPcQCr2IFEhpAckGkAKpAJ2IFGhKyQGQDdAHvXYUKQ8QDakAEAm9dhQpcEpKSkoY' +
  'fXcUqEyWEQom/Qom/YX8YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAA' +
  'CAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQICAgICAgIDAwMDAwQEBAQFBQUGBgYHBwgICQkKCgsM' +
  'DQ0ODxAREhMUFRcYGhsdHyAiJCcpKy4xNDc6PkFFSU5SV1xiaG51fIOLk5ylr7nE0N3q+P8XJzlLX3SKobrU8A4tTnGWvugU' +
  'Q3Sp4RxanOItfM8ohehSwTe0OcVa955PCtGjgm5ocYqz7jyeFaJGBNzQ4hRn3Xk8KUSNCLihxSjNuvF4U4caEHFCiU+bdOLw' +
  'pg4zIP8=';

export const PLAYER1_SIZE = 1373;

/** Instruction lengths by opcode: goattrk.c asmtable[] (the relocator's own table). */
const LEN1 = [0x08, 0x0a, 0x18, 0x28, 0x2a, 0x38, 0x40, 0x48, 0x4a, 0x58, 0x60, 0x68, 0x6a, 0x78, 0x88, 0x8a, 0x98, 0x9a, 0xa8, 0xaa, 0xb8, 0xba, 0xc8, 0xca, 0xd8, 0xe8, 0xea, 0xf8];
const LEN2 = [0x05, 0x06, 0x09, 0x10, 0x11, 0x15, 0x16, 0x21, 0x24, 0x25, 0x26, 0x29, 0x30, 0x31, 0x35, 0x36, 0x41, 0x45, 0x46, 0x49, 0x50, 0x51, 0x55, 0x56, 0x61, 0x65, 0x66, 0x69, 0x70, 0x71, 0x75, 0x76, 0x81, 0x84, 0x85, 0x86, 0x90, 0x91, 0x94, 0x95, 0x96, 0xa0, 0xa1, 0xa2, 0xa4, 0xa5, 0xa6, 0xa9, 0xb0, 0xb1, 0xb4, 0xb5, 0xb6, 0xc0, 0xc1, 0xc4, 0xc5, 0xc6, 0xc9, 0xd0, 0xd1, 0xd5, 0xd6, 0xe0, 0xe1, 0xe4, 0xe5, 0xe6, 0xe9, 0xf0, 0xf1, 0xf5, 0xf6, 0xff];
const LEN3 = [0x0d, 0x0e, 0x19, 0x1d, 0x1e, 0x20, 0x2c, 0x2d, 0x2e, 0x39, 0x3d, 0x3e, 0x4c, 0x4d, 0x4e, 0x59, 0x5d, 0x5e, 0x6c, 0x6d, 0x6e, 0x79, 0x7d, 0x7e, 0x8c, 0x8d, 0x8e, 0x99, 0x9d, 0xac, 0xad, 0xae, 0xb9, 0xbc, 0xbd, 0xbe, 0xcc, 0xcd, 0xce, 0xd9, 0xdd, 0xde, 0xec, 0xed, 0xee, 0xf9, 0xfd, 0xfe];

export const OPCODE_LENGTH: Record<number, number> = {};
for (const o of LEN1) OPCODE_LENGTH[o] = 1;
for (const o of LEN2) OPCODE_LENGTH[o] = 2;
for (const o of LEN3) OPCODE_LENGTH[o] = 3;

/** Placeholder opcode the packer fills with hard-restart parameters. */
export const HARD_RESTART_SLOT = 0xff;

export function gt153Player1(): Uint8Array {
  const bin = atob(PLAYER1_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
