/**
 * A user-made Neo Geo song (fixtures/neo_geo_composer_trial.dbx) exported by the .fur writer
 * must pass ngdevkit furtool.py, the tool that turns a .fur into nullsound ROM data.
 * Uses the vendored ngdevkit (third-party/ngdevkit, run through python3); FURTOOL overrides the path.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decompressProject } from '@/lib/projectCompression';
import { exportFurnaceModule, type FurnaceModuleSong } from '../FurnaceModuleExporter';
import { INS_SSG, NEO, NeoGeoSongBuilder } from '../neogeo/neoGeoCompose';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import type { FurnaceConfig, FurnaceMacro, FurnaceOperatorConfig } from '@/types/instrument';
import { parseFurnaceFile } from '@lib/import/parsers/FurnaceToSong';
import { FurnaceDispatchPlatform } from '@/engine/furnace-dispatch/platforms';
import '@lib/import/formats/FurnaceSongParser';
import '@lib/import/InstrumentConverter';
import '@lib/import/formats/furnace/FurnaceInstrumentParser';
import { installFurnaceFileOpsWasm, readSong } from '@lib/import/__tests__/furnaceFileOpsWasmHarness';

const NGDK_TOOLS = resolve(__dirname, '../../../../third-party/ngdevkit/tools');
const FURTOOL = process.env.FURTOOL ?? join(NGDK_TOOLS, 'furtool.py');
const NSSTOOL = process.env.NSSTOOL ?? join(NGDK_TOOLS, 'nsstool.py');

/** Runs a tool; execFileSync throws on a non-zero exit, which fails the test with the tool's stderr. */
const run = (tool: string, args: string[]): string =>
  execFileSync('python3', [tool, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const OPNB = 14;
const seqMacro = (code: number, data: number[]): FurnaceMacro => ({ code, type: 0, data, loop: -1, release: -1, mode: 0 });

/** FD tempo change, F8/F9 volume steps on FM1, SSG noise-frequency macro (code 2) on SSG1; bpm 100. */
function fxSong(): FurnaceModuleSong {
  const s = new NeoGeoSongBuilder('fx', 6, 16);
  s.bpm = 100;
  const op = (o: Partial<FurnaceOperatorConfig>): FurnaceOperatorConfig =>
    ({ ...DEFAULT_FURNACE.operators[0], dt: 3, rs: 0, ssg: 0, am: false, kvs: 2, ar: 31, dr: 4, d2r: 0, sl: 1, rr: 6, mult: 1, ...o, enabled: true }) as FurnaceOperatorConfig;
  const lead = s.addInstrument('Lead', {
    ...DEFAULT_FURNACE, chipType: OPNB, algorithm: 4, feedback: 5, fms: 0, ams: 0,
    operators: [op({ tl: 30 }), op({ tl: 40, mult: 2 }), op({ tl: 8 }), op({ tl: 10 })], macros: [], opMacros: [{}, {}, {}, {}],
  } as FurnaceConfig);
  const hat = s.addInstrument('Hat', {
    ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_SSG, operators: [], opMacros: [],
    macros: [seqMacro(0, [15, 10, 5, 0]), seqMacro(2, [31, 17, 4]), seqMacro(3, [2, 2, 2, 2])],
  } as FurnaceConfig);
  const p = s.pattern();
  p.put(NEO.FM1, 0, { note: 'C-4', ins: lead, fx: [[0xf8, 0x06]] }).put(NEO.FM1, 4, { note: 'E-4', ins: lead, fx: [[0xf9, 0x03]] });
  p.put(NEO.SSG1, 0, { note: 'C-5', ins: hat });
  p.put(NEO.FM3, 8, { fx: [[0xfd, 0x91]] }).put(NEO.FM3, 15, { fx: [[0x0b, 0]] });
  s.order.push(0);
  expect(s.problems).toEqual([]);
  return s.build();
}

interface Dbx {
  bpm: number;
  speed?: number;
  patterns: FurnaceModuleSong['patterns'];
  patternOrder: number[];
  instruments: FurnaceModuleSong['instruments'];
}

function trialSong(): FurnaceModuleSong {
  const buf = readFileSync(resolve(__dirname, 'fixtures/neo_geo_composer_trial.dbx'));
  const d = JSON.parse(decompressProject(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)) as Dbx;
  return { name: 'trial', patterns: d.patterns, instruments: d.instruments, songPositions: d.patternOrder, initialSpeed: d.speed ?? 6, initialBPM: d.bpm };
}

describe.skipIf(!existsSync(FURTOOL))('Neo Geo .fur export passes ngdevkit furtool', () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('furtool -i and -s read the exported module with exit 0 and no error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'furtool-'));
    try {
      const fur = join(dir, 'trial.fur');
      writeFileSync(fur, exportFurnaceModule(trialSong()).bytes);
      for (const action of ['-i', '-s']) {
        const out = run(FURTOOL, [action, '-o', join(dir, `out${action}.s`), fur]);
        expect(out).not.toMatch(/error/i);
      }
      expect(readFileSync(join(dir, 'out-i.s'), 'utf8').length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Real Neo Geo (YM2610 ext) songs, loaded the way ModuleLoader loads a .fur and exported the way
  // moduleExportService.exportFurnaceModuleFile does.
  it.each(['devilbox/afterburn-run.fur', 'devilbox/ironwing.fur'])('real song %s: exported .fur passes furtool -i, -s and nsstool', async (name) => {
    const song = await parseFurnaceFile(readSong(name), name);
    const extendedFm = song.furnaceNative?.chipIds.includes(FurnaceDispatchPlatform.YM2610_EXT) ?? false;
    const res = exportFurnaceModule({ ...song, extendedFm });
    const dir = mkdtempSync(join(tmpdir(), 'furtool-real-'));
    try {
      const fur = join(dir, 'real.fur');
      writeFileSync(fur, res.bytes);
      for (const action of ['-i', '-s']) {
        const out = run(FURTOOL, [action, '-o', join(dir, `out${action}.s`), fur]);
        expect(out).not.toMatch(/error/i);
      }
      const warn = run(NSSTOOL, ['-o', join(dir, 'nss.s'), fur]);
      console.log(`[furtool-real] ${name}: export warnings ${JSON.stringify(res.warnings)}; nsstool: ${warn.trim() || '(none)'}`);
      expect(readFileSync(join(dir, 'nss.s'), 'utf8').length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);

  it('FD, F8, F9 and the SSG noise macro reach nullsound data (stock ngdevkit drops all four)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'furtool-fx-'));
    try {
      const fur = join(dir, 'fx.fur');
      writeFileSync(fur, exportFurnaceModule(fxSong()).bytes);
      const insOut = join(dir, 'ins.s');
      const nssOut = join(dir, 'nss.s');
      run(FURTOOL, ['-i', '-o', insOut, fur]);
      const warn = run(NSSTOOL, ['-o', nssOut, fur]);
      expect(warn).not.toMatch(/unsupported FX/);
      // Noise macro loads YM2610 reg 0x06 (SSG noise period).
      expect(readFileSync(insOut, 'utf8')).toMatch(/ld\s+b, #0x06\s*\n\s*ld\s+c, \(hl\)/);
      const nss = readFileSync(nssOut, 'utf8');
      // Timer B: bpm 100 -> 0xa9 at start; FD91 (N 145) -> 0xc4.
      expect([...nss.matchAll(/\.db\s+0x04, (0x[0-9a-f]{2})\s+; TEMPO/g)].map((m) => m[1])).toEqual(['0xa9', '0xc4']);
      expect(nss).toMatch(/\.db\s+0x32, 0x06\s+; VOL_STEP_U/);
      expect(nss).toMatch(/\.db\s+0x4d, 0x03\s+; VOL_STEP_D/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
