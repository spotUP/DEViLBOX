import { bS as periodToXMNote, bT as convertMODEffect, bU as effectStringToXM } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, chunk));
  }
  return btoa(chunks.join(""));
}
function convertCell(rawCell) {
  const [noteNum, instrument, , effectType, volume, parameter] = rawCell;
  let xmNote = 0;
  if (noteNum > 0 && noteNum <= 120) {
    xmNote = Math.max(1, noteNum - 12);
  } else if (noteNum === 254 || noteNum === 255) {
    xmNote = 97;
  }
  const xmVolume = volume > 0 ? Math.min(16 + Math.min(volume, 64), 80) : 0;
  const cell = {
    note: xmNote,
    instrument: instrument > 0 ? instrument : 0,
    volume: xmVolume,
    effTyp: effectType,
    eff: parameter,
    effTyp2: 0,
    eff2: 0
  };
  return cell;
}
function convertXMNote(xmNote) {
  const note = xmNote.note;
  const effTyp = xmNote.effectType;
  const eff = xmNote.effectParam;
  const volume = xmNote.volume;
  const instrument = xmNote.instrument;
  let effTyp2 = 0;
  let eff2 = 0;
  if (volume >= 96) {
    const converted = convertVolumeColumnEffect(volume);
    if (converted !== null) {
      effTyp2 = converted[0];
      eff2 = converted[1];
    }
  }
  return {
    note,
    instrument,
    volume,
    effTyp,
    eff,
    effTyp2,
    eff2
  };
}
function convertVolumeColumnEffect(volumeByte) {
  const type = volumeByte >> 4;
  const param = volumeByte & 15;
  switch (type) {
    case 6:
      return [10, param];
    case 7:
      return [10, param << 4];
    case 8:
      return [14, 176 + param];
    case 9:
      return [14, 160 + param];
    case 11:
      return [4, param];
    case 12:
      return [8, param * 17];
    case 13:
      return [25, param];
    case 14:
      return [25, param << 4];
    case 15: {
      const speed = param > 0 ? param * 16 : 0;
      return [3, speed];
    }
    default:
      return null;
  }
}
function convertMODNote(modNote) {
  const note = periodToXMNote(modNote.period);
  const instrument = modNote.instrument;
  const volume = 0;
  const effectStr = convertMODEffect(modNote.effect, modNote.effectParam);
  const [effTyp, eff] = effectStr ? effectStringToXM(effectStr) : [0, 0];
  return {
    note,
    instrument,
    volume,
    effTyp,
    eff,
    effTyp2: 0,
    eff2: 0,
    period: modNote.period
    // Store raw period for accurate playback
  };
}
function convertSongToPatterns(song) {
  if (!song.patterns || song.patterns.length === 0) {
    return [];
  }
  const patterns = [];
  const numChannels = song.channels.length;
  for (let patIdx = 0; patIdx < song.patterns.length; patIdx++) {
    const rawPattern = song.patterns[patIdx];
    const numRows = rawPattern.rows.length;
    if (numRows === 0) continue;
    const channels = [];
    for (let chIdx = 0; chIdx < numChannels; chIdx++) {
      const channelName = song.channels[chIdx] || `Channel ${chIdx + 1}`;
      const rows = [];
      let lastInstrument = null;
      for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
        const rawRow = rawPattern.rows[rowIdx];
        if (rawRow && rawRow[chIdx]) {
          const cell = convertCell(rawRow[chIdx]);
          if (cell.instrument !== 0) {
            lastInstrument = cell.instrument;
          }
          rows.push(cell);
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        }
      }
      const defaultInstrument = lastInstrument !== null && lastInstrument !== 0 ? lastInstrument : 1;
      channels.push({
        id: `import-ch-${patIdx}-${chIdx}-${Date.now()}`,
        name: channelName || `Ch ${chIdx + 1}`,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80,
        pan: 0,
        instrumentId: defaultInstrument,
        color: null
      });
    }
    const patternName = rawPattern.name || `Pattern ${patIdx}`;
    patterns.push({
      id: `import-pat-${patIdx}-${Date.now()}`,
      name: patternName,
      length: numRows,
      channels
    });
  }
  return patterns;
}
function getPatternOrder(song) {
  if (!song.orders) return [];
  return song.orders.map((order) => order.pat);
}
function getInstrumentNames(song) {
  return song.instruments || [];
}
function getSampleNames(song) {
  return song.samples || [];
}
function convertModule(song) {
  var _a;
  const uniquePatterns = convertSongToPatterns(song);
  const order = getPatternOrder(song);
  let expandedPatterns;
  if (order.length > 0) {
    expandedPatterns = order.map((patternIndex, songPos) => {
      const sourcePattern = uniquePatterns[patternIndex];
      if (!sourcePattern) {
        console.warn(`[ModuleConverter] Order references missing pattern ${patternIndex}`);
        return uniquePatterns[0];
      }
      return {
        ...sourcePattern,
        id: `import-pos-${songPos}-pat-${patternIndex}-${Date.now()}`,
        name: `${String(songPos).padStart(2, "0")}: ${sourcePattern.name}`,
        // Deep copy channels to avoid shared references
        channels: sourcePattern.channels.map((ch) => ({
          ...ch,
          id: `${ch.id}-pos-${songPos}`,
          rows: [...ch.rows]
        }))
      };
    });
  } else {
    expandedPatterns = uniquePatterns;
  }
  return {
    patterns: expandedPatterns,
    order,
    instrumentNames: getInstrumentNames(song),
    sampleNames: getSampleNames(song),
    channelCount: ((_a = song.channels) == null ? void 0 : _a.length) || 4
  };
}
function convertXMModule(patterns, channelCount, metadata, instrumentNames, originalBuffer) {
  var _a, _b, _c, _d;
  const convertedPatterns = [];
  for (let patIdx = 0; patIdx < patterns.length; patIdx++) {
    const xmPattern = patterns[patIdx];
    const numRows = xmPattern.length;
    const channels = [];
    for (let chIdx = 0; chIdx < channelCount; chIdx++) {
      const rows = [];
      let lastInstrument = null;
      for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
        const xmNote = (_a = xmPattern[rowIdx]) == null ? void 0 : _a[chIdx];
        if (xmNote) {
          const cell = convertXMNote(xmNote);
          if (cell.instrument !== null) {
            lastInstrument = cell.instrument;
          }
          const raw = xmNote;
          if (raw.note2) cell.note2 = raw.note2;
          if (raw.instrument2) cell.instrument2 = raw.instrument2;
          if (raw.volume2) cell.volume2 = raw.volume2;
          if (raw.note3) cell.note3 = raw.note3;
          if (raw.instrument3) cell.instrument3 = raw.instrument3;
          if (raw.volume3) cell.volume3 = raw.volume3;
          if (raw.note4) cell.note4 = raw.note4;
          if (raw.instrument4) cell.instrument4 = raw.instrument4;
          if (raw.volume4) cell.volume4 = raw.volume4;
          rows.push(cell);
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        }
      }
      const defaultInstrument = lastInstrument !== null ? lastInstrument : 0;
      const maxNoteCols = xmPattern.__maxNoteCols;
      const noteCols = (maxNoteCols == null ? void 0 : maxNoteCols[chIdx]) ?? 1;
      channels.push({
        id: `xm-ch-${patIdx}-${chIdx}-${Date.now()}`,
        name: ((_b = metadata.modData) == null ? void 0 : _b.channelNames[chIdx]) || `Channel ${chIdx + 1}`,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80,
        pan: 0,
        instrumentId: defaultInstrument,
        color: null,
        channelMeta: {
          importedFromMOD: true,
          originalIndex: chIdx,
          channelType: "sample",
          ...noteCols > 1 ? { noteCols } : {}
        }
      });
    }
    convertedPatterns.push({
      id: `xm-pat-${patIdx}-${Date.now()}`,
      name: `Pattern ${patIdx}`,
      length: numRows,
      channels,
      importMetadata: metadata
    });
  }
  const fullOrder = ((_c = metadata.modData) == null ? void 0 : _c.patternOrderTable) || Array.from({ length: convertedPatterns.length }, (_, i) => i);
  const songLength = ((_d = metadata.modData) == null ? void 0 : _d.songLength) || fullOrder.length;
  const order = fullOrder.slice(0, songLength);
  let originalModuleData;
  if (originalBuffer) {
    originalModuleData = {
      base64: arrayBufferToBase64(originalBuffer),
      format: "XM",
      sourceFile: metadata.sourceFile
    };
  }
  return {
    patterns: convertedPatterns,
    order,
    instrumentNames,
    sampleNames: instrumentNames,
    channelCount,
    metadata,
    originalModuleData
  };
}
function convertMODModule(patterns, channelCount, metadata, instrumentNames, originalBuffer) {
  var _a, _b, _c, _d, _e, _f;
  const convertedPatterns = [];
  for (let patIdx = 0; patIdx < patterns.length; patIdx++) {
    const modPattern = patterns[patIdx];
    const channels = [];
    for (let chIdx = 0; chIdx < channelCount; chIdx++) {
      const rows = [];
      let lastInstrument = null;
      for (let rowIdx = 0; rowIdx < 64; rowIdx++) {
        const modNote = (_a = modPattern[rowIdx]) == null ? void 0 : _a[chIdx];
        if (modNote) {
          const cell = convertMODNote(modNote);
          if (cell.instrument !== null) {
            lastInstrument = cell.instrument;
          }
          rows.push(cell);
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0
          });
        }
      }
      const defaultInstrument = lastInstrument !== null ? lastInstrument : 0;
      channels.push({
        id: `mod-ch-${patIdx}-${chIdx}-${Date.now()}`,
        name: ((_b = metadata.modData) == null ? void 0 : _b.channelNames[chIdx]) || `Channel ${chIdx + 1}`,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80,
        pan: 0,
        instrumentId: defaultInstrument,
        color: null,
        channelMeta: {
          importedFromMOD: true,
          originalIndex: chIdx,
          channelType: "sample"
        }
      });
    }
    convertedPatterns.push({
      id: `mod-pat-${patIdx}-${Date.now()}`,
      name: `Pattern ${patIdx}`,
      length: 64,
      // MOD patterns are always 64 rows
      channels,
      importMetadata: metadata
    });
  }
  const fullOrder = ((_c = metadata.modData) == null ? void 0 : _c.patternOrderTable) || Array.from({ length: convertedPatterns.length }, (_, i) => i);
  const songLength = ((_d = metadata.modData) == null ? void 0 : _d.songLength) || fullOrder.length;
  const order = fullOrder.slice(0, songLength);
  console.log("[ModuleConverter] Pattern order from metadata:", {
    hasModData: !!metadata.modData,
    patternOrderTable: (_e = metadata.modData) == null ? void 0 : _e.patternOrderTable,
    songLength: (_f = metadata.modData) == null ? void 0 : _f.songLength,
    resultOrder: order
  });
  let originalModuleData;
  if (originalBuffer) {
    originalModuleData = {
      base64: arrayBufferToBase64(originalBuffer),
      format: "MOD",
      sourceFile: metadata.sourceFile
    };
  }
  return {
    patterns: convertedPatterns,
    order,
    instrumentNames,
    sampleNames: instrumentNames,
    channelCount,
    metadata,
    originalModuleData
  };
}
export {
  convertMODModule,
  convertModule,
  convertSongToPatterns,
  convertXMModule,
  getInstrumentNames,
  getPatternOrder,
  getSampleNames
};
