/**
 * An effect aimed at 'nonDrums' runs on every channel but the kit, found per
 * song.
 *
 * A preset cannot name channel numbers - the kit sits on a different channel
 * in every song - so 'Chip Metal' gives its Swedish Chainsaw
 * channelRole 'nonDrums' (owner ask 2026-09-29, after pointing out the master
 * FX channel selector). Resolved from the channel classifier on the loaded
 * song; an empty result leaves the effect on the whole mix.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMODFile } from '@/lib/import/formats/MODParser';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { channelRoleTargets, pickNonDrumChannels, targetsChannels } from '../sidechainKey';

// The CED instrument classifier runs in a web worker; no worker server in node.
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../__tests__/fixtures/micro15-goto80.mod');

describe("channelRole 'nonDrums'", () => {
  beforeEach(() => {
    useTrackerStore.setState({ patterns: [] } as never);
  });

  it('picks every channel the classifier does not call percussion', () => {
    expect(pickNonDrumChannels([{ role: 'lead' }, { role: 'percussion' }, { role: 'bass' }, { role: 'percussion' }])).toEqual([0, 2]);
  });

  it('on micro15.mod: channels 1, 2 and 4 - not the kit on channel 3', async () => {
    const b = readFileSync(FIXTURE);
    const song = await parseMODFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'micro15.mod');
    useInstrumentStore.setState({ instruments: song.instruments } as never);
    useTrackerStore.setState({ patterns: song.patterns } as never);
    expect(await channelRoleTargets({ channelRole: 'nonDrums' })).toEqual([0, 1, 3]);
  });

  it('with no song loaded resolves to no channels (the effect stays on the whole mix)', async () => {
    expect(await channelRoleTargets({ channelRole: 'nonDrums' })).toEqual([]);
  });

  it('a role counts as channel targeting; hand-picked channels still work', async () => {
    expect(targetsChannels({ channelRole: 'nonDrums' })).toBe(true);
    expect(targetsChannels({ selectedChannels: [2] })).toBe(true);
    expect(targetsChannels({})).toBe(false);
    expect(await channelRoleTargets({ selectedChannels: [2, 3] })).toEqual([2, 3]);
  });
});
