/**
 * The Scratch Originals pack lists every scratch file that exists on disk.
 *
 * SCR-P0.3 (plan 2026-10-11-scratch-dj-progress.md). The pack list was a
 * hard-coded count (001-053) so scratch_054..057 never reached the sample
 * browser, the pad kit or the record catalogue. The list is now built from
 * the pack's own `manifest.json`; this test reads the directory the browser
 * serves and holds the pack to it. 052 stays out on purpose (a click
 * artifact, `SCRATCH_SKIPPED`).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCRATCH_ORIGINALS_PACK, SCRATCH_SKIPPED } from '../samplePacks';

const PACK_DIR = resolve(process.cwd(), 'public/data/samples/packs/scratch-originals');

describe('Scratch Originals pack lists every pack file (SCR-P0.3)', () => {
  const onDisk = readdirSync(PACK_DIR).filter(f => /^scratch_\d{3}\.wav$/.test(f)).sort();
  const listed = SCRATCH_ORIGINALS_PACK.samples.fx.map(s => s.filename).sort();

  it('lists 56 files: the 57 on disk minus the skipped click artifact', () => {
    expect(onDisk).toHaveLength(57);
    expect(SCRATCH_SKIPPED).toEqual(['scratch_052.wav']);
    expect(listed).toHaveLength(56);
    expect(SCRATCH_ORIGINALS_PACK.sampleCount).toBe(56);
  });

  it('lists scratch_054..057 (the files the hard-coded count hid)', () => {
    for (const n of ['054', '055', '056', '057']) expect(listed).toContain(`scratch_${n}.wav`);
    expect(listed).not.toContain('scratch_052.wav');
  });

  it('equals the directory minus the skipped files; every entry is in manifest.json', () => {
    expect(listed).toEqual(onDisk.filter(f => !SCRATCH_SKIPPED.includes(f)));
    const manifest = JSON.parse(readFileSync(resolve(PACK_DIR, 'manifest.json'), 'utf8')) as { name: string }[];
    const names = new Set(manifest.map(m => m.name));
    for (const f of onDisk) expect(names.has(f), `${f} missing from manifest.json`).toBe(true);
    for (const s of SCRATCH_ORIGINALS_PACK.samples.fx) {
      expect(s.url.endsWith(`scratch-originals/${s.filename}`), s.url).toBe(true);
      expect(s.category).toBe('fx');
    }
  });
});
