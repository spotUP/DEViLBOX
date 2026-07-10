// Plain-Node runner for the MaxTrax command-stream lockstep test.
//
// Loaded in a child `node` process (NOT through vitest's module transform,
// which mangles the emscripten CJS factory). Renders the song through the
// production WASM and prints the audio.device command histogram as JSON.
//
// Usage: node maxtraxCommandStreamRunner.cjs <Maxtrax.js> <Maxtrax.wasm> <song> <seconds>

const fs = require('fs');
const path = require('path');

async function main() {
  let [jsPath, wasmPath, songPath, secondsArg] = process.argv.slice(2);
  jsPath = path.resolve(jsPath);
  wasmPath = path.resolve(wasmPath);
  songPath = path.resolve(songPath);
  const seconds = Number(secondsArg);

  // Maxtrax.js is an emscripten UMD bundle, but the repo's package.json sets
  // "type":"module", so a bare require() loads it as ESM and skips the CJS
  // export block (returns {}). Eval the source as CommonJS instead — the same
  // trick the AudioWorklet uses — providing real module/exports/require so the
  // factory's own node paths resolve.
  const src = fs.readFileSync(jsPath, 'utf8');
  const factoryModule = { exports: {} };
  const factoryFn = new Function(
    'module',
    'exports',
    'require',
    '__dirname',
    '__filename',
    src + '\nreturn typeof createMaxtrax !== "undefined" ? createMaxtrax : module.exports;',
  );
  const createMaxtrax = factoryFn(
    factoryModule,
    factoryModule.exports,
    require,
    path.dirname(jsPath),
    jsPath,
  );
  if (typeof createMaxtrax !== 'function') {
    throw new Error('createMaxtrax factory not resolved from ' + jsPath);
  }

  const wasmBinary = fs.readFileSync(wasmPath);
  const mod = await createMaxtrax({ wasmBinary, print() {}, printErr() {} });

  const song = new Uint8Array(fs.readFileSync(songPath));
  const songPtr = mod._malloc(song.length);
  mod.HEAPU8.set(song, songPtr);
  const loadResult = mod._maxtrax_load(songPtr, song.length, 0);
  mod._free(songPtr);

  const sampleRate = mod._maxtrax_get_sample_rate();
  const totalFrames = Math.floor(seconds * sampleRate);
  const CHUNK = 512;
  const bufPtr = mod._malloc(CHUNK * 2 * 4);

  let done = 0;
  while (done < totalFrames) {
    const chunk = Math.min(CHUNK, totalFrames - done);
    const rendered = mod._maxtrax_render(bufPtr, chunk);
    if (rendered <= 0) break;
    done += rendered;
  }
  mod._free(bufPtr);

  const result = {
    loadResult,
    sampleRate,
    framesRendered: done,
    write: mod._maxtrax_get_cmd_count(0),
    flush: mod._maxtrax_get_cmd_count(1),
    pervol: mod._maxtrax_get_cmd_count(2),
    other: mod._maxtrax_get_cmd_count(3),
    seedPoolDepth: mod._maxtrax_get_seed_pool_depth(),
  };
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
