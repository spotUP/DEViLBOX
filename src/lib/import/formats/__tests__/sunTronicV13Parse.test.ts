/**
 * Regression: SunTronic V1.3 "Delirium" modules (.src/.pc, SUNTronicTunes
 * corpus) were undetected — the suntronic detector only matched raw rips
 * (48E7FFFE player code), so the 199-module V1.3 corpus fell through to a
 * play-only UADE path with no grid, no instruments, and no editability.
 *
 * Phase 2 fix (plans/2026-07-13-suntronic-editable-pilot.md): hunk/score
 * codec in SunTronicV13.ts decodes the REAL score (subsong table → sequences
 * → per-voice command-stream track blocks) into an editable grid, with
 * blockRows/blockRawBytes carriers on a UADEVariablePatternLayout at HONEST
 * file offsets, and loads sampled instruments from instr/* sidecars via the
 * companion mechanism.
 *
 * Fails on revert: without the V1.3 dispatch, parseSunTronicFile throws
 * ('Not a SunTronic module'); without the carrier stash in decodeSunBlock,
 * the encoder cannot reproduce the block bytes.
 *
 * Fixtures (real modules, committed):
 *   public/data/songs/formats/SUNTronicTunes/mule.src   (1 sampled: n-chord.x, rows/pos 32)
 *   public/data/songs/formats/SUNTronicTunes/kompo.pc   (0 sampled / 3 synth, rows/pos 16)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile, isSunTronicFormat, isSunTronicRawRip } from '../SunTronicParser';
import { isSunTronicV13Format, parseSunTronicV13Score, sunTronicV13Encoder } from '../SunTronicV13';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const INSTR = join(CORPUS, 'instr');

function loadModule(name: string): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

function loadCompanions(): Map<string, ArrayBuffer> {
  const map = new Map<string, ArrayBuffer>();
  for (const f of readdirSync(INSTR)) {
    const raw = new Uint8Array(readFileSync(join(INSTR, f)));
    map.set(f, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
  }
  return map;
}

describe('SunTronic V1.3 score decode (Delirium hunk executables)', () => {
  it('detects V1.3 modules and keeps raw-rip detection disjoint', () => {
    const mule = new Uint8Array(loadModule('mule.src'));
    expect(isSunTronicV13Format(mule)).toBe(true);
    expect(isSunTronicRawRip(mule)).toBe(false);
    expect(isSunTronicFormat(mule)).toBe(true);
    expect(isSunTronicV13Format(new Uint8Array(4096))).toBe(false);
  });

  it('mule.src: decodes real notes into the grid and loads the n-chord.x sidecar', () => {
    const song = parseSunTronicFile(loadModule('mule.src'), 'mule.src', loadCompanions());

    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.numChannels).toBe(4);

    // >= 1 real note per active channel across the song
    const notesPerChannel = [0, 0, 0, 0];
    for (const pat of song.patterns) {
      pat.channels.forEach((ch, i) => {
        for (const row of ch.rows) if (row.note > 0) notesPerChannel[i]++;
      });
    }
    expect(notesPerChannel.filter((n) => n > 0).length, `notes/channel = ${notesPerChannel.join(',')}`).toBeGreaterThanOrEqual(3);

    // sampled instrument from the module's own name table, PCM from instr/ sidecar
    const nchord = song.instruments.find((i) => i.name === 'n-chord.x');
    expect(nchord, 'n-chord.x sampled instrument present').toBeTruthy();
    expect(nchord!.type).toBe('sample');
    // PCM = lengthWords(2890) * 2 bytes; WAV wrapper adds header
    expect(nchord!.sample!.audioBuffer!.byteLength).toBeGreaterThanOrEqual(5780);
  });

  it('kompo.pc: 0 sampled / 3 synth instruments, rows/position default 16', () => {
    const buf = loadModule('kompo.pc');
    const score = parseSunTronicV13Score(new Uint8Array(buf));
    expect(score.sampledInstruments.length).toBe(0);
    expect(score.synthInstrumentCount).toBe(3);
    expect(score.rowsPerPositionDefault).toBe(16);

    const song = parseSunTronicFile(buf, 'kompo.pc', loadCompanions());
    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.instruments.length).toBe(3);
    const totalNotes = song.patterns.reduce((n, p) =>
      n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note > 0).length, 0), 0);
    expect(totalNotes).toBeGreaterThan(0);
  });

  for (const name of ['mule.src', 'kompo.pc']) {
    it(`${name}: layout carriers are HONEST — blockRawBytes equals the file slice and the encoder reproduces it`, () => {
      const buf = loadModule(name);
      const fileBytes = new Uint8Array(buf);
      const song = parseSunTronicFile(buf, name, loadCompanions());

      const layout = song.uadeVariableLayout;
      expect(layout, 'variable layout present').toBeTruthy();
      if (!layout) throw new Error('no layout');
      expect(layout.formatId).toBe('sunTronic');
      expect(layout.numFilePatterns).toBeGreaterThan(0);
      expect(layout.blockRows!.length).toBe(layout.numFilePatterns);
      expect(layout.blockRawBytes!.length).toBe(layout.numFilePatterns);

      for (let fp = 0; fp < layout.numFilePatterns; fp++) {
        const addr = layout.filePatternAddrs[fp];
        const size = layout.filePatternSizes[fp];
        expect(size).toBeGreaterThan(0);

        // carrier honesty: blockRawBytes IS the file slice at the REAL offset
        const slice = fileBytes.slice(addr, addr + size);
        expect(Buffer.from(layout.blockRawBytes![fp]).equals(Buffer.from(slice)),
          `fp ${fp} blockRawBytes == file[0x${addr.toString(16)}..+${size}]`).toBe(true);

        // carrier completeness: encoder concatenation reproduces the block
        // byte-for-byte from blockRows alone (fails if decodeSunBlock stops
        // stashing period/pan/resonance carriers)
        const encoded = sunTronicV13Encoder.encodePattern(layout.blockRows![fp], 0);
        expect(Buffer.from(encoded).equals(Buffer.from(slice)),
          `fp ${fp} encoder(blockRows) == block bytes`).toBe(true);
      }

      // trackMap references only valid file patterns
      for (const row of layout.trackMap) {
        for (const fp of row) {
          expect(fp).toBeGreaterThanOrEqual(-1);
          expect(fp).toBeLessThan(layout.numFilePatterns);
        }
      }
    });
  }
});
