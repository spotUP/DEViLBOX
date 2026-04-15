#!/usr/bin/env node
/**
 * Audit all synth types and their capabilities
 */

import { readFileSync } from 'fs';
import { glob } from 'glob';

const synthFiles = await glob('src/engine/**/*Synth.ts', { ignore: 'node_modules/**' });

const categories = {
  tonejs: [],
  wasm: [],
  worklet: [],
  custom: [],
  unknown: []
};

const results = [];

for (const file of synthFiles) {
  const content = readFileSync(file, 'utf-8');
  const name = file.split('/').pop().replace('.ts', '');
  
  let category = 'unknown';
  let hasDetune = false;
  let hasPitchBend = false;
  let hasFrequency = false;
  
  // Detect category
  if (content.includes('Tone.MonoSynth') || content.includes('Tone.PolySynth') || content.includes('Tone.DuoSynth') || content.includes('Tone.FMSynth')) {
    category = 'tonejs';
    hasDetune = true; // Tone.js synths have detune
  } else if (content.includes('AudioWorkletNode') || content.includes('.worklet.js')) {
    category = 'worklet';
  } else if (content.includes('createWasm') || content.includes('.wasm') || content.includes('WASM')) {
    category = 'wasm';
  } else if (content.includes('OscillatorNode') || content.includes('createOscillator')) {
    category = 'custom';
  }
  
  // Check for pitch-related methods
  if (content.includes('setPitchBend') || content.includes('pitchBend')) {
    hasPitchBend = true;
  }
  if (content.includes('setFrequency') || content.includes('.frequency.')) {
    hasFrequency = true;
  }
  
  categories[category].push(name);
  results.push({
    name,
    file: file.replace('src/engine/', ''),
    category,
    hasDetune,
    hasPitchBend,
    hasFrequency
  });
}

console.log('\n=== SYNTH AUDIT ===\n');
console.log('Total synths:', synthFiles.length);
console.log('');
console.log('By Category:');
console.log('  Tone.js:', categories.tonejs.length);
console.log('  WASM:', categories.wasm.length);
console.log('  AudioWorklet:', categories.worklet.length);
console.log('  Custom Oscillators:', categories.custom.length);
console.log('  Unknown:', categories.unknown.length);
console.log('');

console.log('Pitch Effect Support:');
const withDetune = results.filter(r => r.hasDetune).length;
const withPitchBend = results.filter(r => r.hasPitchBend).length;
const withFrequency = results.filter(r => r.hasFrequency).length;
console.log('  Has .detune:', withDetune);
console.log('  Has pitchBend:', withPitchBend);
console.log('  Has frequency control:', withFrequency);
console.log('');

console.log('=== DETAILED RESULTS ===\n');
const table = results.map(r => ({
  Name: r.name,
  Category: r.category,
  Detune: r.hasDetune ? '✓' : '✗',
  PitchBend: r.hasPitchBend ? '✓' : '✗',
  Frequency: r.hasFrequency ? '✓' : '✗'
}));

console.table(table);

console.log('\n=== TONE.JS SYNTHS (Pitch Effects Work) ===');
categories.tonejs.forEach(s => console.log('  -', s));

console.log('\n=== NON-TONE.JS SYNTHS (Need Custom Implementation) ===');
console.log('WASM:', categories.wasm.length);
console.log('AudioWorklet:', categories.worklet.length);
console.log('Custom:', categories.custom.length);
