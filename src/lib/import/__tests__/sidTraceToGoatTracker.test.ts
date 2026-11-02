import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { traceSid, type SidTrace } from '../formats/SIDParser';
import { sidTraceToGoatTracker } from '../formats/sidTraceToGoatTracker';
import { parseGoatTrackerSng, writeGoatTrackerSng } from '../formats/GoatTrackerSid';
import type { VoiceFrame } from '../formats/sidTraceDecode';

const CLOCK = 985248;
/** SID freq value for a MIDI note at the PAL clock. */
const freqOf = (midi: number) => Math.round(440 * 2 ** ((midi - 69) / 12) * 16777216 / CLOCK);

function frame(over: Partial<VoiceFrame>): VoiceFrame {
  return { freq: 0, pulse: 0, control: 0, ad: 0, sr: 0, cutoff: 0, resRoute: 0, modeVol: 0x0f, ...over };
}

/** Voice 0: 12 notes of 6 frames (gate 5 frames), each a major-triad arpeggio with a pulse sweep. Voices 1 and 2 silent. */
function syntheticTrace(): SidTrace {
  const v0: VoiceFrame[] = [];
  for (let n = 0; n < 12; n++) {
    const base = 48 + (n % 3);
    for (let i = 0; i < 6; i++) {
      const off = [0, 4, 7][i % 3];
      v0.push(frame({ freq: freqOf(base + off), pulse: 0x800 + i * 16, control: i < 5 ? 0x41 : 0x40, ad: 0x09, sr: 0xa0 }));
    }
  }
  const silent = v0.map(() => frame({}));
  return {
    voices: [v0, silent, silent], chipRegs: v0.map(() => new Uint8Array(32)),
    frameRate: 50, chips: 1, chipBases: [0xd400], chipModels: ['6581'], clock: CLOCK, frames: v0.length,
  };
}

describe('sidTraceToGoatTracker', () => {
  it('turns an arpeggio with a pulse sweep into wave and pulse table rows', () => {
    const r = sidTraceToGoatTracker(syntheticTrace());
    expect(r.framesPerRow).toBe(6);
    expect(r.noteCount).toBe(12);
    const wave = r.song.tables[0];
    // First program: pulse+gate, then +4 and +7 semitones, back to 0, ... gate fall on the last frame.
    expect(wave.left.slice(0, 6)).toEqual([0x41, 0x41, 0x41, 0x41, 0x41, 0x40]);
    expect(wave.right.slice(0, 6)).toEqual([0x80, 4, 7, 0, 4, 7]);
    const pulse = r.song.tables[1];
    expect(pulse.left[0]).toBe(0x88);
    expect(pulse.left[1]).toBe(5);
    expect(pulse.right[1]).toBe(16);
    const ins = r.song.instruments[1];
    expect(ins.ad).toBe(0x09);
    expect(ins.sr).toBe(0xa0);
    expect(ins.ptr[0]).toBeGreaterThan(0);
    expect(r.song.patterns[0][0][2]).toBe(0x0f);
    expect(r.song.patterns[0][0][3]).toBe(6);
  });

  it('round-trips through the .sng writer and parser', () => {
    const r = sidTraceToGoatTracker(syntheticTrace());
    const back = parseGoatTrackerSng(writeGoatTrackerSng(r.song, r.settings));
    expect(back).not.toBeNull();
    expect(back!.orderlists).toEqual(r.song.orderlists);
    expect(back!.tables).toEqual(r.song.tables);
    expect(back!.patterns).toEqual(r.song.patterns);
    expect(back!.instruments.slice(0, r.song.instruments.length)).toEqual(r.song.instruments);
  });

  it('converts a real compiled SID trace', () => {
    const bytes = readFileSync('public/data/songs/sid/eco-fog-goattracker2.sid');
    const trace = traceSid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(trace).not.toBeNull();
    const r = sidTraceToGoatTracker(trace!);
    expect(r.noteCount).toBeGreaterThan(8);
    expect(r.song.orderlists[0]).toHaveLength(trace!.voices.length);
  });
});
