/**
 * boogie.mus is not handed to UADE's UFO player ("module check failed").
 *
 * `.mus` was routed to UADE on its extension alone. UADE's UFO eagleplayer
 * accepts only FORM/DDAT/BODY/CHAN (EP_UFO Check2); boogie.mus is neither
 * that nor a Karl Morton file, so UADE refused it after the import had
 * already written a stray WantedTeam.bin beside it. The route now needs the
 * UFO bytes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const parseUADEFile = vi.fn(async () => ({ name: 'from-uade', patterns: [], instruments: [] }) as unknown as TrackerSong);
vi.mock('@lib/import/formats/UADEParser', async (orig) => ({
  ...(await orig<typeof import('@lib/import/formats/UADEParser')>()),
  parseUADEFile,
}));

const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('.mus routing', () => {
  beforeEach(() => parseUADEFile.mockClear());

  it('does not send boogie.mus (not UFO bytes) to UADE', async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const bytes = new Uint8Array(readFileSync('public/data/songs/formats/boogie.mus'));
    const out = await tryRouteFormat(ab(bytes), 'boogie.mus', 'boogie.mus', {} as never, 0);
    expect(out).toBeNull();
    expect(parseUADEFile).not.toHaveBeenCalled();
  });

  it('still sends a real UFO header (FORM/DDAT/BODY/CHAN) named .mus to UADE', async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const b = new Uint8Array(256);
    const put = (o: number, s: string) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
    put(0, 'FORM'); put(8, 'DDAT'); put(12, 'BODY'); put(20, 'CHAN');
    await tryRouteFormat(ab(b), 'tune.mus', 'tune.mus', {} as never, 0);
    expect(parseUADEFile).toHaveBeenCalledTimes(1);
  });
});
