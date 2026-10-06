/**
 * The format setting defaulted Chuck Biscuits (.cba, an Atari ST format that
 * UADE, an Amiga player, cannot play) to 'uade', while the .cba import route
 * ignored the setting and always used libopenmpt. The route now honours the
 * setting: 'native' runs our ChuckBiscuitsParser, anything else libopenmpt.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIBOPENMPT_SONG = { name: 'from libopenmpt', patterns: [], instruments: [] };
vi.mock('@lib/import/wasm/OpenMPTConverter', () => ({
  parseWithOpenMPT: vi.fn(async () => LIBOPENMPT_SONG),
}));

// The repo's only .cba (jukebox chiptracker.cba) is not a Chuck Biscuits file
// (no 'CBA\xF9' magic); libopenmpt sniffs it by content. A genuine CBA is built here:
// 332-byte header, one 4-channel pattern of empty cells, no samples.
const cba = new Uint8Array(332 + 64 * 4 * 5);
cba.set([0x43, 0x42, 0x41, 0xF9]);
cba[36] = 0x1A; cba[39] = 4; cba[41] = 1; cba[43] = 6; cba[44] = 125;
const buf = () => cba.buffer.slice(0) as ArrayBuffer;
const other = readFileSync(join(process.cwd(), 'public/data/songs/formats/chiptracker.cba'));
const otherBuf = () => other.buffer.slice(other.byteOffset, other.byteOffset + other.byteLength) as ArrayBuffer;

describe('Chuck Biscuits routing follows the setting', () => {
  it('defaults to our own parser, not UADE', async () => {
    const { useSettingsStore } = await import('@stores/useSettingsStore');
    expect(useSettingsStore.getState().formatEngine.chuckBiscuits).toBe('native');
  });

  it("'native' parses with ChuckBiscuitsParser and keeps the file for libopenmpt playback", async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const song = await tryRouteFormat(buf(), 'chiptracker.cba', 'chiptracker.cba', { chuckBiscuits: 'native' } as never, 0);
    expect(song).not.toBe(LIBOPENMPT_SONG);
    expect(song?.patterns.length).toBeGreaterThan(0);
    expect(song?.libopenmptFileData?.byteLength).toBe(cba.byteLength);
  });

  it("a .cba that is not Chuck Biscuits (jukebox chiptracker.cba) still goes to libopenmpt", async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const song = await tryRouteFormat(otherBuf(), 'chiptracker.cba', 'chiptracker.cba', { chuckBiscuits: 'native' } as never, 0);
    expect(song).toBe(LIBOPENMPT_SONG);
  });

  it("any other setting goes to libopenmpt (UADE cannot play .cba)", async () => {
    const { tryRouteFormat } = await import('../parsers/AmigaFormatParsers');
    const song = await tryRouteFormat(buf(), 'chiptracker.cba', 'chiptracker.cba', { chuckBiscuits: 'uade' } as never, 0);
    expect(song).toBe(LIBOPENMPT_SONG);
  });
});
