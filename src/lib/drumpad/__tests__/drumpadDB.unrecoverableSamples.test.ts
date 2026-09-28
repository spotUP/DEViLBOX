/**
 * Stored drum-pad samples with no channel data are removed on load.
 *
 * An older build saved samples without their audio. They could never be
 * rebuilt, and each one failed with a warning on every load while its pad
 * played silence - fifteen in the owner's database (Sammy Blammy vocals and
 * lasers, whose preset loads the real files from the pack). Removal approved
 * by the owner 2026-09-28.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { loadAllPrograms } from '../drumpadDB';

const audioContext = {
  createBuffer: (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c: number) => data[c], copyToChannel: (src: Float32Array, c: number) => data[c].set(src) };
  },
} as unknown as BaseAudioContext;

function put(records: object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('devilbox-drumpad');
    req.onsuccess = () => {
      const tx = req.result.transaction('samples', 'readwrite');
      for (const r of records) tx.objectStore('samples').put(r);
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function ids(): Promise<string[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open('devilbox-drumpad');
    req.onsuccess = () => {
      const all = req.result.transaction('samples', 'readonly').objectStore('samples').getAllKeys();
      all.onsuccess = () => { resolve(all.result as string[]); req.result.close(); };
    };
  });
}

describe('loading the drum pads', () => {
  it('removes samples that hold no audio, and keeps the rest', async () => {
    await loadAllPrograms(audioContext);            // creates the database
    const good = new Float32Array([0, 0.5, -0.5, 0]);
    await put([
      { id: 'dead', name: 'Fyyyaaah', sampleRate: 44100, duration: 0, channels: [] },
      { id: 'alive', name: 'Kick', sampleRate: 44100, duration: 4 / 44100, channels: [good.buffer] },
    ]);
    await loadAllPrograms(audioContext);
    expect(await ids()).toEqual(['alive']);
  });
});
