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
import { parseHippel7VPlayed } from './helpers/tfmxWalkHost';

const ROOT = resolve(__dirname, '../../..');
const reloads: ArrayBuffer[] = [];
let loaded: TrackerSong | null = null;

vi.mock('@/engine/tfmx/TFMXEngine', () => ({
  TFMXEngine: { hasInstance: () => true, getInstance: () => ({ reloadModule: (b: ArrayBuffer) => reloads.push(b) }) },
}));
// Store actions peek the replayer singleton (S1) and never construct it.
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const fake = () => ({ getSong: () => loaded, syncCellToWasmSequencer: () => {}, setChannelMuteMask: () => {}, isPlaying: () => false });
  return { ...(await orig<object>()), getTrackerReplayer: fake, peekTrackerReplayer: fake };
});

function file(rel: string): ArrayBuffer {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

async function parse(kind: 'coso' | '7v'): Promise<TrackerSong> {
  if (kind === 'coso') {
    const { parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
    return parseHippelCoSoFile(file('public/data/songs/formats/prehistoric_tale.hipc'), 'prehistoric_tale.hipc');
  }
  return parseHippel7VPlayed(file('public/data/songs/formats/ghostbattle_gameover.hip7'), 'ghostbattle_gameover.hip7');
}

/** A note cell on a track step whose note transpose is not zero. */
function transposedNote(song: TrackerSong, spansOf: (b: Uint8Array) => HippelCellSpans, transposeAt: (b: Uint8Array, p: number, ch: number) => number) {
  const buf = new Uint8Array(song.hippelFileData!);
  const spans = spansOf(buf);
  for (let p = 0; p < song.patterns.length; p++) {
    for (let ch = 0; ch < song.patterns[p].channels.length; ch++) {
      if (transposeAt(buf, p, ch) === 0) continue;
      const rows = song.patterns[p].channels[ch].rows;
      // A note no sound sequence moves (hippelSeq absent), so shown = pattern note + step transpose
      const r = rows.findIndex((c, i) => c.note > 0 && c.note < 90 && !c.hippelSeq && spans[p]?.[ch]?.[i]);
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
    const unedited = structuredClone(song.patterns);
    cell.note += 2;
    const { hippelLinkedEdits } = await import('../hippel/hippelLinkedCells');
    const spans = mapHippelCoSoCells(new Uint8Array(song.hippelFileData!), n);
    for (const e of hippelLinkedEdits(spans, p, unedited[p], song.patterns[p], song.patterns)) Object.assign(song.patterns[e.pattern].channels[e.channel].rows[e.row], e.values);
    const out = rebuildHippelModule(song.hippelFileData!, song.patterns, n)!;
    expect(out.refused).toEqual([]);
    expect(out.written).toBeGreaterThan(0);
    const again = await parseHippelCoSoFile(out.bytes.buffer as ArrayBuffer, 'x.hipc');
    expect(again.patterns[p].channels[ch].rows[r].note).toBe(cell.note);
    expect(again.patterns[p].channels[ch].rows[r].instrument).toBe(cell.instrument);

    // CoSo has no rest byte, and a -2/-3 row is a length command read with
    // the next note: clearing a note, or typing onto a command row, would
    // change the song's timing. Both are refused and the bytes stay (the patcher alone: no linked copies here).
    song.patterns = structuredClone(unedited);
    song.patterns[p].channels[ch].rows[r].note = 0;
    const cmdRow = song.patterns[p].channels[ch].rows.findIndex((c, i) => c.note === 0 && mapHippelCoSoCells(new Uint8Array(song.hippelFileData!), n)[p][ch][i]);
    if (cmdRow >= 0) song.patterns[p].channels[ch].rows[cmdRow].note = 49;
    const refused = rebuildHippelModule(song.hippelFileData!, song.patterns, n)!;
    expect(refused.written).toBe(0);
    expect(refused.refused.length).toBe(cmdRow >= 0 ? 2 : 1);
    expect(Buffer.compare(Buffer.from(refused.bytes), Buffer.from(new Uint8Array(song.hippelFileData!)))).toBe(0);
  });

  it('reaches the decoder from a grid edit on a 7V song, transpose undone', async () => {
    const song = await parse('7v');
    const { mapJochenHippel7VCells } = await import('@lib/import/formats/JochenHippel7VParser');
    // A step's note transpose, read off its first note: shown = raw + transpose + 1.
    const spans7V = mapJochenHippel7VCells(new Uint8Array(song.hippelFileData!));
    const { p, ch, r } = transposedNote(song, mapJochenHippel7VCells, (b, pp, cc) => {
      const row = (spans7V[pp]?.[cc] ?? []).findIndex((s) => s && (b[s.offset] & 0x7F) > 1);
      if (row < 0) return 0;
      const cell = song.patterns[pp].channels[cc].rows[row];
      return cell.hippelSeq ? 0 : cell.note - 1 - (b[spans7V[pp][cc][row]!.offset] & 0x7F);
    });

    loaded = song;
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    useInstrumentStore.setState({ instruments: song.instruments });
    const { useFormatStore } = await import('@stores/useFormatStore');
    useFormatStore.setState({ hippelFileData: song.hippelFileData });
    useTrackerStore.getState().loadPatterns(song.patterns);
    useTrackerStore.getState().setCurrentPattern(p);
    const target = song.patterns[p].channels[ch].rows[r].note + 3;

    vi.useFakeTimers();
    useTrackerStore.getState().setCell(ch, r, { note: target });
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();
    await vi.waitFor(() => expect(reloads.length).toBe(1));

    const heard = await parseHippel7VPlayed(reloads[0], 'ghostbattle_gameover.hip7');
    expect(heard.patterns[p].channels[ch].rows[r].note).toBe(target);
  });

  it('edits every grid copy of a reused 7V block through the store, and one undo puts all copies back', async () => {
    const song = await parse('7v');
    const { mapJochenHippel7VCells } = await import('@lib/import/formats/JochenHippel7VParser');
    const spans = mapJochenHippel7VCells(new Uint8Array(song.hippelFileData!));
    const where = new Map<number, Array<[number, number, number]>>();
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const span = spans[p]?.[ch]?.[r];
      if (!span || cell.note < 13 || cell.note > 40 || cell.hippelSeq) return;
      const list = where.get(span.offset);
      if (list) list.push([p, ch, r]); else where.set(span.offset, [[p, ch, r]]);
    })));
    const copies = [...where.values()].find((l) => l.length > 1);
    expect(copies, 'a block the song reuses (sentinel)').toBeDefined();
    const [p, ch, r] = copies![0];
    const noteBefore = copies!.map(([pp, cc, rr]) => song.patterns[pp].channels[cc].rows[rr].note);

    loaded = song;
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    const { useFormatStore } = await import('@stores/useFormatStore');
    useInstrumentStore.setState({ instruments: song.instruments });
    useFormatStore.setState({ hippelFileData: song.hippelFileData });
    useTrackerStore.getState().loadPatterns(structuredClone(song.patterns));
    useTrackerStore.getState().setCurrentPattern(p);

    vi.useFakeTimers();
    useTrackerStore.getState().setCell(ch, r, { note: noteBefore[0] + 2 });
    vi.useRealTimers();
    const shown = () => copies!.map(([pp, cc, rr]) => useTrackerStore.getState().patterns[pp].channels[cc].rows[rr].note);
    expect(shown(), 'every copy moved by the typed interval').toEqual(noteBefore.map((n) => n + 2));

    useTrackerStore.getState().undoEdit();
    expect(shown(), 'one undo restores every copy').toEqual(noteBefore);
  });

  it('refuses a typed note above B-3 in a CoSo song and names the top note', async () => {
    const song = await parse('coso');
    loaded = song;
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    const { useFormatStore } = await import('@stores/useFormatStore');
    const { notify } = await import('@stores/useNotificationStore');
    const warn = vi.spyOn(notify, 'warning');
    useInstrumentStore.setState({ instruments: song.instruments });
    useFormatStore.setState({ hippelFileData: song.hippelFileData });
    useTrackerStore.getState().loadPatterns(structuredClone(song.patterns));
    useTrackerStore.getState().setCurrentPattern(0);
    const noteAt = () => useTrackerStore.getState().patterns[0].channels[0].rows[1].note;
    const was = noteAt();

    vi.useFakeTimers();
    useTrackerStore.getState().setCell(0, 1, { note: 49 });
    expect(noteAt(), 'B-3 + 1 is not stored').toBe(was);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('B-3'));
    useTrackerStore.getState().setCell(0, 1, { note: 48 });
    expect(noteAt(), 'B-3 itself is stored').toBe(48);
    vi.useRealTimers();
    warn.mockRestore();
  });
});
