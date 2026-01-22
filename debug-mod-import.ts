/**
 * Debug script to inspect MOD file import
 */

import { readFileSync } from 'fs';
import { parseMOD, periodToNote } from './src/lib/import/formats/MODParser';

async function debugMOD() {
  // Load the MOD file
  const filePath = '/Users/spot/Downloads/break the box (1).mod';
  const buffer = readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  // Parse it
  const { header, patterns, instruments, metadata } = await parseMOD(arrayBuffer);

  console.log('=== MOD FILE INFO ===');
  console.log('Title:', header.title);
  console.log('Format:', header.formatTag);
  console.log('Channels:', header.channelCount);
  console.log('Pattern Count:', header.patternCount);
  console.log('Song Length:', header.songLength);
  console.log('Instrument Count:', instruments.length);
  console.log('');

  // Get first pattern in song order
  const firstPatternIdx = header.patternOrderTable[0];
  console.log(`=== FIRST PATTERN (Pattern #${firstPatternIdx}) ===`);
  console.log('');

  // Inspect first 16 rows of first channel
  const firstPattern = patterns[firstPatternIdx];
  console.log('First 16 rows of Channel 0:');
  console.log('Row | Period | Inst | Effect | Note');
  console.log('----+--------+------+--------+------');

  for (let row = 0; row < 16; row++) {
    const note = firstPattern[row][0]; // First channel
    const noteName = periodToNote(note.period) || '---';
    const instStr = note.instrument > 0 ? note.instrument.toString().padStart(2, '0') : '--';
    const effectStr = note.effect.toString(16).toUpperCase() + note.effectParam.toString(16).padStart(2, '0').toUpperCase();

    console.log(
      `${row.toString().padStart(3, ' ')} | ${note.period.toString().padStart(6, ' ')} | ${instStr} | ${effectStr} | ${noteName}`
    );
  }

  console.log('');
  console.log('=== RAW BYTES FOR FIRST NOTE ===');
  // Show raw bytes for debugging
  const view = new DataView(arrayBuffer);
  const patternDataOffset = 1084 + (firstPatternIdx * 64 * header.channelCount * 4);
  console.log('Pattern data starts at offset:', patternDataOffset);

  for (let row = 0; row < 4; row++) {
    const offset = patternDataOffset + (row * header.channelCount * 4);
    const byte0 = view.getUint8(offset);
    const byte1 = view.getUint8(offset + 1);
    const byte2 = view.getUint8(offset + 2);
    const byte3 = view.getUint8(offset + 3);

    console.log(`Row ${row}: ${byte0.toString(16).padStart(2, '0')} ${byte1.toString(16).padStart(2, '0')} ${byte2.toString(16).padStart(2, '0')} ${byte3.toString(16).padStart(2, '0')}`);

    // Decode
    const period = ((byte0 & 0x0F) << 8) | byte1;
    const instrument = (byte0 & 0xF0) | ((byte2 & 0xF0) >> 4);
    const effect = byte2 & 0x0F;
    const effectParam = byte3;

    console.log(`  Decoded: period=${period}, inst=${instrument}, effect=${effect.toString(16)}, param=${effectParam.toString(16)}`);
    console.log(`  Note: ${periodToNote(period) || 'none'}`);
  }
}

debugMOD().catch(console.error);
