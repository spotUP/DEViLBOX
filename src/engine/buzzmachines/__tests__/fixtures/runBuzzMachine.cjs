// Runs ONE Buzz machine through the real Buzzmachine.worklet.js with the AudioWorklet's
// microtask setTimeout polyfill: init, 200 blocks with no input, 200 with a 440 Hz sine.
// Prints one JSON line. Run in a child process: a machine that hangs must not hang the runner.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../..');
const [type, file] = process.argv.slice(2);
Object.defineProperty(process, 'versions', { value: {}, configurable: true });
const realSetTimeout = setTimeout;
let Processor; const posted = [];
const scope = {
  AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (m) => posted.push(m), onmessage: null }; } },
  registerProcessor: (_n, c) => { Processor = c; }, sampleRate: 48000, currentTime: 0, URL: undefined,
  setTimeout: undefined, clearTimeout: undefined,
};
// Make the worklet see no setTimeout so it installs its polyfill (as in a real AudioWorkletGlobalScope).
delete globalThis.setTimeout; delete globalThis.clearTimeout;
new Function(...Object.keys(scope), fs.readFileSync(path.join(ROOT, 'public/Buzzmachine.worklet.js'), 'utf8'))(...Object.values(scope));
const p = new Processor();
p.port.onmessage({ data: { type: 'init', wasmBinary: fs.readFileSync(path.join(ROOT, `public/buzzmachines/${file}.wasm`)).buffer, jsCode: fs.readFileSync(path.join(ROOT, `public/buzzmachines/${file}.js`), 'utf8'), machineType: type, paramLayout: JSON.parse(process.env.BUZZ_LAYOUT || '[]') } });
// Then run process() for 200 blocks with no input (as a disposed node would), and with input.
realSetTimeout(() => {
  const out = [[new Float32Array(128), new Float32Array(128)]];
  const t0 = Date.now();
  const mode = process.argv[4] || 'both';
  if (mode === 'note') {
    // A generator: play a note (as the synth does) and render.
    p.port.onmessage({ data: { type: 'noteOn', note: 60, velocity: 127, frequency: 261.63 } });
    let sum = 0, count = 0, peak = 0, clipped = 0, finite = true;
    const rec = new Float32Array(300 * 128);
    for (let i = 0; i < 300; i++) {
      p.process([[]], out, {});
      rec.set(out[0][0], i * 128);
      for (const v of out[0][0]) if (!Number.isFinite(v)) finite = false;
      for (const v of out[0][0]) { sum += v * v; count++; peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) >= 0.999) clipped++; }
      if (i === 0) console.log('STEP note block 0 done');
    }
    // Fundamental by autocorrelation over 60..2000 Hz, on 0.1 s early in the note.
    const seg = rec.subarray(2048, 2048 + 4800);
    let bestLag = 0, best = -Infinity;
    for (let lag = Math.floor(48000 / 2000); lag <= Math.floor(48000 / 60); lag++) {
      let c = 0;
      for (let i = 0; i + lag < seg.length; i++) c += seg[i] * seg[i + lag];
      if (c > best) { best = c; bestLag = lag; }
    }
    console.log(JSON.stringify({ type, msgs: posted.map((m) => m.type + (m.error ? ':' + m.error : '')), outRms: Math.sqrt(sum / count), peak, clippedFraction: clipped / count, finite, f0: bestLag ? 48000 / bestLag : 0 }));
    process.exit(0);
  }
  if (mode === 'dispose') {
    // A removed node: the worklet frees the machine and its processor stops.
    p.port.onmessage({ data: { type: 'dispose' } });
    const keepsRunning = p.process([[]], out, {});
    console.log(JSON.stringify({ type, msgs: posted.map((m) => m.type), keepsRunning }));
    process.exit(0);
  }
  if (mode !== 'input') for (let i = 0; i < 200; i++) { p.process([[]], out, {}); if (i === 0) console.log('STEP no-input block 0 done'); }
  if (mode !== 'noinput') {
    const sine = new Float32Array(128);
    for (let i = 0; i < 200; i++) { for (let k = 0; k < 128; k++) sine[k] = 0.3 * Math.sin(2 * Math.PI * 440 * (i * 128 + k) / 48000); p.process([[sine, sine]], out, {}); if (i === 0) console.log('STEP input block 0 done'); }
  }
  console.log(JSON.stringify({ type, msgs: posted.map((m) => m.type + (m.error ? ':' + m.error : '')), processMs: Date.now() - t0, outRms: Math.sqrt(out[0][0].reduce((s, v) => s + v * v, 0) / 128) }));
  process.exit(0);
}, 500);
