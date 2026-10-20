/**
 * A sample added to a song plays in the pattern (reported 2026-10-20: "i added
 * a sample to devilbox it doesnt play in the pattern").
 *
 * ToneEngine leaves Sampler notes to libopenmpt, which plays the module built
 * at play time. That module had no samples, and the soundlib refused a sample
 * index past the end of its sample list, so every Sampler note in a fresh song
 * was silent during playback while the same note played on the keyboard.
 * The builder now writes each Sampler's WAV into the slot at its id, and an
 * instrument added after the build is written by syncSamplerInstruments.
 *
 * A restored song (reported 2026-10-21: "it plays silent" after a reload)
 * carries each sample only as its saved data URL, since snapshotSong drops the
 * WAV bytes; the module reads the sample from the URL then.
 *
 * Measured on the module the player receives. Fails on revert: without the
 * slot write the sample at the instrument id has length 0.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_CELL, type TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';

const ROOT = resolve(__dirname, '../../..');

const cell = (over: Partial<TrackerCell> = {}): TrackerCell => ({ ...EMPTY_CELL, ...over });

/** A 16-bit mono WAV holding `frames` frames of a square wave. */
function wav(frames: number, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + frames * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + frames * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) v.setInt16(44 + i * 2, (i >> 4) & 1 ? 12000 : -12000, true);
  return buf;
}

const sampler = (id: number, frames: number): InstrumentConfig => ({
  id,
  name: `sample ${id}`,
  synthType: 'Sampler',
  // The WAV is 22050 Hz while sampleRate claims 44100, as on the reported instrument:
  // the pitch must come from the WAV itself.
  sample: { audioBuffer: wav(frames, 22050), baseNote: 'C3', sampleRate: 44100, loop: false, loopStart: 0, loopEnd: 0 },
} as unknown as InstrumentConfig);

describe('a fresh song module carries its Sampler samples', () => {
  beforeAll(() => {
    const wasmBinary = readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.wasm'));
    (0, eval)(readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.js'), 'utf8') + '\n;globalThis.__osl = createOpenMPTSoundlib;');
    const real = (globalThis as unknown as { __osl: (o: object) => Promise<unknown> }).__osl;
    (globalThis as unknown as Record<string, unknown>).createOpenMPTSoundlib = (o: object) => real({ ...o, wasmBinary });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
  });

  it('a Sampler at id 3 is in sample slot 3, pitched to play its WAV rate on its base note', async () => {
    const rows = Array.from({ length: 16 }, () => cell());
    rows[0] = cell({ note: 49, instrument: 3 });
    const song = {
      numChannels: 4,
      patterns: [{ length: 16, channels: [{ rows }, { rows: rows.map(() => cell()) }, { rows: rows.map(() => cell()) }, { rows: rows.map(() => cell()) }] }],
      songPositions: [0],
      instruments: [sampler(3, 1000)],
    };

    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    const data = await bridge.createModuleForSong(song, () => false);
    expect(data).not.toBeNull();

    const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
    const info = await osl.getSampleInfo(3);
    expect(info.length).toBe(1000);
    // Base note C3 is one octave below the note libopenmpt plays at c5Speed.
    expect(info.c5Speed).toBe(44100);
  }, 60000);

  it('a Sampler added after the module was built is written into it', async () => {
    const rows = Array.from({ length: 16 }, () => cell());
    const song = { numChannels: 1, patterns: [{ length: 16, channels: [{ rows }] }], songPositions: [0], instruments: [] };

    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    await bridge.createModuleForSong(song, () => false);
    const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
    const added = sampler(5, 700);
    expect(await bridge.syncSamplerInstruments([added])).toBe(true);
    expect((await osl.getSampleInfo(5)).length).toBe(700);
    // The same buffer again changes nothing.
    expect(await bridge.syncSamplerInstruments([added])).toBe(false);
  }, 60000);

  it('a Sampler restored from a saved song (data URL, no WAV bytes) is written into the module', async () => {
    const rows = Array.from({ length: 16 }, () => cell());
    rows[0] = cell({ note: 49, instrument: 88 });
    const restored = sampler(88, 900);
    const url = `data:audio/wav;base64,${Buffer.from(restored.sample!.audioBuffer!).toString('base64')}`;
    restored.sample = { ...restored.sample!, audioBuffer: undefined, url };
    const song = { numChannels: 4, patterns: [{ length: 16, channels: [{ rows }, { rows }, { rows }, { rows }] }], songPositions: [0], instruments: [restored] };

    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    expect(await bridge.createModuleForSong(song, () => false)).not.toBeNull();
    const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
    expect((await osl.getSampleInfo(88)).length).toBe(900);
  }, 60000);
});
