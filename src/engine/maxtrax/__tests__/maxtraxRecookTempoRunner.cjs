// Plain-Node runner for the MaxTrax recook-robustness regression test.
//
// Proves maxtrax_recook re-derives glob_TickUnit from the score base tempo.
// A mid-song TEMPO event (CMD 0x80) mutates glob_TickUnit; if recook rewinds
// the read cursor past that event WITHOUT resetting the tick unit, playback
// keeps running at the stale tempo until the event is hit again. recook must
// restore the base-tempo tick unit (SetTempo(glob_Tempo << 4)).
//
// Sequence:
//   1. Load song → T0 = base-tempo glob_TickUnit (fresh SelectScore state).
//   2. set_event(0) → a TEMPO event (cmd 0x80) with data=60 (base is 120),
//      stopTime=0 so the tempo change applies unconditionally.
//   3. recook (rewind cursor to index 0) → render a short slice so the tempo
//      event at index 0 processes → T1 = mutated glob_TickUnit. Assert T1 != T0.
//   4. recook again → T2 = glob_TickUnit. A correct recook restores base tempo,
//      so T2 == T0. (Revert the SetTempo lines in recook and T2 stays == T1.)
//   5. Print JSON { T0, T1, T2 } to stdout.
//
// Usage: node maxtraxRecookTempoRunner.cjs <Maxtrax.js> <Maxtrax.wasm> <song>

'use strict';

const fs   = require('fs');
const path = require('path');

async function main() {
  let [jsPath, wasmPath, songPath] = process.argv.slice(2);
  jsPath   = path.resolve(jsPath);
  wasmPath = path.resolve(wasmPath);
  songPath = path.resolve(songPath);

  const src = fs.readFileSync(jsPath, 'utf8');
  const factoryModule = { exports: {} };
  const factoryFn = new Function(
    'module', 'exports', 'require', '__dirname', '__filename',
    src + '\nreturn typeof createMaxtrax !== "undefined" ? createMaxtrax : module.exports;',
  );
  const createMaxtrax = factoryFn(
    factoryModule, factoryModule.exports, require,
    path.dirname(jsPath), jsPath,
  );
  if (typeof createMaxtrax !== 'function') {
    throw new Error('createMaxtrax factory not resolved from ' + jsPath);
  }

  const wasmBinary = fs.readFileSync(wasmPath);
  const mod  = await createMaxtrax({ wasmBinary, print() {}, printErr() {} });
  const song = new Uint8Array(fs.readFileSync(songPath));

  // Load song fresh.
  {
    const ptr = mod._malloc(song.length);
    mod.HEAPU8.set(song, ptr);
    mod._maxtrax_load(ptr, song.length, 0);
    mod._free(ptr);
  }

  const T0 = mod._maxtrax_get_tick_unit() >>> 0;

  // Inject a TEMPO event (COMMAND_TEMPO = 128 = 0x80) at index 0.
  // data=60 differs from the base tempo 120; stopTime=0 → applies unconditionally.
  const setResult = mod._maxtrax_set_event(0, 0, 0x80, 60, 0, 0);

  // Render helper: run `seconds` of audio so the MusicServer processes events.
  function render(seconds) {
    const sr    = mod._maxtrax_get_sample_rate();
    const total = Math.floor(seconds * sr);
    const CHUNK = 512;
    const buf   = mod._malloc(CHUNK * 2 * 4);
    let done = 0;
    while (done < total) {
      const chunk = Math.min(CHUNK, total - done);
      const r = mod._maxtrax_render(buf, chunk);
      if (r <= 0) break;
      done += r;
    }
    mod._free(buf);
  }

  // recook rewinds cursor to index 0; render a short slice so the tempo event fires.
  mod._maxtrax_recook(0);
  render(0.2);
  const T1 = mod._maxtrax_get_tick_unit() >>> 0;

  // recook again: must re-derive base-tempo tick unit regardless of the mutation.
  mod._maxtrax_recook(0);
  const T2 = mod._maxtrax_get_tick_unit() >>> 0;

  process.stdout.write(JSON.stringify({ T0, T1, T2, setResult }));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
