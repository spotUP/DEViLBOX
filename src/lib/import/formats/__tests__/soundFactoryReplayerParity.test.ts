/**
 * Sound Factory parser parity with the replayer (soundfactory.c): StopAndPause only mutes for the pause and the voice
 * reads on (:1019), a note duration is the low 15 bits (:561), and sub-song offset blocks are contiguous, one per used
 * sub-song (:1342). Synthetic module: sub-song slot 0 unused, slot 1 used.
 */
import { describe, it, expect } from 'vitest';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';

function build(ops: number[]): Uint8Array {
  const b = new Uint8Array(277 + ops.length);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, b.length);
  b[5] = 1; // slot 1: voice 0 enabled; slot 0 stays empty
  dv.setUint32(20, 277); // first (and only) offset block, voice 0; byte 276 is padding a slot-indexed read would walk instead
  for (let c = 1; c < 4; c++) dv.setUint32(20 + c * 4, 276); // other voices: the End padding byte (the format needs an offset at 276)
  b.set([0x8e, ...ops], 276);
  return b;
}

describe('Sound Factory parser follows the replayer', () => {
  const stream = [0x80, 0, 4, 0x99, 0, 8, 0x80, 0, 2, 0x8e];
  const events = () => parseSoundFactoryWithEffects(build(stream), 't.psf')!.voiceEvents[0];

  it('reads the used sub-song from the contiguous offset block, and walks past StopAndPause', () => {
    expect(events().map((e) => e.duration)).toEqual([4, 8, 2]);
  });

  it('masks bit 15 off a note duration', () => {
    const ev = parseSoundFactoryWithEffects(build([0x30, 0x80, 0x03, 0x8e]), 't.psf')!.voiceEvents[0];
    const note = ev.find((e) => e.isNote);
    expect(note?.duration).toBe(3);
  });
});
