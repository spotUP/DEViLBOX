/**
 * Targeted regression tests for the exporter round-trip bugs fixed in the
 * "UADE native-editability" Phase 3 wave. Each test parses a real committed fixture,
 * runs the exporter, and re-parses the output — named after the user-visible symptom of
 * the bug it guards. Complements the mass exporterRoundtrip.harness ratchet with explicit,
 * revert-checkable assertions per fix.
 *
 * House rule: real songs only. Fixtures are the same committed files the harness uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

const ROOT = process.cwd();
function fixture(rel: string): ArrayBuffer {
  const b = readFileSync(join(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
async function toU8(x: Uint8Array | ArrayBuffer | Blob | { data: Blob | Uint8Array | ArrayBuffer } | { blob: Blob }): Promise<Uint8Array> {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (x instanceof Blob) return new Uint8Array(await x.arrayBuffer());
  if ('data' in x) return toU8(x.data);
  return toU8(x.blob);
}

/** Fraction of comparable cells whose note/instrument/effTyp/eff match between two songs. */
function cellMatch(a: TrackerSong, b: TrackerSong): { cells: number; matched: number } {
  let cells = 0, matched = 0;
  const pN = Math.min(a.patterns.length, b.patterns.length);
  for (let p = 0; p < pN; p++) {
    const ap = a.patterns[p], bp = b.patterns[p];
    if (!ap || !bp) continue;
    const cN = Math.min(ap.channels.length, bp.channels.length);
    for (let c = 0; c < cN; c++) {
      const ar = ap.channels[c]?.rows ?? [], br = bp.channels[c]?.rows ?? [];
      const rN = Math.min(ar.length, br.length);
      for (let r = 0; r < rN; r++) {
        const x = ar[r] as TrackerCell | undefined, y = br[r] as TrackerCell | undefined;
        if (!x || !y) continue;
        cells++;
        if (x.note === y.note && x.instrument === y.instrument && x.effTyp === y.effTyp && x.eff === y.eff) matched++;
      }
    }
  }
  return { cells, matched };
}

describe('exporter round-trip regressions', () => {
  it('SoundFX export includes sample PCM so the file re-parses (was a 1684-byte sub-minimum file)', async () => {
    const { parseSoundFXFile } = await import('@lib/import/formats/SoundFXParser');
    const { exportSoundFX } = await import('../SoundFXExporter');
    const raw = fixture('public/data/songs/formats/operation_stealth.sfx');
    const song = await parseSoundFXFile(raw, 'operation_stealth.sfx');
    // The parser must now read the real 15-entry sample-size table and load PCM.
    expect(song.instruments.some((i) => (i.sample?.audioBuffer?.byteLength ?? 0) > 44)).toBe(true);
    const out = await toU8(await exportSoundFX(song));
    // With PCM restored the file clears the parser's minimum size and re-parses.
    expect(out.length).toBeGreaterThan(1686);
    const re = await parseSoundFXFile(out.buffer.slice(0) as ArrayBuffer, 'operation_stealth.sfx');
    const { cells, matched } = cellMatch(song, re);
    expect(cells).toBeGreaterThan(0);
    expect(matched / cells).toBeGreaterThan(0.9);
  });

  it('ActivisionPro export places the 0x53 0x31 vibrato marker at +4 so the parser accepts it', async () => {
    const { parseActivisionProFile } = await import('@lib/import/formats/ActivisionProParser');
    const { exportActivisionPro } = await import('../ActivisionProExporter');
    const raw = fixture('public/data/songs/activision-pro/gettysburg.avp');
    const song = parseActivisionProFile(new Uint8Array(raw), 'gettysburg.avp');
    expect(song).not.toBeNull();
    const out = await toU8(await exportActivisionPro(song as TrackerSong));
    const re = parseActivisionProFile(out, 'gettysburg.avp'); // was null before the off-by-2 fix
    expect(re).not.toBeNull();
  });

  it('Oktalyzer export writes a raw OKTASONG magic (not a FORM wrapper) so it re-parses', async () => {
    const { parseOktalyzerFile } = await import('@lib/import/formats/OktalyzerParser');
    const { exportOktalyzer } = await import('../OktalyzerExporter');
    const raw = fixture('public/data/songs/oktalyzer/les granges brulees.okta');
    const song = parseOktalyzerFile(raw, 'les granges brulees.okta');
    const out = await toU8(exportOktalyzer(song));
    expect(String.fromCharCode(...out.slice(0, 8))).toBe('OKTASONG'); // not 'FORM'
    const re = parseOktalyzerFile(out.buffer.slice(0) as ArrayBuffer, 'les granges brulees.okta');
    const { cells, matched } = cellMatch(song, re);
    expect(cells).toBeGreaterThan(0);
    expect(matched / cells).toBeGreaterThan(0.9);
  });

  it('OctaMED MMD0 export uses a 2-byte block header so patterns re-parse with real channels', async () => {
    const { parseMEDFile } = await import('@lib/import/formats/MEDParser');
    const { exportMED } = await import('../MEDExporter');
    const raw = fixture('public/data/songs/octamed-mmd0/universal monsters - title.mmd0');
    const song = parseMEDFile(raw, 'universal monsters - title.mmd0');
    const out = exportMED(song);
    const re = parseMEDFile(out, 'universal monsters - title.mmd0');
    // The MMD1-style 4-byte header made every re-parsed block read 0 channels → 0 cells.
    expect(re.patterns[0]?.channels.length).toBeGreaterThan(0);
    const { cells, matched } = cellMatch(song, re);
    expect(cells).toBeGreaterThan(0);
    expect(matched / cells).toBeGreaterThan(0.5);
  });

  it('C67 FM-only export preserves the OPL2 register dump so the file re-parses', async () => {
    const { parseCDFM67File } = await import('@lib/import/formats/CDFM67Parser');
    const { exportCDFM67 } = await import('../CDFM67Exporter');
    const raw = fixture('public/data/songs/formats/amnesia_credits.c67');
    const song = parseCDFM67File(new Uint8Array(raw), 'amnesia_credits.c67');
    expect(song).not.toBeNull();
    // FM instruments must carry their raw OPL2 registers now.
    const fm = (song as TrackerSong).instruments.find(
      (i) => Array.isArray((i.parameters as Record<string, unknown> | undefined)?.c67FmRegs),
    );
    expect(fm).toBeDefined();
    const out = await toU8(await exportCDFM67(song as TrackerSong));
    const re = parseCDFM67File(out, 'amnesia_credits.c67');
    expect(re).not.toBeNull(); // was null: all-silent FM export failed the validator
  });

  it('DeltaMusic2 export writes the instrument-table break marker and arpeggio tables so cells survive', async () => {
    const { parseDeltaMusic2File } = await import('@lib/import/formats/DeltaMusic2Parser');
    const { exportDeltaMusic2 } = await import('../DeltaMusic2Exporter');
    const raw = fixture('public/data/songs/delta-music-2/asperity megademo 3.dm2');
    const song = parseDeltaMusic2File(new Uint8Array(raw), 'asperity.dm2');
    expect(song).not.toBeNull();
    const out = await toU8(await exportDeltaMusic2(song as TrackerSong));
    const re = parseDeltaMusic2File(out, 'asperity.dm2');
    expect(re).not.toBeNull();
    // Break marker at byte 254 was unwritten → parser matched offsets[0] and parsed
    // zero instruments, dropping every cell's instrument on reload.
    expect(re!.instruments.length).toBe((song as TrackerSong).instruments.length);
    expect(re!.instruments.length).toBeGreaterThan(0);
    const { cells, matched } = cellMatch(song as TrackerSong, re!);
    expect(cells).toBeGreaterThan(1000);
    // Instrument break + arpeggio-table reconstruction bring this to full cell fidelity.
    expect(matched).toBe(cells);
  });

  it('SymphoniePro export writes note -1 for empty rows (note 0 decoded as a real note+instrument)', async () => {
    const { parseSymphonieProFile } = await import('@lib/import/formats/SymphonieProParser');
    const { exportSymphonieProFile } = await import('../SymphonieProExporter');
    const raw = fixture('public/data/songs/symphonie/pas 2 jade.symmod');
    const song = await parseSymphonieProFile(new Uint8Array(raw), 'pas 2 jade.symmod');
    expect(song).not.toBeNull();
    const out = await toU8(exportSymphonieProFile(song as TrackerSong));
    const re = await parseSymphonieProFile(out, 'pas 2 jade.symmod');
    expect(re).not.toBeNull();
    // The SymEvent note byte is signed; an all-zero event is CMD_KEYON note 0,
    // which decodes to xmNote 25 / instrument 1. Empty rows must carry note -1.
    const { cells, matched } = cellMatch(song as TrackerSong, re as TrackerSong);
    expect(cells).toBeGreaterThan(10000);
    expect(matched).toBe(cells);
  }, 30000); // Symphonie parser attempts a (failing) network fetch that is slow to reject

  it('HippelCoSo export encodes empty rows as the -2 rest command (note byte 0 is a real note)', async () => {
    const { parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
    const { exportAsHippelCoSo } = await import('../HippelCoSoExporter');
    const raw = fixture('public/data/songs/formats/prehistoric_tale.hipc');
    const song = await parseHippelCoSoFile(raw, 'prehistoric_tale.hipc');
    expect(song).not.toBeNull();
    const out = await toU8(await exportAsHippelCoSo(song as TrackerSong));
    const re = await parseHippelCoSoFile(out.buffer.slice(0) as ArrayBuffer, 'prehistoric_tale.hipc');
    expect(re).not.toBeNull();
    // CoSo note byte 0 decodes to a real sub-bass note; encoding empty rows as [0,0]
    // filled every silent pattern with note 13. Rests must be the -2 command.
    const { cells, matched } = cellMatch(song as TrackerSong, re as TrackerSong);
    expect(cells).toBeGreaterThan(1000);
    // >99%: the only residual is note events that reference a volume-sequence slot
    // beyond the instrument table (parser yields instrument 0), which cannot be
    // reproduced without a deliberately out-of-range volseq index.
    expect(matched / cells).toBeGreaterThan(0.99);
  }, 30000); // HippelCoSo parser attempts a (failing) network fetch that is slow to reject

  it('SidMon1 export writes 1-based note bytes so notes do not decode a semitone low', async () => {
    const { parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
    const { exportSidMon1 } = await import('../SidMon1Exporter');
    const raw = fixture('public/data/songs/formats/anarchy.sid1');
    const song = parseSidMon1File(raw, 'anarchy.sid1');
    expect(song).not.toBeNull();
    const out = await toU8(await exportSidMon1(song as TrackerSong));
    const re = parseSidMon1File(out.buffer.slice(0) as ArrayBuffer, 'anarchy.sid1');
    expect(re).not.toBeNull();
    // The parser reads the stored note byte as 1-based (storedNote - 1); without the
    // exporter's compensating +1, mid-range notes decoded a semitone low.
    const { cells, matched } = cellMatch(song as TrackerSong, re as TrackerSong);
    expect(cells).toBeGreaterThan(1000);
    expect(matched).toBe(cells);
  });

  it('FC export encodes note as period index xmNote-13 (was -12, shifting every note up a semitone)', async () => {
    const { parseFCFile } = await import('@lib/import/formats/FCParser');
    const { exportFC } = await import('../FCExporter');
    const raw = fixture('public/data/songs/formats/anthrox.fc');
    const song = await parseFCFile(raw, 'anthrox.fc');
    const out = await toU8(exportFC(song));
    const re = await parseFCFile(out.buffer.slice(0) as ArrayBuffer, 'anthrox.fc');
    // Compare NOTE fidelity specifically: the -12/-13 bug moved every reloaded note
    // up one semitone, so note-only match was ~0. Instrument/effect fidelity is
    // separately bounded by the FC replayer parser (encounter-ordered instrument
    // ids, macro-derived effects) and is not asserted here.
    let notes = 0, notesMatched = 0;
    const pN = Math.min(song.patterns.length, re.patterns.length);
    for (let p = 0; p < pN; p++) {
      for (let c = 0; c < 4; c++) {
        const a = song.patterns[p].channels[c]?.rows ?? [];
        const b = re.patterns[p].channels[c]?.rows ?? [];
        const rN = Math.min(a.length, b.length);
        for (let r = 0; r < rN; r++) {
          if ((a[r].note ?? 0) > 0 && (a[r].note ?? 0) <= 60) {
            notes++;
            if (a[r].note === b[r].note) notesMatched++;
          }
        }
      }
    }
    expect(notes).toBeGreaterThan(100);
    expect(notesMatched / notes).toBeGreaterThan(0.95);
  });

  it('MOD export round-trips note/instrument/effect cells through MODParser', async () => {
    const { parseMODFile } = await import('@lib/import/formats/MODParser');
    const { exportSongToMOD } = await import('../modExport');
    const raw = fixture('public/data/songs/audio-sculpture/m.mod');
    const song = await parseMODFile(raw, 'm.mod');
    const out = await toU8(await exportSongToMOD(song, { bakeSynths: true })); // was: throw "not yet implemented"
    expect(String.fromCharCode(...out.slice(1080, 1084))).toBe('M.K.');
    const re = await parseMODFile(out.buffer.slice(0) as ArrayBuffer, 'm.mod');
    const { cells, matched } = cellMatch(song, re);
    expect(cells).toBeGreaterThan(0);
    expect(matched / cells).toBeGreaterThan(0.99);
  });

  it('NRU export writes the full 0..255 note byte and the 0x0C empty-effect slot (was dropping notes >72 and forcing tone-porta)', async () => {
    const { parseNRUFile } = await import('@lib/import/formats/NRUParser');
    const { exportNRU } = await import('../NRUExporter');
    const raw = fixture('public/data/songs/formats/howiedavies.nru');
    const song = await parseNRUFile(raw, 'howiedavies.nru');
    const out = await toU8(await exportNRU(song));
    const re = await parseNRUFile(out.buffer.slice(0) as ArrayBuffer, 'howiedavies.nru');
    // Two bugs: (1) the note byte was clamped to <= 72, dropping every note whose
    // parser d2 byte exceeded 72 (parser decodes any d2 as d2/2 + 36); (2) an
    // effTyp-0/eff-0 cell emitted d0=0, which the parser re-reads as tone-portamento
    // (effTyp 3). Full 0..255 note encoding + the 0x0C arpeggio empty-slot fix both.
    const { cells, matched } = cellMatch(song, re);
    expect(cells).toBeGreaterThan(200);
    expect(matched).toBe(cells);
  });
});
