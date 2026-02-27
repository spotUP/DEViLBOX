/**
 * ChuckBiscuitsParser Tests
 *
 * API:
 *   isChuckBiscuitsFormat(bytes: Uint8Array): boolean
 *
 * Magic: bytes[0..3] == 0x43424100+'\xF9' i.e. 'CBA\xF9'
 *        bytes[36] == 0x1A (eof marker)
 *        numChannels (byte 39) must be 1-32, speed (byte 43) > 0, tempo (byte 44) >= 32.
 * Header size: 332 bytes minimum.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isChuckBiscuitsFormat } from '../formats/ChuckBiscuitsParser';

function makeChuckBuf(): Uint8Array {
  const buf = new Uint8Array(400);
  // Magic 'CBA\xF9'
  buf[0]=0x43; buf[1]=0x42; buf[2]=0x41; buf[3]=0xF9;
  // eof marker
  buf[36]=0x1A;
  // messageLength (bytes 37-38) = 0
  // numChannels
  buf[39]=4;
  // lastPattern
  buf[40]=0;
  // numOrders
  buf[41]=1;
  // numSamples
  buf[42]=0;
  // speed
  buf[43]=6;
  // tempo
  buf[44]=125;
  return buf;
}

describe('isChuckBiscuitsFormat', () => {
  it('detects a crafted Chuck Biscuits buffer', () => {
    expect(isChuckBiscuitsFormat(makeChuckBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isChuckBiscuitsFormat(new Uint8Array(400))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isChuckBiscuitsFormat(new Uint8Array(100))).toBe(false);
  });

  it('rejects when magic is wrong', () => {
    const buf = makeChuckBuf();
    buf[3] = 0x00;
    expect(isChuckBiscuitsFormat(buf)).toBe(false);
  });

  it('rejects when eof marker is wrong', () => {
    const buf = makeChuckBuf();
    buf[36] = 0x00;
    expect(isChuckBiscuitsFormat(buf)).toBe(false);
  });

  it('rejects when numChannels is 0', () => {
    const buf = makeChuckBuf();
    buf[39] = 0;
    expect(isChuckBiscuitsFormat(buf)).toBe(false);
  });

  it('rejects when speed is 0', () => {
    const buf = makeChuckBuf();
    buf[43] = 0;
    expect(isChuckBiscuitsFormat(buf)).toBe(false);
  });

  it('rejects when tempo < 32', () => {
    const buf = makeChuckBuf();
    buf[44] = 10;
    expect(isChuckBiscuitsFormat(buf)).toBe(false);
  });
});
