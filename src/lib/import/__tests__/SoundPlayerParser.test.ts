/**
 * SoundPlayerParser Tests — Sound Player format detection
 *
 * Detection: byte[1] in 11-160, byte[2] in {7,15}, bytes[3,4]=0,
 * byte[5] non-zero (b5), word[6]=0, byte[8]=b5, bytes[9,10]=0,
 * byte[11]=b5, word[12]=0; if byte[2]=15 then byte[14]=b5.
 * File prefix: SJS.*
 */
import { describe, it, expect } from 'vitest';
import { isSoundPlayerFormat, parseSoundPlayerFile } from '../formats/SoundPlayerParser';

function makeSoundPlayerBuffer(voiceCount: 7 | 15 = 7): ArrayBuffer {
  const buf = new Uint8Array(30).fill(0);
  buf[1] = 0x20;         // 32, in range 11-160
  buf[2] = voiceCount;   // 7 or 15
  buf[3] = 0; buf[4] = 0;
  buf[5] = 0x42;         // b5 = 0x42 (non-zero)
  buf[6] = 0; buf[7] = 0; // word[6] = 0
  buf[8] = 0x42;         // == b5
  buf[9] = 0; buf[10] = 0;
  buf[11] = 0x42;        // == b5
  buf[12] = 0; buf[13] = 0; // word[12] = 0
  if (voiceCount === 15) {
    buf[14] = 0x42;      // byte[14] == b5 when voice=15
  }
  return buf.buffer;
}

describe('isSoundPlayerFormat', () => {
  it('detects valid Sound Player buffer (voice=7)', () => {
    expect(isSoundPlayerFormat(makeSoundPlayerBuffer(7))).toBe(true);
  });

  it('detects valid Sound Player buffer (voice=15)', () => {
    expect(isSoundPlayerFormat(makeSoundPlayerBuffer(15))).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isSoundPlayerFormat(new Uint8Array(makeSoundPlayerBuffer()))).toBe(true);
  });

  it('rejects byte[1] out of range (< 11)', () => {
    const buf = new Uint8Array(makeSoundPlayerBuffer());
    buf[1] = 0x05; // 5 < 11
    expect(isSoundPlayerFormat(buf)).toBe(false);
  });

  it('rejects invalid voice count (not 7 or 15)', () => {
    const buf = new Uint8Array(makeSoundPlayerBuffer());
    buf[2] = 0x04; // 4 is not 7 or 15
    expect(isSoundPlayerFormat(buf)).toBe(false);
  });

  it('rejects b5 = 0 (byte[5] must be non-zero)', () => {
    const buf = new Uint8Array(makeSoundPlayerBuffer());
    buf[5] = 0x00;
    expect(isSoundPlayerFormat(buf)).toBe(false);
  });

  it('rejects byte[8] != b5', () => {
    const buf = new Uint8Array(makeSoundPlayerBuffer());
    buf[8] = 0x00;
    expect(isSoundPlayerFormat(buf)).toBe(false);
  });

  it('rejects voice=15 when byte[14] != b5', () => {
    const buf = new Uint8Array(makeSoundPlayerBuffer(15));
    buf[14] = 0x00;
    expect(isSoundPlayerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isSoundPlayerFormat(new ArrayBuffer(10))).toBe(false);
  });
});

describe('parseSoundPlayerFile', () => {
  it('parses without throwing', () => {
    const song = parseSoundPlayerFile(makeSoundPlayerBuffer(), 'SJS.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('Sound Player');
  });
});
