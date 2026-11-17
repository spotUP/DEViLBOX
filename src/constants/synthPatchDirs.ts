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
  Furnace: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPN: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPNA: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPNB: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPN2203: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPNBB: { dir: 'instruments/furnace/OPN', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPM: { dir: 'instruments/furnace/OPM', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPL: { dir: 'instruments/furnace/OPL', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPL4: { dir: 'instruments/furnace/OPL', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceY8950: { dir: 'instruments/furnace/OPL', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPLL: { dir: 'instruments/furnace/OPLL', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceVRC7: { dir: 'instruments/furnace/OPLL', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceESFM: { dir: 'instruments/furnace/ESFM', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOPZ: { dir: 'instruments/furnace/OPZ', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceNES: { dir: 'instruments/furnace/NES', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceGB: { dir: 'instruments/furnace/GB', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePSG: { dir: 'instruments/furnace/SN7', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceT6W28: { dir: 'instruments/furnace/SN7', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceLynx: { dir: 'instruments/furnace/Lynx', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceC64: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSID6581: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSID8580: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSID3: { dir: 'instruments/furnace/C64', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceAY: { dir: 'instruments/furnace/AY', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceAY8930: { dir: 'instruments/furnace/AY', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceVIC: { dir: 'instruments/furnace/VIC', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSAA: { dir: 'instruments/furnace/SAA', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceVERA: { dir: 'instruments/furnace/VERA', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceTIA: { dir: 'instruments/furnace/TIA', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePCE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSNES: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceVB: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSWAN: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceVRC6: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceN163: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceFDS: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceMMC5: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceTED: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSEGAPCM: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceQSOUND: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceES5506: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceRF5C68: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceC140: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceK007232: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceK053260: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceGA20: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceOKI: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceYMZ280B: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSCC: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceX1_010: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceBUBBLE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSM8521: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSUPERVISION: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceUPD1771: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceNDS: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceGBA: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePOKEMINI: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceNAMCO: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePET: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePOKEY: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceMSM6258: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceMSM5232: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceMULTIPCM: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceAMIGA: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePCSPKR: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePONG: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePV1000: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceDAVE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSU: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePOWERNOISE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceZXBEEPER: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnaceSCVTONE: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
  FurnacePCMDAC: { dir: 'instruments/furnace', extensions: ['.fui', '.dmp', '.tfi', '.vgi', '.opni', '.y12', '.opli', '.sbi', '.wopl', '.bnk', '.wopn', '.s3i', '.eif', '.ff', '.gyb', '.opm', '.fti', '.bti'] },
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
