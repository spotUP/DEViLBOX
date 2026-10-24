/**
 * sunvoxPatchConfig — the one place a SunVox patch file becomes a SunVoxConfig.
 * Used by the import dialog (new instrument) and the SunVox editor's Load Patch (this instrument).
 */
import type { SunVoxConfig } from '@typedefs/instrument';
import { SYNTH_PATCH_DIRS } from '@/constants/synthPatchDirs';
import { normalizeUrl } from '@/utils/urlUtils';
import { listManifestDirectory } from '@/lib/serverFS';

/** Extensions routed to the SunVox patch loader (UnifiedFileLoader routes .sunsynth). */
export const SUNVOX_PATCH_ACCEPT = '.sunsynth';

/** The bundled patch a new SunVox instrument starts from, so the first note is a real sound, not a bare oscillator. */
export const DEFAULT_SUNVOX_PATCH_URL = normalizeUrl(
  `/data/${SYNTH_PATCH_DIRS.SunVoxSynth!.dir}/instruments/keyboard/ACheney Analog Synth.sunsynth`,
);

/** The bundled SunVox instrument library (warmplace instruments/), one folder per category. */
const SUNVOX_INSTRUMENTS_DIR = `${SYNTH_PATCH_DIRS.SunVoxSynth!.dir}/instruments`;

/** Matches any file the SunVox patch folder holds (extensions from SYNTH_PATCH_DIRS). */
const SUNVOX_MODULE_FILE = new RegExp(
  `(${SYNTH_PATCH_DIRS.SunVoxSynth!.extensions.map(e => e.replace('.', '\\.')).join('|')})$`, 'i',
);

export interface SunVoxBundledPreset {
  /** Folder path under the library, e.g. 'bass' or 'bass/Elfferich Big basses pack'. */
  category: string;
  name: string;
  url: string;
}

/** The bundled instrument patches, read from the build-time file manifest (no hand-kept index). */
export function listBundledSunVoxPresets(): SunVoxBundledPreset[] {
  const presets: SunVoxBundledPreset[] = [];
  // Categories hold patches directly and in pack subfolders (bass/Elfferich Big basses pack/...): walk every level.
  const walk = (category: string) => {
    for (const entry of listManifestDirectory(`${SUNVOX_INSTRUMENTS_DIR}/${category}`)) {
      const path = `${category}/${entry.name}`;
      if (entry.isDirectory) walk(path);
      else if (SUNVOX_MODULE_FILE.test(entry.name)) {
        presets.push({
          category,
          name: entry.name.replace(SUNVOX_MODULE_FILE, ''),
          url: normalizeUrl(`/data/${SUNVOX_INSTRUMENTS_DIR}/${path}`),
        });
      }
    }
  };
  for (const dir of listManifestDirectory(SUNVOX_INSTRUMENTS_DIR)) if (dir.isDirectory) walk(dir.name);
  return presets;
}

/** A bundled patch fetched by URL, through the same path as a loaded file. */
export async function sunvoxPatchConfigFromUrl(url: string): Promise<{ name: string; config: SunVoxConfig }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SunVox patch fetch failed: ${res.status} ${url}`);
  const fileName = decodeURIComponent(url.split('/').pop() ?? 'patch.sunsynth');
  return sunvoxPatchConfigFromFile(new File([await res.arrayBuffer()], fileName));
}

export async function sunvoxPatchConfigFromFile(file: File): Promise<{ name: string; config: SunVoxConfig }> {
  const patchData = await file.arrayBuffer();
  const name = file.name.replace(SUNVOX_MODULE_FILE, '');
  // noteTargetModuleId cleared: the instrument store merges sunvox, and the old graph's id means nothing here.
  return { name, config: { patchData, patchName: name, isSong: false, controlValues: {}, noteTargetModuleId: undefined } };
}

/**
 * A whole .sunvox song played by its own sequencer, not an instrument graph.
 * Instrument graphs are saved as song bytes too, but always carry a note
 * target (the generator notes go to, -1 when the graph has none).
 */
export function isSunVoxSongPlayer(sunvox: SunVoxConfig | undefined): boolean {
  return !!sunvox?.patchData && sunvox.isSong === true && sunvox.noteTargetModuleId === undefined;
}
