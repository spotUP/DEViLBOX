/**
 * Jason Brooke version B (early game driver, sjs.jb) has no decoded grid: the pattern is a placeholder. An edit on it
 * must not reach the file; export leaves the module byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJasonBrookeFile } from '@/lib/import/formats/JasonBrookeParser';
import { exportJasonBrooke } from '@/lib/export/JasonBrookeExporter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

describe('Jason Brooke version B placeholder grid', () => {
  it('a note edit is not written into the module', async () => {
    const raw = readFileSync('public/data/songs/formats/Scott Johnston/sjs.jb');
    const bytes = new Uint8Array(raw);
    const song = parseJasonBrookeFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, 'sjs.jb');
    expect(song.uadeVariableLayout).toBeUndefined();
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[0].channels[0].rows[0] = { ...song.patterns[0].channels[0].rows[0], note: 49, instrument: 1 };
    const out = await exportJasonBrooke(song);
    expect(out.warnings.join(' ')).toMatch(/version B edits are refused/);
    expect(Buffer.from(out.data).equals(bytes)).toBe(true);
  });
});
