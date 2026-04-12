import { c6 as encodeMODCell, c7 as amigaNoteToXM, c3 as periodToNoteIndex } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function u8(buf, off) {
  return buf[off];
}
function s8(buf, off) {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}
function u16BE(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function isMFPFormat(buffer, filename) {
  if (filename) {
    const base = filename.split("/").pop() ?? filename;
    if (base.length < 4 || base[3] !== ".") return false;
  }
  if (buffer.byteLength < 384) return false;
  const buf = new Uint8Array(buffer);
  if (buf[249] !== 127) return false;
  for (let i = 0; i < 31; i++) {
    const base = i * 8;
    const len = u16BE(buf, base);
    if (len > 32767) return false;
    if (buf[base + 2] & 240) return false;
    if (buf[base + 3] > 64) return false;
    const lps = u16BE(buf, base + 4);
    const lsz = u16BE(buf, base + 6);
    if (lps > len) return false;
    if (lps + lsz - 1 > len) return false;
    if (len > 0 && lsz === 0) return false;
  }
  if (buf[248] !== u16BE(buf, 378)) return false;
  if (u16BE(buf, 378) !== u16BE(buf, 380)) return false;
  return true;
}
function decodeProTrackerEvent(buf, off) {
  const byte0 = buf[off];
  const byte1 = buf[off + 1];
  const byte2 = buf[off + 2];
  const byte3 = buf[off + 3];
  const period = (byte0 & 15) << 8 | byte1;
  const instrument = byte0 & 240 | byte2 >> 4;
  const effTyp = byte2 & 15;
  const eff = byte3;
  const noteIdx = period > 0 ? periodToNoteIndex(period) : 0;
  const note = amigaNoteToXM(noteIdx);
  return { note, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}
async function parseMFPFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  if (buf.length < 384) {
    throw new Error("File too small to be a Magnetic Fields Packer module");
  }
  const instruments = [];
  for (let i = 0; i < 31; i++) {
    const base = i * 8;
    const lenWords = u16BE(buf, base);
    const finetune = s8(buf, base + 2) << 4;
    const volume = u8(buf, base + 3);
    const lpsWords = u16BE(buf, base + 4);
    const lszWords = u16BE(buf, base + 6);
    instruments.push({
      length: lenWords * 2,
      finetune,
      volume,
      loopStart: lpsWords * 2,
      loopSize: lszWords * 2,
      hasLoop: lszWords > 1
    });
  }
  const numPatterns = u8(buf, 248);
  const orderTable = [];
  for (let i = 0; i < 128; i++) {
    orderTable.push(u8(buf, 250 + i));
  }
  const size1 = u16BE(buf, 378);
  let pos = 382;
  const patTable = [];
  for (let i = 0; i < size1; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) {
      row.push(u16BE(buf, pos));
      pos += 2;
    }
    patTable.push(row);
  }
  const patAddr = pos;
  const trackerPatterns = [];
  for (let i = 0; i < numPatterns; i++) {
    const channelRows = [[], [], [], []];
    for (let j = 0; j < 4; j++) {
      const chanOff = patAddr + (((_a = patTable[i]) == null ? void 0 : _a[j]) ?? 0);
      const chanEnd = Math.min(chanOff + 1024, buf.length);
      const chanLen = chanEnd > chanOff ? chanEnd - chanOff : 0;
      const chanBuf = new Uint8Array(chanLen);
      if (chanLen > 0) {
        chanBuf.set(buf.subarray(chanOff, chanOff + chanLen));
      }
      for (let k = 0; k < 4; k++) {
        for (let x = 0; x < 4; x++) {
          for (let y = 0; y < 4; y++) {
            const l1 = k;
            const l2 = chanLen > l1 ? chanBuf[l1] + x : 0;
            const l3 = chanLen > l2 ? chanBuf[l2] + y : 0;
            const eventBase = chanLen > l3 ? chanBuf[l3] * 2 : 0;
            if (chanLen <= l1 || chanLen <= l2 || chanLen <= l3 || eventBase + 4 > chanLen) {
              channelRows[j].push(emptyCell());
              continue;
            }
            channelRows[j].push(decodeProTrackerEvent(chanBuf, eventBase));
          }
        }
      }
    }
    trackerPatterns.push({
      id: `pattern-${i}`,
      name: `Pattern ${i}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // Amiga standard LRRL stereo panning
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      })),
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 31
      }
    });
  }
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename));
  }
  const songPositions = orderTable.slice(0, numPatterns).map((idx) => Math.min(idx, trackerPatterns.length - 1));
  const instrConfigs = instruments.map((inst, i) => {
    const id = i + 1;
    return {
      id,
      name: "Sample " + id,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: inst.volume > 0 ? 20 * Math.log10(inst.volume / 64) : -60,
      pan: 0,
      metadata: {
        modPlayback: {
          usePeriodPlayback: true,
          periodMultiplier: 3546895,
          finetune: inst.finetune,
          defaultVolume: inst.volume
        },
        mfpSample: {
          lengthBytes: inst.length,
          loopStart: inst.loopStart,
          loopSize: inst.loopSize,
          hasLoop: inst.hasLoop
        }
      }
    };
  });
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/\..*$/, "") || baseName;
  const uadePatternLayout = {
    formatId: "mfp",
    patternDataFileOffset: patAddr,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels: 4,
    numPatterns: trackerPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeMODCell,
    getCellFileOffset: (pattern, row, channel) => {
      var _a2;
      const chanOff = patAddr + (((_a2 = patTable[pattern]) == null ? void 0 : _a2[channel]) ?? 0);
      const chanEnd = Math.min(chanOff + 1024, buf.length);
      const chanLen = chanEnd > chanOff ? chanEnd - chanOff : 0;
      if (chanLen === 0) return 0;
      const k = Math.floor(row / 16);
      const rem = row % 16;
      const x = Math.floor(rem / 4);
      const y = rem % 4;
      const l1 = k;
      if (l1 >= chanLen) return 0;
      const l2 = buf[chanOff + l1] + x;
      if (l2 >= chanLen) return 0;
      const l3 = buf[chanOff + l2] + y;
      if (l3 >= chanLen) return 0;
      const eventBase = buf[chanOff + l3] * 2;
      if (eventBase + 4 > chanLen) return 0;
      return chanOff + eventBase;
    }
  };
  return {
    name: moduleName + " [Magnetic Fields Packer]",
    format: "MOD",
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout
  };
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function createEmptyPattern(filename) {
  return {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: "channel-" + ch,
      name: "Channel " + (ch + 1),
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => emptyCell())
    })),
    importMetadata: {
      sourceFormat: "MFP",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: 31
    }
  };
}
export {
  isMFPFormat,
  parseMFPFile
};
