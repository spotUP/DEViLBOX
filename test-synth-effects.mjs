#!/usr/bin/env node
/**
 * Test synth effect commands via manual pattern creation
 */

import { setTimeout } from 'timers/promises';

const API_BASE = 'http://localhost:3001/mcp';

async function call(tool, args = {}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${tool} failed: ${res.status} ${text}`);
  }
  
  const data = await res.json();
  if (data.error) throw new Error(`${tool} error: ${data.error}`);
  return data.result;
}

async function main() {
  console.log('🧪 Testing Synth Effect Commands\n');
  
  try {
    // 1. Create a new song with TB-303
    console.log('1. Creating new song with TB-303...');
    await call('new_song', { 
      name: 'Synth Effects Test',
      channels: 4,
      bpm: 125,
      speed: 6
    });
    
    // 2. Add TB-303 instrument
    console.log('2. Adding TB-303 instrument...');
    const result = await call('add_instrument', {
      type: 'TB303',
      name: 'TB-303 Bass'
    });
    const instId = result.instrumentId || 0;
    console.log(`   Created instrument ID: ${instId}`);
    
    // 3. Get initial pattern
    console.log('3. Setting up test pattern...');
    
    // Note: We'll add notes via set_cell
    // Pattern format: [note, instrument, volume, effect_type, effect_param]
    
    const tests = [
      { row: 0, note: 'C-4', desc: 'Trigger note' },
      { row: 4, note: 'C-4', effect: 'C00', desc: 'C00 - Volume 0 (silent)' },
      { row: 8, note: 'C-4', effect: 'C40', desc: 'C40 - Volume 64' },
      { row: 12, note: 'C-4', effect: '047', desc: '047 - Arpeggio C-E-G' },
      { row: 16, note: 'C-4', effect: '120', desc: '120 - Portamento up' },
      { row: 20, note: 'C-4', effect: '220', desc: '220 - Portamento down' },
      { row: 24, note: 'C-5', effect: '310', desc: '310 - Tone portamento' },
      { row: 28, note: 'C-4', effect: '434', desc: '434 - Vibrato' },
      { row: 32, note: 'C-4', effect: '8C0', desc: '8C0 - Pan right' },
      { row: 36, note: 'C-4', effect: 'A10', desc: 'A10 - Volume slide up' },
    ];
    
    for (const test of tests) {
      console.log(`   Row ${test.row.toString().padStart(2)}: ${test.desc}`);
      
      // Set note + instrument
      await call('set_cell', {
        pattern: 0,
        row: test.row,
        channel: 0,
        note: test.note,
        instrument: instId
      });
      
      // Set effect if specified
      if (test.effect) {
        const effectType = parseInt(test.effect[0], 16);
        const effectParam = parseInt(test.effect.slice(1), 16);
        
        await call('set_cell', {
          pattern: 0,
          row: test.row,
          channel: 0,
          effectType,
          effectParam
        });
      }
    }
    
    // 4. Play the song
    console.log('\n4. Starting playback...');
    await call('play');
    
    console.log('\n✅ Test song created and playing!');
    console.log('\nExpected behavior:');
    console.log('  - Rows 0-3:   Note plays normally');
    console.log('  - Row 4-7:    Silent (C00)');
    console.log('  - Row 8-11:   Audible again (C40)');
    console.log('  - Row 12-15:  Arpeggio (C-E-G chord)');
    console.log('  - Row 16-19:  Pitch slides up');
    console.log('  - Row 20-23:  Pitch slides down');
    console.log('  - Row 24-27:  Slides to C-5');
    console.log('  - Row 28-31:  Vibrato effect');
    console.log('  - Row 32-35:  Pans to right');
    console.log('  - Row 36+:    Volume increases');
    
    console.log('\nListening for 10 seconds...');
    await setTimeout(10000);
    
    // Check for console errors
    console.log('\n5. Checking for errors...');
    const errors = await call('get_console_errors');
    
    if (errors.entries && errors.entries.length > 0) {
      console.log('⚠️  Console errors detected:');
      errors.entries.forEach(e => {
        console.log(`   [${e.level}] ${e.message}`);
      });
    } else {
      console.log('✅ No console errors!');
    }
    
    // Stop playback
    await call('stop');
    console.log('\n🎵 Test complete!');
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

main();
