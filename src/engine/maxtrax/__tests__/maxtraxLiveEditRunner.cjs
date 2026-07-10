// Plain-Node runner for the MaxTrax live-edit test (Task 6).
//
// Mirrors maxtraxCommandStreamRunner.cjs: loads the emscripten CJS factory via
// Function() eval (same trick the AudioWorklet uses), then exercises the new
// live-edit WASM API: maxtrax_get_event_count, maxtrax_set_event, maxtrax_recook.
//
// Sequence:
//   1. Load song → render 3s → record baselineWrites (CMD_WRITE count).
//   2. Reload song (fresh state), then mute note events via maxtrax_set_event,
//      then maxtrax_recook → render 3s → record editedWrites.
//   3. Print JSON { baselineWrites, editedWrites, setResult } to stdout.
//
// Usage: node maxtraxLiveEditRunner.cjs <Maxtrax.js> <Maxtrax.wasm> <song>

'use strict';

const fs   = require('fs');
const path = require('path');

async function main() {
  let [jsPath, wasmPath, songPath] = process.argv.slice(2);
  jsPath   = path.resolve(jsPath);
  wasmPath = path.resolve(wasmPath);
  songPath = path.resolve(songPath);

  // Eval the emscripten UMD bundle as CommonJS (same as AudioWorklet + existing runner).
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
  const mod = await createMaxtrax({ wasmBinary, print() {}, printErr() {} });

  const song = new Uint8Array(fs.readFileSync(songPath));

  // Helper: load song into WASM, run for `seconds` seconds, return CMD_WRITE count.
  function loadAndRender(seconds) {
    const ptr = mod._malloc(song.length);
    mod.HEAPU8.set(song, ptr);
    mod._maxtrax_load(ptr, song.length, 0);
    mod._free(ptr);

    const sampleRate  = mod._maxtrax_get_sample_rate();
    const totalFrames = Math.floor(seconds * sampleRate);
    const CHUNK       = 512;
    const bufPtr      = mod._malloc(CHUNK * 2 * 4);
    let done = 0;
    while (done < totalFrames) {
      const chunk = Math.min(CHUNK, totalFrames - done);
      const rendered = mod._maxtrax_render(bufPtr, chunk);
      if (rendered <= 0) break;
      done += rendered;
    }
    mod._free(bufPtr);
    return mod._maxtrax_get_cmd_count(0); // CMD_WRITE
  }

  // --- Phase 1: baseline ---
  const baselineWrites = loadAndRender(3);

  // --- Phase 2: reload, mute note events, recook, render ---
  {
    const ptr = mod._malloc(song.length);
    mod.HEAPU8.set(song, ptr);
    mod._maxtrax_load(ptr, song.length, 0);
    mod._free(ptr);
  }

  const eventCount = mod._maxtrax_get_event_count(0);
  let setResult = -1;

  // Change note events (command 0x00-0x7F) to command 0x90.
  // Command 0x90 is unrecognized by MusicServer's dispatch chain
  // (not TEMPO/END/BEND/CONTROL/PROGRAM/SPECIAL) so it falls through
  // to MusicServer_L_l70 without calling NoteOn → no CMD_WRITE.
  // We keep startTime/stopTime as 0 (timing of 0x90 no-ops doesn't matter).
  // We stop before the last event (COMMAND_END = 0xFF) so the player can still
  // detect end-of-score and not run off the end of the buffer.
  const safeCount = Math.max(0, eventCount - 1);
  let mutedCount  = 0;
  let idx         = 0;
  while (idx < safeCount) {
    const r = mod._maxtrax_set_event(0, idx, 0x90, 0, 0, 0);
    if (r === 0) {
      if (setResult !== 0) setResult = r; // record first success
      mutedCount++;
    }
    idx++;
  }

  mod._maxtrax_recook(0);

  // Render 3s after recook — muted notes produce no CMD_WRITE.
  const sampleRate  = mod._maxtrax_get_sample_rate();
  const totalFrames = Math.floor(3 * sampleRate);
  const CHUNK       = 512;
  const bufPtr      = mod._malloc(CHUNK * 2 * 4);
  let done          = 0;
  while (done < totalFrames) {
    const chunk = Math.min(CHUNK, totalFrames - done);
    const rendered = mod._maxtrax_render(bufPtr, chunk);
    if (rendered <= 0) break;
    done += rendered;
  }
  mod._free(bufPtr);
  const editedWrites = mod._maxtrax_get_cmd_count(0);

  process.stdout.write(JSON.stringify({ baselineWrites, editedWrites, setResult, mutedCount }));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
