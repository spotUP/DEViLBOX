/**
 * Every format whose exporter file existed but the router never reached (xm, mod, dtm, fur, it, s3m):
 * a real file loads through its normal parser and exportNativeSong returns that format's exporter output.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseAs, readFixture } from './exporterHarness.shared';
import { exportNativeSong, selectNativeExporter } from '../nativeExportRouter';
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
    ['s3m', 'public/data/songs/formats/andante.s3m'],
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
    const { parseFurnaceFile } = await import('@lib/import/parsers/FurnaceToSong');
    const { NEO_GEO_SYNTH_TYPE } = await import('../FurnaceModuleExporter');
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
});
