#!/usr/bin/env node
/**
 * test-tunefish-direct.mjs
 * Direct Puppeteer test for Tunefish WASM synth
 */

import puppeteer from 'puppeteer';

const html = `
<!DOCTYPE html>
<html>
<head><title>Tunefish WASM Test</title></head>
<body>
<script>
(async () => {
  const log = (msg) => console.log(msg);
  try {
    log('Loading WASM and JS...');
    const [wasmRes, jsRes] = await Promise.all([
      fetch('/tunefish/TunefishSynth.wasm'),
      fetch('/tunefish/TunefishSynth.js')
    ]);
    const wasmBinary = await wasmRes.arrayBuffer();
    const jsCode = await jsRes.text();
    log('WASM: ' + wasmBinary.byteLength + ' bytes, JS: ' + jsCode.length + ' chars');
    
    // Create factory from JS code
    const factory = new Function(jsCode + '\\nreturn createTunefishSynth;')();
    log('Factory created: ' + typeof factory);
    
    // Instantiate module
    const Module = await factory({ wasmBinary });
    log('Module instantiated');
    
    // Wrap functions
    const tunefish_create = Module.cwrap('tunefish_create', 'number', ['number']);
    const tunefish_set_param = Module.cwrap('tunefish_set_param', null, ['number', 'number', 'number']);
    const tunefish_note_on = Module.cwrap('tunefish_note_on', null, ['number', 'number', 'number']);
    const tunefish_note_off = Module.cwrap('tunefish_note_off', null, ['number', 'number']);
    const tunefish_render = Module.cwrap('tunefish_render', null, ['number', 'number', 'number', 'number']);
    
    log('Functions wrapped');
    
    // Create synth instance
    const synth = tunefish_create(44100);
    log('Synth created, ptr: ' + synth);
    
    // Allocate render buffers
    const FRAMES = 128;
    const outputPtrL = Module._malloc(FRAMES * 4);
    const outputPtrR = Module._malloc(FRAMES * 4);
    log('Render buffers allocated');
    
    // Trigger a note
    tunefish_note_on(synth, 60, 100); // C4, velocity 100
    log('Note on: C4, vel=100');
    
    // Render some frames
    let maxSample = 0;
    let nonZeroSamples = 0;
    const heapF32 = Module.HEAPF32;
    const offsetL = outputPtrL / 4;
    
    for (let block = 0; block < 344; block++) { // ~1 second at 44100Hz
      tunefish_render(synth, outputPtrL, outputPtrR, FRAMES);
      for (let i = 0; i < FRAMES; i++) {
        const sample = Math.abs(heapF32[offsetL + i]);
        if (sample > maxSample) maxSample = sample;
        if (sample > 0.0001) nonZeroSamples++;
      }
    }
    
    log('Rendered 44032 frames');
    log('Max sample: ' + maxSample.toFixed(6) + ' (non-zero: ' + nonZeroSamples + ')');
    
    // Note off
    tunefish_note_off(synth, 60);
    log('Note off');
    
    // Cleanup
    Module._free(outputPtrL);
    Module._free(outputPtrR);
    log('DONE!');
    
  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
  }
})();
</script>
</body>
</html>
`;

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[log]:', msg.text()));
  page.on('pageerror', err => console.error('[error]:', err.message));
  
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = req.url();
    if (url.includes('test-page')) {
      req.respond({ status: 200, contentType: 'text/html', body: html });
    } else if (url.includes('/tunefish/')) {
      try {
        const res = await fetch('http://localhost:5173' + new URL(url).pathname);
        const buffer = await res.arrayBuffer();
        req.respond({
          status: 200,
          contentType: url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
          body: Buffer.from(buffer)
        });
      } catch (err) {
        console.error('Failed to fetch:', url, err.message);
        req.abort();
      }
    } else {
      req.continue();
    }
  });
  
  await page.goto('http://localhost:5173/test-page');
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
}

main().catch(console.error);
