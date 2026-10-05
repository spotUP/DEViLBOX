/**
 * Jochen Hippel Atari ST COSO (.soc) plays through UADE's ST player.
 *
 * Under its own name the file reached UADE's Amiga Hippel-COSO player and
 * rendered silence (`ghostbattle titletune.soc`, jukebox "Silent"). The ST
 * player (`hst` prefix) plays it; uadePlayerHint makes the rename for every
 * UADE load (2026-10-05, research doc 2026-10-05_hippel-st-replayer.md R1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadUADEModule, readMeta, renderToSamples } from '../../../../tools/uade-audit/uadeRenderCore';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

describe('Hippel ST .soc', () => {
  it('names the ST player for .soc and leaves other names alone', () => {
    expect(uadePlayerHint('ghostbattle titletune.soc')).toBe('ghostbattle titletune.hst');
    expect(uadePlayerHint('prehistoric_tale.hipc')).toBe('prehistoric_tale.hipc');
  });

  it('ghostbattle titletune.soc renders audio through Jochen Hippel ST', async () => {
    const data = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/hippel-st-coso/ghostbattle titletune.soc')));
    const mod = await loadUADEModule(false);
    expect(mod._uade_wasm_init(44100)).toBe(0);
    try {
      const r = await renderToSamples(mod, data, 'ghostbattle titletune.soc', { sampleRate: 44100, seconds: 4 });
      expect(readMeta(mod).player).toMatch(/Hippel ST/i);
      let sum = 0;
      for (let i = 0; i < r.samples.length; i++) sum += r.samples[i] * r.samples[i];
      expect(Math.sqrt(sum / r.samples.length)).toBeGreaterThan(0.05);
    } finally {
      try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
    }
  }, 60_000);
});
