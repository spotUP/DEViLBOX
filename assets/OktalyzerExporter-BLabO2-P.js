function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i) & 255);
  }
}
function writeU16BE(view, offset, val) {
  view.setUint16(offset, val, false);
}
function writeU32BE(view, offset, val) {
  view.setUint32(offset, val, false);
}
function iffChunkHeader(id, size) {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  writeStr(view, 0, id.padEnd(4, " ").slice(0, 4));
  writeU32BE(view, 4, size);
  return buf;
}
function xmNoteToOKT(xmNote) {
  if (xmNote === 0) return 0;
  const okt = xmNote - 12;
  return okt < 1 || okt > 36 ? 0 : okt;
}
function mapXMEffectToOKT(effTyp, eff) {
  switch (effTyp) {
    case 15:
      return [1, eff];
    // Set speed
    case 11:
      return [2, eff];
    // Position jump
    case 12:
      return [10, eff];
    // Set volume
    case 1:
      return [11, eff];
    // Portamento up
    case 2:
      return [12, eff];
    // Portamento down
    case 3:
      return [13, eff];
    // Tone portamento
    case 10:
      return [17, eff];
    // Volume slide
    default:
      return [0, 0];
  }
}
function exportOktalyzer(song) {
  var _a, _b;
  const chunks = [];
  const cmodData = new Uint8Array(8);
  chunks.push(iffChunkHeader("CMOD", 8));
  chunks.push(cmodData);
  const maxSamples = Math.min(song.instruments.length, 36);
  const sampData = new Uint8Array(maxSamples * 32);
  const sampView = new DataView(sampData.buffer);
  const samplePCMs = [];
  for (let i = 0; i < maxSamples; i++) {
    const inst = song.instruments[i];
    const base = i * 32;
    const name = ((inst == null ? void 0 : inst.name) ?? "").slice(0, 20).padEnd(20, "\0");
    for (let j = 0; j < 20; j++) {
      sampData[base + j] = name.charCodeAt(j) & 255;
    }
    let pcm = new Uint8Array(0);
    let loopStart = 0;
    let loopEnd = 0;
    if ((_a = inst == null ? void 0 : inst.sample) == null ? void 0 : _a.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataOffset = 44;
      const dataLen = wav.getUint32(40, true);
      const frameCount = dataLen / 2;
      pcm = new Uint8Array(frameCount);
      for (let j = 0; j < frameCount; j++) {
        const s16 = wav.getInt16(dataOffset + j * 2, true);
        pcm[j] = (s16 >> 8) + 128 & 255;
      }
      loopStart = inst.sample.loopStart ?? 0;
      loopEnd = inst.sample.loopEnd ?? 0;
    }
    samplePCMs.push(pcm);
    writeU32BE(sampView, base + 20, pcm.length);
    writeU32BE(sampView, base + 24, loopStart);
    writeU32BE(sampView, base + 28, loopEnd > loopStart ? loopEnd : 0);
    writeU16BE(sampView, base + 30, 64);
  }
  chunks.push(iffChunkHeader("SAMP", sampData.length));
  chunks.push(sampData);
  const speeData = new Uint8Array(2);
  new DataView(speeData.buffer).setUint16(0, song.initialSpeed ?? 6, false);
  chunks.push(iffChunkHeader("SPEE", 2));
  chunks.push(speeData);
  const songLen = song.songPositions.length;
  const slenData = new Uint8Array(2);
  new DataView(slenData.buffer).setUint16(0, songLen, false);
  chunks.push(iffChunkHeader("SLEN", 2));
  chunks.push(slenData);
  const plenData = new Uint8Array(2);
  new DataView(plenData.buffer).setUint16(0, song.patterns.length, false);
  chunks.push(iffChunkHeader("PLEN", 2));
  chunks.push(plenData);
  const pattData = new Uint8Array(songLen);
  song.songPositions.slice(0, songLen).forEach((pos2, i) => {
    pattData[i] = pos2 & 255;
  });
  chunks.push(iffChunkHeader("PATT", songLen));
  chunks.push(pattData);
  if (songLen & 1) chunks.push(new Uint8Array(1));
  for (const pattern of song.patterns) {
    const numRows = pattern.length;
    const numChans = 8;
    const bodySize = 2 + numRows * numChans * 4;
    const bodyData = new Uint8Array(bodySize);
    const bodyView = new DataView(bodyData.buffer);
    writeU16BE(bodyView, 0, numRows);
    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < numChans; ch++) {
        const cell = (_b = pattern.channels[ch]) == null ? void 0 : _b.rows[row];
        const cellOffset = 2 + row * numChans * 4 + ch * 4;
        const note = xmNoteToOKT((cell == null ? void 0 : cell.note) ?? 0);
        const sampleNum = (cell == null ? void 0 : cell.instrument) ?? 0;
        const [cmd, data] = mapXMEffectToOKT((cell == null ? void 0 : cell.effTyp) ?? 0, (cell == null ? void 0 : cell.eff) ?? 0);
        bodyData[cellOffset] = note;
        bodyData[cellOffset + 1] = sampleNum;
        bodyData[cellOffset + 2] = cmd;
        bodyData[cellOffset + 3] = data;
      }
    }
    chunks.push(iffChunkHeader("PBOD", bodySize));
    chunks.push(bodyData);
    if (bodySize & 1) chunks.push(new Uint8Array(1));
  }
  for (const pcm of samplePCMs) {
    chunks.push(iffChunkHeader("SBOD", pcm.length));
    chunks.push(pcm);
    if (pcm.length & 1) chunks.push(new Uint8Array(1));
  }
  const totalChunkBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const formSize = 4 + totalChunkBytes;
  const output = new Uint8Array(8 + formSize);
  const outView = new DataView(output.buffer);
  writeStr(outView, 0, "FORM");
  writeU32BE(outView, 4, formSize);
  writeStr(outView, 8, "OKTA");
  let pos = 12;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return output.buffer;
}
export {
  exportOktalyzer
};
