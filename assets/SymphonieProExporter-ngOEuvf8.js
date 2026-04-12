const CMD_KEYON = 0;
const CMD_VOLSLIDE_UP = 1;
const CMD_VOLSLIDE_DOWN = 2;
const CMD_PITCH_UP = 3;
const CMD_PITCH_DOWN = 4;
const CMD_SET_SPEED = 9;
const CMD_VIBRATO = 13;
const CMD_RETRIG = 16;
function packSymBlock(data) {
  const out = [];
  out.push(80, 65, 67, 75, 255, 255);
  out.push(data.length >> 24 & 255);
  out.push(data.length >> 16 & 255);
  out.push(data.length >> 8 & 255);
  out.push(data.length & 255);
  let pos = 0;
  while (pos < data.length) {
    if (data[pos] === 0) {
      let zeroLen = 0;
      while (pos + zeroLen < data.length && data[pos + zeroLen] === 0 && zeroLen < 255) {
        zeroLen++;
      }
      if (zeroLen >= 4) {
        out.push(3, zeroLen);
        pos += zeroLen;
        continue;
      }
    }
    if (pos + 8 <= data.length) {
      const d0 = data[pos], d1 = data[pos + 1], d2 = data[pos + 2], d3 = data[pos + 3];
      let repeatCount = 1;
      let p = pos + 4;
      while (p + 4 <= data.length && repeatCount < 255) {
        if (data[p] === d0 && data[p + 1] === d1 && data[p + 2] === d2 && data[p + 3] === d3) {
          repeatCount++;
          p += 4;
        } else {
          break;
        }
      }
      if (repeatCount === 2) {
        out.push(2, d0, d1, d2, d3);
        pos += 8;
        continue;
      } else if (repeatCount >= 3) {
        out.push(1, repeatCount, d0, d1, d2, d3);
        pos += repeatCount * 4;
        continue;
      }
    }
    let rawLen = 0;
    const rawStart = pos;
    while (pos + rawLen < data.length && rawLen < 255) {
      if (rawLen > 0) {
        if (data[pos + rawLen] === 0 && pos + rawLen + 4 <= data.length) {
          let zc = 0;
          for (let z = 0; z < 4 && pos + rawLen + z < data.length; z++) {
            if (data[pos + rawLen + z] === 0) zc++;
          }
          if (zc >= 4) break;
        }
        if (pos + rawLen + 8 <= data.length) {
          const a = pos + rawLen;
          if (data[a] === data[a + 4] && data[a + 1] === data[a + 5] && data[a + 2] === data[a + 6] && data[a + 3] === data[a + 7]) {
            break;
          }
        }
      }
      rawLen++;
    }
    if (rawLen > 0) {
      out.push(0, rawLen);
      for (let i = 0; i < rawLen; i++) {
        out.push(data[rawStart + i]);
      }
      pos += rawLen;
    } else {
      out.push(0, 1, data[pos]);
      pos++;
    }
  }
  out.push(255);
  return new Uint8Array(out);
}
function writePackedChunk(data) {
  const packed = packSymBlock(data);
  const result = new Uint8Array(4 + packed.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, packed.length, false);
  result.set(packed, 4);
  return result;
}
function encodeSymEvent(cell) {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instrument = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const volume = cell.volume ?? 0;
  if (note > 0 || instrument > 0 || volume > 0) {
    out[0] = CMD_KEYON;
    if (note > 0) {
      const symNote = Math.max(0, Math.min(84, note - 25));
      out[1] = symNote;
    }
    if (volume > 0) {
      out[2] = Math.min(100, Math.round(volume * 100 / 64));
    }
    if (instrument > 0) {
      out[3] = Math.max(0, instrument - 1);
    }
  }
  if (effTyp !== 0) {
    switch (effTyp) {
      case 15:
        out[0] = CMD_SET_SPEED;
        out[1] = 0;
        out[2] = eff > 0 ? eff : 4;
        out[3] = 0;
        break;
      case 10:
        if ((eff & 240) !== 0) {
          out[0] = CMD_VOLSLIDE_UP;
          out[2] = eff >> 4 & 15;
        } else {
          out[0] = CMD_VOLSLIDE_DOWN;
          out[2] = eff & 15;
        }
        break;
      case 1:
        out[0] = CMD_PITCH_UP;
        out[2] = eff;
        break;
      case 2:
        out[0] = CMD_PITCH_DOWN;
        out[2] = eff;
        break;
      case 4:
        out[0] = CMD_VIBRATO;
        out[2] = eff & 15;
        out[3] = (eff >> 4 & 15) << 3;
        break;
      case 27:
        out[0] = CMD_RETRIG;
        out[3] = Math.max(0, (eff & 15) - 1);
        break;
    }
  }
  return out;
}
function readOriginalChunks(original) {
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  const header = original.slice(0, 16);
  const numChannels = view.getUint32(12, false);
  const chunks = [];
  let pos = 16;
  const INLINE_4BYTE = /* @__PURE__ */ new Set([-1, -2, -3, -4, -5, -6, -7, 10, 11, 12]);
  const PACKED_BLOCK = /* @__PURE__ */ new Set([-10, -11, -13, -14, -15, -16, -17, -18, -19, -20, -21]);
  const NO_DATA = /* @__PURE__ */ new Set([-12]);
  while (pos + 4 <= original.length) {
    const chunkType = view.getInt32(pos, false);
    pos += 4;
    if (INLINE_4BYTE.has(chunkType)) {
      if (pos + 4 > original.length) break;
      chunks.push({ chunkType, rawBytes: original.slice(pos, pos + 4) });
      pos += 4;
    } else if (PACKED_BLOCK.has(chunkType)) {
      if (pos + 4 > original.length) break;
      const packedLen = view.getUint32(pos, false);
      const totalLen = 4 + packedLen;
      if (pos + totalLen > original.length) break;
      chunks.push({ chunkType, rawBytes: original.slice(pos, pos + totalLen) });
      pos += totalLen;
    } else if (NO_DATA.has(chunkType)) {
      chunks.push({ chunkType, rawBytes: new Uint8Array(0) });
    } else {
      break;
    }
  }
  return { header, numChannels, chunks };
}
function exportSymphonieProFile(song) {
  const originalData = song.symphonieFileData;
  if (!originalData) {
    throw new Error("Symphonie export requires original file data");
  }
  const original = new Uint8Array(originalData);
  const { header, numChannels, chunks } = readOriginalChunks(original);
  let trackLen = 0;
  for (const chunk of chunks) {
    if (chunk.chunkType === -2) {
      const v = new DataView(chunk.rawBytes.buffer, chunk.rawBytes.byteOffset, 4);
      trackLen = v.getUint32(0, false);
      break;
    }
  }
  if (trackLen === 0) throw new Error("No trackLength chunk found");
  const patternSize = numChannels * trackLen;
  let positionsRaw = new Uint8Array(0);
  let sequencesRaw = new Uint8Array(0);
  for (const chunk of chunks) {
    if (chunk.chunkType === -10 && positionsRaw.length === 0) {
      positionsRaw = decodePackedBlock(chunk.rawBytes);
    } else if (chunk.chunkType === -15 && sequencesRaw.length === 0) {
      sequencesRaw = decodePackedBlock(chunk.rawBytes);
    }
  }
  const positions = parsePositions(positionsRaw);
  const sequences = parseSequences(sequencesRaw);
  let maxRawPattern = 0;
  for (const pos of positions) {
    if (pos.pattern >= maxRawPattern) maxRawPattern = pos.pattern + 1;
  }
  let originalPatternEventsRaw = new Uint8Array(0);
  for (const chunk of chunks) {
    if (chunk.chunkType === -13 && originalPatternEventsRaw.length === 0) {
      originalPatternEventsRaw = decodePackedBlock(chunk.rawBytes);
    }
  }
  const totalEvents = maxRawPattern * patternSize;
  const newEvents = new Uint8Array(Math.max(originalPatternEventsRaw.length, totalEvents * 4));
  newEvents.set(originalPatternEventsRaw);
  const patternMap = /* @__PURE__ */ new Map();
  let trackerPatIdx = 0;
  for (const seq of sequences) {
    if (seq.info === 1) continue;
    if (seq.info === -1) break;
    if (seq.start >= positions.length || seq.length === 0 || seq.length > positions.length || positions.length - seq.length < seq.start) continue;
    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = positions[pi];
      if (!pos) continue;
      const effectiveTranspose = pos.transpose + seq.transpose;
      const key = `${pos.pattern}-${pos.start}-${pos.length}-${effectiveTranspose}-${pos.speed}`;
      if (!patternMap.has(key)) {
        patternMap.set(key, trackerPatIdx);
        const trackerPat = song.patterns[trackerPatIdx];
        if (trackerPat) {
          const numRows = pos.length;
          const rowStart = pos.start;
          for (let ch = 0; ch < numChannels; ch++) {
            const channelData = trackerPat.channels[ch];
            for (let row = 0; row < numRows; row++) {
              const cell = channelData == null ? void 0 : channelData.rows[row];
              if (!cell) continue;
              let cellToEncode = cell;
              if (ch === 0 && row === 0 && (cell.effTyp ?? 0) === 15) {
                cellToEncode = { ...cell, effTyp: 0, eff: 0 };
              }
              const encoded = encodeSymEvent(cellToEncode);
              const srcRow = rowStart + row;
              const eventIdx = pos.pattern * patternSize + srcRow * numChannels + ch;
              const byteOffset = eventIdx * 4;
              if (byteOffset + 4 <= newEvents.length) {
                newEvents[byteOffset] = encoded[0];
                newEvents[byteOffset + 1] = encoded[1];
                newEvents[byteOffset + 2] = encoded[2];
                newEvents[byteOffset + 3] = encoded[3];
              }
            }
          }
        }
        trackerPatIdx++;
      }
    }
  }
  const packedEvents = writePackedChunk(newEvents.slice(0, totalEvents * 4));
  let totalSize = header.length;
  for (const chunk of chunks) {
    totalSize += 4;
    if (chunk.chunkType === -13) {
      totalSize += packedEvents.length;
    } else {
      totalSize += chunk.rawBytes.length;
    }
  }
  const output = new Uint8Array(totalSize);
  const outView = new DataView(output.buffer);
  let outPos = 0;
  output.set(header, outPos);
  outPos += header.length;
  for (const chunk of chunks) {
    outView.setInt32(outPos, chunk.chunkType, false);
    outPos += 4;
    if (chunk.chunkType === -13) {
      output.set(packedEvents, outPos);
      outPos += packedEvents.length;
    } else {
      output.set(chunk.rawBytes, outPos);
      outPos += chunk.rawBytes.length;
    }
  }
  return output;
}
function decodePackedBlock(raw) {
  if (raw.length < 4) return new Uint8Array(0);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const packedLength = view.getUint32(0, false);
  if (packedLength === 0 || packedLength + 4 > raw.length) return new Uint8Array(0);
  const data = raw.slice(4, 4 + packedLength);
  if (data.length >= 10 && data[0] === 80 && data[1] === 65 && data[2] === 67 && data[3] === 75 && data[4] === 255 && data[5] === 255) {
    const unpackedLen = data[6] << 24 | data[7] << 16 | data[8] << 8 | data[9];
    const maxLen = Math.min(unpackedLen, packedLength * 170);
    const out = new Uint8Array(maxLen);
    let offset = 0;
    let remain = maxLen;
    let pos = 10;
    let done = false;
    while (!done && pos < data.length && remain > 0) {
      const type = data[pos] >= 128 ? data[pos] - 256 : data[pos];
      pos++;
      switch (type) {
        case 0: {
          if (pos >= data.length) {
            done = true;
            break;
          }
          const len = data[pos++];
          if (remain < len || pos + len > data.length) {
            done = true;
            break;
          }
          for (let i = 0; i < len; i++) out[offset++] = data[pos++];
          remain -= len;
          break;
        }
        case 1: {
          if (pos >= data.length) {
            done = true;
            break;
          }
          const len = data[pos++];
          if (remain < len * 4 || pos + 4 > data.length) {
            done = true;
            break;
          }
          const b0 = data[pos++], b1 = data[pos++], b2 = data[pos++], b3 = data[pos++];
          for (let i = 0; i < len && remain >= 4; i++) {
            out[offset++] = b0;
            out[offset++] = b1;
            out[offset++] = b2;
            out[offset++] = b3;
            remain -= 4;
          }
          break;
        }
        case 2: {
          if (remain < 8 || pos + 4 > data.length) {
            done = true;
            break;
          }
          const b0 = data[pos++], b1 = data[pos++], b2 = data[pos++], b3 = data[pos++];
          out[offset++] = b0;
          out[offset++] = b1;
          out[offset++] = b2;
          out[offset++] = b3;
          out[offset++] = b0;
          out[offset++] = b1;
          out[offset++] = b2;
          out[offset++] = b3;
          remain -= 8;
          break;
        }
        case 3: {
          if (pos >= data.length) {
            done = true;
            break;
          }
          const len = data[pos++];
          if (remain < len) {
            done = true;
            break;
          }
          offset += len;
          remain -= len;
          break;
        }
        case -1:
          done = true;
          break;
        default:
          done = true;
          break;
      }
    }
    return out.slice(0, offset);
  }
  return data;
}
function parsePositions(data) {
  const count = Math.floor(data.length / 32);
  const positions = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 32;
    positions.push({
      loopNum: view.getUint16(base + 4, false),
      pattern: view.getUint16(base + 8, false),
      start: view.getUint16(base + 10, false),
      length: view.getUint16(base + 12, false),
      speed: view.getUint16(base + 14, false),
      transpose: view.getInt16(base + 16, false)
    });
  }
  return positions;
}
function parseSequences(data) {
  const count = Math.floor(data.length / 16);
  const seqs = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 16;
    seqs.push({
      start: view.getUint16(base, false),
      length: view.getUint16(base + 2, false),
      loop: view.getUint16(base + 4, false),
      info: view.getInt16(base + 6, false),
      transpose: view.getInt16(base + 8, false)
    });
  }
  return seqs;
}
export {
  exportSymphonieProFile
};
