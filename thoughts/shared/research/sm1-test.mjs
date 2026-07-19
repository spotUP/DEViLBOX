#!/usr/bin/env node
// Test SidMon1 WASM directly: load a .sid file, render some audio, report stats.
import fs from 'fs';
import path from 'path';

const wasmDir = '/Users/spot/Code/DEViLBOX/public/sidmon1';

// The Emscripten glue uses dynamic import of 'fs' when ENVIRONMENT_IS_NODE.
// We need to mimic a Node worker environment — strip the `_scriptName = globalThis.document?.currentScript?.src`
// check since `globalThis.document` is undefined in node.
process.chdir(wasmDir);

let jsCode = fs.readFileSync('SidMon1Replayer.js', 'utf8');
const wasmBin = fs.readFileSync('SidMon1Replayer.wasm');

// Apply the default transform so HEAPU8/HEAPF32 get exposed on Module (same as the worklet's loader).
jsCode = jsCode
  .replace(/import\.meta\.url/g, "'.'")
  .replace(/export\s+default\s+\w+;?/g, '')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
  .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');

// The glue uses CommonJS fallback at the end: `module.exports = createSidMon1Replayer`.
// We evaluate and grab it.
// eslint-disable-next-line no-new-func
const factoryWrapper = new Function('module', 'exports', 'require', '__dirname', '__filename', jsCode + '\nreturn (typeof createSidMon1Replayer !== "undefined") ? createSidMon1Replayer : module.exports;');
const moduleObj = { exports: {} };
const createSidMon1Replayer = factoryWrapper(moduleObj, moduleObj.exports, (await import('module')).createRequire(import.meta.url), wasmDir, wasmDir + '/SidMon1Replayer.js');

console.log('Factory loaded, initializing WASM...');
const mod = await createSidMon1Replayer({ wasmBinary: wasmBin.buffer.slice(wasmBin.byteOffset, wasmBin.byteOffset + wasmBin.byteLength) });
console.log('WASM ready. Exports:', Object.keys(mod).filter(k => k.startsWith('_player_')).sort());

const testFiles = [
  '/Users/spot/Code/DEViLBOX/public/data/songs/sidmon-1/myfunnymazea.sid',
  '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Orpheus__defjam.sid',
  '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Daryl__newsontour.sid',
];

const SR = 44100;
mod._player_set_sample_rate(SR);

for (const f of testFiles) {
  const name = path.basename(f);
  const data = fs.readFileSync(f);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Testing: ${name} (${data.length} bytes)`);

  // Copy file into WASM heap
  const ptr = mod._malloc(data.length);
  mod.HEAPU8.set(data, ptr);
  const loadOk = mod._player_load(ptr, data.length);
  mod._free(ptr);
  console.log(`  player_load → ${loadOk}`);

  if (!loadOk) {
    console.log('  [SKIP] load failed');
    continue;
  }

  // Render 5s in 0.5s chunks, watching channel levels + finished state over time
  const chunkFrames = SR / 2;
  const bufPtr = mod._malloc(chunkFrames * 2 * 4);
  const levelsPtr = mod._malloc(16);  // 4 floats
  let totalPeak = 0, totalNonZero = 0;
  for (let t = 0; t < 10; t++) {
    const rendered = mod._player_render(bufPtr, chunkFrames);
    const buf = new Float32Array(mod.HEAPF32.buffer, bufPtr, chunkFrames * 2);
    let peak = 0, nonZero = 0;
    for (let i = 0; i < chunkFrames * 2; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
      if (a > 0.0001) nonZero++;
    }
    mod._player_get_channel_levels(levelsPtr);
    const levels = new Float32Array(mod.HEAPF32.buffer, levelsPtr, 4);
    const finished = mod._player_is_finished();
    totalPeak = Math.max(totalPeak, peak);
    totalNonZero += nonZero;
    console.log(`  t=${(t * 0.5).toFixed(1)}s  peak=${peak.toFixed(4)}  nonZero=${nonZero}  chLvls=[${[...levels].map(v => v.toFixed(3)).join(',')}]  finished=${finished}  rendered=${rendered}`);
  }
  console.log(`  totalPeak=${totalPeak.toFixed(4)}  totalNonZero=${totalNonZero}`);

  const numInst = mod._player_get_num_instruments();
  console.log(`  num_instruments = ${numInst}`);

  // Dump instrument 0 ADSR params for comparison.
  // Param IDs from SM1R_PARAM_*: 0=attackSpeed, 1=attackMax, 2=decaySpeed, 3=decayMin, 4=sustain, 5=releaseSpeed, 6=releaseMin, 7=phaseShift, 8=phaseSpeed, 9=finetune, 10=pitchFall, 11=waveform
  const paramNames = ['attackSpeed','attackMax','decaySpeed','decayMin','sustain','releaseSpeed','releaseMin','phaseShift','phaseSpeed','finetune','pitchFall','waveform'];
  const inst0 = paramNames.map((n, id) => `${n}=${mod._player_get_instrument_param(0, id)}`).join(' ');
  console.log(`  instrument[0]: ${inst0}`);

  // Try manual note_on (bypass the song sequencer) to see if the ENGINE can make noise at all.
  mod._player_note_on(0, 24, 127);  // instrument 0, note 24
  const noteBuf = mod._malloc(chunkFrames * 2 * 4);
  mod._player_render(noteBuf, chunkFrames);
  const nb = new Float32Array(mod.HEAPF32.buffer, noteBuf, chunkFrames * 2);
  let notePeak = 0;
  for (let i = 0; i < chunkFrames * 2; i++) if (Math.abs(nb[i]) > notePeak) notePeak = Math.abs(nb[i]);
  console.log(`  note_on(inst=0,note=24) → render peak=${notePeak.toFixed(4)}`);
  mod._free(noteBuf);
  mod._player_note_off();

  mod._free(bufPtr);
  mod._free(levelsPtr);

  // Reset state between files (player_load already does paula_reset + sm1r_init)
}

console.log('\nDone.');
