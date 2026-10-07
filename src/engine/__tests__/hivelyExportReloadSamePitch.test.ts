/**
 * P14-AHX (owner 2026-10-07, amanda.ahx): an edited AHX, exported natively and reloaded, "sounds mostly correct but at
 * some places goes out of tune". Per format file (.ahx and .hvl, including songs with per-position transposes):
 *   unedited : the exported bytes are the original file (header revision, Latin-1 text, tracks, positions)
 *   pitch    : after reload, every position's note-on pitch (track note + position transpose, the replayer's pitch)
 *              equals the original's, per position and channel
 *   edited   : a note typed in the editor at the cursor sounds at the typed pitch (+ that position's transpose) in every
 *              position that plays the track after export and reload, and nothing else moved
 * The render stage of nativeExportReloadSoundsTheSame.test.ts runs through UADE/Paula, which does not play AHX/HVL,
 * so the sound here is the effective pitch each position hands to the replayer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => new Proxy({}, { get: () => () => undefined }), peekTrackerReplayer: () => null }));

import '@stores'; // the store index first: the stores import each other in a cycle
import { parseHivelyFile } from '@/lib/import/formats/HivelyParser';
import { exportAsHively } from '@/lib/export/HivelyExporter';
import { editHivelyCell } from '@/components/hively/hivelyEdit';
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { HIVELY_COLUMNS } from '@/components/hively/hivelyAdapter';
import { typedNoteValue } from '@/components/shared/format-editor-types';
import { typedPitch } from '@/lib/tracker/formatEntryPlan';
import type { HivelyNativeData } from '@/types/tracker';

const FILES = [
  'public/data/songs/ahx/amanda.ahx',
  'public/data/songs/formats/aces_high.ahx',
  'public/data/songs/formats/hexplosion.hvl',
  'public/data/songs/hivelytracker/waiting for a message.hvl',
];

const load = (f: string) => {
  const b = readFileSync(f);
  return { bytes: new Uint8Array(b), song: parseHivelyFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, f) };
};
// The live song (liveTrackerSong) does not carry the restart position; the router hands the export that song.
const bytesOf = async (parsed: ReturnType<typeof load>['song'], f: string, native?: HivelyNativeData) => {
  const song = { ...parsed, restartPosition: 0 };
  return new Uint8Array(await exportAsHively(song, { format: f.endsWith('.ahx') ? 'ahx' : 'hvl', nativeOverride: native ?? song.hivelyNative }).data.arrayBuffer());
};

/** 'position:channel:row' -> the note the replayer plays (track note + position transpose), one entry per sounding step. */
function pitches(n: HivelyNativeData): Map<string, number> {
  const out = new Map<string, number>();
  n.positions.forEach((pos, p) => pos.track.forEach((t, ch) => {
    n.tracks[t]?.steps.forEach((s, r) => { if (s.note > 0) out.set(`${p}:${ch}:${r}`, s.note + (pos.transpose[ch] ?? 0)); });
  }));
  return out;
}

/** Bytes the format stores but no player reads, which the model cannot hold: aces_high.ahx instrument 7 byte 19 has bit 7 set
 *  (the player reads filterUpperLimit = byte & 0x3f). Listed by file offset so any other unedited difference fails. */
const UNUSED_BITS: Record<string, number[]> = { 'public/data/songs/formats/aces_high.ahx': [24695] };

describe.each(FILES)('%s', (f) => {
  beforeEach(() => { useFormatStore.setState({ hivelyNative: null as never }); });

  it('exported unedited, the bytes are the original file', async () => {
    const { bytes, song } = load(f);
    const out = await bytesOf(song, f);
    expect(out.length).toBe(bytes.length);
    expect([...out].flatMap((v, i) => (v !== bytes[i] ? [i] : []))).toEqual(UNUSED_BITS[f] ?? []);
  });

  it('after reload every position plays the original pitch', async () => {
    const { song } = load(f);
    const again = parseHivelyFile((await bytesOf(song, f)).slice().buffer as ArrayBuffer, f);
    expect([...pitches(again.hivelyNative!)]).toEqual([...pitches(song.hivelyNative!)]);
  });

  it.runIf(f.endsWith('.ahx'))('one edited step changes only that step\'s 3 bytes (one writer, no re-encode of the rest)', async () => {
    const { bytes, song } = load(f);
    useFormatStore.setState({ hivelyNative: structuredClone(song.hivelyNative!) });
    useTrackerStore.setState({ patterns: structuredClone(song.patterns), currentPatternIndex: 0 });
    const n = song.hivelyNative!;
    const row = 5, trackIdx = n.positions[0].track[0];
    editHivelyCell(0, 0, row, 'note', n.tracks[trackIdx].steps[row].note === 25 ? 26 : 25);
    const out = await bytesOf(song, f, useFormatStore.getState().hivelyNative!);
    const blank = (bytes[6] & 0x80) !== 0;
    const start = 14 + bytes[13] * 2 + n.positions.length * 8 + (trackIdx - (blank ? 1 : 0)) * n.trackLength * 3 + row * 3;
    expect(out.length).toBe(bytes.length);
    const changed = [...out].flatMap((v, i) => (v !== bytes[i] ? [i] : []));
    expect(changed.length).toBeGreaterThan(0);
    for (const i of changed.filter((c) => !(UNUSED_BITS[f] ?? []).includes(c))) expect(i >= start && i < start + 3, `byte ${i} changed outside the edited step (${start}..${start + 2})`).toBe(true);
  });

  it('a typed note sounds at the typed pitch after export and reload, in every position that plays the track', async () => {
    const { song } = load(f);
    useFormatStore.setState({ hivelyNative: structuredClone(song.hivelyNative!) });
    useTrackerStore.setState({ patterns: structuredClone(song.patterns), currentPatternIndex: 0 });
    const col = HIVELY_COLUMNS.find((c) => c.type === 'note')!;
    const typed = typedNoteValue(col, typedPitch('z', 2)!)!; // C-2 as the keyboard writes it
    const row = 5;
    const before = pitches(song.hivelyNative!);
    editHivelyCell(0, 0, row, 'note', typed);
    const edited = useFormatStore.getState().hivelyNative!;
    const again = parseHivelyFile((await bytesOf(song, f, edited)).slice().buffer as ArrayBuffer, f);
    const after = pitches(again.hivelyNative!);

    const trackIdx = song.hivelyNative!.positions[0].track[0];
    const touched = new Set<string>();
    song.hivelyNative!.positions.forEach((pos, p) => pos.track.forEach((t, ch) => {
      if (t !== trackIdx) return;
      const key = `${p}:${ch}:${row}`;
      touched.add(key);
      expect(after.get(key), `${f} ${key} (transpose ${pos.transpose[ch] ?? 0})`).toBe(typed + (pos.transpose[ch] ?? 0));
    }));
    for (const [k, v] of before) if (!touched.has(k)) expect(after.get(k), k).toBe(v);
    for (const k of after.keys()) if (!touched.has(k)) expect(before.has(k), `${k} appeared`).toBe(true);
  });
});
