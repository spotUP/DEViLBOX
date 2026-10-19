/**
 * K6 / K8: a key on an instrument of a UADE-only (compiled 68k) player plays the sample that player plays.
 *
 * These formats have no replayer of their own in the repo, so there is no per-instrument voice to call. What
 * they have is Paula: every sample the song plays is a (pointer, length) pair the player writes to the audio
 * registers, and its bytes are in chip RAM. The import reads those writes (UADE worklet scanPaulaSamples),
 * ties an attack to the loop written after it, and gives each sample a Sampler instrument that plays by
 * period; the grid's instrument column names them. A key is then an ordinary Sampler key.
 *
 * Path measured: file -> parseModuleToSong (the real import; UADEEngine.getInstance forwards to a real UADE
 * worklet, uadeImportHarness) -> the instrument -> ToneEngine.triggerNoteAttack with the note NAME of the key
 * (real Web Audio, rendered offline) -> audio. Against the song: the same file played by UADE with all voices
 * but one muted, from the sample's first note.
 *
 * Per format:
 *  - every sample the song starts is an instrument: bytes and loop equal the Paula scan's;
 *  - the grid names notes in the one Amiga naming and names instruments that have the sample;
 *  - the key has the pitch and level Paula gives the sample at that note, and, where the song's first note
 *    is steady (it is what Paula makes of the sample), the pitch (50 cents) and level (2 dB) of the song voice;
 *  - a held key sounds for as long as it is held and no key reaches UADE.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { importThroughUade } from './uadeImportHarness';
import { songBuffer } from './workletHarness';
import { fundamentalHz } from './keyboardPreviewHarness';
import { periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';
import { xmNoteToToneJS } from '@/lib/xmConversions';
import { SR, type Shape, sameSample, isolatedVoice, renderKeys, paulaVoice, rms } from './uadeKeyHarness';

installRealWebAudio();
resolveWorkletsFromPublic();
servePublicToFetch();

const FORMATS: Array<{ name: string; file: string; companions?: Record<string, string>; minVoices: number; minSteady: number; minGridCover: number; nativeGrid?: boolean }> = [
  { name: 'Delitracker Custom bards tale.cus (K6)', file: 'delitracker-custom/bards tale.cus', minVoices: 1, minSteady: 1, minGridCover: 0.8 },
  { name: 'Fred Editor (Gray) eco.gray', file: 'fred-gray/eco.gray', minVoices: 1, minSteady: 0 /* modulated synth voices */, minGridCover: 0.8 },
  { name: 'Mark Cooksey mighty bombjack.mc', file: 'mark-cooksey/mighty bombjack.mc', minVoices: 2, minSteady: 1, minGridCover: 0.8 },
  { name: 'Rob Hubbard ST battleships.rho', file: 'rob-hubbard-st/battleships.rho', minVoices: 1, minSteady: 0 /* modulated synth voices */, minGridCover: 0.8 },
  { name: 'Jeroen Tel stormlord title.jt', file: 'jeroen-tel/stormlord title.jt', minVoices: 1, minSteady: 1, minGridCover: 0.8, nativeGrid: true },
  { name: 'Jason Page jpn.fire and ice-1', file: 'jason-page/jpn.fire and ice-1', companions: { 'smp.fire and ice-1': 'jason-page/smp.fire and ice-1' }, minVoices: 1, minSteady: 1, minGridCover: 0.55 /* the rest play constant (silent) waves */ },
];

describe.each(FORMATS)('$name: a key plays the sample the player plays', ({ file, companions, minVoices, minSteady, minGridCover, nativeGrid }) => {
  let song: Awaited<ReturnType<typeof importThroughUade>>['song'];
  let shapes: Shape[];
  let getInstanceCalls: number;
  let getInstance: { mock: { calls: unknown[] } };

  beforeAll(async () => {
    const imp = await importThroughUade(file, companions);
    song = imp.song;
    let found = imp.paulaSamples as Array<Omit<Shape, 'pcm'> & { pcm: Uint8Array }>;
    if (nativeGrid) {
      // A native parser's grid needs no UADE at import: the worklet has no song yet, and the samples are the
      // parser's (from the file), checked here against the bytes the player really plays.
      await imp.send({
        type: 'load', buffer: songBuffer('public/data/songs/' + file), filenameHint: file.split('/')[1], skipScan: true, subsong: 0,
        companions: Object.entries(companions ?? {}).map(([filename, p]) => ({ filename, buffer: songBuffer('public/data/songs/' + p) })),
      });
      await imp.send({ type: 'scanPaulaSamples', requestId: 9001, durationMs: 30000 });
      const msg = imp.posted.filter((m) => (m as { requestId?: number }).requestId === 9001).pop() as unknown as { samples?: Array<Omit<Shape, 'pcm'> & { pcm: ArrayBuffer }>; message?: string };
      expect(msg.samples, `Paula scan: ${msg.message}`).toBeTruthy();
      found = msg.samples!.map((x) => ({ ...x, pcm: new Uint8Array(x.pcm) }));
    }
    shapes = found.map((x) => ({ ...x, pcm: x.pcm.buffer.slice(x.pcm.byteOffset, x.pcm.byteOffset + x.pcm.byteLength) as ArrayBuffer }));
    expect(shapes.length, 'the Paula writes were scanned').toBeGreaterThan(0);
    getInstance = imp.getInstanceSpy;
    getInstanceCalls = getInstance.mock.calls.length;
  }, 600_000);

  it('every sample the song starts is an instrument with its bytes and loop', () => {
    const insts = song.instruments.filter((i) => i.synthType === 'Sampler' && i.sample?.audioBuffer);
    const played = shapes.filter((s) => new Int8Array(s.pcm).some((b, _i, a) => b !== a[0]));
    expect(played.length, 'the song starts samples').toBeGreaterThan(0);
    const missing = played.filter((s) => !insts.some((i) => sameSample(i, s)));
    expect(missing.map((s) => `${s.attackPtr.toString(16)}+${s.attackLen}w x${s.count}`), 'samples without an instrument').toEqual([]);
  });

  it('the grid names an instrument that has the sample, for most notes', () => {
    const withPcm = new Set(song.instruments.filter((i) => i.synthType === 'Sampler' && i.sample?.audioBuffer).map((i) => i.id));
    let notes = 0, ok = 0;
    // an instrument stays on its channel until another is named (the replayer's rule for a note with no instrument)
    const current: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const pi of song.songPositions) {
      song.patterns[pi].channels.forEach((c, ch) => {
        for (const r of c.rows) {
          if (r.instrument > 0) current[ch] = r.instrument;
          if (r.note > 0 && r.note < 97) { notes++; if (withPcm.has(current[ch])) ok++; }
        }
      });
    }
    expect(notes).toBeGreaterThan(50);
    // The grid names notes as every Amiga grid does (428 = C-2 = 25, periodNotes): a key on a grid note then plays the
    // period the song played. Before, the tick reconstruction named them four octaves up (period 428 = 61).
    const named = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.filter((r) => r.note > 0 && r.note < 97).map((r) => r.note)));
    if (!nativeGrid) expect(Math.max(...named), 'highest grid note is inside the period table (72)').toBeLessThanOrEqual(72);
    expect(ok / notes, `notes whose instrument has a sample: ${ok} of ${notes}`).toBeGreaterThan(minGridCover);
  });

  it('the first note of a voice: the key has the pitch and level Paula gives the sample at that note', async () => {
    const insts = song.instruments.filter((i) => i.synthType === 'Sampler' && i.sample?.audioBuffer);
    let measured = 0;
    const seenVoices = new Set<number>();
    for (const sh of [...shapes].sort((a, b) => a.firstChunk - b.firstChunk)) {
      if (seenVoices.has(sh.voice) || measured >= 3) continue;
      seenVoices.add(sh.voice);
      const inst = insts.find((i) => sameSample(i, sh));
      if (!inst) continue;
      const note = periodToNote(sh.period);
      const noteName = xmNoteToToneJS(note)!;
      // the key plays the period of the note it stands for: the song's period to within a semitone
      const keyPeriod = noteToPeriod(note);
      expect(Math.abs(1200 * Math.log2(keyPeriod / sh.period)), `${noteName} against period ${sh.period}`).toBeLessThanOrEqual(50);
      const model = paulaVoice({ ...sh, period: keyPeriod }, 4800);
      // pitch is the bytes at the period: measured on a constant-volume render, since the volume steps of an
      // enveloped player's note (the model's trajectory) are not a periodic signal the estimator can read
      const pitchModel = paulaVoice({ ...sh, period: keyPeriod, volumes: [] }, 4800);
      const key = await renderKeys(inst, [{ note: noteName, at: 0 }], 0.5);
      const keyOn = key.findIndex((v) => Math.abs(v) > 0.0005);
      const keyWin = key.subarray(Math.max(0, keyOn), Math.max(0, keyOn) + 4800);
      const mHz = fundamentalHz(pitchModel.subarray(0, 3800), 30, 3000), kHz = fundamentalHz(keyWin.subarray(0, 3800), 30, 3000);
      if (!(mHz > 0)) continue; // a very short or noise-like wave has no fundamental
      measured++;
      expect(Math.abs(1200 * Math.log2(kHz / mHz)), `${noteName} voice ${sh.voice}: key ${kHz.toFixed(1)} Hz, Paula ${mHz.toFixed(1)} Hz`).toBeLessThan(50);
      // Paula holds each byte, the Sampler interpolates between them: that lowers the rms of a bright wave by up to ~3 dB
      // (the 2 dB bound is held against the song voice, in the next test). The key plays flat at the instrument's
      // volume, the sample's peak; the model plays the volume trajectory the player wrote (Jeroen Tel's ADSR starts a
      // note at an attack step below the peak), so the level is compared over the note's first 100 ms as a whole.
      expect(Math.abs(20 * Math.log10(rms(keyWin, 0, 4800) / rms(model, 0, 4800))), `${noteName} voice ${sh.voice}: key level against Paula's, dB`).toBeLessThan(3.5);
    }
    expect(measured, 'voices with a measurable first note').toBeGreaterThanOrEqual(minVoices);
  }, 600_000);

  it.runIf(minSteady > 0)('the song voice is that Paula model, and the key matches the song voice (pitch 50 cents, level 2 dB)', async () => {
    const insts = song.instruments.filter((i) => i.synthType === 'Sampler' && i.sample?.audioBuffer);
    let steadyVoices = 0;
    const skipped: string[] = [];
    const seenVoices = new Set<number>();
    for (const sh of [...shapes].sort((a, b) => a.firstChunk - b.firstChunk)) {
      if (seenVoices.has(sh.voice)) continue;
      seenVoices.add(sh.voice);
      const inst = insts.find((i) => sameSample(i, sh));
      if (!inst) continue;
      const songAudio = await isolatedVoice(file, companions, sh.voice, 4);
      let on = Math.max(0, Math.round(sh.firstChunk * 480) - 2400);
      while (on < songAudio.length && Math.abs(songAudio[on]) < 0.003) on++;
      const win = songAudio.subarray(on, on + 4800);
      // Only a steady voice is compared (the K2 tests compare plain first notes the same way): the song voice
      // must be what Paula makes of this sample at the period it started with. A voice that slides, vibratos or
      // arpeggiates, or whose volume moves in its first 100 ms, is not a note a key can name.
      const model = paulaVoice(sh, 4800);
      const sHz = fundamentalHz(win.subarray(0, 3800), 30, 3000), mHz = fundamentalHz(model.subarray(0, 3800), 30, 3000);
      const modelDb = 20 * Math.log10(rms(win, 0, 4800) / rms(model, 0, 4800));
      if (!(sHz > 0 && mHz > 0 && Math.abs(1200 * Math.log2(mHz / sHz)) < 50 && Math.abs(modelDb) < 2)) {
        skipped.push(`voice ${sh.voice} ptr ${sh.attackPtr.toString(16)}: song ${sHz.toFixed(0)} Hz, model ${mHz.toFixed(0)} Hz, ${modelDb.toFixed(1)} dB`);
        continue;
      }
      const noteName = xmNoteToToneJS(periodToNote(sh.period))!;
      const key = await renderKeys(inst, [{ note: noteName, at: 0 }], 0.5);
      const keyOn = key.findIndex((v) => Math.abs(v) > 0.0005);
      const keyWin = key.subarray(Math.max(0, keyOn), Math.max(0, keyOn) + 4800);
      const kHz = fundamentalHz(keyWin.subarray(0, 3800), 30, 3000);
      steadyVoices++;
      expect(Math.abs(1200 * Math.log2(kHz / sHz)), `${noteName} voice ${sh.voice}: key ${kHz.toFixed(1)} Hz, song ${sHz.toFixed(1)} Hz`).toBeLessThan(50);
      expect(Math.abs(20 * Math.log10(rms(keyWin, 0, 4800) / rms(win, 0, 4800))), `${noteName} voice ${sh.voice}: key level against the song voice, dB`).toBeLessThan(2);
    }
    expect(steadyVoices, `steady first notes (skipped: ${skipped.join('; ')})`).toBeGreaterThanOrEqual(minSteady);
  }, 600_000);

  it('a held key keeps sounding for as long as it is held, and no key reaches UADE', async () => {
    const insts = song.instruments.filter((i) => i.synthType === 'Sampler' && i.sample?.audioBuffer);
    const looped = insts.filter((i) => i.sample?.loop).sort((a, b) => (b.sample!.loopEnd - b.sample!.loopStart) - (a.sample!.loopEnd - a.sample!.loopStart))[0];
    expect(looped, 'the song has a looping sample').toBeTruthy();
    const out = await renderKeys(looped, [{ note: 'C2', at: 0 }], 1.8);
    const first = rms(out, 0, 4800);
    expect(first, 'sounds').toBeGreaterThan(0.002);
    expect(rms(out, SR * 1.4 | 0, SR * 1.8 | 0), 'still sounding 1.4 s into a held key').toBeGreaterThan(first * 0.2);
    expect(getInstance.mock.calls.length, 'keys never ask for the UADE engine').toBe(getInstanceCalls);
  }, 600_000);
});
