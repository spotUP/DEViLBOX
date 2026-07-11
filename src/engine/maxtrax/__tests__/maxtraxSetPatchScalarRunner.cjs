// Plain-Node runner for the MaxTrax Tier-1 scalar-setter regression test.
//
// Proves maxtrax_set_patch_scalar writes Tune/Volume directly into the in-memory
// _patch struct and maxtrax_get_patch_scalar reads them back. A no-op setter
// (revert) leaves the values unchanged and the test fails.
//
// Usage: node maxtraxSetPatchScalarRunner.cjs <Maxtrax.js> <Maxtrax.wasm> <song>

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

  {
    const ptr = mod._malloc(song.length);
    mod.HEAPU8.set(song, ptr);
    mod._maxtrax_load(ptr, song.length, 0);
    mod._free(ptr);
  }

  // Find a patch slot that actually holds a sample (volume > 0).
  let pn = -1;
  for (let n = 0; n < 64; n++) {
    if (mod._maxtrax_get_patch_scalar(n, 1) > 0) { pn = n; break; }
  }

  const V0 = mod._maxtrax_get_patch_scalar(pn, 1); // volume
  const T0 = mod._maxtrax_get_patch_scalar(pn, 0); // tune (signed)

  const newVol  = V0 === 40 ? 41 : 40;
  const newTune = (T0 + 7) | 0;
  const setVol  = mod._maxtrax_set_patch_scalar(pn, 1, newVol);
  const setTune = mod._maxtrax_set_patch_scalar(pn, 0, newTune);

  const V1 = mod._maxtrax_get_patch_scalar(pn, 1);
  const T1 = mod._maxtrax_get_patch_scalar(pn, 0);

  process.stdout.write(JSON.stringify({ pn, V0, V1, T0, T1, newVol, newTune, setVol, setTune }));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
