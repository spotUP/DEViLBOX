/**
 * Sound Factory effect commands in the grid (goldrunner.psf): every effect opcode the voice walk meets lands in a
 * cell slot (counts per effect id, seen == placed), and a value edit is written over its operand byte only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';
import { exportSoundFactory } from '@/lib/export/SoundFactoryExporter';
import { SF_EFFECT_NAMES, SF_FX_BASE } from '../soundFactoryEffectGlyphs';
import { BD_FX } from '../benDaglishEffectGlyphs';
import { SF_MAX_EFFECT_SLOTS } from '../soundFactoryGrid';
import type { TrackerCell } from '@/types';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/goldrunner.psf');
const load = () => new Uint8Array(readFileSync(FIXTURE));
const SLOT_TYP = ['effTyp', 'effTyp2', 'effTyp3', 'effTyp4', 'effTyp5', 'effTyp6', 'effTyp7', 'effTyp8'] as const;
const SLOT_VAL = ['eff', 'eff2', 'eff3', 'eff4', 'eff5', 'eff6', 'eff7', 'eff8'] as const;

/** Sound Factory effect ids: its own block plus the shared Ben Daglish volume / transpose ids. */
const isSfEffect = (t: number): boolean => (t >= SF_FX_BASE && t < SF_FX_BASE + SF_EFFECT_NAMES.length) || t === BD_FX.channelVolume || t === BD_FX.transpose;

/** Effect operands counted from the cells themselves (the independent side of the check). */
function countInCells(patterns: TrackerSong['patterns']): Map<number, number> {
  const m = new Map<number, number>();
  for (const pat of patterns) for (const ch of pat.channels) for (const cell of ch.rows) {
    const c = cell as unknown as Record<string, number | undefined>;
    for (let k = 0; k < SF_MAX_EFFECT_SLOTS; k++) {
      const t = c[SLOT_TYP[k]] ?? 0;
      if (isSfEffect(t)) m.set(t, (m.get(t) ?? 0) + 1);
    }
  }
  return m;
}

describe('Sound Factory effect commands on goldrunner.psf', () => {
  it('places every effect operand the walk meets, per effect id', () => {
    const r = parseSoundFactoryWithEffects(load(), 'goldrunner.psf')!;
    expect(r.effectsSeen, 'goldrunner has effect commands').toBeGreaterThan(0);
    const inCells = countInCells(r.song.patterns);
    for (const [id, c] of r.effectCounts) {
      expect(inCells.get(id) ?? 0, `effect ${id.toString(16)} seen ${c.seen}`).toBe(c.seen);
      expect(c.placed).toBe(c.seen);
    }
    expect(r.effectsPlaced).toBe(r.effectsSeen);
    for (const ch of r.song.patterns[0].channels) {
      expect(ch.channelMeta?.effectCols).toBeGreaterThanOrEqual(2);
      expect(ch.channelMeta?.effectCols).toBeLessThanOrEqual(SF_MAX_EFFECT_SLOTS);
    }
  });

  it('writes an edited Vibrato (or most common) operand over its byte and nothing else', async () => {
    const src = load();
    const r = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    // The most common single-byte-safe operand (not a length-changing enable byte).
    const target = [...r.effectCounts].filter(([id]) => isSfEffect(id)).sort((a, b) => b[1].seen - a[1].seen)
      .map(([id]) => id).find((id) => ![SF_FX_BASE + 4, SF_FX_BASE + 5].includes(id));
    expect(target).toBeDefined();
    const pats = r.song.patterns;
    let hit: TrackerCell | undefined; let slot = -1; let off = -1;
    outer: for (const [c, map] of r.effectOffsets.entries()) for (const [row, offs] of map) {
      const cell = pats[Math.floor(row / 64)].channels[c].rows[row % 64] as unknown as Record<string, number>;
      for (let k = 0; k < SF_MAX_EFFECT_SLOTS; k++) if (cell[SLOT_TYP[k]] === target && offs[k] >= 0 && cell[SLOT_VAL[k]] !== 0) {
        hit = cell as unknown as TrackerCell; slot = k; off = offs[k]; break outer;
      }
    }
    expect(hit, 'a placed cell with a non-zero operand').toBeDefined();
    const was = src[off];
    const now = (was ^ 0x05) || 0x07;
    (hit as unknown as Record<string, number>)[SLOT_VAL[slot]] = now;

    const song = { ...r.song, patterns: pats } as typeof r.song;
    const out = new Uint8Array(await (await exportSoundFactory(song)).data.arrayBuffer());
    expect(out.length).toBe(src.length);
    // Every cell sharing that operand byte (a subroutine played twice) shows the new value; no other byte moved.
    const diff: number[] = [];
    for (let i = 0; i < src.length; i++) if (src[i] !== out[i]) diff.push(i);
    expect(diff).toEqual([off]);
    expect(out[off]).toBe(now);
    const re = parseSoundFactoryWithEffects(out, 'goldrunner.psf')!;
    expect(re.effectsSeen).toBe(r.effectsSeen);
    expect(countInCells(re.song.patterns)).toEqual(countInCells(r.song.patterns));
  });

  it('every Sound Factory module in the corpus places all of its effect operands', () => {
    const dirs = ['public/data/songs/formats', 'public/data/songs/soundfactory'];
    let files = 0, effects = 0;
    for (const d of dirs) {
      for (const f of readdirSync(join(process.cwd(), d)).filter((n) => n.toLowerCase().endsWith('.psf'))) {
        const r = parseSoundFactoryWithEffects(new Uint8Array(readFileSync(join(process.cwd(), d, f))), f);
        if (!r) continue;
        files++; effects += r.effectsSeen;
        expect(r.effectsPlaced, f).toBe(r.effectsSeen);
      }
    }
    expect(files).toBeGreaterThan(0);
    expect(effects).toBeGreaterThan(0);
  });
});
