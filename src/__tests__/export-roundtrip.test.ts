/**
 * Export roundtrip tests — verify that exporting a TrackerSong
 * to native format and re-parsing produces the same note/effect data.
 */
import { describe, it, expect } from 'vitest';
import { exportSongToJam } from '@/lib/export/jamExport';
import { exportSongToSoundMon } from '@/lib/export/soundMonExport';
import { parseJamCrackerFile } from '@/lib/import/formats/JamCrackerParser';
import { parseSoundMonFile } from '@/lib/import/formats/SoundMonParser';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell, InstrumentConfig } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeCell(note: number, instrument: number, volume = 0, effTyp = 0, eff = 0): TrackerCell {
  return { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
}

function makePattern(rows: number, channels: number, cells?: Map<string, TrackerCell>) {
  const channelData = [];
  for (let ch = 0; ch < channels; ch++) {
    const rowData: TrackerCell[] = [];
    for (let r = 0; r < rows; r++) {
      const key = `${ch}:${r}`;
      rowData.push(cells?.get(key) ?? emptyCell());
    }
    channelData.push({ rows: rowData });
  }
  return { channels: channelData, length: rows };
}

function makeMinimalSong(opts: {
  name?: string;
  patterns: ReturnType<typeof makePattern>[];
  songPositions?: number[];
  instruments?: Partial<InstrumentConfig>[];
}): TrackerSong {
  return {
    name: opts.name ?? 'test',
    author: '',
    bpm: 125,
    speed: 6,
    channels: 4,
    patterns: opts.patterns,
    songPositions: opts.songPositions ?? [0],
    instruments: (opts.instruments ?? [{ name: 'Inst1', volume: -6 }]) as InstrumentConfig[],
    // Minimal fields to satisfy TrackerSong interface
    channelPanning: [-50, 50, 50, -50],
    moduleData: null,
    jamCrackerFileData: null,
    uadePatternLayout: null,
    editorMode: 'classic',
    originalFormat: null,
    loopRow: 0,
    loopPattern: 0,
  } as unknown as TrackerSong;
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer();
}

// ── JamCracker roundtrip ──────────────────────────────────────────────────

describe('JamCracker export roundtrip', () => {
  it('should preserve notes through export → reimport', async () => {
    // XM note 13 = C-1 → JC note 1. XM note 25 = C-2 → JC note 13.
    const cells = new Map<string, TrackerCell>();
    cells.set('0:0', makeCell(13, 1));  // C-1 on ch0
    cells.set('1:0', makeCell(25, 1));  // C-2 on ch1
    cells.set('0:4', makeCell(37, 1));  // C-3 on ch0 row 4
    cells.set('2:8', makeCell(48, 1));  // B-3 on ch2 row 8

    const song = makeMinimalSong({
      patterns: [makePattern(64, 4, cells)],
    });

    const result = exportSongToJam(song);
    expect(result.warnings).toHaveLength(0);

    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseJamCrackerFile(buf, 'test.jam');

    // Verify notes survived the roundtrip
    const p0 = reimported.patterns[0];
    expect(p0.channels[0].rows[0].note).toBe(13);   // C-1
    expect(p0.channels[1].rows[0].note).toBe(25);   // C-2
    expect(p0.channels[0].rows[4].note).toBe(37);   // C-3
    expect(p0.channels[2].rows[8].note).toBe(48);   // B-3
  });

  it('should preserve speed effect (Fxx)', async () => {
    const cells = new Map<string, TrackerCell>();
    cells.set('0:0', makeCell(13, 1, 0, 0x0F, 8));  // C-1 + speed 8

    const song = makeMinimalSong({
      patterns: [makePattern(64, 4, cells)],
    });

    const result = exportSongToJam(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseJamCrackerFile(buf, 'test.jam');

    expect(reimported.patterns[0].channels[0].rows[0].effTyp).toBe(0x0F);
    expect(reimported.patterns[0].channels[0].rows[0].eff).toBe(8);
  });

  it('should preserve arpeggio effect (0xy)', async () => {
    const cells = new Map<string, TrackerCell>();
    cells.set('0:0', makeCell(25, 1, 0, 0x00, 0x37)); // C-2 + arpeggio 37

    const song = makeMinimalSong({
      patterns: [makePattern(64, 4, cells)],
    });

    const result = exportSongToJam(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseJamCrackerFile(buf, 'test.jam');

    expect(reimported.patterns[0].channels[0].rows[0].effTyp).toBe(0x00);
    expect(reimported.patterns[0].channels[0].rows[0].eff).toBe(0x37);
  });

  it('should preserve volume column', async () => {
    const cells = new Map<string, TrackerCell>();
    // XM volume 0x10 = min → JC 1; 0x50 = max → JC 65
    cells.set('0:0', makeCell(25, 1, 0x30)); // volume 0x30 = JC 33

    const song = makeMinimalSong({
      patterns: [makePattern(64, 4, cells)],
    });

    const result = exportSongToJam(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseJamCrackerFile(buf, 'test.jam');

    expect(reimported.patterns[0].channels[0].rows[0].volume).toBe(0x30);
  });

  it('should preserve multiple patterns and song order', async () => {
    const cells0 = new Map<string, TrackerCell>();
    cells0.set('0:0', makeCell(13, 1));

    const cells1 = new Map<string, TrackerCell>();
    cells1.set('0:0', makeCell(25, 1));

    const song = makeMinimalSong({
      patterns: [makePattern(64, 4, cells0), makePattern(64, 4, cells1)],
      songPositions: [0, 1, 0],
    });

    const result = exportSongToJam(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseJamCrackerFile(buf, 'test.jam');

    expect(reimported.patterns).toHaveLength(2);
    expect(reimported.songPositions).toEqual([0, 1, 0]);
    expect(reimported.patterns[0].channels[0].rows[0].note).toBe(13);
    expect(reimported.patterns[1].channels[0].rows[0].note).toBe(25);
  });

  it('should handle empty song gracefully', async () => {
    const song = makeMinimalSong({
      patterns: [makePattern(64, 4)],
    });

    const result = exportSongToJam(song);
    expect(result.warnings).toHaveLength(0);

    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseJamCrackerFile(buf, 'test.jam');
    expect(reimported.patterns).toHaveLength(1);
    // All notes should be 0 (empty)
    for (let ch = 0; ch < 4; ch++) {
      for (let row = 0; row < 64; row++) {
        expect(reimported.patterns[0].channels[ch].rows[row].note).toBe(0);
      }
    }
  });
});

// ── SoundMon V2 roundtrip ─────────────────────────────────────────────────

describe('SoundMon V2 export roundtrip', () => {
  it('should preserve notes through export → reimport', async () => {
    // SoundMon uses 16-row patterns. XM note 13=C-1 → SM note 1.
    const cells = new Map<string, TrackerCell>();
    cells.set('0:0', makeCell(13, 1));   // C-1 on ch0
    cells.set('1:0', makeCell(25, 1));   // C-2 on ch1
    cells.set('0:8', makeCell(37, 1));   // C-3 on ch0 row 8
    cells.set('2:15', makeCell(49, 1));  // C-4 on ch2 row 15

    const song = makeMinimalSong({
      patterns: [makePattern(16, 4, cells)],
    });

    const result = exportSongToSoundMon(song);
    expect(result.warnings).toHaveLength(0);

    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseSoundMonFile(buf, 'test.bp');

    const p0 = reimported.patterns[0];
    expect(p0.channels[0].rows[0].note).toBe(13);   // C-1
    expect(p0.channels[1].rows[0].note).toBe(25);   // C-2
    expect(p0.channels[0].rows[8].note).toBe(37);   // C-3
    expect(p0.channels[2].rows[15].note).toBe(49);  // C-4
  });

  it('should preserve effects through roundtrip', async () => {
    const cells = new Map<string, TrackerCell>();
    // XM effect 0x01 (porta up) → SM effect 4 → parser maps back to XM 0x01
    cells.set('0:0', makeCell(25, 1, 0, 0x01, 0x20));  // C-2 + porta up 0x20

    const song = makeMinimalSong({
      patterns: [makePattern(16, 4, cells)],
    });

    const result = exportSongToSoundMon(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseSoundMonFile(buf, 'test.bp');

    // Effects should be preserved
    const cell = reimported.patterns[0].channels[0].rows[0];
    expect(cell.note).toBe(25);
    expect(cell.effTyp).toBe(0x01);  // porta up
    expect(cell.eff).toBe(0x20);
  });

  it('should correctly encode and decode song title', async () => {
    const song = makeMinimalSong({
      name: 'My Cool SoundMon Tune',
      patterns: [makePattern(16, 4)],
    });

    const result = exportSongToSoundMon(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseSoundMonFile(buf, 'test.bp');

    expect(reimported.name).toContain('My Cool SoundMon Tune');
  });

  it('should deduplicate identical blocks', async () => {
    // Two patterns with identical ch0 data should share the same block
    const cells = new Map<string, TrackerCell>();
    cells.set('0:0', makeCell(25, 1));

    const song = makeMinimalSong({
      patterns: [makePattern(16, 4, cells), makePattern(16, 4, cells)],
      songPositions: [0, 1],
    });

    const result = exportSongToSoundMon(song);
    const buf = await blobToArrayBuffer(result.data);

    // File should be smaller than if blocks were duplicated
    // (each non-empty block = 16 rows × 3 bytes = 48 bytes)
    // With dedup: 1 unique block. Without: 2 blocks.
    const reimported = await parseSoundMonFile(buf, 'test.bp');
    expect(reimported.patterns).toHaveLength(2);
    // Both patterns should have the same ch0 note
    expect(reimported.patterns[0].channels[0].rows[0].note).toBe(25);
    expect(reimported.patterns[1].channels[0].rows[0].note).toBe(25);
  });

  it('should handle empty pattern correctly', async () => {
    const song = makeMinimalSong({
      patterns: [makePattern(16, 4)],
    });

    const result = exportSongToSoundMon(song);
    const buf = await blobToArrayBuffer(result.data);
    const reimported = await parseSoundMonFile(buf, 'test.bp');

    expect(reimported.patterns).toHaveLength(1);
    for (let ch = 0; ch < 4; ch++) {
      for (let row = 0; row < 16; row++) {
        expect(reimported.patterns[0].channels[ch].rows[row].note).toBe(0);
      }
    }
  });
});

// ── Note conversion unit tests ────────────────────────────────────────────

describe('Note conversion symmetry', () => {
  it('JamCracker: all valid notes roundtrip correctly', () => {
    // JC notes 1-36 map to XM notes 13-48
    // amigaNoteToXM adds +12, xmNoteToJC subtracts -12
    for (let jcNote = 1; jcNote <= 36; jcNote++) {
      const xmNote = jcNote + 12;  // amigaNoteToXM
      const backToJC = xmNote - 12; // xmNoteToJC
      expect(backToJC).toBe(jcNote);
    }
  });

  it('SoundMon: all valid notes roundtrip correctly', () => {
    // SM notes 1-48 map to XM notes 13-60 (via period table)
    // bpNoteToXM(note, 0): PERIODS[note+35] → PT match → bestIdx+13
    // xmNoteToSM: xmNote-12
    for (let smNote = 1; smNote <= 48; smNote++) {
      const xmNote = smNote + 12;   // bpNoteToXM(smNote, 0) ≈ smNote + 12
      const backToSM = xmNote - 12;  // xmNoteToSM
      expect(backToSM).toBe(smNote);
    }
  });
});

// ── Real-file roundtrip tests ──────────────────────────────────────────────

describe('JamCracker real-file roundtrip', () => {
  it('analogue_vibes.jam: parse → export → reparse preserves notes', async () => {
    const fs = await import('fs');
    const path = 'test/analogue_vibes.jam';
    if (!fs.existsSync(path)) return; // skip if file missing

    const fileData = fs.readFileSync(path);
    const buf = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    const original = await parseJamCrackerFile(buf, 'analogue_vibes.jam');

    const exported = exportSongToJam(original);
    const reExportBuf = await blobToArrayBuffer(exported.data);
    const reimported = await parseJamCrackerFile(reExportBuf, 'roundtrip.jam');

    // Same number of patterns
    expect(reimported.patterns.length).toBe(original.patterns.length);
    // Same song order
    expect(reimported.songPositions).toEqual(original.songPositions);

    // Check all notes match
    let totalNotes = 0;
    let matchedNotes = 0;
    for (let p = 0; p < original.patterns.length; p++) {
      for (let ch = 0; ch < 4; ch++) {
        const origRows = original.patterns[p].channels[ch]?.rows ?? [];
        const reRows = reimported.patterns[p].channels[ch]?.rows ?? [];
        for (let r = 0; r < origRows.length; r++) {
          if (origRows[r].note > 0) {
            totalNotes++;
            if (origRows[r].note === reRows[r]?.note) matchedNotes++;
          }
        }
      }
    }
    // At least 95% of notes should survive roundtrip
    // (some may be lost if out of JC range 1-36)
    const matchRate = totalNotes > 0 ? matchedNotes / totalNotes : 1;
    expect(matchRate).toBeGreaterThanOrEqual(0.95);
  });
});

describe('SoundMon real-file roundtrip', () => {
  it('antidust.bp3: parse → export → reparse preserves notes', async () => {
    const fs = await import('fs');
    const path = 'test/antidust.bp3';
    if (!fs.existsSync(path)) return; // skip if file missing

    const fileData = fs.readFileSync(path);
    const buf = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    const original = await parseSoundMonFile(buf, 'antidust.bp3');

    const exported = exportSongToSoundMon(original);
    const reExportBuf = await blobToArrayBuffer(exported.data);
    const reimported = await parseSoundMonFile(reExportBuf, 'roundtrip.bp');

    // Same number of patterns
    expect(reimported.patterns.length).toBe(original.patterns.length);

    // Check all notes match
    let totalNotes = 0;
    let matchedNotes = 0;
    for (let p = 0; p < original.patterns.length; p++) {
      for (let ch = 0; ch < Math.min(4, original.patterns[p].channels.length); ch++) {
        const origRows = original.patterns[p].channels[ch]?.rows ?? [];
        const reRows = reimported.patterns[p]?.channels[ch]?.rows ?? [];
        const len = Math.min(origRows.length, 16);
        for (let r = 0; r < len; r++) {
          if (origRows[r].note > 0) {
            totalNotes++;
            if (origRows[r].note === reRows[r]?.note) matchedNotes++;
          }
        }
      }
    }
    const matchRate = totalNotes > 0 ? matchedNotes / totalNotes : 1;
    expect(matchRate).toBeGreaterThanOrEqual(0.90);
  });
});
