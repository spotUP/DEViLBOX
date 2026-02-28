/**
 * TCBTrackerParser Tests — TCB Tracker 'AN COOL!' / 'AN COOL.' format detection
 *                          and sample extraction.
 *
 * Detection requires filename prefix 'tcb.' AND binary checks:
 *   'AN C' at 0, 'OOL!' or 'OOL.' at 4, nbPatt<=127, speed<=15,
 *   byte[13]=0, seqLen in 1-127, sentinel values at structural offsets.
 *
 * No real TCB Tracker files are in Reference Music, so both detection and
 * parse tests use synthetic buffers constructed from the OpenMPT Load_tcb.cpp
 * format spec.
 *
 * Note: .tss files in Reference Music/TSS/ are a different format (TSS/UADE).
 */
import { describe, it, expect } from 'vitest';
import { isTCBTrackerFormat, parseTCBTrackerFile } from '../formats/TCBTrackerParser';

// ── Synthetic buffer helpers ───────────────────────────────────────────────

/**
 * Build a minimal valid TCB Tracker buffer (format 1: "AN COOL!", pattBase=0x110).
 *
 * Layout with nbPatt=1:
 *   pattBase  = 0x110 = 272
 *   sampleStart = 272 + 1×512 = 784 = 0x310
 *   a3        = sampleStart + 0xD4 = 784 + 212 = 996 = 0x3E4
 *
 * Required sentinel values for isTCBTrackerFormat:
 *   buf[988..991] = 0xFFFFFFFF  (a3 - 8)
 *   buf[992..995] = 0x00000000  (a3 - 4, already zero)
 *   buf[852..855] = 0x000000D4  (a3 - 0x90 = sampleStart+68 = sampleHeaders2[0].offset)
 */
function makeTCBBuffer(): ArrayBuffer {
  const size = 1300;
  const buf = new Uint8Array(size).fill(0);

  // Magic: 'AN COOL!'
  buf[0] = 0x41; buf[1] = 0x4e; buf[2] = 0x20; buf[3] = 0x43;
  buf[4] = 0x4f; buf[5] = 0x4f; buf[6] = 0x4c; buf[7] = 0x21;

  // nbPatt = 1
  buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x01;

  // tempo = 6 (<= 15); unused1 = 0
  buf[12] = 0x06; buf[13] = 0x00;

  // numOrders = buf[0x8E] = 1 (also satisfies seqLen check: 1..127)
  buf[0x8e] = 0x01;

  // Sentinels (a3 = 996)
  buf[988] = 0xff; buf[989] = 0xff; buf[990] = 0xff; buf[991] = 0xff; // a3-8
  // buf[992..995] = 0x00000000 already

  // sampleHeaders2[0].offset at sampleStart+68 = 784+68 = 852 → must be 0xD4
  buf[852] = 0x00; buf[853] = 0x00; buf[854] = 0x00; buf[855] = 0xd4;

  return buf.buffer;
}

/**
 * Extend the minimal buffer with one real PCM sample (64 bytes at offset 0xD4).
 *
 * sampleStart = 784 = 0x310
 * sampleHeaders1[0] at sampleStart+4 = 788:  [volume=50, skip=0, rawLoopEnd=0,0]
 * sampleHeaders2[0] at sampleStart+68 = 852: [offset=0xD4=212, length=64]
 * PCM data at sampleStart+0xD4 = 996: 64 bytes of 8-bit unsigned values
 */
function makeTCBBufferWithSample(): ArrayBuffer {
  const buf = new Uint8Array(makeTCBBuffer());

  // Instrument name 0 at instrNamesOff=144 (format 1)
  const name = 'TestSmp\0';
  for (let i = 0; i < 8; i++) buf[144 + i] = name.charCodeAt(i);

  // sampleHeaders1[0] at sampleStart+4 = 788
  const h1 = 788;
  buf[h1]     = 50;   // volume (0-127)
  buf[h1 + 1] = 0;    // skip
  buf[h1 + 2] = 0;    // rawLoopEnd hi (no loop)
  buf[h1 + 3] = 0;    // rawLoopEnd lo

  // sampleHeaders2[0] at sampleStart+68 = 852
  // offset is already set to 0xD4; set length = 64
  buf[856] = 0x00; buf[857] = 0x00; buf[858] = 0x00; buf[859] = 0x40;

  // PCM data at sampleStart+0xD4 = 784+212 = 996 (64 bytes, 8-bit unsigned)
  for (let i = 0; i < 64; i++) {
    // Simple ramp 128..191 (unsigned → after XOR 0x80: 0..63 signed)
    buf[996 + i] = 128 + (i % 64);
  }

  return buf.buffer;
}

// ── Detection tests ────────────────────────────────────────────────────────

describe('isTCBTrackerFormat', () => {
  it('detects valid TCB Tracker buffer with tcb. filename', () => {
    expect(isTCBTrackerFormat(makeTCBBuffer(), 'tcb.testsong')).toBe(true);
  });

  it('rejects when filename does not start with tcb.', () => {
    expect(isTCBTrackerFormat(makeTCBBuffer(), 'other.testsong')).toBe(false);
  });

  it('rejects when AN C magic is wrong', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[0] = 0x00;
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects when OOL! / OOL. tag is wrong', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[7] = 0x00; // not '!' or '.'
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects nbPatt > 127', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[11] = 0x80; // nbPatt = 128 > 127
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects speed > 15', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[12] = 0x10; // speed = 16 > 15
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects seqLen = 0', () => {
    const buf = new Uint8Array(makeTCBBuffer());
    buf[0x8e] = 0x00;
    expect(isTCBTrackerFormat(buf.buffer, 'tcb.test')).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isTCBTrackerFormat(new ArrayBuffer(200), 'tcb.test')).toBe(false);
  });
});

// ── Parse tests ────────────────────────────────────────────────────────────

describe('parseTCBTrackerFile — synthetic buffer with sample data', () => {
  it('parses without throwing', async () => {
    await expect(
      parseTCBTrackerFile(makeTCBBufferWithSample(), 'tcb.testsong')
    ).resolves.toBeDefined();
  });

  it('extracts at least one Sampler instrument with real PCM data', async () => {
    const song = await parseTCBTrackerFile(makeTCBBufferWithSample(), 'tcb.testsong');
    expect(song.instruments.length).toBeGreaterThan(0);
    const sampler = song.instruments.find((i) => i.synthType === 'Sampler');
    expect(sampler).toBeDefined();
    expect(sampler!.sample?.audioBuffer).toBeDefined();
    expect((sampler!.sample!.audioBuffer as ArrayBuffer).byteLength).toBeGreaterThan(0);
  });

  it('uses 4 channels', async () => {
    const song = await parseTCBTrackerFile(makeTCBBufferWithSample(), 'tcb.testsong');
    expect(song.numChannels).toBe(4);
  });

  it('strips tcb. prefix from module name', async () => {
    const song = await parseTCBTrackerFile(makeTCBBufferWithSample(), 'tcb.testsong');
    expect(song.name.toLowerCase()).not.toContain('tcb.');
  });

  it('returns empty instruments when sample table is all zeros', async () => {
    // Detection-passing buffer but no sample data (length=0 for all samples)
    const song = await parseTCBTrackerFile(makeTCBBuffer(), 'tcb.testsong');
    expect(song.instruments).toHaveLength(0);
  });
});
