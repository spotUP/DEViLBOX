/**
 * COSO-EXPORT-NOTICE (owner 2026-11-03: "prehistoric tale says it has no native
 * export when i load it ... but i think my edits got saved").
 *
 * The export router dispatches these formats by formatId (hippelCoSo ->
 * HippelCoSoExporter etc.), so saving worked, but each registry descriptor
 * carried an empty label. The capability view keys on the FormatRegistry label,
 * so the label never entered the exportable set and the import dialog showed
 * "No native export".
 *
 * Owner decision 2026-11-03: surface export only for formats whose round trip is
 * 100% or byte-exact (CoSo, EarAche, Sawteeth, SCUMM, Ben Daglish). Actionamics,
 * Face The Music and IFF SMUS stay hidden until their round trips are fixed.
 *
 * This drives the dialog's own capability inputs: the label prepareModuleImport
 * stores (detectNativeFormat(...).label) and the native family, for real corpus
 * files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@lib/formats/EditableFormatRegistry.builtins';
import { detectNativeFormat } from '@lib/import/prepareModuleImport';
import { getFormatCapabilities } from '@lib/import/FormatCapabilities';

const CASES: Array<{ file: string; label: string }> = [
  { file: 'prehistoric_tale.hipc', label: 'Hippel-CoSo' },
  { file: 'skythebest.ea', label: 'EarAche' },
  { file: 'okolaNUKE.st', label: 'Sawteeth' },
  { file: 'zaktitle.scumm', label: 'SCUMM' },
  { file: 'mickey_mouse.bd', label: 'Ben Daglish' },
  { file: 'dns.ptc', label: 'Dynamic Synthesizer' },
  { file: 'riffraff_smallest.riff', label: 'Riff Raff' },
];

describe('import dialog capability matches the export router', () => {
  it.each(CASES)('$label ($file) reports native export', ({ file, label }) => {
    const buf = readFileSync(resolve(__dirname, '../../../../public/data/songs/formats', file));
    const fmt = detectNativeFormat(file, new Uint8Array(buf.buffer, buf.byteOffset, Math.min(128, buf.length)));
    expect(fmt?.label).toBe(label);
    const caps = getFormatCapabilities(fmt!.label, file, fmt!.family);
    expect(caps.isNativeExportable).toBe(true);
  });
});
