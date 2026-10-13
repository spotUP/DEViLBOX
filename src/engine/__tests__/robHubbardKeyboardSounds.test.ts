/**
 * K7 (owner, 2026-10-07): in rob-hubbard/skateordie.rh the instruments are SILENT on the keyboard.
 *
 * Cause: the module plays through UADE, so the import (withFallback, injectUADE branch) tagged every
 * instrument UADEEditableSynth, whose key plays nothing (UADESynth.triggerAttack is keyOnWholeSongPlayer).
 * Rob Hubbard was the one keyboard-voice format missing from NATIVE_AUDITION_SYNTHS.
 *
 * The path a key takes: file -> parseModuleToSong (the real import) -> the instrument's synth class ->
 * triggerAttack(note NAME a key produces) -> the engine's real noteOn message -> the replayer worklet -> audio.
 * One sentinel proves the worklet received the key (a noteOn reached it); the rest is measured on the audio:
 * each of instruments 1..3 sounds on three keys, and a key an octave up plays the sample at twice the rate
 * (its one-shot sample ends in half the time), a tone up in 2^(2/12) of it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT } from './workletHarness';
import { renderTicks, chainedHeapTransform, FPT } from './keyboardPreviewHarness';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { pinEditPathEngine } from './helpers/pinEditPathEngine';

// Edit-path test: guards the engine that takes the edit, whatever the playback verdicts make the default.
pinEditPathEngine('robhubbard', 'soundmaster', 'hippel', 'sidmon2', 'instereo1', 'soundmon');

vi.mock('@/utils/audio-context', async (orig) => {
  const actual = await orig<typeof import('@/utils/audio-context')>();
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { ...actual, getDevilboxAudioContext: () => ({ createGain: gain }) };
});

interface Inst { id: number; synthType?: string; robHubbard?: unknown }

/** The real engine class with its worklet node replaced by the harness: its own methods build the messages. */
async function engineOver(send: (m: unknown) => void): Promise<void> {
  const { RobHubbardEngine } = await import('@/engine/robhubbard/RobHubbardEngine');
  const fake = Object.create(RobHubbardEngine.prototype) as Record<string, unknown>;
  fake.workletNode = { port: { postMessage: (m: unknown) => send(m) } };
  fake.output = { connect() {}, disconnect() {} };
  fake.ready = async () => {};
  fake.sendMessage = (m: unknown) => send(m);
  fake.waitForPlayerHandle = async () => 0; // a fresh worklet hands out handle 0
  vi.spyOn(RobHubbardEngine, 'getInstance').mockReturnValue(fake as never);
}

/** Frames of audible output after the last silence: the one-shot sample's length at the key's pitch. */
const soundingFrames = (x: Float32Array): number => {
  let last = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 1e-4) last = i;
  return last + 1;
};

describe('Rob Hubbard skateordie.rh: a key on an instrument sounds, through the real import and key path', () => {
  it('instruments 1..3 are Rob Hubbard voices after the import, and keys C2, D2, C3 sound at the pitches the keys are', { timeout: 120000 }, async () => {
    const f = readFileSync(resolve(ROOT, 'public/data/songs/rob-hubbard/skateordie.rh'));
    const song = await parseModuleToSong(new File([f], 'skateordie.rh'));
    const insts = song.instruments as unknown as Inst[];
    for (const id of [1, 2, 3]) {
      expect(insts.find((i) => i.id === id)?.synthType, `instrument ${id} keeps its keyboard voice (not UADEEditableSynth, whose key plays nothing)`).toBe('RobHubbardSynth');
    }

    const { RobHubbardSynth } = await import('@/engine/robhubbard/RobHubbardSynth');
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    for (const id of [1, 2, 3]) {
      const w = await startWorklet('robhubbard', 'RobHubbard', chainedHeapTransform);
      let noteOns = 0;
      await engineOver((m) => { if ((m as { type?: string }).type === 'noteOn') noteOns++; void w.send(m); });
      const synth = new RobHubbardSynth();
      await synth.setInstrument(insts.find((i) => i.id === id)!.robHubbard as never);
      const frames: number[] = [];
      for (const key of ['C2', 'D2', 'C3']) {
        Object.defineProperty(process, 'versions', { value: {}, configurable: true });
        try { synth.triggerAttack(key, 0, 1); await new Promise((r) => setTimeout(r, 30)); } finally { Object.defineProperty(process, 'versions', versions); }
        const out = renderTicks(w.proc, 120, 0);
        const level = Math.max(...Array.from({ length: 120 }, (_, t) => { let s = 0; for (let i = t * FPT; i < (t + 1) * FPT; i++) s += out[i] * out[i]; return Math.sqrt(s / FPT); }));
        expect(level, `instrument ${id} key ${key} sounds`).toBeGreaterThan(0.005);
        frames.push(soundingFrames(out));
        synth.triggerRelease();
        await new Promise((r) => setTimeout(r, 30));
        renderTicks(w.proc, 2, 0);
      }
      expect(noteOns, `instrument ${id}: three key presses reached the worklet`).toBe(3);
      expect(frames[0] / frames[2], `instrument ${id}: C3 plays the sample in half the time of C2 (${frames.join(', ')} frames)`).toBeGreaterThan(1.8);
      expect(frames[0] / frames[2], `instrument ${id}: C3 an octave above C2`).toBeLessThan(2.2);
      expect(frames[0] / frames[1], `instrument ${id}: D2 a tone above C2`).toBeGreaterThan(1.07);
      expect(frames[0] / frames[1], `instrument ${id}: D2 a tone above C2`).toBeLessThan(1.18);
    }
  });
});
