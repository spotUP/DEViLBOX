/**
 * convertOdinPresets.ts - Build the bundled Odin2 preset bank and its index.
 *
 * Usage: npx tsx tools/convertOdinPresets.ts [--no-copy]
 *
 * A bundled preset is the plugin's own .odin file: the JUCE ValueTree stream the real
 * OdinAudioProcessor restores through setStateInformation (the 'loadPreset' command of
 * juce-wasm/odin2/Odin2WASM.cpp). Nothing is converted, so the mod matrix, arpeggiator, step
 * sequencer, wavedraw tables and the oscillator/filter type selections all load.
 *
 * Steps:
 *  1. Copy the factory bank (third-party/odin2-master, GPL-3) and the two community packs
 *     (owner-supplied free downloads) into public/data/presets/odin2/<pack>/<category>/<name>.odin.
 *     That directory is git-ignored and published from the devilbox-presets repository.
 *  2. Write a README per pack (source, author, licence).
 *  3. Render each preset through Odin2.wasm (one held note, velocity 127) and store the
 *     gainTrimDb that brings its peak to the -10 dBFS calibration target.
 *  4. Emit src/constants/odin2PresetIndex.ts.
 *
 * Community packs are read from the directories named by ODIN_LUNDH_DIR / ODIN_PSYLION_DIR
 * (default: the owner download folders below); a missing pack is skipped with a warning.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOdinState, type OdinTree } from '../src/engine/vstbridge/odinState';
import { renderOdin2, ODIN2_WASM_PRESENT } from './lib/odin2Wasm';
import { SYNTH_REGISTRY } from '../src/engine/vstbridge/synth-registry';

export type VT = OdinTree;
/** Decode a JUCE ValueTree::writeToStream blob. */
export const parseOdin = (buf: Uint8Array): VT => parseOdinState(buf);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
export const ODIN_BANK_DIR = join(ROOT, 'third-party/odin2-master/assets/Soundbanks/Factory Presets');
const OUT_DIR = join(ROOT, 'public/data/presets/odin2');
const OUT_INDEX = join(ROOT, 'src/constants/odin2PresetIndex.ts');
const URL_BASE = '/data/presets/odin2';

/** Calibration: raw peak + instrument volume + registry offset + gainTrimDb = target. */
export const TARGET_PEAK_DB = -10;
export const INSTRUMENT_VOLUME_DB = -12;
export const MAX_TRIM_DB = 24;

export interface Odin2PresetEntry {
  id: string;
  name: string;
  category: string;
  author: string;
  pack: string;
  path: string;
  gainTrimDb: number;
}

const WAVE_WARDEN = 'The Wave Warden';

export function listOdinFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...listOdinFiles(p));
    else if (f.endsWith('.odin')) out.push(p);
  }
  return out;
}

/** "Bass Wobble [4T].odin" -> stem "Bass Wobble", tag "4T". */
export function splitTag(file: string): { stem: string; tag: string | undefined } {
  const full = basename(file, '.odin').trim();
  const m = /\s*\[([^\]]*)\]\s*/.exec(full);
  return { stem: full.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim(), tag: m?.[1] };
}

interface PackSource {
  pack: string;
  dir: string;
  skip: ReadonlySet<string>;
  /** Fixed category (community packs); factory uses its sub-directory names. */
  category?: string;
  author: string;
  label: (category: string, name: string) => string;
  readme: string;
}

const HOME = process.env.HOME ?? '';
const PACKS: PackSource[] = [
  {
    pack: 'factory',
    dir: ODIN_BANK_DIR,
    skip: new Set(),
    author: `${WAVE_WARDEN} (Odin 2 factory bank)`,
    label: (c, n) => `Odin2 ${c} - ${n}`,
    readme: `Odin2 factory soundbank

Source: the "Factory Presets" soundbank shipped with Odin 2 by The Wave Warden
(https://www.thewavewarden.com/odin2, repository https://github.com/TheWaveWarden/odin2).
Licence: GNU General Public License v3 (the Odin 2 repository licence). The preset files are
distributed unmodified. The bracketed tag in the original file name (for example [XR]) names the
sound designer and is kept as the author in the preset index.
`,
  },
  {
    pack: 'lundh',
    dir: process.env.ODIN_LUNDH_DIR ?? join(HOME, 'Downloads/Lukas Lundh'),
    skip: new Set(),
    category: 'Lukas Lundh',
    author: 'Lukas Lundh',
    label: (_c, n) => `Odin2 Lukas Lundh - ${n}`,
    readme: `Lukas Lundh Odin 2 patches

Author: Lukas Lundh (https://soundcloud.com/andgalf, http://lukaslundh.com).
Source: free download supplied by the project owner, for use with Odin 2 by The Wave Warden
(https://www.thewavewarden.com/odin2). The files are distributed unmodified.
`,
  },
  {
    pack: 'psylion',
    dir: process.env.ODIN_PSYLION_DIR ?? join(HOME, 'Downloads/ODIN PRESETS BY PSY-LION'),
    skip: new Set(['Formant Squelch.odin', 'PSY Noise Squelch .odin']),
    category: 'PSY-LION',
    author: 'PSY-LION',
    label: (_c, n) => `Odin2 PSY-LION - ${n}`,
    readme: `PSY-LION Odin 2 presets

Author: PSY-LION (https://payhip.com/PSYLIONSoundDesign).
Source: free download supplied by the project owner, for use with Odin 2 by The Wave Warden
(https://www.thewavewarden.com/odin2). The files are distributed unmodified. Two files that
duplicate presets already in the factory bank (Formant Squelch, PSY Noise Squelch) are not included.
`,
  },
];

interface Planned { src: string; pack: PackSource; category: string; name: string; author: string }

export function planPack(pack: PackSource): Planned[] {
  const planned: Planned[] = [];
  const used = new Set<string>();
  for (const src of listOdinFiles(pack.dir)) {
    if (pack.skip.has(basename(src))) continue;
    const rel = src.slice(pack.dir.length + 1).split('/');
    const category = pack.category ?? rel[0];
    const { stem, tag } = splitTag(src);
    let name = stem;
    // Two files that reduce to one name (a tagged and an untagged copy) get a numeric suffix so ids stay unique.
    for (let n = 2; used.has(`${category}/${name}`); n++) name = `${stem} ${n}`;
    used.add(`${category}/${name}`);
    planned.push({ src, pack, category, name, author: tag ?? pack.author });
  }
  return planned;
}

/** Version fields of a patch (evidence for the old-version check). */
export function patchVersion(buf: Buffer): { minor: unknown; patch: unknown; migration: unknown } {
  const misc = parseOdin(buf).children.find((c) => c.type === 'misc');
  return { minor: misc?.props.version_minor, patch: misc?.props.version_patch, migration: misc?.props.patch_migration_version };
}

async function main(): Promise<void> {
  if (!ODIN2_WASM_PRESENT) throw new Error('public/odin2/Odin2.wasm is missing');
  const copy = !process.argv.includes('--no-copy');
  const offset = SYNTH_REGISTRY.get('Odin2')?.volumeOffsetDb ?? 0;
  const entries: Odin2PresetEntry[] = [];
  const versions: Record<string, unknown> = {};

  for (const pack of PACKS) {
    if (!existsSync(pack.dir)) { console.warn(`[WARN] pack "${pack.pack}" skipped, no directory ${pack.dir}`); continue; }
    if (copy) { mkdirSync(join(OUT_DIR, pack.pack), { recursive: true }); writeFileSync(join(OUT_DIR, pack.pack, 'README.txt'), pack.readme); }
    for (const p of planPack(pack)) {
      const dstDir = join(OUT_DIR, pack.pack, p.category);
      const dst = join(dstDir, `${p.name}.odin`);
      if (copy) { mkdirSync(dstDir, { recursive: true }); copyFileSync(p.src, dst); }
      const bytes = readFileSync(dst);
      const r = await renderOdin2({ preset: new Uint8Array(bytes), seconds: 3 });
      let trim = 0;
      if (Number.isFinite(r.peakDb)) {
        trim = Math.max(-MAX_TRIM_DB, Math.min(MAX_TRIM_DB, TARGET_PEAK_DB - (r.peakDb + INSTRUMENT_VOLUME_DB + offset)));
      } else console.warn(`[WARN] silent render: ${pack.pack}/${p.category}/${p.name}`);
      const id = `${pack.pack}/${p.category}/${p.name}`;
      entries.push({ id, name: pack.label(p.category, p.name), category: p.category, author: p.author, pack: pack.pack,
        path: `${URL_BASE}/${pack.pack}/${p.category}/${p.name}.odin`, gainTrimDb: Math.round(trim * 10) / 10 });
      versions[id] = patchVersion(bytes);
      console.log(`${id}  raw ${r.peakDb.toFixed(1)} dB  trim ${trim.toFixed(1)}`);
    }
  }

  const rows = entries.map((e) => `  ${JSON.stringify(e)},`).join('\n');
  writeFileSync(OUT_INDEX, `/**
 * Generated by tools/convertOdinPresets.ts. Index of the bundled Odin2 presets in
 * public/data/presets/odin2/ (README.txt in each pack names source, author and licence).
 * One entry per shipped .odin file. Regenerate when the shipped set changes.
 */
export interface Odin2PresetEntry {
  /** Stable id: <pack>/<category>/<name>. */
  id: string;
  /** Display name, "Odin2 <Category> - <Name>". */
  name: string;
  category: string;
  author: string;
  pack: 'factory' | 'lundh' | 'psylion';
  /** URL path below the site root. */
  path: string;
  /** Per-preset gain (dB) that brings a held velocity-127 note to the -10 dBFS calibration target. */
  gainTrimDb: number;
}

export const ODIN2_PRESETS: readonly Odin2PresetEntry[] = [
${rows}
];
`);
  writeFileSync(join(process.env.ODIN_EVIDENCE_DIR ?? '/tmp', 'odin2-versions.json'), JSON.stringify(versions, null, 1));
  console.log(`[OK] ${entries.length} presets -> ${OUT_INDEX}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
