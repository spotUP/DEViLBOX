/**
 * The one map from a synth to the bundled folder its patch-load button opens, and the file extensions
 * that folder holds. Single source of truth for the in-app patch browser (PatchLoadButton -> FileBrowser
 * pick-file mode) and for the build-time file manifest (scripts/generate-file-manifest.js is plain Node and
 * cannot import TypeScript, so it reads this file as text and collects every `extensions: [...]` literal;
 * keep each entry's extensions as a literal array on one line).
 *
 * `dir` is relative to public/data (the root of the file manifest), without leading or trailing slash.
 * A synth absent from the map has no bundled patch folder and keeps the OS picker only.
 */
import type { SynthType } from '@typedefs/instrument';

export interface SynthPatchDir {
  /** Folder under public/data, e.g. 'instruments/sunvox'. */
  dir: string;
  /** Lower-case extensions with the dot, e.g. ['.sunsynth']. */
  extensions: string[];
}

const SUNVOX: SynthPatchDir = { dir: 'instruments/sunvox', extensions: ['.sunsynth'] };

export const SYNTH_PATCH_DIRS: Partial<Record<SynthType, SynthPatchDir>> = {
  SunVoxSynth: SUNVOX,
  SunVoxModular: SUNVOX,
  DX7: { dir: 'sysex/dx7', extensions: ['.syx'] },
  CZ101: { dir: 'sysex/cz-pack-1', extensions: ['.syx'] },
  Vital: { dir: 'presets/vital', extensions: ['.vital'] },
  Odin2: { dir: 'presets/odin2', extensions: ['.odin'] },
  // Fairlight CMI sample loader takes one audio file; the bundled library is the sample pack, not the disk images in cmi-disks.
  MAMECMI: { dir: 'samples/packs/fairlight-cmi', extensions: ['.wav'] },
  Sfizz: { dir: 'samples/sfz', extensions: ['.sfz', '.wav'] },
};

/** Every extension any mapped folder holds; the manifest generator must list all of them. */
export function allSynthPatchExtensions(): string[] {
  const set = new Set<string>();
  for (const v of Object.values(SYNTH_PATCH_DIRS)) for (const e of v?.extensions ?? []) set.add(e);
  return [...set].sort();
}

export function getSynthPatchDir(synthType: SynthType): SynthPatchDir | undefined {
  return SYNTH_PATCH_DIRS[synthType];
}
