/**
 * Reachability: a master sidechain effect set to "Drums (auto)" (-2) is keyed
 * on the channel the classifier calls the drums - through the real
 * wireMasterSidechain and the real song stores, with nicktune1.bp loaded.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const addSidechainTap = vi.fn(async () => true);
vi.mock('../ChannelRoutedEffects', async (orig) => ({
  ...(await orig<typeof import('../ChannelRoutedEffects')>()),
  getChannelRoutedEffectsManager: () => ({ addSidechainTap, removeSidechainTap: vi.fn() }),
}));
vi.mock('@utils/audio-context', async (orig) => ({
  ...(await orig<typeof import('@utils/audio-context')>()),
  getNativeAudioNode: (n: unknown) => n,
}));

import { wireMasterSidechain } from '../MasterEffectsChain';
import { SIDECHAIN_KEY_DRUMS } from '../sidechainKey';
import { parseSoundMonFile } from '@/lib/import/formats/SoundMonParser';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';

describe('master sidechain "Drums (auto)"', () => {
  it('keys the compressor on the song drum channel', async () => {
    const b = readFileSync(join(process.cwd(), 'public/data/songs/bp-soundmon-2/nicktune1.bp'));
    const song = await parseSoundMonFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'nicktune1.bp');
    useTrackerStore.setState({ patterns: song.patterns } as never);
    useInstrumentStore.setState({ instruments: song.instruments } as never);

    const scInput = { id: 'sc-input' };
    const setSelfSidechain = vi.fn();
    const node = { getSidechainInput: () => scInput, setSelfSidechain };
    await wireMasterSidechain(node as never, SIDECHAIN_KEY_DRUMS);

    expect(addSidechainTap).toHaveBeenCalledTimes(1);
    expect(addSidechainTap).toHaveBeenCalledWith(1, scInput);
    expect(setSelfSidechain).toHaveBeenLastCalledWith(false);
  });

  it('never keys on its own input while the drum channel is not playing (it became a bass compressor)', async () => {
    addSidechainTap.mockResolvedValueOnce(false);   // engine stopped: no tap yet
    const setSelfSidechain = vi.fn();
    const node = { getSidechainInput: () => ({ id: 'sc-2' }), setSelfSidechain };
    await wireMasterSidechain(node as never, SIDECHAIN_KEY_DRUMS);
    expect(setSelfSidechain).not.toHaveBeenCalledWith(true);
  });
});
