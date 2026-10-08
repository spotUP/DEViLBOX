/**
 * MCP load_file names a GoatTracker .sng "GoatTracker", not "Zound Monitor"
 * (U4.3, 2026-10-08: the label was picked by the extension alone, and .sng is
 * shared). A Zound Monitor song and a plain-named file keep their labels.
 */
import { describe, it, expect, vi } from 'vitest';

const opened = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/song/openSong', () => ({
  openSong: vi.fn(async () => { opened.calls++; return { ok: true, engine: 'x', editorMode: 'classic' }; }),
}));

const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

describe('load_file reports the format by the content', { timeout: 90000 }, () => {
  it('a .sng starting GTS5 is reported as GoatTracker', async () => {
    const { loadFile } = await import('../writeHandlers');
    const r = await loadFile({ filename: 'tune.sng', data: b64('GTS5' + '\0'.repeat(64)) });
    expect(opened.calls).toBe(1);
    expect(r.format).toBe('GoatTracker');
  });

  it('a .sng without the GoatTracker magic keeps its extension label', async () => {
    const { loadFile } = await import('../writeHandlers');
    const { detectFormat } = await import('@/lib/import/FormatRegistry');
    const r = await loadFile({ filename: 'tune.sng', data: b64('\0'.repeat(64)) });
    expect(r.format).toBe(detectFormat('tune.sng')?.label ?? 'Unknown');
    expect(r.format).not.toBe('GoatTracker');
  });
});
