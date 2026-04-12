const MIN_FILE_SIZE = 20;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
const MAGIC_TFMX = (84 << 24 | 70 << 16 | 77 << 8 | 88) >>> 0;
const MAGIC_MCMD = (77 << 24 | 67 << 16 | 77 << 8 | 68) >>> 0;
function checkTFMXSTSong(buf, songOff) {
  if (songOff + 20 > buf.length) return false;
  if (u32BE(buf, songOff) !== MAGIC_TFMX) return false;
  if (buf[songOff + 4] !== 0) return false;
  if (u16BE(buf, songOff + 12) === 0) return false;
  let a0 = songOff + 4;
  if (a0 + 2 > buf.length) return false;
  const w0 = u16BE(buf, a0);
  a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w1 = u16BE(buf, a0);
  a0 += 2;
  let d1 = 2 + w0 + w1 << 6 >>> 0;
  if (a0 + 2 > buf.length) return false;
  const w2 = u16BE(buf, a0);
  a0 += 2;
  let d2 = 1 + w2 >>> 0;
  if (a0 + 2 > buf.length) return false;
  const w3 = u16BE(buf, a0);
  a0 += 2;
  const d3 = Math.imul(1 + w3, 12) >>> 0;
  if (a0 + 2 > buf.length) return false;
  const w4 = u16BE(buf, a0);
  a0 += 2;
  d2 = Math.imul(d2, w4) >>> 0;
  d1 = d1 + d2 + d3 >>> 0;
  a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w5 = u16BE(buf, a0);
  a0 += 2;
  const d2b = Math.imul(1 + w5, 6) >>> 0;
  d1 = d1 + d2b + 32 >>> 0;
  const checkOff = a0 + d1;
  if (checkOff + 34 > buf.length) return false;
  if (u32BE(buf, checkOff) !== 0) return false;
  const d2final = u16BE(buf, checkOff + 4);
  if (d2final === 0) return false;
  const d2times2 = d2final * 2 >>> 0;
  const cmpVal = u32BE(buf, checkOff + 30);
  return d2times2 === cmpVal;
}
function isJochenHippelSTFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const first4 = u32BE(buf, 0);
  if (first4 === MAGIC_TFMX) return true;
  if (first4 === 1223163902) {
    let off2 = 4;
    if (off2 >= buf.length) return false;
    if (buf[off2] !== 97) return false;
    off2 += 1;
    const d1 = buf[off2];
    off2 += 1;
    if (d1 === 0) return false;
    if (d1 & 1) return false;
    off2 += d1;
    if (off2 + 4 > buf.length) return false;
    if (u32BE(buf, off2) !== 788553984) return false;
    off2 += 4;
    if (off2 + 2 > buf.length) return false;
    const jmp1 = u16BE(buf, off2);
    off2 += 2;
    off2 += jmp1;
    if (off2 + 2 > buf.length) return false;
    if (u16BE(buf, off2) !== 16890) return false;
    off2 += 18;
    if (off2 + 2 > buf.length) return false;
    if (u16BE(buf, off2) !== 16890) return false;
    off2 += 2;
    if (off2 + 2 > buf.length) return false;
    const jmp2 = u16BE(buf, off2);
    off2 += 2;
    off2 += jmp2;
    if (off2 + 4 > buf.length) return false;
    return u32BE(buf, off2) === MAGIC_MCMD;
  }
  if (buf[0] !== 96) return false;
  let off = 1;
  const shortBranch = buf[off];
  off += 1;
  if (shortBranch === 0) {
    if (off + 4 > buf.length) return false;
    const d1 = u16BE(buf, off);
    off += 2;
    if (d1 & 32768) return false;
    if (d1 & 1) return false;
    if (u16BE(buf, off) !== 24576) return false;
    off += 2;
    off = 2 + d1;
    if (off + 4 > buf.length) return false;
    if (u32BE(buf, off) !== 1223163902) return false;
    off += 4;
  } else {
    if (shortBranch & 1) return false;
    off = 2 + shortBranch;
    if (off + 4 > buf.length || u32BE(buf, off) !== 1223163902) return false;
    off += 4;
    if (off + 2 > buf.length || u16BE(buf, off) !== 24832) return false;
    off += 2;
    if (off + 2 > buf.length) return false;
    const jmpA = u16BE(buf, off);
    off = off + jmpA;
    if (off + 4 > buf.length || u32BE(buf, off) !== 788553984) return false;
    off += 4;
    if (off + 2 > buf.length) return false;
    const jmpB = u16BE(buf, off);
    off = off + jmpB;
    if (off + 2 > buf.length || u16BE(buf, off) !== 16890) return false;
    off += 20;
  }
  if (off + 2 > buf.length) return false;
  if (u16BE(buf, off) === 16890) {
    off += 2;
  } else {
    off += 2;
    if (off + 2 > buf.length) return false;
    if (u16BE(buf, off) !== 16890) return false;
    off += 2;
  }
  if (off + 2 > buf.length) return false;
  const jmp = u16BE(buf, off);
  off += 2;
  const songOff = off - 2 + jmp;
  return checkTFMXSTSong(buf, songOff);
}
function parseJochenHippelSTFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippelSTFormat(buf)) throw new Error("Not a Jochen Hippel ST module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^hst\./i, "").replace(/\.sog$/i, "") || baseName;
  const instruments = [{
    id: 1,
    name: "Sample 1",
    type: "synth",
    synthType: "Synth",
    effects: [],
    volume: 0,
    pan: 0
  }];
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
      originalInstrumentCount: 0
    }
  };
  return {
    name: `${moduleName} [Jochen Hippel ST]`,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    hippelFileData: buffer.slice(0)
  };
}
export {
  isJochenHippelSTFormat,
  parseJochenHippelSTFile
};
