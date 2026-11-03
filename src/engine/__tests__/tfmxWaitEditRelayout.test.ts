/**
 * Known gap from e9d1b12b4: the TFMX grid is a time grid (row = pattern tick), but editing a wait value in the
 * grid wrote the new bytes and left every later row on its old tick.
 *
 * Real song through the real open path; the edit is the pattern editor's own cell edit (useTrackerStore.setCell).
 * The command after the edited wait must move by exactly the wait delta, and the edited cell keeps its row.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: () => () => undefined });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

const settle = () => new Promise((r) => setTimeout(r, 150));
const bytesOf = (rel: string): ArrayBuffer => {
  const b = readFileSync(rel);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('TFMX: a wait edit lays the time grid out again (mdat.turrican_bonus)', { timeout: 300000 }, () => {
  beforeAll(async () => {
    await import('@stores');
    const { setDevilboxAudioContext } = await import('@/utils/audio-context');
    setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);
  }, 300000);

  it('the command after an edited wait moves by the wait delta', async () => {
    const { openSong } = await import('@/lib/song/openSong');
    const r = await openSong({
      kind: 'bytes', name: 'mdat.turrican_bonus', bytes: bytesOf('public/data/songs/formats/mdat.turrican_bonus'),
      companions: new Map([['smpl.turrican_bonus', bytesOf('public/data/songs/formats/smpl.turrican_bonus')]]),
    }, { origin: 'mcp' });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const layout0 = useFormatStore.getState().uadePatternLayout!;
    const data = new Uint8Array(useFormatStore.getState().tfmxFileData!);
    expect(data.length).toBeGreaterThan(0);
    const ticks0 = useFormatStore.getState().tfmxNative!.gridRowTicks;

    // a Wait command (F3 bb, holds bb + 1 ticks) whose voice has a later command, with room to lengthen the wait
    let found: { p: number; ch: number; row: number; next: number } | null = null;
    const pats = useTrackerStore.getState().patterns;
    for (let p = 0; p < pats.length && !found; p++) {
      for (let ch = 0; ch < layout0.numChannels && !found; ch++) {
        const rows: number[] = [];
        for (let row = 0; row < pats[p].length; row++) if (layout0.getCellFileOffset!(p, row, ch) >= 0) rows.push(row);
        for (let i = 0; i + 1 < rows.length && !found; i++) {
          const off = layout0.getCellFileOffset!(p, rows[i], ch);
          const aa = data[off];
          if (aa === 0xF3 && data[off + 1] > 0 && data[off + 1] < 200) found = { p, ch, row: rows[i], next: rows[i + 1] };
        }
      }
    }
    expect(found, 'the song has a wait followed by a command').not.toBeNull();
    const { p, ch, row, next } = found!;
    const cell = pats[p].channels[ch].rows[row];
    expect(cell.effTyp, 'the wait shows as the 0F effect').toBe(0x0F);
    const delta = 7;
    const nextOffset = layout0.getCellFileOffset!(p, next, ch);
    const tickOfNext = ticks0[p][next];

    useTrackerStore.getState().setCell(ch, row, { effTyp: 0x0F, eff: cell.eff + delta }, p);
    await settle();

    const layout1 = useFormatStore.getState().uadePatternLayout!;
    const ticks1 = useFormatStore.getState().tfmxNative!.gridRowTicks;
    let nextRow = -1;
    for (let rr = 0; rr < useTrackerStore.getState().patterns[p].length; rr++) if (layout1.getCellFileOffset!(p, rr, ch) === nextOffset) nextRow = rr;
    expect(nextRow, 'the following command is still in the grid').toBeGreaterThanOrEqual(0);
    expect(ticks1[p][nextRow], 'it plays delta ticks later').toBe(tickOfNext + delta);
    expect(ticks1[p][row], 'the edited cell keeps its tick').toBe(ticks0[p][row]);
    expect(layout1.getCellFileOffset!(p, row, ch), 'the edited cell keeps its row').toBe(layout0.getCellFileOffset!(p, row, ch));
  });
});
