/**
 * K8: Richard Joseph (.sng + .ins). The native parser reads the samples from the .ins file; the song plays
 * through UADE, and the import tagged every instrument UADEEditableSynth, whose key plays nothing (withFallback's
 * injectUADE branch), so 24 instruments that held their PCM were silent on the keyboard.
 *
 * Path: file -> parseModuleToSong (real import, UADE worklet behind UADEEngine.getInstance) -> the instrument ->
 * ToneEngine.triggerNoteAttack with the note name (real Web Audio, offline) -> audio; against the same file played
 * by UADE with every voice but one muted, at each voice's first note whose sample is steady (the Paula model of
 * the instrument's bytes at the grid note's period matches the voice).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { importThroughUade } from './uadeImportHarness';
import { songBuffer } from './workletHarness';
import { fundamentalHz } from './keyboardPreviewHarness';
import { periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';
import { xmNoteToToneJS } from '@/lib/xmConversions';
import { instrumentBytes, isolatedVoice, renderKeys, paulaVoice, rms, bestNcc, type Shape } from './uadeKeyHarness';
import type { InstrumentConfig } from '@typedefs/instrument';

installRealWebAudio();
resolveWorkletsFromPublic();
servePublicToFetch();

const FILE = 'richard-joseph/cannon fodder (intro).sng';
const COMPANIONS = { 'cannon fodder (intro).ins': 'richard-joseph/cannon fodder (intro).ins' };

describe('Richard Joseph cannon fodder (intro): a key plays the instrument sample', () => {
  let song: Awaited<ReturnType<typeof importThroughUade>>['song'];

  beforeAll(async () => {
    song = (await importThroughUade(FILE, COMPANIONS)).song;
  }, 300_000);

  it('the instruments that hold the file\'s PCM are Samplers (a UADEEditableSynth key plays nothing)', () => {
    const withPcm = song.instruments.filter((i) => i.sample?.audioBuffer);
    expect(withPcm.length, 'instruments with PCM').toBeGreaterThan(10);
    expect(withPcm.filter((i) => i.synthType !== 'Sampler').map((i) => i.id), 'PCM instruments that are not Samplers').toEqual([]);
  });

  it('each sample the player starts is an instrument with the very bytes (chip RAM), and a key plays it at the pitch and level of Paula (waveform, 3 dB)', async () => {
    // The grid of this format carries notes without instrument numbers, so the instrument of a sample is found by
    // its bytes in the Paula scan (the samples the player started).
    const imp = await importThroughUade(FILE, COMPANIONS);
    // the native parser needs no UADE at import, so the worklet has no song yet
    await imp.send({
      type: 'load', buffer: songBuffer('public/data/songs/' + FILE), filenameHint: FILE.split('/')[1], skipScan: true, subsong: 0,
      companions: Object.entries(COMPANIONS).map(([filename, p]) => ({ filename, buffer: songBuffer('public/data/songs/' + p) })),
    });
    await imp.send({ type: 'scanPaulaSamples', requestId: 4242, durationMs: 30000 });
    const msg = imp.posted.filter((m) => (m as { requestId?: number }).requestId === 4242).pop() as unknown as { samples: Shape[] };
    expect(msg.samples, JSON.stringify(msg)).toBeTruthy();
    const shapes = [...msg.samples].sort((a, b) => a.firstChunk - b.firstChunk);
    expect(shapes.length, 'the player starts samples').toBeGreaterThan(0);
    const found: Array<{ sh: Shape; inst: InstrumentConfig }> = [];
    for (const sh of shapes) {
      const want = new Int8Array(sh.pcm);
      const inst = imp.song.instruments.find((i) => {
        const got = instrumentBytes(i);
        if (!got || got.bytes.length < want.length) return false;
        // the instrument holds the very bytes the player points Paula at (a start part-way into a sample too)
        for (let at = 0; at + want.length <= got.bytes.length; at += 2) {
          let k = 0;
          while (k < want.length && Math.abs(got.bytes[at + k] - want[k]) <= 1) k++;
          if (k === want.length) return true;
        }
        return false;
      });
      if (inst) found.push({ sh, inst });
    }
    expect(found.length, `shapes whose bytes an instrument holds, of ${shapes.length}`).toBeGreaterThanOrEqual(Math.floor(shapes.length * 0.7)); // 11 of 15: the other four sample starts lie outside every described sample (open)
    // 1. The Sampler chain plays an instrument as Paula plays its bytes (the instrument's own loop, which the
    //    format's descriptor holds): pitch 50 cents, level 2 dB, at the period of the note a key stands for.
    let measured = 0;
    for (const { sh, inst } of found.slice(0, 6)) {
      const got = instrumentBytes(inst)!;
      const note = periodToNote(sh.period);
      const noteName = xmNoteToToneJS(note)!;
      const asPlayed: Shape = {
        ...sh, period: noteToPeriod(note), volume: 64 /* the format stores no volume per sample: a key stands for full channel volume */,
        pcm: Int8Array.from(got.bytes).buffer, loopStart: got.loop ? got.loopStart : 0, loopLength: got.loop ? got.loopEnd - got.loopStart : 0,
      };
      const model = paulaVoice(asPlayed, 4800);
      const key = await renderKeys(inst, [{ note: noteName, at: 0 }], 0.5);
      const keyOn = key.findIndex((x) => Math.abs(x) > 0.003);
      const keyWin = key.subarray(Math.max(0, keyOn), Math.max(0, keyOn) + 4800);
      if (rms(model, 0, 2880) < 1e-4) continue;
      measured++;
      // the same waveform at the same pitch (a fundamental is ambiguous by an octave for a wave of two like halves)
      expect(bestNcc(model.subarray(0, 2880), keyWin.subarray(0, 4800), 480), `${noteName} instrument ${inst.id}: key against Paula, waveform correlation`).toBeGreaterThan(0.7); // Paula holds each byte, the Sampler interpolates: a bright wave correlates at ~0.8, an octave off at ~0
      expect(Math.abs(20 * Math.log10(rms(keyWin, 0, 2880) / rms(model, 0, 2880))), `${noteName} instrument ${inst.id}: key level against Paula's, dB`).toBeLessThan(3); // interpolation lowers a bright wave's rms by up to ~3 dB against held bytes
    }
    expect(measured, 'instruments with a measurable pitch').toBeGreaterThanOrEqual(2);

    // 2. The song voice: where a voice's first sample has a pitch the song itself shows, the key has it (50 cents).
    //    (The level of the song voice follows the player's volume envelope, which the format does not store per
    //    sample, so the level is held to Paula's above, not to the song.)
    let againstSong = 0;
    const seen = new Set<number>();
    for (const { sh, inst } of found) {
      if (seen.has(sh.voice)) continue;
      seen.add(sh.voice);
      const songAudio = await isolatedVoice(FILE, COMPANIONS, sh.voice, 8);
      let on = Math.max(0, Math.round(sh.firstChunk * 480) - 2400);
      while (on < songAudio.length && Math.abs(songAudio[on]) < 0.003) on++;
      const sHz = fundamentalHz(songAudio.subarray(on + 2400, on + 2400 + 3800), 30, 3000);
      if (!(sHz > 0)) continue;
      const noteName = xmNoteToToneJS(periodToNote(sh.period))!;
      const key = await renderKeys(inst, [{ note: noteName, at: 0 }], 0.5);
      const keyOn = key.findIndex((x) => Math.abs(x) > 0.003);
      const kHz = fundamentalHz(key.subarray(Math.max(0, keyOn) + 2400, Math.max(0, keyOn) + 2400 + 3800), 30, 3000);
      againstSong++;
      expect(Math.abs(1200 * Math.log2(kHz / sHz)), `${noteName} voice ${sh.voice} instrument ${inst.id}: key ${kHz.toFixed(1)} Hz, song ${sHz.toFixed(1)} Hz`).toBeLessThan(50);
    }
    expect(againstSong, 'voices whose first sample has a pitch in the song').toBeGreaterThanOrEqual(1);
  }, 600_000);
});
