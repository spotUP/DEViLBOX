/**
 * Regression: SunTronic V1.3 byte-exact structural raw-block carrier.
 *
 * Phase 3 of plans/2026-07-13-suntronic-editable-pilot.md. The V1.3 parser
 * captures each score command-stream block at its REAL hunk-1 file offset
 * (filePatternAddrs) with its REAL byte size (filePatternSizes), stashing the
 * original packed bytes (blockRawBytes) and the decoded baseline (blockRows).
 * encodeVariableBlock must re-emit every unedited block byte-for-byte — this
 * is exactly the property the encoderRoundtrip ratchet records as byte-exact
 * (matchPct 1) for sunTronic.
 *
 * Honesty (project_uade_variable_carrier_sweep): the carrier is legitimate
 * because (1) offsets are real hunk-1 file positions, (2) sizes are real block
 * boundaries (scan-to-terminator), (3) blockRawBytes stores the real bytes.
 * This test proves (1)+(3) directly — blockRawBytes equals the file slice at
 * the real offset, and the encoder reproduces it from blockRows alone.
 *
 * NOTE ON EDITABILITY: sunTronicV13Encoder is a pure carrier re-emitter; it
 * reconstructs bytes from the per-row carrier fields and does not yet compile
 * an edited note back into the stream. True edit round-trip is Phase 4 (score
 * compiler / reference-player wrap), so the "edit diverges" assertion from the
 * shared testkit is intentionally NOT asserted here — it would require the
 * compiler that does not exist yet. Unedited byte-exactness (below) is real
 * and is what the ratchet claims.
 *
 * Fails on revert: remove the carrier stash in the V1.3 parser (blockRawBytes
 * / blockRows) or the encoder's carrier concatenation and encodeVariableBlock
 * no longer reproduces the block bytes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { parseSunTronicFile } from '../SunTronicParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src');

function loadModule(): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(FIXTURE));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

describe('SunTronic V1.3 variable-block round-trip (byte-exact carrier)', () => {
  it('reproduces every unedited score block byte-for-byte from honest file offsets', () => {
    const buf = loadModule();
    const fileBytes = new Uint8Array(buf);
    const song = parseSunTronicFile(buf, 'mule.src');

    const layout = song.uadeVariableLayout;
    expect(layout, 'V1.3 variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('sunTronic');
    expect(layout.numFilePatterns).toBeGreaterThan(0);
    expect(layout.blockRawBytes!.length).toBe(layout.numFilePatterns);
    expect(layout.blockRows!.length).toBe(layout.numFilePatterns);

    let checked = 0;
    for (let fp = 0; fp < layout.numFilePatterns; fp++) {
      const addr = layout.filePatternAddrs[fp];
      const size = layout.filePatternSizes[fp];
      expect(size, `block ${fp} has a real size`).toBeGreaterThan(0);

      // (1) honest offsets: blockRawBytes IS the file slice at the real offset.
      const slice = fileBytes.slice(addr, addr + size);
      expect(Buffer.from(layout.blockRawBytes![fp]).equals(Buffer.from(slice)),
        `fp ${fp}: blockRawBytes == file[0x${addr.toString(16)}..+${size}]`).toBe(true);

      // (2) byte-exact: encodeVariableBlock reproduces the block from blockRows.
      const re = encodeVariableBlock(layout, fp, layout.blockRows![fp], 0);
      expect(Buffer.from(re).equals(Buffer.from(slice)),
        `fp ${fp}: encodeVariableBlock(blockRows) == block bytes`).toBe(true);
      checked++;
    }
    expect(checked, 'exercised real blocks').toBeGreaterThan(0);
  });
});
