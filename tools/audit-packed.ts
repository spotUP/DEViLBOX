import { WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';

const WS_URL = 'ws://localhost:4003/mcp';
const TRACKER_URL = 'http://localhost:4444';
const REF_MUSIC = '/Users/spot/Code/Reference Music/Packed_Etc';

function mcpCall(ws: WebSocket, tool: string, args: Record<string, any>, timeout = 30000): Promise<any> {
  const id = String(Date.now() + Math.random());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout:' + tool)), timeout);
    const handler = (raw: any) => {
      const resp = JSON.parse(raw.toString());
      if (resp.id === id) {
        clearTimeout(timer);
        ws.off('message', handler);
        if (resp.type === 'error') { reject(new Error(resp.error)); return; }
        resolve(resp.data);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'call', method: tool, params: args }));
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function pushUpdates(data: Record<string, any>): Promise<string> {
  const body = JSON.stringify(data);
  return new Promise((resolve) => {
    const req = http.request(TRACKER_URL + '/push-updates', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.write(body); req.end();
  });
}

interface FormatEntry {
  key: string;
  file: string;
}

const formats: FormatEntry[] = [
  { key: 'packed-abk',              file: 'ABK/rubber 2.abk' },
  { key: 'packed-channelplayers',   file: 'channel players/Moby/Fury of the Furries/chan.castle' },
  { key: 'packed-ksm',             file: 'kefrens sound machine/music.ksm' },
  { key: 'packed-modpluginpacked',  file: 'Modpluginpacked/Sublunar/sense of wonder.xm' },
  { key: 'packed-newtronpacker',    file: 'NewtronPacker/newtron\'s music-box6 maxmix.pp' },
  { key: 'packed-noisepacker2',     file: 'Noisepacker 2/Firefox/Full Contact/menu.np2' },
  { key: 'packed-np3',             file: 'NP3/judgeintro.np3' },
  { key: 'packed-ntp1',            file: 'NTP1/newtron\'s music-box6 maxmix.ntp1' },
  { key: 'packed-p22a',            file: 'P22A/1h later.p22a' },
  { key: 'packed-p30a',            file: 'P30A/drifters - metro ii.p30a' },
  { key: 'packed-p41a',            file: 'P41A/primal rage - ingame 19.p41a' },
  { key: 'packed-p4x',             file: 'P4X/Allister Brimble/Zeewolf 2/mission briefing.p4x' },
  { key: 'packed-p60',             file: 'P60/Denes Nagy/Wendetta 2175/plotb.p60' },
  { key: 'packed-p60a',            file: 'P60a/born dead2 b.p60a' },
  { key: 'packed-p61a',            file: 'P61A/gudule.p61a' },
  { key: 'packed-p6x',             file: 'P6X/Risto Vuori/Stardust/p6x.ship_fly_by' },
  { key: 'packed-pha',             file: 'PHA/Barry Leitch/Frankenstein/pha.frankensteinewscore' },
  { key: 'packed-pp10',            file: 'PP10/mc4i.pp10' },
  { key: 'packed-pp21',            file: 'PP21/meetro.pp21' },
  { key: 'packed-pp30',            file: 'PP30/minor after minor.pp30' },
  { key: 'packed-ppk',             file: 'PPK/got to be funky.ppk' },
  { key: 'packed-pr20',            file: 'PR20/closs.pr20' },
  { key: 'packed-pr40',            file: 'PR40/smp.intro.smp' },
  { key: 'packed-promizer',        file: 'promizer/pm20/pm20.eny-poly' },
  { key: 'packed-propacker',       file: 'propacker/pp30/pp30.eurochart-16' },
  { key: 'packed-prorunner2',      file: 'Prorunner2/infect main tune.pru2' },
  { key: 'packed-pru1',            file: 'PRU1/pru1.russiantheme' },
  { key: 'packed-sgt',             file: 'SGT/low voltage.sgt' },
  { key: 'packed-skytpacker',      file: 'skyt packer/skt.prosit3' },
  { key: 'packed-skyt',            file: 'SKYT/drifters - latex intro.skyt' },
  { key: 'packed-startrekkerpkr',  file: 'startrekkerpacker/of-alieni vol.1.mod' },
  { key: 'packed-player40a',       file: 'The Player 4.0a/gift of gods.p40a' },
  { key: 'packed-tp1',             file: 'Tracker Packer 1/mexx-plasma.tp1' },
  { key: 'packed-tp3',             file: 'Tracker Packer 3/out of space2.tp3' },
  { key: 'packed-unictracker',     file: 'unic tracker/unic.mk.eagleplayerintro' },
  { key: 'packed-unic',            file: 'UNIC/african dreams.unic' },
  { key: 'packed-unic2',           file: 'UNIC2/by the coast was do.unic2' },
  { key: 'packed-zen',             file: 'ZEN/dif-prty.zen' },
];

async function main() {
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  console.log('Connected to MCP');

  try {
    await mcpCall(ws, 'get_song_info', {}, 15000);
    console.log('Browser connected OK');
    await mcpCall(ws, 'set_master_volume', { volume: 0.8 }, 5000).catch(() => {});
    console.log('');
  } catch {
    console.log('ERROR: Browser not connected. Reload browser and retry.');
    ws.close();
    process.exit(1);
  }

  const updates: Record<string, any> = {};
  let passed = 0, failed = 0;

  for (const fmt of formats) {
    const { key, file } = fmt;
    const fullPath = path.join(REF_MUSIC, file);

    process.stdout.write('[' + key + '] ');

    if (!fs.existsSync(fullPath)) {
      console.log('✗ FILE NOT FOUND: ' + file);
      updates[key] = { auditStatus: 'fail', notes: 'File not found' };
      failed++;
      continue;
    }

    try {
      await mcpCall(ws, 'clear_console_errors', {}, 5000).catch(() => {});
      await mcpCall(ws, 'stop', {}, 5000).catch(() => {});
      await sleep(1000);

      const fileData = fs.readFileSync(fullPath);
      const base64 = fileData.toString('base64');
      const filename = path.basename(fullPath);
      await mcpCall(ws, 'load_file', { filename, data: base64 }, 30000);
      await sleep(500);
      await mcpCall(ws, 'play', {}, 5000);
      await sleep(3500);

      const audio = await mcpCall(ws, 'get_audio_level', {}, 5000) as any;
      const rms = typeof audio === 'object' ? (audio.rmsAvg ?? audio.rms ?? 0) : 0;
      const silent = typeof audio === 'object' ? (audio.silent === true || rms < 0.0001) : true;

      const info = await mcpCall(ws, 'get_song_info', {}, 5000) as any;
      const ch = info?.numChannels ?? 0;
      const pat = info?.numPatterns ?? 0;

      const instList = await mcpCall(ws, 'get_instruments_list', {}, 5000) as any;
      const inst = Array.isArray(instList) ? instList.length : 0;

      const errors = await mcpCall(ws, 'get_console_errors', {}, 5000) as any;
      const errEntries = Array.isArray(errors?.entries) ? errors.entries : [];
      const realErrors = errEntries.filter((e: any) => {
        const msg = String(e.message || '');
        if (msg.includes('disposeAllInstruments')) return false;
        if (msg.includes('loadInstruments called')) return false;
        if (msg.includes('[InstrumentStore]') && !msg.includes('Error')) return false;
        if (msg.includes('setPatternOrder called')) return false;
        if (msg.includes('[ToneEngine]') && !msg.includes('Error')) return false;
        if (msg.includes('CIA unreliable')) return false;
        if (msg.includes('Instrument') && msg.includes('not found')) return false;
        return true;
      });
      const errCount = realErrors.length;

      await mcpCall(ws, 'stop', {}, 5000).catch(() => {});

      const status = !silent && errCount === 0 ? 'fixed' : silent ? 'silent' : 'fail';
      const notes = 'ch=' + ch + ' pat=' + pat + ' inst=' + inst + ' rms=' + rms.toFixed(4) + (errCount ? ' errors=' + errCount : '') + (silent ? ' SILENT' : '');
      const sym = status === 'fixed' ? '✓' : '✗';
      console.log(sym + ' ' + status + ': ' + notes);
      if (errCount > 0) {
        for (const e of realErrors.slice(0, 2)) {
          console.log('  err: ' + String(e.message || '').slice(0, 120));
        }
      }
      if (status === 'fixed') passed++; else failed++;

      updates[key] = { auditStatus: status, notes };
    } catch (e: any) {
      console.log('✗ ERROR: ' + e.message);
      updates[key] = { auditStatus: 'fail', notes: 'Error: ' + e.message };
      failed++;
    }
  }

  if (Object.keys(updates).length > 0) {
    await pushUpdates(updates);
    console.log('\nResults pushed to tracker.');
  }

  console.log('\n── Summary ──');
  console.log('  ' + passed + ' passed, ' + failed + ' failed out of ' + formats.length);

  ws.close();
}
main();
