/**
 * chipRamSamplePatch.ts - the generic path for a sample edit on a UADE-played sample format.
 *
 * A Sampler instrument that carries `uadeChipRam` plays from a module UADE holds in chip RAM. The sample editor
 * changes the instrument in the store (useInstrumentStore.updateInstrument); this file turns that instrument into
 * the module bytes: the PCM at the sample's file offset, and (when the parser described them) the length and loop
 * fields of the format's sample table. The module bytes are then the single thing both the export and the live
 * chip-RAM write (liveModuleEdits -> liveModuleWrite diff) consume, so what is heard is what is saved.
 *
 * What `uadeChipRam.sections` must carry (file byte offsets from the module start; anything missing is skipped):
 *   sampleOffset  where the 8-bit signed PCM starts; `instrSize` is the bytes allocated to it
 *   lengthField   big-endian u16 holding the sample length in words
 *   loopPtrField  big-endian u32 holding the loop start as a module-relative pointer (sampleOffset + loopStart)
 *   loopLenField  big-endian u16 holding the loop length in words (1 word = no loop, Paula's minimum)
 *
 * Size-changing edits: the module cannot grow here (every later pointer would move), so a longer sample is clamped
 * to the allocated `instrSize` and reported in `warnings`. A shorter sample is written in place with the length
 * field shortened (when the format has one), the old tail bytes left untouched. Odd lengths round down to a word.
 * An instrument whose decoded PCM, length and loop equal what the module already holds writes nothing, so an
 * unedited song stays byte-identical.
 */
import type { InstrumentConfig, SampleConfig } from '@typedefs/instrument';

/** 8-bit signed PCM of the instrument's sample (channel 0), from its WAV audioBuffer else its data URL. */
export function samplePcm8(sample: SampleConfig | undefined): Int8Array | null {
  let wav: ArrayBuffer | null = sample?.audioBuffer ?? null;
  if (!wav && sample?.url?.startsWith('data:')) {
    const b64 = sample.url.slice(sample.url.indexOf(',') + 1);
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    wav = u8.buffer;
  }
  if (!wav || wav.byteLength < 44) return null;
  const v = new DataView(wav);
  if (v.getUint32(0) !== 0x52494646) return null; // RIFF
  const channels = v.getUint16(22, true) || 1;
  const bits = v.getUint16(34, true);
  if (bits !== 8 && bits !== 16) return null;
  let o = 12;
  let data = -1;
  let size = 0;
  while (o + 8 <= v.byteLength) {
    const id = v.getUint32(o);
    const len = v.getUint32(o + 4, true);
    if (id === 0x64617461) { data = o + 8; size = Math.min(len, v.byteLength - data); break; } // 'data'
    o += 8 + len + (len & 1);
  }
  if (data < 0) return null;
  const step = channels * (bits / 8);
  const frames = Math.floor(size / step);
  const out = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = bits === 16 ? v.getInt16(data + i * step, true) >> 8 : v.getUint8(data + i * step) - 128;
  }
  return out;
}

export interface ChipRamSamplePatch { data: Uint8Array; warnings: string[]; patched: number }

/** The module `source` with every chip-RAM sampler instrument's edited sample written where the module keeps it. */
export function applyChipRamSampleEdits(source: Uint8Array, instruments: readonly InstrumentConfig[]): ChipRamSamplePatch {
  const data = new Uint8Array(source);
  const warnings: string[] = [];
  let patched = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const put = (at: number, bytes: number[]): void => {
    for (let i = 0; i < bytes.length; i++) if (data[at + i] !== bytes[i]) { data[at + i] = bytes[i]; patched++; }
  };
  for (const inst of instruments) {
    const sec = inst.uadeChipRam?.sections;
    const alloc = inst.uadeChipRam?.instrSize ?? 0;
    if (inst.synthType !== 'Sampler' || !sec || sec.sampleOffset == null || alloc <= 0) continue;
    const base = sec.sampleOffset;
    if (base + alloc > data.length) continue;
    const pcm = samplePcm8(inst.sample);
    if (!pcm || pcm.length === 0) continue;
    const label = `Instrument ${inst.id}`;
    if (pcm.length > alloc) {
      warnings.push(`${label}: the edited sample is ${pcm.length} bytes, the module has room for ${alloc}; the tail was cut.`);
    }
    // The WAV the parser builds repeats a very short sample to 512 frames; only the allocated head is the sample.
    const len = Math.min(pcm.length, alloc) & ~1;
    for (let i = 0; i < len; i++) { const b = pcm[i] & 0xff; if (data[base + i] !== b) { data[base + i] = b; patched++; } }
    const origLen = sec.lengthField != null ? view.getUint16(sec.lengthField) * 2 : alloc;
    if (sec.lengthField != null) {
      const words = len >> 1;
      if (view.getUint16(sec.lengthField) !== words) put(sec.lengthField, [words >> 8, words & 0xff]);
    }
    if (sec.loopPtrField != null && sec.loopLenField != null) {
      const s = inst.sample;
      const start = Math.min(s?.loopStart ?? 0, len) & ~1;
      const end = Math.min(s?.loopEnd ?? 0, len) & ~1;
      const looped = !!s?.loop && s.loopType !== 'off' && end - start > 2;
      // The loop the module holds now, read as the parser reads it (a loop outside the sample is no loop). Write
      // the loop fields only when the wanted loop differs, so an untouched entry keeps its bytes.
      const curPtr = view.getUint32(sec.loopPtrField);
      const curBytes = view.getUint16(sec.loopLenField) * 2;
      const curValid = curBytes > 2 && curPtr >= base && curPtr + curBytes <= base + origLen;
      const curStart = curValid ? curPtr - base : 0;
      const curEnd = curValid ? curStart + curBytes : 0;
      const wantStart = looped ? start : 0;
      const wantEnd = looped ? end : 0;
      if (curStart !== wantStart || curEnd !== wantEnd) {
        const ptr = base + wantStart;
        const words = looped ? (end - start) >> 1 : 1;
        put(sec.loopPtrField, [ptr >>> 24, (ptr >> 16) & 0xff, (ptr >> 8) & 0xff, ptr & 0xff]);
        put(sec.loopLenField, [words >> 8, words & 0xff]);
      }
    }
  }
  return { data, warnings, patched };
}
