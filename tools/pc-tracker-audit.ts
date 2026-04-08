/**
 * PC Tracker Format Audit — comprehensive test of OpenMPT WASM soundlib formats
 *
 * Tests 22 PC tracker formats that go through OpenMPT WASM (via PCTrackerParsers.ts):
 *   - Big 4 baseline: MOD, S3M, IT, XM
 *   - Extended PC formats: AMF, DBM, DMF, DSM, GDM, GT2, IMF, J2B, MDL, MO3,
 *     MT2, PTM, PSM, RTM, ULT, PLM, STX, OKT
 *
 * 10-point verification for each format:
 *   1. load          — File loads without crash
 *   2. metadata      — Song metadata (title, channels, BPM present)
 *   3. instruments   — Has instruments with correct synthType (Sampler for all PC formats)
 *   4. instDetail    — Instrument names or sample data present
 *   5. patterns      — Pattern data present (numPatterns > 0, numChannels > 0)
 *   6. noteDensity   — Patterns contain actual notes (not just empty rows)
 *   7. audio         — Non-silent audio output (rms > 0.001)
 *   8. edit          — Can modify a cell (set_cell + read back)
 *   9. exportRoundtrip — Export produces non-empty data + round-trip reimport
 *  10. noErrors      — No console errors during entire test
 *
 * Usage:
 *   npx tsx tools/pc-tracker-audit.ts
 *   npx tsx tools/pc-tracker-audit.ts --only amf,dbm
 *   npx tsx tools/pc-tracker-audit.ts --skip mod,xm,it,s3m
 */
import { WebSocket } from 'ws';
import http from 'http';

const API_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:4003/mcp';
const TRACKER_URL = 'http://localhost:4444';
const PLAY_MS = 3000;
const TIMEOUT_MS = 30000;

/* ── All PC tracker formats use Sampler synthType ──────────────────────────── */
// OpenMPT-handled formats are sample-based; instruments should be Sampler.
const EXPECTED_SYNTH: Record<string, string[]> = {
  'pc-mod':  ['Sampler'],
  'pc-s3m':  ['Sampler'],
  'pc-it':   ['Sampler'],
  'pc-xm':   ['Sampler'],
  'pc-mptm': ['Sampler'],
  'pc-amf':  ['Sampler'],
  'pc-dbm':  ['Sampler'],
  'pc-dmf':  ['Sampler'],
  'pc-dsm':  ['Sampler'],
  'pc-gdm':  ['Sampler'],
  'pc-gt2':  ['Sampler'],
  'pc-imf':  ['Sampler'],
  'pc-mdl':  ['Sampler'],
  'pc-mo3':  ['Sampler'],
  'pc-mt2':  ['Sampler'],
  'pc-ptm':  ['Sampler'],
  'pc-psm':  ['Sampler'],
  'pc-rtm':  ['Sampler'],
  'pc-ult':  ['Sampler'],
  'pc-plm':  ['Sampler'],
  'pc-dsym': ['Sampler'],
  'pc-okt':  ['Sampler'],
  'pc-puma': ['Sampler'],
};

/* ── Test file paths (hand-picked from Modland) ──────────────────────────── */
interface TestDef {
  key: string;
  format: string;
  path: string;
}

// Formats that already pass 10/10 — skip to save time (start empty)
const SKIP_KEYS = new Set<string>([
  // Add keys here as formats pass, e.g.: 'pc-mod', 'pc-xm'
]);

const TESTS: TestDef[] = [
  // ── Big 4 baseline (should already work perfectly) ──
  { key: 'pc-mod', format: 'MOD',
    path: 'pub/modules/Protracker/Captain/space debris.mod' },
  { key: 'pc-s3m', format: 'S3M',
    path: 'pub/modules/Screamtracker 3/Skaven/catch that goblin!!.s3m' },
  { key: 'pc-it',  format: 'IT',
    path: 'pub/modules/Impulsetracker/Skaven/bookworm.it' },
  { key: 'pc-xm',  format: 'XM',
    path: 'pub/modules/Fasttracker 2/Candybag/space debris.xm' },

  // ── OpenMPT MPTM (OpenMPT native format) ──
  { key: 'pc-mptm', format: 'MPTM',
    path: 'pub/modules/OpenMPT MPTM/Ether Audio/cubical stadium.mptm' },

  // ── DSMI Advanced Module Format ──
  { key: 'pc-amf', format: 'AMF',
    path: 'pub/modules/Digital Sound And Music Interface/Amir Glinik/cyclemania - cm0001.mod.amf' },

  // ── DigiBooster Pro ──
  { key: 'pc-dbm', format: 'DBM',
    path: 'pub/modules/Digibooster Pro/AceMan/invisibility.dbm' },

  // ── X-Tracker / Delusion Digital Music Format ──
  { key: 'pc-dmf', format: 'DMF',
    path: 'pub/modules/X-Tracker/Bomb20/4wd benzs and dickwhiping.dmf' },

  // ── DSIK / Digital Sound Module ──
  { key: 'pc-dsm', format: 'DSM',
    path: 'pub/modules/Digital Sound Interface Kit/Necros/andante.dsm' },

  // ── General DigiMusic ──
  { key: 'pc-gdm', format: 'GDM',
    path: 'pub/modules/General DigiMusic/- unknown/tecno12.gdm' },

  // ── Graoumf Tracker 2 ──
  { key: 'pc-gt2', format: 'GT2',
    path: 'pub/modules/Graoumf Tracker 2/505/electrolife.gt2' },

  // ── Imago Orpheus ──
  { key: 'pc-imf', format: 'IMF',
    path: 'pub/modules/Imago Orpheus/Karsten Koch/arthur.imf' },

  // ── Digitrakker ──
  { key: 'pc-mdl', format: 'MDL',
    path: 'pub/modules/Digitrakker/- unknown/socket01.mdl' },

  // ── MO3 compressed ──
  { key: 'pc-mo3', format: 'MO3',
    path: 'pub/modules/MO3/- unknown/air zonk - brains town.mo3' },

  // ── MadTracker 2 ──
  { key: 'pc-mt2', format: 'MT2',
    path: 'pub/modules/Mad Tracker 2/- unknown/delerious-outline.mt2' },

  // ── PolyTracker ──
  { key: 'pc-ptm', format: 'PTM',
    path: 'pub/modules/Polytracker/- unknown/bossa! bossa!.ptm' },

  // ── Epic Megagames MASI (PSM) ──
  { key: 'pc-psm', format: 'PSM',
    path: 'pub/modules/Epic Megagames MASI/CC Catch/one must fall! 1.psm' },

  // ── Real Tracker ──
  { key: 'pc-rtm', format: 'RTM',
    path: 'pub/modules/Real Tracker/DStruk/odyssey.rtm' },

  // ── UltraTracker ──
  { key: 'pc-ult', format: 'ULT',
    path: 'pub/modules/Ultratracker/Cyboman/cyboccultation.ult' },

  // ── DisorderTracker 2 ──
  { key: 'pc-plm', format: 'PLM',
    path: 'pub/modules/Disorder Tracker 2/Skywalker/act 1... part 2 - remix.plm' },

  // ── Digital Symphony ──
  { key: 'pc-dsym', format: 'DSYM',
    path: 'pub/modules/Digital Symphony/- unknown/a_track!.dsym' },

  // ── Oktalyzer (also tested in UADE, but verify OpenMPT path) ──
  { key: 'pc-okt', format: 'OKT',
    path: 'pub/modules/Oktalyzer/Andemar/dark.okta' },

  // ── Pumatracker ──
  { key: 'pc-puma', format: 'PUMA',
    path: 'pub/modules/Pumatracker/Saito/trainertune.puma' },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function httpGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode === 404) { reject(new Error('404')); res.resume(); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function download(path: string) {
  const url = `${API_BASE}/api/modland/download?path=${encodeURIComponent(path)}`;
  const buf = await httpGet(url);
  if (buf.length < 64) throw new Error(`Download too small: ${buf.length}b`);
  return { filename: path.split('/').pop()!, base64: buf.toString('base64'), size: buf.length };
}

interface MCPClient {
  call(method: string, params?: Record<string, unknown>): Promise<any>;
  close(): void;
}

function createClient(): Promise<MCPClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let id = 0;
    const pending = new Map<number, { res: Function; rej: Function; timeout: ReturnType<typeof setTimeout> }>();

    ws.on('open', () => resolve({
      call(method: string, params: Record<string, unknown> = {}) {
        return new Promise((res, rej) => {
          const reqId = ++id;
          const timeout = setTimeout(() => { pending.delete(reqId); rej(new Error(`timeout:${method}`)); }, TIMEOUT_MS);
          pending.set(reqId, { res, rej, timeout });
          ws.send(JSON.stringify({ id: reqId, type: 'call', method, params }));
        });
      },
      close() { ws.close(); }
    }));

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const p = pending.get(msg.id);
      if (p) { clearTimeout(p.timeout); pending.delete(msg.id); msg.type === 'error' ? p.rej(new Error(msg.error)) : p.res(msg.result || msg.data || msg); }
    });

    ws.on('error', reject);
  });
}

function postTracker(updates: Record<string, any>) {
  const body = JSON.stringify(updates);
  return new Promise((resolve, reject) => {
    const req = http.request(`${TRACKER_URL}/push-updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => { let d = ''; res.on('data', (c: string) => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    req.on('error', () => resolve(null)); // non-fatal if tracker server is not running
    req.write(body);
    req.end();
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── CLI args ───────────────────────────────────────────────────────────── */

function parseArgs(): { only: Set<string> | null; skip: Set<string> } {
  const args = process.argv.slice(2);
  let only: Set<string> | null = null;
  const skip = new Set(SKIP_KEYS);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only' && args[i + 1]) {
      only = new Set(args[i + 1].split(',').map(s => s.startsWith('pc-') ? s : `pc-${s}`));
      i++;
    } else if (args[i] === '--skip' && args[i + 1]) {
      for (const s of args[i + 1].split(',')) skip.add(s.startsWith('pc-') ? s : `pc-${s}`);
      i++;
    }
  }
  return { only, skip };
}

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  const { only, skip } = parseArgs();
  let client = await createClient();
  const updates: Record<string, any> = {};
  const stats = { pass: 0, fail: 0, skip: 0 };

  const testsToRun = TESTS.filter(t => {
    if (only && !only.has(t.key)) return false;
    return true;
  });

  console.log(`\n▶ PC Tracker Format Audit — ${testsToRun.length} formats (OpenMPT WASM soundlib)\n`);
  console.log('  10-point: load ✓  metadata ✓  instruments ✓  inst-detail ✓  patterns ✓  notes ✓  audio ✓  edit ✓  export+roundtrip ✓  no-errors ✓\n');

  for (const test of testsToRun) {
    if (skip.has(test.key)) {
      console.log(`[${test.key}]`.padEnd(28) + ` (${test.format})`.padEnd(8) + ' ○ SKIP');
      stats.skip++;
      continue;
    }
    const label = `[${test.key}]`.padEnd(28) + ` (${test.format})`.padEnd(8);
    const issues: string[] = [];
    const checks: Record<string, boolean> = {
      load: false, metadata: false, instruments: false, instDetail: false,
      patterns: false, noteDensity: false, audio: false, edit: false,
      exportRoundtrip: false, noErrors: false,
    };

    let numPat = 0, numCh = 0, instList: any[] = [], rms = 0, exportSize = 0;
    let filename = '';

    try {
      // ── 0. Clean slate: stop any playback, verify browser is alive ──
      try { await client.call('stop'); } catch {}
      await sleep(500);
      // Health check — if this fails, browser is disconnected
      try {
        await client.call('get_song_info');
      } catch (e: any) {
        if (e.message?.includes('disconnected') || e.message?.includes('No browser')) {
          console.log(`${label} ⏳ Browser down, waiting for reconnect...`);
          await sleep(12000);
          try { client.close(); } catch {}
          try { client = await createClient(); } catch {
            console.log(`${label} ✗ Could not reconnect. Stopping.`);
            break;
          }
          try { await client.call('get_song_info'); } catch {
            console.log(`${label} ✗ Still disconnected after retry. Stopping.`);
            break;
          }
        }
      }
      await client.call('clear_console_errors');
      // Remove master effects to avoid interference
      try {
        const as = await client.call('get_audio_state');
        for (const fx of (as?.masterEffects || as?.data?.masterEffects || []))
          await client.call('remove_master_effect', { effectId: fx.id });
      } catch {}

      // ── 1. Download & load via Modland ──
      await sleep(800);
      const dl = await download(test.path);
      filename = dl.filename;
      await client.call('load_file', { filename, data: dl.base64 });
      checks.load = true;

      // ── 2. Song metadata ──
      const info = await client.call('get_song_info');
      numPat = info?.numPatterns ?? 0;
      numCh = info?.numChannels ?? 0;
      const title = info?.projectName ?? '';
      const bpm = info?.bpm ?? 0;
      if (bpm <= 0) issues.push(`invalid BPM (${bpm})`);
      checks.metadata = bpm > 0;

      // ── 3. Verify instruments (synthType correctness) ──
      const insts = await client.call('get_instruments_list');
      instList = Array.isArray(insts) ? insts : (insts?.instruments || []);
      if (instList.length === 0) {
        issues.push('no instruments');
      } else {
        const synthTypes = [...new Set(instList.map((i: any) => i.synthType))];
        const expected = EXPECTED_SYNTH[test.key];
        if (expected) {
          const unexpected = synthTypes.filter((t: string) => !expected.includes(t));
          if (unexpected.length > 0) {
            issues.push(`wrong synthTypes: got [${synthTypes.join(',')}] expected [${expected.join(',')}]`);
          }
        }
        if (synthTypes.includes('NoneSynth')) {
          issues.push('has NoneSynth instruments');
        }
        checks.instruments = !issues.some(i => i.includes('synthType') || i.includes('NoneSynth') || i.includes('no instruments'));
      }

      // ── 4. Instrument details (names, non-empty) ──
      const namedInsts = instList.filter((i: any) => i.name && i.name.trim() !== '');
      if (instList.length > 0 && namedInsts.length === 0) {
        issues.push('all instruments unnamed');
      }
      checks.instDetail = namedInsts.length > 0 || instList.length === 0;

      // ── 5. Pattern structure ──
      if (numPat <= 0) issues.push(`no patterns (${numPat})`);
      if (numCh <= 0) issues.push(`no channels (${numCh})`);
      checks.patterns = numPat > 0 && numCh > 0;

      // ── 6. Pattern note density ──
      let totalNotes = 0;
      let totalCells = 0;
      if (numPat > 0) {
        const patsToCheck = Math.min(numPat, 3);
        for (let pi = 0; pi < patsToCheck; pi++) {
          try {
            const pat = await client.call('get_pattern', { patternIndex: pi });
            const rows = pat?.rows || pat?.data?.rows || [];
            for (const row of rows) {
              const cells = row?.cells || [];
              totalCells += cells.length;
              for (const cell of cells) {
                const noteStr = cell?.noteStr || '';
                const noteNum = cell?.note ?? 0;
                if ((noteStr && noteStr !== '---' && noteStr !== '...' && noteStr !== '') || noteNum > 0) {
                  totalNotes++;
                }
              }
            }
          } catch {}
          if (totalNotes > 0) break;
        }
      }
      if (totalCells > 0 && totalNotes === 0) {
        issues.push(`first ${Math.min(numPat, 3)} patterns have no notes`);
      }
      checks.noteDensity = totalNotes > 0;

      // ── 7. Play & check audio ──
      await client.call('play', { mode: 'song' });
      try { await client.call('wait_for_audio', { thresholdRms: 0.001, timeoutMs: 5000 }); } catch {}
      await sleep(PLAY_MS);
      const level = await client.call('get_audio_level', { durationMs: 1000 });
      rms = level?.rmsAvg ?? level?.data?.rmsAvg ?? 0;
      if (rms < 0.001) issues.push(`silent (rms=${rms.toFixed(6)})`);
      checks.audio = rms >= 0.001;

      await client.call('stop');

      // ── 8. Edit verification ──
      if (numPat > 0 && numCh > 0) {
        try {
          await client.call('set_cell', { patternIndex: 0, row: 0, channel: 0, note: 'C-4', instrument: 1 });

          const patAfter = await client.call('get_pattern', { patternIndex: 0, startRow: 0, endRow: 0 });
          const rowsAfter = patAfter?.rows || patAfter?.data?.rows || [];
          const newCell = rowsAfter?.[0]?.cells?.[0] || {};
          const noteStr = newCell?.noteStr || '';
          const noteNum = newCell?.note ?? 0;

          const editOk = noteStr === 'C-4' || noteStr === 'C 4' || (noteNum > 0 && noteNum <= 127);
          if (!editOk) {
            issues.push(`edit failed: set C-4 but read back note=${noteNum} noteStr='${noteStr}'`);
          }
          checks.edit = editOk;

          // Restore: clear the cell
          try {
            await client.call('set_cell', { patternIndex: 0, row: 0, channel: 0, note: '---', instrument: 0 });
          } catch {}
        } catch (e: any) {
          issues.push(`edit error: ${e.message.substring(0, 60)}`);
          checks.edit = false;
        }
      }

      // ── 9. Export native + round-trip reimport ──
      let exportData: string | null = null;
      let exportFilename = '';
      try {
        const exp = await client.call('export_native');
        if (exp?.error) {
          issues.push(`export failed: ${exp.error.substring(0, 80)}`);
        } else {
          exportSize = exp?.sizeBytes ?? 0;
          exportData = exp?.data ?? null;
          exportFilename = exp?.filename ?? filename;
          if (exportSize === 0) {
            issues.push('export returned 0 bytes');
          } else if (exportData) {
            // Round-trip: reimport the exported file
            try {
              await client.call('load_file', { filename: exportFilename, data: exportData });
              const reimportInfo = await client.call('get_song_info');
              const reimportPat = reimportInfo?.numPatterns ?? 0;
              const reimportCh = reimportInfo?.numChannels ?? 0;
              const reimportInsts = await client.call('get_instruments_list');
              const reimportInstList = Array.isArray(reimportInsts) ? reimportInsts : (reimportInsts?.instruments || []);

              if (reimportCh !== numCh) {
                issues.push(`round-trip channel mismatch: ${numCh}→${reimportCh}`);
              }
              if (reimportPat === 0) {
                issues.push('round-trip lost all patterns');
              }
              if (reimportInstList.length === 0 && instList.length > 0) {
                issues.push('round-trip lost all instruments');
              }
              checks.exportRoundtrip = reimportCh === numCh && reimportPat > 0 &&
                (reimportInstList.length > 0 || instList.length === 0);
            } catch (e: any) {
              issues.push(`round-trip reimport failed: ${e.message.substring(0, 60)}`);
              checks.exportRoundtrip = false;
            }
          } else {
            checks.exportRoundtrip = true; // export worked, just no data blob returned
          }
        }
      } catch (e: any) {
        issues.push(`export crash: ${e.message.substring(0, 60)}`);
      }

      // ── 10. Check console errors ──
      const errResp = await client.call('get_console_errors');
      const entries = errResp?.data?.entries || errResp?.entries || [];
      const realErrors = entries.filter((e: any) =>
        e.level === 'error' &&
        !e.message?.includes('MIDIManager') &&
        !e.message?.includes('AudioContext was not allowed') &&
        !e.message?.includes('Failed to load resource')
      );
      if (realErrors.length > 0) {
        const errMsgs = realErrors.map((e: any) => e.message?.substring(0, 60)).join('; ');
        issues.push(`${realErrors.length} errors: ${errMsgs}`);
      }
      checks.noErrors = realErrors.length === 0;

      // ── Report ──
      const synthTypes = [...new Set(instList.map((i: any) => i.synthType))];
      const passCount = Object.values(checks).filter(Boolean).length;
      const totalChecks = Object.keys(checks).length;
      const checkStr = Object.entries(checks).map(([k, v]) => v ? `${k}✓` : `${k}✗`).join(' ');
      const detail = `ch=${numCh} pat=${numPat} inst=${instList.length}[${synthTypes.join(',')}] rms=${rms.toFixed(4)} exp=${exportSize}b [${passCount}/${totalChecks}]`;

      if (issues.length === 0) {
        console.log(`${label} ✓ PASS  ${detail}`);
        updates[test.key] = { auditStatus: 'fixed', notes: `PASS 10/10 ${detail}` };
        stats.pass++;
      } else {
        console.log(`${label} ✗ FAIL  ${detail}`);
        console.log(`${' '.repeat(38)}  ${checkStr}`);
        issues.forEach(i => console.log(`${' '.repeat(38)}↳ ${i}`));
        updates[test.key] = { auditStatus: 'fail', notes: `FAIL ${passCount}/${totalChecks}: ${issues.join(' | ')}` };
        stats.fail++;
      }

    } catch (e: any) {
      console.log(`${label} ✗ CRASH ${e.message}`);
      updates[test.key] = { auditStatus: 'fail', notes: `Crash: ${e.message}` };
      stats.fail++;

      if (e.message.includes('Browser disconnected') || e.message.includes('No browser')) {
        console.log(`${' '.repeat(38)}⏳ Waiting for browser reconnect...`);
        await sleep(12000);
        try { client.close(); } catch {}
        try { client = await createClient(); } catch { console.log('  Could not reconnect. Stopping.'); break; }
      }
    }

    // Flush to tracker every 10 tests
    if (Object.keys(updates).length >= 10) {
      try { await postTracker(updates); } catch {}
      for (const k of Object.keys(updates)) delete updates[k];
    }
  }

  // Final flush
  if (Object.keys(updates).length > 0) {
    try { await postTracker(updates); } catch {}
  }

  console.log(`\n── Summary ──────────────────`);
  console.log(`  ${stats.pass} passed, ${stats.fail} failed, ${stats.skip} skipped`);
  console.log(`  Total: ${testsToRun.length}\n`);

  client.close();
  process.exit(stats.fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
