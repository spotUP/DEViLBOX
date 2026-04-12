function isPxtoneFormat(data) {
  if (data.byteLength < 9) return false;
  const bytes = new Uint8Array(data, 0, 9);
  if (bytes[0] === 80 && // P
  bytes[1] === 84 && // T
  bytes[2] === 84 && // T
  bytes[3] === 85 && // U
  bytes[4] === 78 && // N
  bytes[5] === 69) {
    return true;
  }
  if (bytes[0] === 80 && // P
  bytes[1] === 84 && // T
  bytes[2] === 67 && // C
  bytes[3] === 79 && // O
  bytes[4] === 76 && // L
  bytes[5] === 76 && // L
  bytes[6] === 65 && // A
  bytes[7] === 71 && // G
  bytes[8] === 69) {
    return true;
  }
  return false;
}
const BLOCK_TAG_SIZE = 8;
const PXTONE_MAX_NAME = 16;
function decodeCString(bytes, offset, maxLen, dec) {
  const end = offset + maxLen;
  let len = 0;
  while (offset + len < end && bytes[offset + len] !== 0) len++;
  return dec.decode(bytes.subarray(offset, offset + len)).trim();
}
const VERSIONS_NO_EXE_HDR = ["PTCOLLAGE-050", "PTTUNE--20050"];
function extractPxtoneMeta(data) {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  const dec = new TextDecoder("utf-8", { fatal: false });
  const meta = {
    songName: "",
    instrumentNames: [],
    unitNames: [],
    unitCount: 0
  };
  if (data.byteLength < 16) return meta;
  const versionStr = dec.decode(bytes.subarray(0, 16));
  let pos = 16;
  const noExeHdr = VERSIONS_NO_EXE_HDR.some((prefix) => versionStr.startsWith(prefix));
  if (!noExeHdr) {
    pos += 4;
  }
  while (pos + BLOCK_TAG_SIZE + 4 <= data.byteLength) {
    const tag = dec.decode(bytes.subarray(pos, pos + BLOCK_TAG_SIZE));
    pos += BLOCK_TAG_SIZE;
    const payloadSize = view.getUint32(
      pos,
      /* littleEndian */
      true
    );
    pos += 4;
    const payloadStart = pos;
    if (tag === "pxtoneND" || tag === "END=====") break;
    if (payloadStart + payloadSize > data.byteLength) break;
    switch (tag) {
      // ── Modern format (v3x/v4x/v5) ─────────────────────────────────────────
      case "textNAME": {
        meta.songName = dec.decode(bytes.subarray(payloadStart, payloadStart + payloadSize)).replace(/\0/g, "").trim();
        break;
      }
      case "matePCM ":
      case "matePTV ":
      case "matePTN ":
      case "mateOGGV": {
        meta.instrumentNames.push("");
        break;
      }
      // ── x1x format (PTCOLLAGE-050227) ──────────────────────────────────────
      case "PROJECT=": {
        if (payloadSize >= 16) {
          meta.songName = decodeCString(bytes, payloadStart, 16, dec);
        }
        break;
      }
      case "matePCM=": {
        meta.instrumentNames.push("");
        break;
      }
      case "UNIT====": {
        if (payloadSize >= 16) {
          const name = decodeCString(bytes, payloadStart, 16, dec);
          meta.unitNames.push(name);
          meta.unitCount++;
        }
        break;
      }
      case "assiWOIC": {
        if (payloadSize >= 20) {
          const woiceIndex = view.getUint16(payloadStart, true);
          const name = decodeCString(bytes, payloadStart + 4, PXTONE_MAX_NAME, dec);
          while (meta.instrumentNames.length <= woiceIndex) meta.instrumentNames.push("");
          meta.instrumentNames[woiceIndex] = name;
        }
        break;
      }
      case "assiUNIT": {
        if (payloadSize >= 20) {
          const unitIndex = view.getUint16(payloadStart, true);
          const name = decodeCString(bytes, payloadStart + 4, PXTONE_MAX_NAME, dec);
          while (meta.unitNames.length <= unitIndex) meta.unitNames.push("");
          meta.unitNames[unitIndex] = name;
        }
        break;
      }
      case "num UNIT": {
        if (payloadSize >= 4) {
          meta.unitCount = view.getInt16(payloadStart, true);
        }
        break;
      }
    }
    pos = payloadStart + payloadSize;
  }
  return meta;
}
async function parsePxtoneFile(fileName, data) {
  if (!isPxtoneFormat(data)) {
    throw new Error("Invalid PxTone file: unrecognized magic bytes");
  }
  const meta = extractPxtoneMeta(data);
  const numChannels = Math.max(1, meta.unitCount || 4);
  const numRows = 64;
  const baseName = meta.songName || fileName.replace(/\.[^.]+$/, "");
  const emptyRows = Array.from({ length: numRows }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: meta.unitNames[ch] || `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: fileName,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: meta.instrumentNames.length
    }
  };
  const resolvedInstrNames = meta.instrumentNames.map(
    (name, i) => name || meta.unitNames[i] || `Instrument ${i + 1}`
  );
  const instruments = resolvedInstrNames.length > 0 ? resolvedInstrNames.map((name, i) => ({
    id: i + 1,
    name,
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  })) : [{
    id: 1,
    name: "Sample 1",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
  return {
    name: `${baseName} [PxTone]`,
    format: "PxTone",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    pxtoneFileData: data.slice(0)
  };
}
export {
  isPxtoneFormat,
  parsePxtoneFile
};
