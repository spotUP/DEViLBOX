import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const AM_MAGIC = 16717;
function r16(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function rs16(buf, off) {
  const v = r16(buf, off);
  return v >= 32768 ? v - 65536 : v;
}
function parseNTInstrument(ntBuf, instrIndex) {
  const base = 24 + instrIndex * 120;
  if (base + 36 > ntBuf.length) return null;
  if (r16(ntBuf, base) !== AM_MAGIC) return null;
  return {
    waveform: r16(ntBuf, base + 26) & 3,
    basePeriod: r16(ntBuf, base + 6),
    attackTarget: rs16(ntBuf, base + 8),
    attackRate: rs16(ntBuf, base + 10),
    attack2Target: rs16(ntBuf, base + 12),
    attack2Rate: rs16(ntBuf, base + 14),
    decayTarget: rs16(ntBuf, base + 16),
    decayRate: rs16(ntBuf, base + 18),
    sustainCount: r16(ntBuf, base + 20),
    releaseRate: rs16(ntBuf, base + 24),
    vibFreqStep: r16(ntBuf, base + 28),
    vibAmplitude: rs16(ntBuf, base + 30),
    periodShift: r16(ntBuf, base + 34)
  };
}
const PERIOD_TABLE = [
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113
];
function periodToNote(period) {
  if (period === 0) return 0;
  let best = 0;
  let bestDist = 99999;
  for (let i = 0; i < PERIOD_TABLE.length; i++) {
    const dist = Math.abs(PERIOD_TABLE[i] - period);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best + 1;
}
function parseStartrekkerAMFile(modBuffer, filename, ntBuffer) {
  const modBuf = new Uint8Array(modBuffer);
  let title = "";
  for (let i = 0; i < 20; i++) {
    const c = modBuf[i];
    if (c === 0) break;
    if (c >= 32 && c < 127) title += String.fromCharCode(c);
  }
  title = title.trim();
  if (!title) {
    const baseName = filename.split("/").pop() ?? filename;
    title = baseName.replace(/\.(adsc|mod)$/i, "");
  }
  const ntBuf = ntBuffer && ntBuffer.byteLength >= 24 ? new Uint8Array(ntBuffer) : null;
  let maxPat = 0;
  if (modBuf.length >= 952 + 128) {
    for (let i = 0; i < 128; i++) {
      if (modBuf[952 + i] > maxPat) maxPat = modBuf[952 + i];
    }
  }
  const numPatternsForSamples = maxPat + 1;
  const sampleDataStart = 1084 + numPatternsForSamples * 1024;
  const sampleStarts = [];
  let sampleOff = sampleDataStart;
  for (let i = 0; i < 31; i++) {
    sampleStarts.push(sampleOff);
    const dataBase = 20 + i * 30 + 22;
    if (dataBase + 2 <= modBuf.length) {
      sampleOff += r16(modBuf, dataBase) * 2;
    }
  }
  const instruments = [];
  const AMIGA_SAMPLE_RATE = 8287;
  for (let i = 0; i < 31; i++) {
    const hdrBase = 20 + i * 30;
    if (hdrBase + 30 > modBuf.length) break;
    let name = "";
    for (let j = 0; j < 22; j++) {
      const c = modBuf[hdrBase + j];
      if (c >= 32 && c < 127) name += String.fromCharCode(c);
      else if (c === 0 && name.length > 0) break;
    }
    name = name.trim();
    const dataBase = hdrBase + 22;
    const sampleLen = r16(modBuf, dataBase);
    const volume = modBuf[dataBase + 3];
    const loopStart = r16(modBuf, dataBase + 4);
    const loopLen = r16(modBuf, dataBase + 6);
    let isAM = false;
    let wfName = "";
    if (ntBuf) {
      const ntBase = 24 + (i + 1) * 120;
      if (ntBase + 2 <= ntBuf.length) {
        const magic = r16(ntBuf, ntBase);
        if (magic === AM_MAGIC) {
          isAM = true;
          const wfNum = ntBase + 26 < ntBuf.length ? r16(ntBuf, ntBase + 26) & 3 : 0;
          wfName = ["Sine", "Sawtooth", "Square", "Noise"][wfNum] ?? "Sine";
        }
      }
    }
    if (!name && sampleLen === 0 && !isAM) continue;
    if (!name) {
      name = isAM ? `AM ${wfName} ${i + 1}` : `Sample ${i + 1}`;
    }
    if (isAM) {
      const amConfig = ntBuf ? parseNTInstrument(ntBuf, i + 1) : void 0;
      instruments.push({
        id: i + 1,
        name: `AM ${wfName} ${i + 1}`,
        type: "synth",
        synthType: "StartrekkerAMSynth",
        effects: [],
        volume: 100,
        pan: 0,
        ...amConfig ? { startrekkerAM: amConfig } : {}
      });
    } else {
      const sampleBytes = sampleLen * 2;
      const start = sampleStarts[i];
      const end = Math.min(start + sampleBytes, modBuf.length);
      const pcm = modBuf.subarray(start, end);
      if (pcm.length > 0) {
        const loopStartBytes = loopStart * 2;
        const loopEndBytes = loopLen > 1 ? (loopStart + loopLen) * 2 : 0;
        const inst = createSamplerInstrument(
          i + 1,
          name,
          new Uint8Array(pcm),
          volume,
          AMIGA_SAMPLE_RATE,
          loopStartBytes,
          loopEndBytes
        );
        instruments.push(inst);
      } else {
        instruments.push({
          id: i + 1,
          name,
          type: "sample",
          synthType: "Sampler",
          effects: [],
          volume: Math.min(volume, 64) * 100 / 64,
          pan: 0
        });
      }
    }
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: "Song Preview",
      type: "synth",
      synthType: "StartrekkerAMSynth",
      effects: [],
      volume: 100,
      pan: 0
    });
  }
  let numPatterns = 1;
  if (modBuf.length >= 952 + 128) {
    let maxPat2 = 0;
    for (let i = 0; i < 128; i++) {
      if (modBuf[952 + i] > maxPat2) maxPat2 = modBuf[952 + i];
    }
    numPatterns = maxPat2 + 1;
  }
  const patternDataStart = 1084;
  const patterns = Array.from({ length: numPatterns }, (_, pi) => {
    const patBase = patternDataStart + pi * 1024;
    const channels = Array.from({ length: 4 }, (_2, ch) => {
      const rows = Array.from({ length: 64 }, (__, row) => {
        const cellOff = patBase + row * 16 + ch * 4;
        if (cellOff + 4 > modBuf.length) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        const b0 = modBuf[cellOff];
        const b1 = modBuf[cellOff + 1];
        const b2 = modBuf[cellOff + 2];
        const b3 = modBuf[cellOff + 3];
        const period = (b0 & 15) << 8 | b1;
        const instr = b0 & 240 | b2 >> 4;
        const effCmd = b2 & 15;
        const effParam = b3;
        const note = periodToNote(period);
        return {
          note,
          instrument: instr,
          volume: 0,
          effTyp: effCmd,
          eff: effParam,
          effTyp2: 0,
          eff2: 0
        };
      });
      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      };
    });
    return {
      id: `pattern-${pi}`,
      name: `Pattern ${pi}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: "MOD",
        sourceFile: filename,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length
      }
    };
  });
  const songLen = modBuf.length >= 951 ? modBuf[950] : 1;
  const songPositions = [];
  for (let i = 0; i < Math.min(songLen, 128); i++) {
    songPositions.push(modBuf[952 + i] ?? 0);
  }
  if (songPositions.length === 0) songPositions.push(0);
  const song = {
    name: `${title} [StarTrekker AM]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: modBuf.length >= 952 ? modBuf[951] ?? 0 : 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: modBuffer.slice(0),
    uadeEditableFileName: filename,
    // Attach binary data for the WASM engine
    startrekkerAMFileData: modBuffer.slice(0),
    startrekkerAMNtData: ntBuffer ? ntBuffer.slice(0) : void 0
  };
  return song;
}
export {
  parseStartrekkerAMFile
};
