#!/usr/bin/env npx tsx
/**
 * Playback Smoke Test — regression harness for the TrackerReplayer refactor.
 *
 * Loads a battery of representative songs across all major format families,
 * plays each for a few seconds, and asserts:
 *   - No console errors during load/playback
 *   - Audio level is non-silent (RMS > threshold)
 *   - Song info reports the expected format
 *
 * Run BEFORE and AFTER each refactor phase to verify nothing regressed.
 *
 * Usage:
 *   1. Start the dev server: `npm run dev` (from project root)
 *   2. Open DEViLBOX in a browser, click anywhere to unlock the AudioContext
 *   3. Run: `npx tsx tools/playback-smoke-test.ts`
 *
 * The script connects to the MCP WebSocket relay (ws://localhost:4003/mcp),
 * drives the running browser via bridge calls, and reports a pass/fail summary.
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

// ── Configuration ──────────────────────────────────────────────────────────

const WS_URL = process.env.MCP_BRIDGE_URL ?? 'ws://localhost:4003/mcp';
const API_BASE = process.env.DEVILBOX_API ?? 'http://localhost:3001';
const PLAY_DURATION_MS = 3000;
const SILENCE_THRESHOLD_RMS = 0.001;
const PER_TEST_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 30000;

interface TestCase {
  name: string;
  family: string;
  loader: 'modland' | 'hvsc' | 'fur' | 'local';
  path: string;
  /** Subset of editorMode the loaded file should report (substring match) */
  expectedEditorMode?: string;
  /** Allow this test to be silent (some loop-based formats may not report level reliably) */
  allowSilent?: boolean;
  /**
   * True for engine-driven formats with no tracker pattern data (SID, etc.).
   * Skips the noteCells check — these formats are 6502/68k code that runs
   * directly on an emulated chip; there are no pattern rows to inspect.
   */
  engineDriven?: boolean;
  /** Companion file paths (e.g. TFMX smpl.* alongside mdat.*) */
  companionPaths?: string[];
}

/**
 * Auto-discover test cases from the local Reference Music collection.
 * For each format directory, picks the first file (alphabetically) as the test case.
 * This gives us ~170 format tests without any hardcoded paths.
 */
async function discoverLocalTests(baseDir: string): Promise<TestCase[]> {
  const { readdirSync, statSync } = await import('fs');
  const { join } = await import('path');
  const tests: TestCase[] = [];

  let dirs: string[];
  try {
    dirs = readdirSync(baseDir).filter(d => {
      try { return statSync(join(baseDir, d)).isDirectory(); } catch { return false; }
    }).sort();
  } catch { return tests; }

  for (const dir of dirs) {
    if (dir === 'Reference Music' || dir === 'Packed_Etc') continue;
    const fullDir = join(baseDir, dir);
    let files: string[];
    try {
      files = readdirSync(fullDir).filter(f => {
        try { return statSync(join(fullDir, f)).isFile() && !f.startsWith('.'); } catch { return false; }
      }).sort();
    } catch { continue; }

    if (files.length === 0) continue;

    // Pick first file as test case
    const testFile = join(fullDir, files[0]);
    tests.push({
      name: `${dir} — ${files[0]}`,
      family: dir.substring(0, 12).toUpperCase(),
      loader: 'local',
      path: testFile,
      engineDriven: true,  // most UADE formats are engine-driven
      allowSilent: false,
    });
  }
  return tests;
}

const TESTS: TestCase[] = [
  // ── PC tracker formats (libopenmpt/OpenMPT WASM path) ──
  { name: 'Captain - Space Debris',           family: 'MOD',      loader: 'modland', path: 'pub/modules/Protracker/Captain/space debris.mod', expectedEditorMode: 'classic' },
  { name: 'Skaven - Bookworm',                family: 'IT',       loader: 'modland', path: 'pub/modules/Impulsetracker/Skaven/bookworm.it', expectedEditorMode: 'classic' },
  { name: 'Skaven - Catch That Goblin',       family: 'S3M',      loader: 'modland', path: 'pub/modules/Screamtracker 3/Skaven/catch that goblin!!.s3m', expectedEditorMode: 'classic' },
  { name: 'XM - Believe',                     family: 'XM',       loader: 'modland', path: 'pub/modules/Fasttracker 2/Skaven/believe.xm', expectedEditorMode: 'classic' },
  { name: 'Multitracker - cthulhu',           family: 'MTM',      loader: 'modland', path: 'pub/modules/Multitracker/Starscream/cthulhu.mtm' },
  { name: 'Composer 669 - test',              family: '669',      loader: 'modland', path: 'pub/modules/Composer 669/- unknown/brain.669' },
  { name: 'Ultratracker - test',              family: 'ULT',      loader: 'modland', path: 'pub/modules/Ultratracker/Emax/nightfly.ult' },
  { name: 'Farandole - test',                 family: 'FAR',      loader: 'modland', path: 'pub/modules/Farandole Composer/Brain Slayer/brain slayer - break.far' },
  { name: 'Screamtracker 2 - test',           family: 'STM',      loader: 'modland', path: 'pub/modules/Screamtracker 2/Purple Motion/space debris.stm' },
  { name: 'DigiTracker DTM',                  family: 'DTM',      loader: 'modland', path: 'pub/modules/Digital Tracker DTM/- unknown/atsea.dtm' },
  { name: 'Oktalyzer - test',                 family: 'OKT',      loader: 'modland', path: 'pub/modules/Oktalyzer/- unknown/aftersun.okt' },
  { name: 'DigiBooster Pro',                  family: 'DBM',      loader: 'modland', path: 'pub/modules/Digibooster Pro/Asle/sweet dreams.dbm' },
  { name: 'Graoumf Tracker 2',               family: 'GT2',      loader: 'modland', path: 'pub/modules/Graoumf Tracker 2/Doh/fading out.gt2' },
  { name: 'OpenMPT MPTM',                    family: 'MPTM',     loader: 'modland', path: 'pub/modules/OpenMPT MPTM/Saga Musix/the prisoner.mptm' },
  // ── Hively / AHX (dedicated HivelyEngine) ──
  { name: 'AceMan - Hexplosion',              family: 'HVL',      loader: 'modland', path: 'pub/modules/HivelyTracker/AceMan/hexplosion.hvl', expectedEditorMode: 'hively' },
  { name: 'AHX - test',                       family: 'AHX',      loader: 'modland', path: 'pub/modules/AHX/Laxity/laxity-ingame.ahx', expectedEditorMode: 'hively' },
  // ── UADE Amiga formats (dedicated WASM engines or UADE fallback) ──
  { name: 'Future Composer 1.4 - Blaizer',    family: 'FC14',     loader: 'modland', path: 'pub/modules/Future Composer 1.4/Blaizer/horizon v2.fc' },
  { name: 'Future Composer 1.3 - test',       family: 'FC13',     loader: 'modland', path: 'pub/modules/Future Composer 1.3/- unknown/all my dreams.fc13' },
  { name: 'JamCracker - bartmanintro',        family: 'JAM',      loader: 'modland', path: 'pub/modules/JamCracker/Ape/bartmanintro.jam' },
  { name: 'SoundMon 2 - test',               family: 'SM2',      loader: 'modland', path: 'pub/modules/BP SoundMon 2/Hippel/axel f.bp' },
  { name: 'SoundMon 3 - test',               family: 'SM3',      loader: 'modland', path: 'pub/modules/BP SoundMon 3/Dexter/last ninja ingame.bp3' },
  { name: 'SidMon 1 - test',                 family: 'SIDMON1',  loader: 'modland', path: 'pub/modules/SidMon 1/Daglish/cobra.sid1' },
  { name: 'SidMon 2 - test',                 family: 'SIDMON2',  loader: 'modland', path: 'pub/modules/SidMon 2/- unknown/alchemist.sid2' },
  { name: 'Digital Mugician - test',          family: 'DIGMUG',   loader: 'modland', path: 'pub/modules/Digital Mugician/Laxity/commando.dmu' },
  { name: 'Sonic Arranger - test',            family: 'SA',       loader: 'modland', path: 'pub/modules/Sonic Arranger/Hippel/battle squadron title.sa' },
  { name: 'Hippel COSO - test',              family: 'COSO',     loader: 'modland', path: 'pub/modules/Hippel COSO/Hippel/chambers of shaolin title.coso' },
  { name: 'David Whittaker - test',           family: 'DW',       loader: 'modland', path: 'pub/modules/David Whittaker/- unknown/afterburner.dw' },
  { name: 'Rob Hubbard - test',              family: 'RH',       loader: 'modland', path: 'pub/modules/Rob Hubbard/- unknown/goldrunner.rh' },
  { name: 'Delta Music 2 - test',            family: 'DM2',      loader: 'modland', path: 'pub/modules/Delta Music 2/- unknown/axel f.dm2' },
  { name: 'Delta Music - test',              family: 'DM1',      loader: 'modland', path: 'pub/modules/Delta Music/- unknown/batman.dm' },
  { name: 'Art of Noise - test',             family: 'AON',      loader: 'modland', path: 'pub/modules/Art Of Noise/- unknown/art of noise.aon' },
  { name: 'SoundFX - test',                  family: 'SFX',      loader: 'modland', path: 'pub/modules/SoundFX/- unknown/androids.sfx' },
  { name: 'Richard Joseph - test',           family: 'RJ',       loader: 'modland', path: 'pub/modules/Richard Joseph/- unknown/barbarian 2 ingame.rj' },
  { name: 'Fred Editor - test',              family: 'FRED',     loader: 'modland', path: 'pub/modules/FredMon/Gray/batman.fred' },
  { name: 'Dave Lowe - test',                family: 'DL',       loader: 'modland', path: 'pub/modules/Dave Lowe/- unknown/battle squadron.dl' },
  { name: 'Ben Daglish - test',              family: 'BD',       loader: 'modland', path: 'pub/modules/Ben Daglish/- unknown/deflektor.bd' },
  { name: 'Mark Cooksey - test',             family: 'MC',       loader: 'modland', path: 'pub/modules/Mark Cooksey/- unknown/ghosts n goblins.mk' },
  { name: 'Jason Page - test',               family: 'JP',       loader: 'modland', path: 'pub/modules/Jason Page/- unknown/shadow of the beast.jp' },
  { name: 'Infogrames - test',               family: 'INFO',     loader: 'modland', path: 'pub/modules/Infogrames/- unknown/hostages.infogrames' },
  { name: 'Steve Turner - test',             family: 'ST',       loader: 'modland', path: 'pub/modules/- unknown/steve turner/quazatron.stt', allowSilent: true },
  { name: 'InStereo 2.0 - test',             family: 'IS2',      loader: 'modland', path: 'pub/modules/InStereo! 2.0/- unknown/enigma tune.is20' },
  { name: 'Hippel ST - test',                family: 'HIPST',    loader: 'modland', path: 'pub/modules/Hippel ST/Hippel/seven gates of jambala ingame.hip' },
  { name: 'Hippel - test',                   family: 'HIP',      loader: 'modland', path: 'pub/modules/Hippel/Hippel/turrican ii - the final fight (title).hip7' },
  { name: 'TCB Tracker - test',              family: 'TCB',      loader: 'modland', path: 'pub/modules/TCB Tracker/- unknown/cauldron.tcb' },
  { name: 'Pretracker - test',               family: 'PRT',      loader: 'modland', path: 'pub/modules/Pretracker/Virgill/still got the magic.prt', engineDriven: true },
  { name: 'PumaTracker - test',              family: 'PUMA',     loader: 'modland', path: 'pub/modules/Pumatracker/Virgill/puma1.puma' },
  { name: 'Music Assembler - test',          family: 'MA',       loader: 'modland', path: 'pub/modules/Music Assembler/- unknown/batman.ma' },
  { name: 'Special FX - test',               family: 'SPECFX',   loader: 'modland', path: 'pub/modules/Special FX/- unknown/goldrunner 2.sfx' },
  { name: 'Maniacs of Noise - test',         family: 'MON',      loader: 'modland', path: 'pub/modules/Maniacs Of Noise/- unknown/battle isle.mon' },
  { name: 'Quadra Composer - test',          family: 'QC',       loader: 'modland', path: 'pub/modules/Quadra Composer/- unknown/aquanaut.qc' },
  { name: 'Wally Beben - test',              family: 'WB',       loader: 'modland', path: 'pub/modules/Wally Beben/- unknown/beast 3.wb' },
  { name: 'Ron Klaren - test',               family: 'RK',       loader: 'modland', path: 'pub/modules/Ron Klaren/- unknown/espionage.rk' },
  { name: 'Sound Master - test',             family: 'SNDM',     loader: 'modland', path: 'pub/modules/Sound Master/- unknown/beast lord.sm' },
  { name: 'Sean Conran - test',              family: 'SC',       loader: 'modland', path: 'pub/modules/Sean Conran/- unknown/sean conran 01.sc' },
  { name: 'Kris Hatlelid - test',            family: 'KH',       loader: 'modland', path: 'pub/modules/Kris Hatlelid/- unknown/cardiaxx.kh' },
  { name: 'Anders Oland - test',             family: 'AO',       loader: 'modland', path: 'pub/modules/Anders Oland/- unknown/apidya.ao' },
  { name: 'Jeroen Tel - test',               family: 'JT',       loader: 'modland', path: 'pub/modules/Jeroen Tel/- unknown/9 fingers.jt' },
  { name: 'Paul Robotham - test',            family: 'PR',       loader: 'modland', path: 'pub/modules/Paul Robotham/- unknown/apidya.pr' },
  { name: 'Jesper Olsen - test',             family: 'JO',       loader: 'modland', path: 'pub/modules/Jesper Olsen/- unknown/barbarian.jo' },
  { name: 'Fashion Tracker - test',          family: 'FT',       loader: 'modland', path: 'pub/modules/Fashion Tracker/- unknown/intro.ft' },
  { name: 'Pierre Adane - test',             family: 'PA',       loader: 'modland', path: 'pub/modules/Pierre Adane Packer/- unknown/bubble ghost.pa' },
  { name: 'MultiMedia Sound - test',         family: 'MMS',      loader: 'modland', path: 'pub/modules/MultiMedia Sound/- unknown/hybris title.mms' },
  { name: 'Maximum Effect - test',           family: 'MXE',      loader: 'modland', path: 'pub/modules/Maximum Effect/- unknown/apidya.mxe' },
  { name: 'Thomas Hermann - test',           family: 'TH',       loader: 'modland', path: 'pub/modules/Thomas Hermann/- unknown/thomas hermann 01.th' },
  { name: 'SCUMM - test',                    family: 'SCUMM',    loader: 'modland', path: 'pub/modules/SCUMM/- unknown/monkey island 2 - map.scumm', engineDriven: true },
  { name: 'Medley - test',                   family: 'MDLY',     loader: 'modland', path: 'pub/modules/Medley/- unknown/medley 01.mdly', allowSilent: true },
  // ── C64 SID (engine-driven — no pattern data) ──
  { name: 'Hubbard - Commando',               family: 'SID',     loader: 'hvsc',    path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid', engineDriven: true },
  // ── TFMX (companion files required) ──
  { name: 'TFMX - Turrican Aliens',           family: 'TFMX',    loader: 'modland', path: 'pub/modules/TFMX/Chris Huelsbeck/mdat.turrican aliens', companionPaths: ['pub/modules/TFMX/Chris Huelsbeck/smpl.turrican aliens'] },
  // ── Chiptune formats (dedicated engines) ──
  { name: 'Klystrack - test',                 family: 'KT',      loader: 'modland', path: 'pub/modules/Klystrack/kometbomb/one.kt', expectedEditorMode: 'klystrack', engineDriven: true },
];

// ── WebSocket bridge client ────────────────────────────────────────────────

class MCPBridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (resp: { type: string; data?: unknown; error?: string }) => void>();
  private connectPromise: Promise<void>;

  constructor(url: string) {
    this.connectPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => this.handleMessage(data.toString()));
      this.ws.on('close', () => {
        for (const [, fn] of this.pending) {
          fn({ type: 'error', error: 'Connection closed' });
        }
        this.pending.clear();
      });
    });
  }

  ready(): Promise<void> { return this.connectPromise; }

  private handleMessage(text: string): void {
    let msg: { id: string; type: string; data?: unknown; error?: string };
    try { msg = JSON.parse(text); } catch { return; }
    const fn = this.pending.get(msg.id);
    if (fn) {
      this.pending.delete(msg.id);
      fn(msg);
    }
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Bridge not connected'));
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`call('${method}') timed out after ${PER_TEST_TIMEOUT_MS}ms`));
      }, PER_TEST_TIMEOUT_MS);
      this.pending.set(id, (resp) => {
        clearTimeout(timer);
        if (resp.type === 'error') reject(new Error(resp.error ?? 'unknown'));
        else resolve(resp.data as T);
      });
      this.ws!.send(JSON.stringify({ id, type: 'call', method, params }));
    });
  }

  close(): void { this.ws?.close(); }
}

// ── Test runner ────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  family: string;
  status: 'pass' | 'fail' | 'skip';
  rmsAvg?: number;
  rmsMax?: number;
  errorCount?: number;
  reason?: string;
  durationMs: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Download a file from the Express API and return base64 + filename */
async function downloadFile(loader: 'modland' | 'hvsc', path: string): Promise<{ filename: string; base64: string }> {
  const endpoint = loader === 'modland'
    ? `${API_BASE}/api/modland/download?path=${encodeURIComponent(path)}`
    : `${API_BASE}/api/hvsc/download?path=${encodeURIComponent(path)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(endpoint, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const filename = path.split('/').pop() ?? 'download';
    return { filename, base64: buf.toString('base64') };
  } finally {
    clearTimeout(timer);
  }
}

interface SongInfoResp {
  editorMode?: string;
  numChannels?: number;
  numPatterns?: number;
  patternLength?: number;
  bpm?: number;
}
interface PatternStatsResp {
  patternIndex?: number;
  totalCells?: number;
  noteCells?: number;
  effectCells?: number;
  noteDensity?: number;
  uniqueNotes?: number;
  error?: string;
}

async function runTest(client: MCPBridgeClient, test: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    // 1. Clean slate — clear console and remove any master effects that could
    //    trigger format-compatibility dialogs during native-format loads.
    await client.call('clear_console_errors');
    try {
      const audioState = await client.call<{ masterEffects?: { id: string }[] }>('get_audio_state');
      if (audioState?.masterEffects?.length) {
        for (const fx of audioState.masterEffects) {
          await client.call('remove_master_effect', { effectId: fx.id });
        }
      }
    } catch { /* audio state read may fail on first call */ }

    // 2. Load — download via Express API, then send to browser via load_file
    if (test.loader === 'modland' || test.loader === 'hvsc') {
      const { filename, base64 } = await downloadFile(test.loader, test.path);

      // Download companion files (e.g. TFMX smpl.* alongside mdat.*)
      let companionFiles: Record<string, string> | undefined;
      if (test.companionPaths?.length) {
        companionFiles = {};
        for (const cp of test.companionPaths) {
          const companion = await downloadFile(test.loader, cp);
          companionFiles[companion.filename] = companion.base64;
        }
      }

      await client.call('load_file', { filename, data: base64, ...(companionFiles ? { companionFiles } : {}) });
    } else if (test.loader === 'fur') {
      await client.call('play_fur', { path: test.path });
    } else if (test.loader === 'local') {
      // Load directly from disk via the MCP load_file tool
      await client.call('load_file', { path: test.path });
    }

    // 3. Verify the song actually loaded with pattern data BEFORE play()
    // This catches "loaded but no patterns" failures (the bartmanintro bug)
    // that audio-level checks miss when the engine plays silence.
    const songInfo = await client.call<SongInfoResp>('get_song_info');
    if (!songInfo || (songInfo.numPatterns ?? 0) <= 0) {
      await client.call('stop').catch(() => {});
      return {
        name: test.name, family: test.family, status: 'fail',
        reason: `no patterns loaded (numPatterns=${songInfo?.numPatterns ?? 'undefined'})`,
        durationMs: Date.now() - start,
      };
    }
    if ((songInfo.numChannels ?? 0) <= 0) {
      await client.call('stop').catch(() => {});
      return {
        name: test.name, family: test.family, status: 'fail',
        reason: `no channels loaded (numChannels=${songInfo.numChannels ?? 'undefined'})`,
        durationMs: Date.now() - start,
      };
    }

    // Verify pattern 0 has actual notes — not just empty rows. The
    // bartmanintro symptom: song loads with patterns and channels declared,
    // but every cell is empty so playback is silent. Fail-fast on this.
    // Skipped for engine-driven formats (SID, etc.) that have no pattern data.
    //
    // Poll with retries: load_file returns from the bridge before the async
    // parser finishes populating the TrackerStore, so pattern data may not
    // be ready immediately. Wait up to 3s for notes to appear.
    if (!test.engineDriven) {
      let noteCells = 0;
      const patternPollDeadline = Date.now() + 3000;
      while (Date.now() < patternPollDeadline) {
        try {
          const stats = await client.call<PatternStatsResp>('get_pattern_stats', { patternIndex: 0 });
          noteCells = stats.noteCells ?? 0;
          if (noteCells > 0) break;
        } catch {
          // get_pattern_stats unavailable — wait and retry
        }
        await sleep(200);
      }
      if (noteCells === 0) {
        await client.call('stop').catch(() => {});
        return {
          name: test.name, family: test.family, status: 'fail',
          reason: 'pattern 0 has no note cells after 3s (load decoded but pattern data is empty)',
          durationMs: Date.now() - start,
        };
      }
    }

    // 4. Now play
    if (test.loader === 'modland' || test.loader === 'hvsc') {
      await client.call('play', { mode: 'song' });
    }
    // (fur loader already started playback inside play_fur)

    // 5. Wait for audio output (best-effort)
    try {
      await client.call('wait_for_audio', { thresholdRms: SILENCE_THRESHOLD_RMS, timeoutMs: 5000 });
    } catch { /* fall through to level check */ }

    // 6. Let it play
    await sleep(PLAY_DURATION_MS);

    // 7. Measure
    const level = await client.call<{ rmsAvg: number; rmsMax: number; isSilent: boolean }>(
      'get_audio_level',
      { durationMs: 1000 },
    );

    // 8. Check console errors
    const errs = await client.call<{ entries: Array<{ level: string; message: string }> }>('get_console_errors');
    const critical = errs.entries.filter((e) =>
      e.level === 'error' &&
      // Filter out known-noise warnings that aren't real failures
      !e.message.includes('Failed to load resource') &&
      !e.message.includes('AudioContext was not allowed'),
    );

    // 9. Verify editorMode (if expected)
    let editorModeOk = true;
    if (test.expectedEditorMode && songInfo.editorMode) {
      editorModeOk = songInfo.editorMode === test.expectedEditorMode;
    }

    // 10. Stop
    await client.call('stop');

    const durationMs = Date.now() - start;

    // 11. Verdict — STRICT: trust rmsAvg/rmsMax directly, don't rely on the
    // tool's isSilent flag (which has historically been too lenient).
    const audibleByOurThreshold = (level.rmsAvg ?? 0) >= SILENCE_THRESHOLD_RMS
      || (level.rmsMax ?? 0) >= SILENCE_THRESHOLD_RMS * 4;
    if (!audibleByOurThreshold && !test.allowSilent) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: `silent (rmsAvg=${level.rmsAvg.toFixed(6)}, rmsMax=${level.rmsMax.toFixed(6)}, threshold=${SILENCE_THRESHOLD_RMS})`,
        durationMs,
      };
    }
    if (critical.length > 0) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: `${critical.length} console error(s): ${critical[0].message.slice(0, 80)}`,
        durationMs,
      };
    }
    if (!editorModeOk) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: `editorMode mismatch (expected ${test.expectedEditorMode}, got ${songInfo.editorMode})`,
        durationMs,
      };
    }
    return {
      name: test.name, family: test.family, status: 'pass',
      rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
      errorCount: critical.length,
      durationMs,
    };
  } catch (err) {
    try { await client.call('stop'); } catch { /* best-effort cleanup */ }
    return {
      name: test.name, family: test.family, status: 'fail',
      reason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const REFERENCE_MUSIC_DIR = process.env.REFERENCE_MUSIC ?? '/Users/spot/Code/Reference Music';

async function main(): Promise<void> {
  // Auto-discover tests from the local Reference Music collection
  const localTests = await discoverLocalTests(REFERENCE_MUSIC_DIR);
  // CLI: --local-only skips the hardcoded Modland/HVSC tests, --hardcoded-only skips local
  const args = process.argv.slice(2);
  const localOnly = args.includes('--local-only');
  const hardcodedOnly = args.includes('--hardcoded-only');
  const allTests = hardcodedOnly ? TESTS : localOnly ? localTests : [...TESTS, ...localTests];

  console.log('▶ DEViLBOX playback smoke test');
  console.log(`  Bridge: ${WS_URL}`);
  console.log(`  Tests:  ${allTests.length} (${TESTS.length} hardcoded + ${localTests.length} local)`);
  console.log('');

  const client = new MCPBridgeClient(WS_URL);
  try {
    await client.ready();
  } catch (err) {
    console.error(`✗ Failed to connect to MCP bridge at ${WS_URL}`);
    console.error('  Make sure the dev server is running (npm run dev) and DEViLBOX is open in a browser.');
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }

  const results: TestResult[] = [];
  for (const test of allTests) {
    // Brief pause between tests to let AudioContext and WASM settle
    if (results.length > 0) await sleep(2000);
    process.stdout.write(`  [${test.family.padEnd(5)}] ${test.name.padEnd(40)} `);
    const result = await runTest(client, test);
    results.push(result);
    const dt = `${(result.durationMs / 1000).toFixed(1)}s`;
    if (result.status === 'pass') {
      const rms = result.rmsAvg?.toFixed(4) ?? '?';
      console.log(`✓ pass (rms ${rms}, ${dt})`);
    } else if (result.status === 'skip') {
      console.log(`○ skip (${result.reason}, ${dt})`);
    } else {
      console.log(`✗ fail (${result.reason}, ${dt})`);
    }
  }

  client.close();

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  console.log('');
  console.log('── Summary ─────────────────');
  console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    console.log('');
    console.log('  Failures:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`    ✗ [${r.family}] ${r.name} — ${r.reason}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
