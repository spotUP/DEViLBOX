/**
 * .puma went to libopenmpt first and only fell back to our parser when that
 * threw - which never happens in the browser, so the PumaTracker WASM never
 * played in the app (headless, libopenmpt cannot load, which hid it). Our
 * parser + engine first; libopenmpt keeps what the parser refuses
 * (2026-10-06, owner rule: our own engine when we have one).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIBOPENMPT_SONG = { name: 'from libopenmpt', patterns: [], instruments: [] };
vi.mock('@lib/import/wasm/OpenMPTConverter', () => ({
  parseWithOpenMPT: vi.fn(async () => LIBOPENMPT_SONG),
}));

const bytes = (rel: string) => { const b = readFileSync(join(process.cwd(), rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

describe('PumaTracker routing', () => {
  it('a .puma song plays on our PumaTracker engine even when libopenmpt can read it', async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const song = await tryRouteFormat(bytes('public/data/songs/pumatracker/liquid kids - lv1a.puma'), 'liquid kids - lv1a.puma', 'liquid kids - lv1a.puma', {} as never, 0);
    expect(song).not.toBe(LIBOPENMPT_SONG);
    expect((song as { pumaTrackerFileData?: ArrayBuffer }).pumaTrackerFileData?.byteLength).toBeGreaterThan(0);
  }, 60_000);

  it('a file the parser refuses still goes to libopenmpt', async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const song = await tryRouteFormat(new ArrayBuffer(64), 'junk.puma', 'junk.puma', {} as never, 0);
    expect(song).toBe(LIBOPENMPT_SONG);
  });
});
