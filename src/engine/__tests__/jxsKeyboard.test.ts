/**
 * JayTrax keyboard, through the path a key takes (owner: JayTrax instruments did not play from the computer
 * keyboard; synthType 'JxsWasmSynth' is a whole-song type, ToneEngine built no instrument for it):
 *
 *   popcorn.jxs -> parseModuleToSong (the real import path: must keep the keyboard voice, not flatten to an
 *   empty Sampler) -> InstrumentFactory builds the instrument -> triggerAttack(note name a key produces)
 *   -> JxsEngine.noteOn message {instrument, note} to the worklet.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { useFormatStore } from '@/stores/useFormatStore';

vi.mock('@/utils/audio-context', async (orig) => {
  const actual = await orig<typeof import('@/utils/audio-context')>();
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { ...actual, getDevilboxAudioContext: () => ({ createGain: gain }) };
});

describe('JayTrax keyboard', () => {
  it('imported instruments keep a keyboard voice; a key reaches the engine with the instrument and note', async () => {
    const name = 'popcorn.jxs';
    const b = readFileSync(resolve(import.meta.dirname, '../../../public/data/songs/formats', name));
    const song = await parseModuleToSong(new File([b], name));
    const inst = song.instruments.find((i) => i.synthType === 'JxsSynth');
    expect(inst, 'import keeps JxsSynth').toBeDefined();
    expect(song.instruments.every((i) => i.synthType !== 'Sampler')).toBe(true);

    const { JxsEngine } = await import('@/engine/jxs/JxsEngine');
    const sent: Array<Record<string, unknown>> = [];
    const fake = Object.create(JxsEngine.prototype) as Record<string, unknown>;
    fake.workletNode = { port: { postMessage: (m: Record<string, unknown>) => sent.push(m) } };
    fake.output = { connect() {}, disconnect() {} };
    fake.ready = async () => {};
    vi.spyOn(JxsEngine, 'getInstance').mockReturnValue(fake as never);

    // The store transition a song load makes (applySong -> applyEditorMode) puts the module bytes where the voice reads them.
    useFormatStore.getState().applyEditorMode(song as never);
    expect(useFormatStore.getState().jxsFileData, 'load stores the module bytes').toBeTruthy();

    const { InstrumentFactory } = await import('@/engine/InstrumentFactory');
    const synth = InstrumentFactory.createInstrument(inst as never) as unknown as {
      name: string; triggerAttack(n: string): void; triggerRelease(): void;
    };
    expect(synth.name).toBe('JxsSynth');

    synth.triggerAttack('C4');
    const on = sent.filter((m) => m.type === 'noteOn');
    expect(on).toHaveLength(1);
    expect(on[0].instrument).toBe(inst!.id);
    expect(on[0].note).toBe(60 - 11); // C4 = MIDI 60; the grid shows note 1 as MIDI 12
    expect(sent.some((m) => m.type === 'previewLoad')).toBe(true);

    synth.triggerRelease();
    expect(sent.some((m) => m.type === 'noteOff')).toBe(true);
  });
});
