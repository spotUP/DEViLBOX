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
p.port.onmessage({ data: { type: 'init', wasmBinary: fs.readFileSync(path.join(ROOT, `public/buzzmachines/${file}.wasm`)).buffer, jsCode: fs.readFileSync(path.join(ROOT, `public/buzzmachines/${file}.js`), 'utf8'), machineType: type, paramLayout: [] } });
// Then run process() for 200 blocks with no input (as a disposed node would), and with input.
realSetTimeout(() => {
  const out = [[new Float32Array(128), new Float32Array(128)]];
  const t0 = Date.now();
  const mode = process.argv[4] || 'both';
  if (mode !== 'input') for (let i = 0; i < 200; i++) { p.process([[]], out, {}); if (i === 0) console.log('STEP no-input block 0 done'); }
  if (mode !== 'noinput') {
    const sine = new Float32Array(128);
    for (let i = 0; i < 200; i++) { for (let k = 0; k < 128; k++) sine[k] = 0.3 * Math.sin(2 * Math.PI * 440 * (i * 128 + k) / 48000); p.process([[sine, sine]], out, {}); if (i === 0) console.log('STEP input block 0 done'); }
  }
  console.log(JSON.stringify({ type, msgs: posted.map((m) => m.type + (m.error ? ':' + m.error : '')), processMs: Date.now() - t0, outRms: Math.sqrt(out[0][0].reduce((s, v) => s + v * v, 0) / 128) }));
  process.exit(0);
}, 500);
