/**
 * MIDILoricielParser Tests
 * Integration tests for MIDI Loriciel format detection and parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isMIDILoricielFormat, parseMIDILoricielFile } from '../formats/MIDILoricielParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF_MUSIC  = resolve(import.meta.dirname, '../../../../Reference Music');
const MIDI_FILE  = resolve(REF_MUSIC, 'MIDI-Loriciel/Christophe Zurfluh/MIDI.Entity high');

function loadAB(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Detection ──────────────────────────────────────────────────────────────

describe('isMIDILoricielFormat', () => {
  it('detects a real MIDI Loriciel file', () => {
    expect(isMIDILoricielFormat(loadAB(MIDI_FILE))).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isMIDILoricielFormat(new ArrayBuffer(256))).toBe(false);
  });

  it('rejects buffer too small', () => {
    expect(isMIDILoricielFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = new Uint8Array(64).fill(0x41);
    expect(isMIDILoricielFormat(buf.buffer)).toBe(false);
  });

  it('accepts Uint8Array input', () => {
    const buf = readFileSync(MIDI_FILE);
    expect(isMIDILoricielFormat(new Uint8Array(buf))).toBe(true);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────────

describe('parseMIDILoricielFile', () => {
  it('parses without throwing', () => {
    expect(() => parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high')).not.toThrow();
  });

  it('returns a defined TrackerSong', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song).toBeDefined();
  });

  it('returns format MOD', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song.format).toBe('MOD');
  });

  it('has 4 channels', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song.numChannels).toBe(4);
  });

  it('has at least one pattern', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid song order', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song.songPositions.length).toBeGreaterThan(0);
    expect(song.songLength).toBe(song.songPositions.length);
  });

  it('has valid BPM and speed', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song.initialBPM).toBeGreaterThan(0);
    expect(song.initialSpeed).toBeGreaterThan(0);
  });

  it('includes MIDI Loriciel in the name', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    expect(song.name).toContain('MIDI Loriciel');
  });

  it('logs format report', () => {
    const song = parseMIDILoricielFile(loadAB(MIDI_FILE), 'MIDI.Entity high');
    const report = analyzeFormat(song, 'MIDI.Entity high');
    console.log(formatReportToString(report));
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
