/**
 * SunTronic V1.3 native export — Phase 4.4 acceptance.
 *
 * (a) Unedited export of mule.src byte-equals the input file (fast path).
 * (b) One-note-edited export splices the changed carrier byte in place and
 *     re-parses to a score whose only byte difference is that note.
 * (c) A minimal from-scratch song (2 patterns, 2 corpus-named instruments, NO
 *     sunTronic layout) compiles to a valid hunk executable that re-parses and
 *     whose hunk walker validates (header magic, 2 hunks, sizes/relocs in range).
 *
 * Fails-on-revert (test c): reverting the RELOC32 emission in writeHunks drops
 * the 7 hunk#0 anchor pointers, so parseSunTronicV13Score throws ("expected 7
 * hunk#0 anchor pointers") — test (c) fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { parseSunTronicFile } from '@/lib/import/formats/SunTronicParser';
import { parseHunks, parseSunTronicV13Score, HUNK_HEADER } from '@/lib/import/formats/SunTronicV13';
import { exportAsSunTronic } from '../SunTronicExporter';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src');

function loadModuleBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE));
}

function loadSong(): { song: TrackerSong; bytes: Uint8Array } {
  const bytes = loadModuleBytes();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const song = parseSunTronicFile(ab, 'mule.src');
  return { song, bytes };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('SunTronic V1.3 native export', () => {
  it('(a) unedited export byte-equals the input file', () => {
    const { song, bytes } = loadSong();
    const result = exportAsSunTronic(song);
    expect(result.filename.endsWith('.src')).toBe(true);
    expect(bytesEqual(result.data, bytes)).toBe(true);
  });

  it('(b) a one-note edit splices in place and re-parses with exactly one byte changed', () => {
    const { song, bytes } = loadSong();
    const layout = song.uadeVariableLayout!;
    expect(layout.formatId).toBe('sunTronic');

    // Each pool cell carries its exact source group bytes in `sunRaw` (set by
    // decodeSunGroup). Find the first cell whose group starts with a note byte
    // (sunRaw[0] >= 0xB8) and compute its file offset (sum of preceding groups'
    // sunRaw lengths). Changing sunRaw[0] to another note byte keeps the group
    // length fixed, so the export splice is in-place.
    let editBlock = -1;
    let itemIdx = -1;
    let byteOffInBlock = 0;
    for (let fp = 0; fp < layout.blockRows!.length; fp++) {
      const rows = layout.blockRows![fp];
      let off = 0;
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i].sunRaw ?? [];
        if (raw.length >= 1 && raw[0] >= 0xb8) { editBlock = fp; itemIdx = i; byteOffInBlock = off; break; }
        off += raw.length;
      }
      if (editBlock >= 0) break;
    }
    expect(itemIdx, 'a score block must contain a note carrier').toBeGreaterThanOrEqual(0);
    const rows = layout.blockRows![editBlock];

    const editedFileOff = layout.filePatternAddrs[editBlock] + byteOffInBlock;
    const origByte = bytes[editedFileOff];
    // A different note byte, still in the note range (>= 0xB8) so the group
    // length is unchanged and the module re-parses cleanly.
    const newByte = origByte === 0xff ? 0xfe : origByte + 1;
    rows[itemIdx].sunRaw![0] = newByte;

    const result = exportAsSunTronic(song);
    expect(result.data.length).toBe(bytes.length);

    // Exactly one byte differs, and it is the edited note byte.
    const diffs: number[] = [];
    for (let i = 0; i < bytes.length; i++) if (bytes[i] !== result.data[i]) diffs.push(i);
    expect(diffs).toEqual([editedFileOff]);
    expect(result.data[editedFileOff]).toBe(newByte & 0xff);

    // Re-parses cleanly as a valid V1.3 score.
    expect(() => parseSunTronicV13Score(result.data)).not.toThrow();
  });

  it('(c) a minimal from-scratch song compiles to a valid, re-parseable hunk module', () => {
    // Two corpus-named synth instruments (no PCM ⇒ no companions), no layout.
    const instruments: InstrumentConfig[] = [
      { id: 1, name: 'n-chord.x', type: 'synth', synthType: 'Synth', effects: [], volume: 0, pan: 0 } as InstrumentConfig,
      { id: 2, name: 'drum.x', type: 'synth', synthType: 'Synth', effects: [], volume: 0, pan: 0 } as InstrumentConfig,
    ];
    const mkPattern = (p: number) => ({
      id: `pattern-${p}`, name: `Pattern ${p}`, length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
        instrumentId: null, color: null,
        rows: Array.from({ length: 64 }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
    });
    const song = {
      name: 'brand new',
      format: 'SunTronic',
      patterns: [mkPattern(0), mkPattern(1)],
      instruments,
      songPositions: [0, 1],
      songLength: 2,
      restartPosition: 0,
      numChannels: 4,
      initialSpeed: 6,
      initialBPM: 125,
    } as unknown as TrackerSong;

    const result = exportAsSunTronic(song);
    expect(result.filename).toBe('brand_new.src');
    expect(result.companions).toBeUndefined();

    // Hunk walker validates structure: header magic, exactly 2 hunks, payload +
    // reloc offsets all in range.
    const hf = parseHunks(result.data);
    expect(hf.hunks.length).toBe(2);
    // Header magic longword.
    expect((result.data[0] << 24 | result.data[1] << 16 | result.data[2] << 8 | result.data[3]) >>> 0)
      .toBe(HUNK_HEADER);
    for (const h of hf.hunks) {
      expect(h.length).toBeLessThanOrEqual(h.declaredSize);
      for (const [target, offs] of h.reloc32) {
        expect(target).toBeGreaterThanOrEqual(0);
        expect(target).toBeLessThan(hf.hunks.length);
        for (const o of offs) expect(o).toBeLessThan(h.length);
      }
    }

    // Full V1.3 score re-parse (needs the 7 hunk#0 anchor relocs ⇒ fails-on-revert).
    expect(() => parseSunTronicV13Score(result.data)).not.toThrow();
  });
});
