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

export interface AdfTemplateEntry {
  adf: string;
  target: 'a500' | 'a1200';
  cpu: string;
  moduleSlot: { diskOffset: number; maxBytes: number };
  moduleLengthWord: { diskOffset: number; bytes: 4; endian: 'big' };
  /** Fixed ASCII title field on the disk; the EMS / EMS-6 screens show it as the title. */
  titleSlot: { diskOffset: number; bytes: number };
  /** Chip RAM the player needs from CHIP_BASE up, with the slot at its maximum size. */
  chipArenaBytes: number;
  memory: { CHIP_BASE: string };
}
export interface AdfManifest { templates: Record<string, AdfTemplateEntry> }

/** Chip RAM of the machine each template targets (A500 512 KB, A1200 2 MB). */
const CHIP_RAM_BYTES = { a500: 512 * 1024, a1200: 2 * 1024 * 1024 } as const;
const MACHINE_NAME = { a500: 'Amiga 500', a1200: 'Amiga 1200' } as const;

const ascii = (b: Uint8Array, at: number, s: string): boolean =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const be32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/** The template name for a module, from the same magic tests the on-disk screen code uses; null when no player is on a disk. */
export function adfTemplateFor(m: Uint8Array, filename?: string): string | null {
  // Checked first: an .aam module can start with bytes another player's magic test accepts (agony-level1.aam reads as SUN-Tronic).
  // ArtAndMagic has no magic and no detect function: the importer routes by .aam / aam.* name (AmigaFormatParsers).
  const base = (filename?.split('/').pop() ?? '').toLowerCase();
  if (base.endsWith('.aam') || base.startsWith('aam.')) return 'ArtAndMagic';
  // Tronic (dp / trc / tro / tronic) and AM-Composer (amc) have no magic either: isTronicFormat accepts any buffer, so only the eagleplayer.conf prefixes can tell them.
  if (/^(dp|trc|tro|tronic)\./.test(base) || /\.(dp|trc|tro|tronic)$/.test(base)) return 'Tronic';
  if (base.startsWith('amc.') || base.endsWith('.amc')) return 'AM-Composer';
  if (ascii(m, 0, 'THX')) return 'AbyssHighestExperience';
  if (ascii(m, 0, 'FC14') || ascii(m, 0, 'SMOD') || ascii(m, 0, 'FC13')) return 'FutureComposer1.4';
  if (ascii(m, 0, 'BeEp')) return 'JamCracker';
  if (ascii(m, 0, 'OKTASONG')) return 'Oktalyzer';
  if (ascii(m, 0, 'COSO')) return 'JochenHippel-CoSo';
  if (ascii(m, 0, ' MUGICIAN/SOFTEYES 1990')) return 'Mugician';
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
  // Path A of the 7V check accepts any $6000 loader stub, so it comes after every magic-based test.
  if (isJochenHippel7VFormat(m)) return 'JochenHippel-7V';
  // Last: the hunk scan for the RIFFRAFF magic is the loosest of the detect functions.
  if (isRiffRaffFormat(m)) return 'RiffRaff';
  return null;
}

export class AdfExportError extends Error {}

/** Writes `module` into the template's slot and patches the length word. Throws AdfExportError when it cannot fit. */
export function patchAdfSlot(template: Uint8Array, entry: AdfTemplateEntry, module: Uint8Array): Uint8Array {
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
  return out;
}

/** The file name without extension as `bytes` printable ASCII (the screen font's 0x20-0x7e), space padded. */
export function adfTitleBytes(baseName: string, bytes: number): Uint8Array {
  const text = baseName.replace(/\.[^.]*$/, '').replace(/[^\x20-\x7e]/g, '?').slice(0, bytes);
  const out = new Uint8Array(bytes).fill(0x20);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

export interface AdfResult { data: Uint8Array; filename: string; warnings: string[]; template: string; machine: string }

/** Pure part: manifest + template loader + module in, disk out. */
export async function buildAdf(
  module: Uint8Array, baseName: string, manifest: AdfManifest, loadTemplate: (file: string) => Promise<Uint8Array>,
): Promise<AdfResult> {
  const name = adfTemplateFor(module, baseName);
  const entry = name ? manifest.templates[name] : undefined;
  if (!name || !entry) throw new AdfExportError('No Amiga disk player exists for this format yet.');
  const data = patchAdfSlot(await loadTemplate(entry.adf), entry, module);
  data.set(adfTitleBytes(baseName, entry.titleSlot.bytes), entry.titleSlot.diskOffset);
  return { data, filename: `${baseName.replace(/\.[^.]*$/, '') || 'song'}.adf`, warnings: [], template: name, machine: MACHINE_NAME[entry.target] };
}

/** The live song as a bootable disk, through the same native export the Export dialog and the MCP tool use. Null when there is no native export. */
export async function exportLiveSongAdf(): Promise<AdfResult | null> {
  const { exportNativeFile } = await import('../moduleExportService');
  const native = await exportNativeFile();
  if (!native) return null;
  const base = `${import.meta.env.BASE_URL}amiga-adf/`;
  const manifest = await (await fetch(`${base}manifest.json`)).json() as AdfManifest;
  return buildAdf(native.data, native.filename, manifest, async (f) => new Uint8Array(await (await fetch(`${base}${f}`)).arrayBuffer()));
}
