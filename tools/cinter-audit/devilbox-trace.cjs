// devilbox-trace.cjs — DEViLBOX side of the song-level lock-test (task C).
//
// Loads the DEViLBOX Cinter4 WASM (the transpiled cinter4.c) and emits the same
// per-tick Paula trace as moira-reference.cjs (period/volume/sample-offset/DMACON
// per channel). Diff the two with songlevel-parity.cjs to validate the transpile's
// sequencer (CinterPlay1/2) against the real Cinter4.S.
//
//   node tools/cinter-audit/devilbox-trace.cjs <song.cinter4> [ticks] [--json]
//
// player_load runs CinterInit and primes tick 0, so: load → read tick 0 →
// player_tick → read tick 1 → ...  Sample offsets are relative to the instrument
// space base, identical layout to the reference (same CinterInit), so they compare
// directly with no instrument-index mapping.

const fs = require('fs');
const path = require('path');
const os = require('os');

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [songPath, ticksArg] = positional;
const asJson = process.argv.includes('--json');
const TICKS = ticksArg ? parseInt(ticksArg, 10) : 200;
if (!songPath) { console.error('usage: devilbox-trace.cjs <song.cinter4> [ticks] [--json]'); process.exit(2); }

const cinterDir = path.join(__dirname, '..', '..', 'public', 'cinter4');

(async () => {
  // Load the Emscripten glue as CJS via a temp copy (project is type:module).
  const tmpGlue = path.join(os.tmpdir(), `cinter4_trace_${process.pid}.cjs`);
  fs.copyFileSync(path.join(cinterDir, 'Cinter4.js'), tmpGlue);
  const createCinter4 = require(tmpGlue);
  const Module = await createCinter4({ locateFile: (p) => path.join(cinterDir, p) });

  const song = fs.readFileSync(songPath);
  Module._player_init(48000);
  const ptr = Module._malloc(song.length);
  Module.HEAPU8.set(song, ptr);
  if (Module._player_load(ptr, song.length) !== 1) { console.error('player_load failed'); process.exit(1); }
  Module._free(ptr);

  const readTick = (t) => {
    const ch = [];
    for (let c = 0; c < 4; c++) {
      ch.push({
        period: Module._player_paula_period(c),
        volume: Module._player_paula_volume(c),
        len: Module._player_paula_len(c),
        sampleOff: (Module._player_paula_sample_off(c) >>> 0),
      });
    }
    return { tick: t, dmacon: Module._player_dmacon() & 0xffff, ch };
  };

  const rows = [readTick(0)]; // player_load primed tick 0
  for (let t = 1; t < TICKS; t++) { Module._player_tick(); rows.push(readTick(t)); }

  fs.unlinkSync(tmpGlue);

  if (asJson) { console.log(JSON.stringify({ song: path.basename(songPath), rows })); return; }
  console.log(`# DEViLBOX cinter4.c — ${path.basename(songPath)} — ${rows.length} ticks`);
  for (const r of rows) {
    let line = `T${String(r.tick).padStart(4)} dmacon=0x${(r.dmacon >>> 0).toString(16).padStart(4, '0')}`;
    for (let c = 0; c < 4; c++) line += `  c${c}[per=${r.ch[c].period} vol=${r.ch[c].volume} off=${r.ch[c].sampleOff | 0}]`;
    console.log(line);
  }
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
