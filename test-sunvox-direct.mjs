import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  console.log(`[${msg.type()}]:`, msg.text());
});
page.on('pageerror', err => {
  console.log('[PAGE ERROR]:', err.message);
});

console.log('Navigating to localhost...');
await page.goto('http://localhost:5173');

console.log('Running WASM test...');
const result = await page.evaluate(async () => {
  const log = [];
  const addLog = (msg) => { log.push(msg); console.log(msg); };
  
  try {
    addLog('Fetching WASM + JS...');
    const [wasmResp, jsResp] = await Promise.all([
      fetch('/sunvox/SunVox.wasm'),
      fetch('/sunvox/SunVox.js')
    ]);
    
    const wasmBinary = await wasmResp.arrayBuffer();
    let jsCode = await jsResp.text();
    addLog('Got WASM: ' + wasmBinary.byteLength + ' bytes, JS: ' + jsCode.length + ' chars');
    
    jsCode = jsCode
      .replace(/import\.meta\.url/g, "'.'")
      .replace(/export\s+default\s+\w+;?/g, '');
    
    addLog('Evaluating JS...');
    eval(jsCode);
    
    if (typeof createSunVox !== 'function') {
      addLog('ERROR: createSunVox not defined!');
      return log;
    }
    
    addLog('Creating WASM instance...');
    const wasm = await createSunVox({ wasmBinary });
    addLog('WASM created! Keys: ' + Object.keys(wasm).slice(0, 10).join(', '));
    
    addLog('Creating engine handle...');
    const handle = wasm._sunvox_wasm_create(44100);
    addLog('Handle: ' + handle);
    
    if (handle < 0) {
      addLog('ERROR: Failed to create handle');
      return log;
    }
    
    addLog('Loading test song...');
    const songResp = await fetch('/sunvox/test-tune.sunvox');
    const songBuf = await songResp.arrayBuffer();
    const songArr = new Uint8Array(songBuf);
    addLog('Song size: ' + songArr.length);
    
    wasm.FS.writeFile('/tmp/test.sunvox', songArr);
    addLog('File written to FS');
    
    // Use ccall instead of manual string handling
    addLog('Calling sunvox_wasm_load_song...');
    wasm.ccall('sunvox_wasm_load_song', null, ['number', 'string'], [handle, '/tmp/test.sunvox']);
    addLog('Song loaded');
    
    // Check module count
    const moduleCount = wasm._sunvox_wasm_get_module_count(handle);
    addLog('Module count: ' + moduleCount);
    
    addLog('Calling sunvox_wasm_play...');
    wasm.ccall('sunvox_wasm_play', null, ['number'], [handle]);
    addLog('Play called');
    
    addLog('About to render...');
    
    // Render in chunks of 4096 (the WASM buffer limit)
    const totalFrames = 44100;
    const chunkSize = 4096;
    const bufL = wasm._malloc(chunkSize * 4);
    const bufR = wasm._malloc(chunkSize * 4);
    
    let maxSample = 0;
    let nonZeroCount = 0;
    const heapF32 = wasm.HEAPF32;
    const offL = bufL >> 2;
    
    let renderedFrames = 0;
    while (renderedFrames < totalFrames) {
      const thisChunk = Math.min(chunkSize, totalFrames - renderedFrames);
      wasm._sunvox_wasm_render(handle, bufL, bufR, thisChunk);
      
      for (let i = 0; i < thisChunk; i++) {
        const s = Math.abs(heapF32[offL + i]);
        if (s > 0.0001) nonZeroCount++;
        if (s > maxSample) maxSample = s;
      }
      renderedFrames += thisChunk;
    }
    
    addLog('Rendered ' + renderedFrames + ' frames total');
    addLog('Max sample: ' + maxSample + ' (non-zero: ' + nonZeroCount + ')');
    
    wasm._free(bufL);
    wasm._free(bufR);
    addLog('DONE!');
    
  } catch (err) {
    addLog('ERROR: ' + err.message);
  }
  
  return log;
});

console.log('\n=== Test Results ===');
result.forEach(l => console.log(l));

await browser.close();
