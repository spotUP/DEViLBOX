/**
 * Riff Raff effect-column edits (volume): Set Volume (V) is the argument byte of a stream command (the slide rates R, G and
 * pitch slide P, Q take the same path but no corpus song uses them; bombfusion.riff has no effect command at all), so a changed value is a one-byte patch that reloads as the edit. Real corpus files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { RR_FX } from '@lib/import/formats/commandStreamEffectGlyphs';
import { cellEffects } from '@lib/import/formats/cellEffectSlots';

const FILES = [
  { path: 'public/data/songs/riff-raff/riffraff_smallest.riff', name: 'riffraff_smallest.riff' },
  { path: 'public/data/songs/riff-raff/sidewinder2.riff', name: 'sidewinder2.riff' },
];

async function load(file: { path: string; name: string }, bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), file.path)));
  return { raw, song: await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], file.name)) };
}

describe.each(FILES)('Riff Raff effect value edits: $name', (file) => {
  for (const [label, typ] of [['volume (V)', RR_FX.setVolume]] as const) {
    it(`writes a changed ${label} value as one byte and reloads it`, async () => {
      const { raw, song } = await load(file);
      let hit: { p: number; c: number; r: number; slot: number } | null = null;
      song.patterns.forEach((p, pi) => p.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
        if (hit) return;
        const i = cellEffects(cell).findIndex((e) => e[0] === typ);
        if (i >= 0) hit = { p: pi, c, r, slot: i };
      })));
      expect(hit, `${file.name} has a ${label} command`).not.toBeNull();
      const h = hit as unknown as { p: number; c: number; r: number; slot: number };
      const cell = song.patterns[h.p].channels[h.c].rows[h.r] as unknown as Record<string, number>;
      const key = h.slot === 0 ? 'eff' : `eff${h.slot + 1}`;
      const next = cell[key] === 0x20 ? 0x21 : 0x20;
      cell[key] = next;
      const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
      const res = await exportNativeSong(song);
      if (!res) throw new Error('no native export');
      expect(res.warnings.filter((w) => /not written/.test(w))).toEqual([]);
      expect(res.data.length).toBe(raw.length);
      expect(raw.reduce((n, x, i) => n + (x !== res.data[i] ? 1 : 0), 0)).toBe(1);
      const again = await load(file, res.data);
      const got = cellEffects(again.song.patterns[h.p].channels[h.c].rows[h.r])[h.slot];
      expect(got).toEqual([typ, next]);
    }, 240000);
  }
});
