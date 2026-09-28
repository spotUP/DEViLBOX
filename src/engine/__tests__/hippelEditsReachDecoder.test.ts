/**
 * A grid edit on a Jochen Hippel song is heard.
 *
 * Hippel songs play from their own bytes in libtfmxaudiodecoder. An edit
 * reaches the audio only by being written into those bytes, with the track
 * step's transpose undone, and the module reloaded. Before this, 7V edits went
 * to UADE chip RAM (with the transpose NOT undone) and CoSo edits went nowhere;
 * the CoSo from-scratch exporter cannot stand in, since it drops the samples
 * (prehistoric_tale: 24340 bytes in, 2448 out, and the decoder refuses it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { HippelCellSpans } from '../hippel/hippelCellSpans';

const ROOT = resolve(__dirname, '../../..');
const reloads: ArrayBuffer[] = [];
let loaded: TrackerSong | null = null;

vi.mock('@/engine/tfmx/TFMXEngine', () => ({
  TFMXEngine: { hasInstance: () => true, getInstance: () => ({ reloadModule: (b: ArrayBuffer) => reloads.push(b) }) },
}));
vi.mock('@engine/TrackerReplayer', async (orig) => ({
  ...(await orig<object>()),
  getTrackerReplayer: () => ({ getSong: () => loaded, syncCellToWasmSequencer: () => {}, setChannelMuteMask: () => {} }),
}));

function file(rel: string): ArrayBuffer {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

async function parse(kind: 'coso' | '7v'): Promise<TrackerSong> {
  if (kind === 'coso') {
    const { parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
    return parseHippelCoSoFile(file('public/data/songs/formats/prehistoric_tale.hipc'), 'prehistoric_tale.hipc');
  }
  const { parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
  return parseJochenHippel7VFile(file('public/data/songs/formats/ghostbattle_gameover.hip7'), 'ghostbattle_gameover.hip7');
}

/** A note cell on a track step whose note transpose is not zero. */
function transposedNote(song: TrackerSong, spansOf: (b: Uint8Array) => HippelCellSpans, transposeAt: (b: Uint8Array, p: number, ch: number) => number) {
  const buf = new Uint8Array(song.hippelFileData!);
  const spans = spansOf(buf);
  for (let p = 0; p < song.patterns.length; p++) {
    for (let ch = 0; ch < song.patterns[p].channels.length; ch++) {
      if (transposeAt(buf, p, ch) === 0) continue;
      const rows = song.patterns[p].channels[ch].rows;
      const r = rows.findIndex((c, i) => c.note > 0 && c.note < 90 && spans[p]?.[ch]?.[i]);
      if (r >= 0) return { p, ch, r };
    }
  }
  throw new Error('no transposed note in fixture');
}

describe('a Hippel song', { timeout: 60000 }, () => {
  beforeEach(() => { reloads.length = 0; });

  it('rebuilds its file byte for byte when nothing was edited', async () => {
    const { rebuildHippelModule } = await import('../hippel/rebuildHippelModule');
    for (const kind of ['coso', '7v'] as const) {
      const song = await parse(kind);
      const out = rebuildHippelModule(song.hippelFileData!, song.patterns, song.instruments.length)!;
      expect(out.written, kind).toBe(0);
      expect(Buffer.compare(Buffer.from(out.bytes), Buffer.from(new Uint8Array(song.hippelFileData!))), kind).toBe(0);
    }
  });

  it('writes a CoSo edit on a transposed track so the file decodes to it', async () => {
    const { rebuildHippelModule } = await import('../hippel/rebuildHippelModule');
    const { mapHippelCoSoCells, parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
    const song = await parse('coso');
    const n = song.instruments.length;
    // Step channel bytes: [pattern, note transpose, volume transpose].
    const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    const stepAt = (b: Uint8Array, p: number, ch: number) => {
      const songsOff = u32(b, 20), tracksOff = u32(b, 16);
      const first = (b[songsOff] << 8) | b[songsOff + 1];
      return tracksOff + (first + p) * 12 + ch * 3;
    };
    const { p, ch, r } = transposedNote(song, (b) => mapHippelCoSoCells(b, n), (b, pp, cc) => (b[stepAt(b, pp, cc) + 1] << 24) >> 24);
    const cell = song.patterns[p].channels[ch].rows[r];
    cell.note += 2;
    const out = rebuildHippelModule(song.hippelFileData!, song.patterns, n)!;
    expect(out.refused).toEqual([]);
    expect(out.written).toBeGreaterThan(0);
    const again = await parseHippelCoSoFile(out.bytes.buffer as ArrayBuffer, 'x.hipc');
    expect(again.patterns[p].channels[ch].rows[r].note).toBe(cell.note);
    expect(again.patterns[p].channels[ch].rows[r].instrument).toBe(cell.instrument);
  });

  it('reaches the decoder from a grid edit on a 7V song, transpose undone', async () => {
    const song = await parse('7v');
    const { mapJochenHippel7VCells, parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
    // A step's note transpose, read off its first note: shown = raw + transpose + 1.
    const spans7V = mapJochenHippel7VCells(new Uint8Array(song.hippelFileData!));
    const { p, ch, r } = transposedNote(song, mapJochenHippel7VCells, (b, pp, cc) => {
      const row = (spans7V[pp]?.[cc] ?? []).findIndex((s) => s && (b[s.offset] & 0x7F) > 1);
      if (row < 0) return 0;
      return song.patterns[pp].channels[cc].rows[row].note - 1 - (b[spans7V[pp][cc][row]!.offset] & 0x7F);
    });

    loaded = song;
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    useInstrumentStore.setState({ instruments: song.instruments });
    useTrackerStore.getState().loadPatterns(song.patterns);
    useTrackerStore.getState().setCurrentPattern(p);
    const target = song.patterns[p].channels[ch].rows[r].note + 3;

    vi.useFakeTimers();
    useTrackerStore.getState().setCell(ch, r, { note: target });
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();
    await vi.waitFor(() => expect(reloads.length).toBe(1));

    const heard = parseJochenHippel7VFile(reloads[0], 'ghostbattle_gameover.hip7');
    expect(heard.patterns[p].channels[ch].rows[r].note).toBe(target);
  });
});
