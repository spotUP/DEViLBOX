import { describe, it, expect } from 'vitest';
import { isSIDFormat, parseSIDFile } from '../formats/SIDParser';

describe('SIDParser', () => {
  it('detects valid PSID by magic bytes', () => {
    const buf = new Uint8Array(128);
    buf[0]=0x50; buf[1]=0x53; buf[2]=0x49; buf[3]=0x44;
    expect(isSIDFormat(buf.buffer)).toBe(true);
  });

  it('rejects non-SID data', () => {
    expect(isSIDFormat(new Uint8Array(16).buffer)).toBe(false);
  });

  it('extracts a real note from minimal PSID', async () => {
    // SID PAL clock = 985248 Hz
    // For A4 (440 Hz): freqReg = 440 * 16777216 / 985248 ≈ 7490 = 0x1D42
    const SID_HEADER = 124;
    const LOAD_ADDR  = 0x1000;
    const playCode = new Uint8Array([
      0xA9, 0x42, 0x8D, 0x00, 0xD4, // LDA #$42, STA $D400 (freq lo)
      0xA9, 0x1D, 0x8D, 0x01, 0xD4, // LDA #$1D, STA $D401 (freq hi)
      0xA9, 0x11, 0x8D, 0x04, 0xD4, // LDA #$11, STA $D404 (gate on + triangle)
      0xA9, 0x0F, 0x8D, 0x18, 0xD4, // LDA #$0F, STA $D418 (vol=15)
      0x60,                           // RTS
    ]);

    const buf = new Uint8Array(SID_HEADER + playCode.length);
    // Magic 'PSID'
    buf[0]=0x50; buf[1]=0x53; buf[2]=0x49; buf[3]=0x44;
    // Version 2 (big-endian)
    buf[4]=0; buf[5]=2;
    // Data offset = 124 (big-endian)
    buf[6]=0; buf[7]=0x7C;
    // Load addr = LOAD_ADDR (big-endian) — non-zero means use directly
    buf[8]=(LOAD_ADDR>>8)&0xFF; buf[9]=LOAD_ADDR&0xFF;
    // Init addr = LOAD_ADDR (big-endian)
    buf[10]=(LOAD_ADDR>>8)&0xFF; buf[11]=LOAD_ADDR&0xFF;
    // Play addr = LOAD_ADDR (big-endian)
    buf[12]=(LOAD_ADDR>>8)&0xFF; buf[13]=LOAD_ADDR&0xFF;
    // Songs = 1 (big-endian)
    buf[14]=0; buf[15]=1;
    buf[16]=0; buf[17]=1; // start song
    buf.set(playCode, SID_HEADER);

    const song = await parseSIDFile(buf.buffer, 'test.sid');
    // Voice 1 = channel 0 — should have a note near A4 (MIDI ~69)
    const ch0 = song.patterns[0].channels[0];
    expect(ch0).toBeDefined();
    expect(ch0.rows.some(r => r.note > 0 && r.note < 97)).toBe(true);
  });
});
