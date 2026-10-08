/**
 * A key on a Hippel ST instrument plays what the song plays (K9, "every instrument sounds on the keyboard").
 *
 * The keyboard player starts the instrument with the player's own note-start code, on a note byte the
 * key stands for. For every instrument a song starts on a clean row (no portamento or transpose bits,
 * no step attenuation), the YM registers of the song's voice from the note on are the registers
 * of the keyboard voice for the same instrument and note, tick for tick, until the voice's next event;
 * and the sound that makes - the song voice soloed against the key - is within 50 cents and 2 dB.
 * Then every instrument of every corpus song sounds on a key, or is silent in the song too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HstSongEdit, hstVolSeqCount } from '@/lib/import/formats/JochenHippelSTSong';
import { hstStep, runHstSequencer, hstSubsongRange, HST_VOICES } from '@/lib/import/formats/JochenHippelSTModule';
import { loadHippelStNode, HST_YM_REGS } from '@/engine/hippelst/hippelStNodeCore';
import { fundamentalHz } from './keyboardPreviewHarness';

const SONGS: Array<[string, string]> = [
  ['hippel-st', 'crown arabia.hst'], ['hippel-st', 'crown england.hst'], ['hippel-st', 'crown japan.hst'],
  ['hippel-st', 'crown russia.hst'], ['hippel-st', 'crown viking.hst'], ['hippel-st', 'demo music10.sog'],
  ['formats', 'astaroth.sog'], ['hippel-st-coso', 'ghostbattle titletune.soc'],
];

const SR = 48000;
const FPT = SR / 50;
const rms = (x: Float32Array): number => { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / Math.max(1, x.length)); };

/** The registers one voice shows: period (2), volume, and its tone/noise mixer bits, as one number per tick. */
function voiceView(regs: Uint8Array, tick: number, voice: number): number[] {
  const r = (n: number): number => regs[tick * HST_YM_REGS + n];
  return [r(voice * 2), r(voice * 2 + 1), r(8 + voice), (r(7) >> voice) & 1, (r(7) >> (voice + 3)) & 1];
}

describe('Hippel ST: a key plays the instrument the way the song does', () => {
  for (const [dir, file] of SONGS) {
    it(`${file}: the key's registers are the song voice's, and every instrument sounds`, { timeout: 120000 }, async () => {
      const src = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs', dir, file)));
      const edit = new HstSongEdit(src);
      const m = edit.module;
      const native = await loadHippelStNode(edit.image);
      const key = await native.key();
      const nInst = hstVolSeqCount(m);

      let compared = 0;
      let audioChecked = 0;
      const bad: string[] = [];
      const audioBad: string[] = [];
      for (let sub = 0; sub < native.song.subsongs; sub++) {
        const r = hstSubsongRange(m, sub);
        let play;
        try { play = runHstSequencer(m, r.first, r.last, r.speed || 4, 4000); } catch { continue; }
        const songRegs = native.run(sub, Math.min(2400, play.rows * (r.speed || 4) + 8));
        const doneInst = new Set<number>();
        for (let v = 0; v < HST_VOICES; v++) {
          const ev = play.events[v];
          for (let k = 0; k < ev.length; k++) {
            const e = ev[k];
            if (e.kind !== 'note' || e.note >= 0x80 || e.note < 2 || (e.info & 0xe0) !== 0) continue;
            // The voice's attenuation: the last $Fx command its steps have given since the subsong began.
            let att = 0;
            for (let st = r.first; st <= e.step; st++) { const c = hstStep(m, st, v).command; if ((c & 0xf0) === 0xf0) att = c & 15; }
            const inst = ((e.info & 0x1f) + e.soundTranspose) & 0xff;
            if (inst >= nInst || doneInst.has(inst)) continue;
            const t0 = play.rowTicks[e.row];
            const nextRow = k + 1 < ev.length ? ev[k + 1].row : play.rows;
            const span = Math.min(40, play.rowTicks[Math.min(nextRow, play.rowTicks.length - 1)] - t0 - 1);
            if (span < 6 || (t0 + 1 + span) * HST_YM_REGS > songRegs.length) continue;
            doneInst.add(inst);
            const keyRegs = key.regs(inst, e.note, span, e.transpose & 0xff, att);
            for (let t = 0; t < span; t++) {
              const a = voiceView(keyRegs, t, 0);
              const b = voiceView(songRegs, t0 + 1 + t, v);
              // The first tick after a note start still carries the voice's previous volume (the
              // player resets it only when the volume sequence first steps): a key has none.
              if (t === 0) { a[2] = 0; b[2] = 0; }
              if (a.join() !== b.join()) { bad.push(`sub ${sub} voice ${v} inst ${inst} note ${e.note} +${t}: key ${a} song ${b}`); break; }
            }
            compared++;
            // The sound: the song with only this voice against the key, both from the note on.
            if (t0 + 1 + span < 500 && audioChecked < 4) {
              audioChecked++;
              const solo = native.render(sub, (t0 + 1 + span) * FPT, SR, 7 & ~(1 << v)).subarray((t0 + 1) * FPT);
              const keyed = key.note(inst, e.note, span * FPT, SR, e.transpose & 0xff, att);
              if (rms(solo) > 1e-4 && rms(keyed) > 1e-4) {
                const dB = 20 * Math.log10(rms(keyed) / rms(solo));
                const fs = fundamentalHz(solo.subarray(0, span * FPT)), fk = fundamentalHz(keyed);
                const cents = fs > 0 && fk > 0 ? 1200 * Math.log2(fk / fs) : 0;
                if (Math.abs(dB) > 2 || Math.abs(cents) > 50) audioBad.push(`inst ${inst}: ${dB.toFixed(2)} dB ${cents.toFixed(1)} cents`);
              }
            }
          }
        }
      }
      expect(bad, 'registers of the key equal the song voice').toEqual([]);
      expect(audioBad, 'key against song voice within 50 cents and 2 dB').toEqual([]);
      expect(compared, 'instruments the song starts cleanly were compared').toBeGreaterThan(0);
      expect(audioChecked, 'the sound of a key was measured against the song voice').toBeGreaterThan(0);

      // Every instrument sounds on a key (a volume above zero in its first second) - or the song never makes it sound either.
      const song = native.song.song;
      const u16 = (o: number): number => (song[o] << 8) | song[o + 1];
      const u32 = (o: number): number => ((song[o] << 24) | (song[o + 1] << 16) | (song[o + 2] << 8) | song[o + 3]) >>> 0;
      const volTable = u32(8);
      const silent: number[] = [];
      const wrong: number[] = [];
      for (let inst = 0; inst < nInst; inst++) {
        const regs = key.regs(inst, 36, 50);
        let loud = false;
        for (let t = 0; t < 50 && !loud; t++) loud = (regs[t * HST_YM_REGS + 8] & 0x1f) > 0;
        // The sequence data: five header bytes, then volumes until a command (>= $E0). A sequence whose
        // volumes are all zero is a rest (the song's note cut), and plays silence on a key as in the song.
        const at = native.song.shortPointers ? u16(volTable + inst * 2) : u32(volTable + inst * 4);
        let hasVolume = false;
        for (let o = at + 5; o < Math.min(song.length, at + 64) && song[o] < 0xe0 && !hasVolume; o++) hasVolume = song[o] > 0;
        if (!loud) silent.push(inst);
        if (hasVolume !== loud) wrong.push(inst);
      }
      console.log(`[hippelStKeys] ${file}: ${nInst} instruments, ${compared} compared with the song voice, silent on a key: ${silent.join(',') || 'none'}`);
      expect(wrong, 'an instrument is silent on a key exactly when its volume sequence has no volume').toEqual([]);
    });
  }
});
