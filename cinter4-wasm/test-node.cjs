// Node CJS harness: run the actual Cinter4 WASM (32-bit address space, no browser)
// and inspect init-time synthesis + per-channel DMA + render RMS.
//
//   node test-node.cjs
//
// Portable: resolves the built player relative to this file, and copies the
// Emscripten glue to an OS-temp .cjs so it loads as CommonJS even when the
// surrounding project is "type":"module".
const { readFileSync, copyFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const os = require('node:os');
const { existsSync } = require('node:fs');

// Find public/cinter4 whether this script sits in cinter4-wasm/ (../public)
// or at an archive root (./public).
function findDir() {
  for (const rel of ['../public/cinter4', './public/cinter4', 'public/cinter4']) {
    const d = join(__dirname, rel);
    if (existsSync(join(d, 'Cinter4.js'))) return d;
  }
  throw new Error('Cannot locate public/cinter4/Cinter4.js relative to ' + __dirname);
}
const cinterDir = findDir();
const songPath = (() => {
  for (const rel of ['../public/test-automatic.cinter4', './public/test-automatic.cinter4', './test-automatic.cinter4']) {
    const p = join(__dirname, rel);
    if (existsSync(p)) return p;
  }
  throw new Error('Cannot locate a .cinter4 test song');
})();

// Load the glue as CJS via a temp copy (avoids ESM interpretation under type:module).
const tmpGlue = join(os.tmpdir(), `cinter4_harness_${process.pid}.cjs`);
copyFileSync(join(cinterDir, 'Cinter4.js'), tmpGlue);
const createCinter4 = require(tmpGlue);

(async () => {
  const Module = await createCinter4({ locateFile: (p) => join(cinterDir, p) });

  const song = readFileSync(songPath);
  console.log('song bytes:', song.length);

  const SR = 48000;
  Module._player_init(SR);

  const ptr = Module._malloc(song.length);
  Module.HEAPU8.set(song, ptr);
  console.log('player_load ->', Module._player_load(ptr, song.length));
  console.log('[debug]', Module.UTF8ToString(Module._player_get_debug()));

  // Poll c_dma (via the debug string) each chunk to see which channel bits fire.
  const dmaSeen = new Set();
  const dbgDmaRe = /dma\(BE\)=0x([0-9a-f]{4})/;

  const SECONDS = 8;
  const FRAMES = 1024;
  const buf = Module._malloc(FRAMES * 2 * 4);
  let peak = 0, sumSq = 0, n = 0;
  const totalChunks = Math.ceil((SR * SECONDS) / FRAMES);
  for (let c = 0; c < totalChunks; c++) {
    Module._player_render(buf, FRAMES);
    const f32 = new Float32Array(Module.HEAPF32.buffer, buf, FRAMES * 2);
    for (let i = 0; i < f32.length; i++) {
      const v = f32[i]; const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v; n++;
    }
    const m = dbgDmaRe.exec(Module.UTF8ToString(Module._player_get_debug()));
    if (m) { const bits = parseInt(m[1], 16); if (bits) dmaSeen.add(bits); }
  }
  const chans = new Set();
  for (const b of dmaSeen) for (let ch = 0; ch < 4; ch++) if (b & (1 << ch)) chans.add(ch);
  console.log(`dma masks seen: [${[...dmaSeen].map(x => '0x' + x.toString(16)).join(', ')}] → channels active: [${[...chans].sort().join(',')}]`);
  console.log(`render(${SECONDS}s): peak=${peak.toFixed(5)} rms=${Math.sqrt(sumSq / n).toFixed(6)} (n=${n})`);
})();
