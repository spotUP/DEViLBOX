/**
 * Debug full MOD import pipeline
 */

import { readFileSync } from 'fs';
import { parseMOD } from './src/lib/import/formats/MODParser';
import { convertSongToPatterns } from './src/lib/import/ModuleConverter';
import type { RawSongData } from './src/types/tracker';

async function debugFullImport() {
  // Load and parse MOD
  const filePath = '/Users/spot/Downloads/break the box (1).mod';
  const buffer = readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const { header, patterns, instruments, metadata } = await parseMOD(arrayBuffer);

  console.log('=== STEP 1: RAW MOD DATA ===');
  console.log('First pattern, first channel, first 4 rows:');
  const firstPatternIdx = header.patternOrderTable[0];
  const firstPattern = patterns[firstPatternIdx];

  for (let row = 0; row < 4; row++) {
    const note = firstPattern[row][0];
    console.log(`Row ${row}:`, {
      period: note.period,
      instrument: note.instrument,
      effect: note.effect,
      effectParam: note.effectParam,
    });
  }

  console.log('\n=== STEP 2: BUILD RawSongData ===');

  // Build RawSongData like ModuleLoader does
  const rawSong: RawSongData = {
    title: metadata.sourceFile || 'Untitled',
    artist: '',
    format: 'MOD',
    initialSpeed: metadata.modData?.initialSpeed || 6,
    initialBPM: metadata.modData?.initialTempo || 125,
    channels: metadata.originalChannelCount || 4,
    patterns: patterns, // Raw MOD patterns
    instruments: instruments.map((inst, idx) => ({
      id: idx * 100, // Our instrument ID system
      name: inst.name,
      type: 'sample' as const,
      sample: inst.samples[0] || null,
    })),
    metadata,
    orderList: metadata.modData?.patternOrderTable || [],
  };

  console.log('Instrument mapping:');
  rawSong.instruments.forEach((inst) => {
    console.log(`  MOD instrument ${(inst.id / 100) + 1} → ID ${inst.id}: ${inst.name}`);
  });

  console.log('\n=== STEP 3: CONVERT TO PATTERNS ===');
  const convertedPatterns = convertSongToPatterns(rawSong);

  console.log(`Converted ${convertedPatterns.length} patterns`);
  console.log('\nFirst pattern, first channel, first 4 rows after conversion:');

  const firstConvertedPattern = convertedPatterns[firstPatternIdx];
  for (let row = 0; row < 4; row++) {
    const cell = firstConvertedPattern.channels[0].rows[row];
    console.log(`Row ${row}:`, {
      note: cell.note,
      instrument: cell.instrument,
      volume: cell.volume,
      effect: cell.effect,
      period: cell.period,
    });
  }

  console.log('\n=== ANALYSIS ===');
  const row0 = firstConvertedPattern.channels[0].rows[0];
  console.log('Row 0 cell:', row0);

  if (row0.instrument !== null) {
    const originalInst = Math.floor(row0.instrument / 100) + 1;
    console.log(`Instrument ${row0.instrument} → Original MOD instrument: ${originalInst}`);
  }
}

debugFullImport().catch(console.error);
