import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const WS_URL = 'ws://localhost:4003/mcp';

function callBrowser(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 30000);
    
    const handler = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (msg.type === 'error') reject(new Error(msg.error));
          else resolve(msg.data);
        }
      } catch {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => { console.log('Connected to relay'); resolve(); });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
  
  // Quick connectivity test
  const info = await callBrowser(ws, 'get_song_info');
  console.log('Song:', info.title || '(untitled)', '| BPM:', info.bpm, '| Channels:', info.channels);

  // Get audio state and clear existing master effects
  const state = await callBrowser(ws, 'get_audio_state');
  if (state.masterEffects?.length > 0) {
    for (const fx of state.masterEffects) {
      await callBrowser(ws, 'remove_master_effect', { effectId: fx.id });
    }
    console.log('Cleared', state.masterEffects.length, 'existing master effects');
  }

  // Start playback and get baseline
  await callBrowser(ws, 'play');
  await sleep(1000);
  
  const baseline = await callBrowser(ws, 'get_audio_level', { durationMs: 2000 });
  console.log(`\nBASELINE (no fx): RMS=${baseline.rmsAvg?.toFixed(4)} peak=${baseline.peakMax?.toFixed(4)} silent=${baseline.isSilent}`);
  
  if (baseline.isSilent) {
    console.log('ERROR: No audio! Load a song and click in browser first.');
    ws.close(); process.exit(1);
  }

  const baseRms = baseline.rmsAvg || 0.001;

  // All effect types to test
  const effectTypes = [
    'Distortion', 'Reverb', 'Delay', 'Chorus', 'Phaser', 'Tremolo', 'Vibrato',
    'AutoFilter', 'AutoPanner', 'AutoWah', 'BitCrusher', 'Chebyshev',
    'Compressor', 'EQ3', 'FeedbackDelay', 'Filter', 'FrequencyShifter',
    'JCReverb', 'PingPongDelay', 'PitchShift', 'StereoWidener',
    'TapeSaturation', 'BiPhase', 'DubFilter', 'MoogFilter',
    'SpaceEcho', 'SpaceyDelayer', 'RETapeEcho',
    'MVerb', 'Leslie', 'SpringReverb', 'VinylNoise', 'ToneArm',
    'ShimmerReverb', 'GranularFreeze', 'TapeDegradation', 'AmbientDelay',
    'SidechainCompressor',
  ];

  const results: Array<{
    type: string; initMs: number; rmsAvg: number; peakMax: number;
    silent: boolean; levelDiffDb: number; error?: string;
  }> = [];

  for (const fxType of effectTypes) {
    process.stdout.write(`${fxType.padEnd(22)} `);
    
    try {
      const t0 = Date.now();
      const addResult = await callBrowser(ws, 'add_master_effect', { effectType: fxType });
      const effectId = addResult?.effectId || addResult?.id;
      
      if (!effectId) {
        console.log('SKIP (no id)');
        results.push({ type: fxType, initMs: -1, rmsAvg: 0, peakMax: 0, silent: true, levelDiffDb: -999, error: 'no id' });
        continue;
      }

      // Check for audio every 200ms for up to 5s
      let initMs = 0;
      let gotAudio = false;
      for (let i = 0; i < 25; i++) {
        await sleep(200);
        const lvl = await callBrowser(ws, 'get_audio_level', { durationMs: 400 });
        initMs = Date.now() - t0;
        if (!lvl.isSilent) { gotAudio = true; break; }
      }

      // Stable measurement
      await sleep(300);
      const stable = await callBrowser(ws, 'get_audio_level', { durationMs: 2000 });
      const rmsAvg = stable.rmsAvg || 0;
      const peakMax = stable.peakMax || 0;
      const isSilent = stable.isSilent;
      const diffDb = rmsAvg > 0 ? 20 * Math.log10(rmsAvg / baseRms) : -999;
      
      results.push({ type: fxType, initMs, rmsAvg, peakMax, silent: isSilent, levelDiffDb: diffDb });
      
      const tag = isSilent ? 'SILENT!' : diffDb < -6 ? 'QUIET' : diffDb > 6 ? 'LOUD' : 'OK';
      console.log(`${tag.padEnd(7)} init=${String(initMs).padStart(5)}ms  rms=${rmsAvg.toFixed(4)}  diff=${diffDb.toFixed(1)}dB`);
      
      // Remove effect
      await callBrowser(ws, 'remove_master_effect', { effectId });
      await sleep(300);
      
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`);
      results.push({ type: fxType, initMs: -1, rmsAvg: 0, peakMax: 0, silent: true, levelDiffDb: -999, error: err.message });
      // Cleanup
      try {
        const st = await callBrowser(ws, 'get_audio_state');
        for (const fx of (st.masterEffects || [])) {
          await callBrowser(ws, 'remove_master_effect', { effectId: fx.id });
        }
      } catch {}
      await sleep(500);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(85));
  console.log('FX AUDIT SUMMARY');
  console.log('='.repeat(85));
  console.log(`${'Effect'.padEnd(22)} ${'Init'.padStart(6)} ${'RMS'.padStart(8)} ${'Peak'.padStart(8)} ${'dB diff'.padStart(8)} ${'Status'.padStart(8)}`);
  console.log('-'.repeat(85));
  
  for (const r of results) {
    const s = r.error ? 'ERROR' : r.silent ? 'SILENT' : r.levelDiffDb < -6 ? 'QUIET' : r.levelDiffDb > 6 ? 'LOUD' : 'OK';
    console.log(`${r.type.padEnd(22)} ${String(r.initMs).padStart(6)} ${r.rmsAvg.toFixed(4).padStart(8)} ${r.peakMax.toFixed(4).padStart(8)} ${r.levelDiffDb.toFixed(1).padStart(8)} ${s.padStart(8)}`);
  }
  
  console.log('-'.repeat(85));
  console.log(`Baseline RMS: ${baseRms.toFixed(4)}`);
  
  const silent = results.filter(r => r.silent && !r.error);
  const quiet = results.filter(r => !r.silent && r.levelDiffDb < -6);
  const loud = results.filter(r => !r.silent && r.levelDiffDb > 6);
  const slow = results.filter(r => r.initMs > 1000 && !r.error);
  const errors = results.filter(r => r.error);
  
  if (silent.length) console.log(`\nSILENT (${silent.length}): ${silent.map(r => r.type).join(', ')}`);
  if (quiet.length) console.log(`QUIET <-6dB (${quiet.length}): ${quiet.map(r => `${r.type}(${r.levelDiffDb.toFixed(1)})`).join(', ')}`);
  if (loud.length) console.log(`LOUD >+6dB (${loud.length}): ${loud.map(r => `${r.type}(${r.levelDiffDb.toFixed(1)})`).join(', ')}`);
  if (slow.length) console.log(`SLOW >1s (${slow.length}): ${slow.map(r => `${r.type}(${r.initMs}ms)`).join(', ')}`);
  if (errors.length) console.log(`ERRORS (${errors.length}): ${errors.map(r => `${r.type}: ${r.error}`).join(', ')}`);
  
  ws.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
