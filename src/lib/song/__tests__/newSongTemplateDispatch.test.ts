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
 * Templates this test cannot judge. OpenMPT parses these in the browser; its
 * WASM does not load under node, so the dispatch never reaches a native parser
 * here. SCUMM's template is the real song zaktitle.scumm; its parser is a stub
 * whose magic check rejects that file, so UADE builds the grid by design.
 */
const NOT_JUDGED = new Set(['digiBoosterPro', 'digitalSymphony', 'ims', 'kris', 'scumm']);

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
    },
    120_000,
  );
});
