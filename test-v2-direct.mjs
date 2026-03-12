/**
 * Direct V2 Synth WASM test via Puppeteer
 * Tests that V2 produces audio output
 */
import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const browser = await puppeteer.launch({ 
  headless: true,
  args: ['--no-sandbox']
});
const page = await browser.newPage();

// Intercept requests to serve local files
await page.setRequestInterception(true);
page.on('request', async (request) => {
  const url = request.url();
  if (url.includes('v2.html')) {
    // Serve inline test HTML
    request.respond({
      status: 200,
      contentType: 'text/html',
      body: `<!DOCTYPE html><html><body></body></html>`
    });
  } else if (url.includes('V2Synth.wasm')) {
    const wasmPath = '/Users/spot/Code/DEViLBOX/public/v2/V2Synth.wasm';
    request.respond({
      status: 200,
      contentType: 'application/wasm',
      body: readFileSync(wasmPath)
    });
  } else if (url.includes('V2Synth.js')) {
    const jsPath = '/Users/spot/Code/DEViLBOX/public/v2/V2Synth.js';
    request.respond({
      status: 200,
      contentType: 'application/javascript',
      body: readFileSync(jsPath, 'utf8')
    });
  } else {
    request.continue();
  }
});

page.on('console', msg => console.log('[log]:', msg.text()));

await page.goto('http://localhost:5173/v2.html');

const result = await page.evaluate(async () => {
  const log = (msg) => console.log(msg);
  
  try {
    log('Loading WASM and JS...');
    
    const [wasmResp, jsResp] = await Promise.all([
      fetch('/V2Synth.wasm'),
      fetch('/V2Synth.js')
    ]);
    
    const wasmBinary = await wasmResp.arrayBuffer();
    const jsCode = await jsResp.text();
    
    log(`WASM: ${wasmBinary.byteLength} bytes, JS: ${jsCode.length} chars`);
    
    // V2Synth exports a factory function called createV2Synth
    // Execute the JS to get the factory
    const factoryFn = new Function(jsCode + '; return createV2Synth;')();
    
    log(`Factory created: ${typeof factoryFn}`);
    
    // Instantiate module
    const module = await factoryFn({
      wasmBinary: new Uint8Array(wasmBinary),
      print: (text) => log('[V2] ' + text),
      printErr: (text) => log('[V2 ERR] ' + text)
    });
    
    log('Module instantiated, exports: ' + Object.keys(module).filter(k => k.startsWith('_v2') || k === 'cwrap' || k === '_malloc').join(', '));
    
    // Wrap functions - V2 uses v2synth_ prefix and manages global synth
    const v2synth_init = module.cwrap('v2synth_init', 'number', ['number']);
    const v2synth_render = module.cwrap('v2synth_render', null, ['number', 'number']);
    const v2synth_note_on = module.cwrap('v2synth_note_on', null, ['number', 'number', 'number']);
    const v2synth_note_off = module.cwrap('v2synth_note_off', null, ['number', 'number']);
    const v2synth_load_patch = module.cwrap('v2synth_load_patch', 'number', ['number', 'number', 'number']);
    
    log('Functions wrapped');
    
    // Initialize synth
    const sampleRate = 44100;
    const result = v2synth_init(sampleRate);
    log(`Synth init result: ${result}`);
    
    if (result < 0) {
      return { error: 'v2synth_init failed' };
    }
    
    // Don't load a patch - use the default v2initsnd patches initialized by sdInit()
    // The v2initsnd defaults have osc1 = saw wave with volume
    // But chanvol starts at 0, so we need to send CC7 (volume) = 127
    log('Using default patches from sdInit()');
    
    // Send MIDI CC7 (volume) = 127 to channel 0
    const v2synth_control_change = module.cwrap('v2synth_control_change', null, ['number', 'number', 'number']);
    v2synth_control_change(0, 7, 127);  // channel 0, CC7, value 127
    log('Set channel volume via CC7=127');
    
    // Allocate render buffers
    const numSamples = 44100; // 1 second
    const bufferPtr = module._malloc(numSamples * 4 * 2);  // stereo interleaved
    
    log('Render buffers allocated');
    
    // Trigger note C4 with velocity 100
    v2synth_note_on(0, 60, 100);  // channel, note, velocity
    log('Note on: C4, vel=100');
    
    // Render audio
    v2synth_render(bufferPtr, numSamples);
    log(`Rendered ${numSamples} frames`);
    
    // Check output (stereo interleaved)
    const output = new Float32Array(module.HEAPF32.buffer, bufferPtr, numSamples * 2);
    let maxSample = 0;
    let nonZeroCount = 0;
    for (let i = 0; i < numSamples * 2; i++) {
      const absVal = Math.abs(output[i]);
      if (absVal > maxSample) maxSample = absVal;
      if (absVal > 0.00001) nonZeroCount++;
    }
    
    log(`Max sample: ${maxSample.toFixed(6)} (non-zero: ${nonZeroCount})`);
    
    // Note off
    v2synth_note_off(0, 60);
    log('Note off');
    
    // Free buffers
    module._free(bufferPtr);
    
    log('DONE!');
    
    return { maxSample, nonZeroCount };
    
  } catch (err) {
    log(`ERROR: ${err.message}`);
    return { error: err.message, stack: err.stack };
  }
});

console.log('Result:', result);
await browser.close();
