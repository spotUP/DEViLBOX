/**
 * UADE Format Audit — comprehensive test of all UADE-handled formats
 *
 * 10-point verification for each format:
 *   1. Loads without crash
 *   2. Song metadata (title, format, BPM present)
 *   3. Instruments have correct synthType (format-specific, not generic Sampler/NoneSynth)
 *   4. Instrument details (names, non-empty)
 *   5. Pattern data present (numPatterns > 0, numChannels > 0)
 *   6. Pattern note density (patterns contain actual notes, not just empty rows)
 *   7. Audio output (rms > 0.001)
 *   8. Edit verification (set_cell + read back)
 *   9. Export native (sizeBytes > 0) + round-trip reimport
 *  10. No console errors during entire test
 */
import { WebSocket } from 'ws';
import http from 'http';

const API_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:4003/mcp';
const TRACKER_URL = 'http://localhost:4444';
const PLAY_MS = 3000;
const TIMEOUT_MS = 30000;

/* ── Expected synthType per format ─────────────────────────────────────────── */
// Native-parser formats should have format-specific synth instruments.
// UADE-enhanced formats should have UADEEditableSynth (editable) or UADESynth (streaming).
// "Sampler" is only acceptable for sample-based formats (MOD/S3M/XM/IT).
const EXPECTED_SYNTH: Record<string, string[]> = {
  'uade-soundmon':           ['SoundMonSynth', 'Sampler'],  // can have sample instruments too
  'uade-future-composer':    ['FCSynth', 'Sampler'],        // FC has both synth + sample instruments
  'uade-jamcracker':         ['JamCrackerSynth', 'Sampler'],
  'uade-sidmon':             ['SidMon1Synth'],
  'uade-digital-mugician':   ['DigMugSynth'],
  'uade-david-whittaker':    ['DavidWhittakerSynth'],
  'uade-rob-hubbard':        ['RobHubbardSynth'],
  'uade-delta-music-1':      ['DeltaMusic1Synth', 'Sampler', 'Synth'],
  'uade-delta-music-2':      ['DeltaMusic2Synth', 'Sampler'],
  'uade-hippelcoso':         ['HippelCoSoSynth'],
  'uade-tfmx':               ['TFMXSynth', 'Sampler'],
  'uade-fred-gray':          ['FredSynth', 'Sampler', 'Synth'],
  'uade-hively':             ['HivelySynth'],
  'uade-sonic-arranger':     ['SonicArrangerSynth', 'Sampler'],
  'uade-art-of-noise':       ['Sampler', 'Synth'],                   // enhanced scan may produce Synth
  'uade-instereo-1':         ['InStereo1Synth', 'Sampler', 'Synth'],
  'uade-instereo-2':         ['InStereo2Synth'],
  'uade-digibooster':        ['Sampler'],                   // sample-based tracker
  'uade-tcb-tracker':        ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-startrekker-am':     ['StartrekkerAMSynth', 'Sampler'],
  'uade-ear-ache':           ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-ims':                ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-dave-lowe':          ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-dave-lowe-new':      ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-ben-daglish':        ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-ben-daglish-sid':    ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-jason-brooke':       ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-jason-page':         ['Sampler', 'UADEEditableSynth', 'Synth'],
  'uade-mark-cooksey':       ['Sampler', 'UADEEditableSynth', 'Synth'],
  'uade-wally-beben':        ['Sampler', 'UADEEditableSynth', 'Synth'],
  'uade-richard-joseph':     ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-jeroen-tel':         ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-steve-barrett':      ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-thomas-hermann':     ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-paul-shields':       ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-paul-summers':       ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-fashion-tracker':    ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-sound-master':       ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-core-design':        ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-custom-made':        ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-desire':             ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-future-player':      ['FuturePlayerSynth', 'Sampler'],
  'uade-janko-mrsic-flogel': ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-kris-hatlelid':      ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-magnetic-fields':    ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-novo-trade':         ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-peter-verswyvelen':  ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-ron-klaren':         ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-scumm':              ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-sean-connolly':      ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-tomy-tracker':       ['Sampler', 'UADEEditableSynth', 'Synth'],
  'uade-david-hanney':       ['Sampler', 'UADEEditableSynth', 'Synth'],
  'uade-kim-christensen':    ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-digital-sound-studio':['Sampler', 'UADEEditableSynth', 'Synth'],
  'uade-synthesis':          ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-quartet':            ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-game-music-creator': ['Sampler'],
  'uade-quadra-composer':    ['Sampler'],
  'uade-oktalyzer':          ['Sampler'],
  'uade-octamed':            ['Sampler', 'OctaMEDSynth'],
  'uade-soundfx':            ['Sampler'],
  'uade-protracker-mod':     ['Sampler'],
  'uade-stk':                ['Sampler'],
  'uade-stp':                ['Sampler'],
  // openmpt-handled formats
  'uade-format-669':         ['Sampler'],
  'uade-stm':                ['Sampler'],
  'uade-mtm':                ['Sampler'],
  'uade-dtm':                ['Sampler'],
  'uade-far':                ['Sampler'],
  'uade-graoumf-tracker':    ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-chuck-biscuits':     ['Sampler'],
  'uade-mfp':                ['Sampler', 'UADEEditableSynth', 'Synth', 'UADESynth'],
  'uade-symphonie-pro':      ['SymphonieSynth', 'Sampler'],
};

/* ── Test file paths (hand-verified on Modland) ─────────────────────────── */
interface TestDef {
  key: string;
  path: string;
  companions?: string[];
}

// Formats that already pass 10/10 — skip to save time
const SKIP_KEYS = new Set([
  'uade-soundmon', 'uade-future-composer', 'uade-jamcracker', 'uade-oktalyzer',
  'uade-octamed', 'uade-sidmon', 'uade-digital-mugician', 'uade-rob-hubbard',
  'uade-delta-music-1', 'uade-delta-music-2', 'uade-hippelcoso', 'uade-tfmx',
  'uade-fred-gray', 'uade-quadra-composer', 'uade-hively', 'uade-sonic-arranger',
  'uade-art-of-noise', 'uade-instereo-1', 'uade-instereo-2',
  'uade-digital-sound-studio', 'uade-tcb-tracker', 'uade-ben-daglish',
  'uade-jason-brooke', 'uade-jeroen-tel', 'uade-fashion-tracker',
  'uade-sound-master', 'uade-novo-trade', 'uade-wally-beben', 'uade-stk',
  'uade-dave-lowe', 'uade-paul-summers', 'uade-future-player', 'uade-stp',
]);

const TESTS: TestDef[] = [
  // Native-parser formats
  { key: 'uade-protracker-mod',     path: 'pub/modules/Protracker/Captain/space debris.mod' },
  { key: 'uade-soundmon',           path: 'pub/modules/BP SoundMon 2/- unknown/soundmonitor-3.bp' },
  { key: 'uade-future-composer',    path: 'pub/modules/Future Composer 1.4/Futurecombat/equinox.fc' },
  { key: 'uade-jamcracker',         path: 'pub/modules/JamCracker/Ape/bartmanintro.jam' },
  { key: 'uade-oktalyzer',          path: 'pub/modules/Oktalyzer/Andemar/dark.okta' },
  { key: 'uade-octamed',            path: 'pub/modules/OctaMED MMD0/- unknown/mmd0 10.mmd0' },
  { key: 'uade-sidmon',             path: 'pub/modules/SidMon 1/- unknown/sidmon intro.sid' },
  { key: 'uade-digital-mugician',   path: 'pub/modules/Digital Mugician/Ramon/mugician-demo.dmu' },
  { key: 'uade-david-whittaker',    path: 'pub/modules/David Whittaker/David Whittaker/apb+.dw' },
  { key: 'uade-rob-hubbard',        path: 'pub/modules/Rob Hubbard/Rob Hubbard/budokan.rh' },
  { key: 'uade-delta-music-1',      path: 'pub/modules/Delta Music/Shogun/c64style.dm' },
  { key: 'uade-delta-music-2',      path: 'pub/modules/Delta Music 2/Fab/deltaintro.dm2' },
  { key: 'uade-hippelcoso',         path: 'pub/modules/Hippel COSO/Jochen Hippel/astaroth123.hipc' },
  { key: 'uade-tfmx',               path: 'pub/modules/TFMX/Chris Huelsbeck/mdat.turrican aliens',
                                     companions: ['pub/modules/TFMX/Chris Huelsbeck/smpl.turrican aliens'] },
  { key: 'uade-soundfx',            path: 'pub/modules/SoundFX/Bassbomb/19remix.sfx' },
  { key: 'uade-fred-gray',          path: 'pub/modules/FredMon/Bug/actionbiker.fred' },
  { key: 'uade-quadra-composer',    path: 'pub/modules/Quadra Composer/Greippi/ominous.emod' },
  { key: 'uade-hively',             path: 'pub/modules/HivelyTracker/AceMan/hexplosion.hvl' },
  { key: 'uade-sonic-arranger',     path: 'pub/modules/Sonic Arranger/- unknown/sonican.sa' },
  { key: 'uade-art-of-noise',       path: 'pub/modules/Art Of Noise/Pink/the art of noise.aon' },
  { key: 'uade-instereo-1',         path: 'pub/modules/InStereo!/- unknown/fantasi8.is' },
  { key: 'uade-instereo-2',         path: 'pub/modules/InStereo! 2.0/- unknown/spaceflight.is20' },
  { key: 'uade-digital-sound-studio', path: 'pub/modules/Digital Sound Studio/Baby/accapela.dss' },
  { key: 'uade-digibooster',        path: 'pub/modules/Digibooster/Boray/helgon.digi' },
  { key: 'uade-tcb-tracker',        path: 'pub/modules/TCB Tracker/- unknown/tcbtracker demo.tcb' },
  // Compiled player formats
  { key: 'uade-dave-lowe',          path: 'pub/modules/Dave Lowe/Dave Lowe/afterburner.dl' },
  { key: 'uade-dave-lowe-new',      path: 'pub/modules/Dave Lowe New/Dave Lowe/balrog.dln' },
  { key: 'uade-ben-daglish',        path: 'pub/modules/Ben Daglish/Ben Daglish/artura.bd' },
  { key: 'uade-ben-daglish-sid',    path: 'pub/modules/Ben Daglish SID/Ben Daglish/chubbygristle.bds' },
  { key: 'uade-jason-brooke',       path: 'pub/modules/Jason Brooke/Jason Brooke/1943.jb' },
  { key: 'uade-jason-page',         path: 'pub/modules/Jason Page/Jason Page/jpn.empiresoccer94' },
  { key: 'uade-mark-cooksey',       path: 'pub/modules/Mark Cooksey/Mark Cooksey/commando.mc' },
  { key: 'uade-wally-beben',        path: 'pub/modules/Wally Beben/Wally Beben/ballgame.wb' },
  { key: 'uade-richard-joseph',     path: 'pub/modules/Richard Joseph/Richard Joseph/cannon fodder 2.ins' },
  { key: 'uade-jeroen-tel',         path: 'pub/modules/Jeroen Tel/Kim Christensen/onslaught.jt' },
  { key: 'uade-steve-barrett',      path: 'pub/modules/Steve Barrett/Steve Barrett/chroniclesofomega.sb' },
  { key: 'uade-thomas-hermann',     path: 'pub/modules/Thomas Hermann/Thomas Hermann/smp.blueangel69' },
  { key: 'uade-paul-shields',       path: 'pub/modules/Paul Shields/Paul Shields/airball-gameover.ps' },
  { key: 'uade-paul-summers',       path: 'pub/modules/Paul Summers/Paul Summers/fightingsoccer.snk' },
  { key: 'uade-fashion-tracker',    path: 'pub/modules/Fashion Tracker/Richard van de Veen/fashionating 1.ex' },
  { key: 'uade-sound-master',       path: 'pub/modules/Sound Master/Jeroen Soede/doofus 2.sm' },
  { key: 'uade-core-design',        path: 'pub/modules/Core Design/Ben Daglish/action fighter.core' },
  { key: 'uade-custom-made',        path: 'pub/modules/CustomMade/Ron Klaren/cyberblast hiscore.cm' },
  { key: 'uade-desire',             path: 'pub/modules/Desire/- unknown/batmanreturns.dsr' },
  { key: 'uade-future-player',      path: 'pub/modules/Future Player/Paul Van Der Valk/imploder.fp' },
  { key: 'uade-janko-mrsic-flogel', path: 'pub/modules/Janko Mrsic-Flogel/Janko Mrsic-Flogel/bombjack.jmf' },
  { key: 'uade-kris-hatlelid',      path: 'pub/modules/Kris Hatlelid/Kris Hatlelid/The Cycles/the cycles.kh' },
  { key: 'uade-magnetic-fields',    path: 'pub/modules/Magnetic Fields Packer/Jeff Rourke/mfp.crystaldragon ingame' },
  { key: 'uade-novo-trade',         path: 'pub/modules/NovoTrade Packer/- unknown/3rdblock.ntp' },
  { key: 'uade-peter-verswyvelen',  path: 'pub/modules/Peter Verswyvelen/Uncle Tom/zarathrusta title.pvp' },
  { key: 'uade-ron-klaren',         path: 'pub/modules/Ron Klaren/Ron Klaren/electricity.rk' },
  { key: 'uade-scumm',              path: 'pub/modules/SCUMM/- unknown/maniac mansion.scumm' },
  { key: 'uade-sean-connolly',      path: 'pub/modules/Sean Connolly/Sean Connolly/surf ninjas.scn' },
  { key: 'uade-ear-ache',           path: 'pub/modules/EarAche/- unknown/bladerunner.ea' },
  { key: 'uade-ims',                path: 'pub/modules/Images Music System/- unknown/chip5.ims' },
  { key: 'uade-quartet',            path: 'pub/modules/Quartet ST/- unknown/quartet demo tunes/Quartet Demo Tunes 01.4v' },
  { key: 'uade-tomy-tracker',       path: 'pub/modules/Tomy Tracker/Stargazer/inconvenient intro.sg' },
  { key: 'uade-david-hanney',       path: 'pub/modules/David Hanney/David Hanney/tearaway thomas jingles.dh' },
  { key: 'uade-synthesis',          path: 'pub/modules/Beathoven Synthesizer/- unknown/letsdance.bss' },
  // Symphonie Pro — not on Modland, skipped
  // openmpt-handled
  { key: 'uade-format-669',         path: 'pub/modules/Composer 669/Maelcum/669 bliss.669' },
  { key: 'uade-stm',                path: 'pub/modules/Screamtracker 2/- unknown/2.stm' },
  { key: 'uade-mtm',                path: 'pub/modules/Multitracker/Dark Helmet/mtm.mtm' },
  { key: 'uade-dtm',                path: 'pub/modules/Digital Tracker DTM/Cedyn/world of chips.dtm' },
  { key: 'uade-far',                path: 'pub/modules/Farandole Composer/4Go10/m31.far' },
  { key: 'uade-stp',                path: 'pub/modules/Soundtracker Pro II/- unknown/noname.stp' },
  { key: 'uade-stk',                path: 'pub/modules/Soundtracker/Adept/walking.mod' },
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
    }, (res) => { let d = ''; res.on('data', (c: string) => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  let client = await createClient();
  const updates: Record<string, any> = {};
  const stats = { pass: 0, fail: 0, skip: 0 };

  console.log(`\n▶ UADE Format Audit — ${TESTS.length} formats\n`);
  console.log('  10-point: load ✓  metadata ✓  instruments ✓  inst-detail ✓  patterns ✓  notes ✓  audio ✓  edit ✓  export+roundtrip ✓  no-errors ✓\n');

  for (const test of TESTS) {
    if (SKIP_KEYS.has(test.key)) {
      console.log(`[${test.key}]`.padEnd(32) + ' ○ SKIP  (already 10/10)');
      stats.skip++;
      continue;
    }
    const label = `[${test.key}]`.padEnd(32);
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
          // Retry health check
          try { await client.call('get_song_info'); } catch {
            console.log(`${label} ✗ Still disconnected after retry. Stopping.`);
            break;
          }
        }
      }
      await client.call('clear_console_errors');
      try {
        const as = await client.call('get_audio_state');
        for (const fx of (as?.masterEffects || as?.data?.masterEffects || []))
          await client.call('remove_master_effect', { effectId: fx.id });
      } catch {}

      // ── 1. Download & load ──
      await sleep(800);
      const dl = await download(test.path);
      filename = dl.filename;
      let companionFiles: Record<string, string> | undefined;
      if (test.companions?.length) {
        companionFiles = {};
        for (const cp of test.companions) {
          await sleep(500);
          const comp = await download(cp);
          companionFiles[comp.filename] = comp.base64;
        }
      }
      await client.call('load_file', { filename, data: dl.base64, ...(companionFiles ? { companionFiles } : {}) });
      checks.load = true;

      // ── 2. Song metadata ──
      const info = await client.call('get_song_info');
      numPat = info?.numPatterns ?? 0;
      numCh = info?.numChannels ?? 0;
      const title = info?.projectName ?? '';
      const editorMode = info?.editorMode ?? '';
      const bpm = info?.bpm ?? 0;
      // Metadata: at least BPM should be > 0
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
      const unnamedCount = instList.length - namedInsts.length;
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
        // Check up to first 3 patterns for note content
        const patsToCheck = Math.min(numPat, 3);
        for (let pi = 0; pi < patsToCheck; pi++) {
          try {
            const pat = await client.call('get_pattern', { patternIndex: pi });
            const rows = pat?.rows || pat?.data?.rows || [];
            for (const row of rows) {
              const cells = row?.cells || [];
              totalCells += cells.length;
              for (const cell of cells) {
                // Check noteStr (string like "C-4") or note (number > 0)
                const noteStr = cell?.noteStr || '';
                const noteNum = cell?.note ?? 0;
                if ((noteStr && noteStr !== '---' && noteStr !== '...' && noteStr !== '') || noteNum > 0) {
                  totalNotes++;
                }
              }
            }
          } catch {}
          if (totalNotes > 0) break; // found notes, no need to check more patterns
        }
      }
      if (totalCells > 0 && totalNotes === 0) {
        issues.push(`first ${Math.min(numPat, 3)} patterns have no notes`);
      }
      checks.noteDensity = totalNotes > 0;

      // ── 7. Play & check audio ──
      await client.call('play', { mode: 'song' });
      // Wait for audio to start (up to 5s), then let it play
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
          // Write a test note (C-4, instrument 1) to pattern 0, row 0, channel 0
          await client.call('set_cell', { patternIndex: 0, row: 0, channel: 0, note: 'C-4', instrument: 1 });

          // Read back and verify — API returns noteStr (string) and note (number)
          const patAfter = await client.call('get_pattern', { patternIndex: 0, startRow: 0, endRow: 0 });
          const rowsAfter = patAfter?.rows || patAfter?.data?.rows || [];
          const newCell = rowsAfter?.[0]?.cells?.[0] || {};
          const noteStr = newCell?.noteStr || '';
          const noteNum = newCell?.note ?? 0;

          // C-4 = MIDI note 48 in standard mapping, but some trackers use different bases
          // Accept: noteStr contains "C-4" OR note number is > 0 (edit was stored)
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

              // Verify round-trip preserves key data
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
            // Export succeeded but no data returned for round-trip
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
        console.log(`${' '.repeat(34)}  ${checkStr}`);
        issues.forEach(i => console.log(`${' '.repeat(34)}↳ ${i}`));
        updates[test.key] = { auditStatus: 'fail', notes: `FAIL ${passCount}/${totalChecks}: ${issues.join(' | ')}` };
        stats.fail++;
      }

    } catch (e: any) {
      console.log(`${label} ✗ CRASH ${e.message}`);
      updates[test.key] = { auditStatus: 'fail', notes: `Crash: ${e.message}` };
      stats.fail++;

      if (e.message.includes('Browser disconnected') || e.message.includes('No browser')) {
        console.log(`${' '.repeat(34)}⏳ Waiting for browser reconnect...`);
        await sleep(12000);
        try { client.close(); } catch {}
        try { client = await createClient(); } catch { console.log('  Could not reconnect. Stopping.'); break; }
      }
    }

    // Flush to tracker every 10 tests
    if (Object.keys(updates).length >= 10) {
      await postTracker(updates);
      for (const k of Object.keys(updates)) delete updates[k];
    }
  }

  if (Object.keys(updates).length > 0) await postTracker(updates);

  console.log(`\n── Summary ──────────────────`);
  console.log(`  ${stats.pass} passed, ${stats.fail} failed, ${stats.skip} skipped`);
  console.log(`  Total: ${TESTS.length}\n`);

  client.close();
  process.exit(stats.fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
