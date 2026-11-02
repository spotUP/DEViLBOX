/**
 * N13c: the New Song wizard's "with instruments" choice for the Jochen Hippel CoSo
 * system preset offers real HippelCoSoSynth instruments, taken from a real CoSo song
 * (Wings of Death, level 3) through the CoSo parser. They were looping one-cycle saw
 * Sampler instruments: audible, but not CoSo instruments and not exportable as CoSo.
 *
 * The asset src/constants/data/hippelCosoStarters.json is generated from the parser by
 * this test: run with REGEN_HIPPEL_STARTERS=1 to rewrite it. Without the variable the
 * test fails when the asset no longer matches what the parser builds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHippelCoSoFile } from '@lib/import/formats/HippelCoSoParser';
import { HIPPEL_COSO_STARTER_SOURCE, HIPPEL_COSO_STARTER_INSTRUMENTS } from '@constants/uadeInstrumentPresets';
import { getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { serializeHippelCoSoConfig } from '@/engine/hippelcoso/HippelCoSoSynth';
import { chainedHeapTransform, previewVoice, renderTicks } from '@/engine/__tests__/keyboardPreviewHarness';
import { exportNativeSong } from '@lib/export/nativeExportRouter';
import type { HippelCoSoConfig } from '@typedefs/instrument';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ASSET = resolve(import.meta.dirname, '../data/hippelCosoStarters.json');
const SONG = resolve(import.meta.dirname, '../../../public/data/songs', HIPPEL_COSO_STARTER_SOURCE.file);

async function fromParser() {
  const raw = readFileSync(SONG);
  const song = await parseHippelCoSoFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, 'starter.hipc');
  return HIPPEL_COSO_STARTER_SOURCE.instruments.map((n) => {
    const hc = (song.instruments[n - 1] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso;
    const { sampleBank: _bank, ...config } = hc;
    return { name: `CoSo ${n}`, hippelCoso: config };
  });
}

describe('Hippel CoSo starter instruments asset', () => {
  it('matches what the CoSo parser builds from the source song', async () => {
    const built = await fromParser();
    if (process.env.REGEN_HIPPEL_STARTERS) writeFileSync(ASSET, JSON.stringify(built));
    const asset = JSON.parse(readFileSync(ASSET, 'utf8'));
    expect(asset).toEqual(built);
    expect(HIPPEL_COSO_STARTER_INSTRUMENTS.length).toBe(HIPPEL_COSO_STARTER_SOURCE.instruments.length);
  });

  it('the system preset offers HippelCoSoSynth instruments with sequences and sample data, not Sampler saws', () => {
    const starters = getInstrumentPresetsForSystem('uade_hippelcoso');
    expect(starters.length).toBeGreaterThan(0);
    for (const inst of starters) {
      const hc = inst.hippelCoso as HippelCoSoConfig;
      expect(inst.synthType, `${inst.name} synth type`).toBe('HippelCoSoSynth');
      expect(hc.fseq.length, `${inst.name} frequency sequence`).toBeGreaterThan(0);
      expect(hc.vseq.length, `${inst.name} volume sequence`).toBeGreaterThan(0);
    }
    expect(starters.some((i) => ((i.hippelCoso as HippelCoSoConfig).samples ?? []).some((smp) => smp.pcm.length > 0))).toBe(true);
  });

  it('a New Song built from the starters exports through the native router as CoSo, sample bank included', async () => {
    const tpl = readFileSync(resolve(import.meta.dirname, '../../../public/templates/hippelCoSo.hipc'));
    const base = await parseHippelCoSoFile(tpl.buffer.slice(tpl.byteOffset, tpl.byteOffset + tpl.byteLength) as ArrayBuffer, 'hippelCoSo.hipc');
    const starters = getInstrumentPresetsForSystem('uade_hippelcoso');
    const song = {
      ...base,
      hippelFileData: undefined,
      instruments: starters.map((s, i) => ({ id: i + 1, effects: [], ...s })),
    } as unknown as TrackerSong;
    const out = await exportNativeSong(song);
    expect(out, 'router returned nothing').not.toBeNull();
    const bytes = new Uint8Array(await new Blob([out!.data as BlobPart]).arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('COSO');
    expect(out!.filename).toMatch(/\.(coso|hipc)$/);
    // Reading the export back gives instruments that still carry the starters' sample data.
    const back = await parseHippelCoSoFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, out!.filename);
    const pcm = (back.instruments as unknown as { hippelCoso: HippelCoSoConfig }[])
      .reduce((n, i) => n + (i.hippelCoso.samples ?? []).reduce((m, smp) => m + smp.pcm.length, 0), 0);
    expect(pcm, 'exported CoSo holds no sample data').toBeGreaterThan(0);
  }, 60_000);

  it('a note on each starter renders audio through the CoSo voice', { timeout: 120000 }, async () => {
    for (const inst of getInstrumentPresetsForSystem('uade_hippelcoso')) {
      const v = await previewVoice('hippel-coso', 'HippelCoSo', serializeHippelCoSoConfig(inst.hippelCoso as HippelCoSoConfig), 43, 100, chainedHeapTransform);
      const out = renderTicks(v.proc, 30, 0);
      expect(Math.max(...out.map(Math.abs)), `${inst.name} is silent`).toBeGreaterThan(1e-3);
    }
  });
});
