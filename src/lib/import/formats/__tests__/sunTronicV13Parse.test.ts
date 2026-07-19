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
import { isSunTronicV13Format, parseSunTronicV13Score, decodeSunSynthInstrument } from '../SunTronicV13';

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

  it('mule.src: applies per-voice sequence transpose to displayed pitch', () => {
    // Voice 1 (channel index 1) carries a −4 semitone sequence transpose from
    // sequence entry 4 onward (entries 0–3 are transpose 0). The replayer
    // computes pitch = (~byte) − transpose, so the grid must show the
    // transposed note, NOT the raw decoded byte.
    //
    // Fixture witness: mule.src channel 1, pattern 2, row 0 (global row 128 =
    // entry 4 at 32 rows/position) decodes raw pitch 47. With transpose −4 the
    // displayed note is sunPitchToNote(47 − (−4)) = sunPitchToNote(51) = 64.
    // Without the transpose (the reverted bug) it would be sunPitchToNote(47) =
    // 60 — this assertion fails on revert.
    const song = parseSunTronicFile(loadModule('mule.src'), 'mule.src', loadCompanions());
    const cell = song.patterns[2].channels[1].rows[0];
    expect(cell.note, 'voice-1 transposed cell shows +4 semitones from raw').toBe(64);
  });

  it('mule.src: decodes the 0x24 synth record into a full descriptor (replayer-verified fields)', () => {
    // Field values recovered from the Andy Silva replayer source
    // (docs/formats/Replayers/DeliPlayers/AndySilva/DP_Suntronic.s: GNN2 @543,
    // MEGAEFFECTS @594, EFFECTS @415) and cross-checked byte-for-byte against
    // mule.src synth[0]. Fails on revert: without decodeSunSynthInstrument the
    // synth records are only COUNTED (bare placeholders, silent) — the whole
    // native synth engine has no descriptor to build a voice from.
    const score = parseSunTronicV13Score(new Uint8Array(loadModule('mule.src')));
    expect(score.synthInstruments.length).toBe(score.synthInstrumentCount);
    expect(score.synthInstruments.length).toBe(5);

    const s0 = score.synthInstruments[0];
    expect(s0.recordOff).toBe(score.synthTableOff);
    expect(s0.volEnvOff).toBe(0x174a);
    expect(s0.volEnvLen).toBe(6);
    expect(s0.volEnvLoop).toBe(5);
    expect(s0.freqEnvOff).toBe(0x171c);
    expect(s0.freqEnvLen).toBe(1);
    expect(s0.freqEnvSpeed).toBe(0x1f40);
    expect(s0.arpTableOff).toBe(0x1801);
    expect(s0.arpLen).toBe(0x3e);
    expect(s0.arpLoop).toBe(0);
    expect(s0.wave1Off).toBe(0x1cc5);
    expect(s0.wave2Off).toBe(0x1d05);
    expect(s0.waveWordLen).toBe(0x20);
    expect(s0.synthType).toBe(2);

    // resolved table data sliced to the right lengths from hunk#1
    expect(s0.wave1.length).toBe(0x40); // waveWordLen * 2
    expect(s0.wave2.length).toBe(0x40);
    expect(s0.arpTable.length).toBe(0x3e);

    // decoder is a pure function of (h1, recordOff): re-decoding matches
    const again = decodeSunSynthInstrument(score.h1, score.synthTableOff);
    expect(again.wave1Off).toBe(s0.wave1Off);
    expect(again.synthType).toBe(s0.synthType);
  });

  it('analgestic2.src: decodes the 0x1c sampled record env/vib front + slot/length/loop', () => {
    // Gate D (plans/2026-07-16-suntronic-gateD-sampled-dma.md): the sampled
    // record's front 0x00-0x11 is a synth-shaped env/vib block that the SHARED
    // EFFECTS reads (DP_Suntronic.s: GNN8 @0x26a16 sets $14=0 → EFFECTS runs).
    // Before Gate D the parser decoded only slot/length/loop, so a native
    // sampled voice had no envelope to drive stepEffects → period/vol frozen →
    // native silence. Fails on revert: without the env/vib front decode the
    // volEnv slice is empty and freqEnv* are undefined.
    const score = parseSunTronicV13Score(new Uint8Array(loadModule('analgestic2.src')));
    expect(score.sampledInstruments.length).toBe(3);
    expect(score.instrumentNames).toEqual(['perc1.x', 'perc2.x', 'bio']);

    const [r0, , r2] = score.sampledInstruments;
    // slot = instrumentNames order; length = companion file bytes / 2
    expect(r0.slotIndex).toBe(0);
    expect(r0.lengthWords).toBe(2362);   // perc1.x = 4724 bytes
    expect(r0.loopLenWords).toBe(1);     // one-shot (2-byte silent loop tail)
    expect(r2.slotIndex).toBe(2);
    expect(r2.lengthWords).toBe(2938);   // bio = 5876 bytes
    expect(r2.loopLenWords).toBe(2938);  // full loop

    // env/vib front decoded (drives the SHARED EFFECTS for a sampled voice)
    expect(r0.volEnvOff).toBeGreaterThan(0);
    expect(r0.volEnv.length).toBe(r0.volEnvLen + 1);
    expect(r0.vibDepth.length).toBe(r0.freqEnvLen + 1);
  });

  it('suntronic-donner.src: all-sampled build (0 synth) whose synth/sampled LEAs coincide still decodes', () => {
    // donner is the sole 0-synth module in the corpus: its `lea synthTable,a0`
    // and `lea sampledTable,a1` both target the SAME hunk#1 address (0x15b8),
    // so synthTableOff === sampledTableOff and the synth count is 0. The old
    // guard `sampledTableOff <= synthTableOff` treated the equal case as
    // structurally broken and THREW, dropping donner to a UADE path that
    // mis-renders its build variant as noise. Fails on revert: with the `<=`
    // guard parseSunTronicV13Score throws 'instrument table offsets out of
    // range' and never reaches these assertions.
    const score = parseSunTronicV13Score(new Uint8Array(loadModule('suntronic-donner.src')));
    expect(score.synthInstrumentCount).toBe(0);
    expect(score.synthInstruments.length).toBe(0);
    expect(score.sampledInstruments.length).toBe(14);
    expect(score.subsongs.length).toBeGreaterThan(0);
    expect(score.blocks.length).toBeGreaterThan(0);

    // Full parse loads all 14 sampled instruments as sample-type from the
    // module's own name table + instr/ sidecars, and lays real notes into the grid.
    const song = parseSunTronicFile(loadModule('suntronic-donner.src'), 'suntronic-donner.src', loadCompanions());
    expect(song.instruments.length).toBe(14);
    expect(song.instruments.every((i) => i.type === 'sample')).toBe(true);
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
        const encoded = layout.encoder.encodePattern(layout.blockRows![fp], 0);
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
