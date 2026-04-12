import { C as Cpu6502 } from "./Cpu6502-BtrQdhpg.js";
const DB_NAME = "DEViLBOX_SIDPatternCache";
const DB_VERSION = 1;
const STORE_NAME = "patterns";
const CACHE_VERSION = 1;
const MAX_ENTRIES = 500;
let db = null;
async function initDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(new Error("Failed to open SID pattern cache"));
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "hash" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}
async function hashBuffer(buffer) {
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function getCachedPatterns(buffer) {
  try {
    const database = await initDB();
    const hash = await hashBuffer(buffer);
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(hash);
      req.onsuccess = () => {
        const entry = req.result;
        if (entry && entry.cacheVersion === CACHE_VERSION) {
          resolve(entry);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function cachePatterns(buffer, patterns, songPositions, restartPosition, speed, bpm) {
  try {
    const database = await initDB();
    const hash = await hashBuffer(buffer);
    const entry = {
      hash,
      cacheVersion: CACHE_VERSION,
      patterns,
      songPositions,
      restartPosition,
      speed,
      bpm,
      timestamp: Date.now()
    };
    const tx1 = database.transaction(STORE_NAME, "readonly");
    const countReq = tx1.objectStore(STORE_NAME).count();
    await new Promise((resolve) => {
      countReq.onsuccess = async () => {
        if (countReq.result >= MAX_ENTRIES) {
          try {
            const evictTx = database.transaction(STORE_NAME, "readwrite");
            const idx = evictTx.objectStore(STORE_NAME).index("timestamp");
            const cursor = idx.openCursor();
            let evicted = 0;
            const toEvict = countReq.result - MAX_ENTRIES + 10;
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (c && evicted < toEvict) {
                c.delete();
                evicted++;
                c.continue();
              }
            };
          } catch {
          }
        }
        resolve();
      };
      countReq.onerror = () => resolve();
    });
    const tx2 = database.transaction(STORE_NAME, "readwrite");
    tx2.objectStore(STORE_NAME).put(entry);
  } catch {
  }
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function readStr(buf, off, len) {
  let s = "";
  for (let i = 0; i < len && buf[off + i] !== 0; i++) s += String.fromCharCode(buf[off + i]);
  return s.trim();
}
function sidModelLabel(flags, shift) {
  const model = flags >> shift & 3;
  return model === 2 ? "8580" : "6581";
}
function sidFreqToNote(freqReg, clock = 985248) {
  if (freqReg === 0) return 0;
  const freq = freqReg * clock / 16777216;
  if (freq < 20 || freq > 2e4) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
function runSIDEmulation(buf, loadAddr, initAddr, playAddr, dataOffset, numVoices, sidClock) {
  const FRAMES = 18e3;
  const MAX_TOTAL_CYCLES = 8e7;
  const ram = new Uint8Array(65536);
  const code = buf.subarray(dataOffset);
  const codeLen = Math.min(code.length, 65536 - loadAddr);
  ram.set(code.subarray(0, codeLen), loadAddr);
  const sidRegs = new Uint8Array(32);
  let ciaTimerA = 16421;
  let ciaTimerACycles = 0;
  const KERNAL_STUBS = [
    59953,
    60033,
    65095,
    65352,
    65409,
    65412,
    65415,
    65505,
    65508,
    65490,
    65487,
    65472,
    65475,
    65478,
    65481,
    65484
  ];
  for (const addr of KERNAL_STUBS) ram[addr] = 96;
  ram[65530] = 72;
  ram[65531] = 255;
  ram[65532] = 0;
  ram[65533] = 0;
  ram[65534] = 71;
  ram[65535] = 254;
  ram[788] = 49;
  ram[789] = 234;
  ram[790] = 102;
  ram[791] = 254;
  ram[792] = 71;
  ram[793] = 254;
  const mem = {
    read(addr) {
      addr &= 65535;
      if (addr >= 54272 && addr < 54304) return sidRegs[addr - 54272];
      if (addr === 56324) return ciaTimerA & 255;
      if (addr === 56325) return ciaTimerA >> 8 & 255;
      if (addr === 56333) return 1;
      if (addr === 53266) return ciaTimerACycles >> 6 & 255;
      if (addr === 53265) return 27;
      return ram[addr];
    },
    write(addr, val) {
      addr &= 65535;
      ram[addr] = val;
      if (addr >= 54272 && addr < 54304) sidRegs[addr - 54272] = val;
      if (addr === 56324) ciaTimerA = ciaTimerA & 65280 | val;
      if (addr === 56325) ciaTimerA = ciaTimerA & 255 | val << 8;
    }
  };
  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr);
  cpu.setA(0);
  cpu.callSubroutine(initAddr);
  let effectivePlayAddr = playAddr;
  if (effectivePlayAddr === 0) {
    const irqAddr = ram[788] | ram[789] << 8;
    if (irqAddr !== 59953 && irqAddr >= loadAddr && irqAddr < loadAddr + codeLen) {
      effectivePlayAddr = irqAddr;
    }
  }
  if (effectivePlayAddr === 0) return [];
  const frameStates = [];
  let totalCycles = 0;
  for (let f = 0; f < FRAMES && totalCycles < MAX_TOTAL_CYCLES; f++) {
    ciaTimerACycles += 2e4;
    cpu.callSubroutine(effectivePlayAddr);
    totalCycles += 5e3;
    const notes = new Array(numVoices).fill(null);
    const regs = [];
    for (let v = 0; v < Math.min(numVoices, 3); v++) {
      const base = v * 7;
      const freqLo = sidRegs[base + 0];
      const freqHi = sidRegs[base + 1];
      const control = sidRegs[base + 4];
      const gate = (control & 1) !== 0;
      const freqReg = freqHi << 8 | freqLo;
      notes[v] = gate && freqReg > 0 ? sidFreqToNote(freqReg, sidClock) : null;
    }
    for (let r = 0; r < 21; r++) regs.push(sidRegs[r]);
    frameStates.push({ notes, regs });
  }
  return frameStates;
}
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
function detectSpeed(frames) {
  const changeFrames = [];
  const prevNotes = [];
  for (let f = 0; f < frames.length; f++) {
    let changed = false;
    for (let v = 0; v < frames[f].notes.length; v++) {
      const n = frames[f].notes[v];
      if (f === 0) {
        prevNotes[v] = n;
        continue;
      }
      if (n !== prevNotes[v]) {
        changed = true;
        prevNotes[v] = n;
      }
    }
    if (changed && f > 0) changeFrames.push(f);
  }
  if (changeFrames.length < 3) return 6;
  const intervals = [];
  for (let i = 1; i < changeFrames.length; i++) {
    const iv = changeFrames[i] - changeFrames[i - 1];
    if (iv > 0 && iv <= 24) intervals.push(iv);
  }
  if (intervals.length === 0) return 6;
  const hist = /* @__PURE__ */ new Map();
  for (const iv of intervals) hist.set(iv, (hist.get(iv) || 0) + 1);
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const threshold = intervals.length * 0.1;
  const common = sorted.filter(([, count]) => count >= threshold).map(([iv]) => iv);
  if (common.length > 0) {
    let g = common[0];
    for (let i = 1; i < common.length; i++) g = gcd(g, common[i]);
    if (g >= 2 && g <= 12) return g;
  }
  let bestIv = 6, bestCount = 0;
  for (const [iv, count] of hist) {
    if (iv >= 2 && iv <= 12 && count > bestCount) {
      bestCount = count;
      bestIv = iv;
    }
  }
  return bestIv;
}
function framesToRows(frames, speed, numCh) {
  const totalRows = Math.floor(frames.length / speed);
  const rows = [];
  const lastNote = new Array(numCh).fill(0);
  for (let row = 0; row < totalRows; row++) {
    const fs = frames[row * speed];
    const cells = [];
    for (let ch = 0; ch < numCh; ch++) {
      const cell = emptyCell();
      const n = ch < fs.notes.length ? fs.notes[ch] : null;
      if (n !== null && n > 0 && n !== lastNote[ch]) {
        cell.note = n;
        cell.instrument = ch + 1;
        lastNote[ch] = n;
      } else if (n === null && lastNote[ch] > 0) {
        cell.note = 97;
        lastNote[ch] = 0;
      }
      cells.push(cell);
    }
    rows.push(cells);
  }
  return rows;
}
function trimTrailingSilence(rows) {
  let lastActive = rows.length - 1;
  while (lastActive > 0) {
    if (rows[lastActive].some((c) => c.note > 0 && c.note < 97)) break;
    lastActive--;
  }
  return rows.slice(0, Math.min(lastActive + 8, rows.length));
}
function chooseBestPatternLength(totalRows) {
  for (const len of [64, 32, 16]) {
    const n = Math.ceil(totalRows / len);
    if (n >= 2 && n <= 128) return len;
  }
  return totalRows <= 16 ? 16 : 64;
}
function rowFingerprint(row) {
  return row.map((c) => c.note > 0 ? `${c.note}:${c.instrument}` : "_").join(",");
}
function splitIntoPatterns(allRows, numCh, instruments, patternLength) {
  const numChunks = Math.ceil(allRows.length / patternLength);
  const chunks = [];
  for (let p = 0; p < numChunks; p++) {
    const start = p * patternLength;
    const chunk = [];
    for (let r = start; r < start + patternLength; r++) {
      chunk.push(r < allRows.length ? allRows[r] : Array.from({ length: numCh }, emptyCell));
    }
    chunks.push(chunk);
  }
  const chunkFPs = chunks.map((chunk) => chunk.map(rowFingerprint).join("|"));
  const uniquePatterns = [];
  const fpToIdx = /* @__PURE__ */ new Map();
  const songPositions = [];
  for (let p = 0; p < chunks.length; p++) {
    const fp = chunkFPs[p];
    if (fpToIdx.has(fp)) {
      songPositions.push(fpToIdx.get(fp));
    } else {
      const idx = uniquePatterns.length;
      fpToIdx.set(fp, idx);
      const channels = Array.from({ length: numCh }, (_, ch) => {
        var _a;
        return {
          id: `ch${ch}`,
          name: ((_a = instruments[ch]) == null ? void 0 : _a.name) || `SID ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: 0,
          instrumentId: null,
          color: null,
          rows: chunks[p].map((row) => ({ ...row[ch] }))
        };
      });
      uniquePatterns.push({
        id: `p${idx}`,
        name: `Pattern ${idx + 1}`,
        length: patternLength,
        channels
      });
      songPositions.push(idx);
    }
  }
  return { patterns: uniquePatterns, songPositions };
}
function detectLoop(positions) {
  const len = positions.length;
  if (len < 6) return { trimEnd: len, restartPos: 0 };
  for (let loopLen = 2; loopLen <= Math.floor(len / 3); loopLen++) {
    const tailStart = len - loopLen * 2;
    if (tailStart < 0) continue;
    let isLoop = true;
    for (let j = 0; j < loopLen; j++) {
      if (positions[tailStart + j] !== positions[tailStart + loopLen + j]) {
        isLoop = false;
        break;
      }
    }
    if (!isLoop) continue;
    let loopStart = tailStart;
    while (loopStart >= loopLen) {
      let matches = true;
      for (let j = 0; j < loopLen; j++) {
        if (positions[loopStart - loopLen + j] !== positions[loopStart + j]) {
          matches = false;
          break;
        }
      }
      if (matches) loopStart -= loopLen;
      else break;
    }
    return { trimEnd: loopStart + loopLen, restartPos: loopStart };
  }
  return { trimEnd: len, restartPos: 0 };
}
function isSIDFormat(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && (b[0] === 80 && b[1] === 83 && b[2] === 73 && b[3] === 68 || b[0] === 82 && b[1] === 83 && b[2] === 73 && b[3] === 68);
}
async function parseSIDFile(buffer, filename) {
  if (!isSIDFormat(buffer)) throw new Error("Not a valid SID file");
  const buf = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const version = dv.getUint16(4, false);
  const dataOffset = dv.getUint16(6, false);
  const loadAddrField = dv.getUint16(8, false);
  const initAddr = dv.getUint16(10, false);
  const playAddr = dv.getUint16(12, false);
  const title = readStr(buf, 22, 32);
  const author = readStr(buf, 54, 32);
  const flags = version >= 2 && buf.length > 119 ? dv.getUint16(118, false) : 0;
  const has2ndSID = version >= 2 && buf.length > 120 && buf[120] !== 0;
  const has3rdSID = version >= 3 && buf.length > 121 && buf[121] !== 0;
  const clockFlag = flags >> 2 & 3;
  const isNTSC = clockFlag === 2;
  const frameRate = isNTSC ? 60 : 50;
  let loadAddr = loadAddrField;
  if (loadAddr === 0 && buf.length > dataOffset + 1) {
    loadAddr = buf[dataOffset] | buf[dataOffset + 1] << 8;
  }
  const model1 = sidModelLabel(flags, 2);
  const model2 = has2ndSID ? sidModelLabel(flags, 6) : model1;
  const instruments = [];
  const chips = 1 + (has2ndSID ? 1 : 0) + (has3rdSID ? 1 : 0);
  let id = 1;
  for (let chip = 0; chip < chips; chip++) {
    const model = chip === 0 ? model1 : model2;
    const label = chip > 0 ? `SID${chip + 1}` : "SID";
    for (let v = 1; v <= 3; v++) {
      instruments.push({
        id: id++,
        name: `${label} Voice ${v} (${model})`,
        type: "synth",
        synthType: "C64SID",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  const numCh = instruments.length;
  const sidClock = isNTSC ? 1022727 : 985248;
  const codeOffset = loadAddrField === 0 ? dataOffset + 2 : dataOffset;
  let patterns;
  let songPositions;
  let restartPosition = 0;
  let speed = 6;
  let bpm = Math.round(frameRate * 5 / 2);
  const cached = await getCachedPatterns(buffer);
  if (cached) {
    patterns = cached.patterns;
    songPositions = cached.songPositions;
    restartPosition = cached.restartPosition;
    speed = cached.speed;
    bpm = cached.bpm;
  } else {
    const emptyPat = () => ({
      id: "p0",
      name: "Pattern 1",
      length: 16,
      channels: Array.from({ length: numCh }, (_, i) => {
        var _a;
        return {
          id: `ch${i}`,
          name: ((_a = instruments[i]) == null ? void 0 : _a.name) || `SID ${i + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: 0,
          instrumentId: null,
          color: null,
          rows: Array.from({ length: 16 }, emptyCell)
        };
      })
    });
    if (loadAddr > 0 && initAddr > 0) {
      try {
        const frameStates = runSIDEmulation(buf, loadAddr, initAddr, playAddr, codeOffset, numCh, sidClock);
        if (frameStates.length > 0) {
          speed = detectSpeed(frameStates);
          bpm = Math.round(frameRate * 5 / 2);
          let rows = framesToRows(frameStates, speed, numCh);
          rows = trimTrailingSilence(rows);
          if (rows.length > 0) {
            const patLen = chooseBestPatternLength(rows.length);
            const result = splitIntoPatterns(rows, numCh, instruments, patLen);
            patterns = result.patterns;
            songPositions = result.songPositions;
            const loop = detectLoop(songPositions);
            songPositions = songPositions.slice(0, loop.trimEnd);
            restartPosition = loop.restartPos;
            if (patterns.length > 0 && patterns[0].channels.length > 0) {
              patterns[0].channels[0].rows[0].effTyp = 15;
              patterns[0].channels[0].rows[0].eff = speed;
            }
          } else {
            patterns = [emptyPat()];
            songPositions = [0];
          }
        } else {
          patterns = [emptyPat()];
          songPositions = [0];
        }
      } catch {
        patterns = [emptyPat()];
        songPositions = [0];
      }
    } else {
      patterns = [emptyPat()];
      songPositions = [0];
    }
    void cachePatterns(buffer, patterns, songPositions, restartPosition, speed, bpm);
  }
  const meta = {
    sourceFormat: "SID",
    sourceFile: filename,
    importedAt: (/* @__PURE__ */ new Date()).toISOString(),
    originalChannelCount: numCh,
    originalPatternCount: patterns.length,
    originalInstrumentCount: instruments.length
  };
  for (const p of patterns) p.importMetadata = meta;
  return {
    name: (title || filename.replace(/\.sid$/i, "")) + (author ? ` — ${author}` : ""),
    format: "SID",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition,
    numChannels: numCh,
    initialSpeed: speed,
    initialBPM: bpm,
    c64SidFileData: new Uint8Array(buffer)
  };
}
export {
  isSIDFormat,
  parseSIDFile
};
