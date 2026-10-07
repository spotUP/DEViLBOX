/**
 * Regression: Future Player (.fp) voice data is a call-GRAPH over shared
 * command BLOCKS (subroutine bodies + top-level voice sequences), each a REAL
 * contiguous byte range ending at cmd 0 (end/return) or cmd 7 (jump). The
 * parser previously fabricated per-voice sizes (Math.max(nonEmpty*4, 64)) and
 * the encoderRoundtrip harness measured 0.0000.
 *
 * Fixed with the structural raw-block carrier: BFS-enumerate every reachable
 * block (deduped by code offset, sized by scanning to its terminator), carry
 * each block's original bytes + decoded baseline rows, re-emit verbatim when
 * unedited (byte-exact) and re-pack on edit. See variableBlockCarrier.testkit.ts
 * for the invariants; on revert of the carrier assertion 1 fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseFuturePlayerFile } from '../FuturePlayerParser';
import { describeVariableBlockCarrier } from './variableBlockCarrier.testkit';

function parse(buffer: ArrayBuffer, filename: string): TrackerSong {
  return parseFuturePlayerFile(buffer, filename);
}

describeVariableBlockCarrier('futurePlayer', parse);

/**
 * Regression: the carrier addressed its blocks at (file length - code length) + pointer. A hunk file has
 * relocations after the code, so every address was too high by their size (hybris.fp: 2980 instead of 32)
 * and each "block" was other bytes of the file; a write back would have patched the wrong place.
 */
describe('futurePlayer carrier addresses', () => {
  for (const f of ['public/data/songs/formats/hybris.fp', 'public/data/songs/formats/imploder_drums.fp']) {
    it(`${f.split('/').pop()}: every carried block is the file's own bytes at its address, and starts at a stream the player runs`, () => {
      const bytes = readFileSync(join(process.cwd(), f));
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const song = parse(buf, f);
      const layout = song.uadeVariableLayout!;
      const file = new Uint8Array(buf);
      expect(layout.numFilePatterns).toBeGreaterThan(0);
      for (let i = 0; i < layout.numFilePatterns; i++) {
        const at = layout.filePatternAddrs[i], size = layout.filePatternSizes[i];
        expect(at + size, `block ${i} lies in the file`).toBeLessThanOrEqual(file.length);
        expect([...file.subarray(at, at + size)], `block ${i} at ${at}`).toEqual([...layout.blockRawBytes![i]]);
      }
      // voice 0's stream of subsong 0, found from the module's own tables: its file address is the code's start plus its pointer
      const view = new DataView(buf);
      const hunkCode = 20 + view.getUint32(8) * 4 + 8;
      const u32 = (o: number): number => view.getUint32(hunkCode + o);
      const seqData = u32(u32(u32(32) + 8) + 8);
      const idx = layout.filePatternAddrs.indexOf(hunkCode + seqData);
      expect(idx, 'the voice stream is a carried block at the file address its pointer names').toBeGreaterThanOrEqual(0);
      expect(layout.blockRawBytes![idx][0]).toBe(file[hunkCode + seqData]);
    });
  }
});
