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
});
