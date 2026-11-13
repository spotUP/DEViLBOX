/**
 * Medley keyboard voice (nuade-wasm patch 0002, nw_key_*; findings thoughts/spot/2026-11-13_medley-instruments.md).
 *
 * combat.mso instruments imported as empty Samplers and were silent on the keyboard: Medley had no per-note voice.
 * Measured on the real Nuade.wasm: the song's module on a parked second medley player, one key at a time through the
 * replayer's own instrument command and note start. Per instrument type (Sample, Looped, Synth, OneShot) a key sounds;
 * nothing plays with no key down; a closed keyboard voice starts nothing. The parser hands the
 * instruments to MedleySynth (a keyboard voice), so the dedicated-engine retag no longer flattens them to Sampler.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { cstr, heapBytes } from '../nuade/nuadeModule';
import { medleyInstrumentList, medleyInstrumentType, medleySoundingForGridNote, medleyTables } from '@/lib/import/formats/medleyGrid';
import { parseMedleyFile } from '@/lib/import/formats/MedleyParser';
import { KEYBOARD_VOICE_SYNTHS } from '@/lib/import/parsers/withFallback';

const ROOT = join(__dirname, '../../..');
const FILE = 'combat.mso';
const bytes = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/medley', FILE)));
const RATE = 48000;

function rms(nu: NuadeHeadless, frames: number): number {
  const m = nu.m;
  const block = 1024;
  const ptr = m._malloc(block * 2 * 4);
  let sum = 0, count = 0;
  for (let done = 0; done < frames; done += block) {
    const n = m._nw_key_render(ptr, block);
    const out = m.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + n * 2);
    for (const v of out) { sum += v * v; count++; }
  }
  m._free(ptr);
  return count ? Math.sqrt(sum / count) : 0;
}

describe('Medley keyboard voice (combat.mso)', () => {
  const tables = medleyTables(bytes)!;
  const list = medleyInstrumentList(bytes);

  it('a key sounds per instrument type, and nothing plays with no key down', async () => {
    const nu = await NuadeHeadless.create(RATE);
    const m = nu.m;
    expect(m._nw_key_open(heapBytes(m, bytes), bytes.length, cstr(m, FILE), cstr(m, 'medley'), 0)).toBe(0);
    expect(rms(nu, RATE / 2)).toBe(0);
    const byType = new Map<string, number>();
    for (const { number } of list) {
      const type = medleyInstrumentType(bytes, tables, number);
      if (type && !byType.has(type)) byType.set(type, number);
    }
    expect([...byType.keys()].sort()).toEqual(['Looped', 'OneShot', 'Sample', 'Synth']);
    for (const [type, instrument] of byType) {
      const sounding = medleySoundingForGridNote(bytes, tables, instrument, 25); // C-2
      expect(sounding, type).not.toBeNull();
      expect(m._nw_key_on(instrument, sounding!), type).toBe(1);
      expect(rms(nu, RATE / 4), type).toBeGreaterThan(1e-4);
      m._nw_key_off();
      rms(nu, RATE * 3); // release runs out
    }
    m._nw_key_close();
    expect(m._nw_key_on(list[0]!.number, 40)).toBe(0);
  });

  it('a non-medley song opens no keyboard voice', async () => {
    const nu = await NuadeHeadless.create(RATE);
    const m = nu.m;
    const bp = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/formats/antidust.bp3')));
    expect(m._nw_key_open(heapBytes(m, bp), bp.length, cstr(m, 'antidust.bp3'), cstr(m, 'soundmon'), 0)).toBe(-4);
  });

  it('the parser hands every instrument to MedleySynth with its table number and type', async () => {
    const song = await parseMedleyFile(bytes.slice().buffer, FILE);
    expect(song.instruments.length).toBe(list.length);
    for (const inst of song.instruments) {
      expect(inst.synthType).toBe('MedleySynth');
      expect((inst.metadata as unknown as { medleyInstrument: number }).medleyInstrument).toBe(inst.id);
    }
    expect(KEYBOARD_VOICE_SYNTHS.has('MedleySynth')).toBe(true);
  });
});
