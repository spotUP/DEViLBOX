function decodeSyncsafe(data, offset) {
  return (data[offset] & 127) << 21 | (data[offset + 1] & 127) << 14 | (data[offset + 2] & 127) << 7 | data[offset + 3] & 127;
}
function parseID3v2Header(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 10) return null;
  if (data[0] !== 73 || data[1] !== 68 || data[2] !== 51) return null;
  const version = data[3];
  const revision = data[4];
  const flags = data[5];
  const size = decodeSyncsafe(data, 6);
  if (version < 3 || version > 4) return null;
  return { version, revision, flags, size };
}
function readNullTerminatedString(data, offset) {
  let end = offset;
  while (end < data.length && data[end] !== 0) end++;
  const str = new TextDecoder("ascii").decode(data.subarray(offset, end));
  return [str, end + 1];
}
function readNullTerminatedUTF16(data, offset) {
  let end = offset;
  while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) end += 2;
  const str = new TextDecoder("utf-16be").decode(data.subarray(offset, end));
  return [str, end + 2];
}
function parseGEOBData(data) {
  if (data.length < 4) return null;
  const encoding = data[0];
  let pos = 1;
  const [mimeType, afterMime] = readNullTerminatedString(data, pos);
  pos = afterMime;
  let fileName;
  let description;
  if (encoding === 1 || encoding === 2) {
    [fileName, pos] = readNullTerminatedUTF16(data, pos);
    [description, pos] = readNullTerminatedUTF16(data, pos);
  } else {
    [fileName, pos] = readNullTerminatedString(data, pos);
    [description, pos] = readNullTerminatedString(data, pos);
  }
  const binaryData = data.subarray(pos);
  return { description, mimeType, fileName, data: binaryData };
}
function extractGEOBFrames(buffer) {
  const header = parseID3v2Header(buffer);
  if (!header) return /* @__PURE__ */ new Map();
  const data = new Uint8Array(buffer);
  const frames = /* @__PURE__ */ new Map();
  const tagEnd = 10 + header.size;
  let pos = 10;
  if (header.flags & 64) {
    const extSize = header.version === 4 ? decodeSyncsafe(data, pos) : new DataView(buffer).getUint32(pos, false);
    pos += extSize;
  }
  while (pos + 10 <= tagEnd) {
    const frameId = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
    if (frameId[0] === "\0") break;
    const frameSize = header.version === 4 ? decodeSyncsafe(data, pos + 4) : new DataView(buffer).getUint32(pos + 4, false);
    if (frameId === "GEOB" && frameSize > 0) {
      const frameData = data.subarray(pos + 10, pos + 10 + frameSize);
      const geob = parseGEOBData(frameData);
      if (geob) {
        frames.set(geob.description, geob);
      }
    }
    pos += 10 + frameSize;
  }
  return frames;
}
const DEFAULT_CUE_COLORS = [
  "#CC0000",
  "#CC8800",
  "#CCCC00",
  "#00CC00",
  "#00CCCC",
  "#0000CC",
  "#CC00CC",
  "#CC0088"
];
function parseMarkers2(rawData) {
  const cuePoints = [];
  const loops = [];
  let data;
  if (rawData.length >= 2 && rawData[0] === 1 && rawData[1] === 1) {
    const thirdByte = rawData.length > 2 ? rawData[2] : 0;
    if (thirdByte >= 32 && thirdByte <= 126) {
      try {
        const b64str = new TextDecoder("ascii").decode(rawData.subarray(2));
        let clean = b64str.replace(/[\r\n\s]/g, "");
        if (clean.length % 4 === 1) clean += "A";
        const binary = atob(clean);
        data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      } catch {
        data = rawData;
      }
    } else {
      data = rawData;
    }
  } else {
    try {
      const b64str = new TextDecoder("ascii").decode(rawData);
      let clean = b64str.replace(/[\r\n\s]/g, "");
      if (clean.length % 4 === 1) clean += "A";
      const binary = atob(clean);
      data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    } catch {
      data = rawData;
    }
  }
  let pos = 0;
  if (data.length >= 2 && data[0] === 1 && data[1] === 1) {
    pos = 2;
  }
  while (pos < data.length) {
    while (pos < data.length && data[pos] === 0) pos++;
    if (pos >= data.length) break;
    let typeEnd = pos;
    while (typeEnd < data.length && data[typeEnd] !== 0) typeEnd++;
    if (typeEnd >= data.length) break;
    const entryType = new TextDecoder("ascii").decode(data.subarray(pos, typeEnd));
    pos = typeEnd + 1;
    if (pos + 4 > data.length) break;
    const entryLen = data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3];
    pos += 4;
    if (entryLen === 0 || pos + entryLen > data.length) break;
    const d = data.subarray(pos, pos + entryLen);
    if (entryType === "CUE" && entryLen >= 13) {
      const index = d[1];
      const position = d[2] << 24 | d[3] << 16 | d[4] << 8 | d[5];
      const r = d[7];
      const g = d[8];
      const b = d[9];
      const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      let nameEnd = 12;
      while (nameEnd < d.length && d[nameEnd] !== 0) nameEnd++;
      const name = nameEnd > 12 ? new TextDecoder("utf-8").decode(d.subarray(12, nameEnd)) : "";
      cuePoints.push({
        index,
        position,
        color: color === "#000000" ? DEFAULT_CUE_COLORS[index] ?? "#CC0000" : color,
        name
      });
    } else if (entryType === "LOOP" && entryLen >= 21) {
      const index = d[1];
      const startPosition = d[2] << 24 | d[3] << 16 | d[4] << 8 | d[5];
      const endPosition = d[6] << 24 | d[7] << 16 | d[8] << 8 | d[9];
      const cr = d[15];
      const cg = d[16];
      const cb = d[17];
      const color = `#${cr.toString(16).padStart(2, "0")}${cg.toString(16).padStart(2, "0")}${cb.toString(16).padStart(2, "0")}`;
      const locked = d[21] !== 0;
      let nameEnd = 22;
      while (nameEnd < d.length && d[nameEnd] !== 0) nameEnd++;
      const name = nameEnd > 22 ? new TextDecoder("utf-8").decode(d.subarray(22, nameEnd)) : "";
      loops.push({ index, startPosition, endPosition, color, name, locked });
    }
    pos += entryLen;
  }
  return { cuePoints, loops };
}
function parseAutotags(data) {
  let start = 0;
  if (data.length >= 2 && data[0] === 1 && data[1] === 1) {
    start = 2;
  }
  const str = new TextDecoder("ascii").decode(data.subarray(start));
  const parts = str.split("\0").filter(Boolean);
  const bpm = parts[0] ? parseFloat(parts[0]) : null;
  const gain = parts[1] ? parseFloat(parts[1]) : null;
  return {
    bpm: bpm !== null && !isNaN(bpm) ? Math.round(bpm * 100) / 100 : null,
    gain: gain !== null && !isNaN(gain) ? Math.round(gain * 1e3) / 1e3 : null
  };
}
function parseBeatGrid(data) {
  if (data.length < 14) return [];
  const aligned = new ArrayBuffer(data.length);
  new Uint8Array(aligned).set(data);
  const view = new DataView(aligned);
  const markers = [];
  const markerCount = view.getUint32(2, false);
  if (markerCount === 0) return [];
  let pos = 6;
  const nonTerminalCount = markerCount - 1;
  for (let i = 0; i < nonTerminalCount && pos + 8 <= data.length; i++) {
    const position = view.getFloat32(pos, false);
    const beatsUntilNext = view.getUint32(pos + 4, false);
    pos += 8;
    markers.push({ position, beatsUntilNextMarker: beatsUntilNext, bpm: 0 });
  }
  if (pos + 8 <= data.length) {
    const position = view.getFloat32(pos, false);
    const bpm = view.getFloat32(pos + 4, false);
    pos += 8;
    markers.push({ position, beatsUntilNextMarker: 0, bpm });
    for (let i = 0; i < markers.length - 1; i++) {
      const current = markers[i];
      const next = markers[i + 1];
      if (current.beatsUntilNextMarker > 0) {
        const timeBetween = next.position - current.position;
        if (timeBetween > 0) {
          current.bpm = Math.round(current.beatsUntilNextMarker / timeBetween * 60 * 100) / 100;
        }
      }
    }
  }
  return markers;
}
function readSeratoMetadata(buffer) {
  const result = {
    bpm: null,
    gain: null,
    key: null,
    cuePoints: [],
    loops: [],
    beatGrid: []
  };
  const frames = extractGEOBFrames(buffer);
  if (frames.size === 0) return result;
  const autotags = frames.get("Serato Autotags");
  if (autotags) {
    const parsed = parseAutotags(autotags.data);
    result.bpm = parsed.bpm;
    result.gain = parsed.gain;
  }
  const markers2 = frames.get("Serato Markers2");
  if (markers2) {
    const parsed = parseMarkers2(markers2.data);
    result.cuePoints = parsed.cuePoints;
    result.loops = parsed.loops;
  }
  const beatgrid = frames.get("Serato BeatGrid");
  if (beatgrid) {
    result.beatGrid = parseBeatGrid(beatgrid.data);
  }
  return result;
}
export {
  readSeratoMetadata
};
