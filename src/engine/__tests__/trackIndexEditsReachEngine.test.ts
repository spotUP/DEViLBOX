/**
 * A grid edit on a song a track-pool engine plays lands in the track the
 * replayer reads, not in the track whose number equals the grid's pattern.
 *
 * SoundMon, Digital Mugician, Sonic Arranger, Delta Music 1/2, InStereo 1/2
 * and Synthesis keep notes once in a pool of tracks / blocks / track lines
 * that several positions and channels point at. Their set_cell takes the
 * replayer's own index; the generic grid route handed it the pattern number
 * (and the worklets passed the channel where the C function takes the note),
 * so an edit changed an unrelated track.
 *
 * One reachability test per engine: sendCellEditsToEngine (the store's single
 * routing function) on a parsed corpus song -> the registry's engine class
 * (setTrackCell is the sentinel) -> the real worklet and WASM; the proof is the
 * replayer's own get_cell at the address the module file puts that cell.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet } from './workletHarness';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { trackCellWrite, moduleCellFields } from '@/engine/replayer/trackIndexCellEdits';

interface Spec {
  name: string; key: string; file: string; dir: string; stem: string; mod: string; cls: string; prefix: string;
  /** get_cell takes (index, row) rather than a flat line index. */
  rowed: boolean; arp: boolean;
}
const SPECS: Spec[] = [
  { name: 'SoundMon', key: 'SoundMonReplayer', file: 'bp-soundmon-2/nicktune1.bp', dir: 'soundmon', stem: 'SoundMon', mod: 'soundmon/SoundMonEngine', cls: 'SoundMonEngine', prefix: 'sm', rowed: true, arp: false },
  { name: 'Digital Mugician', key: 'DigMugReplayer', file: 'digital-mugician/believe.dmu', dir: 'digmug', stem: 'DigMug', mod: 'digmug/DigMugEngine', cls: 'DigMugEngine', prefix: 'dm', rowed: true, arp: false },
  { name: 'Sonic Arranger', key: 'SonicArranger', file: 'sonic-arranger/mega end.sa', dir: 'sonic-arranger', stem: 'SonicArranger', mod: 'sonic-arranger/SonicArrangerEngine', cls: 'SonicArrangerEngine', prefix: 'sa', rowed: false, arp: true },
  { name: 'Delta Music 1', key: 'DeltaMusic1Replayer', file: 'delta-music/triplex1.dm', dir: 'deltamusic1', stem: 'DeltaMusic1', mod: 'deltamusic1/DeltaMusic1Engine', cls: 'DeltaMusic1Engine', prefix: 'dm1', rowed: true, arp: false },
  { name: 'Delta Music 2', key: 'DeltaMusic2Replayer', file: 'delta-music-2/asperity megademo 3.dm2', dir: 'deltamusic2', stem: 'DeltaMusic2', mod: 'deltamusic2/DeltaMusic2Engine', cls: 'DeltaMusic2Engine', prefix: 'dm2', rowed: true, arp: false },
  { name: 'InStereo 1', key: 'InStereo1Replayer', file: 'instereo!/fantasi8.is', dir: 'instereo1', stem: 'InStereo1', mod: 'instereo1/InStereo1Engine', cls: 'InStereo1Engine', prefix: 'is1', rowed: false, arp: true },
  { name: 'InStereo 2', key: 'InStereo2Replayer', file: 'instereo!-2.0/spaceflight.is20', dir: 'instereo2', stem: 'InStereo2', mod: 'instereo2/InStereo2Engine', cls: 'InStereo2Engine', prefix: 'is2', rowed: false, arp: true },
  { name: 'Synthesis', key: 'SynthesisReplayer', file: 'synthesis/space sound.syn', dir: 'synthesis', stem: 'Synthesis', mod: 'synthesis/SynthesisEngine', cls: 'SynthesisEngine', prefix: 'syn', rowed: false, arp: true },
];

vi.mock('@/engine/uade/UADEEngine', () => ({ UADEEngine: { hasInstance: () => false } }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));

type Fields = { note: number; instrument: number; arpeggio: number; effect: number; effectArg: number };
interface Mod {
  _malloc(n: number): number;
  HEAPU8: Uint8Array;
  [fn: string]: unknown;
}

describe('grid edits reach the track the replayer reads', { timeout: 120000 }, () => {
  for (const spec of SPECS) {
    it(`${spec.name}: the edit lands at the replayer's own track and row`, async () => {
      loadSharedWorkletScripts();
      const root = join(__dirname, '../../../public/data/songs');
      const raw = readFileSync(join(root, spec.file));
      const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
      const song = await parseModuleToSong(new File([ab], spec.file.split('/').pop()!), 0) as TrackerSong;
      const layout = song.uadePatternLayout!;
      expect(layout, 'the song carries its pattern layout').toBeTruthy();

      const { proc, send } = await startWorklet(spec.dir, spec.stem);
      await send({ type: 'loadModule', moduleData: ab.slice(0) });
      const m = proc.module as unknown as Mod;
      const handle = proc.handle as number;
      const out = m._malloc(8);
      const get = (index: number, row: number): Fields => {
        const args = spec.rowed ? [handle, index, row] : [handle, index];
        const ptrs = spec.arp ? [out, out + 1, out + 2, out + 3, out + 4] : [out, out + 1, out + 2, out + 3];
        m.HEAPU8.fill(0, out, out + 8);
        (m[`_${spec.prefix}_get_cell`] as (...a: number[]) => void)(...args, ...ptrs);
        const h = m.HEAPU8;
        return spec.arp
          ? { note: h[out], instrument: h[out + 1], arpeggio: h[out + 2], effect: h[out + 3], effectArg: h[out + 4] }
          : { note: h[out], instrument: h[out + 1], arpeggio: 0, effect: h[out + 2], effectArg: h[out + 3] };
      };

      // The mapping against the replayer's own memory: every cell of the grid
      // that is backed by a track must read back what the module bytes say.
      // Pick the first backed cell, past position 0, whose replayer index
      // differs from its pattern number (the case the old route got wrong).
      let target: { p: number; r: number; c: number; index: number; row: number } | null = null;
      for (let p = 1; p < song.patterns.length && !target; p++) {
        for (let c = 0; c < song.patterns[p].channels.length && !target; c++) {
          for (let r = 0; r < song.patterns[p].channels[c].rows.length && !target; r++) {
            const w = trackCellWrite(song, spec.key, { pattern: p, row: r, channel: c, cell: song.patterns[p].channels[c].rows[r] });
            if (w && w.index !== p) target = { p, r, c, index: w.index, row: w.row };
          }
        }
      }
      expect(target, 'a backed cell whose track index differs from the pattern number').toBeTruthy();
      const t = target!;
      const cell = song.patterns[t.p].channels[t.c].rows[t.r];
      const offset = layout.getCellFileOffset!(t.p, t.r, t.c);
      const fileBytes = new Uint8Array(ab, offset, layout.bytesPerCell);
      const before = get(t.index, t.row);
      expect(before, 'the replayer holds, at that address, what the module file holds at the cell offset')
        .toEqual(moduleCellFields(spec.key, fileBytes));
      const oldSpot = get(t.p, t.r % (spec.rowed ? 16 : 1));

      // The engine the registry resolves: the real class, the real worklet behind it.
      const posted: Record<string, number | string>[] = [];
      const Engine = (await import(`@/engine/${spec.mod}`) as Record<string, { prototype: object; hasInstance(): boolean; getInstance(): unknown }>)[spec.cls];
      const fake = Object.create(Engine.prototype) as { workletNode: unknown };
      fake.workletNode = { port: { postMessage: (msg: Record<string, number | string>) => posted.push(msg) } };
      vi.spyOn(Engine, 'hasInstance').mockReturnValue(true);
      vi.spyOn(Engine, 'getInstance').mockReturnValue(fake as never);
      const setTrackCell = vi.spyOn(Engine.prototype as { setTrackCell(): void }, 'setTrackCell');

      const edited = { ...cell, note: cell.note === 20 ? 21 : 20, instrument: cell.instrument === 3 ? 4 : 3 };
      const { sendCellEditsToEngine } = await import('@/engine/replayer/liveCellEdits');
      await sendCellEditsToEngine(song, [{ pattern: t.p, row: t.r, channel: t.c, cell: edited }]);
      expect(setTrackCell, 'sentinel: the track-index engine ran').toHaveBeenCalledTimes(1);
      for (const msg of posted) await send(msg);

      const want = trackCellWrite(song, spec.key, { pattern: t.p, row: t.r, channel: t.c, cell: edited })!;
      const after = get(t.index, t.row);
      expect(after, 'the edit is in the replayer track the position points at').toEqual({
        note: want.note, instrument: want.instrument, arpeggio: want.arpeggio, effect: want.effect, effectArg: want.effectArg,
      });
      expect(after, 'and it changed something').not.toEqual(before);
      if (t.index !== t.p) expect(get(t.p, t.r % (spec.rowed ? 16 : 1)), 'the track numbered like the pattern is untouched').toEqual(oldSpot);
    });
  }
});
