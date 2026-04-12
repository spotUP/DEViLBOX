const ID_DESCRIPTOR = 1;
const ID_DRIVER_COMMON = 2;
const ID_DRIVER_TABLES = 3;
const ID_INSTRUMENT_DESCRIPTOR = 4;
const ID_MUSIC_DATA = 5;
const ID_END = 255;
const SF2_MAGIC = 4919;
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function readWord(data, off) {
  return data[off] | data[off + 1] << 8;
}
function readNullStr(data, off, maxLen = 256) {
  let s = "";
  let i = off;
  while (i < data.length && i < off + maxLen && data[i] !== 0) {
    const b = data[i];
    if (b >= 1 && b <= 26) {
      s += String.fromCharCode(b + 64);
    } else if (b >= 32 && b <= 126) {
      s += String.fromCharCode(b);
    } else {
      s += " ";
    }
    i++;
  }
  return { str: s.trim(), end: i + 1 };
}
function isSIDFactory2File(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 8) return false;
  if (data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70) {
    return false;
  }
  const magic = data[2] | data[3] << 8;
  return magic === SF2_MAGIC;
}
function buildPSIDHeader(initAddr, playAddr, title, author) {
  const header = new Uint8Array(124);
  const dv = new DataView(header.buffer);
  header[0] = 80;
  header[1] = 83;
  header[2] = 73;
  header[3] = 68;
  dv.setUint16(4, 2);
  dv.setUint16(6, 124);
  dv.setUint16(8, 0);
  dv.setUint16(10, initAddr);
  dv.setUint16(12, playAddr);
  dv.setUint16(14, 1);
  dv.setUint16(16, 1);
  dv.setUint32(18, 0);
  const titleBytes = new TextEncoder().encode(title.slice(0, 31));
  header.set(titleBytes, 22);
  const authorBytes = new TextEncoder().encode(author.slice(0, 31));
  header.set(authorBytes, 54);
  dv.setUint16(118, 0);
  return header;
}
async function parseSIDFactory2File(buffer, filename) {
  const raw = new Uint8Array(buffer);
  if (raw.length < 8) throw new Error("SF2 file too small");
  const loadAddr = readWord(raw, 0);
  const magic = readWord(raw, 2);
  if (magic !== SF2_MAGIC) throw new Error("Not a SID Factory II file (missing 0x1337 magic)");
  const mem = new Uint8Array(65536);
  mem.set(raw.subarray(2), loadAddr);
  let descriptor = null;
  let driverCommon = null;
  let musicData = null;
  const tableDefs = [];
  const instrumentDescriptions = [];
  let fileOff = 4;
  while (fileOff < raw.length) {
    const blockId = raw[fileOff];
    if (blockId === ID_END) break;
    const blockSize = raw[fileOff + 1];
    const blockStart = fileOff + 2;
    const blockEnd = blockStart + blockSize;
    let p = blockStart;
    switch (blockId) {
      case ID_DESCRIPTOR: {
        const driverType = raw[p++];
        const driverSize = readWord(raw, p);
        p += 2;
        const { str: driverName2, end } = readNullStr(raw, p);
        p = end;
        const codeTop = readWord(raw, p);
        p += 2;
        const codeSize = readWord(raw, p);
        p += 2;
        const versionMajor = raw[p++];
        const versionMinor = raw[p++];
        descriptor = { driverType, driverSize, driverName: driverName2, codeTop, codeSize, versionMajor, versionMinor };
        break;
      }
      case ID_DRIVER_COMMON: {
        const initAddress = readWord(raw, p);
        p += 2;
        const stopAddress = readWord(raw, p);
        p += 2;
        const updateAddress = readWord(raw, p);
        p += 2;
        const sidChannelOffsetAddress = readWord(raw, p);
        p += 2;
        const driverStateAddress = readWord(raw, p);
        p += 2;
        const tickCounterAddress = readWord(raw, p);
        p += 2;
        const orderListIndexAddress = readWord(raw, p);
        p += 2;
        const sequenceIndexAddress = readWord(raw, p);
        p += 2;
        const sequenceInUseAddress = readWord(raw, p);
        p += 2;
        const currentSequenceAddress = readWord(raw, p);
        p += 2;
        const currentTransposeAddress = readWord(raw, p);
        p += 2;
        const currentSeqEventDurationAddress = readWord(raw, p);
        p += 2;
        const nextInstrumentAddress = readWord(raw, p);
        p += 2;
        const nextCommandAddress = readWord(raw, p);
        p += 2;
        const nextNoteAddress = readWord(raw, p);
        p += 2;
        const nextNoteIsTiedAddress = readWord(raw, p);
        p += 2;
        const tempoCounterAddress = readWord(raw, p);
        p += 2;
        const triggerSyncAddress = readWord(raw, p);
        p += 2;
        const noteEventTriggerSyncValue = raw[p++];
        p += 1;
        p += 2;
        driverCommon = {
          initAddress,
          stopAddress,
          updateAddress,
          sidChannelOffsetAddress,
          driverStateAddress,
          tickCounterAddress,
          orderListIndexAddress,
          sequenceIndexAddress,
          sequenceInUseAddress,
          currentSequenceAddress,
          currentTransposeAddress,
          currentSeqEventDurationAddress,
          nextInstrumentAddress,
          nextCommandAddress,
          nextNoteAddress,
          nextNoteIsTiedAddress,
          tempoCounterAddress,
          triggerSyncAddress,
          noteEventTriggerSyncValue
        };
        break;
      }
      case ID_DRIVER_TABLES: {
        while (p < blockEnd) {
          const tType = raw[p++];
          if (tType === 255) break;
          const tId = raw[p++];
          p++;
          const { str: tName, end: nameEnd } = readNullStr(raw, p);
          p = nameEnd;
          p += 3;
          p += 2;
          const address = readWord(raw, p);
          p += 2;
          const columnCount = readWord(raw, p);
          p += 2;
          const rowCount = readWord(raw, p);
          p += 2;
          p++;
          tableDefs.push({ type: tType, id: tId, name: tName, address, columnCount, rowCount });
        }
        break;
      }
      case ID_INSTRUMENT_DESCRIPTOR: {
        const count = raw[p++];
        for (let i = 0; i < count && p < blockEnd; i++) {
          const { str, end } = readNullStr(raw, p);
          p = end;
          instrumentDescriptions.push(str);
        }
        break;
      }
      case ID_MUSIC_DATA: {
        const trackCount = raw[p++];
        const orderListPtrsLo = readWord(raw, p);
        p += 2;
        const orderListPtrsHi = readWord(raw, p);
        p += 2;
        const sequenceCount = raw[p++];
        const sequencePtrsLo = readWord(raw, p);
        p += 2;
        const sequencePtrsHi = readWord(raw, p);
        p += 2;
        const orderListSize = readWord(raw, p);
        p += 2;
        const orderListTrack1 = readWord(raw, p);
        p += 2;
        const sequenceSize = readWord(raw, p);
        p += 2;
        const sequence00Addr = readWord(raw, p);
        p += 2;
        musicData = {
          trackCount,
          orderListPtrsLo,
          orderListPtrsHi,
          sequenceCount,
          sequencePtrsLo,
          sequencePtrsHi,
          orderListSize,
          orderListTrack1,
          sequenceSize,
          sequence00Addr
        };
        break;
      }
    }
    fileOff = blockEnd;
  }
  if (!descriptor) throw new Error("SF2: missing Descriptor block");
  if (!driverCommon) throw new Error("SF2: missing DriverCommon block");
  if (!musicData) throw new Error("SF2: missing MusicData block");
  const numChannels = musicData.trackCount;
  const auxPtr = readWord(mem, 4091);
  let songCount = 1;
  let songNames = [filename.replace(/\.sf2$/i, "")];
  if (auxPtr > 0 && auxPtr < 65520) {
    const sc = mem[auxPtr];
    if (sc > 0 && sc <= 16) {
      songCount = sc;
      songNames = [];
      let nameOff = auxPtr + 2;
      for (let s = 0; s < songCount; s++) {
        const { str } = readNullStr(mem, nameOff, 256);
        songNames.push(str || `Song ${s + 1}`);
        nameOff += 256;
      }
    }
  }
  const orderListByteSize = musicData.orderListSize * numChannels;
  const allSongOrderLists = [];
  for (let song = 0; song < songCount; song++) {
    const songOl = [];
    const songBaseAddr = musicData.orderListTrack1 + song * orderListByteSize;
    for (let t = 0; t < numChannels; t++) {
      const olAddr = songBaseAddr + t * musicData.orderListSize;
      const entries = [];
      let loopIndex = 0;
      let hasLoop = false;
      let currentTranspose = 0;
      let a = olAddr;
      while (a < olAddr + musicData.orderListSize && a < 65536) {
        const val = mem[a++];
        if (val === 254) break;
        if (val === 255) {
          hasLoop = true;
          const loopPackedOffset = mem[a];
          let entryCount = 0;
          for (let i = olAddr; i < olAddr + loopPackedOffset; i++) {
            if (mem[i] < 128) entryCount++;
          }
          loopIndex = entryCount;
          break;
        }
        if (val >= 128) {
          currentTranspose = val;
        } else {
          entries.push({ transpose: currentTranspose, seqIdx: val });
        }
      }
      songOl.push({ entries, loopIndex, hasLoop });
    }
    allSongOrderLists.push(songOl);
  }
  const orderLists = allSongOrderLists[0] ?? [];
  const usedSeqs = /* @__PURE__ */ new Set();
  for (const songOls of allSongOrderLists) {
    for (const ol of songOls) {
      for (const e of ol.entries) usedSeqs.add(e.seqIdx);
    }
  }
  const instrTable = tableDefs.find((t) => t.type === 128);
  const instruments = [];
  const instCount = instrTable ? Math.min(instrTable.rowCount, 64) : 32;
  for (let i = 0; i < instCount; i++) {
    const instName = i < instrumentDescriptions.length && instrumentDescriptions[i] ? instrumentDescriptions[i] : `Instrument ${i + 1}`;
    let rawBytes = new Uint8Array(0);
    if (instrTable) {
      const addr = instrTable.address + i * instrTable.columnCount;
      rawBytes = new Uint8Array(instrTable.columnCount);
      for (let b = 0; b < instrTable.columnCount; b++) {
        rawBytes[b] = mem[addr + b];
      }
    }
    instruments.push({
      id: i + 1,
      name: instName,
      type: "synth",
      synthType: "SF2Synth",
      effects: [],
      volume: 0,
      pan: 0,
      sf2: {
        rawBytes,
        name: instName,
        instIndex: i,
        columnCount: (instrTable == null ? void 0 : instrTable.columnCount) ?? 0
      }
    });
  }
  const maxOlLen = Math.max(1, ...orderLists.map((ol) => ol.entries.length));
  function readSequence(seqIdx) {
    if (seqIdx >= musicData.sequenceCount) return [];
    const lo = mem[musicData.sequencePtrsLo + seqIdx];
    const hi = mem[musicData.sequencePtrsHi + seqIdx];
    const seqAddr = lo | hi << 8;
    if (seqAddr === 0) return [];
    const events = [];
    let i = seqAddr;
    let duration = 0;
    let lastInst = 0;
    while (i < 65536 && events.length < 1024) {
      let value = mem[i++];
      if (value === 127) break;
      let eventCmd = 0;
      let eventInst = 0;
      let tieNote = false;
      if (value >= 192) {
        eventCmd = (value & 63) + 1;
        value = mem[i++];
        if (value === 127) break;
      }
      if (value >= 160 && value < 192) {
        lastInst = (value & 31) + 1;
        eventInst = lastInst;
        value = mem[i++];
        if (value === 127) break;
      }
      if (value >= 128 && value < 160) {
        duration = value & 15;
        tieNote = (value & 16) !== 0;
        value = mem[i++];
        if (value === 127) break;
      }
      const note = value;
      events.push({
        note,
        instrument: tieNote ? 144 : eventInst,
        // 0x90 = tie instrument marker (matches original)
        command: eventCmd
      });
      for (let d = 0; d < duration; d++) {
        events.push({
          note: note !== 0 ? 126 : 0,
          instrument: 128,
          // empty marker (matches original)
          command: 128
          // empty marker (matches original)
        });
      }
    }
    return events;
  }
  const ROWS_PER_PATTERN = 64;
  const patterns = [];
  const songPositions = [];
  for (let pos = 0; pos < maxOlLen; pos++) {
    const channels = [];
    let maxEvents = 0;
    const trackSeqs = [];
    for (let t = 0; t < numChannels; t++) {
      const ol = orderLists[t];
      const entry = pos < ol.entries.length ? ol.entries[pos] : null;
      const seqEvents = entry ? readSequence(entry.seqIdx) : [];
      trackSeqs.push(seqEvents);
      maxEvents = Math.max(maxEvents, seqEvents.length);
    }
    const patternLength = Math.max(1, Math.min(maxEvents || ROWS_PER_PATTERN, 256));
    for (let t = 0; t < numChannels; t++) {
      const rows = [];
      const seqEvents = trackSeqs[t];
      for (let r = 0; r < patternLength; r++) {
        if (r < seqEvents.length) {
          const ev = seqEvents[r];
          rows.push({
            note: ev.note,
            instrument: ev.instrument,
            volume: 0,
            effTyp: 0,
            eff: ev.command,
            effTyp2: 0,
            eff2: 0
          });
        } else {
          rows.push(emptyCell());
        }
      }
      channels.push({
        id: `ch${t}`,
        name: `SID ${t + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({ id: `p${pos}`, name: `Pattern ${pos + 1}`, channels, length: patternLength });
    songPositions.push(pos);
  }
  const driverName = descriptor.driverName.replace(/[^\x20-\x7E]/g, " ").trim();
  const title = filename.replace(/\.sf2$/i, "");
  const psidHeader = buildPSIDHeader(
    driverCommon.initAddress,
    driverCommon.updateAddress,
    title,
    `SF2 Driver ${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, "0")}`
  );
  const sidFile = new Uint8Array(psidHeader.length + raw.length);
  sidFile.set(psidHeader, 0);
  sidFile.set(raw, psidHeader.length);
  const speed = 6;
  const bpm = 125;
  console.log(`[SF2] Parsed: "${title}" driver=${driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, "0")} tracks=${numChannels} seqs=${usedSeqs.size} patterns=${patterns.length} songs=${songCount}`);
  const sequenceMap = /* @__PURE__ */ new Map();
  for (const seqIdx of usedSeqs) {
    sequenceMap.set(seqIdx, readSequence(seqIdx));
  }
  const instrTableDef = tableDefs.find((t) => t.type === 128);
  const sf2Instruments = [];
  if (instrTableDef) {
    for (let i = 0; i < instrTableDef.rowCount && i < 64; i++) {
      const addr = instrTableDef.address + i * instrTableDef.columnCount;
      const rawBytes = new Uint8Array(instrTableDef.columnCount);
      for (let b = 0; b < instrTableDef.columnCount; b++) {
        rawBytes[b] = mem[addr + b];
      }
      sf2Instruments.push({
        rawBytes,
        name: i < instrumentDescriptions.length ? instrumentDescriptions[i] : `Inst ${i + 1}`
      });
    }
  }
  const meta = {
    sourceFormat: "SID",
    sourceFile: filename,
    importedAt: (/* @__PURE__ */ new Date()).toISOString(),
    originalChannelCount: numChannels,
    originalPatternCount: patterns.length,
    originalInstrumentCount: instruments.length
  };
  for (const p of patterns) p.importMetadata = meta;
  return {
    name: title,
    format: "SID",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm,
    c64SidFileData: sidFile,
    sf2StoreData: {
      rawFileData: raw,
      loadAddress: loadAddr,
      descriptor,
      driverCommon,
      musicData,
      tableDefs,
      instrumentDescriptions,
      c64Memory: mem,
      sequences: sequenceMap,
      orderLists,
      instruments: sf2Instruments,
      songName: title,
      songCount,
      songNames,
      allSongOrderLists
    }
  };
}
export {
  isSIDFactory2File,
  parseSIDFactory2File
};
