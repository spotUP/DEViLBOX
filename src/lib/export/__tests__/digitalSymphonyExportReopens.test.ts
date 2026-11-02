/**
 * A Digital Symphony song exported by DEViLBOX opens again. The exporter wrote
 * all 63 sample name-length bytes first and the sample lengths after them,
 * while the format (OpenMPT Load_dsym, our parser) interleaves each name
 * length with its sample length. Every later field shifted, the parser
 * returned null, and the New Song template could not be built with samples.
 * The LZW packer also wrote an end code the decoder never reads (see
 * DSymLZW.test.ts).
 */
import { it, expect } from 'vitest';
import { parseAs, readFixture, runDescriptorExporter } from './exporterHarness.shared';
import { listEditableFormats } from '@lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { parseDigitalSymphonyFile } from '@lib/import/formats/DigitalSymphonyParser';

it('an exported Digital Symphony song reopens with the same samples and cells', async () => {
  const f = 'public/data/songs/formats/drwho_final4.dsym';
  const song = await parseAs(f, readFixture(f));
  const d = listEditableFormats().find((x) => x.formatId === 'digitalSymphony')!;
  const out = await runDescriptorExporter(d, song);
  const re = await parseDigitalSymphonyFile(out, 'drwho_final4.dsym');
  expect(re, 'exported file does not reopen').not.toBeNull();
  const sizes = (s: typeof song) => s.instruments.map((i) => i.sample?.audioBuffer?.byteLength ?? 0);
  expect(sizes(re!)).toEqual(sizes(song));
  expect(sizes(song).some((n) => n > 44)).toBe(true);
  const cells = (s: typeof song) => s.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => [r.note, r.instrument, r.effTyp, r.eff])));
  expect(cells(re!)).toEqual(cells(song));
  expect(re!.songPositions).toEqual(song.songPositions);
});
