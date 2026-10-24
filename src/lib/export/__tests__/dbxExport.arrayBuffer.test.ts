/**
 * A .dbx written by exportSong and read back by importSong + savedSongToApply
 * keeps an instrument's ArrayBuffer (config.sunvox.patchData). JSON turns an
 * ArrayBuffer into `{}`; the shared save/load layer tags and untags it.
 */
import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });

const captured: { blob: Blob | null } = { blob: null };
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => { captured.blob = blob; } }));

import { exportSong, importSong } from '../exporters';

describe('.dbx keeps instrument ArrayBuffers', () => {
  it('config.sunvox.patchData survives exportSong -> importSong -> savedSongToApply', async () => {
    const bytes = [83, 86, 88, 0, 255, 128, 9];
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    const { useProjectStore } = await import('@stores/useProjectStore');
    const inst = {
      id: 1, name: 'SV', type: 'synth', synthType: 'SunVoxSynth',
      config: { sunvox: { patchData: new Uint8Array(bytes).buffer } },
    };
    useInstrumentStore.setState({ instruments: [inst] } as never);
    useProjectStore.getState().setMetadata({ name: 'ab-song' });

    exportSong({});
    expect(captured.blob).toBeTruthy();
    const file = new File([await captured.blob!.arrayBuffer()], 'ab-song.dbx');
    const data = await importSong(file);
    expect(data).toBeTruthy();

    const { savedSongToApply } = await import('@/lib/song/savedSong');
    const song = savedSongToApply(data as never);
    const loaded = (song.instruments[0] as unknown as { config: { sunvox: { patchData: ArrayBuffer } } }).config.sunvox.patchData;
    expect(loaded).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(loaded))).toEqual(bytes);
  });
});
