import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { traceSid, type SidTrace } from '../formats/SIDParser';
import type { VoiceFrame } from '../formats/sidTraceDecode';
import { sidTraceToGoatTracker } from '../formats/sidTraceToGoatTracker';
import { writeGoatTrackerSng } from '../formats/GoatTrackerSid';
import { scoreSidTrace, createHeadlessGT, type HeadlessGT } from '../formats/sidTraceScore';

const DIR = 'public/data/songs/sid';
/** Frames compared per tune (the first minute of a PAL tune); keeps a run short. */
const FRAMES = 3000;
const RESULTS = process.env.SID_SCORE_RESULTS;

function traceOf(file: string) {
  const bytes = readFileSync(join(DIR, file));
  const trace = traceSid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  expect(trace).not.toBeNull();
  return trace!;
}

describe('SID trace scorer', () => {
  it('refuses a second song on one engine (the bridge keeps channel state between songs)', async () => {
    const trace = traceOf('eco-fog-goattracker2.sid');
    const built = sidTraceToGoatTracker(trace);
    const gt = await createHeadlessGT();
    const sng = writeGoatTrackerSng(built.song, built.settings);
    gt.play(sng, 10, 1, false);
    expect(() => gt.play(sng, 10, 1, false)).toThrow(/one song/);
  }, 60_000);

  it('aligns a negative frame offset and ignores pan / unused register bits', () => {
    // Wizball's notes start on frame 0: the GT startup latency makes the offset negative.
    const trace = traceOf('galway-wizball.sid');
    const built = sidTraceToGoatTracker(trace);
    expect(built.frameOffset).toBeLessThan(0);
    // A perfect replay: snapshot i is trace frame i + frameOffset, with the pan nibble set.
    const perfect: HeadlessGT = {
      play: (_s, frames) => Array.from({ length: frames }, (_, i) => {
        const t = i + built.frameOffset;
        const r = t >= 0 && t < trace.frames ? trace.chipRegs[t].slice() : new Uint8Array(32);
        for (const reg of [3, 10, 17]) r[reg] = (r[reg] & 0x0f) | 0x50;
        r[21] |= 0xf8;
        return r;
      }),
    };
    const s = scoreSidTrace(trace, built, perfect, FRAMES);
    expect(s.lag).toBe(0);
    expect(s.score).toBe(1);
  });
});

const CLOCK = 985248;
const freqOf = (midi: number) => Math.round(440 * 2 ** ((midi - 69) / 12) * 16777216 / CLOCK);

/** Synthetic voice-0 trace with register snapshots; voices 1 and 2 silent. */
function synthTrace(v0: Array<Partial<VoiceFrame>>): SidTrace {
  const blank: VoiceFrame = { freq: 0, pulse: 0, control: 0, ad: 0, sr: 0, cutoff: 0, resRoute: 0, modeVol: 0x0f };
  const voice = v0.map((o) => ({ ...blank, ...o }));
  const silent = voice.map(() => ({ ...blank }));
  const chipRegs = voice.map((f) => {
    const r = new Uint8Array(32);
    r.set([f.freq & 0xff, f.freq >> 8, f.pulse & 0xff, f.pulse >> 8, f.control, f.ad, f.sr]);
    r[24] = 0x0f;
    return r;
  });
  return {
    voices: [voice, silent, silent], chipRegs,
    frameRate: 50, chips: 1, chipBases: [0xd400], chipModels: ['6581'], clock: CLOCK, frames: voice.length,
  };
}

describe('GoatTracker frequency programs', () => {
  it('reproduces vibrato and an off-table tuning exactly through wavetable portamento rows', async () => {
    // Four 24-frame notes (gate 22 frames), tuned 3 above the GT table, with a +-12 triangle vibrato.
    const vib = [0, 6, 12, 6, 0, -6, -12, -6];
    const v0: Array<Partial<VoiceFrame>> = [];
    for (let i = 0; i < 40; i++) v0.push({});
    for (const midi of [48, 50, 52, 53]) {
      for (let t = 0; t < 24; t++) {
        v0.push({ freq: freqOf(midi) + 3 + vib[t % 8], pulse: 0x800, control: t < 22 ? 0x41 : 0x40, ad: 0x09, sr: 0xa0 });
      }
    }
    for (let i = 0; i < 40; i++) v0.push({ pulse: 0x800, control: 0x40, ad: 0x09, sr: 0xa0 });
    const trace = synthTrace(v0);
    const built = sidTraceToGoatTracker(trace);
    const s = scoreSidTrace(trace, built, await createHeadlessGT());
    // Two misses per note are structural: the note-init frame (GT writes freqtbl[note]) and the
    // gate-off frame (one wavetable row per frame: the waveform row wins over the portamento row).
    // Without frequency tracking 101 of the changes miss.
    expect(s.perClass.freq.changes).toBeGreaterThan(60);
    expect(s.perClass.freq.changes - s.perClass.freq.exact).toBeLessThanOrEqual(8);
  });
});

describe('GoatTracker conversion of a SID trace replays in the GTUltra core', () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sid')).sort()) {
    it(`${file}: replay score`, async () => {
      const trace = traceOf(file);
      const built = sidTraceToGoatTracker(trace, file);
      const gt = await createHeadlessGT();
      let replayed = 0;
      const counting = { play: (...a: Parameters<HeadlessGT['play']>) => { const r = gt.play(...a); replayed = r.length; return r; } };
      const s = scoreSidTrace(trace, built, counting, FRAMES);
      // Sentinel: the GT core produced the frames that were compared.
      expect(replayed).toBeGreaterThanOrEqual(s.frames);
      expect(s.changes).toBeGreaterThan(0);
      const row = {
        file, fpr: built.framesPerRow, offset: built.frameOffset, notes: built.noteCount, instruments: built.instrumentCount,
        programFrames: built.programFrames, shared: built.sharedPrograms, warnings: built.warnings,
        score: +s.score.toFixed(4), tolerant: +s.tolerantScore.toFixed(4), lag: s.lag, frames: s.frames, changes: s.changes,
        perClass: Object.fromEntries(Object.entries(s.perClass).map(([k, v]) => [k, { n: v.changes, exact: v.changes ? +(v.exact / v.changes).toFixed(3) : null, tol: v.changes ? +(v.tolerant / v.changes).toFixed(3) : null }])),
        misses: s.firstMisses.slice(0, 6),
      };
      console.log('SIDSCORE ' + JSON.stringify(row));
      if (RESULTS) {
        const all = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) as Array<{ file: string }> : [];
        writeFileSync(RESULTS, JSON.stringify([...all.filter((r) => r.file !== file), row], null, 1));
      }
    }, 300_000);
  }
});
