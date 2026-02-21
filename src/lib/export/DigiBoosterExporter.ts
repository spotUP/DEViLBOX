/**
 * DigiBoosterExporter.ts — Export TrackerSong as DigiBooster DBM0 format
 *
 * Produces a minimal valid DBM0 file. Only sample-based instruments are exported.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

function writeStr(buf: Uint8Array, offset: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[offset + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

function iffChunk(id: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  const hdr = new DataView(header.buffer);
  for (let i = 0; i < 4; i++) header[i] = id.charCodeAt(i) & 0xFF;
  hdr.setUint32(4, data.length, false);
  const result = new Uint8Array(8 + data.length);
  result.set(header);
  result.set(data, 8);
  return result;
}

export function exportDigiBooster(song: TrackerSong): ArrayBuffer {
  const nChannels = song.numChannels;
  const nPatterns = song.patterns.length;
  const nInstrs   = Math.min(255, song.instruments.length);
  const songLen   = Math.min(128, song.songPositions.length);
  const chunks: Uint8Array[] = [];

  // ── DBM0 magic ───────────────────────────────────────────────────────────
  const header = new Uint8Array(12);
  const hview = new DataView(header.buffer);
  writeStr(header, 0, 'DBM0', 4);
  hview.setUint32(4, 1, false);  // version
  hview.setUint32(8, 0, false);  // reserved
  chunks.push(header);

  // ── INFO chunk ───────────────────────────────────────────────────────────
  const info = new Uint8Array(10);
  const iview = new DataView(info.buffer);
  writeU16BE(iview, 0, nInstrs);
  writeU16BE(iview, 2, nInstrs);  // numSamples = numInstrs
  writeU16BE(iview, 4, 1);        // numSongs
  writeU16BE(iview, 6, nPatterns);
  writeU16BE(iview, 8, nChannels);
  chunks.push(iffChunk('INFO', info));

  // ── NAME chunk ───────────────────────────────────────────────────────────
  const nameData = new Uint8Array(44);
  writeStr(nameData, 0, song.name ?? '', 44);
  chunks.push(iffChunk('NAME', nameData));

  // ── SONG chunk ───────────────────────────────────────────────────────────
  const songData = new Uint8Array(46 + 128 * 2);
  const sview = new DataView(songData.buffer);
  writeStr(songData, 0, song.name ?? '', 44);
  writeU16BE(sview, 44, songLen);
  for (let i = 0; i < 128; i++) {
    const pos = i < songLen ? (song.songPositions[i] ?? 0) : 0;
    writeU16BE(sview, 46 + i * 2, pos);
  }
  chunks.push(iffChunk('SONG', songData));

  // ── INST chunk ───────────────────────────────────────────────────────────
  const instData = new Uint8Array(nInstrs * 50);
  const instrView = new DataView(instData.buffer);
  for (let i = 0; i < nInstrs; i++) {
    const inst = song.instruments[i];
    const base = i * 50;
    writeStr(instData, base, inst?.name ?? '', 30);
    writeU16BE(instrView, base + 30, i + 1);  // sampleIdx = self
    instData[base + 32] = 64;                  // volume
    writeU32BE(instrView, base + 36, inst?.sample?.loopStart ?? 0);
    writeU32BE(instrView, base + 40, inst?.sample?.loopEnd ?? 0);
  }
  chunks.push(iffChunk('INST', instData));

  // ── PATT chunk ───────────────────────────────────────────────────────────
  let pattTotalSize = 0;
  const patternData: Uint8Array[] = [];
  for (const pattern of song.patterns) {
    const nRows = pattern.length;
    const size = 4 + nRows * nChannels * 4;
    pattTotalSize += size;
    const pdata = new Uint8Array(size);
    const pview = new DataView(pdata.buffer);
    writeU16BE(pview, 0, nRows);
    writeU16BE(pview, 2, nChannels);
    for (let row = 0; row < nRows; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pattern.channels[ch]?.rows[row];
        const base = 4 + (row * nChannels + ch) * 4;
        const note = (cell?.note ?? 0) > 12 ? (cell!.note - 12) : 0;
        pdata[base]     = note;
        pdata[base + 1] = cell?.instrument ?? 0;
        pdata[base + 2] = cell?.effTyp ?? 0;
        pdata[base + 3] = cell?.eff ?? 0;
      }
    }
    patternData.push(pdata);
  }
  const pattChunkData = new Uint8Array(pattTotalSize);
  let ppos = 0;
  for (const pd of patternData) { pattChunkData.set(pd, ppos); ppos += pd.length; }
  chunks.push(iffChunk('PATT', pattChunkData));

  // ── SMPL chunk ───────────────────────────────────────────────────────────
  let smplSize = 0;
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < nInstrs; i++) {
    const inst = song.instruments[i];
    if (inst?.sample?.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frames = Math.floor(dataLen / 2);
      const pcm8 = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm8[j] = ((s16 >> 8) + 128) & 0xFF;
      }
      samplePCMs.push(pcm8);
      smplSize += 50 + pcm8.length;
    } else {
      samplePCMs.push(new Uint8Array(0));
      smplSize += 50;
    }
  }

  const smplData = new Uint8Array(smplSize);
  const smplView = new DataView(smplData.buffer);
  let smplPos = 0;
  for (let i = 0; i < nInstrs; i++) {
    const inst = song.instruments[i];
    const pcm = samplePCMs[i];
    writeStr(smplData, smplPos, inst?.name ?? '', 30);
    writeU32BE(smplView, smplPos + 30, pcm.length);
    writeU32BE(smplView, smplPos + 34, inst?.sample?.loopStart ?? 0);
    writeU32BE(smplView, smplPos + 38, inst?.sample?.loopEnd ?? 0);
    smplData[smplPos + 42] = 64;  // volume
    smplPos += 50;
    smplData.set(pcm, smplPos);
    smplPos += pcm.length;
  }
  chunks.push(iffChunk('SMPL', smplData));

  // ── Assemble ─────────────────────────────────────────────────────────────
  const totalSize = chunks.reduce((s, c) => s + c.length, 0);
  const output = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of chunks) { output.set(chunk, pos); pos += chunk.length; }

  return output.buffer;
}
