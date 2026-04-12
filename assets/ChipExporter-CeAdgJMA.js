import { dI as FurnaceChipType, ew as FurnaceChipEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const VGM_CMD = {
  // YM2612 (OPN2)
  YM2612_PORT0: 82,
  YM2612_PORT1: 83,
  // YM2151 (OPM)
  YM2151: 84,
  // YM2413 (OPLL)
  YM2413: 81,
  // YMF262 (OPL3)
  YMF262_PORT0: 94,
  YMF262_PORT1: 95,
  // SN76489 (PSG)
  SN76489: 80,
  // AY-3-8910
  AY8910: 160,
  // Game Boy DMG
  GB_DMG: 179,
  // NES APU
  NES_APU: 180,
  // HuC6280 (PCE)
  HUC6280: 185,
  // Extended command
  // K051649 (SCC)
  K051649: 210,
  // Custom extension
  // Wait commands
  WAIT_735: 98,
  // Wait 735 samples (1/60 sec NTSC)
  WAIT_882: 99,
  // Wait 882 samples (1/50 sec PAL)
  WAIT_N: 97,
  // Wait n samples (16-bit)
  WAIT_1: 112,
  // Wait 1-16 samples (0x70-0x7F)
  END: 102
};
const VGM_HEADER = {
  IDENT: 0,
  // "Vgm "
  EOF_OFFSET: 4,
  // Relative offset to end of file
  VERSION: 8,
  // VGM version (0x171 = 1.71)
  SN76489_CLOCK: 12,
  YM2413_CLOCK: 16,
  GD3_OFFSET: 20,
  TOTAL_SAMPLES: 24,
  LOOP_OFFSET: 28,
  LOOP_SAMPLES: 32,
  RATE: 36,
  YM2612_CLOCK: 44,
  YM2151_CLOCK: 48,
  DATA_OFFSET: 52,
  YMF262_CLOCK: 92,
  AY8910_CLOCK: 116,
  GB_DMG_CLOCK: 128,
  NES_APU_CLOCK: 132,
  HUC6280_CLOCK: 148,
  K051649_CLOCK: 156
};
const CHIP_CLOCKS = {
  [FurnaceChipType.OPN2]: 7670453,
  // Genesis NTSC
  [FurnaceChipType.OPM]: 3579545,
  // Standard YM2151
  [FurnaceChipType.PSG]: 3579545,
  // SMS PSG
  [FurnaceChipType.OPLL]: 3579545,
  [FurnaceChipType.OPL3]: 14318180,
  [FurnaceChipType.AY]: 1789773,
  [FurnaceChipType.GB]: 4194304,
  [FurnaceChipType.NES]: 1789773,
  [FurnaceChipType.PCE]: 3579545,
  [FurnaceChipType.SCC]: 3579545,
  [FurnaceChipType.SID]: 1e6
  // PAL
};
function parseRegisterLog(data) {
  const writes = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i + 12 <= data.length; i += 12) {
    const timestamp = view.getUint32(i, true);
    const chipType = view.getUint8(i + 4);
    const port = view.getUint32(i + 5, true) & 65535;
    const regData = view.getUint8(i + 9);
    writes.push({ timestamp, chipType, port, data: regData });
  }
  return writes;
}
function createGD3Tag(options) {
  const strings = [
    options.title || "DEViLBOX Export",
    // Track name (English)
    "",
    // Track name (Japanese)
    options.game || "",
    // Game name (English)
    "",
    // Game name (Japanese)
    options.system || "Furnace Chips",
    // System name (English)
    "",
    // System name (Japanese)
    options.author || "",
    // Author (English)
    "",
    // Author (Japanese)
    options.releaseDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    // Release date
    "DEViLBOX Tracker",
    // VGM ripper
    ""
    // Notes
  ];
  const encoded = [];
  for (const str of strings) {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      encoded.push(code & 255, code >> 8 & 255);
    }
    encoded.push(0, 0);
  }
  const gd3 = new Uint8Array(12 + encoded.length);
  const gd3View = new DataView(gd3.buffer);
  gd3View.setUint32(0, 540238919, true);
  gd3View.setUint32(4, 256, true);
  gd3View.setUint32(8, encoded.length, true);
  gd3.set(encoded, 12);
  return gd3;
}
function getVGMCommand(chipType, port) {
  switch (chipType) {
    case FurnaceChipType.OPN2:
      return port < 256 ? { cmd: VGM_CMD.YM2612_PORT0, adjustedPort: port } : { cmd: VGM_CMD.YM2612_PORT1, adjustedPort: port - 256 };
    case FurnaceChipType.OPM:
      return { cmd: VGM_CMD.YM2151, adjustedPort: port };
    case FurnaceChipType.OPLL:
      return { cmd: VGM_CMD.YM2413, adjustedPort: port };
    case FurnaceChipType.OPL3:
      return port < 256 ? { cmd: VGM_CMD.YMF262_PORT0, adjustedPort: port } : { cmd: VGM_CMD.YMF262_PORT1, adjustedPort: port - 256 };
    case FurnaceChipType.PSG:
      return { cmd: VGM_CMD.SN76489, adjustedPort: 0 };
    // PSG is data-only
    case FurnaceChipType.AY:
      return { cmd: VGM_CMD.AY8910, adjustedPort: port };
    case FurnaceChipType.GB:
      return { cmd: VGM_CMD.GB_DMG, adjustedPort: port };
    case FurnaceChipType.NES:
      return { cmd: VGM_CMD.NES_APU, adjustedPort: port };
    case FurnaceChipType.PCE:
      return { cmd: VGM_CMD.HUC6280, adjustedPort: port };
    case FurnaceChipType.SCC:
      return { cmd: VGM_CMD.K051649, adjustedPort: port };
    default:
      return null;
  }
}
function exportToVGM(writes, options = {}) {
  options.sampleRate || 44100;
  const commands = [];
  const usedChips = /* @__PURE__ */ new Set();
  for (const write of writes) {
    usedChips.add(write.chipType);
  }
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);
  let lastTimestamp = 0;
  let totalSamples = 0;
  for (const write of sortedWrites) {
    const waitSamples = write.timestamp - lastTimestamp;
    if (waitSamples > 0) {
      totalSamples += waitSamples;
      let remaining = waitSamples;
      while (remaining > 0) {
        if (remaining >= 882 && remaining < 735 * 2) {
          commands.push(VGM_CMD.WAIT_882);
          remaining -= 882;
        } else if (remaining >= 735) {
          commands.push(VGM_CMD.WAIT_735);
          remaining -= 735;
        } else if (remaining >= 16) {
          const waitN = Math.min(remaining, 65535);
          commands.push(VGM_CMD.WAIT_N, waitN & 255, waitN >> 8 & 255);
          remaining -= waitN;
        } else {
          commands.push(VGM_CMD.WAIT_1 + (remaining - 1));
          remaining = 0;
        }
      }
    }
    lastTimestamp = write.timestamp;
    const vgmCmd = getVGMCommand(write.chipType, write.port);
    if (vgmCmd) {
      if (write.chipType === FurnaceChipType.PSG) {
        commands.push(vgmCmd.cmd, write.data);
      } else {
        commands.push(vgmCmd.cmd, vgmCmd.adjustedPort & 255, write.data);
      }
    }
  }
  commands.push(VGM_CMD.END);
  const gd3 = createGD3Tag(options);
  const headerSize = 256;
  const dataOffset = headerSize - 52;
  const gd3Offset = headerSize + commands.length - 20;
  const eofOffset = headerSize + commands.length + gd3.length - 4;
  const totalSize = headerSize + commands.length + gd3.length;
  const vgm = new Uint8Array(totalSize);
  const view = new DataView(vgm.buffer);
  view.setUint32(VGM_HEADER.IDENT, 544040790, true);
  view.setUint32(VGM_HEADER.EOF_OFFSET, eofOffset, true);
  view.setUint32(VGM_HEADER.VERSION, 369, true);
  view.setUint32(VGM_HEADER.GD3_OFFSET, gd3Offset, true);
  view.setUint32(VGM_HEADER.TOTAL_SAMPLES, totalSamples, true);
  view.setUint32(VGM_HEADER.RATE, 60, true);
  view.setUint32(VGM_HEADER.DATA_OFFSET, dataOffset, true);
  if (usedChips.has(FurnaceChipType.OPN2)) {
    view.setUint32(VGM_HEADER.YM2612_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPN2], true);
  }
  if (usedChips.has(FurnaceChipType.OPM)) {
    view.setUint32(VGM_HEADER.YM2151_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPM], true);
  }
  if (usedChips.has(FurnaceChipType.PSG)) {
    view.setUint32(VGM_HEADER.SN76489_CLOCK, CHIP_CLOCKS[FurnaceChipType.PSG], true);
  }
  if (usedChips.has(FurnaceChipType.OPLL)) {
    view.setUint32(VGM_HEADER.YM2413_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPLL], true);
  }
  if (usedChips.has(FurnaceChipType.OPL3)) {
    view.setUint32(VGM_HEADER.YMF262_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPL3], true);
  }
  if (usedChips.has(FurnaceChipType.AY)) {
    view.setUint32(VGM_HEADER.AY8910_CLOCK, CHIP_CLOCKS[FurnaceChipType.AY], true);
  }
  if (usedChips.has(FurnaceChipType.GB)) {
    view.setUint32(VGM_HEADER.GB_DMG_CLOCK, CHIP_CLOCKS[FurnaceChipType.GB], true);
  }
  if (usedChips.has(FurnaceChipType.NES)) {
    view.setUint32(VGM_HEADER.NES_APU_CLOCK, CHIP_CLOCKS[FurnaceChipType.NES], true);
  }
  if (usedChips.has(FurnaceChipType.PCE)) {
    view.setUint32(VGM_HEADER.HUC6280_CLOCK, CHIP_CLOCKS[FurnaceChipType.PCE], true);
  }
  if (usedChips.has(FurnaceChipType.SCC)) {
    view.setUint32(VGM_HEADER.K051649_CLOCK, CHIP_CLOCKS[FurnaceChipType.SCC], true);
  }
  if (options.loopPoint !== void 0 && options.loopPoint > 0) {
    let loopByteOffset = 0;
    let sampleCount = 0;
    for (let i = 0; i < commands.length; i++) {
      if (sampleCount >= options.loopPoint) {
        loopByteOffset = i;
        break;
      }
      const cmd = commands[i];
      if (cmd === VGM_CMD.WAIT_735) sampleCount += 735;
      else if (cmd === VGM_CMD.WAIT_882) sampleCount += 882;
      else if (cmd === VGM_CMD.WAIT_N) {
        sampleCount += commands[i + 1] | commands[i + 2] << 8;
        i += 2;
      } else if (cmd >= VGM_CMD.WAIT_1 && cmd <= 127) {
        sampleCount += cmd - VGM_CMD.WAIT_1 + 1;
      }
    }
    if (loopByteOffset > 0) {
      view.setUint32(VGM_HEADER.LOOP_OFFSET, headerSize + loopByteOffset - 28, true);
      view.setUint32(VGM_HEADER.LOOP_SAMPLES, totalSamples - options.loopPoint, true);
    }
  }
  vgm.set(commands, headerSize);
  vgm.set(gd3, headerSize + commands.length);
  return vgm;
}
const ZSM_HEADER_SIZE = 16;
function veraRegToZSM(reg) {
  return reg & 63;
}
function buildHeader(tickRate, loopOffset, pcmOffset, usesYM, usesVERA) {
  const header = new Uint8Array(ZSM_HEADER_SIZE);
  const view = new DataView(header.buffer);
  header[0] = 122;
  header[1] = 109;
  header[2] = 1;
  view.setUint16(3, tickRate, true);
  header[5] = loopOffset & 255;
  header[6] = loopOffset >> 8 & 255;
  header[7] = loopOffset >> 16 & 255;
  header[8] = pcmOffset & 255;
  header[9] = pcmOffset >> 8 & 255;
  header[10] = pcmOffset >> 16 & 255;
  header[11] = usesYM ? 255 : 0;
  view.setUint16(12, usesVERA ? 65535 : 0, true);
  header[14] = pcmOffset > 0 ? 1 : 0;
  header[15] = 0;
  return header;
}
function exportToZSM(writes, options = {}) {
  var _a;
  const tickRate = options.tickRate || 60;
  const samplesPerTick = 44100 / tickRate;
  const commands = [];
  let usesYM = false;
  let usesVERA = false;
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);
  const supportedWrites = sortedWrites.filter(
    (w) => w.chipType === FurnaceChipType.OPM || w.chipType === FurnaceChipType.VERA
  );
  if (supportedWrites.length === 0) {
    console.warn("[ZSMExporter] No YM2151 or VERA writes found in log");
  }
  let lastTick = 0;
  let loopByteOffset = 0;
  for (const write of supportedWrites) {
    const currentTick = Math.floor(write.timestamp / samplesPerTick);
    const tickDelta = currentTick - lastTick;
    if (tickDelta > 0) {
      if (options.loopPoint && lastTick < options.loopPoint && currentTick >= options.loopPoint) {
        loopByteOffset = commands.length;
      }
      let remaining = tickDelta;
      while (remaining > 0) {
        if (remaining <= 128) {
          commands.push(128 | remaining - 1);
          remaining = 0;
        } else {
          commands.push(128 | 127);
          remaining -= 128;
        }
      }
      lastTick = currentTick;
    }
    if (write.chipType === FurnaceChipType.OPM) {
      usesYM = true;
      const reg = write.port & 255;
      if (reg < 128) {
        commands.push(64 | reg >> 1);
        commands.push((reg & 1) << 7 | write.data & 127);
      } else {
        commands.push(64 | 63);
        commands.push(reg);
        commands.push(write.data);
      }
    } else if (write.chipType === FurnaceChipType.VERA) {
      usesVERA = true;
      const reg = veraRegToZSM(write.port);
      commands.push(reg);
      commands.push(write.data);
    }
  }
  commands.push(128, 0);
  const musicDataSize = commands.length;
  const pcmOffset = options.pcmData ? ZSM_HEADER_SIZE + musicDataSize : 0;
  const header = buildHeader(
    tickRate,
    loopByteOffset,
    pcmOffset,
    usesYM,
    usesVERA
  );
  const totalSize = ZSM_HEADER_SIZE + musicDataSize + (((_a = options.pcmData) == null ? void 0 : _a.length) || 0);
  const zsm = new Uint8Array(totalSize);
  zsm.set(header, 0);
  zsm.set(commands, ZSM_HEADER_SIZE);
  if (options.pcmData) {
    zsm.set(options.pcmData, ZSM_HEADER_SIZE + musicDataSize);
  }
  return zsm;
}
function canExportZSM(writes) {
  return writes.some(
    (w) => w.chipType === FurnaceChipType.OPM || w.chipType === FurnaceChipType.VERA
  );
}
function buildSAPHeader(options, frameCount) {
  const lines = ["SAP"];
  lines.push(`AUTHOR "${options.author || "DEViLBOX"}"`);
  lines.push(`NAME "${options.name || "Untitled"}"`);
  lines.push(`DATE "${options.date || (/* @__PURE__ */ new Date()).getFullYear()}"`);
  lines.push("TYPE R");
  if (options.ntsc) {
    lines.push("NTSC");
  }
  if (options.stereo) {
    lines.push("STEREO");
  }
  if (options.fastplay) {
    lines.push(`FASTPLAY ${options.fastplay}`);
  }
  if (options.songs && options.songs > 1) {
    lines.push(`SONGS ${options.songs}`);
    if (options.defaultSong) {
      lines.push(`DEFSONG ${options.defaultSong}`);
    }
  }
  lines.push(`TIME ${formatTime(frameCount, options.ntsc ? 60 : 50)}`);
  lines.push("");
  return lines.join("\r\n");
}
function formatTime(frames, fps) {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.floor(totalSeconds % 1 * 1e3);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
function groupWritesByFrame(writes, samplesPerFrame) {
  const frames = /* @__PURE__ */ new Map();
  for (const write of writes) {
    const frame = Math.floor(write.timestamp / samplesPerFrame);
    if (!frames.has(frame)) {
      frames.set(frame, []);
    }
    frames.get(frame).push(write);
  }
  return frames;
}
function buildRawPOKEYData(writes, options) {
  const fps = options.ntsc ? 60 : 50;
  const samplesPerFrame = 44100 / fps;
  const pokeyWrites = writes.filter(
    (w) => w.chipType === FurnaceChipType.TIA
    // TIA maps to POKEY in our enum
    // Note: If there's a dedicated POKEY type, use that instead
  );
  const allWrites = pokeyWrites.length > 0 ? pokeyWrites : writes;
  const frameGroups = groupWritesByFrame(allWrites, samplesPerFrame);
  const maxFrame = Math.max(...frameGroups.keys(), 0);
  const frameCount = maxFrame + 1;
  const bytesPerFrame = options.stereo ? 18 : 9;
  const data = new Uint8Array(frameCount * bytesPerFrame);
  const currentState = new Uint8Array(options.stereo ? 18 : 9);
  for (let frame = 0; frame < frameCount; frame++) {
    const frameWrites = frameGroups.get(frame) || [];
    const frameOffset = frame * bytesPerFrame;
    for (const write of frameWrites) {
      const reg = write.port & 15;
      if (reg <= 8) {
        currentState[reg] = write.data;
        if (options.stereo && write.port >= 16) {
          currentState[9 + reg] = write.data;
        }
      }
    }
    data.set(currentState, frameOffset);
  }
  return { data, frameCount };
}
function exportToSAP(writes, options = {}) {
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);
  const { data: rawData, frameCount } = buildRawPOKEYData(sortedWrites, options);
  const header = buildSAPHeader(options, frameCount);
  const headerBytes = new TextEncoder().encode(header);
  const totalSize = headerBytes.length + 2 + rawData.length;
  const sap = new Uint8Array(totalSize);
  sap.set(headerBytes, 0);
  sap[headerBytes.length] = 255;
  sap[headerBytes.length + 1] = 255;
  sap.set(rawData, headerBytes.length + 2);
  return sap;
}
function canExportSAP(writes) {
  return writes.some(
    (w) => w.chipType === FurnaceChipType.TIA || w.port >= 53760 && w.port <= 53791
    // Direct POKEY address
  );
}
function buildTIunAHeader(options, frameCount, loopFrame) {
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  header[0] = 84;
  header[1] = 73;
  header[2] = 117;
  header[3] = 65;
  header[4] = 1;
  header[5] = 0;
  view.setUint16(6, frameCount, true);
  view.setUint16(8, loopFrame >= 0 ? loopFrame : 65535, true);
  header[10] = options.ntsc ? 1 : 0;
  return header;
}
function buildTIAFrameData(writes, options) {
  const fps = options.ntsc ? 60 : 50;
  const samplesPerFrame = 44100 / fps;
  const tiaWrites = writes.filter((w) => w.chipType === FurnaceChipType.TIA);
  if (tiaWrites.length === 0) {
    console.warn("[TIunAExporter] No TIA writes found in log");
    return { data: new Uint8Array(0), frameCount: 0 };
  }
  const frameGroups = /* @__PURE__ */ new Map();
  for (const write of tiaWrites) {
    const frame = Math.floor(write.timestamp / samplesPerFrame);
    if (!frameGroups.has(frame)) {
      frameGroups.set(frame, []);
    }
    frameGroups.get(frame).push(write);
  }
  const maxFrame = Math.max(...frameGroups.keys(), 0);
  const frameCount = maxFrame + 1;
  const bytesPerFrame = 6;
  const data = new Uint8Array(frameCount * bytesPerFrame);
  const currentState = new Uint8Array(6);
  for (let frame = 0; frame < frameCount; frame++) {
    const frameWrites = frameGroups.get(frame) || [];
    const frameOffset = frame * bytesPerFrame;
    for (const write of frameWrites) {
      let reg = write.port;
      if (reg >= 21) {
        reg -= 21;
      }
      if (reg >= 0 && reg < 6) {
        currentState[reg] = write.data;
      }
    }
    data.set(currentState, frameOffset);
  }
  return { data, frameCount };
}
function exportToTIunA(writes, options = {}) {
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);
  const { data: frameData, frameCount } = buildTIAFrameData(sortedWrites, options);
  if (frameCount === 0) {
    throw new Error("No TIA data to export");
  }
  const header = buildTIunAHeader(options, frameCount, options.loopFrame ?? -1);
  const totalSize = header.length + frameData.length;
  const tiuna = new Uint8Array(totalSize);
  tiuna.set(header, 0);
  tiuna.set(frameData, header.length);
  return tiuna;
}
function canExportTIunA(writes) {
  return writes.some((w) => w.chipType === FurnaceChipType.TIA);
}
const GYM_CMD = {
  YM2612_PORT0: 0,
  YM2612_PORT1: 1,
  PSG: 2,
  WAIT_1: 3
};
const FRAME_RATE$3 = 60;
const SAMPLES_PER_FRAME$3 = 44100 / FRAME_RATE$3;
function canExportGYM(writes) {
  const supportedChips = [FurnaceChipType.OPN2, FurnaceChipType.PSG];
  return writes.some((w) => supportedChips.includes(w.chipType));
}
function exportToGYM(writes, options = {}) {
  const commands = [];
  const filteredWrites = writes.filter(
    (w) => w.chipType === FurnaceChipType.OPN2 || w.chipType === FurnaceChipType.PSG
  );
  if (filteredWrites.length === 0) {
    return new Uint8Array(0);
  }
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);
  let lastTimestamp = 0;
  for (const write of sortedWrites) {
    const sampleDelta = write.timestamp - lastTimestamp;
    const frameDelta = Math.round(sampleDelta / SAMPLES_PER_FRAME$3);
    if (frameDelta > 0) {
      let remaining = frameDelta;
      while (remaining > 0) {
        if (remaining === 1) {
          commands.push(GYM_CMD.WAIT_1);
          remaining = 0;
        } else {
          const waitFrames = Math.min(remaining, 252);
          commands.push(GYM_CMD.WAIT_1 + waitFrames);
          remaining -= waitFrames;
        }
      }
    }
    lastTimestamp = write.timestamp;
    if (write.chipType === FurnaceChipType.OPN2) {
      if (write.port < 256) {
        commands.push(GYM_CMD.YM2612_PORT0, write.port & 255, write.data);
      } else {
        commands.push(GYM_CMD.YM2612_PORT1, write.port - 256 & 255, write.data);
      }
    } else if (write.chipType === FurnaceChipType.PSG) {
      commands.push(GYM_CMD.PSG, write.data);
    }
  }
  return new Uint8Array(commands);
}
const NSF_HEADER_SIZE = 128;
const NSF_MAGIC = [78, 69, 83, 77, 26];
const FRAME_RATE$2 = 60;
const SAMPLES_PER_FRAME$2 = 44100 / FRAME_RATE$2;
function canExportNSF(writes) {
  return writes.some((w) => w.chipType === FurnaceChipType.NES);
}
function create6502Driver() {
  const baseAddress = 32768;
  const ZP_DATA_PTR_LO = 0;
  const ZP_DATA_PTR_HI = 1;
  const ZP_PLAYING = 2;
  const initCode = [
    // LDA #<data_start (to be patched)
    169,
    0,
    // STA ZP_DATA_PTR_LO
    133,
    ZP_DATA_PTR_LO,
    // LDA #>data_start (to be patched)
    169,
    0,
    // STA ZP_DATA_PTR_HI
    133,
    ZP_DATA_PTR_HI,
    // LDA #$01
    169,
    1,
    // STA ZP_PLAYING
    133,
    ZP_PLAYING,
    // LDA #$0F ; Enable all APU channels
    169,
    15,
    // STA $4015
    141,
    21,
    64,
    // LDA #$40 ; Disable frame IRQ
    169,
    64,
    // STA $4017
    141,
    23,
    64,
    // RTS
    96
  ];
  const playCode = [
    // LDA ZP_PLAYING
    165,
    ZP_PLAYING,
    // BEQ done
    240,
    42,
    // branch offset (to RTS)
    // loop:
    // LDY #$00
    160,
    0,
    // LDA (ZP_DATA_PTR_LO),Y
    177,
    ZP_DATA_PTR_LO,
    // BEQ frame_done ; 0x00 = end of frame
    240,
    29,
    // CMP #$FF
    201,
    255,
    // BEQ song_done ; 0xFF = end of song
    240,
    32,
    // TAX ; register offset in X
    170,
    // INY
    200,
    // LDA (ZP_DATA_PTR_LO),Y ; value
    177,
    ZP_DATA_PTR_LO,
    // STA $4000,X ; write to APU register
    157,
    0,
    64,
    // Advance pointer by 2
    // CLC
    24,
    // LDA ZP_DATA_PTR_LO
    165,
    ZP_DATA_PTR_LO,
    // ADC #$02
    105,
    2,
    // STA ZP_DATA_PTR_LO
    133,
    ZP_DATA_PTR_LO,
    // BCC loop
    144,
    227,
    // INC ZP_DATA_PTR_HI
    230,
    ZP_DATA_PTR_HI,
    // JMP loop
    76,
    4,
    128,
    // address to be patched
    // frame_done: advance pointer by 1
    // INC ZP_DATA_PTR_LO
    230,
    ZP_DATA_PTR_LO,
    // BNE done
    208,
    2,
    // INC ZP_DATA_PTR_HI
    230,
    ZP_DATA_PTR_HI,
    // done: RTS
    96,
    // song_done: stop playing
    // LDA #$00
    169,
    0,
    // STA ZP_PLAYING
    133,
    ZP_PLAYING,
    // STA $4015 ; silence APU
    141,
    21,
    64,
    // RTS
    96
  ];
  return { initCode, playCode, baseAddress };
}
function encodeRegisterData$2(writes) {
  const data = [];
  const filteredWrites = writes.filter((w) => w.chipType === FurnaceChipType.NES);
  if (filteredWrites.length === 0) {
    data.push(255);
    return data;
  }
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);
  let currentFrame = 0;
  for (const write of sortedWrites) {
    const writeFrame = Math.floor(write.timestamp / SAMPLES_PER_FRAME$2);
    while (currentFrame < writeFrame) {
      data.push(0);
      currentFrame++;
    }
    const regOffset = write.port & 31;
    if (regOffset > 23) continue;
    data.push(regOffset, write.data);
  }
  data.push(0);
  data.push(255);
  return data;
}
function createNSFHeader(options, loadAddress, initAddress, playAddress, dataLength) {
  const header = new Uint8Array(NSF_HEADER_SIZE);
  const view = new DataView(header.buffer);
  header.set(NSF_MAGIC, 0);
  header[5] = 1;
  header[6] = options.totalSongs || 1;
  header[7] = options.startingSong || 1;
  view.setUint16(8, loadAddress, true);
  view.setUint16(10, initAddress, true);
  view.setUint16(12, playAddress, true);
  const title = options.title || "DEViLBOX Export";
  for (let i = 0; i < Math.min(title.length, 31); i++) {
    header[14 + i] = title.charCodeAt(i);
  }
  const artist = options.artist || "";
  for (let i = 0; i < Math.min(artist.length, 31); i++) {
    header[46 + i] = artist.charCodeAt(i);
  }
  const copyright = options.copyright || (/* @__PURE__ */ new Date()).getFullYear().toString();
  for (let i = 0; i < Math.min(copyright.length, 31); i++) {
    header[78 + i] = copyright.charCodeAt(i);
  }
  view.setUint16(110, options.ntscSpeed || 16666, true);
  view.setUint16(120, options.palSpeed || 2e4, true);
  const region = options.region || "ntsc";
  header[122] = region === "ntsc" ? 0 : region === "pal" ? 1 : 2;
  header[123] = 0;
  return header;
}
function exportToNSF(writes, options = {}) {
  const driver = create6502Driver();
  const regData = encodeRegisterData$2(writes);
  const loadAddress = options.loadAddress || 32768;
  const initAddress = options.initAddress || loadAddress;
  const playCodeOffset = driver.initCode.length;
  const playAddress = options.playAddress || loadAddress + playCodeOffset;
  const dataOffset = playCodeOffset + driver.playCode.length;
  const dataAddress = loadAddress + dataOffset;
  const initCode = [...driver.initCode];
  initCode[1] = dataAddress & 255;
  initCode[5] = dataAddress >> 8 & 255;
  const playCode = [...driver.playCode];
  const loopJmpOffset = playCode.indexOf(76);
  if (loopJmpOffset !== -1) {
    const loopTarget = loadAddress + playCodeOffset + 4;
    playCode[loopJmpOffset + 1] = loopTarget & 255;
    playCode[loopJmpOffset + 2] = loopTarget >> 8 & 255;
  }
  const codeAndData = new Uint8Array(initCode.length + playCode.length + regData.length);
  codeAndData.set(initCode, 0);
  codeAndData.set(playCode, initCode.length);
  codeAndData.set(regData, initCode.length + playCode.length);
  const header = createNSFHeader(options, loadAddress, initAddress, playAddress, codeAndData.length);
  const nsf = new Uint8Array(header.length + codeAndData.length);
  nsf.set(header, 0);
  nsf.set(codeAndData, header.length);
  return nsf;
}
const GBS_HEADER_SIZE = 112;
const GBS_MAGIC = [71, 66, 83];
const FRAME_RATE$1 = 60;
const SAMPLES_PER_FRAME$1 = 44100 / FRAME_RATE$1;
function canExportGBS(writes) {
  return writes.some((w) => w.chipType === FurnaceChipType.GB);
}
function createZ80Driver() {
  const baseAddress = 16384;
  const initCode = [
    // LD A, low_byte(data_start)
    62,
    0,
    // to be patched
    // LD ($FF80), A
    224,
    128,
    // LD A, high_byte(data_start)
    62,
    0,
    // to be patched
    // LD ($FF81), A
    224,
    129,
    // LD A, $01
    62,
    1,
    // LD ($FF82), A ; playing = true
    224,
    130,
    // LD A, $80 ; Enable audio
    62,
    128,
    // LD ($FF26), A ; NR52
    224,
    38,
    // LD A, $FF ; Max volume, all channels to both speakers
    62,
    255,
    // LD ($FF25), A ; NR51
    224,
    37,
    // LD A, $77 ; Master volume max
    62,
    119,
    // LD ($FF24), A ; NR50
    224,
    36,
    // RET
    201
  ];
  const playCode = [
    // LD A, ($FF82) ; check playing flag
    240,
    130,
    // OR A
    183,
    // RET Z ; return if not playing
    200,
    // LD A, ($FF80) ; get data ptr low
    240,
    128,
    // LD L, A
    111,
    // LD A, ($FF81) ; get data ptr high
    240,
    129,
    // LD H, A
    103,
    // loop:
    // LD A, (HL) ; read command byte
    126,
    // OR A
    // JR Z, frame_done ; 0x00 = end of frame
    183,
    40,
    20,
    // relative jump offset
    // CP $FF
    254,
    255,
    // JR Z, song_done ; 0xFF = end of song
    40,
    26,
    // relative jump offset
    // LD C, A ; register offset in C (will write to $FF10 + offset)
    79,
    // INC HL
    35,
    // LD A, (HL) ; read value
    126,
    // INC HL
    35,
    // PUSH HL
    229,
    // LD H, $FF
    38,
    255,
    // LD L, C ; HL = $FF00 + offset
    105,
    // LD (HL), A ; write to audio register
    119,
    // POP HL
    225,
    // JR loop
    24,
    232,
    // relative jump back
    // frame_done:
    // INC HL ; advance past 0x00
    35,
    // LD A, L
    125,
    // LD ($FF80), A
    224,
    128,
    // LD A, H
    124,
    // LD ($FF81), A
    224,
    129,
    // RET
    201,
    // song_done:
    // XOR A ; A = 0
    175,
    // LD ($FF82), A ; playing = false
    224,
    130,
    // LD ($FF26), A ; disable audio
    224,
    38,
    // RET
    201
  ];
  return { initCode, playCode, baseAddress };
}
function encodeRegisterData$1(writes) {
  const data = [];
  const filteredWrites = writes.filter((w) => w.chipType === FurnaceChipType.GB);
  if (filteredWrites.length === 0) {
    data.push(255);
    return data;
  }
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);
  let currentFrame = 0;
  for (const write of sortedWrites) {
    const writeFrame = Math.floor(write.timestamp / SAMPLES_PER_FRAME$1);
    while (currentFrame < writeFrame) {
      data.push(0);
      currentFrame++;
    }
    const regOffset = write.port & 255;
    if (regOffset < 16 || regOffset > 63) continue;
    data.push(regOffset, write.data);
  }
  data.push(0);
  data.push(255);
  return data;
}
function createGBSHeader(options, loadAddress, initAddress, playAddress, stackPointer) {
  const header = new Uint8Array(GBS_HEADER_SIZE);
  const view = new DataView(header.buffer);
  header.set(GBS_MAGIC, 0);
  header[3] = 1;
  header[4] = options.totalSongs || 1;
  header[5] = options.startingSong || 1;
  view.setUint16(6, loadAddress, true);
  view.setUint16(8, initAddress, true);
  view.setUint16(10, playAddress, true);
  view.setUint16(12, stackPointer, true);
  header[14] = options.timerModulo || 0;
  header[15] = options.timerControl || 0;
  const title = options.title || "DEViLBOX Export";
  for (let i = 0; i < Math.min(title.length, 31); i++) {
    header[16 + i] = title.charCodeAt(i);
  }
  const author = options.author || "";
  for (let i = 0; i < Math.min(author.length, 31); i++) {
    header[48 + i] = author.charCodeAt(i);
  }
  const copyright = options.copyright || (/* @__PURE__ */ new Date()).getFullYear().toString();
  for (let i = 0; i < Math.min(copyright.length, 31); i++) {
    header[80 + i] = copyright.charCodeAt(i);
  }
  return header;
}
function exportToGBS(writes, options = {}) {
  const driver = createZ80Driver();
  const regData = encodeRegisterData$1(writes);
  const loadAddress = options.loadAddress || 16384;
  const initAddress = options.initAddress || loadAddress;
  const playCodeOffset = driver.initCode.length;
  const playAddress = options.playAddress || loadAddress + playCodeOffset;
  const dataOffset = playCodeOffset + driver.playCode.length;
  const dataAddress = loadAddress + dataOffset;
  const stackPointer = 65534;
  const initCode = [...driver.initCode];
  initCode[1] = dataAddress & 255;
  initCode[5] = dataAddress >> 8 & 255;
  const codeAndData = new Uint8Array(initCode.length + driver.playCode.length + regData.length);
  codeAndData.set(initCode, 0);
  codeAndData.set(driver.playCode, initCode.length);
  codeAndData.set(regData, initCode.length + driver.playCode.length);
  const header = createGBSHeader(options, loadAddress, initAddress, playAddress, stackPointer);
  const gbs = new Uint8Array(header.length + codeAndData.length);
  gbs.set(header, 0);
  gbs.set(codeAndData, header.length);
  return gbs;
}
const SPC_HEADER_SIZE = 256;
const SPC_MAGIC = "SNES-SPC700 Sound File Data v0.30";
const SPC_RAM_SIZE = 65536;
const SPC_DSP_REGS = 128;
const DSP = {
  // Voice registers (8 voices, 16 bytes each at 0x00-0x7F)
  // Per voice: VOL_L, VOL_R, PITCH_L, PITCH_H, SRCN, ADSR1, ADSR2, GAIN, ENVX, OUTX
  MVOL_L: 12,
  // Main volume left
  MVOL_R: 28,
  // Key off
  FLG: 108
};
const FRAME_RATE = 60;
const SAMPLES_PER_FRAME = 32e3 / FRAME_RATE;
function canExportSPC(writes) {
  return writes.some((w) => w.chipType === FurnaceChipType.SNES);
}
function createSPC700Driver() {
  const entryPoint = 512;
  const code = [
    // Initialize timer 0 for ~60Hz (256 / 128 * 8MHz = 62.5Hz)
    // MOVW YA, #data_start (to be patched)
    186,
    0,
    0,
    // MOVW YA, $0000
    // MOVW $00, YA     ; Store data pointer at $00-$01
    218,
    0,
    // Set up timer
    // MOV $FA, #$00    ; Disable timers
    143,
    0,
    250,
    // MOV $F1, #$30    ; Clear ports, enable ROM
    143,
    48,
    241,
    // MOV $FD, #$00    ; Clear timer 0 output
    228,
    253,
    // MOV $FA, #$80    ; Timer 0 divider (128 = ~62.5Hz)
    143,
    128,
    250,
    // MOV $F1, #$01    ; Enable timer 0
    143,
    1,
    241,
    // Main loop:
    // wait_timer:
    // MOV A, $FD       ; Read timer 0 output
    228,
    253,
    // BEQ wait_timer   ; Wait for tick
    240,
    252,
    // relative jump -4
    // process_frame:
    // MOV Y, #$00
    141,
    0,
    // read_loop:
    // MOV A, ($00)+Y   ; Read command byte
    247,
    0,
    // BEQ frame_done   ; 0x00 = end of frame
    240,
    18,
    // CMP A, #$FF      ; Check for end marker
    104,
    255,
    // BEQ song_done
    240,
    22,
    // Write to DSP
    // MOV $F2, A       ; DSP register address
    196,
    242,
    // INC Y
    252,
    // MOV A, ($00)+Y   ; Read value
    247,
    0,
    // MOV $F3, A       ; DSP register data
    196,
    243,
    // INC Y
    252,
    // BRA read_loop
    47,
    237,
    // relative jump back
    // frame_done:
    // INC Y
    252,
    // ; Advance data pointer
    // CLRC
    96,
    // ADC A, $00
    132,
    0,
    // MOV $00, A
    196,
    0,
    // MOV A, $01
    228,
    1,
    // ADC A, #$00
    136,
    0,
    // MOV $01, A
    196,
    1,
    // BRA wait_timer   ; Back to main loop
    47,
    210,
    // song_done:
    // ; Could loop here or stop
    // BRA song_done    ; Infinite loop (silent)
    47,
    254
  ];
  return { code, entryPoint };
}
function encodeRegisterData(writes) {
  const data = [];
  const filteredWrites = writes.filter((w) => w.chipType === FurnaceChipType.SNES);
  if (filteredWrites.length === 0) {
    data.push(255);
    return data;
  }
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);
  let currentFrame = 0;
  for (const write of sortedWrites) {
    const writeFrame = Math.floor(write.timestamp / SAMPLES_PER_FRAME);
    while (currentFrame < writeFrame) {
      data.push(0);
      currentFrame++;
    }
    const reg = write.port & 127;
    data.push(reg, write.data);
  }
  data.push(0);
  data.push(255);
  return data;
}
function createID666Tag(options) {
  const tag = new Uint8Array(210);
  const title = options.title || "DEViLBOX Export";
  for (let i = 0; i < Math.min(title.length, 32); i++) {
    tag[i] = title.charCodeAt(i);
  }
  const game = options.game || "";
  for (let i = 0; i < Math.min(game.length, 32); i++) {
    tag[32 + i] = game.charCodeAt(i);
  }
  const dumper = options.dumper || "DEViLBOX";
  for (let i = 0; i < Math.min(dumper.length, 16); i++) {
    tag[64 + i] = dumper.charCodeAt(i);
  }
  const comments = options.comments || "";
  for (let i = 0; i < Math.min(comments.length, 32); i++) {
    tag[80 + i] = comments.charCodeAt(i);
  }
  const date = options.dumpDate || (/* @__PURE__ */ new Date()).toLocaleDateString("en-US");
  for (let i = 0; i < Math.min(date.length, 11); i++) {
    tag[112 + i] = date.charCodeAt(i);
  }
  const length = (options.songLength || 180).toString();
  for (let i = 0; i < Math.min(length.length, 3); i++) {
    tag[123 + i] = length.charCodeAt(i);
  }
  const fade = (options.fadeLength || 1e4).toString();
  for (let i = 0; i < Math.min(fade.length, 5); i++) {
    tag[126 + i] = fade.charCodeAt(i);
  }
  const artist = options.artist || "";
  for (let i = 0; i < Math.min(artist.length, 32); i++) {
    tag[131 + i] = artist.charCodeAt(i);
  }
  return tag;
}
function exportToSPC(writes, options = {}) {
  const driver = createSPC700Driver();
  const regData = encodeRegisterData(writes);
  const codeStart = driver.entryPoint;
  const dataStart = codeStart + driver.code.length;
  const code = [...driver.code];
  code[1] = dataStart & 255;
  code[2] = dataStart >> 8 & 255;
  const ram = new Uint8Array(SPC_RAM_SIZE);
  ram.set(code, codeStart);
  ram.set(regData, dataStart);
  const dsp = new Uint8Array(SPC_DSP_REGS);
  dsp[DSP.FLG] = 224;
  dsp[DSP.MVOL_L] = 127;
  dsp[DSP.MVOL_R] = 127;
  const spc = new Uint8Array(SPC_HEADER_SIZE + SPC_RAM_SIZE + SPC_DSP_REGS + 64);
  const view = new DataView(spc.buffer);
  const magic = SPC_MAGIC;
  for (let i = 0; i < magic.length; i++) {
    spc[i] = magic.charCodeAt(i);
  }
  spc[33] = 26;
  spc[34] = 26;
  spc[35] = 26;
  spc[36] = 30;
  view.setUint16(37, driver.entryPoint, true);
  spc[39] = 0;
  spc[40] = 0;
  spc[41] = 0;
  spc[42] = 0;
  spc[43] = 239;
  const id666 = createID666Tag(options);
  spc.set(id666, 46);
  spc.set(ram, SPC_HEADER_SIZE);
  spc.set(dsp, SPC_HEADER_SIZE + SPC_RAM_SIZE);
  return spc;
}
const S98_DEVICE = {
  // End of device table
  YM2149: 1,
  // AY-compatible (Atari ST)
  YM2203: 2,
  // OPN
  YM2612: 3,
  // OPN2
  YM2608: 4,
  // OPNA
  YM2151: 5,
  // OPM
  YM2413: 6,
  // OPLL
  YM3526: 7,
  // OPL
  YM3812: 8,
  // OPL2
  YMF262: 9,
  // OPL3
  AY8910: 15,
  // AY-3-8910
  SN76489: 16
  // SN76489 PSG
};
const S98_CLOCKS = {
  [S98_DEVICE.YM2149]: 2e6,
  [S98_DEVICE.YM2203]: 3993600,
  [S98_DEVICE.YM2612]: 7670454,
  [S98_DEVICE.YM2608]: 7987200,
  [S98_DEVICE.YM2151]: 3579545,
  [S98_DEVICE.YM2413]: 3579545,
  [S98_DEVICE.YM3526]: 3579545,
  [S98_DEVICE.YM3812]: 3579545,
  [S98_DEVICE.YMF262]: 14318180,
  [S98_DEVICE.AY8910]: 1789773,
  [S98_DEVICE.SN76489]: 3579545
};
const CHIP_TO_S98 = {
  [FurnaceChipType.AY]: S98_DEVICE.YM2149,
  [FurnaceChipType.OPN2]: S98_DEVICE.YM2612,
  [FurnaceChipType.OPM]: S98_DEVICE.YM2151,
  [FurnaceChipType.OPLL]: S98_DEVICE.YM2413,
  [FurnaceChipType.OPL3]: S98_DEVICE.YMF262,
  [FurnaceChipType.PSG]: S98_DEVICE.SN76489
};
const S98_SUPPORTED_CHIPS = new Set(Object.keys(CHIP_TO_S98).map(Number));
const S98_CMD = {
  SYNC: 255,
  // Wait 1 tick
  WAIT_N: 254,
  // Wait n+2 ticks (followed by LE uint32)
  END: 253
  // End of data / loop back
};
const SAMPLES_PER_TICK = 735;
function canExportS98(writes) {
  return writes.some((w) => S98_SUPPORTED_CHIPS.has(w.chipType));
}
function createPSFTag(options) {
  const lines = ["[S98]"];
  if (options.title) lines.push(`title=${options.title}`);
  if (options.artist) lines.push(`artist=${options.artist}`);
  if (options.game) lines.push(`game=${options.game}`);
  if (options.year) lines.push(`year=${options.year}`);
  lines.push("comment=Created by DEViLBOX");
  const tagStr = lines.join("\n") + "\n";
  const encoder = new TextEncoder();
  return encoder.encode(tagStr);
}
function buildDeviceTable(usedChips) {
  const devices = [];
  const chipIndexMap = /* @__PURE__ */ new Map();
  Array.from(usedChips).forEach((chipType) => {
    const s98Type = CHIP_TO_S98[chipType];
    if (s98Type !== void 0) {
      devices.push({ s98Type, furnaceType: chipType });
    }
  });
  devices.sort((a, b) => a.s98Type - b.s98Type);
  for (let i = 0; i < devices.length; i++) {
    chipIndexMap.set(devices[i].furnaceType, i);
  }
  const tableSize = (devices.length + 1) * 16;
  const table = new Uint8Array(tableSize);
  const view = new DataView(table.buffer);
  for (let i = 0; i < devices.length; i++) {
    const offset = i * 16;
    const s98Type = devices[i].s98Type;
    view.setUint32(offset, s98Type, true);
    view.setUint32(offset + 4, S98_CLOCKS[s98Type], true);
    view.setUint32(offset + 8, 0, true);
    view.setUint32(offset + 12, 0, true);
  }
  const termOffset = devices.length * 16;
  view.setUint32(termOffset, 0, true);
  view.setUint32(termOffset + 4, 0, true);
  view.setUint32(termOffset + 8, 0, true);
  view.setUint32(termOffset + 12, 0, true);
  return { table, chipIndexMap };
}
function emitWait(commands, ticks) {
  let remaining = ticks;
  while (remaining > 0) {
    if (remaining >= 6) {
      const n = remaining - 2;
      commands.push(
        S98_CMD.WAIT_N,
        n & 255,
        n >> 8 & 255,
        n >> 16 & 255,
        n >> 24 & 255
      );
      remaining = 0;
    } else {
      commands.push(S98_CMD.SYNC);
      remaining--;
    }
  }
}
function getS98CommandByte(chipType, port, chipIndexMap) {
  const deviceIndex = chipIndexMap.get(chipType);
  if (deviceIndex === void 0) return null;
  if (chipType === FurnaceChipType.OPN2 || chipType === FurnaceChipType.OPL3) {
    const portBit = port >= 256 ? 1 : 0;
    return deviceIndex * 2 + portBit;
  }
  return deviceIndex * 2;
}
function exportToS98(writes, options = {}) {
  const commands = [];
  const usedChips = /* @__PURE__ */ new Set();
  for (const write of writes) {
    if (S98_SUPPORTED_CHIPS.has(write.chipType)) {
      usedChips.add(write.chipType);
    }
  }
  const { table: deviceTable, chipIndexMap } = buildDeviceTable(usedChips);
  const headerSize = 32;
  const dataDumpOffset = headerSize + deviceTable.length;
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);
  const loopTickTarget = options.loopPoint !== void 0 && options.loopPoint > 0 ? Math.floor(options.loopPoint / SAMPLES_PER_TICK) : -1;
  let loopByteOffset = 0;
  let loopFound = false;
  let lastTick = 0;
  for (const write of sortedWrites) {
    if (!S98_SUPPORTED_CHIPS.has(write.chipType)) continue;
    const tick = Math.floor(write.timestamp / SAMPLES_PER_TICK);
    const waitTicks = tick - lastTick;
    if (waitTicks > 0) {
      if (!loopFound && loopTickTarget >= 0 && lastTick <= loopTickTarget && tick > loopTickTarget) {
        const preLoopWait = loopTickTarget - lastTick;
        if (preLoopWait > 0) emitWait(commands, preLoopWait);
        loopByteOffset = commands.length;
        loopFound = true;
        const postLoopWait = tick - loopTickTarget;
        if (postLoopWait > 0) emitWait(commands, postLoopWait);
      } else {
        emitWait(commands, waitTicks);
      }
    }
    lastTick = tick;
    if (!loopFound && loopTickTarget >= 0 && tick >= loopTickTarget) {
      loopByteOffset = commands.length;
      loopFound = true;
    }
    const cmdByte = getS98CommandByte(write.chipType, write.port, chipIndexMap);
    if (cmdByte === null) continue;
    if (write.chipType === FurnaceChipType.PSG) {
      commands.push(cmdByte, 0, write.data);
    } else if (write.chipType === FurnaceChipType.OPN2 || write.chipType === FurnaceChipType.OPL3) {
      const reg = write.port >= 256 ? write.port - 256 & 255 : write.port & 255;
      commands.push(cmdByte, reg, write.data);
    } else {
      commands.push(cmdByte, write.port & 255, write.data);
    }
  }
  commands.push(S98_CMD.END);
  const psfTag = createPSFTag(options);
  const tagOffset = dataDumpOffset + commands.length;
  const loopOffset = loopFound ? dataDumpOffset + loopByteOffset : 0;
  const totalSize = dataDumpOffset + commands.length + psfTag.length;
  const s98 = new Uint8Array(totalSize);
  const view = new DataView(s98.buffer);
  s98[0] = 83;
  s98[1] = 57;
  s98[2] = 56;
  s98[3] = 51;
  view.setUint32(4, SAMPLES_PER_TICK, true);
  view.setUint32(8, 44100, true);
  view.setUint32(12, 0, true);
  view.setUint32(16, tagOffset, true);
  view.setUint32(20, dataDumpOffset, true);
  view.setUint32(24, loopOffset, true);
  s98.set(deviceTable, headerSize);
  s98.set(commands, dataDumpOffset);
  s98.set(psfTag, tagOffset);
  return s98;
}
const AY_NUM_REGISTERS = 14;
const SAMPLES_PER_FRAME_50HZ = 882;
function canExportSNDH(writes) {
  return writes.some((w) => w.chipType === FurnaceChipType.AY);
}
function buildFrames(writes) {
  const ayWrites = writes.filter((w) => w.chipType === FurnaceChipType.AY).sort((a, b) => a.timestamp - b.timestamp);
  if (ayWrites.length === 0) return [];
  const regs = new Uint8Array(AY_NUM_REGISTERS);
  const lastTimestamp = ayWrites[ayWrites.length - 1].timestamp;
  const totalFrames = Math.max(1, Math.ceil(lastTimestamp / SAMPLES_PER_FRAME_50HZ) + 1);
  const frames = [];
  let writeIdx = 0;
  for (let frame = 0; frame < totalFrames; frame++) {
    const frameEnd = (frame + 1) * SAMPLES_PER_FRAME_50HZ;
    while (writeIdx < ayWrites.length && ayWrites[writeIdx].timestamp < frameEnd) {
      const w = ayWrites[writeIdx];
      if (w.port < AY_NUM_REGISTERS) {
        regs[w.port] = w.data & 255;
      }
      writeIdx++;
    }
    frames.push(new Uint8Array(regs));
  }
  return frames;
}
function encodeString(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 127);
  }
  bytes.push(0);
  return bytes;
}
function build68kStub(frames) {
  const numFrames = frames.length;
  const frameDataLen = numFrames * AY_NUM_REGISTERS;
  const STUB_SIZE = 76;
  const totalSize = STUB_SIZE + frameDataLen;
  const buf = new Uint8Array(totalSize);
  const v = new DataView(buf.buffer);
  const w16 = (off, val) => v.setUint16(off, val & 65535, false);
  const w32 = (off, val) => v.setUint32(off, val >>> 0, false);
  w16(0, 24576);
  w16(2, 10);
  w16(4, 24576);
  w16(6, 18);
  w16(8, 20085);
  w16(10, 20081);
  const FRAME_DATA_OFF = 76;
  const FRAME_PTR_OFF = 68;
  const FRAME_END_OFF = 72;
  w16(12, 16890);
  w16(14, FRAME_DATA_OFF - 14);
  w16(16, 17402);
  w16(18, FRAME_PTR_OFF - 18);
  w16(20, 8840);
  w16(22, 20085);
  w16(24, 17914);
  w16(26, FRAME_PTR_OFF - 26);
  w16(28, 8274);
  w16(30, 17400);
  w16(32, 34816);
  w16(34, 28672);
  w16(36, 4736);
  w16(38, 4952);
  w16(40, 2);
  w16(42, 20992);
  w16(44, 3072);
  w16(46, 14);
  w16(48, 26354);
  w16(50, 9352);
  w16(52, 18426);
  w16(54, FRAME_END_OFF - 54);
  w16(56, 45523);
  w16(58, 27912);
  w16(58, 27910);
  w16(60, 16890);
  w16(62, FRAME_DATA_OFF - 62);
  w16(64, 9352);
  w16(66, 20085);
  w32(68, 0);
  return buildStubV2(frames, numFrames, frameDataLen);
}
function buildStubV2(frames, _numFrames, frameDataLen) {
  const FRAME_PTR = 78;
  const FRAME_END = 82;
  const FRAME_DATA = 86;
  const STUB_SIZE = FRAME_DATA;
  const totalSize = STUB_SIZE + frameDataLen;
  const buf = new Uint8Array(totalSize);
  const v = new DataView(buf.buffer);
  const w16 = (off, val) => v.setUint16(off, val & 65535, false);
  const w32 = (off, val) => v.setUint32(off, val >>> 0, false);
  w16(0, 24576);
  w16(2, 10);
  w16(4, 24576);
  w16(6, 28);
  w16(8, 20085);
  w16(10, 20081);
  w16(12, 16890);
  w16(14, FRAME_DATA - 14);
  w16(16, 17402);
  w16(18, FRAME_PTR - 18);
  w16(20, 8840);
  w16(22, 16890);
  w16(24, FRAME_DATA + frameDataLen - 24);
  w16(26, 17402);
  w16(28, FRAME_END - 28);
  w16(30, 8840);
  w16(32, 20085);
  w16(34, 17914);
  w16(36, FRAME_PTR - 36);
  w16(38, 8274);
  w16(40, 17400);
  w16(42, 34816);
  w16(44, 28672);
  w16(46, 4736);
  w16(48, 4952);
  w16(50, 2);
  w16(52, 20992);
  w16(54, 3072);
  w16(56, 14);
  w16(58, 26354);
  w16(60, 9352);
  w16(62, 18426);
  w16(64, FRAME_END - 64);
  w16(66, 45523);
  w16(68, 27910);
  w16(70, 16890);
  w16(72, FRAME_DATA - 72);
  w16(74, 9352);
  w16(76, 20085);
  w32(FRAME_PTR, 0);
  w32(FRAME_END, 0);
  let offset = FRAME_DATA;
  for (const frame of frames) {
    buf.set(frame, offset);
    offset += AY_NUM_REGISTERS;
  }
  return buf;
}
function exportToSNDH(writes, options = {}) {
  const frames = buildFrames(writes);
  if (frames.length === 0) {
    throw new Error("No AY/YM2149 register data to export");
  }
  const title = options.title || "DEViLBOX Export";
  const composer = options.composer || "Unknown";
  const year = options.year || (/* @__PURE__ */ new Date()).getFullYear().toString();
  const header = [];
  header.push(83, 78, 68, 72);
  header.push(...encodeString("TITL" + title));
  header.push(...encodeString("COMM" + composer));
  header.push(...encodeString("YEAR" + year));
  header.push(35, 35, 48, 49);
  header.push(33, 86, 67, 84);
  header.push(72, 68, 78, 83);
  if (header.length % 2 !== 0) {
    header.push(0);
  }
  const stub = build68kStub(frames);
  const totalSize = header.length + stub.length;
  const sndh = new Uint8Array(totalSize);
  sndh.set(header, 0);
  sndh.set(stub, header.length);
  return sndh;
}
const CHIP_NAMES = {
  [FurnaceChipType.OPN2]: "YM2612 (Genesis)",
  [FurnaceChipType.OPM]: "YM2151 (Arcade)",
  [FurnaceChipType.OPL3]: "YMF262 (OPL3)",
  [FurnaceChipType.PSG]: "SN76489 (PSG)",
  [FurnaceChipType.NES]: "NES APU",
  [FurnaceChipType.GB]: "Game Boy DMG",
  [FurnaceChipType.PCE]: "HuC6280 (PCE)",
  [FurnaceChipType.SCC]: "K051649 (SCC)",
  [FurnaceChipType.AY]: "AY-3-8910",
  [FurnaceChipType.OPLL]: "YM2413 (OPLL)",
  [FurnaceChipType.SID]: "SID",
  [FurnaceChipType.TIA]: "TIA (Atari 2600)",
  [FurnaceChipType.VERA]: "VERA (X16)",
  [FurnaceChipType.SNES]: "SPC700 (SNES)"
};
const FORMAT_INFO = {
  vgm: {
    name: "Video Game Music",
    extension: "vgm",
    mimeType: "application/octet-stream",
    description: "Universal format supporting 40+ chips. Compatible with VGMPlay, foobar2000, and most retro players.",
    supportedChips: [
      FurnaceChipType.OPN2,
      FurnaceChipType.OPM,
      FurnaceChipType.OPL3,
      FurnaceChipType.PSG,
      FurnaceChipType.AY,
      FurnaceChipType.GB,
      FurnaceChipType.NES,
      FurnaceChipType.PCE,
      FurnaceChipType.SCC,
      FurnaceChipType.OPLL
    ]
  },
  zsm: {
    name: "ZSound Music (Commander X16)",
    extension: "zsm",
    mimeType: "application/octet-stream",
    description: "Native format for Commander X16. Supports YM2151 + VERA PSG/PCM.",
    supportedChips: [FurnaceChipType.OPM, FurnaceChipType.VERA]
  },
  sap: {
    name: "Slight Atari Player",
    extension: "sap",
    mimeType: "application/octet-stream",
    description: "Atari 8-bit music format for POKEY chip.",
    supportedChips: [FurnaceChipType.TIA]
    // We map TIA to POKEY
  },
  tiuna: {
    name: "TIunA (Atari 2600)",
    extension: "tia",
    mimeType: "application/octet-stream",
    description: "Simple format for Atari 2600 TIA chip.",
    supportedChips: [FurnaceChipType.TIA]
  },
  gym: {
    name: "Genesis YM2612 Music",
    extension: "gym",
    mimeType: "application/octet-stream",
    description: "Sega Genesis/Mega Drive format. Supports YM2612 (FM) + SN76489 (PSG).",
    supportedChips: [FurnaceChipType.OPN2, FurnaceChipType.PSG]
  },
  nsf: {
    name: "NES Sound Format",
    extension: "nsf",
    mimeType: "application/octet-stream",
    description: "Nintendo Entertainment System music format with embedded 6502 driver.",
    supportedChips: [FurnaceChipType.NES]
  },
  gbs: {
    name: "Game Boy Sound",
    extension: "gbs",
    mimeType: "application/octet-stream",
    description: "Nintendo Game Boy music format with embedded Z80 driver.",
    supportedChips: [FurnaceChipType.GB]
  },
  spc: {
    name: "SNES SPC700",
    extension: "spc",
    mimeType: "application/octet-stream",
    description: "Super Nintendo music format with SPC700 driver and 64KB RAM dump.",
    supportedChips: [FurnaceChipType.SNES]
  },
  s98: {
    name: "Sound Format 98",
    extension: "s98",
    mimeType: "application/octet-stream",
    description: "Japanese FM register dump format. Supports YM2203/2608/2612/2151/2413/AY/SN76489.",
    supportedChips: [
      FurnaceChipType.OPN2,
      FurnaceChipType.OPM,
      FurnaceChipType.AY,
      FurnaceChipType.OPLL,
      FurnaceChipType.PSG,
      FurnaceChipType.OPL3
    ]
  },
  sndh: {
    name: "Atari ST SNDH",
    extension: "sndh",
    mimeType: "application/octet-stream",
    description: "Atari ST music format for YM2149 (AY-compatible) chip.",
    supportedChips: [FurnaceChipType.AY]
  }
};
function getAvailableFormats(writes) {
  const formats = [];
  const vgmChips = FORMAT_INFO.vgm.supportedChips;
  if (writes.some((w) => vgmChips.includes(w.chipType))) {
    formats.push("vgm");
  }
  if (canExportZSM(writes)) {
    formats.push("zsm");
  }
  if (canExportSAP(writes)) {
    formats.push("sap");
  }
  if (canExportTIunA(writes)) {
    formats.push("tiuna");
  }
  if (canExportGYM(writes)) {
    formats.push("gym");
  }
  if (canExportNSF(writes)) {
    formats.push("nsf");
  }
  if (canExportGBS(writes)) {
    formats.push("gbs");
  }
  if (canExportSPC(writes)) {
    formats.push("spc");
  }
  if (canExportS98(writes)) {
    formats.push("s98");
  }
  if (canExportSNDH(writes)) {
    formats.push("sndh");
  }
  return formats;
}
function getLogStatistics(writes) {
  const chipCounts = /* @__PURE__ */ new Map();
  for (const write of writes) {
    chipCounts.set(write.chipType, (chipCounts.get(write.chipType) || 0) + 1);
  }
  const usedChips = Array.from(chipCounts.entries()).map(([type, count]) => ({
    type,
    name: CHIP_NAMES[type] || `Unknown (${type})`,
    writes: count
  })).sort((a, b) => b.writes - a.writes);
  const maxTimestamp = writes.reduce((max, w) => Math.max(max, w.timestamp), 0);
  const duration = maxTimestamp / 44100;
  return {
    totalWrites: writes.length,
    duration,
    usedChips,
    frameRate: 60
    // Default assumption
  };
}
async function exportChipMusic(logData, options) {
  const writes = parseRegisterLog(logData);
  if (writes.length === 0) {
    throw new Error("No register writes found in log data");
  }
  const formatInfo = FORMAT_INFO[options.format];
  let data;
  switch (options.format) {
    case "vgm":
      data = exportToVGM(writes, {
        title: options.title,
        author: options.author,
        loopPoint: options.loopPoint,
        ...options.vgm
      });
      break;
    case "zsm":
      data = exportToZSM(writes, {
        loopPoint: options.loopPoint,
        ...options.zsm
      });
      break;
    case "sap":
      data = exportToSAP(writes, {
        name: options.title,
        author: options.author,
        ...options.sap
      });
      break;
    case "tiuna":
      data = exportToTIunA(writes, {
        title: options.title,
        author: options.author,
        loopFrame: options.loopPoint,
        ...options.tiuna
      });
      break;
    case "gym":
      data = exportToGYM(writes, {
        title: options.title,
        author: options.author,
        ...options.gym
      });
      break;
    case "nsf":
      data = exportToNSF(writes, {
        title: options.title,
        artist: options.author,
        ...options.nsf
      });
      break;
    case "gbs":
      data = exportToGBS(writes, {
        title: options.title,
        author: options.author,
        ...options.gbs
      });
      break;
    case "spc":
      data = exportToSPC(writes, {
        title: options.title,
        artist: options.author,
        ...options.spc
      });
      break;
    case "s98":
      data = exportToS98(writes, {
        title: options.title,
        artist: options.author,
        ...options.s98
      });
      break;
    case "sndh":
      data = exportToSNDH(writes, {
        title: options.title,
        composer: options.author,
        ...options.sndh
      });
      break;
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
  const filename = `${options.title || "export"}.${formatInfo.extension}`;
  return {
    data: new Blob([data.buffer], { type: formatInfo.mimeType }),
    filename,
    mimeType: formatInfo.mimeType,
    format: options.format
  };
}
class ChipRecordingSession {
  isRecording = false;
  engine;
  constructor() {
    this.engine = FurnaceChipEngine.getInstance();
  }
  /**
   * Start recording register writes
   */
  startRecording() {
    if (this.isRecording) {
      console.warn("[ChipRecordingSession] Already recording");
      return;
    }
    this.engine.setLogging(true);
    this.isRecording = true;
    console.log("[ChipRecordingSession] Recording started");
  }
  /**
   * Stop recording and return captured data
   */
  async stopRecording() {
    if (!this.isRecording) {
      console.warn("[ChipRecordingSession] Not recording");
      return new Uint8Array(0);
    }
    this.engine.setLogging(false);
    this.isRecording = false;
    const logData = await this.engine.getLog();
    console.log(`[ChipRecordingSession] Recording stopped. Captured ${logData.length} bytes`);
    return logData;
  }
  /**
   * Check if currently recording
   */
  getIsRecording() {
    return this.isRecording;
  }
  /**
   * Record, then export to specified format
   */
  async recordAndExport(durationMs, options) {
    this.startRecording();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    const logData = await this.stopRecording();
    return exportChipMusic(logData, options);
  }
}
export {
  ChipRecordingSession,
  FORMAT_INFO,
  exportChipMusic,
  getAvailableFormats,
  getLogStatistics,
  parseRegisterLog
};
