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
 * plays each for a few seconds, and asserts:
 *   - No console errors during load/playback
 *   - Audio level is non-silent (RMS > threshold)
 *   - Song info reports the expected format
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
}

/** Per-test verification results across all tiers */
interface TestVerification {
  // Tier 1: Audio (existing)
  audioPass: boolean;
  rmsAvg: number;
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

    // Find the first actual music file — may be directly in the format dir
    // or nested one level deeper in an artist subdirectory.
    let testFile: string | null = null;
    let testName: string | null = null;

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
      if (topFiles.length > 0) {
        testFile = join(fullDir, topFiles[0]);
        testName = topFiles[0];
      }
    } catch { /* no top-level files */ }

    // If no top-level files, look one level deeper (artist subdirs)
    if (!testFile) {
      try {
        const subDirs = readdirSync(fullDir).filter(d => {
          try { return statSync(join(fullDir, d)).isDirectory(); } catch { return false; }
        }).sort();
        for (const sub of subDirs) {
          const subFiles = readdirSync(join(fullDir, sub)).filter(f => {
            try { return statSync(join(fullDir, sub, f)).isFile() && isMusic(f); } catch { return false; }
          }).sort();
          if (subFiles.length > 0) {
            testFile = join(fullDir, sub, subFiles[0]);
            testName = `${sub}/${subFiles[0]}`;
            break;
          }
        }
      } catch { /* no subdirs */ }
    }

    if (!testFile || !testName) continue;

    tests.push({
      name: `${dir} — ${testName}`,
      family: dir.substring(0, 12).toUpperCase(),
      loader: 'local',
      path: testFile,
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
  // ── Tier 4: MIDI + special format imports ──
  { name: 'MIDI - Dub Organizer',              family: 'MIDI',    loader: 'local', path: '/Users/spot/Code/DEViLBOX/public/data/songs/midi/dub_organizer.mid', engineDriven: true },
  { name: 'V2M - Gamma Projection',            family: 'V2M',     loader: 'local', path: '/Users/spot/Code/Reference Music/V2/BetA/gamma projection.v2m', engineDriven: true },
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
    let level = { rmsAvg: 0, rmsMax: 0, isSilent: true };
    for (let attempt = 0; attempt < 3; attempt++) {
      level = await client.call<{ rmsAvg: number; rmsMax: number; isSilent: boolean }>(
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
const FURNACE_DEMOS_DIR = process.env.FURNACE_DEMOS ?? '/Users/spot/Code/DEViLBOX/third-party/furnace-master/demos';

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
  const skipFx = args.includes('--skip-fx');
  const skipFurnace = args.includes('--skip-furnace');
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

  console.log('▶ DEViLBOX playback smoke test');
  console.log(`  Bridge: ${WS_URL}`);
  console.log(`  Tests:  ${allTests.length} (${TESTS.length} hardcoded, ${localTests.length} local, ${furnaceTests.length} furnace, ${effectTests.length} fx)`);
  if (onlyFamilies) console.log(`  Filter: ${onlyFamilies.join(', ')}`);
  if (pushResults) console.log(`  Push:   results → http://localhost:4444`);
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

  const MAX_RETRIES = 5;
  const RETRY_BACKOFF_MS = 3000;

  const results: TestResult[] = [];
  for (const test of allTests) {
    process.stdout.write(`  [${test.family.padEnd(5)}] ${test.name.padEnd(40)} `);

    // Retry loop: if another agent hijacks the browser mid-test (loads a
    // different song, causing our load/play/measure cycle to see stale data
    // or "No browser connected"), back off and retry until the browser is free.
    let result: TestResult | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      result = await runTest(client, test);

      // Detect interference: if we got "No browser connected", the WS relay
      // lost the browser tab (another agent may have navigated away or
      // reloaded). Back off and retry.
      const isInterference = result.status === 'fail' && (
        result.reason?.includes('No browser connected') ||
        result.reason?.includes('timed out') ||
        result.reason?.includes('WebSocket is not open')
      );

      if (!isInterference || attempt >= MAX_RETRIES) break;

      // Back off: log a warning and wait before retrying
      const waitMs = RETRY_BACKOFF_MS * (attempt + 1);
      process.stdout.write(`\n    ⟳ browser busy (attempt ${attempt + 1}/${MAX_RETRIES}, waiting ${waitMs / 1000}s)... `);
      await sleep(waitMs);

      // Reconnect if the WS dropped
      try { await client.ready(); } catch {
        // Try to create a fresh connection
        try {
          client.close();
          const freshClient = new MCPBridgeClient(WS_URL);
          await freshClient.ready();
          // Can't reassign const — just wait and hope the bridge recovers
        } catch { /* give up on reconnect */ }
      }
    }

    results.push(result!);
    const dt = `${(result!.durationMs / 1000).toFixed(1)}s`;
    if (result!.status === 'pass') {
      const rms = result!.rmsAvg?.toFixed(4) ?? '?';
      console.log(`✓ pass (rms ${rms}, ${dt})`);
    } else if (result!.status === 'skip') {
      console.log(`○ skip (${result!.reason}, ${dt})`);
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

  // Push results to format status tracker at localhost:4444
  if (pushResults) {
    console.log('');
    console.log('── Pushing results to localhost:4444 ──');
    const updates: Record<string, { auditStatus: string; notes: string }> = {};
    for (const r of results) {
      // Derive a tracker key from the family name (lowercase, spaces→hyphens)
      const key = r.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      updates[key] = {
        auditStatus: r.status === 'pass' ? 'fixed' : 'fail',
        notes: r.status === 'pass'
          ? `smoke-test PASS — rms=${(r.rmsAvg ?? 0).toFixed(4)} (${new Date().toISOString().slice(0, 10)})`
          : `smoke-test FAIL — ${r.reason ?? 'unknown'} (${new Date().toISOString().slice(0, 10)})`,
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

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
