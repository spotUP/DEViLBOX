/**
 * New-song template generator (plan 2026-11-01-new-song-any-format, N6-N8).
 *
 * For every editable-format descriptor with an `exporter`: parse the format's real
 * fixture (shared parseAs), clear every pattern cell, trim the order to one position
 * where the exporter accepts it, export with the descriptor's own exporter, re-parse
 * the output to prove it loads, write public/templates/<formatId>.<ext>. Formats without
 * a fixture export a blank song built here. Every verdict goes to
 * thoughts/shared/plans/2026-11-01-new-song-templates.json as it completes.
 *
 * Gated like the ratchet generator; a normal test run skips it:
 *   DEVILBOX_GEN_TEMPLATES=1 [DEVILBOX_GEN_FORCE=<formatId>[,<formatId>|all]] \
 *     nice -n 19 npx vitest run src/lib/export/__tests__/makeNewSongTemplates.test.ts --maxWorkers=2
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { EMPTY_CELL } from '@/types/tracker';
import { RH_FX } from '@lib/import/formats/robHubbardEffectGlyphs';
import { FP_FX } from '@lib/import/formats/fpEffectGlyphs';
import { FpHunkModule, cloneHeader } from '@lib/import/formats/fpModuleGrow';
import { fpSongs } from '@lib/import/formats/fpWalk';
import { buildFuturePlayerGrid } from '@lib/import/formats/FuturePlayerParser';
import { detectFormat, detectFormatFromContent } from '@lib/import/FormatRegistry';
import { FORMAT_REGISTRY } from '@lib/import/formatRegistryData';
import { listEditableFormats, type EditableFormatDescriptor } from '@lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { LAYOUT_FIXTURES, NAMED_EXPORTERS } from './exporterFixtures.map';
import { parseAs, readFixture, runDescriptorExporter as runExporter } from './exporterHarness.shared';

const ENABLED = process.env.DEVILBOX_GEN_TEMPLATES === '1';
const FORCE = (process.env.DEVILBOX_GEN_FORCE ?? '').split(',').filter(Boolean);
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public/templates');
const VERDICTS_PATH = join(ROOT, 'thoughts/shared/plans/2026-11-01-new-song-templates.json');

interface Verdict {
  status: 'written' | 'failed' | 'skipped';
  file?: string;
  name?: string;
  source?: string;
  variant?: string;
  bytes?: number;
  reason?: string;
}

function loadVerdicts(): Record<string, Verdict> {
  return existsSync(VERDICTS_PATH) ? (JSON.parse(readFileSync(VERDICTS_PATH, 'utf8')) as Record<string, Verdict>) : {};
}

function fixtureFor(id: string): string | undefined {
  return LAYOUT_FIXTURES[id] ?? NAMED_EXPORTERS.find((n) => n.id.toLowerCase() === id.toLowerCase())?.fixture;
}

/** Effects that only steer the order: position jump, pattern break, Rob Hubbard song end / track list restart, Future Player voice end. */
const SONG_FLOW_EFFECTS = new Set<number>([0x0b, 0x0d, RH_FX.songEnd, RH_FX.listRestart, FP_FX.end]);

function isEmptyCell(c: TrackerCell | undefined, row = 1): boolean {
  if (!c) return true;
  if (c.note !== 0 || c.instrument !== 0) return false;
  // Row 0 carries the song's own start state that parsers inject from the header: initial
  // volume and the initial speed/tempo (Fxx). That is a setting, not musical content.
  if (row === 0 && ((c.effTyp === 0 && c.eff === 0) || c.effTyp === 0x0f)) return true;
  if (c.effTyp === 0 && c.eff === 0 && !c.volume) return true;
  // A song-flow marker with no note steers the order (where the song loops or ends);
  // a blank song still has one. Rob Hubbard draws its block-end restart as one.
  return SONG_FLOW_EFFECTS.has(c.effTyp) && !c.volume;
}

function nonEmptyCells(song: TrackerSong): number {
  let n = 0;
  for (const p of song.patterns) for (const ch of p.channels) ch.rows.forEach((c, row) => { if (!isEmptyCell(c, row)) n++; });
  return n;
}

function blankPattern(src: Pattern, id: string): Pattern {
  return {
    ...src,
    id,
    channels: src.channels.map((ch) => ({ ...ch, rows: ch.rows.map(() => ({ ...EMPTY_CELL })) })),
  };
}

/** Every pattern emptied, order untouched. */
function clearAll(song: TrackerSong): TrackerSong {
  return { ...song, patterns: song.patterns.map((p) => blankPattern(p, p.id)) };
}

/** One empty pattern, one order position. */
function trimToOne(song: TrackerSong): TrackerSong {
  const first = song.patterns[song.songPositions[0] ?? 0] ?? song.patterns[0];
  return { ...song, patterns: [blankPattern(first, first.id)], songPositions: [0], songLength: 1, restartPosition: 0 };
}

/** Blank song for exporters with no committed fixture. */
function silentWav(frames: number, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + frames * 2);
  const v = new DataView(buf);
  const tag = (o: number, t: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + frames * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, frames * 2, true);
  return buf;
}

/** Blank song for exporters with no committed fixture. `silentSample`: formats whose parser rejects a file with no sample data. */
function blankSong(channels: number, silentSample = false): TrackerSong {
  const rows = 64;
  const pattern: Pattern = {
    id: 'p0',
    name: '',
    length: rows,
    channels: Array.from({ length: channels }, (_, i) => ({
      id: `c${i}`, name: '', rows: Array.from({ length: rows }, () => ({ ...EMPTY_CELL })),
      muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
    })),
  } as Pattern;
  const inst = {
    id: 1, name: '', type: 'sample', synthType: 'Sampler', effects: [], volume: 0, pan: 0,
    ...(silentSample ? { sample: { audioBuffer: silentWav(64, 8363), loop: false } } : {}),
  } as unknown as InstrumentConfig;
  return {
    name: '', format: 'MOD', patterns: [pattern], instruments: [inst], songPositions: [0], songLength: 1,
    restartPosition: 0, numChannels: channels, initialSpeed: 6, initialBPM: 125,
  };
}

/** Song positions of the Future Player template (64 rows each). */
const FP_TEMPLATE_POSITIONS = 16;

/**
 * Future Player: give voices 0-2 of subsong 0 one straight stream each, so every row is its own rest and plays once.
 * The cleared source song keeps its call graph (voices 0 and 1 loop around one shared rest block, voice 2 restarts),
 * so one rest stands for many rows and a note typed on it would sound at every replay; the exporter refuses those.
 * Each stream: set-instrument commands (voice 0 sets every instrument the source sets, in the source's order, so the
 * instrument list and numbering stay; voices 1 and 2 set instrument 1), then `positions` blocks of rests (voices 0 and 1
 * one row each, voice 2 two of 32 rows), then a jump (command 7) back to the stream's start through its own voice
 * header. Every voice restarts on the same row, like a real Future Player song looping, so the walk finds the loop at
 * row 0 after exactly positions * 64 rows (fpWalk rotateLoop): one pass plays every row once. Voice 3 keeps no stream
 * (a note typed there gets one that restarts in step, fpGridEdits addVoiceStream). The new streams are appended to the
 * code (fpModuleGrow); each song data slot is moved to its own copy of
 * the voice header (cloneHeader); the old streams stay for the other subsongs. Code, header and instruments are kept.
 */
function fpOnePassTemplate(file: Uint8Array, positions: number): Uint8Array {
  const mod = FpHunkModule.parse(file);
  const { instrumentMap } = buildFuturePlayerGrid(file);
  const instrs = [...instrumentMap.entries()].sort((a, b) => a[1] - b[1]).map(([ptr]) => ptr);
  if (instrs.length === 0) throw new Error('the Future Player source sets no instrument');
  const song = fpSongs(mod.code)[0];
  const ROWS = 64;
  for (let voice = 0; voice < 3; voice++) {
    const slot = song.songDataPtr + 8 + voice * 4;
    const bytes: number[] = [];
    const relocAt: number[] = [];
    for (const ptr of voice === 0 ? [...instrs, instrs[0]] : [instrs[0]]) {
      relocAt.push(bytes.length + 2);
      bytes.push(0x81, 0, (ptr >>> 24) & 0xff, (ptr >>> 16) & 0xff, (ptr >>> 8) & 0xff, ptr & 0xff);
    }
    const restRows = voice === 2 ? 32 : 1;
    const rests = (positions * ROWS) / restRows;
    for (let i = 0; i < rests; i++) bytes.push(0, restRows);
    const jumpAt = bytes.length + 2;
    bytes.push(0x87, 0, 0, 0, 0, 0); // jump back to the start; the pointer (this voice's header) is written below
    const at = mod.append(bytes);
    for (const r of relocAt) mod.addReloc(at + r);
    const header = cloneHeader(mod, slot, at);
    mod.code.set([(header >>> 24) & 0xff, (header >>> 16) & 0xff, (header >>> 8) & 0xff, header & 0xff], at + jumpAt);
    mod.addReloc(at + jumpAt);
  }
  return mod.build();
}

/** Candidate file names, best first; first one the app's detection resolves to `wantKey` wins. */
function pickFileName(id: string, ext: string | undefined, prefix: string | undefined, bytes: Uint8Array, wantKey: string | undefined): string | undefined {
  const cands: string[] = [];
  if (ext) cands.push(`${id}.${ext}`);
  if (prefix) cands.push(`${prefix}.${id}`);
  for (const c of cands) {
    const k = detectFormatFromContent(c, bytes)?.key;
    if (k && (!wantKey || k === wantKey)) return c;
  }
  return undefined;
}

function registryEntryFor(id: string) {
  const low = id.toLowerCase();
  return FORMAT_REGISTRY.find((f) => f.key.toLowerCase() === low)
    ?? FORMAT_REGISTRY.find((f) => f.key.toLowerCase() === low.split('_')[0]);
}

function extOf(fmtExt: RegExp | undefined): string | undefined {
  const m = fmtExt?.source.match(/^\\\.\(?([a-z0-9]+)/i);
  return m?.[1];
}

async function generate(d: EditableFormatDescriptor): Promise<Verdict> {
  const id = d.formatId;
  const fixture = fixtureFor(id);
  let song: TrackerSong;
  let source: string;
  let wantKey: string | undefined;
  let ext: string | undefined = d.exporter!.ext;
  let prefix: string | undefined;
  let label = '';

  if (fixture) {
    source = fixture;
    const base = (fixture.split('/').pop() ?? fixture).toLowerCase();
    const fmt = detectFormat(base);
    wantKey = detectFormatFromContent(base, readFixture(fixture))?.key ?? fmt?.key;
    label = fmt?.label ?? '';
    const dot = base.lastIndexOf('.');
    ext = ext ?? (dot > 0 ? base.slice(dot + 1) : undefined);
    prefix = base.includes('.') ? base.slice(0, base.indexOf('.')) : undefined;
    song = await parseAs(fixture, readFixture(fixture));
    // As applySong does on load: exporters that write only edited cells (editedCells) diff the grid against this.
    setGridBaseline(baselineOf(song.patterns));
  } else {
    const reg = registryEntryFor(id);
    wantKey = reg?.key;
    label = reg?.label ?? '';
    ext = ext ?? extOf(reg?.extRegex);
    prefix = reg?.prefixes?.[0]?.replace(/\.$/, '');
    source = 'blank song built by the generator (no committed fixture)';
    setGridBaseline(null);
    song = blankSong(id === 'adplug' ? 9 : 4, id === 'xmf');
  }

  const variants: Array<[string, TrackerSong]> = fixture
    ? [['trimmed-1-pattern', trimToOne(song)], ['cleared-all-patterns', clearAll(song)]]
    : [['blank-song', song]];
  const errors: string[] = [];
  for (const [variant, s] of variants) {
    let out: Uint8Array;
    try {
      out = await runExporter(d, s);
      // Future Player: every row its own rest, played once (fpOnePassTemplate).
      if (id === 'futurePlayer') out = fpOnePassTemplate(out, FP_TEMPLATE_POSITIONS);
    } catch (e) {
      errors.push(`${variant}: export: ${(e as Error).message}`);
      continue;
    }
    const file = pickFileName(id, ext, prefix, out, wantKey);
    if (!file) { errors.push(`${variant}: no file name that detection resolves to ${wantKey ?? '(any)'} (ext=${ext}, prefix=${prefix})`); continue; }
    let re: TrackerSong;
    try {
      // Parse under the template's own name: that is the name openSong sees on New Song.
      re = await parseAs(file, out);
    } catch (e) {
      errors.push(`${variant}: reparse: ${(e as Error).message}`);
      continue;
    }
    if (re.patterns.length < 1) { errors.push(`${variant}: reparse has no patterns`); continue; }
    const filled = nonEmptyCells(re);
    if (filled > 0) { errors.push(`${variant}: reparsed template still has ${filled} non-empty cells`); continue; }
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, file), out);
    return {
      status: 'written', file: `templates/${file}`, source, variant, bytes: out.length,
      ...(d.label === '' ? { name: label } : {}),
    };
  }
  return { status: 'failed', source, reason: errors.join(' | ') };
}

describe.skipIf(!ENABLED)('new-song template generator', () => {
  it('writes one blank template per exporter format and records every verdict', async () => {
    const verdicts = loadVerdicts();
    const targets = listEditableFormats().filter((d) => d.exporter);
    for (const d of targets) {
      const id = d.formatId;
      const forced = FORCE.includes('all') || FORCE.includes(id);
      // A descriptor with a template keeps its recorded verdict; only --force regenerates it.
      if (d.newSong && !forced) {
        verdicts[id] ??= { status: 'skipped', file: d.newSong.template, reason: 'descriptor already has newSong' };
        continue;
      }
      if (id === 'preTracker') { verdicts[id] = { status: 'skipped', reason: 'store-dependent exporter' }; continue; }
      const prev = verdicts[id];
      if (!forced && prev?.status === 'written' && prev.file && existsSync(join(ROOT, 'public', prev.file))) continue;
      try {
        verdicts[id] = await generate(d);
      } catch (e) {
        verdicts[id] = { status: 'failed', reason: `generate: ${(e as Error).message}` };
      }
      mkdirSync(join(ROOT, 'thoughts/shared/plans'), { recursive: true });
      writeFileSync(VERDICTS_PATH, JSON.stringify(verdicts, null, 2) + '\n');
    }
    writeFileSync(VERDICTS_PATH, JSON.stringify(verdicts, null, 2) + '\n');
    expect(Object.keys(verdicts).length).toBeGreaterThan(0);
  }, 900_000);
});
