#!/usr/bin/env npx tsx
/**
 * Quick debug: test ONE master effect parameter update with full logging
 */
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const ws = new WebSocket('ws://localhost:4003/mcp');
const pending = new Map<string, (resp: any) => void>();

function call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) return reject(new Error('Not connected'));
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, (resp: any) => {
      clearTimeout(timer);
      if (resp.type === 'error') reject(new Error(resp.error ?? JSON.stringify(resp)));
      else resolve(resp.data as T);
    });
    ws.send(JSON.stringify({ id, type: 'call', method, params }));
  });
}

ws.on('message', (data: any) => {
  const msg = JSON.parse(data.toString());
  console.log('  <- RECV:', JSON.stringify(msg).slice(0, 200));
  const h = pending.get(msg.id);
  if (h) { pending.delete(msg.id); h(msg); }
});

ws.on('open', async () => {
  console.log('Connected');
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  try {
    // Clear any existing effects
    console.log('\n1. Getting audio state...');
    const state1 = await call<any>('get_audio_state');
    console.log('   Master effects:', state1?.masterEffects?.length ?? 0);
    if (state1?.masterEffects?.length) {
      for (const fx of state1.masterEffects) {
        console.log(`   Removing ${fx.type} (${fx.id})`);
        await call('remove_master_effect', { effectId: fx.id });
      }
      await sleep(500);
    }

    // Add Distortion
    console.log('\n2. Adding Distortion...');
    const addResult = await call<any>('add_master_effect', { effectType: 'Distortion' });
    console.log('   Add result:', JSON.stringify(addResult));
    await sleep(800);

    // Get new state
    console.log('\n3. Getting state for effectId...');
    const state2 = await call<any>('get_audio_state');
    const fx = state2?.masterEffects?.[0];
    console.log('   Effect:', JSON.stringify(fx));

    if (!fx) {
      console.log('   ERROR: No effect found in state!');
      ws.close(); return;
    }

    // Update param
    console.log('\n4. Updating parameters...');
    console.log('   effectId:', fx.id);
    console.log('   updates:', JSON.stringify({ parameters: { drive: 0.8 } }));
    try {
      const updResult = await call('update_master_effect', {
        effectId: fx.id,
        updates: { parameters: { drive: 0.8 } },
      });
      console.log('   Update result:', JSON.stringify(updResult));
    } catch (err: any) {
      console.log('   UPDATE ERROR:', err.message);
    }

    // Check audio
    console.log('\n5. Checking audio level...');
    const level = await call<any>('get_audio_level', { durationMs: 500 });
    console.log('   Level:', JSON.stringify(level));

    // Clean up
    console.log('\n6. Cleaning up...');
    await call('remove_master_effect', { effectId: fx.id });
    console.log('   Done!');
  } catch (err: any) {
    console.error('ERROR:', err.message);
  }

  ws.close();
});

ws.on('error', (err) => console.error('WS error:', err.message));
