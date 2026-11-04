/**
 * CHIPRAM-SAMPLE-EDIT: a sample edited in the shared sample editor on a Sampler instrument that carries `uadeChipRam`
 * (here a Tony Williams .tw, played by UADE) is written into chip RAM and lands in the export bytes, for PCM, length
 * and loop. An unedited song exports byte-identical.
 *
 * Reachability: the edit is made through the store action the SampleEditor calls (useInstrumentStore.updateInstrument).
 * Sentinel: writeEditedModuleLive (the chip-RAM writer) runs once with the module the exporter wrote; that module
 * and the stand-alone export carry the edited bytes at the sample's file offset and nowhere else outside the entry fields.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

vi.mock('../ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => undefined });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/libopenmpt/OpenMPTEditBridge', async (orig) => ({ ...(await orig<object>()), isActive: () => false, syncSampleEdit: vi.fn() }));
const written: Uint8Array[] = [];
vi.mock('@/engine/uade/liveModuleWrite', () => ({
  writeEditedModuleLive: vi.fn(async (_song: unknown, edited: Uint8Array) => { written.push(edited); return { status: 'written', why: '' }; }),
}));
vi.mock('@/engine/uade/UADEEngine', () => ({ UADEEngine: { hasInstance: () => true, getInstance: () => ({}) } }));

const PATH = 'public/data/songs/formats/future basketball main.tw';

function wav16(pcm8: Int8Array, rate: number): ArrayBuffer {
  const n = pcm8.length;
  const b = new ArrayBuffer(44 + n * 2);
  const v = new DataView(b);
  const s = (o: number, t: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, pcm8[i] * 256, true);
  return b;
}

describe('a sample edit on a chip-RAM Sampler reaches chip RAM and the export', () => {
  it('PCM, shorter length and loop land at the sample table; unedited is byte-identical; longer is clamped', async () => {
    const raw = readFileSync(PATH);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'future basketball main.tw'));
    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    (await import('@/stores/useFormatStore')).useFormatStore.getState().applyEditorMode(song);
    useInstrumentStore.setState({ instruments: song.instruments });
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });

    const inst = song.instruments.find((i) => i.uadeChipRam?.sections?.sampleOffset != null && (i.uadeChipRam.instrSize ?? 0) >= 64)!;
    const sec = inst.uadeChipRam!.sections!;
    const base = sec.sampleOffset!;
    const alloc = inst.uadeChipRam!.instrSize;
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const exportNow = async () => Buffer.from((await exportNativeSong(liveTrackerSong()))!.data as Uint8Array);

    const un = await exportNow();
    expect(un.equals(raw)).toBe(true); // unedited: byte-identical

    // Edit: a new ramp, 32 bytes shorter, looped over the last 16 words.
    const len = alloc - 32;
    const pcm = Int8Array.from({ length: len }, (_, i) => ((i * 3) % 200) - 100);
    const sample = { ...inst.sample!, audioBuffer: wav16(pcm, 8287), url: '', loop: true, loopType: 'forward' as const, loopStart: len - 32, loopEnd: len };
    const { writeEditedModuleLive } = await import('@/engine/uade/liveModuleWrite');
    useInstrumentStore.getState().updateInstrument(inst.id, { sample });
    await vi.waitFor(() => expect(vi.mocked(writeEditedModuleLive)).toHaveBeenCalledTimes(1), { timeout: 60_000 });

    const out = await exportNow();
    expect(Buffer.from(written[0]).equals(out)).toBe(true); // what is written to chip RAM is what is exported
    expect(out.length).toBe(raw.length);
    expect([...out.subarray(base, base + len)]).toEqual([...pcm].map((b) => b & 0xff));
    expect(out.readUInt16BE(sec.lengthField!)).toBe(len / 2);
    expect(out.readUInt32BE(sec.loopPtrField!)).toBe(base + len - 32);
    expect(out.readUInt16BE(sec.loopLenField!)).toBe(16);
    // Bytes outside the sample, its tail and the three entry fields are untouched.
    const fields = new Set([...Array(2).keys()].map((i) => sec.lengthField! + i)
      .concat([...Array(4).keys()].map((i) => sec.loopPtrField! + i), [...Array(2).keys()].map((i) => sec.loopLenField! + i)));
    for (let i = 0; i < raw.length; i++) {
      if ((i >= base && i < base + len) || fields.has(i)) continue;
      if (out[i] !== raw[i]) throw new Error(`byte ${i} changed outside the edited sample`);
    }

    // Longer than the module's room: clamped to it, with a warning.
    const big = Int8Array.from({ length: alloc + 64 }, (_, i) => (i % 100) - 50);
    useInstrumentStore.getState().updateInstrument(inst.id, { sample: { ...sample, audioBuffer: wav16(big, 8287), loopStart: 0, loopEnd: 0, loop: false, loopType: 'off' } });
    const { applyChipRamSampleEdits } = await import('@/lib/export/chipRamSamplePatch');
    const clamped = applyChipRamSampleEdits(new Uint8Array(raw), useInstrumentStore.getState().instruments);
    expect(clamped.warnings.length).toBe(1);
    expect(Buffer.from(clamped.data).readUInt16BE(sec.lengthField!)).toBe(alloc / 2);
    expect(clamped.data.length).toBe(raw.length);
  }, 300_000);
});
