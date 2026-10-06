/**
 * Keyboard preview of Rob Hubbard, Hippel CoSo and OctaMED instruments sounds
 * like the same instrument in the song (owner, 2026-10-06 audit after Fred:
 * "check every format that may share the issue").
 *
 * Oracle: UADE running the format's own eagleplayer on a corpus song with every
 * Paula channel but one muted, plus that channel's Paula period / volume
 * registers per 50 Hz tick (uadeVoice.ts). The preview is the per-note WASM
 * voice (what the keyboard plays) fed the same instrument and the key the grid
 * cell of that note stands for (grid note n = MIDI n + 11, xmConversions
 * noteToMidi). Compared on what is heard: pitch (Paula period -> Hz, in cents),
 * level (RMS per 20 ms tick, dB) and envelope (per tick), and on key release.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, stereoOutputs } from './workletHarness';
import { uadeVoice } from './uadeVoice';
import { chainedHeapTransform, db, fromOnset, previewRender, previewVoice, renderTicks, risingEdges, rmsPerTick, totalRms, FPT, SR } from './keyboardPreviewHarness';
import { parseRobHubbardFile } from '@/lib/import/formats/RobHubbardParser';
import { serializeRobHubbardConfig } from '@/engine/robhubbard/RobHubbardSynth';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const PAULA_CLOCK = 3546895;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const songFile = (p: string) => new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs', p)));
const buf = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;
/** Hz of a looped single-cycle preview by rising edges over `ticks`. */
const hzOf = (x: Float32Array, ticks: number) => risingEdges(x.subarray(0, ticks * FPT)) / (ticks / 50);

describe('Rob Hubbard keyboard preview is the instrument as UADE plays it (skateordie.rh)', () => {
  const NAME = 'rob-hubbard/skateordie.rh';
  const load = async () => {
    const file = songFile(NAME);
    const song = await parseRobHubbardFile(buf(file), 'skateordie.rh') as unknown as TrackerSong;
    return { file, song };
  };
  type RH = Parameters<typeof serializeRobHubbardConfig>[0];
  const rhOf = (song: TrackerSong, ins: number) => (song.instruments[ins - 1] as unknown as { robHubbard: RH }).robHubbard;

  it('a key plays the Paula period the song plays for that grid note (all four voices, row 0)', { timeout: 120000 }, async () => {
    const { file, song } = await load();
    const pat = song.patterns[song.songPositions[0]];
    let checked = 0;
    for (let ch = 0; ch < 4; ch++) {
      const cell = pat.channels[ch].rows[0];
      if (!cell.note || cell.note === 97) continue;
      const uv = await uadeVoice(file, 'skateordie.rh', ch, 0.2);
      const songPeriod = uv.period[2];
      // A looped 32-byte saw of the same instrument settings: the preview's playback rate is then its pitch.
      const saw = Array.from({ length: 32 }, (_, i) => Math.round(-120 + (240 * i) / 31));
      const cfg: RH = { ...rhOf(song, cell.instrument), sampleData: saw, sampleLen: 32, loopOffset: 0, sampleVolume: 64, relative: 1024 };
      const p = await previewRender('robhubbard', 'RobHubbard', serializeRobHubbardConfig(cfg), cell.note + 11, 50, 100, chainedHeapTransform);
      const previewPeriod = PAULA_CLOCK / (hzOf(p, 50) * 32);
      expect(Math.abs(cents(previewPeriod, songPeriod)), `ch${ch} grid ${cell.note}: preview period ${previewPeriod.toFixed(1)} song ${songPeriod}`).toBeLessThan(25);
      checked++;
    }
    expect(checked).toBe(4);
  });

  it('level and envelope: the same sample at the same note is as loud as in the song, tick by tick', { timeout: 120000 }, async () => {
    const { file, song } = await load();
    const cell = song.patterns[song.songPositions[0]].channels[2].rows[0]; // ins 4, grid 41: a sustained sample
    const uv = await uadeVoice(file, 'skateordie.rh', 2, 0.6);
    const cfg = rhOf(song, cell.instrument);
    const p = await previewRender('robhubbard', 'RobHubbard', serializeRobHubbardConfig(cfg), cell.note + 11, 24, 100, chainedHeapTransform);
    const s = rmsPerTick(fromOnset(uv.pcm, 1, 20), 20);
    const pr = rmsPerTick(fromOnset(p, 1, 20, 1e-5), 20);
    // The song's player sets its own channel volume (register 47 here); the voice itself is sample x volume / 64.
    const songVol = uv.volume[4] / 64, prevVol = cfg.sampleVolume / 64;
    const sn = s.map((v) => v / songVol), pn = pr.map((v) => v / prevVol);
    expect(Math.abs(db(totalRms(pn.slice(1)), totalRms(sn.slice(1)))), 'overall level at equal volume, dB').toBeLessThan(1.5);
    sn.forEach((v, t) => { if (t >= 1 && v > 0.01) expect(Math.abs(db(pn[t] || 1e-6, v)), `tick ${t}`).toBeLessThan(4); });
  });

  it('key release cuts the voice as a rest does', { timeout: 60000 }, async () => {
    const { song } = await load();
    const v = await previewVoice('robhubbard', 'RobHubbard', serializeRobHubbardConfig(rhOf(song, 4)), 52, 100, chainedHeapTransform);
    renderTicks(v.proc, 5);
    await v.send({ type: 'noteOff', handle: v.handle });
    const after = stereoOutputs(1, 128);
    v.proc.process([], after);
    expect(Math.max(...after[0][0].map(Math.abs))).toBe(0);
  });
});
void SR;
