/**
 * Amiga disk export: the module bytes of the native export are written into the fixed module slot of a prebuilt
 * template ADF (public/amiga-adf/, built offline by third-party/amiga-adf/build_adf.py) and the length word is
 * patched. No toolchain at runtime. The template is chosen from the module's own magic bytes.
 */

import { isEMSFormat } from '../../import/formats/EMSParser';
import { isFuturePlayerFormat } from '../../import/formats/FuturePlayerParser';
import { isBeathovenSynthesizerFormat } from '../../import/formats/BeathovenSynthesizerParser';
import { isMcmdFormat } from '../../import/formats/MCMDParser';
import { isSpeedySystemFormat } from '../../import/formats/SpeedySystemParser';
import { isAProSysFormat } from '../../import/formats/AProSysParser';
import { isSoundImagesFormat } from '../../import/formats/SoundImagesParser';
import { isRiffRaffFormat } from '../../import/formats/RiffRaffParser';
import { isJochenHippel7VFormat } from '../../import/formats/JochenHippel7VParser';
import { isSonicArrangerFormat } from '../../import/formats/SonicArrangerParser';
import { isDeltaMusic2Format } from '../../import/formats/DeltaMusic2Parser';
import { isSoundMasterFormat } from '../../import/formats/SoundMasterParser';
import { isTFMXFile } from '../../import/formats/TFMXParser';
import { isSidMon1Format } from '../../import/formats/SidMon1Parser';

export interface AdfTemplateEntry {
  adf: string;
  target: 'a500' | 'a1200';
  cpu: string;
  moduleSlot: { diskOffset: number; maxBytes: number };
  moduleLengthWord: { diskOffset: number; bytes: 4; endian: 'big' };
  /** Second slot for the format's companion file (TFMX smpl.*); absent on single-file players. */
  companionSlot?: { diskOffset: number; maxBytes: number };
  companionLengthWord?: { diskOffset: number; bytes: 4; endian: 'big' };
  /** Fixed ASCII title field on the disk; the EMS / EMS-6 screens show it as the title. */
  titleSlot: { diskOffset: number; bytes: number };
  /** Chip RAM the player needs from CHIP_BASE up, with the slot at its maximum size. */
  chipArenaBytes: number;
  memory: { CHIP_BASE: string };
  /** eagleplayer.conf prefixes of the player (build_adf.py publish), lower case; absent on variant templates and on templates that fail the boot check. */
  prefixes?: string[];
}
export interface AdfManifest { templates: Record<string, AdfTemplateEntry> }

/** Chip RAM of the machine each template targets (A500 512 KB, A1200 2 MB). */
const CHIP_RAM_BYTES = { a500: 512 * 1024, a1200: 2 * 1024 * 1024 } as const;
const MACHINE_NAME = { a500: 'Amiga 500', a1200: 'Amiga 1200' } as const;

const ascii = (b: Uint8Array, at: number, s: string): boolean =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const be32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/** The template name for a module, from the same magic tests the on-disk screen code uses; null when no player is on a disk. */
export function adfTemplateFor(m: Uint8Array, filename?: string, manifest?: AdfManifest): string | null {
  // Checked first: an .aam module can start with bytes another player's magic test accepts (agony-level1.aam reads as SUN-Tronic).
  // ArtAndMagic has no magic and no detect function: the importer routes by .aam / aam.* name (AmigaFormatParsers).
  const base = (filename?.split('/').pop() ?? '').toLowerCase();
  if (base.endsWith('.aam') || base.startsWith('aam.')) return 'ArtAndMagic';
  // Tronic (dp / trc / tro / tronic) and AM-Composer (amc) have no magic either: isTronicFormat accepts any buffer, so only the eagleplayer.conf prefixes can tell them.
  if (/^(dp|trc|tro|tronic)\./.test(base) || /\.(dp|trc|tro|tronic)$/.test(base)) return 'Tronic';
  if (base.startsWith('amc.') || base.endsWith('.amc')) return 'AM-Composer';
  // DTP_ExtLoad players with one companion file (name only; their modules have no magic). AudioSculpture is first: an .adsc can start with M.K.
  if (/\.adsc$|^mod_adsc4\./.test(base)) return 'AudioSculpture';
  if (/\.dum$/.test(base)) return 'Infogrames';
  if (/^jpn\.|^jpnd\.|\.jpn$|\.jpnd$/.test(base)) return 'JasonPage';
  if (/\.kh$/.test(base)) return 'KrisHatlelid';
  // Maximum Effect (MAX.<game> <tune>) has no magic either; the SMP.set file rides in the companion slot.
  if (base.startsWith('max.')) return 'Maximum_Effect';
  // Sound-FX: 'SONG' tag at $3c (the .sfx / sfx.* name alone is not enough, DefleMask sfx.dmf shares the prefix).
  if (ascii(m, 60, 'SONG') && (base.endsWith('.sfx') || base.startsWith('sfx.'))) return 'Sound-FX';
  if (ascii(m, 0, 'THX')) return 'AbyssHighestExperience';
  if (ascii(m, 0, 'FC14') || ascii(m, 0, 'SMOD') || ascii(m, 0, 'FC13')) return 'FutureComposer1.4';
  if (ascii(m, 0, 'BeEp')) return 'JamCracker';
  if (ascii(m, 0, 'OKTASONG')) return 'Oktalyzer';
  if (ascii(m, 0, 'COSO')) return 'JochenHippel-CoSo';
  if (ascii(m, 0, ' MUGICIAN/SOFTEYES 1990')) return 'Mugician';
  if (ascii(m, 0, 'ISM!V1.2')) return 'InStereo';
  if (ascii(m, 0, 'FORM') && ascii(m, 8, 'EMOD')) return 'QuadraComposer';
  // SoundMon: only V.2 is proven on the SoundMon2.0 disk (aquarivs.bp); V.3 (SoundMon2.2) and BPSM (V1) are not.
  if (ascii(m, 26, 'V.2')) return 'SoundMon2.0';
  if (ascii(m, 0, 'DIGI Booster module')) return 'DIGI-Booster';
  if (['M.K.', 'M!K!', 'FLT4', '4CHN'].some((t) => ascii(m, 1080, t))) return 'PTK-Prowiz';
  if (m.length >= 4 && be32(m, 0) === 0x48e7fffe) return 'SUN-Tronic';
  if (m.length >= 2 && m[0] === 0x4e && m[1] === 0xf9) return 'CustomMade';
  // Anders 0land: "mpl" + version digit, then a bra.w into the embedded player.
  if (ascii(m, 0, 'mpl') && m[3] >= 0x30 && m[3] <= 0x39 && m[10] === 0x60 && m[11] === 0x00) return 'Anders_0land';
  // MED player: MMD0 on the A500 template. MMD1 reads unrelocated sample pointers in the player's Check and
  // address-errors on a 68000 (measured 2026-11-20), so it gets the A1200 build; MMD2 belongs to Octa-MED, MMD3/MMDC are unproven.
  if (ascii(m, 0, 'MMD0')) return 'MED';
  if (ascii(m, 0, 'MMD1')) return 'MED-A1200';
  // EMS v6 is the A1200/020 build. The older EMS player (68000, A500 template) has no magic string; the importer's
  // isEMSFormat is the same header check the player runs. Built with --target a1200 it does not boot (measured 2026-11-20).
  if (ascii(m, 0, 'E.M.S. V6')) return 'EMS-6';
  if (isEMSFormat(m)) return 'EMS';
  if (isFuturePlayerFormat(m)) return 'FuturePlayer';
  if (isMcmdFormat(m)) return 'MCMD';
  if (isBeathovenSynthesizerFormat(m)) return 'BeathovenSynthesizer';
  if (isSpeedySystemFormat(m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength) as ArrayBuffer)) return 'SpeedySystem';
  // AProSys has no magic: the importer detects it by file name only (aps.* / *.aps).
  if (isAProSysFormat(m, filename)) return 'AProSys';
  if (isSoundImagesFormat(m, filename)) return 'SoundImages';
  // Sound Master: three BRA.W words; only the .sm extension is proven on the disk (rackney'sisland 4.sm, envelope corr >= 0.97 per second). Needs a filename.
  if (filename && /\.sm$/i.test(filename) && isSoundMasterFormat(m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength) as ArrayBuffer, filename)) return 'SoundMaster';
  // Path A of the 7V check accepts any $6000 loader stub, so it comes after every magic-based test.
  if (isJochenHippel7VFormat(m)) return 'JochenHippel-7V';
  // DeltaMusic2 checks the ".FNL" tag at $bc6; SonicArranger's SOARV1.0 magic is exact but its 4EFA player-binary path is loose, so both come after the exact magics.
  if (isDeltaMusic2Format(m)) return 'DeltaMusic2.0';
  // SidMon 1.0: exact ' SID-MON BY R.v.VLIET  (c) 1988 ' string behind the lea/add.l loader stub. A1200 build (the player scans the module with odd word reads).
  if (isSidMon1Format(m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength) as ArrayBuffer)) return 'SIDMon1.0';
  if (isSonicArrangerFormat(m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength) as ArrayBuffer)) return 'SonicArranger';
  // TFMX: the mdat header magic (TFMX-SONG / TFMX_SONG / tfmxsong / TFMX 1.5); the smpl file rides in the companion slot.
  if (isTFMXFile(m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength) as ArrayBuffer)) return 'TFMX-Pro';
  // PaulRobotham: .dat is too common a suffix for the top of the chain.
  if (/\.dat$/.test(base)) return 'PaulRobotham';
  // Last: the hunk scan for the RIFFRAFF magic is the loosest of the detect functions.
  if (isRiffRaffFormat(m)) return 'RiffRaff';
  // No magic matched: the player UADE itself picks by name. Same candidate order as build_adf.py's
  // uade_lookup.candidates: the prefix (puma.liquid kids), then the extension (liquid kids.puma).
  if (manifest && base.includes('.')) {
    for (const c of [base.slice(0, base.indexOf('.')), base.slice(base.lastIndexOf('.') + 1)]) {
      const hit = Object.entries(manifest.templates).find(([, t]) => t.prefixes?.includes(c));
      if (hit) return hit[0];
    }
  }
  return null;
}

export class AdfExportError extends Error {}

/** Writes `module` into the template's slot and patches the length word. Throws AdfExportError when it cannot fit. */
export function patchAdfSlot(template: Uint8Array, entry: AdfTemplateEntry, module: Uint8Array, companion?: Uint8Array): Uint8Array {
  const { diskOffset, maxBytes } = entry.moduleSlot;
  const lw = entry.moduleLengthWord;
  if (module.length === 0) throw new AdfExportError('The module is empty.');
  if (module.length > maxBytes) {
    throw new AdfExportError(`The module is ${module.length} bytes. The ${entry.adf} disk has room for ${maxBytes} bytes.`);
  }
  // The arena figure is for a full slot, so a smaller module needs no more than that.
  const chipEnd = parseInt(entry.memory.CHIP_BASE, 16) + entry.chipArenaBytes;
  if (chipEnd > CHIP_RAM_BYTES[entry.target]) {
    throw new AdfExportError(`The player needs ${chipEnd} bytes of chip memory. An ${MACHINE_NAME[entry.target]} has ${CHIP_RAM_BYTES[entry.target]}.`);
  }
  if (template.length < diskOffset + maxBytes || template.length < lw.diskOffset + lw.bytes) {
    throw new AdfExportError(`The template ${entry.adf} is too short for its own slot.`);
  }
  const out = template.slice();
  out.fill(0, diskOffset, diskOffset + maxBytes);
  out.set(module, diskOffset);
  new DataView(out.buffer).setUint32(lw.diskOffset, module.length, false);
  const cs = entry.companionSlot, cl = entry.companionLengthWord;
  if (cs && cl) {
    if (!companion || companion.length === 0) throw new AdfExportError(`The ${entry.adf} disk needs the format's companion (sample) file, and the song has none.`);
    if (companion.length > cs.maxBytes) throw new AdfExportError(`The companion file is ${companion.length} bytes. The ${entry.adf} disk has room for ${cs.maxBytes} bytes.`);
    if (out.length < cs.diskOffset + cs.maxBytes || out.length < cl.diskOffset + cl.bytes) throw new AdfExportError(`The template ${entry.adf} is too short for its own companion slot.`);
    out.fill(0, cs.diskOffset, cs.diskOffset + cs.maxBytes);
    out.set(companion, cs.diskOffset);
    new DataView(out.buffer).setUint32(cl.diskOffset, companion.length, false);
  }
  return out;
}

/** Prefix-named Amiga files (MAX.song, mdat.song) carry the format in the prefix: the whole name is the song name, nothing to strip. */
export function adfSongName(baseName: string): string {
  return /^(aam|amc|dp|trc|tro|tronic|max|sfx|mdat|smpl|smp)\./i.test(baseName) ? baseName : baseName.replace(/\.[^.]*$/, '');
}

/** The file name without extension as `bytes` printable ASCII (the screen font's 0x20-0x7e), space padded. */
export function adfTitleBytes(baseName: string, bytes: number): Uint8Array {
  const text = adfSongName(baseName).replace(/[^\x20-\x7e]/g, '?').slice(0, bytes);
  const out = new Uint8Array(bytes).fill(0x20);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

export interface AdfResult { data: Uint8Array; filename: string; warnings: string[]; template: string; machine: string }

/** Pure part: manifest + template loader + module in, disk out. */
export async function buildAdf(
  module: Uint8Array, baseName: string, manifest: AdfManifest, loadTemplate: (file: string) => Promise<Uint8Array>, companion?: Uint8Array,
): Promise<AdfResult> {
  const name = adfTemplateFor(module, baseName, manifest);
  const entry = name ? manifest.templates[name] : undefined;
  if (!name || !entry) throw new AdfExportError('No Amiga disk player exists for this format yet.');
  const data = patchAdfSlot(await loadTemplate(entry.adf), entry, module, companion);
  data.set(adfTitleBytes(baseName, entry.titleSlot.bytes), entry.titleSlot.diskOffset);
  return { data, filename: `${adfSongName(baseName) || 'song'}.adf`, warnings: [], template: name, machine: MACHINE_NAME[entry.target] };
}

/** The live song as a bootable disk, through the same native export the Export dialog and the MCP tool use. Null when there is no native export. */
export async function exportLiveSongAdf(): Promise<AdfResult | null> {
  const { exportNativeFile } = await import('../moduleExportService');
  const native = await exportNativeFile();
  if (!native) return null;
  // The native export is the module only; the companion the importer kept rides in the companion slot. TFMX smpl / Maximum Effect SMP.set /
  // wantedteam.bin are told by name; a single-companion ExtLoad disk (AudioSculpture, Infogrames, JasonPage, PaulRobotham, KrisHatlelid) takes
  // the song's one non-module companion.
  const modBase = native.filename.split('/').pop() ?? '';
  const all: { name: string; data: Uint8Array }[] = [...(native.companions ?? [])];
  if (!all.length) {
    const { useFormatStore } = await import('@/stores/useFormatStore');
    for (const [n, buf] of useFormatStore.getState().uadeCompanionFiles ?? []) all.push({ name: n, data: new Uint8Array(buf) });
  }
  const isSmp = (n: string) => /^(smpl|smp)\.|^wantedteam\.bin$/i.test(n.split('/').pop() ?? '');
  const others = all.filter((c) => (c.name.split('/').pop() ?? '') !== modBase);
  const companion = (all.find((c) => isSmp(c.name)) ?? (others.length === 1 ? others[0] : undefined))?.data;
  const base = `${import.meta.env.BASE_URL}amiga-adf/`;
  const manifest = await (await fetch(`${base}manifest.json`)).json() as AdfManifest;
  return buildAdf(native.data, native.filename, manifest, async (f) => new Uint8Array(await (await fetch(`${base}${f}`)).arrayBuffer()), companion);
}

/** True when the live song's native export has a player on an Amiga disk (the Export dialog shows the Amiga Disk button only then). */
export async function adfAvailableForLiveSong(): Promise<boolean> {
  const { exportNativeFile, nativeExportAvailableForLiveSong } = await import('../moduleExportService');
  if (!(await nativeExportAvailableForLiveSong())) return false;
  const native = await exportNativeFile();
  if (!native) return false;
  const manifest = await (await fetch(`${import.meta.env.BASE_URL}amiga-adf/manifest.json`)).json() as AdfManifest;
  return adfTemplateFor(native.data, native.filename, manifest) !== null;
}
