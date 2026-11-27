import { describe, it, expect } from 'vitest';
import { noteEnvStep, noteEnvByte } from '../husicSong';

const semi = (nb: number) => (nb >> 4) * 12 + (((nb & 15) + 3) & 15) - 3; // sounding note; $D-$F = A..B below
const byteOf = (s: number) => (((s / 12) | 0) << 4) | (s % 12);

describe('HuSIC note env carry', () => {
  it('plain up delta past the semitone nibble lands 4 semitones low in the driver', () => {
    // A#3 ($3A) + 7 semitones: the driver gives $41 (C#4), not $45 (F-4).
    expect(noteEnvStep(0x3a, 7)).toBe(0x41);
  });
  it('the encoded byte reaches the wanted note, or the nearest one where the driver has no byte for the move', () => {
    let exact = 0, near = 0;
    for (let s = 0; s < 96; s++) for (let d = -24; d <= 24; d++) {
      const t = s + d;
      if (t < 0 || t > 95) continue;
      const r = noteEnvStep(byteOf(s), noteEnvByte(byteOf(s), t, d < 0 ? 0x80 | -d : d));
      const err = Math.abs(semi(r) - t);
      expect(err).toBeLessThanOrEqual(2); // G + 10 has no byte: the carry skips the 12..15 nibbles, so the driver lands on F or G
      if (err) near++; else exact++;
    }
    // A#3 + 7 (the pcengineasdmo arp) is exact
    expect(noteEnvStep(0x3a, noteEnvByte(0x3a, 53, 7))).toBe(0x45);
    expect(near).toBeLessThan(exact / 10);
  });
});
