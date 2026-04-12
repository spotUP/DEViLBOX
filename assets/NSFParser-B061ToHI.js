import { D as DEFAULT_FURNACE } from "./main-BbV5VyEH.js";
import { C as Cpu6502 } from "./Cpu6502-BtrQdhpg.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function readStr(buf, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}
const NES_CLOCK = 1789773;
function apuTimerToNote(timer, isTriangle = false) {
  if (timer <= 0) return 0;
  const freq = NES_CLOCK / ((isTriangle ? 32 : 16) * (timer + 1));
  if (freq < 20 || freq > 2e4) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
function buildNESInstruments(expansionByte) {
  const insts = [];
  let id = 1;
  const nesBase = ["NES Pulse 1", "NES Pulse 2", "NES Triangle", "NES Noise"];
  for (const name of nesBase) {
    insts.push({
      id: id++,
      name,
      type: "synth",
      synthType: "FurnaceNES",
      furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  if (expansionByte & 1) {
    for (const name of ["VRC6 Pulse 1", "VRC6 Pulse 2", "VRC6 Sawtooth"]) {
      insts.push({
        id: id++,
        name,
        type: "synth",
        synthType: "FurnaceNES",
        furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 },
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (expansionByte & 2) {
    for (let i = 0; i < 6; i++) {
      insts.push({
        id: id++,
        name: `VRC7 FM ${i + 1}`,
        type: "synth",
        synthType: "FurnaceOPLL",
        furnace: { ...DEFAULT_FURNACE, chipType: 13, ops: 2 },
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (expansionByte & 4) {
    insts.push({
      id: id++,
      name: "FDS Wave",
      type: "synth",
      synthType: "FurnaceFDS",
      furnace: { ...DEFAULT_FURNACE, chipType: 15, ops: 2 },
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  if (expansionByte & 8) {
    for (const name of ["MMC5 Pulse 1", "MMC5 Pulse 2"]) {
      insts.push({
        id: id++,
        name,
        type: "synth",
        synthType: "FurnaceMMC5",
        furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 },
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (expansionByte & 16) {
    for (let i = 0; i < 8; i++) {
      insts.push({
        id: id++,
        name: `N163 Wave ${i + 1}`,
        type: "synth",
        synthType: "FurnaceN163",
        furnace: { ...DEFAULT_FURNACE, chipType: 17, ops: 2 },
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  if (expansionByte & 32) {
    for (let i = 0; i < 3; i++) {
      insts.push({
        id: id++,
        name: `5B AY ${i + 1}`,
        type: "synth",
        synthType: "FurnaceAY",
        furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  return insts;
}
function runNSFEmulation(buf, loadAddr, initAddr, playAddr, isPAL, numCh) {
  const FRAMES = 900;
  const ram = new Uint8Array(65536);
  const codeData = buf.subarray(128);
  const codeLen = Math.min(codeData.length, 65536 - loadAddr);
  ram.set(codeData.subarray(0, codeLen), loadAddr);
  ram[65535] = 96;
  const apuRegs = new Uint8Array(32);
  const mem = {
    read(addr) {
      if (addr >= 16384 && addr < 16416) return apuRegs[addr - 16384];
      return ram[addr & 65535];
    },
    write(addr, val) {
      ram[addr & 65535] = val;
      if (addr >= 16384 && addr < 16416) apuRegs[addr - 16384] = val;
    }
  };
  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr);
  cpu.setA(0);
  cpu.setX(isPAL ? 1 : 0);
  cpu.callSubroutine(initAddr);
  const cyclesPerFrame = isPAL ? 35464 : 29780;
  const frameStates = [];
  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(playAddr, cyclesPerFrame);
    const notes = new Array(numCh).fill(null);
    if (apuRegs[21] & 1) {
      const timer = (apuRegs[3] & 7) << 8 | apuRegs[2];
      const vol = apuRegs[0] & 15;
      notes[0] = vol > 0 ? apuTimerToNote(timer) : null;
    }
    if (apuRegs[21] & 2) {
      const timer = (apuRegs[7] & 7) << 8 | apuRegs[6];
      const vol = apuRegs[4] & 15;
      notes[1] = vol > 0 ? apuTimerToNote(timer) : null;
    }
    if (apuRegs[21] & 4) {
      const timer = (apuRegs[11] & 7) << 8 | apuRegs[10];
      const linCnt = apuRegs[8] & 127;
      notes[2] = linCnt > 0 ? apuTimerToNote(timer, true) : null;
    }
    if (apuRegs[21] & 8) {
      const vol = apuRegs[12] & 15;
      notes[3] = vol > 0 ? 37 : null;
    }
    frameStates.push({ notes });
  }
  return frameStates;
}
function framesToPattern(frameStates, instruments, numCh) {
  const MAX_ROWS = 256;
  const step = Math.max(1, Math.ceil(frameStates.length / MAX_ROWS));
  const rows = Math.min(MAX_ROWS, Math.ceil(frameStates.length / step));
  const channels = Array.from({ length: numCh }, (_, i) => {
    var _a;
    return {
      id: `ch${i}`,
      name: ((_a = instruments[i]) == null ? void 0 : _a.name) || `CH ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell)
    };
  });
  const lastNote = new Array(numCh).fill(0);
  for (let row = 0; row < rows; row++) {
    const fs = frameStates[Math.min(row * step, frameStates.length - 1)];
    for (let ch = 0; ch < numCh && ch < fs.notes.length; ch++) {
      const n = fs.notes[ch];
      const cell = channels[ch].rows[row];
      if (n !== null && n !== lastNote[ch]) {
        cell.note = n;
        cell.instrument = ch + 1;
        lastNote[ch] = n;
      } else if (n === null && lastNote[ch] > 0) {
        cell.note = 97;
        lastNote[ch] = 0;
      }
    }
  }
  return { id: "p0", name: "Pattern 1", length: rows, channels };
}
function isNSFFormat(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 5 && b[0] === 78 && b[1] === 69 && b[2] === 83 && b[3] === 77 && b[4] === 26;
}
function isNSFEFormat(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 78 && b[1] === 83 && b[2] === 70 && b[3] === 69;
}
async function parseNSFFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  let title = "", artist = "", songs = 1, expansion = 0;
  let loadAddr = 32768, initAddr = 32768, playAddr = 32768;
  let isPAL = false;
  if (isNSFFormat(buffer)) {
    title = readStr(buf, 14, 34);
    artist = readStr(buf, 48, 34);
    songs = buf[6] || 1;
    expansion = buf[127];
    loadAddr = buf[8] | buf[9] << 8;
    initAddr = buf[10] | buf[11] << 8;
    playAddr = buf[12] | buf[13] << 8;
    isPAL = (buf[112] & 1) !== 0;
  } else if (isNSFEFormat(buffer)) {
    const dv = new DataView(buffer);
    let off = 4;
    while (off + 8 <= buf.length) {
      const size = dv.getUint32(off, true);
      const id = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
      off += 8;
      if (id === "INFO" && size >= 9) {
        loadAddr = dv.getUint16(off, true);
        initAddr = dv.getUint16(off + 2, true);
        playAddr = dv.getUint16(off + 4, true);
        songs = buf[off + 6] || 1;
        expansion = buf[off + 8];
      } else if (id === "auth" && size > 0) {
        let s = off, field = 0;
        for (let i = off; i < off + size; i++) {
          if (buf[i] === 0 || i === off + size - 1) {
            const text = readStr(buf, s, i - s + 1);
            if (field === 0) title = text;
            if (field === 1) artist = text;
            s = i + 1;
            field++;
          }
        }
      } else if (id === "NEND") break;
      off += size;
    }
  } else {
    throw new Error("Not a valid NSF/NSFE file");
  }
  const instruments = buildNESInstruments(expansion);
  const numCh = 4;
  let pattern;
  if (loadAddr > 0 && initAddr > 0 && playAddr > 0) {
    try {
      const frameStates = runNSFEmulation(buf, loadAddr, initAddr, playAddr, isPAL, numCh);
      pattern = framesToPattern(frameStates, instruments, numCh);
    } catch {
      pattern = {
        id: "p0",
        name: "Pattern 1",
        length: 16,
        channels: Array.from({ length: numCh }, (_, i) => {
          var _a;
          return {
            id: `ch${i}`,
            name: ((_a = instruments[i]) == null ? void 0 : _a.name) || `CH ${i + 1}`,
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
      };
    }
  } else {
    pattern = {
      id: "p0",
      name: "Pattern 1",
      length: 16,
      channels: Array.from({ length: numCh }, (_, i) => {
        var _a;
        return {
          id: `ch${i}`,
          name: ((_a = instruments[i]) == null ? void 0 : _a.name) || `CH ${i + 1}`,
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
    };
  }
  return {
    name: (title || filename.replace(/\.nsfe?$/i, "")) + (artist ? ` — ${artist}` : ""),
    format: "NSF",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: songs,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 1,
    initialBPM: isPAL ? 50 : 60
  };
}
export {
  isNSFEFormat,
  isNSFFormat,
  parseNSFFile
};
