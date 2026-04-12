function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function isOldFormat(buf) {
  if (buf.length < 160) return false;
  if (u32BE(buf, 0) !== 3493908544) return false;
  if (u16BE(buf, 4) !== 20219) return false;
  const BRA = 24576;
  if (u16BE(buf, 8) !== BRA) return false;
  if (u16BE(buf, 12) !== BRA) return false;
  if (u16BE(buf, 16) !== BRA) return false;
  if (u16BE(buf, 20) !== BRA) return false;
  if (u16BE(buf, 40) === 17402) return true;
  if (u16BE(buf, 24) === BRA && u16BE(buf, 150) === 17402) return true;
  return false;
}
function isNewFormat(buf) {
  if (buf.length < 60) return false;
  if (u16BE(buf, 0) !== 24602) return false;
  const d1 = u32BE(buf, 2);
  if (d1 === 0 || (d1 & 2147483648) !== 0) return false;
  if ((d1 & 1) !== 0) return false;
  if (u16BE(buf, 6) !== 0) return false;
  for (let i = 0; i < 5; i++) {
    if (u32BE(buf, 8 + i * 4) !== 0) return false;
  }
  const braStart = 28;
  for (let i = 0; i < 4; i++) {
    if (buf.length < braStart + i * 4 + 4) return false;
    if (u16BE(buf, braStart + i * 4) !== 24576) return false;
    const disp = u16BE(buf, braStart + i * 4 + 2);
    if ((disp & 32768) !== 0) return false;
    if ((disp & 1) !== 0) return false;
  }
  const a2base = braStart + 2;
  const firstDisp = u16BE(buf, a2base);
  const dest = a2base + firstDisp;
  if (dest + 4 > buf.length) return false;
  if (u32BE(buf, dest) !== 1223131376) return false;
  return true;
}
function isRareFormat(buf) {
  if (buf.length < 24) return false;
  if (u16BE(buf, 0) !== 24576) return false;
  const disp0 = u16BE(buf, 2);
  if ((disp0 & 32768) !== 0) return false;
  if ((disp0 & 1) !== 0) return false;
  if (u16BE(buf, 4) !== 24576) return false;
  const disp1 = u16BE(buf, 6);
  if ((disp1 & 32768) !== 0) return false;
  if ((disp1 & 1) !== 0) return false;
  let pos = 8;
  if (u16BE(buf, pos) !== 19962) return false;
  pos += 2;
  pos += 2;
  if (pos + 2 > buf.length) return false;
  const tst = u16BE(buf, pos);
  if (tst !== 19030 && tst !== 18966) return false;
  pos += 6;
  if (pos + 6 > buf.length) return false;
  if (u16BE(buf, pos) !== 16889) return false;
  pos += 2;
  if (u32BE(buf, pos) !== 14675968) return false;
  return true;
}
function isMarkCookseyOldPlayerFormat(buf) {
  if (buf.length < 36) return false;
  if (buf[0] !== 96) return false;
  const u32at2 = (buf[2] << 24 | buf[3] << 16 | buf[4] << 8 | buf[5]) >>> 0;
  if ((u32at2 & 4294967040) !== (buf.length & 4294967040)) return false;
  if (buf[32] !== 0) return false;
  return true;
}
function detectVariant(buf) {
  if (isOldFormat(buf)) return "old";
  if (isNewFormat(buf)) return "new";
  if (isRareFormat(buf)) return "rare";
  if (isMarkCookseyOldPlayerFormat(buf)) return "old-player";
  return null;
}
function isMarkCookseyFormat(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  if (buf.length < 24) return false;
  if (filename !== void 0) {
    const baseName = ((_a = filename.split("/").pop()) == null ? void 0 : _a.split("\\").pop()) ?? filename;
    const hasPrefix = /^mc[ro]?\./i.test(baseName) || /^mco\./i.test(baseName);
    const hasExt = /\.(mc|mcr|mco)$/i.test(baseName);
    if (!hasPrefix && !hasExt) {
      return false;
    }
  }
  return detectVariant(buf) !== null;
}
async function parseMarkCookseyFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const variant = detectVariant(buf);
  if (variant === null) {
    throw new Error("Not a Mark Cooksey module");
  }
  const baseName = ((_a = filename.split("/").pop()) == null ? void 0 : _a.split("\\").pop()) ?? filename;
  const moduleName = baseName.replace(/^mc[or]?\./i, "") || baseName;
  const variantLabel = variant === "old" ? "Old (mco)" : variant === "rare" ? "Rare (mcr)" : variant === "old-player" ? "Old Player (mco)" : "New (mc)";
  const extractedSamples = [];
  let subsongCount = 1;
  try {
    let sampleTableAddr = 0;
    let songTableAddr = 0;
    for (let off = 0; off < buf.length - 4; off += 2) {
      const opcode = u16BE(buf, off);
      if (opcode === 16890 && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 32768 ? disp : disp - 65536;
        const target = off + 2 + signedDisp;
        if (target > 0 && target < buf.length && !sampleTableAddr) {
          sampleTableAddr = target;
        }
      }
      if (opcode === 17402 && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 32768 ? disp : disp - 65536;
        const target = off + 2 + signedDisp;
        if (target > 0 && target < buf.length && !songTableAddr) {
          songTableAddr = target;
        }
      }
    }
    if (sampleTableAddr > 0 && sampleTableAddr + 8 <= buf.length) {
      let soff = sampleTableAddr;
      for (let i = 0; i < 64 && soff + 8 <= buf.length; i++) {
        const sampleOff = u32BE(buf, soff);
        const sampleLen = u32BE(buf, soff + 4);
        if (sampleLen === 0 || sampleLen > 1048576) break;
        if (sampleOff > buf.length) break;
        extractedSamples.push({ offset: sampleOff, length: sampleLen });
        soff += 8;
      }
    }
    if (songTableAddr > 0 && songTableAddr + 16 <= buf.length) {
      let count = 0;
      let soff = songTableAddr;
      for (let i = 0; i < 64 && soff + 16 <= buf.length; i++) {
        const marker = u32BE(buf, soff);
        if (marker === 0) break;
        count++;
        soff += 16;
      }
      if (count > 0) subsongCount = count;
    }
  } catch {
  }
  const sampleCount = extractedSamples.length > 0 ? extractedSamples.length : 64;
  const instruments = [];
  for (let i = 0; i < sampleCount; i++) {
    const smp = extractedSamples[i];
    const name = smp ? `Sample ${i + 1} (${smp.length} bytes)` : `Sample ${i + 1}`;
    instruments.push({
      id: i + 1,
      name,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    });
  }
  const songPositions = Array.from({ length: subsongCount }, (_, i) => i % 1);
  const emptyRows = Array.from({ length: 64 }, () => ({
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
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
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
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount
    }
  };
  let displayName = `${moduleName} [Mark Cooksey ${variantLabel}]`;
  if (subsongCount > 1) {
    displayName += ` (${subsongCount} subsongs)`;
  }
  return {
    name: displayName,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songPositions.length || 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isMarkCookseyFormat,
  parseMarkCookseyFile
};
