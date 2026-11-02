/**
 * A blank New Song template opens with its own parser, never UADE (plan
 * 2026-11-01-new-song-any-format, N12). The live MCP check found two templates
 * that the product import handed to UADE, which cannot play them: MONOTONE
 * (the injectUADE branch sent a zero-note native parse to UADE) and ANSI music
 * (detection required a note, so the rest-only template fell through). The
 * property test parses each template with its parser directly and missed both;
 * this test drives parseModuleToSong, the dispatch a dropped file and the
 * wizard's openSong take, and fails on any template that reaches UADE.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listNewSongFormats } from '@lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { installDwNodeFetch } from '@lib/import/__tests__/helpers/dwNodeFetch';

const uadeCalls: string[] = [];
vi.mock('@lib/import/formats/UADEParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/import/formats/UADEParser')>();
  return {
    ...actual,
    parseUADEFile: vi.fn(async (_buf: ArrayBuffer, name: string) => {
      uadeCalls.push(name);
      throw new Error(`UADE reached for ${name}`);
    }),
  };
});

import { parseModuleToSong } from '@lib/import/parseModuleToSong';

/**
 * Templates this test cannot judge. SCUMM's template is the real song
 * zaktitle.scumm; its parser is a stub whose magic check rejects that file, so
 * UADE builds the grid by design.
 */
const NOT_JUDGED = new Set(['scumm']);

const formats = listNewSongFormats().filter((f) => !NOT_JUDGED.has(f.formatId));

describe('New Song templates open through the product import without UADE', () => {
  let restoreFetch: () => void = () => {};
  beforeAll(() => {
    restoreFetch = installDwNodeFetch();
  });
  afterAll(() => restoreFetch());

  it.each(formats.map((f) => [f.formatId, f.template] as const))(
    '%s: %s opens with its own parser',
    async (_formatId, template) => {
      const raw = readFileSync(join('public', template));
      const name = template.split('/').pop()!;
      const before = uadeCalls.length;
      const song = await parseModuleToSong(new File([new Uint8Array(raw)], name));
      expect(uadeCalls.slice(before), `${template} reached UADE`).toEqual([]);
      expect(song.patterns.length).toBeGreaterThan(0);
      // Live: the Future Player New Song opened with 1599 notes of Hybris. Its template kept the source's
      // other subsongs, subsong 0 (all rests) probed silent, and the import's subsong chooser took the
      // first tune that sounds. A New Song is blank on every open path, so no template holds a note.
      const notes = song.patterns.reduce(
        (n, p) => n + p.channels.reduce((m, ch) => m + ch.rows.filter((c) => c.note > 0 && c.note < 97).length, 0),
        0,
      );
      expect(notes, `${template} opens with notes`).toBe(0);
    },
    120_000,
  );

  // Live: an IMS New Song exported as Untitled.mod (the .ims extension went
  // to OpenMPT, which labels the song MOD). DigiBooster Pro and Digital
  // Symphony opened as a classic XM with no native exporter, and the KRIS
  // template failed to load in OpenMPT: all three extensions went to OpenMPT
  // and skipped the parser that carries the pattern layout.
  it.each([
    ['ims', /\.ims$/],
    ['digiBoosterPro', /\.dbm$/],
    ['digitalSymphony', /\.dsym$/],
    ['kris', /\.kris$/],
  ] as const)('%s: the template exports in its own format through the product import', async (formatId, ext) => {
    const template = listNewSongFormats().find((f) => f.formatId === formatId)!.template;
    const raw = readFileSync(join('public', template));
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], template.split('/').pop()!));
    const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
    const out = await exportNativeSong(song);
    expect(out?.filename).toMatch(ext);
  }, 120_000);

  // Live: a note typed on the Digital Symphony and KRIS New Song templates was
  // silent. The DSym template had no sample audio (the parser dropped it and
  // the export never reopened), and KRIS had no template at all.
  it.each(['digitalSymphony', 'kris'])('%s: the template opens with a sample a typed note can play', async (formatId) => {
    const template = listNewSongFormats().find((f) => f.formatId === formatId)!.template;
    const raw = readFileSync(join('public', template));
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], template.split('/').pop()!));
    const withAudio = song.instruments.filter((i) => (i.sample?.audioBuffer?.byteLength ?? 0) > 44);
    expect(withAudio.length, `${template} has no sample audio`).toBeGreaterThan(0);
  }, 120_000);

  // N13a/N13b: the KRIS and Digital Symphony templates listed every unused slot
  // as an instrument (23 silent 'Synthetic' entries; 63 slots with 7 filled).
  // The listed instruments are exactly the ones the file defines.
  it.each(['kris', 'digitalSymphony'])('%s: the template lists only instruments that hold audio', async (formatId) => {
    const template = listNewSongFormats().find((f) => f.formatId === formatId)!.template;
    const raw = readFileSync(join('public', template));
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], template.split('/').pop()!));
    const silent = song.instruments.filter((i) => (i.sample?.audioBuffer?.byteLength ?? 0) <= 44);
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(silent.map((i) => i.id), `${template} lists silent instruments`).toEqual([]);
  }, 120_000);

  // N13c: the New Song wizard's "with instruments" choice for a system preset (Jochen Hippel CoSo)
  // offers real CoSo instruments (HippelCoSoSynth, from a real CoSo song), not Sampler saws.
  // Sequences, export and rendering are judged in src/constants/__tests__/hippelCosoStarters.test.ts.
  it('the CoSo system preset offers CoSo instruments', async () => {
    const { getInstrumentPresetsForSystem } = await import('@constants/uadeInstrumentPresets');
    const starters = getInstrumentPresetsForSystem('uade_hippelcoso');
    expect(starters.length).toBeGreaterThan(0);
    expect(starters.map((i) => i.synthType)).toEqual(starters.map(() => 'HippelCoSoSynth'));
  });
});

