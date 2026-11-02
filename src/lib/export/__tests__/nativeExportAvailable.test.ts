/**
 * Plan G23: "is there a Native export for this song?" is answered by the native export router's own exporter
 * table, never by running the export. Regression: the Export dialog probed availability by exporting the whole
 * song on open and on every edit (3fdf11774).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrackerSong } from '@engine/TrackerReplayer';

const exportFC = vi.fn(() => new Uint8Array([1, 2, 3]));
vi.mock('../FCExporter', () => ({ exportFC }));

const song = (extra: Record<string, unknown>): TrackerSong => ({ name: 't', patterns: [], instruments: [], ...extra }) as unknown as TrackerSong;

describe('nativeExportAvailable', { timeout: 120_000 }, () => {
  beforeEach(() => { exportFC.mockClear(); });

  it('asks the table without serializing the song, and the real export still runs the same exporter', async () => {
    const { nativeExportAvailable, exportNativeSong } = await import('../nativeExportRouter');
    const fc = song({ format: 'FC' });
    expect(await nativeExportAvailable(fc)).toBe(true);
    expect(exportFC, 'availability must not run the serializer').not.toHaveBeenCalled();
    const out = await exportNativeSong(fc, {});
    expect(exportFC).toHaveBeenCalledTimes(1);
    expect(out?.filename).toBe('t.fc');
  });

  it('matches the router: exporter formats are available, a format with no exporter is not', async () => {
    const { nativeExportAvailable, selectNativeExporter, exportNativeSong } = await import('../nativeExportRouter');
    const cases: Array<[string, Record<string, unknown>, string | null]> = [
      ['FC', { format: 'FC' }, 'fc'],
      ['Oktalyzer', { format: 'OKT' }, 'oktalyzer'],
      ['SunTronic layout', { format: 'MOD', uadePatternLayout: { formatId: 'sunTronic' } }, 'layoutExporter'],
      ['unknown format', { format: 'XYZ' }, null],
    ];
    for (const [name, extra, id] of cases) {
      const s = song(extra);
      expect(selectNativeExporter(s)?.id ?? null, name).toBe(id);
      expect(await nativeExportAvailable(s), name).toBe(id !== null);
    }
    expect(await exportNativeSong(song({ format: 'XYZ' }), {}), 'the router agrees: nothing to export').toBeNull();
  });
});
