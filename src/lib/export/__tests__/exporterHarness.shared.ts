/**
 * Shared helpers for the exporter round-trip harness and the new-song template
 * generator: fixture parse (parseAs), direct exporter invocation.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { detectFormatFromContent } from '@lib/import/FormatRegistry';
import { LAYOUT_EXPORTERS } from '../nativeExportRouter';
import type { EditableFormatDescriptor } from '@lib/formats/EditableFormatRegistry';

const ROOT = process.cwd();

export function readFixture(rel: string): Uint8Array {
  const b = readFileSync(join(ROOT, rel));
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

/**
 * Direct parsers for prefix-detected UADE formats whose extension FormatRegistry does not
 * map to a nativeParser (they route through the UADE `<prefix>.` matcher at runtime). Keyed
 * by the fixture's file extension. Each is a real TS parser under src/lib/import/formats.
 */
const PARSE_FALLBACK: Record<string, { module: string; fn: string }> = {
  ast: { module: '@lib/import/formats/ActionamicsParser', fn: 'parseActionamicsFile' },
  digi: { module: '@lib/import/formats/DigiBoosterParser', fn: 'parseDigiBoosterFile' },
  is: { module: '@lib/import/formats/InStereo1Parser', fn: 'parseInStereo1File' },
  mmd0: { module: '@lib/import/formats/MEDParser', fn: 'parseMEDFile' },
  pmd: { module: '@lib/import/formats/PiyoPiyoParser', fn: 'parsePiyoPiyoFile' },
  org: { module: '@lib/import/formats/OrganyaParser', fn: 'parseOrganyaFile' },
  artOfNoise: { module: '@lib/import/formats/ArtOfNoiseParser', fn: 'parseArtOfNoiseFile' },
  okta: { module: '@lib/import/formats/OktalyzerParser', fn: 'parseOktalyzerFile' },
  prt: { module: '@lib/import/formats/PreTrackerParser', fn: 'parsePreTrackerFile' },
  synmod: { module: '@lib/import/formats/SynTrackerParser', fn: 'parseSynTrackerFile' },
  mso: { module: '@lib/import/formats/MedleyParser', fn: 'parseMedleyFile' },
  mmdc: { module: '@lib/import/formats/MMDCParser', fn: 'parseMMDCFile' },
  vss: { module: '@lib/import/formats/VoodooSupremeSynthesizerParser', fn: 'parseVoodooSupremeSynthesizerFile' },
};

/** Parse a fixture (or exported bytes under the fixture's name). */
export async function parseAs(rel: string, raw: Uint8Array): Promise<TrackerSong> {
  const name = rel.split('/').pop() ?? rel;
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  // Content decides where the name alone is shared (.mon: MONOTONE vs Maniacs of Noise), as in the product.
  const fmt = detectFormatFromContent(name, raw);
  let module: string | undefined;
  let parseFn: string | undefined;
  if (fmt?.nativeParser?.parseFn) {
    module = fmt.nativeParser.module;
    parseFn = fmt.nativeParser.parseFn;
  } else {
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    const fb = PARSE_FALLBACK[ext];
    if (!fb) throw new Error(`no native parser for ${name}`);
    module = fb.module;
    parseFn = fb.fn;
  }
  const mod = (await import(/* @vite-ignore */ module)) as Record<string, unknown>;
  const fn = mod[parseFn];
  if (typeof fn !== 'function') throw new Error(`parseFn ${parseFn} missing`);
  const parse = fn as (b: ArrayBuffer | Uint8Array, n: string) => TrackerSong | null | Promise<TrackerSong | null>;
  // Parsers disagree on arg type: some want ArrayBuffer, some Uint8Array. A parser handed
  // the wrong one often returns null (not throw), so try BOTH forms and take the first
  // non-null result rather than stopping at the first null.
  let song: TrackerSong | null = null;
  for (const arg of [ab, raw]) {
    try {
      // StoneTracker keeps its samples in a companion .sps next to the .spm.
      song = /\.spm$/i.test(name)
        ? await Promise.resolve((parse as (b: ArrayBuffer | Uint8Array, n: string, bank: Uint8Array) => TrackerSong)(arg, name, readFixture(rel.replace(/\.spm$/i, '.sps'))))
        : await Promise.resolve(parse(arg, name));
    } catch {
      song = null;
    }
    if (song) break;
  }
  if (!song) throw new Error(`parser ${parseFn} returned null for ${name}`);
  return song;
}

// ── Direct exporter invocation ─────────────────────────────────────────────────

export type ExportOut = Uint8Array | ArrayBuffer | Blob | { data: Uint8Array | ArrayBuffer | Blob } | { blob: Blob };

export async function normalizeExport(raw: ExportOut): Promise<Uint8Array> {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw instanceof Blob) return new Uint8Array(await raw.arrayBuffer());
  if ('data' in raw) return normalizeExport(raw.data);
  if ('blob' in raw) return normalizeExport(raw.blob);
  throw new Error('unrecognized exporter output shape');
}

/** Invoke an editable-format descriptor's own exporter (`exporter.module` / `exporter.fn`). */
export async function runDescriptorExporter(d: EditableFormatDescriptor, song: TrackerSong): Promise<Uint8Array> {
  const ref = d.exporter;
  if (!ref) throw new Error(`${d.formatId} has no exporter`);
  const mod = (await import(/* @vite-ignore */ `../${ref.module}`)) as Record<string, unknown>;
  const fn = mod[ref.fn];
  if (typeof fn !== 'function') throw new Error(`exporter ${ref.module}.${ref.fn} missing`);
  return normalizeExport(await Promise.resolve((fn as (s: TrackerSong) => ExportOut | Promise<ExportOut>)(song)));
}

/** Invoke the LAYOUT_EXPORTERS serializer for a layout-keyed format. */
export async function invokeLayoutExport(id: string, song: TrackerSong): Promise<Uint8Array> {
  const entry = LAYOUT_EXPORTERS[id];
  const mod = (await import(/* @vite-ignore */ `../${entry.module}`)) as Record<string, unknown>;
  const fn = mod[entry.fn];
  if (typeof fn !== 'function') throw new Error(`exporter ${entry.module}.${entry.fn} missing`);
  return normalizeExport((await (fn as (s: TrackerSong) => ExportOut | Promise<ExportOut>)(song)) as ExportOut);
}

/** Invoke a named-format serializer with its real call signature. */
export async function invokeNamedExport(id: string, song: TrackerSong): Promise<Uint8Array> {
  switch (id) {
    case 'jamCracker': {
      const { exportAsJamCracker } = await import('../JamCrackerExporter');
      return normalizeExport(await exportAsJamCracker(song));
    }
    case 'soundMon': {
      const { exportAsSoundMon } = await import('../SoundMonExporter');
      return normalizeExport(await exportAsSoundMon(song));
    }
    case 'synTracker': {
      const { exportSynTrackerFile } = await import('../SynTrackerExporter');
      return normalizeExport(exportSynTrackerFile(song));
    }
    case 'mod': {
      const { exportSongToMOD } = await import('../modExport');
      return normalizeExport(await exportSongToMOD(song, { bakeSynths: true }));
    }
    case 'fc': {
      const { exportFC } = await import('../FCExporter');
      return normalizeExport(exportFC(song));
    }
    case 'sidMon2': {
      const { exportSidMon2File } = await import('../SidMon2Exporter');
      return normalizeExport(await exportSidMon2File(song));
    }
    case 'pumaTracker': {
      const { exportPumaTrackerFile } = await import('../PumaTrackerExporter');
      return normalizeExport(exportPumaTrackerFile(song));
    }
    case 'octaMED': {
      const { exportMED } = await import('../MEDExporter');
      return normalizeExport(exportMED(song));
    }
    case 'hivelyHVL': {
      const { exportAsHively } = await import('../HivelyExporter');
      return normalizeExport(exportAsHively(song, { format: 'hvl', nativeOverride: song.hivelyNative ?? undefined }));
    }
    case 'hivelyAHX': {
      const { exportAsHively } = await import('../HivelyExporter');
      return normalizeExport(exportAsHively(song, { format: 'ahx', nativeOverride: song.hivelyNative ?? undefined }));
    }
    case 'digiBooster': {
      const { exportDigiBooster } = await import('../DigiBoosterExporter');
      return normalizeExport(exportDigiBooster(song));
    }
    case 'oktalyzer': {
      const { exportOktalyzer } = await import('../OktalyzerExporter');
      return normalizeExport(exportOktalyzer(song));
    }
    case 'klystrack': {
      const { exportAsKlystrack } = await import('../KlysExporter');
      return normalizeExport(await exportAsKlystrack(song));
    }
    case 'inStereo1': {
      const { exportInStereo1 } = await import('../InStereo1Exporter');
      return normalizeExport(await exportInStereo1(song));
    }
    case 'symphoniePro': {
      const { exportSymphonieProFile } = await import('../SymphonieProExporter');
      return normalizeExport(exportSymphonieProFile(song));
    }
    case 'preTracker':
      // exportAsPreTracker(baseName) serializes from live zustand stores, not the passed
      // song — not measurable in a headless parse->export harness. Recorded honestly.
      throw new Error('store-dependent exporter (reads live stores, not the parsed song)');
    default:
      throw new Error(`no invocation mapping for named exporter '${id}'`);
  }
}

