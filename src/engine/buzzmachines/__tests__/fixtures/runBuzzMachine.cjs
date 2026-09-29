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
  if (mode === 'pink') {
    // Level: centre pink noise high-passed at 20 Hz, -18 dBFS RMS, 4 s; the
    // gain over the second half, overall and at 63 Hz (two band-pass
    // biquads, Q 1.4, in series).
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed / 2 ** 32) * 2 - 1; };
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    const biquad = (b, a) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; return (x) => { const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; };
    const hpK = Math.tan(Math.PI * 20 / 48000), q = Math.SQRT1_2, hn = 1 / (1 + hpK / q + hpK * hpK);
    const hp = () => biquad([hn, -2 * hn, hn], [2 * (hpK * hpK - 1) * hn, (1 - hpK / q + hpK * hpK) * hn]);
    const bp = (f) => { const w = 2 * Math.PI * f / 48000, al = Math.sin(w) / 2.8, a0 = 1 + al; return biquad([al / a0, 0, -al / a0], [-2 * Math.cos(w) / a0, (1 - al) / a0]); };
    const [h1, h2] = [hp(), hp()];
    const [iA, iB, oA, oB] = [bp(63), bp(63), bp(63), bp(63)];
    const pink = () => {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; return h2(h1(o * 0.1));
    };
    const blocks = Math.floor(4 * 48000 / 128);
    let inSq = 0, outSq = 0, in63 = 0, out63 = 0;
    const x = new Float32Array(128);
    for (let i = 0; i < blocks; i++) {
      for (let k = 0; k < 128; k++) x[k] = pink();
      p.process([[x, x]], out, {});
      if (i < blocks / 2) { for (let k = 0; k < 128; k++) { iB(iA(x[k])); oB(oA(out[0][0][k])); } continue; }
      for (let k = 0; k < 128; k++) {
        inSq += x[k] * x[k]; outSq += out[0][0][k] * out[0][0][k];
        const a = iB(iA(x[k])), b = oB(oA(out[0][0][k])); in63 += a * a; out63 += b * b;
      }
    }
    console.log(JSON.stringify({ type, inDb: 10 * Math.log10(inSq / (blocks / 2 * 128)), gainDb: 10 * Math.log10(outSq / inSq), gain63Db: 10 * Math.log10(out63 / in63) }));
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
