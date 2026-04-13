#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEViLBOX Format Smoke Test — comprehensive health check for all 173+ formats
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THIS IS THE CANONICAL FORMAT SMOKE TEST. DO NOT CREATE A NEW ONE.
 * If it needs fixing, fix THIS file. If it needs new features, add them HERE.
 *
 * === WHAT IT CHECKS (per format) ===
 *   1. Audio: non-silent, not clipping, spectral spread (not beeps/drones)
 *   2. Format: detected correctly (not generic "Amiga Format")
 *   3. Patterns: non-empty pattern 0 with actual note data
 *   4. Instruments: named instruments with real synthTypes + sample/synth data
 *   5. Editability: editable flag, editor mode
 *   6. Playback: position advancing through patterns
 *   7. Per-channel oscilloscope: visualizer data flowing
 *   8. Song structure: reasonable position list, channel count
 *   9. Export: native export round-trip (where supported)
 *  10. Errors: no console errors/WASM crashes during load/play
 *  11. Streamed detection: formats with no patterns that need stream visualizer
 *
 * === HOW IT WORKS ===
 * Connects to the MCP WS relay (ws://localhost:4003/mcp) and sends commands
 * to the DEViLBOX browser instance. For each test-song directory, it:
 *   stop → clear errors → load file (with companion discovery) → play →
 *   wait 2.5s → measure audio + spectral + instruments + patterns +
 *   oscilloscope + position + export → score 0-100
 *
 * === PREREQUISITES ===
 *   1. Dev server running: `./dev.sh` (starts Vite:5173 + Express:3001 + WS:4003)
 *   2. DEViLBOX open in browser at http://localhost:5173
 *   3. AudioContext unlocked (click anywhere in the browser window)
 *   4. Format tracker optional: `npx tsx tools/format-server.ts &` (port 4444)
 *
 * === USAGE ===
 *   npx tsx tools/quick-smoke.ts          # Run all formats
 *   # On subsequent runs, formats scoring ≥90 are skipped (cached in /tmp/smoke-results.json)
 *   # Delete /tmp/smoke-results.json to force a full re-run
 *
 * === OUTPUT ===
 * Per-format line:
 *   ✓/~/✗/!  format-name  ♪∅?  ▶■  ◎○  ED/--  EX/ex  ST  fmt=  ch=  p=  n=  i=  rms=  sp=  sc=  [issues]
 *
 *   ♪ = audio OK    ∅ = silent      ? = suspect (beep/drone)
 *   ▶ = pos moving  ■ = pos stuck
 *   ◎ = osc data    ○ = no osc
 *   ED = editable   -- = not editable
 *   EX = exportable ex = export failed
 *   ST = streamed format (needs stream visualizer, not pattern editor)
 *
 * Summary pushed to localhost:4444 format tracker (if running).
 * Full JSON results saved to /tmp/smoke-results.json.
 *
 * === TEST FILES ===
 * One file per format in public/data/test-songs/<format-slug>/
 * Companion files (.sng+.ins, .dum+.ins, mdat/smpl, jpn/smp) are auto-discovered.
 * Sourced from /Users/spot/Code/Reference Music/ collection.
 *
 * === INCREMENTAL RUNS ===
 * Results are saved to /tmp/smoke-results.json after each run.
 * On the next run, formats that scored ≥90 are skipped and their previous
 * results carried forward. This makes iterative fix-and-test cycles fast.
 * Delete the file to force a full re-test of all formats.
 *
 * === KNOWN ISSUES ===
 * - get_instruments_list, get_audio_analysis, get_format_state return limited
 *   data via the WS bridge compared to MCP stdio. Instrument/spectral/editable
 *   checks may show 0 even when the data exists in the app.
 * - UADE formats can cascade-fail if a format crashes UADE's state machine.
 *   The WASM reinit fix (2026-04-13) mitigates this but rapid loading can
 *   still cause transient silence.
 *
 * === HISTORY ===
 * Created: 2026-04-12
 * Major rewrite: 2026-04-13 (added 11 quality checks, scoring, tracker push,
 *   companion discovery, incremental runs, streamed detection, oscilloscope check)
 *
 * Reports results to localhost:4444 format tracker (if running).
 */
import { WebSocket } from 'ws';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import http from 'http';

const WS_URL = 'ws://localhost:4003/mcp';
const TEST_DIR = '/Users/spot/Code/DEViLBOX/public/data/test-songs';
const TRACKER_URL = 'http://localhost:4444';
const PLAY_MS = 2500;
const SILENCE_THRESHOLD = 0.0005;

// ── WS bridge ───────────────────────────────────────────────────────────────

let ws: WebSocket;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.on('open', resolve);
    ws.on('error', reject);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); if (msg.type === 'error') p.reject(new Error(msg.error || 'bridge error')); else p.resolve(msg.data); }
    });
  });
}

function call(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`timeout`)); }, 15000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject: (e) => { clearTimeout(timeout); reject(e); },
    });
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Format tracker push ─────────────────────────────────────────────────────

function pushToTracker(updates: Record<string, any>): Promise<void> {
  return new Promise((resolve) => {
    const data = JSON.stringify(updates);
    const req = http.request(`${TRACKER_URL}/push-updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, () => resolve());
    req.on('error', () => resolve()); // best effort
    req.write(data);
    req.end();
  });
}

// ── Types ───────────────────────────────────────────────────────────────────

interface TestResult {
  dir: string;
  file: string;
  // Audio
  audio: 'pass' | 'silent' | 'suspect' | 'error';
  rms: number;
  rmsVariance: number;
  spectralSpread: number;
  // Format
  format: string;
  formatOk: boolean;
  // Patterns
  patterns: number;
  noteCells: number;
  patternsOk: boolean;
  // Instruments
  instruments: number;
  namedInstruments: number;
  synthTypes: string[];
  hasSampleData: boolean;
  instrumentsOk: boolean;
  // Editability
  editable: boolean;
  editorMode: string;
  // Playback
  positionAdvanced: boolean;
  startPos: number;
  endPos: number;
  // Per-channel visualizer
  oscActive: boolean;
  oscChannels: number;
  oscHasData: boolean;
  // Streamed format (no pattern editor — should show stream visualizer)
  streamed: boolean;
  // Song structure
  songLength: number;
  channels: number;
  channelsOk: boolean;
  // Export
  exportOk: boolean | null; // null = not tested
  // Errors
  errors: string[];
  errorsOk: boolean;
  // Overall
  status: 'pass' | 'warn' | 'fail' | 'error';
  score: number; // 0-100 quality score
  issues: string[];
}

// Formats where generic detection is expected
const GENERIC_OK = new Set([
  'audio-sculpture', 'chiptracker', 'delitracker-custom', 'digital-tracker-mod',
  'his-masters-noise', 'octalyser', 'packed_etc', 'pollytracker',
  'startrekker-flt8', 'stonetracker',
]);

// Engine-driven formats with no pattern data
const NO_PATTERNS_OK = new Set([
  'cheesecutter', 'goat-tracker-ultra', 'organya', 'piston-collage',
  'piston-collage-protected', 'pmd', 'sc68', 'sid', 'sid-factory-2',
  'sunvox', 'vgm', 'studio-pixel---piyopiyo',
]);

// Skip these — known incomplete/WIP, not bugs (separate work items)
const SKIP = new Set<string>([
  'deflemask',               // DMF import incomplete — separate session
  'organya',                 // Organya engine incomplete — separate session
  'piston-collage',          // PxTone engine incomplete — separate session
  'piston-collage-protected', // PxTone engine incomplete — separate session
  'sawteeth',                // .st extension conflict with 7 formats — separate session
  'v2',                      // V2M synth WIP — separate session
  'sunvox',                  // SunVox engine WIP — separate session
  'hippel-7v',               // Moved to TFMX player library — crashes UADE, needs investigation
]);

// Expected min channels per format family
const MIN_CHANNELS: Record<string, number> = {
  'mod': 4, 'protracker': 4, 'pollytracker': 4, 'chiptracker': 4,
  'xm': 2, 'it': 2, 's3m': 2, 'impulse-tracker': 2, 'scream-tracker-2': 2,
  'sid': 3, 'cheesecutter': 3, 'sid-factory-2': 3, 'goat-tracker-ultra': 3,
};

function countActiveBins(spectrum: number[]): number {
  if (!spectrum || spectrum.length === 0) return 0;
  const max = Math.max(...spectrum);
  if (max === 0) return 0;
  return spectrum.filter(v => v > max * 0.05).length;
}

async function main() {
  await connect();
  console.log('Connected to MCP relay');

  // Load previous results to skip 100% passes
  let prevResults: TestResult[] = [];
  try { prevResults = JSON.parse(readFileSync('/tmp/smoke-results.json', 'utf-8')); } catch { /* first run */ }
  const prevPass = new Set(prevResults.filter(r => r.score >= 90).map(r => r.dir));
  if (prevPass.size > 0) console.log(`Skipping ${prevPass.size} formats that scored ≥90 in previous run`);
  console.log('');

  const dirs = readdirSync(TEST_DIR).filter(d => statSync(join(TEST_DIR, d)).isDirectory()).sort();
  const results: TestResult[] = [];
  const trackerUpdates: Record<string, any> = {};

  // Carry forward previous passes
  for (const prev of prevResults) {
    if (prevPass.has(prev.dir)) results.push(prev);
  }

  for (const dir of dirs) {
    if (SKIP.size > 0 && SKIP.has(dir)) { console.log(`  — ${dir.padEnd(24)} SKIPPED (known crasher)`); continue; }
    if (prevPass.has(dir)) { continue; } // already passed — carried forward
    const files = readdirSync(join(TEST_DIR, dir)).filter(f => !f.startsWith('.'));
    if (!files.length) continue;
    const file = files[0];
    const filePath = join(TEST_DIR, dir, file);
    const label = dir.padEnd(24);

    const r: TestResult = {
      dir, file,
      audio: 'error', rms: 0, rmsVariance: 0, spectralSpread: 0,
      format: '', formatOk: false,
      patterns: 0, noteCells: 0, patternsOk: false,
      instruments: 0, namedInstruments: 0, synthTypes: [], hasSampleData: false, instrumentsOk: false,
      editable: false, editorMode: '',
      positionAdvanced: false, startPos: 0, endPos: 0,
      oscActive: false, oscChannels: 0, oscHasData: false,
      streamed: false,
      songLength: 0, channels: 0, channelsOk: false,
      exportOk: null,
      errors: [], errorsOk: true,
      status: 'error', score: 0, issues: [],
    };

    try {
      // Stop + quiesce
      await call('stop').catch(() => {});
      await call('release_all_notes').catch(() => {});
      await call('clear_console_errors').catch(() => {});
      await sleep(400);

      // Load — with companion file discovery
      const fileData = readFileSync(filePath);
      const loadParams: Record<string, any> = { filename: file, data: fileData.toString('base64') };

      // Auto-discover companion files in the same directory
      const dirFiles = readdirSync(join(TEST_DIR, dir)).filter(f => !f.startsWith('.'));
      if (dirFiles.length > 1) {
        const companionFiles: Record<string, string> = {};
        const lowerFile = file.toLowerCase();
        const prefixPairs: [string, string][] = [
          ['mdat.', 'smpl.'], ['smpl.', 'mdat.'],
          ['jpn.', 'smp.'], ['smp.', 'jpn.'],
          ['midi.', 'smpl.'], ['smpl.', 'midi.'],
        ];
        // Extension pairs: .sng↔.ins, .dum↔.ins
        const extPairs: [string, string][] = [
          ['.sng', '.ins'], ['.ins', '.sng'],
          ['.dum', '.ins'], ['.ins', '.dum'],
        ];
        for (const other of dirFiles) {
          if (other === file) continue;
          // Prefix-based companion
          for (const [myPrefix, pairPrefix] of prefixPairs) {
            if (lowerFile.startsWith(myPrefix)) {
              const suffix = file.slice(myPrefix.length);
              if (other.toLowerCase() === `${pairPrefix}${suffix.toLowerCase()}`) {
                companionFiles[other] = readFileSync(join(TEST_DIR, dir, other)).toString('base64');
              }
            }
          }
          // Extension-based companion (same basename, different ext)
          for (const [myExt, pairExt] of extPairs) {
            if (lowerFile.endsWith(myExt)) {
              const base = file.slice(0, -myExt.length);
              if (other.toLowerCase() === `${base.toLowerCase()}${pairExt}`) {
                companionFiles[other] = readFileSync(join(TEST_DIR, dir, other)).toString('base64');
              }
            }
          }
        }
        if (Object.keys(companionFiles).length > 0) {
          loadParams.companionFiles = companionFiles;
        }
      }

      await call('load_file', loadParams);

      // ── Song info ──
      const song = await call('get_song_info').catch(() => null);
      r.format = song?.format ?? song?.name ?? '?';
      r.patterns = song?.numPatterns ?? 0;
      r.channels = song?.numChannels ?? 0;
      r.songLength = song?.songLength ?? song?.numPatterns ?? 0;
      r.formatOk = GENERIC_OK.has(dir) || (r.format !== 'Amiga Format' && r.format !== '?');
      const minCh = MIN_CHANNELS[dir] ?? 1;
      r.channelsOk = r.channels >= minCh;

      // ── Editor/editability ──
      const fmtState = await call('get_format_state').catch(() => null);
      r.editorMode = fmtState?.editorMode ?? song?.editorMode ?? '';
      r.editable = fmtState?.isEditable ?? false;

      // ── Pattern check ──
      if (!NO_PATTERNS_OK.has(dir)) {
        try {
          const stats = await call('get_pattern_stats', { patternIndex: 0 });
          r.noteCells = stats?.noteCells ?? 0;
        } catch {
          try {
            const pat = await call('get_pattern', { patternIndex: 0, compact: true, endRow: 63 });
            r.noteCells = pat?.rows?.length ?? 0;
          } catch { /* */ }
        }
        r.patternsOk = r.noteCells > 0;
      } else {
        r.patternsOk = true;
      }

      // ── Instrument check ──
      try {
        const instList = await call('get_instruments_list');
        const insts = instList?.instruments ?? [];
        r.instruments = insts.length;
        r.synthTypes = [...new Set(insts.map((i: any) => i.synthType).filter(Boolean))];
        r.namedInstruments = insts.filter((i: any) =>
          i.name && i.name.length > 0 &&
          !i.name.match(/^(Sampler|Player|UADEEditableSynth|UADESynth)\s*\d*$/)
        ).length;
        r.instrumentsOk = r.namedInstruments > 0 || r.instruments > 0;

        // Check instruments for real data (samples or synth configs)
        let hasSample = false, hasSynthConfig = false;
        for (const inst of insts.slice(0, 3)) { // check first 3
          try {
            const detail = await call('get_instrument', { instrumentId: inst.id ?? 1 });
            // Sample-based: has sample waveform data
            if (detail?.sampleLength > 0 || detail?.sampleData != null) hasSample = true;
            // Synth-based: has non-default config (tb303, fc, hively, opl3, etc.)
            if (detail?.tb303 || detail?.fc || detail?.hively || detail?.tfmx ||
                detail?.soundMon || detail?.sidMon || detail?.digMug || detail?.opl3 ||
                detail?.furnaceChip || detail?.sunvox || detail?.superCollider ||
                detail?.xrns || detail?.synthConfig) hasSynthConfig = true;
            // Any synthType that isn't Sampler/Player counts as having synth data
            if (inst.synthType && !['Sampler', 'Player'].includes(inst.synthType)) hasSynthConfig = true;
          } catch { /* */ }
        }
        r.hasSampleData = hasSample || hasSynthConfig;
      } catch { /* */ }

      // ── Play + measure ──
      await call('play', { mode: 'song' });

      // Get starting position
      try {
        const pb = await call('get_playback_state');
        r.startPos = pb?.currentPattern ?? pb?.currentPosition ?? 0;
      } catch { /* */ }

      await sleep(PLAY_MS);

      // Audio level
      const level = await call('get_audio_level', { durationMs: 1500 });
      r.rms = level?.rmsAvg ?? 0;

      // ── Spectral analysis ──
      let spread1 = 0, spread2 = 0, rms1 = 0, rms2 = 0;
      try {
        const a1 = await call('get_audio_analysis');
        rms1 = a1?.rms ?? 0;
        spread1 = countActiveBins(a1?.spectrum ?? []);
        await sleep(400);
        const a2 = await call('get_audio_analysis');
        rms2 = a2?.rms ?? 0;
        spread2 = countActiveBins(a2?.spectrum ?? []);
      } catch { /* */ }
      r.spectralSpread = Math.max(spread1, spread2);
      r.rmsVariance = Math.abs(rms1 - rms2);

      // ── Position check — did playback advance? ──
      try {
        const pb2 = await call('get_playback_state');
        r.endPos = pb2?.currentPattern ?? pb2?.currentPosition ?? 0;
        r.positionAdvanced = r.endPos !== r.startPos || r.endPos > 0;
      } catch { /* */ }

      // ── Per-channel oscilloscope/visualizer check ──
      try {
        const osc = await call('get_oscilloscope_info');
        r.oscActive = osc?.active ?? false;
        r.oscChannels = osc?.channelCount ?? 0;
        // Check if any channel has non-zero waveform data
        r.oscHasData = r.oscActive && r.oscChannels > 0;
        if (osc?.channels && Array.isArray(osc.channels)) {
          const hasWaveform = osc.channels.some((ch: any) =>
            ch.waveform && Array.isArray(ch.waveform) && ch.waveform.some((v: number) => v !== 0)
          );
          r.oscHasData = hasWaveform;
        }
      } catch { /* */ }

      // ── Export round-trip (quick check — just try export, don't reimport) ──
      try {
        const exportResult = await call('export_native');
        r.exportOk = exportResult?.ok === true || (exportResult?.data != null);
      } catch {
        r.exportOk = null; // not supported for this format
      }

      // ── Console errors ──
      const errs = await call('get_console_errors').catch(() => ({ entries: [] }));
      r.errors = (errs.entries ?? [])
        .filter((e: any) => {
          const msg = e.message ?? '';
          // Always include: actual errors, WASM aborts, unhandled rejections
          if (e.level === 'error') {
            // Filter out noise
            if (msg.includes('Failed to load resource')) return false;
            if (msg.includes('disposeAllInstruments')) return false;
            if (msg.includes('loadInstruments called')) return false;
            if (msg.includes('setPatternOrder called')) return false;
            return true;
          }
          // Include critical warnings: WASM crashes, score died, protocol errors
          if (e.level === 'warn') {
            if (msg.includes('Aborted(')) return true;
            if (msg.includes('score died')) return true;
            if (msg.includes('score crashed')) return true;
            if (msg.includes('module check failed')) return true;
            if (msg.includes('protocol error')) return true;
            if (msg.includes('player_load returned 0')) return true;
          }
          return false;
        })
        .map((e: any) => `[${e.level}] ${(e.message ?? '').slice(0, 120)}`);
      r.errorsOk = r.errors.length === 0;

      // ── Classify audio ──
      if (r.rms < SILENCE_THRESHOLD) {
        r.audio = 'silent';
      } else if (r.spectralSpread > 0 && r.spectralSpread <= 3 && r.rmsVariance < 0.01) {
        r.audio = 'suspect';
      } else {
        r.audio = 'pass';
      }

      // ── Streamed detection ──
      // A format is "streamed" if: audio plays but no pattern data exists.
      // These should show a stream visualizer instead of the pattern editor.
      r.streamed = r.audio === 'pass' && r.noteCells === 0 && (r.patterns <= 1 || NO_PATTERNS_OK.has(dir));

      // ── Issues ──
      r.issues = [];
      if (r.audio === 'silent') r.issues.push('silent');
      if (r.audio === 'suspect') r.issues.push('suspect-audio');
      if (!r.formatOk) r.issues.push('generic-format');
      if (!r.patternsOk && !NO_PATTERNS_OK.has(dir)) r.issues.push('empty-patterns');
      if (!r.instrumentsOk) r.issues.push('no-instruments');
      if (!r.editable) r.issues.push('not-editable');
      if (!r.positionAdvanced && r.audio === 'pass') r.issues.push('pos-stuck');
      if (!r.channelsOk) r.issues.push(`channels(${r.channels}<${minCh})`);
      if (r.songLength <= 1 && r.patterns > 1) r.issues.push('short-songlist');
      if (!r.oscHasData && r.audio === 'pass') r.issues.push('no-osc');
      if (!r.errorsOk) r.issues.push(`${r.errors.length}-errors`);

      // ── Score (0-100) ──
      let score = 0;
      if (r.audio === 'pass') score += 25;
      else if (r.audio === 'suspect') score += 10;
      if (r.formatOk) score += 10;
      if (r.patternsOk) score += 15;
      if (r.instrumentsOk) score += 10;
      if (r.namedInstruments > 0) score += 5;
      if (r.hasSampleData) score += 5;
      if (r.editable) score += 5;
      if (r.positionAdvanced) score += 5;
      if (r.channelsOk) score += 5;
      if (r.oscHasData) score += 5;
      if (r.errorsOk) score += 5;
      if (r.exportOk === true) score += 5;
      r.score = score;

      // ── Status ──
      const audioOk = r.audio === 'pass';
      const contentOk = r.patternsOk && r.instrumentsOk;
      if (audioOk && contentOk && r.errorsOk) r.status = 'pass';
      else if (audioOk) r.status = 'warn';
      else r.status = 'fail';

      // ── Print ──
      const icon = { pass: '✓', warn: '~', fail: '✗', error: '!' }[r.status];
      const aud = { pass: '♪', suspect: '?', silent: '∅', error: '!' }[r.audio];
      const ed = r.editable ? 'ED' : '--';
      const ex = r.exportOk === true ? 'EX' : r.exportOk === false ? 'ex' : '  ';
      const pos = r.positionAdvanced ? '▶' : '■';
      const osc = r.oscHasData ? '◎' : '○';
      const str = r.streamed ? 'ST' : '  ';
      const detail = `${aud}${pos}${osc}${ed} ${ex} ${str} ${r.format.slice(0, 16).padEnd(16)} ch=${String(r.channels).padStart(2)} p=${String(r.patterns).padStart(3)} n=${String(r.noteCells).padStart(4)} i=${String(r.instruments).padStart(2)}/${String(r.namedInstruments).padStart(2)} rms=${r.rms.toFixed(3)} sp=${String(r.spectralSpread).padStart(2)} sc=${String(r.score).padStart(3)}`;
      const iss = r.issues.length > 0 ? ` [${r.issues.join(', ')}]` : '';
      console.log(`${icon} ${label} ${detail}${iss}`);

      // ── Tracker update ──
      trackerUpdates[`smoke-${dir}`] = {
        auditStatus: r.status === 'pass' ? 'fixed' : r.status === 'warn' ? 'unknown' : 'fail',
        notes: `${r.audio} ${r.format} ch=${r.channels} pat=${r.patterns} notes=${r.noteCells} inst=${r.instruments} rms=${r.rms.toFixed(3)} score=${r.score}${iss}`,
      };

    } catch (e: any) {
      r.status = 'error';
      r.issues = [e.message?.slice(0, 60) ?? 'unknown'];
      console.log(`! ${label} ERROR: ${r.issues[0]}`);
      trackerUpdates[`smoke-${dir}`] = { auditStatus: 'fail', notes: `ERROR: ${r.issues[0]}` };
    }

    results.push(r);
  }

  // ── Push all results to tracker ──
  console.log(`\nPushing ${Object.keys(trackerUpdates).length} results to ${TRACKER_URL}...`);
  await pushToTracker(trackerUpdates);

  // ── Summary ──
  const pass = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const err = results.filter(r => r.status === 'error').length;
  const editable = results.filter(r => r.editable).length;
  const hasPatterns = results.filter(r => r.patternsOk).length;
  const hasInstruments = results.filter(r => r.instrumentsOk).length;
  const suspect = results.filter(r => r.audio === 'suspect').length;
  const exported = results.filter(r => r.exportOk === true).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Pass: ${pass}  Warn: ${warn}  Fail: ${fail}  Error: ${err}  Total: ${results.length}`);
  console.log(`  Audio OK: ${results.filter(r => r.audio === 'pass').length}  Silent: ${results.filter(r => r.audio === 'silent').length}  Suspect: ${suspect}`);
  const hasOsc = results.filter(r => r.oscHasData).length;
  console.log(`  Patterns: ${hasPatterns}  Instruments: ${hasInstruments}  Editable: ${editable}  Exportable: ${exported}  Oscilloscope: ${hasOsc}`);
  const streamed = results.filter(r => r.streamed).length;
  console.log(`  Streamed: ${streamed}  Avg score: ${avgScore.toFixed(1)}/100  Pass rate: ${((pass + warn) / results.length * 100).toFixed(1)}%`);
  console.log(`═══════════════════════════════════════════════════════════`);

  // Streamed formats — need stream visualizer instead of pattern editor
  if (streamed > 0) {
    console.log(`\n── Streamed formats (${streamed}) — need stream visualizer ──`);
    results.filter(r => r.streamed).forEach(r =>
      console.log(`  ${r.dir.padEnd(24)} fmt=${r.format.slice(0, 20)} ch=${r.channels} osc=${r.oscHasData ? 'yes' : 'no'}`));
  }

  if (fail > 0) {
    console.log(`\n── Failures (${fail}) ──`);
    results.filter(r => r.status === 'fail').sort((a, b) => a.score - b.score).forEach(r =>
      console.log(`  ${r.dir.padEnd(24)} score=${String(r.score).padStart(3)} ${r.issues.join(', ')}`));
  }
  if (suspect > 0) {
    console.log(`\n── Suspect audio (${suspect}) ──`);
    results.filter(r => r.audio === 'suspect').forEach(r =>
      console.log(`  ${r.dir.padEnd(24)} spread=${r.spectralSpread} rmsVar=${r.rmsVariance.toFixed(4)}`));
  }
  if (err > 0) {
    console.log(`\n── Errors (${err}) ──`);
    results.filter(r => r.status === 'error').forEach(r =>
      console.log(`  ${r.dir.padEnd(24)} ${r.issues.join(', ')}`));
  }

  // Save JSON
  writeFileSync('/tmp/smoke-results.json', JSON.stringify(results, null, 2));
  console.log(`\nFull results: /tmp/smoke-results.json`);

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
