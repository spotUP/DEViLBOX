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

// sv_load_module_from_memory loads .sunsynth patches and .xi / .wav sample instruments alike.
const SUNVOX: SynthPatchDir = { dir: 'instruments/sunvox', extensions: ['.sunsynth', '.xi', '.wav'] };

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
  // Furnace chips: one entry per synth type, the chip's own folder under instruments/furnace (.fui Furnace instruments, .dmp DefleMask patches).
  // A Furnace type without its own bundled chip folder opens the furnace root, which holds every chip folder.
  Furnace: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceOPN: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp'] },
  FurnaceOPNA: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp'] },
  FurnaceOPNB: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp'] },
  FurnaceOPN2203: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp'] },
  FurnaceOPNBB: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp'] },
  FurnaceOPM: { dir: 'instruments/furnace/OPM', extensions: ['.fui', '.dmp'] },
  FurnaceOPL: { dir: 'instruments/furnace/OPL', extensions: ['.fui', '.dmp'] },
  FurnaceOPL4: { dir: 'instruments/furnace/OPL', extensions: ['.fui', '.dmp'] },
  FurnaceY8950: { dir: 'instruments/furnace/OPL', extensions: ['.fui', '.dmp'] },
  FurnaceOPLL: { dir: 'instruments/furnace/OPLL', extensions: ['.fui', '.dmp'] },
  FurnaceVRC7: { dir: 'instruments/furnace/OPLL', extensions: ['.fui', '.dmp'] },
  FurnaceESFM: { dir: 'instruments/furnace/ESFM', extensions: ['.fui', '.dmp'] },
  FurnaceOPZ: { dir: 'instruments/furnace/OPZ', extensions: ['.fui', '.dmp'] },
  FurnaceNES: { dir: 'instruments/furnace/NES', extensions: ['.fui', '.dmp'] },
  FurnaceGB: { dir: 'instruments/furnace/GB', extensions: ['.fui', '.dmp'] },
  FurnacePSG: { dir: 'instruments/furnace/SN7', extensions: ['.fui', '.dmp'] },
  FurnaceT6W28: { dir: 'instruments/furnace/SN7', extensions: ['.fui', '.dmp'] },
  FurnaceLynx: { dir: 'instruments/furnace/Lynx', extensions: ['.fui', '.dmp'] },
  FurnaceC64: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp'] },
  FurnaceSID6581: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp'] },
  FurnaceSID8580: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp'] },
  FurnaceSID3: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp'] },
  FurnaceAY: { dir: 'instruments/furnace/AY', extensions: ['.fui', '.dmp'] },
  FurnaceAY8930: { dir: 'instruments/furnace/AY', extensions: ['.fui', '.dmp'] },
  FurnaceVIC: { dir: 'instruments/furnace/VIC', extensions: ['.fui', '.dmp'] },
  FurnaceSAA: { dir: 'instruments/furnace/SAA', extensions: ['.fui', '.dmp'] },
  FurnaceVERA: { dir: 'instruments/furnace/VERA', extensions: ['.fui', '.dmp'] },
  FurnaceTIA: { dir: 'instruments/furnace/TIA', extensions: ['.fui', '.dmp'] },
  FurnacePCE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSNES: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceVB: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSWAN: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceVRC6: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceN163: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceFDS: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceMMC5: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceTED: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSEGAPCM: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceQSOUND: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceES5506: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceRF5C68: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceC140: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceK007232: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceK053260: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceGA20: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceOKI: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceYMZ280B: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSCC: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceX1_010: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceBUBBLE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSM8521: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSUPERVISION: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceUPD1771: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceNDS: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceGBA: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePOKEMINI: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceNAMCO: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePET: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePOKEY: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceMSM6258: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceMSM5232: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceMULTIPCM: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceAMIGA: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePCSPKR: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePONG: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePV1000: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceDAVE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSU: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePOWERNOISE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceZXBEEPER: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnaceSCVTONE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
  FurnacePCMDAC: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp'] },
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
