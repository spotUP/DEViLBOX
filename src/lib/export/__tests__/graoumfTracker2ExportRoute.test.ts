/** A .gt2 loaded through the product load path (tryRouteFormat) exports through the GT2 re-packer, not the chip-RAM writer or raw libopenmpt bytes. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tryRouteFormat } from '@lib/import/parsers/AmigaFormatParsers';
import { selectNativeExporter, exportNativeSong } from '../nativeExportRouter';

const NAME = 'living-on-video.gt2';
const FIXTURE = join(process.cwd(), 'public/data/songs/graoumf-tracker-2', NAME);

describe('GT2 native export route', () => {
  it('a loaded .gt2 (carrying libopenmptFileData) takes the layout re-packer, and an edit reaches the export', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await tryRouteFormat(ab, NAME, NAME, {} as never, 0);
    expect(song).toBeTruthy();
    expect(song!.libopenmptFileData, 'playback bytes kept').toBeTruthy();
    expect(song!.uadePatternLayout?.formatId).toBe('graoumfTracker2_gt2');
    expect(selectNativeExporter(song!)?.id).toBe('layoutExporter');

    const cell = song!.patterns[0].channels[0].rows[0];
    song!.patterns[0].channels[0].rows[0] = { ...cell, note: cell.note === 40 ? 41 : 40 };
    const out = await exportNativeSong(song!);
    expect(out?.filename.endsWith('.gt2')).toBe(true);
    expect(Buffer.from(out!.data).equals(b), 'edited export differs from the original').toBe(false);
  });
});
