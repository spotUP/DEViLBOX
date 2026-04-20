#!/usr/bin/env npx tsx
/**
 * Playback Smoke Test — THE format regression harness for DEViLBOX.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE CANONICAL FORMAT AUDIT SCRIPT. DO NOT CREATE A NEW ONE.
 *  If it needs fixing, fix THIS file. If it needs new features, add them
 *  HERE. Future agents: read this header before writing any new test script.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Loads representative songs across all format families DEViLBOX supports,
 * plays each for a few seconds, and runs a multi-tier verification:
 *   Tier 1: Audio — non-silent (RMS > threshold), no console errors,
 *                   peakMax < 4.0 (unambiguous clipping fails the test;
 *                   peaks 1.5–4.0 report as WARN for visibility)
 *   Tier 2: Instruments — correct synthType, named instruments exist
 *   Tier 3: Export round-trip — native export + reimport for PC formats
 *   Tier 4: Special formats — MIDI, V2M, and other edge-case formats
 *   Tier 5: Parameters — synth config fields are populated (coverage %)
 *   Tier 6: Regressions — specific fixed bugs that must not regress
 *   Tier 7: Lock-step — Furnace command comparison (--lockstep flag)
 *
 * === PREREQUISITES ===
 *   1. Dev server running: `npm run dev` (starts Vite:5173 + Express:3001 + WS:4003)
 *   2. DEViLBOX open in browser at http://localhost:5173
 *   3. AudioContext unlocked (click anywhere in the browser window)
 *   4. Format tracker running (optional): `npx tsx tools/format-server.ts &`
 *
 * === USAGE ===
 *   npx tsx tools/playback-smoke-test.ts                   # ALL tests (~300: hardcoded + local + furnace + fx)
 *   npx tsx tools/playback-smoke-test.ts --local-only      # only local Reference Music (~164 formats)
 *   npx tsx tools/playback-smoke-test.ts --furnace-only    # only Furnace chip demos (~30 chips)
 *   npx tsx tools/playback-smoke-test.ts --fx-only         # only master effects (~90 effects)
 *   npx tsx tools/playback-smoke-test.ts --hardcoded-only  # only hardcoded Modland/HVSC tests (~8)
 *   npx tsx tools/playback-smoke-test.ts --skip-fx         # all EXCEPT effects
 *   npx tsx tools/playback-smoke-test.ts --skip-furnace    # all EXCEPT furnace demos
 *   npx tsx tools/playback-smoke-test.ts --push-results    # push pass/fail to localhost:4444 tracker
 *   npx tsx tools/playback-smoke-test.ts --only AHX,MOD    # test specific families only (substring match)
 *   npx tsx tools/playback-smoke-test.ts --resume          # skip tests that passed in the last run (reads /tmp/final-audit.txt)
 *   npx tsx tools/playback-smoke-test.ts --lockstep        # enable Furnace lock-step command comparison (slow)
 *   npx tsx tools/playback-smoke-test.ts --write-baseline  # snapshot current results to tools/baselines/playback-smoke.json
 *   npx tsx tools/playback-smoke-test.ts --check-baseline  # diff current run against baseline; exit non-zero on regressions
 *
 * === HOW IT WORKS ===
 *   1. Connects to the MCP WebSocket relay at ws://localhost:4003/mcp
 *   2. For each test case:
 *      a. Stops any current playback
 *      b. Clears console errors
 *      c. Reads the file from disk, base64-encodes it, sends to browser via WS bridge
 *         (the bridge expects {filename, data}, NOT {path} — the MCP HTTP server
 *         handles path→base64 conversion but the WS bridge is direct-to-browser)
 *      d. Companion files (TFMX smpl.*, MIDI smpl.*, etc.) are auto-discovered
 *      e. Verifies song loaded (patterns > 0, channels > 0)
 *      f. Calls play(), waits for audio, measures RMS level
 *      g. Checks console for critical errors
 *      h. Stops playback, reports pass/fail
 *   3. Prints summary with pass/fail counts + failure details
 *
 * === LOCAL TEST DISCOVERY ===
 *   The --local-only flag auto-discovers ~164 format test cases from the
 *   local Reference Music collection at /Users/spot/Code/Reference Music/.
 *   Each format directory contains artist subdirectories with real module files.
 *   The script picks the first valid music file from each format directory.
 *
 * === ENVIRONMENT VARIABLES ===
 *   MCP_BRIDGE_URL     WebSocket URL (default ws://localhost:4003/mcp)
 *   DEVILBOX_API        Express API URL (default http://localhost:3001)
 *   REFERENCE_MUSIC     Local test music path (default /Users/spot/Code/Reference Music)
 *
 * === OTHER AUDIT SCRIPTS IN THIS REPO ===
 *   tools/pc-tracker-audit.ts    — deep 10-point audit for 23 OpenMPT PC formats
 *   tools/soak-test.ts           — 2+ hour endurance test for pre-gig stability
 *   tools/furnace-audit/         — lock-step command comparison for Furnace chips
 *   tools/fx-audit.ts            — effects chain regression test
 *   tools/uade-audit.ts          — UADE-specific format coverage
 *   DO NOT duplicate their functionality here — this script is for BROAD coverage.
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
  loader: 'modland' | 'hvsc' | 'fur' | 'local' | 'fx';
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
  /** Expected synthTypes for instruments (tier 2). If set, all instruments must match one of these. */
  expectedSynthTypes?: string[];
  /** True for regression tests — always included, never filterable */
  isRegression?: boolean;
  /** True if this format supports native export round-trip (tier 3) */
  supportsExport?: boolean;
  /** Alternate test files to try if the primary one fails (silence/error) */
  alternatePaths?: string[];
}

/** Per-test verification results across all tiers */
interface TestVerification {
  // Tier 1: Audio (existing)
  audioPass: boolean;
  rmsAvg: number;
  peakMax?: number;       // 2026-04-20: distortion/clipping gate
  peakStatus?: 'ok' | 'warn' | 'clip';  // ok <1.5, warn 1.5-4, clip >=4
  // Tier 2: Instruments
  instrumentCount: number;
  instrumentPass: boolean;
  instrumentIssue?: string;
  // Tier 3: Export round-trip
  exportTested: boolean;
  exportPass: boolean;
  exportIssue?: string;
  // Tier 5: Parameter completeness
  paramTested: boolean;
  paramPass: boolean;
  paramCoverage?: number; // 0-100 percentage
  paramIssue?: string;
  // Tier 7: Lock-step (Furnace only)
  lockstepTested: boolean;
  lockstepPass: boolean;
  lockstepIssue?: string;
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

    // Collect candidate music files (up to 3) — if the first fails during
    // the test, the runner can fall back to alternates.
    const candidates: { path: string; name: string }[] = [];
    const MAX_CANDIDATES = 3;

    // File extensions to skip — these are metadata/docs, not music
    const SKIP_EXT = new Set(['.txt', '.md', '.nfo', '.info', '.readme', '.diz', '.doc',
      '.jpg', '.png', '.gif', '.bmp', '.pdf', '.html', '.htm', '.css', '.js',
      '.ki', '.ins', '.pat', '.cfg', '.ini', '.json', '.xml', '.yaml', '.yml']);
    const isMusic = (f: string) => {
      if (f.startsWith('.')) return false;
      const ext = f.lastIndexOf('.') > 0 ? f.slice(f.lastIndexOf('.')).toLowerCase() : '';
      return !SKIP_EXT.has(ext);
    };

    // Try top-level files first
    try {
      const topFiles = readdirSync(fullDir).filter(f => {
        try { return statSync(join(fullDir, f)).isFile() && isMusic(f); } catch { return false; }
      }).sort();
      for (const f of topFiles.slice(0, MAX_CANDIDATES)) {
        candidates.push({ path: join(fullDir, f), name: f });
      }
    } catch { /* no top-level files */ }

    // If not enough candidates, look one level deeper (artist subdirs)
    if (candidates.length < MAX_CANDIDATES) {
      try {
        const subDirs = readdirSync(fullDir).filter(d => {
          try { return statSync(join(fullDir, d)).isDirectory(); } catch { return false; }
        }).sort();
        for (const sub of subDirs) {
          if (candidates.length >= MAX_CANDIDATES) break;
          const subFiles = readdirSync(join(fullDir, sub)).filter(f => {
            try { return statSync(join(fullDir, sub, f)).isFile() && isMusic(f); } catch { return false; }
          }).sort();
          for (const f of subFiles) {
            if (candidates.length >= MAX_CANDIDATES) break;
            candidates.push({ path: join(fullDir, sub, f), name: `${sub}/${f}` });
          }
        }
      } catch { /* no subdirs */ }
    }

    if (candidates.length === 0) continue;

    tests.push({
      name: `${dir} — ${candidates[0].name}`,
      family: dir.substring(0, 12).toUpperCase(),
      loader: 'local',
      path: candidates[0].path,
      alternatePaths: candidates.slice(1).map(c => c.path),
      engineDriven: true,
      allowSilent: false,
    });
  }
  return tests;
}

/**
 * Auto-discover Furnace chip demo tests from the demos directory.
 * One test per chip subdirectory (picks the first .fur file).
 * ~30 chip categories, ~452 total .fur files — we test one per chip.
 */
async function discoverFurnaceTests(demosDir: string): Promise<TestCase[]> {
  const { readdirSync, statSync } = await import('fs');
  const { join } = await import('path');
  const tests: TestCase[] = [];

  let chipDirs: string[];
  try {
    chipDirs = readdirSync(demosDir).filter(d => {
      try { return statSync(join(demosDir, d)).isDirectory() && d !== 'blank'; } catch { return false; }
    }).sort();
  } catch { return tests; }

  for (const chip of chipDirs) {
    const chipDir = join(demosDir, chip);
    try {
      const furFiles = readdirSync(chipDir).filter(f => f.endsWith('.fur')).sort();
      if (furFiles.length === 0) continue;
      tests.push({
        name: `Furnace ${chip} — ${furFiles[0]}`,
        family: `FUR-${chip.substring(0, 8).toUpperCase()}`,
        loader: 'fur',
        path: join(chipDir, furFiles[0]),
        engineDriven: true,
        allowSilent: false,
      });
    } catch { continue; }
  }
  return tests;
}

/**
 * Build effect test cases from the master effects list.
 * Each test: load a known-good song, add the effect, play, measure audio.
 * The effect is tested as a master effect on whatever song is currently loaded.
 */
const ALL_EFFECTS = [
  'Compressor', 'EQ3', 'Distortion', 'BitCrusher', 'Chebyshev', 'TapeSaturation',
  'Reverb', 'JCReverb', 'Delay', 'FeedbackDelay', 'PingPongDelay',
  'Chorus', 'Phaser', 'Tremolo', 'Vibrato', 'AutoPanner',
  'Filter', 'AutoFilter', 'AutoWah', 'StereoWidener', 'PitchShift', 'FrequencyShifter',
  'BiPhase', 'DubFilter', 'MoogFilter', 'AmbientDelay', 'SidechainCompressor',
  'SpaceEcho', 'SpaceyDelayer', 'RETapeEcho', 'MVerb', 'Leslie', 'SpringReverb',
  'VinylNoise', 'ToneArm', 'Tumult', 'TapeSimulator', 'ShimmerReverb', 'GranularFreeze',
  'TapeDegradation', 'Masha',
  'Maximizer', 'Limiter', 'MonoComp', 'Expander', 'Clipper', 'NoiseGate',
  'GOTTComp', 'MultibandComp', 'MultibandClipper', 'MultibandExpander',
  'MultibandDynamics', 'MultibandGate', 'MultibandLimiter', 'X42Comp',
  'AGC', 'Panda', 'BeatBreather', 'Ducka', 'TransientDesigner', 'DeEsser',
  'Overdrive', 'Flanger', 'RingMod', 'DragonflyPlate', 'DragonflyHall', 'DragonflyRoom',
  'JunoChorus', 'ParametricEQ', 'CabinetSim', 'TubeAmp', 'BassEnhancer',
  'ReverseDelay', 'VintageDelay', 'ArtisticDelay', 'Della', 'SlapbackDelay', 'ZamDelay',
  'AutoSat', 'DistortionShaper', 'Driva', 'Exciter', 'Satma', 'Saturator',
  'DynamicsProc', 'DynamicEQ', 'EQ5Band', 'EQ8Band', 'EQ12Band', 'GEQ31',
  'PhonoFilter', 'Kuiza', 'ZamEQ2',
  'Bitta', 'Vinyl', 'Vocoder', 'AutoTune',
  'CalfPhaser', 'Roomy', 'EarlyReflections', 'Pulsator', 'MultiChorus', 'MultiSpread',
  'MultibandEnhancer', 'HaasEnhancer', 'BinauralPanner', 'Vihda',
  'SidechainGate', 'SidechainLimiter',
];

function buildEffectTests(): TestCase[] {
  return ALL_EFFECTS.map(fx => ({
    name: `FX: ${fx}`,
    family: `FX-${fx.substring(0, 8).toUpperCase()}`,
    loader: 'fx' as any,
    path: fx,  // path field stores the effect type name for fx tests
    engineDriven: true,
    allowSilent: false,
  }));
}

// ── Hardcoded tests: PROVEN Modland paths (from pc-tracker-audit.ts) + HVSC/TFMX ──
// Amiga formats are covered by the auto-discovered local tests from Reference Music.
// Only include Modland paths that are VERIFIED to exist. Never guess paths.
const TESTS: TestCase[] = [
  // ── PC tracker formats (proven paths from pc-tracker-audit.ts) ──
  { name: 'MOD - Space Debris',     family: 'MOD',  loader: 'modland', path: 'pub/modules/Protracker/Captain/space debris.mod', expectedEditorMode: 'classic', expectedSynthTypes: ['Sampler'], supportsExport: true },
  { name: 'IT - Bookworm',          family: 'IT',   loader: 'modland', path: 'pub/modules/Impulsetracker/Skaven/bookworm.it', expectedEditorMode: 'classic', expectedSynthTypes: ['Sampler'], supportsExport: true },
  { name: 'S3M - Catch That Goblin',family: 'S3M',  loader: 'modland', path: 'pub/modules/Screamtracker 3/Skaven/catch that goblin!!.s3m', expectedEditorMode: 'classic', expectedSynthTypes: ['Sampler'], supportsExport: true },
  { name: 'XM - Space Debris',      family: 'XM',   loader: 'modland', path: 'pub/modules/Fasttracker 2/Candybag/space debris.xm', expectedEditorMode: 'classic', expectedSynthTypes: ['Sampler'], supportsExport: true },
  { name: 'MPTM - Cubical Stadium', family: 'MPTM', loader: 'modland', path: 'pub/modules/OpenMPT MPTM/Ether Audio/cubical stadium.mptm', expectedSynthTypes: ['Sampler'], supportsExport: true },
  { name: 'AMF - Cyclemania',       family: 'AMF',  loader: 'modland', path: 'pub/modules/Digital Sound And Music Interface/Amir Glinik/cyclemania - cm0001.mod.amf', supportsExport: true },
  { name: 'DBM - Invisibility',     family: 'DBM',  loader: 'modland', path: 'pub/modules/Digibooster Pro/AceMan/invisibility.dbm', supportsExport: true },
  { name: 'GDM - Tecno12',          family: 'GDM',  loader: 'modland', path: 'pub/modules/General DigiMusic/- unknown/tecno12.gdm', supportsExport: true },
  { name: 'GT2 - Electrolife',      family: 'GT2',  loader: 'modland', path: 'pub/modules/Graoumf Tracker 2/505/electrolife.gt2', supportsExport: true },
  { name: 'MDL - Socket01',         family: 'MDL',  loader: 'modland', path: 'pub/modules/Digitrakker/- unknown/socket01.mdl', supportsExport: true },
  { name: 'MO3 - Air Zonk',         family: 'MO3',  loader: 'modland', path: 'pub/modules/MO3/- unknown/air zonk - brains town.mo3', supportsExport: true },
  { name: 'MT2 - Delerious',        family: 'MT2',  loader: 'modland', path: 'pub/modules/Mad Tracker 2/- unknown/delerious-outline.mt2', supportsExport: true },
  { name: 'PTM - Bossa',            family: 'PTM',  loader: 'modland', path: 'pub/modules/Polytracker/- unknown/bossa! bossa!.ptm', supportsExport: true },
  { name: 'PSM - One Must Fall',    family: 'PSM',  loader: 'modland', path: 'pub/modules/Epic Megagames MASI/CC Catch/one must fall! 1.psm', supportsExport: true },
  { name: 'RTM - Odyssey',          family: 'RTM',  loader: 'modland', path: 'pub/modules/Real Tracker/DStruk/odyssey.rtm', supportsExport: true },
  { name: 'ULT - Cyboccultation',   family: 'ULT',  loader: 'modland', path: 'pub/modules/Ultratracker/Cyboman/cyboccultation.ult', supportsExport: true },
  { name: 'PLM - Act 1',            family: 'PLM',  loader: 'modland', path: 'pub/modules/Disorder Tracker 2/Skywalker/act 1... part 2 - remix.plm', supportsExport: true },
  { name: 'DSYM - A Track',         family: 'DSYM', loader: 'modland', path: 'pub/modules/Digital Symphony/- unknown/a_track!.dsym', supportsExport: true },
  { name: 'OKT - Dark',             family: 'OKT',  loader: 'modland', path: 'pub/modules/Oktalyzer/Andemar/dark.okta', supportsExport: true },
  { name: 'PUMA - Trainertune',     family: 'PUMA', loader: 'modland', path: 'pub/modules/Pumatracker/Saito/trainertune.puma', supportsExport: true },
  // ── Hively / AHX (dedicated HivelyEngine) ──
  { name: 'HVL - Hexplosion',       family: 'HVL',  loader: 'modland', path: 'pub/modules/HivelyTracker/AceMan/hexplosion.hvl', expectedEditorMode: 'hively' },
  // ── UADE curated (proven paths — all other Amiga formats covered by local discovery) ──
  { name: 'FC14 - Horizon V2',      family: 'FC14', loader: 'modland', path: 'pub/modules/Future Composer 1.4/Blaizer/horizon v2.fc', expectedSynthTypes: ['FCSynth'] },
  { name: 'JAM - Bartmanintro',     family: 'JAM',  loader: 'modland', path: 'pub/modules/JamCracker/Ape/bartmanintro.jam' },
  // ── C64 SID (engine-driven — no pattern data) ──
  { name: 'SID - Commando',         family: 'SID',  loader: 'hvsc',    path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid', engineDriven: true },
  // ── TFMX (companion files required) ──
  { name: 'TFMX - Turrican Aliens', family: 'TFMX', loader: 'modland', path: 'pub/modules/TFMX/Chris Huelsbeck/mdat.turrican aliens', companionPaths: ['pub/modules/TFMX/Chris Huelsbeck/smpl.turrican aliens'] },
  // ── Special format imports ──
  { name: 'MIDI - Dub Organizer',   family: 'MIDI', loader: 'local', path: '/Users/spot/Code/DEViLBOX/public/data/songs/midi/dub_organizer.mid', engineDriven: true },
  { name: 'V2M - Gamma Projection', family: 'V2M',  loader: 'local', path: '/Users/spot/Code/Reference Music/V2/BetA/gamma projection.v2m', engineDriven: true },
];

// ── Tier 6: Regression test catalog ──────────────────────────────────────────
// Specific bugs that were fixed and must not regress.
// These are always included in the test run regardless of --only filters.
const REGRESSIONS: TestCase[] = [
  // Routing bug: non-OpenMPT formats routed through libopenmpt (fixed b1ab3631e)
  {
    name: 'REGRESSION: HVL not routed to HivelyEngine',
    family: 'REG', loader: 'modland',
    path: 'pub/modules/HivelyTracker/AceMan/hexplosion.hvl',
    expectedEditorMode: 'hively',
    isRegression: true,
  },
  // JamCracker bartmanintro: loaded but pattern data was empty
  {
    name: 'REGRESSION: JamCracker empty patterns',
    family: 'REG', loader: 'modland',
    path: 'pub/modules/JamCracker/Ape/bartmanintro.jam',
    isRegression: true,
    // Must have noteCells > 0 in pattern 0 (engineDriven is NOT set)
  },
  // FC14 must route to FCSynth, not Sampler
  {
    name: 'REGRESSION: FC14 uses FCSynth not Sampler',
    family: 'REG', loader: 'modland',
    path: 'pub/modules/Future Composer 1.4/Blaizer/horizon v2.fc',
    expectedSynthTypes: ['FCSynth'],
    isRegression: true,
    engineDriven: true,
  },
  // SID must route to C64SIDEngine (engine-driven, no patterns expected)
  {
    name: 'REGRESSION: SID routes to C64SIDEngine',
    family: 'REG', loader: 'hvsc',
    path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid',
    engineDriven: true,
    isRegression: true,
  },
  // TFMX must load with companion sample file
  {
    name: 'REGRESSION: TFMX loads with companion smpl file',
    family: 'REG', loader: 'modland',
    path: 'pub/modules/TFMX/Chris Huelsbeck/mdat.turrican aliens',
    companionPaths: ['pub/modules/TFMX/Chris Huelsbeck/smpl.turrican aliens'],
    engineDriven: true,
    isRegression: true,
  },
];

// ── Synth type → expected config field mapping (tier 5) ─────────────────────
// Maps synthType to the config field name on the instrument that must be populated.
const SYNTH_CONFIG_FIELDS: Record<string, string> = {
  'TB303': 'tb303',
  'Sampler': 'sampler',
  'FCSynth': 'fc',
  'Furnace': 'furnace',
  'FMSynth': 'fm',
  'MonoSynth': 'mono',
  'DuoSynth': 'duo',
  'TR808': 'tr808',
  'TR909': 'tr909',
  'DrumMachine': 'drumMachine',
  'Wavetable': 'wavetable',
  'GranularSynth': 'granular',
  'SuperSaw': 'superSaw',
  'ChipSynth': 'chip',
};

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
  /** Per-tier verification data (populated by expanded runTest) */
  verification?: TestVerification;
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
  name?: string;
  filename?: string;
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
    // 1. STOP previous playback — critical to prevent the previous song's audio
    //    from bleeding into this test's RMS measurement. Without this, formats
    //    that fail to load appear to "pass" because the previous song is still
    //    playing and producing audio.
    try { await client.call('stop'); } catch { /* may not be playing */ }
    await sleep(500); // let the engine fully quiesce

    // 2. Clean slate — clear console and remove any master effects
    await client.call('clear_console_errors');
    try {
      const audioState = await client.call<{ masterEffects?: { id: string }[] }>('get_audio_state');
      if (audioState?.masterEffects?.length) {
        for (const fx of audioState.masterEffects) {
          await client.call('remove_master_effect', { effectId: fx.id });
        }
      }
    } catch { /* audio state read may fail on first call */ }

    // 3. Load — download via Express API, then send to browser via load_file
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
    } else if (test.loader === 'fx') {
      // Effect test: add the effect as a master effect on the currently loaded
      // song. If no song is loaded, load a known-good MOD first.
      const songCheck = await client.call<SongInfoResp>('get_song_info').catch(() => null);
      if (!songCheck || (songCheck.numPatterns ?? 0) <= 0) {
        // Load a reference song for the effect to process
        const { readFileSync } = await import('fs');
        const refPath = '/Users/spot/Code/Reference Music/Protracker IFF/DJ Pie/heaven.ptm';
        try {
          const refData = readFileSync(refPath);
          await client.call('load_file', { filename: 'heaven.ptm', data: refData.toString('base64') });
          await client.call('play', { mode: 'song' });
          await sleep(1000);
        } catch {
          // If ref song fails, try any loaded song
        }
      }
      // Add the effect
      try {
        await client.call('add_master_effect', { type: test.path });
      } catch (e) {
        return {
          name: test.name, family: test.family, status: 'fail',
          reason: `add_master_effect failed: ${e instanceof Error ? e.message : e}`,
          durationMs: Date.now() - start,
        };
      }
      // Play + measure
      try { await client.call('play', { mode: 'song' }); } catch { /* may already be playing */ }
      await sleep(PLAY_DURATION_MS);
      const level = await client.call<{ rmsAvg: number; rmsMax: number; isSilent: boolean }>(
        'get_audio_level', { durationMs: 1500 },
      );
      const errs = await client.call<{ entries: Array<{ level: string; message: string }> }>('get_console_errors');
      const critical = errs.entries.filter(e => e.level === 'error' && !e.message.includes('Failed to load resource'));
      // Remove the effect
      try {
        const audioState = await client.call<{ masterEffects?: { id: string; type?: string }[] }>('get_audio_state');
        const added = audioState?.masterEffects?.find(fx => fx.type === test.path);
        if (added) await client.call('remove_master_effect', { effectId: added.id });
      } catch { /* best-effort cleanup */ }
      await client.call('clear_console_errors').catch(() => {});

      const audible = (level.rmsAvg ?? 0) >= SILENCE_THRESHOLD_RMS || (level.rmsMax ?? 0) >= SILENCE_THRESHOLD_RMS * 4;
      if (!audible) {
        return { name: test.name, family: test.family, status: 'fail',
          rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
          reason: `silent with effect (rmsAvg=${level.rmsAvg?.toFixed(6)})`,
          durationMs: Date.now() - start };
      }
      if (critical.length > 0) {
        return { name: test.name, family: test.family, status: 'fail',
          rmsAvg: level.rmsAvg, rmsMax: level.rmsMax, errorCount: critical.length,
          reason: `${critical.length} error(s): ${critical[0].message.slice(0, 80)}`,
          durationMs: Date.now() - start };
      }
      return { name: test.name, family: test.family, status: 'pass',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax, durationMs: Date.now() - start };
    } else if (test.loader === 'local') {
      // Read from disk, base64-encode, and send to browser via the bridge.
      // The WS bridge goes directly to the browser which expects {filename, data},
      // NOT {path} — the path→base64 conversion is normally done by the MCP HTTP
      // server, but we bypass it here for speed.
      const { readFileSync } = await import('fs');
      const { basename: bn, dirname: dn } = await import('path');
      const fileData = readFileSync(test.path);
      const base64 = fileData.toString('base64');
      const filename = bn(test.path);

      // Auto-discover companion files (same logic as mcpServer.ts load_file)
      const companionFiles: Record<string, string> = {};
      const dir = dn(test.path);
      const lowerFilename = filename.toLowerCase();
      try {
        const { readdirSync } = await import('fs');
        const dirFiles = readdirSync(dir);
        const prefixPairs: [string, string][] = [
          ['mdat.', 'smpl.'], ['smpl.', 'mdat.'],
          ['midi.', 'smpl.'], ['smpl.', 'midi.'],
          ['jpn.', 'smp.'], ['smp.', 'jpn.'],
        ];
        for (const [myPrefix, pairPrefix] of prefixPairs) {
          if (lowerFilename.startsWith(myPrefix)) {
            const suffix = filename.slice(myPrefix.length);
            const pairName = dirFiles.find(f => f.toLowerCase() === `${pairPrefix}${suffix.toLowerCase()}`);
            if (pairName) {
              const pairData = readFileSync(`${dir}/${pairName}`);
              companionFiles[pairName] = pairData.toString('base64');
            }
          }
        }
      } catch { /* companion discovery failed — OK for most formats */ }

      const hasCompanions = Object.keys(companionFiles).length > 0;
      await client.call('load_file', { filename, data: base64, ...(hasCompanions ? { companionFiles } : {}) });
    }

    // 3. Verify the song actually loaded — and that it's OUR song, not one
    //    loaded by another agent that hijacked the browser between our load
    //    and this check. Compare the loaded song's name against the expected
    //    filename (basename of test.path).
    const songInfo = await client.call<SongInfoResp>('get_song_info');

    // Identity check: if another agent loaded a different song, bail with a
    // retryable error so the outer retry loop can back off and try again.
    if (test.loader === 'local' && songInfo?.name) {
      const { basename: bn } = await import('path');
      const expectedFile = bn(test.path);
      const loadedName = songInfo.name ?? '';
      // Fuzzy match: the loaded name may have the extension stripped, format
      // suffix appended, or brackets. Check if the loaded name CONTAINS the
      // expected basename (minus extension) as a substring.
      const expectedBase = expectedFile.replace(/\.[^.]+$/, '').toLowerCase();
      if (expectedBase.length > 3 && !loadedName.toLowerCase().includes(expectedBase)) {
        await client.call('stop').catch(() => {});
        return {
          name: test.name, family: test.family, status: 'fail',
          reason: `No browser connected`, // triggers retry in outer loop
          durationMs: Date.now() - start,
        };
      }
    }
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
    if (test.loader === 'modland' || test.loader === 'hvsc' || test.loader === 'local') {
      await client.call('play', { mode: 'song' });
    }
    // (fur loader already started playback inside play_fur)

    // 5. Wait for audio output (best-effort)
    try {
      await client.call('wait_for_audio', { thresholdRms: SILENCE_THRESHOLD_RMS, timeoutMs: 5000 });
    } catch { /* fall through to level check */ }

    // 6. Let it play
    await sleep(PLAY_DURATION_MS);

    // 7. Measure — retry up to 3 times with increasing wait. Some WASM engines
    //    (UADE, TFMX, SID) take a moment to start producing audio after play().
    let level = { rmsAvg: 0, rmsMax: 0, peakMax: 0, isSilent: true };
    for (let attempt = 0; attempt < 3; attempt++) {
      level = await client.call<{ rmsAvg: number; rmsMax: number; peakMax: number; isSilent: boolean }>(
        'get_audio_level',
        { durationMs: 1500 },
      );
      if ((level.rmsAvg ?? 0) >= SILENCE_THRESHOLD_RMS || (level.rmsMax ?? 0) >= SILENCE_THRESHOLD_RMS * 4) break;
      // Still silent — wait a bit and retry
      if (attempt < 2) await sleep(1000);
    }

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

    // ── Tier 2: Instrument validation ─────────────────────────────────────
    const verification: TestVerification = {
      audioPass: false, rmsAvg: level.rmsAvg ?? 0,
      instrumentCount: 0, instrumentPass: false,
      exportTested: false, exportPass: false,
      paramTested: false, paramPass: false,
      lockstepTested: false, lockstepPass: false,
    };

    const audibleByOurThreshold = (level.rmsAvg ?? 0) >= SILENCE_THRESHOLD_RMS
      || (level.rmsMax ?? 0) >= SILENCE_THRESHOLD_RMS * 4;
    verification.audioPass = audibleByOurThreshold || !!test.allowSilent;

    // ── Distortion / clipping gate (2026-04-20) ────────────────────────────
    // User reports: random Furnace songs peak past unity and distort audibly.
    // Normal audio peaks at ≤1.0; up to ~2.0 is a reasonable pre-limiter
    // overshoot across chiptune engines. >=4.0 is unambiguous clipping — a
    // gain-staging bug in the engine or master chain that the user WILL hear.
    //
    // Tiered verdict:
    //   ok   — peakMax < 1.5  (clean)
    //   warn — peakMax 1.5-4  (elevated; flag in report, don't fail)
    //   clip — peakMax >= 4.0 (hard fail)
    //
    // The ui-smoke flow 06 uses the same thresholds for Furnace-only; this
    // extends the same gate to every format in the smoke harness.
    const peakMax = level.peakMax ?? 0;
    verification.peakMax = peakMax;
    verification.peakStatus = peakMax >= 4 ? 'clip'
      : peakMax >= 1.5 ? 'warn'
      : 'ok';

    try {
      const insts = await client.call<any>('get_instruments_list');
      const instList: any[] = Array.isArray(insts) ? insts : (insts?.instruments ?? []);
      verification.instrumentCount = instList.length;

      if (instList.length === 0 && !test.engineDriven) {
        verification.instrumentPass = false;
        verification.instrumentIssue = 'no instruments (non-engine format)';
      } else if (instList.length === 0 && test.engineDriven) {
        // Engine-driven formats (SID, SCUMM, etc.) may not expose instruments
        verification.instrumentPass = true;
      } else {
        const synthTypes = [...new Set(instList.map((i: any) => i.synthType).filter(Boolean))];
        let instOk = true;

        // Check synthType correctness if expected types are specified
        if (test.expectedSynthTypes && test.expectedSynthTypes.length > 0) {
          const unexpected = synthTypes.filter((t: string) => !test.expectedSynthTypes!.includes(t));
          if (unexpected.length > 0) {
            instOk = false;
            verification.instrumentIssue = `wrong synthTypes: got [${synthTypes.join(',')}] expected [${test.expectedSynthTypes.join(',')}]`;
          }
        }

        // Check that at least some instruments have names
        const namedInsts = instList.filter((i: any) => i.name && i.name.trim() !== '');
        if (namedInsts.length === 0 && instList.length > 3) {
          // Only flag as issue if there are many unnamed instruments (1-3 is OK for small songs)
          verification.instrumentIssue = (verification.instrumentIssue ? verification.instrumentIssue + '; ' : '') + 'all instruments unnamed';
        }

        verification.instrumentPass = instOk;
      }
    } catch {
      verification.instrumentPass = false;
      verification.instrumentIssue = 'get_instruments_list failed';
    }

    // ── Tier 3: Native export round-trip (ALL formats with exporters) ─────
    // DEViLBOX has 80+ native exporters. Try export_native for every format —
    // it returns an error string for unsupported formats, which we log but don't
    // count as a failure. Only count as a failure if export CLAIMS to succeed but
    // the reimported data is corrupt.
    if (!test.loader || test.loader !== 'fx') { // skip for effect tests
      verification.exportTested = true;
      try {
        const exp = await client.call<any>('export_native');
        if (exp?.error) {
          const errMsg = String(exp.error);
          // "No native exporter" is expected for some formats — don't count as failure
          if (errMsg.includes('No native exporter') || errMsg.includes('not supported')) {
            verification.exportTested = false; // mark as not applicable
          } else {
            verification.exportPass = false;
            verification.exportIssue = `export error: ${errMsg.slice(0, 80)}`;
          }
        } else {
          const exportSize = exp?.sizeBytes ?? 0;
          const exportData = exp?.data ?? null;
          const exportFilename = exp?.filename ?? '';
          if (exportSize === 0) {
            verification.exportPass = false;
            verification.exportIssue = 'export returned 0 bytes';
          } else if (exportData) {
            // Round-trip: reimport the exported file
            try {
              await client.call('load_file', { filename: exportFilename, data: exportData });
              const reimportInfo = await client.call<SongInfoResp>('get_song_info');
              const reimportPat = reimportInfo?.numPatterns ?? 0;
              const reimportCh = reimportInfo?.numChannels ?? 0;
              const reimportInsts = await client.call<any>('get_instruments_list');
              const reimportInstList = Array.isArray(reimportInsts) ? reimportInsts : (reimportInsts?.instruments ?? []);

              const issues: string[] = [];
              if (reimportCh !== (songInfo.numChannels ?? 0)) {
                issues.push(`ch ${songInfo.numChannels}→${reimportCh}`);
              }
              if (reimportPat === 0) issues.push('lost all patterns');
              if (reimportInstList.length === 0 && verification.instrumentCount > 0) {
                issues.push('lost all instruments');
              }
              verification.exportPass = issues.length === 0;
              if (issues.length > 0) verification.exportIssue = `round-trip: ${issues.join(', ')}`;

              // Reload the original song so the next test isn't confused by the reimport
              if (test.loader === 'local') {
                const { readFileSync } = await import('fs');
                const { basename: bn2 } = await import('path');
                const origData = readFileSync(test.path);
                await client.call('load_file', { filename: bn2(test.path), data: origData.toString('base64') });
              }
            } catch (e: unknown) {
              verification.exportPass = false;
              verification.exportIssue = `reimport failed: ${e instanceof Error ? e.message.slice(0, 60) : e}`;
            }
          } else {
            verification.exportPass = true; // export worked, no data blob to reimport
          }
        }
      } catch (e: unknown) {
        verification.exportPass = false;
        verification.exportIssue = `export crash: ${e instanceof Error ? e.message.slice(0, 60) : e}`;
      }
    }

    // ── Tier 5: Synth parameter completeness ──────────────────────────────
    if (verification.instrumentCount > 0) {
      verification.paramTested = true;
      try {
        const insts = await client.call<any>('get_instruments_list');
        const instList: any[] = Array.isArray(insts) ? insts : (insts?.instruments ?? []);
        let totalFields = 0;
        let filledFields = 0;

        // Check up to 3 instruments for parameter completeness
        const toCheck = instList.slice(0, 3);
        for (const inst of toCheck) {
          try {
            const full = await client.call<any>('get_instrument', { instrumentId: inst.id ?? inst.index });
            if (!full) continue;
            const synthType = full.synthType ?? inst.synthType;
            const configKey = SYNTH_CONFIG_FIELDS[synthType];
            if (configKey && full[configKey]) {
              const config = full[configKey];
              const keys = Object.keys(config);
              totalFields += keys.length;
              filledFields += keys.filter((k: string) => config[k] !== null && config[k] !== undefined).length;
            } else if (full.config && typeof full.config === 'object') {
              const keys = Object.keys(full.config);
              totalFields += keys.length;
              filledFields += keys.filter((k: string) => full.config[k] !== null && full.config[k] !== undefined).length;
            }
          } catch { /* individual instrument fetch may fail */ }
        }

        if (totalFields > 0) {
          verification.paramCoverage = Math.round((filledFields / totalFields) * 100);
          verification.paramPass = verification.paramCoverage >= 50;
          if (!verification.paramPass) {
            verification.paramIssue = `${verification.paramCoverage}% coverage (${filledFields}/${totalFields} fields)`;
          }
        } else {
          verification.paramPass = true; // no fields to check
        }
      } catch {
        verification.paramPass = false;
        verification.paramIssue = 'parameter check failed';
      }
    }

    // 10. Stop
    await client.call('stop');

    const durationMs = Date.now() - start;

    // 11. Verdict — STRICT: trust rmsAvg/rmsMax directly, don't rely on the
    // tool's isSilent flag (which has historically been too lenient).
    if (!audibleByOurThreshold && !test.allowSilent) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length, verification,
        reason: `silent (rmsAvg=${level.rmsAvg.toFixed(6)}, rmsMax=${level.rmsMax.toFixed(6)}, threshold=${SILENCE_THRESHOLD_RMS})`,
        durationMs,
      };
    }
    if (critical.length > 0) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length, verification,
        reason: `${critical.length} console error(s): ${critical[0].message.slice(0, 80)}`,
        durationMs,
      };
    }
    if (!editorModeOk) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length, verification,
        reason: `editorMode mismatch (expected ${test.expectedEditorMode}, got ${songInfo.editorMode})`,
        durationMs,
      };
    }
    // Distortion gate — unambiguous clipping (peak ≥ 4.0) is a hard fail.
    // `allowSilent` tests often produce no audio at all, so peakMax is 0 —
    // the guard only fires when the test is also producing audio.
    if (verification.peakStatus === 'clip' && audibleByOurThreshold) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length, verification,
        reason: `clipping (peakMax=${peakMax.toFixed(3)}, threshold=4.0) — engine is outputting above unity, audibly distorting`,
        durationMs,
      };
    }
    return {
      name: test.name, family: test.family, status: 'pass',
      rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
      errorCount: critical.length, verification,
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
const FURNACE_DEMOS_DIR = process.env.FURNACE_DEMOS ?? '/Users/spot/Code/DEViLBOX/third-party/furnace-master/demos';

/**
 * Tier 7: Lock-step Furnace command comparison.
 * Spawns compare-cmds.ts as a child process for a .fur file.
 * Returns true if commands match (exit 0), false otherwise.
 */
async function runLockstepComparison(furPath: string): Promise<{ pass: boolean; detail: string }> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync(
      `npx tsx --tsconfig tsconfig.app.json tools/furnace-audit/compare-cmds.ts --song "${furPath}" 2>/dev/null`,
      { maxBuffer: 100 * 1024 * 1024, timeout: 120000 },
    ).toString();
    // Check for "0 differences found" in output
    if (output.includes('0 differences found')) {
      return { pass: true, detail: 'commands match' };
    }
    const diffMatch = output.match(/(\d+) differences found/);
    const diffs = diffMatch ? diffMatch[1] : '?';
    return { pass: false, detail: `${diffs} command differences` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.slice(0, 80) : String(e);
    return { pass: false, detail: `lockstep error: ${msg}` };
  }
}

async function main(): Promise<void> {
  // Auto-discover all test sources
  const localTests = await discoverLocalTests(REFERENCE_MUSIC_DIR);
  const furnaceTests = await discoverFurnaceTests(FURNACE_DEMOS_DIR);
  const effectTests = buildEffectTests();

  // CLI flags
  const args = process.argv.slice(2);
  const localOnly = args.includes('--local-only');
  const hardcodedOnly = args.includes('--hardcoded-only');
  const furnaceOnly = args.includes('--furnace-only');
  const fxOnly = args.includes('--fx-only');
  const pushResults = args.includes('--push-results');
  const writeBaseline = args.includes('--write-baseline');
  const checkBaseline = args.includes('--check-baseline');
  const skipFx = args.includes('--skip-fx');
  const skipFurnace = args.includes('--skip-furnace');
  const lockstep = args.includes('--lockstep');
  const resume = args.includes('--resume');  // skip tests that passed in the last run
  const onlyArg = args.find(a => a.startsWith('--only=') || a.startsWith('--only '));
  const onlyFamilies = onlyArg
    ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf('--only') + 1])
      ?.split(',').map(s => s.trim().toUpperCase())
    : null;

  // Build the test set based on flags
  let allTests: TestCase[];
  if (hardcodedOnly) allTests = TESTS;
  else if (localOnly) allTests = localTests;
  else if (furnaceOnly) allTests = furnaceTests;
  else if (fxOnly) allTests = effectTests;
  else {
    // Default: all sources combined
    allTests = [...TESTS, ...localTests];
    if (!skipFurnace) allTests.push(...furnaceTests);
    if (!skipFx) allTests.push(...effectTests);
  }

  if (onlyFamilies) {
    allTests = allTests.filter(t => onlyFamilies.some(f => t.family.toUpperCase().includes(f)));
  }

  // Always include regression tests (tier 6) unless a specific --*-only flag was used
  if (!hardcodedOnly && !localOnly && !furnaceOnly && !fxOnly) {
    allTests.push(...REGRESSIONS);
  }

  // CRITICAL: reorder tests so stable engines run FIRST, UADE-heavy formats LAST.
  // Once UADE's internal state machine hits a bad file, it corrupts ALL subsequent
  // loads — including non-UADE formats that share the audio context. By running
  // PC formats, Furnace, effects, and regressions BEFORE the UADE-heavy local
  // formats, we get clean results for the majority of tests even if UADE cascades.
  //
  // Order: hardcoded PC → regressions → furnace → effects → local (alphabetical)
  const stableTests = allTests.filter(t =>
    t.loader === 'modland' || t.loader === 'hvsc' || t.loader === 'fur' || t.loader === 'fx' || t.isRegression
  );
  const localUADETests = allTests.filter(t =>
    t.loader === 'local' && !t.isRegression
  );
  allTests = [...stableTests, ...localUADETests];

  // --resume: read the previous run's output and skip tests that already passed.
  // Looks for /tmp/final-audit.txt (or the file specified by --resume-file=<path>).
  let skippedCount = 0;
  if (resume) {
    const resumeFileArg = args.find(a => a.startsWith('--resume-file='));
    const resumeFile = resumeFileArg ? resumeFileArg.split('=')[1] : '/tmp/final-audit.txt';
    try {
      const { readFileSync } = await import('fs');
      const prevOutput = readFileSync(resumeFile, 'utf-8');
      // Extract passed test names: lines matching "+ pass" with the test name
      const passedNames = new Set<string>();
      for (const line of prevOutput.split('\n')) {
        if (line.includes('+ pass')) {
          // Extract the name between "] " and the status marker
          const match = line.match(/\]\s+(.+?)\s+\+\s+pass/);
          if (match) passedNames.add(match[1].trim());
        }
      }
      const before = allTests.length;
      allTests = allTests.filter(t => !passedNames.has(t.name));
      skippedCount = before - allTests.length;
    } catch {
      console.warn('  ⚠ --resume: could not read previous results, running all tests');
    }
  }

  console.log('▶ DEViLBOX release-readiness test suite');
  console.log(`  Bridge: ${WS_URL}`);
  console.log(`  Tests:  ${allTests.length} (${TESTS.length} hardcoded, ${localTests.length} local, ${furnaceTests.length} furnace, ${effectTests.length} fx, ${REGRESSIONS.length} regressions)`);
  if (skippedCount > 0) console.log(`  Resume: skipped ${skippedCount} already-passed tests`);
  if (onlyFamilies) console.log(`  Filter: ${onlyFamilies.join(', ')}`);
  if (lockstep) console.log(`  Lock-step: enabled (Furnace command comparison)`);
  if (pushResults) console.log(`  Push:   results -> http://localhost:4444`);
  console.log('');

  let client = new MCPBridgeClient(WS_URL);
  try {
    await client.ready();
  } catch (err) {
    console.error(`x Failed to connect to MCP bridge at ${WS_URL}`);
    console.error('  Make sure the dev server is running (npm run dev) and DEViLBOX is open in a browser.');
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }

  const MAX_RETRIES = 2;
  const RETRY_BACKOFF_MS = 2000;

  const results: TestResult[] = [];
  for (const test of allTests) {
    process.stdout.write(`  [${test.family.padEnd(5)}] ${test.name.padEnd(40)} `);

    // Retry loop: if another agent hijacks the browser mid-test (loads a
    // different song, causing our load/play/measure cycle to see stale data
    // or "No browser connected"), back off and retry until the browser is free.
    let result: TestResult | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      result = await runTest(client, test);

      // Detect transient failures: browser tab crashed/reloaded, WS relay
      // lost connection, another agent interfered, etc.
      const isTransient = result.status === 'fail' && (
        result.reason?.includes('No browser connected') ||
        result.reason?.includes('Browser disconnected') ||
        result.reason?.includes('Connection closed') ||
        result.reason?.includes('Bridge not connected') ||
        result.reason?.includes('timed out') ||
        result.reason?.includes('WebSocket is not open')
      );

      if (!isTransient || attempt >= MAX_RETRIES) break;

      // Browser disconnected — the UADE WASM likely crashed the tab.
      // Don't retry the same file (it'll just crash again). Instead,
      // reconnect and move on. The browser auto-reconnects after HMR/reload.
      const waitMs = RETRY_BACKOFF_MS * (attempt + 1);
      process.stdout.write(`\n    -> browser disconnected (attempt ${attempt + 1}/${MAX_RETRIES}, waiting ${waitMs / 1000}s)... `);
      await sleep(waitMs);

      // Reconnect the WS client
      try {
        client.close();
        client = new MCPBridgeClient(WS_URL);
        await client.ready();
        // Verify the browser is actually back by calling a lightweight tool
        await client.call('get_playback_state');
      } catch {
        // Still disconnected — wait longer for browser to recover
        await sleep(5000);
        try {
          client.close();
          client = new MCPBridgeClient(WS_URL);
          await client.ready();
        } catch { /* give up */ }
      }
    }

    // Alternate file retry: if the test failed with silence or UADE error,
    // try alternate files from the same format directory.
    if (result && result.status === 'fail' && test.alternatePaths?.length) {
      const isSilence = result.reason?.includes('silent');
      const isUadeError = result.reason?.includes('UADE could not play') || result.reason?.includes('Failed to reload');
      const isAdPlugError = result.reason?.includes('AdPlug failed');
      if (isSilence || isUadeError || isAdPlugError) {
        for (const altPath of test.alternatePaths) {
          const { basename: bn } = await import('path');
          process.stdout.write(`\n    -> trying alternate: ${bn(altPath)}... `);
          const altTest = { ...test, path: altPath, alternatePaths: undefined };
          const altResult = await runTest(client, altTest);
          if (altResult.status === 'pass') {
            result = altResult;
            result.name = test.name; // keep original name
            break;
          }
        }
      }
    }

    // Tier 7: Lock-step comparison for Furnace tests (behind --lockstep flag)
    if (lockstep && test.loader === 'fur' && result && result.verification) {
      process.stdout.write(' [lockstep] ');
      const ls = await runLockstepComparison(test.path);
      result.verification.lockstepTested = true;
      result.verification.lockstepPass = ls.pass;
      if (!ls.pass) result.verification.lockstepIssue = ls.detail;
    }

    results.push(result!);
    const dt = `${(result!.durationMs / 1000).toFixed(1)}s`;
    if (result!.status === 'pass') {
      const rms = result!.rmsAvg?.toFixed(4) ?? '?';
      const v = result!.verification;
      const extras: string[] = [];
      if (v?.instrumentCount) extras.push(`inst=${v.instrumentCount}`);
      if (v?.exportTested) extras.push(v.exportPass ? 'export=ok' : 'export=FAIL');
      if (v?.paramCoverage !== undefined) extras.push(`params=${v.paramCoverage}%`);
      if (v?.lockstepTested) extras.push(v.lockstepPass ? 'lockstep=ok' : 'lockstep=FAIL');
      // Only surface the peak when it's elevated — keeps the happy-path
      // output compact while making distortion immediately visible.
      if (v?.peakStatus === 'warn') extras.push(`peak=${v.peakMax!.toFixed(2)}(WARN)`);
      const extraStr = extras.length > 0 ? ` [${extras.join(', ')}]` : '';
      console.log(`+ pass (rms ${rms}, ${dt})${extraStr}`);
    } else if (result!.status === 'skip') {
      console.log(`o skip (${result!.reason}, ${dt})`);
    } else {
      console.log(`x fail (${result!.reason}, ${dt})`);
    }
  }

  client.close();

  // ── Expanded summary with per-tier pass rates ─────────────────────────────
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  // Tier breakdowns (only count tests that have verification data)
  const withV = results.filter(r => r.verification);
  const audioPass = withV.filter(r => r.verification!.audioPass).length;
  const audioTotal = withV.length;

  // Distortion / peak-level summary (2026-04-20). Tracks the class of
  // gain-staging bug where an engine or the master chain emits audio
  // above unity, audibly distorting regardless of the user's volume.
  const peakWarn = withV.filter(r => r.verification!.peakStatus === 'warn');
  const peakClip = withV.filter(r => r.verification!.peakStatus === 'clip');

  const instTested = withV.filter(r => r.verification!.instrumentCount > 0 || !r.verification!.instrumentPass);
  const instPass = withV.filter(r => r.verification!.instrumentPass).length;
  const instNoInst = withV.filter(r => r.verification!.instrumentCount === 0 && r.verification!.instrumentPass).length;

  const exportTested = withV.filter(r => r.verification!.exportTested);
  const exportPass = exportTested.filter(r => r.verification!.exportPass).length;

  const paramTested = withV.filter(r => r.verification!.paramTested);
  const paramPass = paramTested.filter(r => r.verification!.paramPass).length;

  const regressionResults = results.filter(r => allTests.find(t => t.name === r.name)?.isRegression);
  const regressionPass = regressionResults.filter(r => r.status === 'pass').length;

  const fxResults = results.filter(r => allTests.find(t => t.name === r.name)?.loader === 'fx');
  const fxPass = fxResults.filter(r => r.status === 'pass').length;

  const furnaceResults = results.filter(r => allTests.find(t => t.name === r.name)?.loader === 'fur');
  const furnacePass = furnaceResults.filter(r => r.status === 'pass').length;

  const lockstepResults = withV.filter(r => r.verification!.lockstepTested);
  const lockstepPass = lockstepResults.filter(r => r.verification!.lockstepPass).length;

  // Calculate total pass points across all tiers
  let totalChecks = 0;
  let totalPass = 0;

  totalChecks += audioTotal;       totalPass += audioPass;
  totalChecks += withV.length;     totalPass += instPass;
  if (exportTested.length > 0) { totalChecks += exportTested.length; totalPass += exportPass; }
  if (paramTested.length > 0) { totalChecks += paramTested.length; totalPass += paramPass; }
  if (regressionResults.length > 0) { totalChecks += regressionResults.length; totalPass += regressionPass; }
  if (fxResults.length > 0) { totalChecks += fxResults.length; totalPass += fxPass; }
  if (furnaceResults.length > 0) { totalChecks += furnaceResults.length; totalPass += furnacePass; }
  if (lockstepResults.length > 0) { totalChecks += lockstepResults.length; totalPass += lockstepPass; }

  const totalPct = totalChecks > 0 ? ((totalPass / totalChecks) * 100).toFixed(1) : '0.0';

  console.log('');
  console.log('== Summary ========================');
  console.log(`  Audio:        ${audioPass}/${audioTotal} pass`);
  console.log(`  Instruments:  ${instPass}/${withV.length} pass${instNoInst > 0 ? `  (${instNoInst} engine-driven, no instruments expected)` : ''}`);
  if (peakWarn.length > 0 || peakClip.length > 0) {
    console.log(`  Peak level:   ${peakClip.length} clipping (>=4.0), ${peakWarn.length} elevated (1.5-4.0)`);
    for (const r of peakClip) {
      const p = r.verification!.peakMax!.toFixed(2);
      console.log(`                  CLIP  ${p}  ${r.name}`);
    }
    for (const r of peakWarn) {
      const p = r.verification!.peakMax!.toFixed(2);
      console.log(`                  warn  ${p}  ${r.name}`);
    }
  }
  if (exportTested.length > 0) {
    console.log(`  Export:       ${exportPass}/${exportTested.length} pass    (PC formats only)`);
  }
  if (paramTested.length > 0) {
    console.log(`  Parameters:   ${paramPass}/${paramTested.length} pass`);
  }
  if (regressionResults.length > 0) {
    console.log(`  Regressions:  ${regressionPass}/${regressionResults.length} pass`);
  }
  if (fxResults.length > 0) {
    console.log(`  Effects:      ${fxPass}/${fxResults.length} pass`);
  }
  if (furnaceResults.length > 0) {
    console.log(`  Furnace:      ${furnacePass}/${furnaceResults.length} pass`);
  }
  if (lockstepResults.length > 0) {
    console.log(`  Lock-step:    ${lockstepPass}/${lockstepResults.length} pass`);
  }
  console.log(`  TOTAL:        ${totalPass}/${totalChecks} pass (${totalPct}%)`);

  if (failed > 0) {
    console.log('');
    console.log('  Failures:');
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`    x [${r.family}] ${r.name} -- ${r.reason}`);
      // Show tier-specific failures from verification
      const v = r.verification;
      if (v) {
        if (v.instrumentIssue) console.log(`      inst: ${v.instrumentIssue}`);
        if (v.exportIssue) console.log(`      export: ${v.exportIssue}`);
        if (v.paramIssue) console.log(`      params: ${v.paramIssue}`);
        if (v.lockstepIssue) console.log(`      lockstep: ${v.lockstepIssue}`);
      }
    }
    // Also show tier failures for passing tests (these are soft failures)
    const passWithTierIssues = results.filter(r =>
      r.status === 'pass' && r.verification && (
        !r.verification.instrumentPass ||
        (r.verification.exportTested && !r.verification.exportPass) ||
        (r.verification.paramTested && !r.verification.paramPass) ||
        (r.verification.lockstepTested && !r.verification.lockstepPass)
      ),
    );
    if (passWithTierIssues.length > 0) {
      console.log('');
      console.log('  Tier issues (audio passes, but other checks failed):');
      for (const r of passWithTierIssues) {
        const v = r.verification!;
        const issues: string[] = [];
        if (!v.instrumentPass && v.instrumentIssue) issues.push(`inst: ${v.instrumentIssue}`);
        if (v.exportTested && !v.exportPass && v.exportIssue) issues.push(`export: ${v.exportIssue}`);
        if (v.paramTested && !v.paramPass && v.paramIssue) issues.push(`params: ${v.paramIssue}`);
        if (v.lockstepTested && !v.lockstepPass && v.lockstepIssue) issues.push(`lockstep: ${v.lockstepIssue}`);
        console.log(`    ~ [${r.family}] ${r.name} -- ${issues.join('; ')}`);
      }
    }
  }

  // Push results to format status tracker at localhost:4444
  if (pushResults) {
    console.log('');
    console.log('== Pushing results to localhost:4444 ==');
    const updates: Record<string, Record<string, unknown>> = {};
    for (const r of results) {
      // Derive a tracker key from the family name (lowercase, spaces->hyphens)
      const key = r.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const v = r.verification;
      const date = new Date().toISOString().slice(0, 10);
      const tierSummary: string[] = [];
      if (v) {
        tierSummary.push(`audio=${v.audioPass ? 'ok' : 'FAIL'}`);
        tierSummary.push(`inst=${v.instrumentCount}/${v.instrumentPass ? 'ok' : 'FAIL'}`);
        if (v.exportTested) tierSummary.push(`export=${v.exportPass ? 'ok' : 'FAIL'}`);
        if (v.paramCoverage !== undefined) tierSummary.push(`params=${v.paramCoverage}%`);
        if (v.lockstepTested) tierSummary.push(`lockstep=${v.lockstepPass ? 'ok' : 'FAIL'}`);
      }
      updates[key] = {
        auditStatus: r.status === 'pass' ? 'fixed' : 'fail',
        notes: r.status === 'pass'
          ? `smoke-test PASS -- rms=${(r.rmsAvg ?? 0).toFixed(4)} [${tierSummary.join(', ')}] (${date})`
          : `smoke-test FAIL -- ${r.reason ?? 'unknown'} [${tierSummary.join(', ')}] (${date})`,
        rmsAvg: r.rmsAvg ?? 0,
        instrumentCount: v?.instrumentCount ?? 0,
        paramCoverage: v?.paramCoverage,
      };
    }
    try {
      const resp = await fetch('http://localhost:4444/push-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const body = await resp.json();
      console.log(`  Pushed ${Object.keys(updates).length} entries: ${JSON.stringify(body)}`);
    } catch (err) {
      console.error(`  Failed to push: ${err instanceof Error ? err.message : err}`);
      console.error('  Is the format tracker running? `npx tsx tools/format-server.ts &`');
    }
  }

  // ── Baseline diffing (Phase 2.4) ──────────────────────────────────────────
  // --write-baseline → serialize current results to tools/baselines/
  // --check-baseline → diff against baseline, exit non-zero on regression
  let baselineFailures = 0;
  if (writeBaseline || checkBaseline) {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const selfDir = path.dirname(fileURLToPath(import.meta.url));
    const baselineDir = path.resolve(selfDir, 'baselines');
    const baselinePath = path.resolve(baselineDir, 'playback-smoke.json');

    if (writeBaseline) {
      if (!fs.existsSync(baselineDir)) fs.mkdirSync(baselineDir, { recursive: true });
      const snapshot: BaselineSnapshot = {
        updatedAt: new Date().toISOString(),
        entries: results.map((r) => ({
          name: r.name,
          family: r.family,
          status: r.status,
          rmsAvg: r.rmsAvg ?? 0,
          instrumentCount: r.verification?.instrumentCount ?? 0,
        })),
      };
      fs.writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2) + '\n');
      console.log('');
      console.log(`== Wrote baseline to ${baselinePath} (${snapshot.entries.length} entries)`);
    }

    if (checkBaseline) {
      console.log('');
      console.log('== Checking against baseline ==');
      if (!fs.existsSync(baselinePath)) {
        console.error(`  No baseline at ${baselinePath}. Run with --write-baseline first.`);
        process.exit(3);
      }
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as BaselineSnapshot;
      const byName = new Map(baseline.entries.map((e) => [e.name, e]));
      const regressions: Array<{ name: string; kind: string; detail: string }> = [];

      for (const r of results) {
        const prev = byName.get(r.name);
        if (!prev) continue; // new test — not a regression
        if (prev.status === 'pass' && r.status !== 'pass') {
          regressions.push({
            name: r.name,
            kind: 'STATUS_REGRESSION',
            detail: `was pass, now ${r.status} (${r.reason ?? 'unknown'})`,
          });
          continue;
        }
        if (
          prev.status === 'pass' &&
          r.status === 'pass' &&
          prev.rmsAvg > 0 &&
          (r.rmsAvg ?? 0) < prev.rmsAvg * 0.5
        ) {
          regressions.push({
            name: r.name,
            kind: 'SILENT_REGRESSION',
            detail: `rms ${prev.rmsAvg.toFixed(4)} → ${(r.rmsAvg ?? 0).toFixed(4)} (< 50% baseline)`,
          });
        }
      }
      if (regressions.length === 0) {
        console.log(`  OK — no regressions against baseline of ${baseline.updatedAt}`);
      } else {
        console.log(`  ${regressions.length} regression(s) vs baseline of ${baseline.updatedAt}:`);
        for (const r of regressions) {
          console.log(`    x [${r.kind}] ${r.name} — ${r.detail}`);
        }
        baselineFailures = regressions.length;
      }
    }
  }

  process.exit(failed > 0 || baselineFailures > 0 ? 1 : 0);
}

interface BaselineEntry {
  name: string;
  family: string;
  status: 'pass' | 'fail' | 'skip';
  rmsAvg: number;
  instrumentCount: number;
}
interface BaselineSnapshot {
  updatedAt: string;
  entries: BaselineEntry[];
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
