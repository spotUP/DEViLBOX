/**
 * Keyboard preview vs the song, for the Future Composer, SidMon 1 and SidMon 2
 * voices (owner routine after the Fred fix, 2026-10-06: a typed key must sound
 * like the same instrument and note in the song).
 *
 * Oracle: the song's own replayer rendered with every voice but one muted, at
 * the first note of that voice that plays a synth instrument. Preview: the
 * format's per-note synth worklet fed the same instrument and the key the grid
 * cell of that note stands for (key = grid note + 11, xmConversions.noteToMidi).
 * Compared on what is heard: rising edges (pitch), RMS per 20 ms tick (level
 * and envelope).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, stereoOutputs, songBuffer, ROOT } from './workletHarness';
import { exposeHeapTransform, previewVoice as previewVoiceNote, previewRender, renderTicks, fromOnset, rmsPerTick, fundamentalHz, totalRms, db, FPT } from './keyboardPreviewHarness';
import { parseFCFile } from '@/lib/import/formats/FCParser';
import { serializeFCConfig } from '@/engine/fc/FCSynth';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { noteToMidi } from '@/lib/xmConversions';
import { parseSidMon1File } from '@/lib/import/formats/SidMon1Parser';
import { parseSidMon2File } from '@/lib/import/formats/SidMon2Parser';
import { serializeSidMon1Config } from '@/engine/sidmon1/SidMon1Synth';
import { sm1IndexToXM } from '@/engine/uade/encoders/SidMon1Encoder';
import { pinEditPathEngine } from './helpers/pinEditPathEngine';

// Edit-path test: guards the engine that takes the edit, whatever the playback verdicts make the default.
pinEditPathEngine('robhubbard', 'soundmaster', 'hippel', 'sidmon2', 'instereo1', 'soundmon');

const bytes = (n: string) => new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/formats', n)));
const ab = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;

interface Found { channel: number; row: number; note: number; instrument: number }
/** Rows from this note to the channel's next note or instrument change. */
function rowsUntilNext(song: TrackerSong, f: Found): number {
  const rows = song.patterns[song.songPositions[0]].channels[f.channel].rows;
  let n = 1;
  while (f.row + n < rows.length && !rows[f.row + n].note) n++;
  return n;
}
/** The note of an instrument of `synthType` in the first pattern with the longest run before the channel's next note (earliest on ties). */
function longestSynthNote(song: TrackerSong, synthType: string): Found & { rows: number } {
  const pat = song.patterns[song.songPositions[0]];
  let best: (Found & { rows: number }) | null = null;
  pat.channels.forEach((ch, c) => {
    ch.rows.forEach((cell, r) => {
      if (!cell.note || cell.note > 96 || !cell.instrument) return;
      if (song.instruments.find((i) => i.id === cell.instrument)?.synthType !== synthType) return;
      const f = { channel: c, row: r, note: cell.note, instrument: cell.instrument, rows: 0 };
      f.rows = rowsUntilNext(song, f);
      if (!best || f.rows > best.rows) best = f;
    });
  });
  if (!best) throw new Error('no ' + synthType + ' note');
  return best;
}

function compare(name: string, song: Float32Array, prev: Float32Array, ticks: number, tol = { pitchCents: 40, level: 1.5, tick: 3 }, pitched = true) {
  const sHz = fundamentalHz(song, 40), pHz = fundamentalHz(prev, 40);
  const sr = rmsPerTick(song, ticks), pr = rmsPerTick(prev, ticks);
  const result = {
    semitones: 12 * Math.log2((pHz || 1) / (sHz || 1)),
    levelDb: db(totalRms(pr) || 1e-9, totalRms(sr) || 1e-9),
    tickDb: sr.map((v, t) => (v > 0.002 ? Math.abs(db(pr[t] || 1e-6, v)) : 0)),
  };
  if (process.env.PREVIEW_DEBUG) console.log(name, JSON.stringify({ ...result, tickDb: Math.max(...result.tickDb) }), 'Hz', sHz.toFixed(1), pHz.toFixed(1),
    'rms', sr.map((x) => x.toFixed(3)).join(','), '|', pr.map((x) => x.toFixed(3)).join(','));
  if (pitched) {
    expect(sHz, name + ': the song voice has a pitch').toBeGreaterThan(0);
    expect(Math.abs(result.semitones) * 100, `${name}: pitch preview ${pHz.toFixed(1)} Hz song ${sHz.toFixed(1)} Hz, cents`).toBeLessThan(tol.pitchCents);
  }
  expect(Math.abs(result.levelDb), `${name}: overall level dB`).toBeLessThan(tol.level);
  result.tickDb.forEach((d, t) => expect(d, `${name}: tick ${t}`).toBeLessThan(tol.tick));
  return result;
}

describe('Future Composer keyboard preview is the instrument as the song plays it', () => {
  const file = bytes('anthrox.fc');
  const speed = file[180 + 12] || 3; // first sequence's replay speed (ticks per row)

  async function fcCase(pick: (song: TrackerSong) => Found & { rows: number }) {
    const song = await parseFCFile(ab(file), 'anthrox.fc');
    const f = pick(song);
    const inst = song.instruments.find((i) => i.id === f.instrument) as unknown as { fc: Parameters<typeof serializeFCConfig>[0] };
    const ticks = Math.min(f.rows * speed - 1, 24);
    const { proc, send } = await startWorklet('futurecomposer', 'FutureComposer');
    await send({ type: 'loadModule', moduleData: ab(file) });
    await send({ type: 'setChannelMask', mask: 1 << f.channel });
    await send({ type: 'play' });
    const out = renderTicks(proc, 6 + f.row * speed + ticks + 2, f.channel === 0 || f.channel === 3 ? 0 : 1);
    const s = fromOnset(out, f.row * speed, ticks);
    const p = await previewRender('fc', 'FC', serializeFCConfig(inst.fc), f.note + 11, ticks);
    return { s, p, ticks, f, inst };
  }
  const at = (channel: number, row: number) => (song: TrackerSong) => {
    const cell = song.patterns[song.songPositions[0]].channels[channel].rows[row];
    const f = { channel, row, note: cell.note, instrument: cell.instrument, rows: 0 };
    f.rows = rowsUntilNext(song, f);
    return f;
  };

  it('anthrox.fc: a slow-attack bass note has the song pitch, level and envelope', async () => {
    const c = await fcCase((song) => longestSynthNote(song, 'FCSynth'));
    compare('FC bass', c.s, c.p, c.ticks);
  });

  it('anthrox.fc: a stepped-decay lead note has the song pitch, level and envelope', async () => {
    const c = await fcCase(at(1, 0));
    expect(c.ticks).toBeGreaterThanOrEqual(6);
    compare('FC lead', c.s, c.p, c.ticks);
  });

  it('anthrox.fc: the keyboard note is cut on key release as the player cuts a note for the next one', async () => {
    const song = await parseFCFile(ab(file), 'anthrox.fc');
    const f = at(1, 0)(song);
    const inst = song.instruments.find((i) => i.id === f.instrument) as unknown as { fc: Parameters<typeof serializeFCConfig>[0] };
    const { proc, send, handle } = await previewVoiceNote('fc', 'FC', serializeFCConfig(inst.fc), f.note + 11);
    renderTicks(proc, 6);
    await send({ type: 'noteOff', handle });
    expect(Math.max(...renderTicks(proc, 1).map(Math.abs))).toBe(0);
  });

  it('PCM instruments: the sampler plays a typed key at the rate the song plays that grid note', async () => {
    const song = await parseFCFile(ab(file), 'anthrox.fc');
    const periods = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 906, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226, 214];
    let checked = 0;
    song.instruments.forEach((inst) => {
      if (inst.synthType !== 'Sampler' || !inst.sample) return;
      expect(inst.sample.baseNote).toBe('C3');
      // grid note x (XM numbering) = period index + 13; C-3 (x 37, period 428) plays the sample at 3546895 / 428 Hz.
      periods.forEach((p, idx) => {
        const x = idx + 13;
        const rate = inst.sample!.sampleRate! * Math.pow(2, (x - 37) / 12);
        expect(Math.abs(rate / (3546895 / p) - 1), `note ${x}`).toBeLessThan(0.01);
      });
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
});

// ── SidMon 1 ───────────────────────────────────────────────────────────────────

/**
 * What the SidMon 1 replayer plays on one voice: for each pattern row the voice
 * consumes, the row's bytes, the note it sounded (note + track transpose, a
 * period index) and the voice's audio from that row to the next.
 */
async function sm1VoiceRows(buf: ArrayBuffer, patternDataFileOffset: number, voice: number, blocks = 4000) {
  const { proc, send } = await startWorklet('sidmon1', 'SidMon1Replayer');
  await send({ type: 'loadModule', moduleData: buf.slice(0) });
  await send({ type: 'resume' });
  const m = proc.module as unknown as {
    _player_set_channel_gain(c: number, g: number): void;
    _player_get_voice_rows_consumed(v: number): number;
    _player_get_voice_consumed(v: number): number;
    _player_get_voice_note(v: number): number;
  };
  for (let c = 0; c < 4; c++) m._player_set_channel_gain(c, c === voice ? 1 : 0);
  const side = voice === 0 || voice === 3 ? 0 : 1;
  const bytes = new Uint8Array(buf);
  const audio = new Float32Array(blocks * 128);
  const rows: { frame: number; row: number; note: number; raw: number[] }[] = [];
  let last = 0;
  for (let b = 0; b < blocks; b++) {
    const o = stereoOutputs(1);
    proc.process([], o);
    audio.set(o[0][side], b * 128);
    const rc = m._player_get_voice_rows_consumed(voice);
    if (rc !== last) {
      last = rc;
      const row = m._player_get_voice_consumed(voice);
      const off = patternDataFileOffset + row * 5;
      rows.push({ frame: b * 128, row, note: m._player_get_voice_note(voice), raw: Array.from(bytes.slice(off, off + 5)) });
    }
  }
  return { audio, rows };
}

describe('SidMon 1 keyboard preview is the instrument as the song plays it', () => {
  const buf = songBuffer('public/data/songs/formats/anarchy.sid1');
  // [voice, pattern row]: a bass, two lead notes and a note of another instrument on another voice (anarchy.sid1).
  const cases: Array<[number, number]> = [[0, 252], [1, 264], [2, 259], [3, 97]];
  cases.forEach(([voice, row]) => {
    it(`anarchy.sid1 voice ${voice} row ${row}: the note typed as its grid note has the song pitch, level and envelope`, async () => {
      const song = parseSidMon1File(buf.slice(0), 'anarchy.sid1');
      const { audio, rows } = await sm1VoiceRows(buf, song.uadePatternLayout!.patternDataFileOffset, voice);
      const i = rows.findIndex((r) => r.row === row);
      const e = rows[i], next = rows[i + 1];
      const a = audio.subarray(e.frame, next.frame);
      let on = 0;
      while (on < a.length && Math.abs(a[on]) < 1e-4) on++;
      const ticks = Math.floor((a.length - on) / FPT);
      const inst = song.instruments.find((x) => x.id === e.raw[1]) as unknown as { sidmon1: Parameters<typeof serializeSidMon1Config>[0] };
      const key = sm1IndexToXM(e.note) + 11;
      const p = await previewRender('sidmon1', 'SidMon1', serializeSidMon1Config(inst.sidmon1), key, ticks, 100, exposeHeapTransform);
      compare(`SM1 voice ${voice}`, a.subarray(on, on + ticks * FPT), p, ticks, undefined, e.raw[1] !== 2); // instrument 2 is a PCM drum: its level and decay are compared, not a pitch
    });
  });

  it('anarchy.sid1: the keyboard note is cut on key release (SidMon 1 has no release event; the replayer preview cuts)', async () => {
    const song = parseSidMon1File(buf.slice(0), 'anarchy.sid1');
    const inst = song.instruments.find((x) => x.id === 9) as unknown as { sidmon1: Parameters<typeof serializeSidMon1Config>[0] };
    const { proc, send, handle } = await previewVoiceNote('sidmon1', 'SidMon1', serializeSidMon1Config(inst.sidmon1), 40, 100, exposeHeapTransform);
    renderTicks(proc, 2);
    await send({ type: 'noteOff', handle });
    expect(Math.max(...renderTicks(proc, 1).map(Math.abs))).toBe(0);
  });
});

// ── Instrument gain ────────────────────────────────────────────────────────────

describe('synth voices that already render at the replayer level carry no extra gain', () => {
  it('FC and SidMon 1 synth instruments sit at 0 dB (the voices are the replayer voice, level for level)', async () => {
    const fc = await parseFCFile(ab(bytes('anthrox.fc')), 'anthrox.fc');
    const sm1 = parseSidMon1File(songBuffer('public/data/songs/formats/anarchy.sid1').slice(0), 'anarchy.sid1');
    for (const [song, type] of [[fc, 'FCSynth'], [sm1, 'SidMon1Synth']] as const) {
      const synths = song.instruments.filter((i) => i.synthType === type);
      expect(synths.length, type).toBeGreaterThan(0);
      synths.forEach((i) => expect(i.volume, `${type} ${i.id}`).toBe(0));
    }
  });
});

// ── SidMon 2 ───────────────────────────────────────────────────────────────────

describe('SidMon 2 sampler instruments play a typed key at the replayer rate of that grid note', () => {
  it('bruno_time.sid2: grid note x (XM) is period index x - 12 and plays the sample at 3546895 / period Hz', async () => {
    // The replayer's own table (sidmon2.c s_periods), read from its source.
    const src = readFileSync(resolve(ROOT, 'sidmon2-wasm/src/sd2/sidmon2.c'), 'utf8');
    const table = src.match(/s_periods\[\] = \{([\s\S]*?)\};/)![1].split(',').map((v) => parseInt(v.trim(), 10));
    expect(table.length).toBe(73);
    const song = await parseSidMon2File(songBuffer('public/data/songs/formats/bruno_time.sid2'), 'bruno_time.sid2');
    const withSample = song.instruments.filter((i) => i.sample);
    expect(withSample.length).toBeGreaterThan(0);
    withSample.forEach((inst) => {
      const base = noteToMidi(inst.sample!.baseNote ?? 'C4');
      for (let idx = 1; idx <= 72; idx++) {
        const key = idx + 12 + 11; // grid note idx + 12, key = grid note + 11
        const rate = inst.sample!.sampleRate! * Math.pow(2, (key - base) / 12);
        expect(Math.abs(rate / (3546895 / table[idx]) - 1), `note index ${idx}`).toBeLessThan(0.012);
      }
    });
  });
});

describe('SidMon 2 replayer preview voice (sd2_note_on) is the song voice', () => {
  const buf = songBuffer('public/data/songs/formats/bruno_time.sid2');
  async function previewWorklet() {
    const w = await startWorklet('sidmon2', 'Sd2', exposeHeapTransform);
    await w.send({ type: 'loadModule', moduleData: buf.slice(0) });
    return w;
  }

  it('bruno_time.sid2: the first note of voice 0 typed as its grid note has the song pitch, level and envelope', async () => {
    const song = await parseSidMon2File(buf.slice(0), 'bruno_time.sid2');
    const cell = song.patterns[song.songPositions[0]].channels[0].rows[0];
    expect(cell.note).toBeGreaterThan(0);
    const speed = song.initialSpeed;
    const ticks = 4 * speed - 1; // the voice's next note is 4 rows on
    const sw = await previewWorklet();
    for (let c = 1; c < 4; c++) await sw.send({ type: 'setChannelGain', channel: c, gain: 0 });
    const s = fromOnset(renderTicks(sw.proc, ticks + 20, 0), 0, ticks);
    const pw = await previewWorklet();
    await pw.send({ type: 'noteOn', instrument: cell.instrument - 1, note: cell.note - 12, velocity: 100 });
    compare('SM2 voice 0', s, renderTicks(pw.proc, ticks, 0), ticks, { pitchCents: 40, level: 0.8, tick: 1 });
  });

  it('bruno_time.sid2: the keyboard note is cut on key release and the song voice is not retriggered meanwhile', async () => {
    const pw = await previewWorklet();
    await pw.send({ type: 'noteOn', instrument: 0, note: 38, velocity: 100 });
    // The sequencer stands still while a key is held: the first tick's envelope is not repeated at the next row.
    const held = rmsPerTick(renderTicks(pw.proc, 14, 0), 14);
    expect(Math.abs(db(held[5], held[0])), 'the note is not restarted at the next row').toBeGreaterThan(0.5);
    await pw.send({ type: 'noteOff' });
    expect(Math.max(...renderTicks(pw.proc, 1, 0).map(Math.abs))).toBe(0);
  });
});
