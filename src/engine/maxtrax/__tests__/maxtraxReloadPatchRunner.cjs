// Plain-Node runner for the MaxTrax Tier-2 full-patch-rebuild regression test.
//
// Proves maxtrax_reload_patch tears down and re-allocates one patch's in-memory
// buffers (env arrays + per-octave sample chain) from a tailRaw sample byte
// slice, and that the rebuilt patch renders. Uses a self-contained synthetic
// slice (does not depend on the song's exact sample bytes) so the assertions are
// exact. Reverting reload_patch to `return -1` makes r != 0 and the test fails.
//
// Usage: node maxtraxReloadPatchRunner.cjs <Maxtrax.js> <Maxtrax.wasm> <song>

'use strict';

const fs   = require('fs');
const path = require('path');

function buildDsample(pn) {
  // 20-byte header + (2+1)*4 env + 16 PCM = 48 bytes, big-endian.
  const oct = 1, attackLen = 8, sustainLen = 8, ac = 2, rc = 1;
  const firstLen = attackLen + sustainLen;          // 16
  const pcmTotal = firstLen * (Math.pow(2, oct) - 1); // 16
  const total = 20 + (ac + rc) * 4 + pcmTotal;       // 48
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, pn);          // number
  dv.setInt16(2, 0);            // tune
  dv.setUint16(4, 48);          // volume
  dv.setUint16(6, oct);         // octaves
  dv.setUint32(8, attackLen);   // attackLen
  dv.setUint32(12, sustainLen); // sustainLen
  dv.setUint16(16, ac);         // attackCount
  dv.setUint16(18, rc);         // releaseCount
  let p = 20;
  // attack pt0, pt1
  dv.setUint16(p, 100); dv.setUint16(p + 2, 64); p += 4;
  dv.setUint16(p, 50);  dv.setUint16(p + 2, 32); p += 4;
  // release pt0
  dv.setUint16(p, 80);  dv.setUint16(p + 2, 0);  p += 4;
  // PCM ramp
  for (let i = 0; i < pcmTotal; i++) buf[p + i] = (i * 8) & 0xff;
  return buf;
}

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

  let pn = -1;
  for (let n = 0; n < 64; n++) {
    if (mod._maxtrax_get_patch_scalar(n, 1) > 0) { pn = n; break; }
  }

  const bytes = buildDsample(pn);
  const ptr = mod._malloc(bytes.length);
  mod.HEAPU8.set(bytes, ptr);
  const r = mod._maxtrax_reload_patch(pn, ptr, bytes.length);
  mod._free(ptr);

  const vol = mod._maxtrax_get_patch_scalar(pn, 1);
  const a0d = mod._maxtrax_get_patch_env(pn, 0, 0, 0); // attack pt0 duration
  const a0v = mod._maxtrax_get_patch_env(pn, 0, 0, 1); // attack pt0 volume
  const r0v = mod._maxtrax_get_patch_env(pn, 1, 0, 1); // release pt0 volume

  // Render a slice and count nonzero samples — proves the rebuilt chain is valid.
  let nz = 0;
  {
    const CHUNK = 512;
    const total = Math.floor(0.1 * mod._maxtrax_get_sample_rate());
    const buf = mod._malloc(CHUNK * 2 * 4);
    let done = 0;
    while (done < total) {
      const chunk = Math.min(CHUNK, total - done);
      const got = mod._maxtrax_render(buf, chunk);
      if (got <= 0) break;
      const f32 = new Float32Array(mod.HEAPF32.buffer, buf, got * 2);
      for (let i = 0; i < f32.length; i++) if (f32[i] !== 0) nz++;
      done += got;
    }
    mod._free(buf);
  }

  process.stdout.write(JSON.stringify({ pn, r, vol, a0d, a0v, r0v, nz }));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
