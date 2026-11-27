/**
 * Every format whose exporter file existed but the router never reached (xm, mod, dtm, fur, it, s3m):
 * a real file loads through its normal parser and exportNativeSong returns that format's exporter output.
 */
import { relative } from 'node:path';
import { songFile } from '../../../test/songPath';
import { describe, it, expect, vi } from 'vitest';
import { parseAs, readFixture } from './exporterHarness.shared';
import { exportNativeSong, selectNativeExporter } from '../nativeExportRouter';
// Static so the parser's module graph loads at collection, not inside a test's timeout.
import { parseFurnaceFile } from '@lib/import/parsers/FurnaceToSong';
import { NEO_GEO_SYNTH_TYPE } from '../FurnaceModuleExporter';
// Modules parseFurnaceFile loads lazily on its TS-fallback path (no WASM script in happy-dom).
import '@lib/import/formats/FurnaceSongParser';
import '@lib/import/InstrumentConverter';
import '@lib/import/formats/furnace/FurnaceInstrumentParser';
import type { TrackerSong } from '@engine/TrackerReplayer';

// The OpenMPT writer needs its WASM module; the router's job is to hand it the right format.
const openMpt = vi.hoisted(() => vi.fn());
vi.mock('../OpenMPTExporter', () => ({ exportWithOpenMPT: openMpt }));
// The Furnace fixture is not a Neo Geo song; its content checks are covered in furnaceModuleExporter.test.ts.
// Here the router only has to reach the exporter.
const furExport = vi.hoisted(() => vi.fn());
vi.mock('../FurnaceModuleExporter', async (orig) => ({ ...(await orig<typeof import('../FurnaceModuleExporter')>()), exportFurnaceModule: furExport }));

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));

async function load(rel: string): Promise<TrackerSong> {
  return parseAs(rel, readFixture(rel));
}

describe('exportNativeSong reaches the existing exporter', () => {
  it.each([
    ['xm', 'public/data/songs/xm/flo boarding - level 1.xm'],
    ['it', 'public/data/songs/impulse-tracker/absm chain mod.it'],
    ['s3m', 'public/data/songs/s3m/andante.s3m'],
  ])('%s goes to the OpenMPT writer in its own format', async (format, rel) => {
    openMpt.mockResolvedValueOnce({ data: new Blob([format]), filename: `x.${format}`, warnings: [] });
    const song = await load(rel);
    expect(selectNativeExporter(song)?.id).toBe('openMpt');
    const out = await exportNativeSong(song);
    expect(openMpt).toHaveBeenLastCalledWith(song.patterns, song.instruments, song.songPositions, expect.objectContaining({ format }));
    expect(new TextDecoder().decode(out!.data)).toBe(format);
  });

  it('mod writes a ProTracker module', async () => {
    const song = await load('public/data/songs/mod/break the box.mod');
    expect(selectNativeExporter(song)?.id).toBe('mod');
    const out = await exportNativeSong(song);
    expect(out!.filename).toMatch(/\.mod$/);
    expect(['M.K.', 'M!K!', '4CHN', 'FLT4']).toContain(ascii(out!.data, 1080, 4));
  });

  it('dtm writes a Digital Tracker module', async () => {
    const song = await load('public/data/songs/digital-tracker-dtm/sonic subspace.dtm');
    expect(selectNativeExporter(song)?.id).toBe('dtm');
    const out = await exportNativeSong(song);
    expect(ascii(out!.data, 0, 4)).toBe('D.T.');
  });

  it('fur: a real Furnace file never goes to the OpenMPT writer; with a Neo Geo voice it writes a Furnace module', async () => {
    const rel = 'public/data/songs/furnace/misc/Inner Machinations YM2610B.fur';
    const bytes = readFixture(rel);
    const song = await parseFurnaceFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'x.fur');
    expect(selectNativeExporter(song)?.id).not.toBe('openMpt');
    // The fixture is a 16-channel YM2610B; the Neo Geo chip has 14.
    const neo = {
      ...song,
      instruments: song.instruments.map((i) => ({ ...i, synthType: NEO_GEO_SYNTH_TYPE, furnace: {} })),
      numChannels: 14,
      patterns: song.patterns.map((p) => ({ ...p, channels: p.channels.slice(0, 14) })),
    } as TrackerSong;
    expect(selectNativeExporter(neo)?.id).toBe('fur');
    furExport.mockReturnValueOnce({ bytes: new Uint8Array([1, 2, 3]), warnings: [] });
    const out = await exportNativeSong(neo);
    expect(furExport).toHaveBeenCalledOnce();
    expect(out!.filename).toMatch(/\.fur$/);
    expect([...out!.data]).toEqual([1, 2, 3]);
  });

  // Formats libopenmpt-family songs are parsed from: the in-place layout patch writes them, never the raw original unseen.
  it.each([
    ['mtm', 'anonymous in 4ce.mtm'],
    ['stm', 'slideshow i.stm'],
    ['ptm', 'rew_vibr.ptm'],
    ['gdm', "breakin's chipsong.gdm"],
    ['ult', 'seasons.ult'],
    ['669', 'fonetag.669'],
  ])('%s is written by the layout patch / layout exporter', async (ext, name) => {
    const rel = relative(process.cwd(), songFile(name));
    const bytes = readFixture(rel);
    const song = { ...(await load(rel)), uadeEditableFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), uadeEditableFileName: name } as TrackerSong;
    const out = await exportNativeSong(song);
    expect(out).not.toBeNull();
    expect(out!.filename).toMatch(new RegExp(`\\.${ext}$`));
  });

  it('psm (parsed as S3M) goes to the OpenMPT writer', async () => {
    openMpt.mockResolvedValueOnce({ data: new Blob(['s3m']), filename: 'x.s3m', warnings: [] });
    const song = await load('public/data/songs/psm/Epic Pinball - Song 0 - Title.psm');
    expect(selectNativeExporter(song)?.id).toBe('openMpt');
    await exportNativeSong(song);
    expect(openMpt).toHaveBeenLastCalledWith(song.patterns, song.instruments, song.songPositions, expect.objectContaining({ format: 's3m' }));
  });

  it('amf (parsed as MOD, no layout) is converted by the ProTracker writer and says so', async () => {
    const song = await load('public/data/songs/advanced-music-format/avoid.amf');
    expect(selectNativeExporter(song)?.id).toBe('mod');
    const out = await exportNativeSong(song);
    expect(out!.warnings.join(' ')).toMatch(/converted to a ProTracker MOD/);
  });

  it('amf as the app loads it (no writer): an edited grid comes back as the original with a warning that the edit is missing', async () => {
    const { useFormatStore } = await import('@stores/useFormatStore');
    const { baselineOf, setGridBaseline } = await import('@/lib/song/gridBaseline');
    const rel = 'public/data/songs/advanced-music-format/avoid.amf';
    const bytes = readFixture(rel);
    const base = await load(rel);
    useFormatStore.setState({ libopenmptFileData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, uadeEditableFileName: 'avoid.amf' });
    const song = { ...base, format: 'AMF_DSMI', patterns: structuredClone(base.patterns) } as unknown as TrackerSong;
    setGridBaseline(baselineOf(song.patterns));
    const warn = (await exportNativeSong(song))!.warnings.join(' ');
    expect(warn).not.toMatch(/edits are not included/);
    song.patterns[0].channels[0].rows[0] = { ...song.patterns[0].channels[0].rows[0], note: 49 };
    expect((await exportNativeSong(song))!.warnings.join(' ')).toMatch(/edits are not included/);
  });

  it('fur without Neo Geo voices warns instead of returning the original silently', async () => {
    const bytes = readFixture('public/data/songs/furnace/misc/Inner Machinations YM2610B.fur');
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = { ...(await parseFurnaceFile(buf, 'x.fur')), uadeEditableFileData: buf, uadeEditableFileName: 'x.fur' } as TrackerSong;
    expect(selectNativeExporter(song)?.id).toBe('furNoWriter');
    const out = await exportNativeSong(song);
    expect(out!.warnings.join(' ')).toMatch(/edits are not included/);
  });
});
