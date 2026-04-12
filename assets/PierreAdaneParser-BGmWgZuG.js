const MIN_FILE_SIZE = 10;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function safeU16(buf, off) {
  if (off < 0 || off + 1 >= buf.length) return 32769;
  return u16BE(buf, off);
}
function isPierreAdaneFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const D1 = safeU16(buf, 0);
  if (D1 === 0) return false;
  if (D1 & 32768) return false;
  if (D1 & 1) return false;
  const D2 = safeU16(buf, 2);
  if (D2 === 0) return false;
  if (D2 & 32768) return false;
  if (D2 & 1) return false;
  const D3 = safeU16(buf, 4);
  if (D3 === 0) return false;
  if (D3 & 32768) return false;
  if (D3 & 1) return false;
  const D4 = safeU16(buf, 6);
  if (D4 === 0) return false;
  if (D4 & 32768) return false;
  if (D4 & 1) return false;
  const gap43 = D4 - D3;
  if (gap43 < 0) return false;
  const gap32 = D3 - D2;
  if (gap32 < 0) return false;
  if (gap43 !== gap32) return false;
  const gap21 = D2 - D1;
  if (gap21 < 0) return false;
  if (gap43 !== gap21 - 2) return false;
  const D4_orig = safeU16(buf, 6);
  const D5_final = D4_orig + gap43;
  const D4_new = safeU16(buf, D1);
  if (D4_new >= buf.length) return false;
  if (buf[D4_new] !== 255) return false;
  if (D5_final > buf.length) return false;
  let scanPos = D1;
  const scanEnd = D5_final;
  while (scanPos < scanEnd) {
    const entry = safeU16(buf, scanPos);
    if (entry & 32768) return false;
    if (entry & 1) return false;
    if (entry > D1) return false;
    scanPos += 2;
  }
  return true;
}
function parsePierreAdaneFile(buffer, filename) {
  var _a;
  const buf = new Uint8Array(buffer);
  const _base = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (!_base.startsWith("pap.") && !_base.endsWith(".mok") && !isPierreAdaneFormat(buf)) throw new Error("Not a Pierre Adane Packer module");
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^pap\./i, "") || baseName;
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
    name: `${moduleName} [Pierre Adane]`,
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
    uadeEditableFileName: filename
  };
}
export {
  isPierreAdaneFormat,
  parsePierreAdaneFile
};
