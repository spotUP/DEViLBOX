/**
 * OktalyzerExporter.ts — Export TrackerSong as Oktalyzer (.okt) format
 *
 * Produces a valid IFF/OKTA file. Sample data must be mono 8-bit signed PCM.
 * Only sample-based instruments (Sampler type) are exported; others are silent.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i) & 0xFF);
  }
}

function writeU16BE(view: DataView, offset: number, val: number): void {
  view.setUint16(offset, val, false);
}

function writeU32BE(view: DataView, offset: number, val: number): void {
  view.setUint32(offset, val, false);
}

function iffChunkHeader(id: string, size: number): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  writeStr(view, 0, id.padEnd(4, ' ').slice(0, 4));
  writeU32BE(view, 4, size);
  return buf;
}

/**
 * Convert XM note back to Oktalyzer note index (1-based).
 * XM C-1 = note 13, OKT C-1 = 1.
 */
function xmNoteToOKT(xmNote: number): number {
  if (xmNote === 0) return 0;
  const okt = xmNote - 12;
  return (okt < 1 || okt > 36) ? 0 : okt;
}

function mapXMEffectToOKT(effTyp: number, eff: number): [number, number] {
  switch (effTyp) {
    case 0x0F: return [1, eff];   // Set speed
    case 0x0B: return [2, eff];   // Position jump
    case 0x0C: return [10, eff];  // Set volume
    case 0x01: return [11, eff];  // Portamento up
    case 0x02: return [12, eff];  // Portamento down
    case 0x03: return [13, eff];  // Tone portamento
    case 0x0A: return [17, eff];  // Volume slide
    default:   return [0, 0];
  }
}

export function exportOktalyzer(song: TrackerSong): ArrayBuffer {
  const chunks: Uint8Array[] = [];

  // ── CMOD chunk ──────────────────────────────────────────────────────────
  const cmodData = new Uint8Array(8);
  // Stereo pairs: L=0, R=0 (stereo)
  chunks.push(iffChunkHeader('CMOD', 8));
  chunks.push(cmodData);

  // ── SAMP chunk ──────────────────────────────────────────────────────────
  const maxSamples = Math.min(song.instruments.length, 36);
  const sampData = new Uint8Array(maxSamples * 32);
  const sampView = new DataView(sampData.buffer);
  const samplePCMs: Uint8Array[] = [];

  for (let i = 0; i < maxSamples; i++) {
    const inst = song.instruments[i];
    const base = i * 32;
    const name = (inst?.name ?? '').slice(0, 20).padEnd(20, '\0');
    for (let j = 0; j < 20; j++) {
      sampData[base + j] = name.charCodeAt(j) & 0xFF;
    }

    // Extract PCM from instrument sample config
    let pcm = new Uint8Array(0);
    let loopStart = 0;
    let loopEnd = 0;

    if (inst?.sample?.audioBuffer) {
      // Decode WAV back to 8-bit PCM (we only stored 8-bit-compatible WAVs)
      const wav = new DataView(inst.sample.audioBuffer);
      const dataOffset = 44; // Standard WAV header size
      const dataLen = wav.getUint32(40, true);
      const frameCount = dataLen / 2; // 16-bit samples
      pcm = new Uint8Array(frameCount);
      for (let j = 0; j < frameCount; j++) {
        // Convert 16-bit signed → 8-bit signed
        const s16 = wav.getInt16(dataOffset + j * 2, true);
        pcm[j] = ((s16 >> 8) + 128) & 0xFF;
      }
      loopStart = inst.sample.loopStart ?? 0;
      loopEnd = inst.sample.loopEnd ?? 0;
    }

    samplePCMs.push(pcm);
    writeU32BE(sampView, base + 20, pcm.length);
    writeU32BE(sampView, base + 24, loopStart);
    writeU32BE(sampView, base + 28, loopEnd > loopStart ? loopEnd : 0);
    writeU16BE(sampView, base + 30, 64); // volume
  }

  chunks.push(iffChunkHeader('SAMP', sampData.length));
  chunks.push(sampData);

  // ── SPEE chunk ──────────────────────────────────────────────────────────
  const speeData = new Uint8Array(2);
  new DataView(speeData.buffer).setUint16(0, song.initialSpeed ?? 6, false);
  chunks.push(iffChunkHeader('SPEE', 2));
  chunks.push(speeData);

  // ── SLEN chunk ──────────────────────────────────────────────────────────
  const songLen = song.songPositions.length;
  const slenData = new Uint8Array(2);
  new DataView(slenData.buffer).setUint16(0, songLen, false);
  chunks.push(iffChunkHeader('SLEN', 2));
  chunks.push(slenData);

  // ── PLEN chunk ──────────────────────────────────────────────────────────
  const plenData = new Uint8Array(2);
  new DataView(plenData.buffer).setUint16(0, song.patterns.length, false);
  chunks.push(iffChunkHeader('PLEN', 2));
  chunks.push(plenData);

  // ── PATT chunk ──────────────────────────────────────────────────────────
  const pattData = new Uint8Array(songLen);
  song.songPositions.slice(0, songLen).forEach((pos, i) => { pattData[i] = pos & 0xFF; });
  chunks.push(iffChunkHeader('PATT', songLen));
  chunks.push(pattData);
  if (songLen & 1) chunks.push(new Uint8Array(1)); // IFF padding

  // ── PBOD chunks (one per pattern) ───────────────────────────────────────
  for (const pattern of song.patterns) {
    const numRows = pattern.length;
    const numChans = 8;
    const bodySize = 2 + numRows * numChans * 4;
    const bodyData = new Uint8Array(bodySize);
    const bodyView = new DataView(bodyData.buffer);

    writeU16BE(bodyView, 0, numRows);

    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < numChans; ch++) {
        const cell = pattern.channels[ch]?.rows[row];
        const cellOffset = 2 + row * numChans * 4 + ch * 4;
        const note = xmNoteToOKT(cell?.note ?? 0);
        const sampleNum = cell?.instrument ?? 0;
        const [cmd, data] = mapXMEffectToOKT(cell?.effTyp ?? 0, cell?.eff ?? 0);
        bodyData[cellOffset]     = note;
        bodyData[cellOffset + 1] = sampleNum;
        bodyData[cellOffset + 2] = cmd;
        bodyData[cellOffset + 3] = data;
      }
    }

    chunks.push(iffChunkHeader('PBOD', bodySize));
    chunks.push(bodyData);
    if (bodySize & 1) chunks.push(new Uint8Array(1));
  }

  // ── SBOD chunks (one per sample) ────────────────────────────────────────
  for (const pcm of samplePCMs) {
    chunks.push(iffChunkHeader('SBOD', pcm.length));
    chunks.push(pcm);
    if (pcm.length & 1) chunks.push(new Uint8Array(1));
  }

  // ── Assemble FORM/OKTA container ─────────────────────────────────────────
  const totalChunkBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const formSize = 4 + totalChunkBytes; // 'OKTA' + chunks
  const output = new Uint8Array(8 + formSize);
  const outView = new DataView(output.buffer);

  writeStr(outView, 0, 'FORM');
  writeU32BE(outView, 4, formSize);
  writeStr(outView, 8, 'OKTA');

  let pos = 12;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.byteLength;
  }

  return output.buffer;
}
