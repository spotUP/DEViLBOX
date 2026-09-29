/**
 * Master presets key their sidechain on the song's drums.
 *
 * `sidechainSource` named a fixed channel, and the kick sits on a different
 * channel in every song, so no preset could say "key on the kick". The value
 * SIDECHAIN_KEY_DRUMS (-2) asks the classifier for the drum channel. And
 * engines without isolation slots (Hippel/TFMX, Sonix, Cinter4, SunTronic)
 * had no key tap at all: it now taps the channel's copy (dub-send) output.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Tone from 'tone';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSoundMonFile } from '@/lib/import/formats/SoundMonParser';
import { classifySongChannels } from '@/bridge/analysis/ChannelNaming';
import type { InstrumentConfig } from '@typedefs/instrument';
import { pickDrumKeyChannel } from '../sidechainKey';
import { ChannelRoutedEffectsManager, setPlayingIsolationEngine } from '../ChannelRoutedEffects';

afterEach(() => setPlayingIsolationEngine(null));

describe('Drums (auto) key', () => {
  it('picks the drum channel of nicktune1.bp (channel 2, index 1)', async () => {
    const b = readFileSync(join(process.cwd(), 'public/data/songs/bp-soundmon-2/nicktune1.bp'));
    const song = await parseSoundMonFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'nicktune1.bp');
    const lookup = new Map(song.instruments.map((i) => [i.id, i as InstrumentConfig]));
    expect(pickDrumKeyChannel(classifySongChannels(song.patterns, lookup))).toBe(1);
  });

  it('prefers the kick, then a kit, then any percussion; none gives own input', () => {
    expect(pickDrumKeyChannel([{ role: 'percussion', subrole: 'hat' }, { role: 'percussion', subrole: 'kick' }])).toBe(1);
    expect(pickDrumKeyChannel([{ role: 'percussion', subrole: 'hat' }, { role: 'percussion', subrole: 'mixed' }])).toBe(1);
    expect(pickDrumKeyChannel([{ role: 'bass' }, { role: 'percussion', subrole: 'snare' }])).toBe(1);
    expect(pickDrumKeyChannel([{ role: 'bass' }, { role: 'pad' }])).toBe(-1);
  });
});

describe('sidechain key on an engine without isolation slots', () => {
  it('taps the channel copy output instead of giving up', async () => {
    const outputGain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    const worklet = { numberOfOutputs: 9, connect: vi.fn(), disconnect: vi.fn(), port: { postMessage: vi.fn() } };
    const engine = {
      isAvailable: () => true,
      supportsIsolationSlots: () => false,
      getWorkletNode: () => worklet,
      getAudioContext: () => ({ createGain: () => outputGain }),
      addIsolation: vi.fn(), removeIsolation: vi.fn(),
    };
    setPlayingIsolationEngine(engine as never);
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const scInput = {} as AudioNode;

    expect(await mgr.addSidechainTap(1, scInput)).toBe(true);
    expect(engine.addIsolation).not.toHaveBeenCalled();
    expect(worklet.connect).toHaveBeenCalledWith(outputGain, 6);
    expect(outputGain.connect).toHaveBeenCalledWith(scInput);
    expect(worklet.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'dubChannelEnable', channel: 1 }));

    mgr.removeSidechainTap(1, scInput);
    expect(worklet.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'dubChannelDisable', channel: 1 }));
  });
});
