#!/usr/bin/env node
/**
 * test-wavesabre-direct.mjs
 * Direct Puppeteer test for WaveSabre WASM synth
 */

import puppeteer from 'puppeteer';

const html = `
<!DOCTYPE html>
<html>
<head><title>WaveSabre WASM Test</title></head>
<body>
<script>
(async () => {
  const log = (msg) => console.log(msg);
  try {
    log('Loading WASM and JS...');
    const [wasmRes, jsRes] = await Promise.all([
      fetch('/wavesabre/WaveSabreSynth.wasm'),
      fetch('/wavesabre/WaveSabreSynth.js')
    ]);
    const wasmBinary = await wasmRes.arrayBuffer();
    const jsCode = await jsRes.text();
    log('WASM: ' + wasmBinary.byteLength + ' bytes, JS: ' + jsCode.length + ' chars');
    
    // Create factory from JS code
    const factory = new Function(jsCode + '\\nreturn createWaveSabreSynth;')();
    log('Factory created: ' + typeof factory);
    
    // Instantiate module
    const Module = await factory({ wasmBinary });
    log('Module instantiated, exports: ' + Object.keys(Module).slice(0, 10).join(', '));
    
    // Wrap functions
    const wavesabre_set_sample_rate = Module.cwrap('wavesabre_set_sample_rate', null, ['number']);
    const wavesabre_create_slaughter = Module.cwrap('wavesabre_create_slaughter', 'number', []);
    const wavesabre_create_falcon = Module.cwrap('wavesabre_create_falcon', 'number', []);
    const wavesabre_set_param = Module.cwrap('wavesabre_set_param', null, ['number', 'number', 'number']);
    const wavesabre_get_param = Module.cwrap('wavesabre_get_param', 'number', ['number', 'number']);
    const wavesabre_note_on = Module.cwrap('wavesabre_note_on', null, ['number', 'number', 'number', 'number']);
    const wavesabre_note_off = Module.cwrap('wavesabre_note_off', null, ['number', 'number']);
    const wavesabre_render = Module.cwrap('wavesabre_render', null, ['number', 'number', 'number', 'number']);
    
    log('Functions wrapped');
    
    // Set sample rate
    wavesabre_set_sample_rate(44100);
    log('Sample rate set to 44100');
    
    // Create Falcon synth (simpler than Slaughter)
    const synth = wavesabre_create_falcon();
    log('Falcon synth created, ptr: ' + synth);
    
    // Check initial params
    const osc1Vol = wavesabre_get_param(synth, 2);
    const osc2Vol = wavesabre_get_param(synth, 7);
    const masterVol = wavesabre_get_param(synth, 28);
    log('Initial params: Osc1Vol=' + osc1Vol.toFixed(3) + ' Osc2Vol=' + osc2Vol.toFixed(3) + ' Master=' + masterVol.toFixed(3));
    
    // Set some basic params to ensure sound
    wavesabre_set_param(synth, 2, 0.8);  // Osc1 volume
    wavesabre_set_param(synth, 28, 0.8); // Master volume
    
    // Allocate render buffers
    const FRAMES = 128;
    const outputPtrL = Module._malloc(FRAMES * 4);
    const outputPtrR = Module._malloc(FRAMES * 4);
    log('Render buffers allocated: L=' + outputPtrL + ' R=' + outputPtrR);
    
    // Trigger a note
    wavesabre_note_on(synth, 60, 100, 0); // C4, velocity 100
    log('Note on: C4, vel=100');
    
    // Render some frames
    let totalSamples = 0;
    let maxSample = 0;
    const heapF32 = Module.HEAPF32;
    const offsetL = outputPtrL / 4;
    
    for (let block = 0; block < 344; block++) { // ~1 second at 44100Hz
      wavesabre_render(synth, outputPtrL, outputPtrR, FRAMES);
      for (let i = 0; i < FRAMES; i++) {
        const sample = Math.abs(heapF32[offsetL + i]);
        if (sample > maxSample) maxSample = sample;
        if (sample > 0.0001) totalSamples++;
      }
    }
    
    log('Rendered 44032 frames');
    log('Max sample: ' + maxSample.toFixed(6) + ' (non-zero samples: ' + totalSamples + ')');
    
    // Note off
    wavesabre_note_off(synth, 60);
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
  
  // Serve test page
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = req.url();
    if (url.includes('test-page')) {
      req.respond({ status: 200, contentType: 'text/html', body: html });
    } else if (url.includes('/wavesabre/')) {
      // Fetch from dev server
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
  
  // Wait for completion
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
}

main().catch(console.error);
