function u8(v, off) {
  return v.getUint8(off);
}
function u16le(v, off) {
  return v.getUint16(off, true);
}
function u32le(v, off) {
  return v.getUint32(off, true);
}
const FILE_HEADER_SIZE = 36;
const MAGIC = [193, 131, 42, 158];
const MAX_NAME_COUNT = Math.floor(4294967295 / 5);
const MAX_EXPORT_COUNT = Math.floor(4294967295 / 8);
const MAX_IMPORT_COUNT = Math.floor(4294967295 / 4);
const MAX_SAMPLES = 240;
function readFileHeader(v) {
  if (v.byteLength < FILE_HEADER_SIZE) return null;
  if (u8(v, 0) !== MAGIC[0] || u8(v, 1) !== MAGIC[1] || u8(v, 2) !== MAGIC[2] || u8(v, 3) !== MAGIC[3]) {
    return null;
  }
  const packageVersion = u16le(v, 4);
  const nameCount = u32le(v, 12);
  const nameOffset = u32le(v, 16);
  const exportCount = u32le(v, 20);
  const exportOffset = u32le(v, 24);
  const importCount = u32le(v, 28);
  const importOffset = u32le(v, 32);
  if (nameOffset < FILE_HEADER_SIZE) return null;
  if (exportOffset < FILE_HEADER_SIZE) return null;
  if (importOffset < FILE_HEADER_SIZE) return null;
  if (nameCount === 0 || nameCount > MAX_NAME_COUNT) return null;
  if (exportCount === 0 || exportCount > MAX_EXPORT_COUNT) return null;
  if (importCount === 0 || importCount > MAX_IMPORT_COUNT) return null;
  if (nameOffset > 4294967295 - nameCount * 5) return null;
  if (exportOffset > 4294967295 - exportCount * 8) return null;
  if (importOffset > 4294967295 - importCount * 4) return null;
  return { packageVersion, nameCount, nameOffset, exportCount, exportOffset, importCount, importOffset };
}
function readIndex(bytes, pos) {
  if (pos >= bytes.length) return [0, pos];
  const b0 = bytes[pos++];
  const isSigned = (b0 & 128) !== 0;
  let value = b0 & 63;
  let shift = 6;
  if (b0 & 64) {
    let cont = true;
    while (cont && shift < 32 && pos < bytes.length) {
      const b = bytes[pos++];
      cont = (b & 128) !== 0;
      value |= (b & 127) << shift;
      shift += 7;
    }
  }
  const result = isSigned ? value <= 2147483647 ? -value : -2147483648 : value;
  return [result, pos];
}
function readNameEntry(bytes, pos, packageVersion) {
  if (packageVersion >= 64) {
    const [length, p2] = readIndex(bytes, pos);
    pos = p2;
    if (length <= 0) {
      while (pos < bytes.length && bytes[pos] !== 0) pos++;
      if (pos < bytes.length) pos++;
      pos += 4;
      return ["", pos];
    }
  }
  const chars = [];
  while (pos < bytes.length && bytes[pos] !== 0) {
    let c = bytes[pos++];
    if (c >= 65 && c <= 90) c += 32;
    chars.push(String.fromCharCode(c));
  }
  if (pos < bytes.length) pos++;
  pos += 4;
  return [chars.join(""), pos];
}
function readNameTable(bytes, hdr) {
  const names = [];
  let pos = hdr.nameOffset;
  const limit = Math.min(hdr.nameCount, 65536);
  for (let i = 0; i < limit && pos < bytes.length; i++) {
    const [name, nextPos] = readNameEntry(bytes, pos, hdr.packageVersion);
    names.push(name);
    pos = nextPos;
  }
  return names;
}
function findNameEntry(bytes, hdr, target) {
  let pos = hdr.nameOffset;
  const limit = Math.min(hdr.nameCount, 65536);
  for (let i = 0; i < limit && pos < bytes.length; i++) {
    if (hdr.packageVersion >= 64) {
      const [length, p2] = readIndex(bytes, pos);
      pos = p2;
      if (length <= 0) {
        while (pos < bytes.length && bytes[pos] !== 0) pos++;
        if (pos < bytes.length) pos++;
        pos += 4;
        continue;
      }
    }
    let matchPos = 0;
    let match = true;
    while (pos < bytes.length && bytes[pos] !== 0) {
      let c = bytes[pos++];
      if (c >= 65 && c <= 90) c += 32;
      if (matchPos < target.length) {
        if (String.fromCharCode(c) !== target[matchPos]) match = false;
      } else {
        match = false;
      }
      matchPos++;
    }
    if (matchPos !== target.length) match = false;
    if (pos < bytes.length) pos++;
    pos += 4;
    if (match) return true;
  }
  return false;
}
function readImportTable(bytes, hdr, names) {
  const classes = [];
  let pos = hdr.importOffset;
  const limit = Math.min(hdr.exportCount, MAX_IMPORT_COUNT);
  for (let i = 0; i < limit && pos < bytes.length; i++) {
    const [, p1] = readIndex(bytes, pos);
    const [, p2] = readIndex(bytes, p1);
    let p3 = p2;
    if (hdr.packageVersion >= 60) {
      p3 += 4;
    } else {
      const [, p3_] = readIndex(bytes, p2);
      p3 = p3_;
    }
    const [objName, p4] = readIndex(bytes, p3);
    pos = p4;
    if (objName >= 0 && objName < names.length) {
      classes.push(objName);
    }
  }
  return classes;
}
function readExportTableEntry(bytes, pos, hdr, classes, names) {
  const startPos = pos;
  const [rawObjClass, p1] = readIndex(bytes, pos);
  pos = p1;
  const objClass = ~rawObjClass >>> 0;
  const [, p2] = readIndex(bytes, pos);
  pos = p2;
  if (hdr.packageVersion >= 60) {
    pos += 4;
  } else {
    const [, p3] = readIndex(bytes, pos);
    pos = p3;
  }
  const [objName, p4] = readIndex(bytes, pos);
  pos = p4;
  if (pos + 4 > bytes.length) return { sound: null, nextPos: pos };
  pos += 4;
  const [objSize, p5] = readIndex(bytes, pos);
  pos = p5;
  const [objOffset, p6] = readIndex(bytes, pos);
  pos = p6;
  const nextPos = pos;
  if (objClass >= classes.length) return { sound: null, nextPos };
  const classNameIdx = classes[objClass];
  if (classNameIdx < 0 || classNameIdx >= names.length) return { sound: null, nextPos };
  if (names[classNameIdx] !== "sound") return { sound: null, nextPos };
  if (objSize <= 0 || objOffset <= FILE_HEADER_SIZE) return { sound: null, nextPos };
  if (objOffset >= bytes.length) return { sound: null, nextPos };
  let dpos = objOffset;
  if (hdr.packageVersion < 40) {
    dpos += 8;
  }
  if (hdr.packageVersion < 60) {
    dpos += 16;
  }
  const [, dp1] = readIndex(bytes, dpos);
  dpos = dp1;
  if (hdr.packageVersion >= 120) {
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2 + 8;
  } else if (hdr.packageVersion >= 100) {
    dpos += 4;
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2 + 4;
  } else if (hdr.packageVersion >= 62) {
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2 + 4;
  } else {
    const [, dp2] = readIndex(bytes, dpos);
    dpos = dp2;
  }
  if (dpos >= bytes.length) return { sound: null, nextPos };
  const [dataSize, dp3] = readIndex(bytes, dpos);
  dpos = dp3;
  if (dataSize <= 0) return { sound: null, nextPos };
  if (dpos + dataSize > bytes.length) return { sound: null, nextPos };
  const data = bytes.subarray(dpos, dpos + dataSize);
  const nameStr = objName >= 0 && objName < names.length ? names[objName] : `sound_${startPos}`;
  return {
    sound: { name: nameStr, data },
    nextPos
  };
}
function isUAXFormat(bytes) {
  if (bytes.length < FILE_HEADER_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hdr = readFileHeader(v);
  if (!hdr) return false;
  return findNameEntry(bytes, hdr, "sound");
}
function isWAV(data) {
  if (data.length < 12) return false;
  return data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && // RIFF
  data[8] === 87 && data[9] === 65 && data[10] === 86 && data[11] === 69;
}
function createSoundInstrument(id, name, data) {
  let wavData;
  if (isWAV(data)) {
    wavData = data;
  } else {
    const rate = 22050;
    const numSamples = data.length;
    const dataSize = numSamples;
    const fileSize = 44 + dataSize;
    const buf = new ArrayBuffer(fileSize);
    const dv = new DataView(buf);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    dv.setUint32(4, fileSize - 8, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate, true);
    dv.setUint16(32, 1, true);
    dv.setUint16(34, 8, true);
    writeStr(36, "data");
    dv.setUint32(40, dataSize, true);
    const out = new Uint8Array(buf);
    for (let i = 0; i < numSamples; i++) {
      out[44 + i] = data[i];
    }
    wavData = out;
  }
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < wavData.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(wavData.subarray(i, Math.min(i + CHUNK, wavData.length)))
    );
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;
  return {
    id,
    name: name || `Sound ${id}`,
    type: "sample",
    synthType: "Sampler",
    effects: [],
    volume: 0,
    pan: 0,
    sample: {
      audioBuffer: wavData.buffer,
      url: dataUrl,
      baseNote: "C3",
      detune: 0,
      loop: false,
      loopType: "off",
      loopStart: 0,
      loopEnd: 0,
      sampleRate: 22050,
      reverse: false,
      playbackRate: 1
    }
  };
}
function parseUAXFile(bytes, filename) {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}
function _parse(bytes, filename) {
  if (!isUAXFormat(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hdr = readFileHeader(v);
  if (!hdr) return null;
  const names = readNameTable(bytes, hdr);
  if (names.length === 0) return null;
  const classes = readImportTable(bytes, hdr, names);
  const sounds = [];
  let pos = hdr.exportOffset;
  for (let i = 0; i < hdr.exportCount && pos < bytes.length && sounds.length < MAX_SAMPLES; i++) {
    const { sound, nextPos } = readExportTableEntry(bytes, pos, hdr, classes, names);
    pos = nextPos;
    if (sound && sound.data.length > 0) {
      sounds.push(sound);
    }
  }
  if (sounds.length === 0) return null;
  const instruments = sounds.map(
    (s, i) => createSoundInstrument(i + 1, s.name, s.data)
  );
  const NUM_CHANNELS = 4;
  const ROWS = 64;
  const emptyCell = () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  });
  const channels = Array.from({ length: NUM_CHANNELS }, (_, chn) => ({
    id: `uax-ch${chn}`,
    name: `Channel ${chn + 1}`,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: ROWS }, emptyCell)
  }));
  const pattern = {
    id: "uax-pattern-0",
    name: "Pattern 0",
    length: ROWS,
    channels,
    importMetadata: {
      sourceFormat: "uax",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: sounds.length
    }
  };
  const songName = filename.replace(/\.[^/.]+$/, "");
  return {
    name: songName,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false
  };
}
export {
  isUAXFormat,
  parseUAXFile
};
