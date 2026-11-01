/**
 * Every New Song format starts from a template that is a working song in that
 * format (plan 2026-11-01-new-song-any-format, N10). For each descriptor with
 * `newSong`: the template file exists, parses as its own format, exports through
 * exportNativeSong (the Export dialog's and MCP's dispatcher), and the export parses again with the same pattern and
 * channel counts. That the wizard and MCP reach these templates through
 * startNewSong and openSong is proven once in newSongInFormat.test.ts (N11).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listNewSongFormats } from '@lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { exportNativeSong } from '@lib/export/nativeExportRouter';
import { normalizeExport, parseAs, readFixture } from '@lib/export/__tests__/exporterHarness.shared';
import { installDwNodeFetch } from '@lib/import/__tests__/helpers/dwNodeFetch';

const formats = listNewSongFormats();

/**
 * Formats the product saves through OpenMPT, not the native router: FT2 Save
 * and MCP export_mod call exportModuleFile when exportNativeFile is null. A
 * loaded MOD has no native serializer by design (nativeExportTakesEdits.test).
 * OpenMPT's WASM does not load under node, so these rows check the parse and
 * that the router leaves the song to OpenMPT.
 */
const SAVED_BY_OPENMPT = new Set(['mod']);

describe('New Song templates', () => {
  // The DW parser walks the song in the replayer's WASM to match its grid; in the
  // browser that bundle is fetched from public/davidwhittaker/, here from disk.
  let restoreFetch: () => void = () => {};
  // exportNativeSong imports the store graph lazily; under vitest the first cold
  // transform of that graph takes about a minute, which would land on whichever
  // row exports first. Load it once here so each row times only its own work.
  beforeAll(async () => {
    restoreFetch = installDwNodeFetch();
    await import('@stores/useFormatStore');
  }, 180_000);
  afterAll(() => restoreFetch());

  it('offers at least the 45 formats with a committed template', () => {
    expect(formats.length).toBeGreaterThanOrEqual(45);
  });

  it.each(formats.map((f) => [f.formatId, f.template] as const))(
    '%s: %s parses, exports and re-imports with the same shape',
    async (formatId, template) => {
      const rel = join('public', template);
      expect(existsSync(rel), `${rel} missing`).toBe(true);
      const song = await parseAs(rel, readFixture(rel));
      expect(song.patterns.length).toBeGreaterThan(0);

      // The product's one native-export dispatcher (Export dialog, MCP export_native).
      const res = await exportNativeSong(song);
      if (SAVED_BY_OPENMPT.has(formatId)) {
        expect(res, `${template}: saved by OpenMPT, not the native router`).toBeNull();
        return;
      }
      expect(res, `${template}: no native exporter for the template song`).not.toBeNull();
      const out = await normalizeExport(res!.data);
      expect(out.length).toBeGreaterThan(0);

      const again = await parseAs(rel, out);
      expect(again.patterns.length).toBe(song.patterns.length);
      expect(again.patterns[0].channels.length).toBe(song.patterns[0].channels.length);
    },
  );
});
