import { describe, it, expect } from 'vitest';
import { isNSFFormat, parseNSFFile } from '../formats/NSFParser';

describe('NSFParser', () => {
  it('detects valid NSF by magic bytes', () => {
    const buf = new Uint8Array(128);
    buf[0]=0x4E; buf[1]=0x45; buf[2]=0x53; buf[3]=0x4D; buf[4]=0x1A;
    expect(isNSFFormat(buf.buffer)).toBe(true);
  });

  it('rejects non-NSF data', () => {
    const buf = new Uint8Array(16);
    expect(isNSFFormat(buf.buffer)).toBe(false);
  });

  it('extracts real Pulse 1 notes from minimal NSF', async () => {
    const NSF_HEADER_SIZE = 128;
    const LOAD_ADDR = 0x8000;

    // Play routine: enable pulse 1, set vol=15, set timer for ~A4 (timer=253)
    // timer = 253 → freq = 1789773 / (16*254) ≈ 440.3 Hz ≈ A4 (MIDI 69)
    const playCode = new Uint8Array([
      0xA9, 0x01, 0x8D, 0x15, 0x40,  // LDA #1, STA $4015 (enable pulse 1)
      0xA9, 0x8F, 0x8D, 0x00, 0x40,  // LDA #$8F, STA $4000 (vol=15, duty=0)
      0xA9, 0xFD, 0x8D, 0x02, 0x40,  // LDA #$FD, STA $4002 (timer lo=253)
      0xA9, 0x41, 0x8D, 0x03, 0x40,  // LDA #$41, STA $4003 (timer hi=1, len counter set)
      0x60                             // RTS
    ]);

    const buf = new Uint8Array(NSF_HEADER_SIZE + playCode.length);
    buf[0]=0x4E; buf[1]=0x45; buf[2]=0x53; buf[3]=0x4D; buf[4]=0x1A; // NESM\x1A
    buf[5] = 1;  // version
    buf[6] = 1;  // 1 song
    buf[7] = 1;  // start song
    buf[8]  = LOAD_ADDR & 0xFF; buf[9]  = (LOAD_ADDR >> 8) & 0xFF; // load addr
    buf[10] = LOAD_ADDR & 0xFF; buf[11] = (LOAD_ADDR >> 8) & 0xFF; // init addr
    buf[12] = LOAD_ADDR & 0xFF; buf[13] = (LOAD_ADDR >> 8) & 0xFF; // play addr
    buf[0x70] = 0; // NTSC
    buf.set(playCode, NSF_HEADER_SIZE);

    const song = await parseNSFFile(buf.buffer, 'test.nsf');
    // Pulse 1 = channel 0
    const ch0 = song.patterns[0].channels[0];
    expect(ch0).toBeDefined();
    expect(ch0.rows.some(r => r.note > 0 && r.note < 97)).toBe(true);
  });
});
