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
function parseSAPHeader(buf) {
  const meta = {
    name: "",
    author: "",
    songs: 1,
    stereo: false,
    initAddr: 0,
    playerAddr: 0,
    musicAddr: 0,
    type: "B",
    fastplay: 312,
    dataOffset: 0
  };
  let off = 0;
  while (off < buf.length - 1) {
    if (buf[off] === 255 && buf[off + 1] === 255) {
      meta.dataOffset = off + 2;
      break;
    }
    let lineEnd = off;
    while (lineEnd < buf.length && buf[lineEnd] !== 10) lineEnd++;
    const line = new TextDecoder("latin1").decode(buf.subarray(off, lineEnd)).replace(/\r/g, "").trim();
    if (line.startsWith("NAME ")) meta.name = line.slice(5).replace(/^"|"$/g, "").trim();
    if (line.startsWith("AUTHOR ")) meta.author = line.slice(7).replace(/^"|"$/g, "").trim();
    if (line.startsWith("SONGS ")) meta.songs = parseInt(line.slice(6)) || 1;
    if (line === "STEREO") meta.stereo = true;
    if (line.startsWith("TYPE ")) meta.type = line.slice(5).trim();
    if (line.startsWith("INIT ")) meta.initAddr = parseInt(line.slice(5), 16);
    if (line.startsWith("PLAYER ")) meta.playerAddr = parseInt(line.slice(7), 16);
    if (line.startsWith("MUSIC ")) meta.musicAddr = parseInt(line.slice(6), 16);
    if (line.startsWith("FASTPLAY ")) meta.fastplay = parseInt(line.slice(9)) || 312;
    off = lineEnd + 1;
  }
  return meta;
}
function pokeyFreqToNote(audf) {
  if (audf === 0 || audf >= 255) return 0;
  const freq = 63921 / (2 * (audf + 1));
  if (freq < 20 || freq > 2e4) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
function runSAPEmulation(buf, meta, numCh) {
  const FRAMES = 900;
  const ram = new Uint8Array(65536);
  let codeLoadAddr = 0;
  if (meta.dataOffset + 3 < buf.length) {
    codeLoadAddr = buf[meta.dataOffset] | buf[meta.dataOffset + 1] << 8;
    const codeEnd = buf[meta.dataOffset + 2] | buf[meta.dataOffset + 3] << 8;
    const code = buf.subarray(meta.dataOffset + 4, meta.dataOffset + 4 + (codeEnd - codeLoadAddr + 1));
    ram.set(code.subarray(0, Math.min(code.length, 65536 - codeLoadAddr)), codeLoadAddr);
  }
  const pokeyRegs = new Uint8Array(16);
  const mem = {
    read(addr) {
      if (addr >= 53760 && addr < 53776) return pokeyRegs[addr - 53760];
      return ram[addr & 65535];
    },
    write(addr, val) {
      ram[addr & 65535] = val;
      if (addr >= 53760 && addr < 53776) pokeyRegs[addr - 53760] = val;
    }
  };
  const cpu = new Cpu6502(mem);
  const initAddr = meta.type === "B" ? meta.initAddr : meta.musicAddr;
  const playAddr = meta.playerAddr;
  if (initAddr === 0 || playAddr === 0) return [];
  cpu.reset(initAddr);
  cpu.setA(0);
  cpu.callSubroutine(initAddr);
  const frameStates = [];
  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(playAddr);
    const notes = new Array(numCh).fill(null);
    for (let ch = 0; ch < Math.min(numCh, 4); ch++) {
      const audf = pokeyRegs[ch * 2];
      const audc = pokeyRegs[ch * 2 + 1];
      const vol = audc & 15;
      notes[ch] = vol > 0 ? pokeyFreqToNote(audf) : null;
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
      name: ((_a = instruments[i]) == null ? void 0 : _a.name) || `POKEY ${i + 1}`,
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
function isSAPFormat(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 3 && b[0] === 83 && b[1] === 65 && b[2] === 80;
}
async function parseSAPFile(buffer, filename) {
  if (!isSAPFormat(buffer)) throw new Error("Not a valid SAP file");
  const buf = new Uint8Array(buffer);
  const meta = parseSAPHeader(buf);
  const numCh = meta.stereo ? 8 : 4;
  const instruments = Array.from({ length: numCh }, (_, i) => ({
    id: i + 1,
    name: `POKEY ${i + 1}`,
    type: "synth",
    synthType: "FurnacePOKEY",
    furnace: { ...DEFAULT_FURNACE, chipType: 20, ops: 2 },
    effects: [],
    volume: 0,
    pan: 0
  }));
  let pattern;
  if (meta.dataOffset > 0 && meta.initAddr > 0 && meta.playerAddr > 0) {
    try {
      const frameStates = runSAPEmulation(buf, meta, numCh);
      pattern = frameStates.length > 0 ? framesToPattern(frameStates, instruments, numCh) : {
        id: "p0",
        name: "Pattern 1",
        length: 16,
        channels: Array.from({ length: numCh }, (_, i) => ({
          id: `ch${i}`,
          name: `POKEY ${i + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: 0,
          instrumentId: null,
          color: null,
          rows: Array.from({ length: 16 }, emptyCell)
        }))
      };
    } catch {
      pattern = {
        id: "p0",
        name: "Pattern 1",
        length: 16,
        channels: Array.from({ length: numCh }, (_, i) => ({
          id: `ch${i}`,
          name: `POKEY ${i + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: 0,
          instrumentId: null,
          color: null,
          rows: Array.from({ length: 16 }, emptyCell)
        }))
      };
    }
  } else {
    pattern = {
      id: "p0",
      name: "Pattern 1",
      length: 16,
      channels: Array.from({ length: numCh }, (_, i) => ({
        id: `ch${i}`,
        name: `POKEY ${i + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 16 }, emptyCell)
      }))
    };
  }
  return {
    name: (meta.name || filename.replace(/\.sap$/i, "")) + (meta.author ? ` — ${meta.author}` : ""),
    format: "SAP",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: meta.songs,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 1,
    initialBPM: 50
  };
}
export {
  isSAPFormat,
  parseSAPFile
};
