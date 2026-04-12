function writeString(parts, str) {
  for (let i = 0; i < str.length; i++) {
    parts.push(str.charCodeAt(i) & 255);
  }
  parts.push(0);
}
async function exportSawteeth(song) {
  var _a, _b, _c;
  const warnings = [];
  const numChannels = Math.min(12, song.numChannels);
  if (numChannels < 1) {
    warnings.push("Song has no channels; exporting with 1 empty channel.");
  }
  const channelCount = Math.max(1, numChannels);
  const ST_VERSION = 1200;
  const SPS_PAL = 882;
  const exportParts = [];
  const partIndex = [];
  const songLen = Math.min(song.songPositions.length, 256);
  for (let posIdx = 0; posIdx < songLen; posIdx++) {
    const patIdx = song.songPositions[posIdx] ?? 0;
    const pat = song.patterns[patIdx];
    const chIndices = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const rows = ((_a = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _a.rows) ?? [];
      const partLen = Math.max(1, Math.min(255, rows.length));
      const steps = [];
      for (let r = 0; r < partLen; r++) {
        const cell = rows[r];
        if (!cell) {
          steps.push({ ins: 0, eff: 0, note: 0 });
          continue;
        }
        const ins = (cell.instrument ?? 0) & 255;
        const eff = 0;
        const note = cell.note ?? 0;
        steps.push({
          ins,
          eff,
          note: note >= 1 && note <= 96 ? note : 0
        });
      }
      const idx = exportParts.length;
      chIndices.push(idx);
      exportParts.push({
        sps: 6,
        // default steps-per-second
        steps,
        name: `P${posIdx}C${ch}`
      });
    }
    partIndex.push(chIndices);
  }
  if (exportParts.length === 0) {
    exportParts.push({ sps: 6, steps: [{ ins: 0, eff: 0, note: 0 }], name: "" });
    partIndex.push(Array.from({ length: channelCount }, () => 0));
  }
  if (exportParts.length > 255) {
    warnings.push(`Too many parts (${exportParts.length}); clamped to 255.`);
    exportParts.length = 255;
  }
  const partCount = exportParts.length;
  const channelSeqs = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const seq = [];
    for (let posIdx = 0; posIdx < songLen; posIdx++) {
      const pIdx = ((_b = partIndex[posIdx]) == null ? void 0 : _b[ch]) ?? 0;
      seq.push({
        part: Math.min(pIdx, partCount - 1),
        transp: 0,
        dAmp: 0
      });
    }
    if (seq.length === 0) {
      seq.push({ part: 0, transp: 0, dAmp: 0 });
    }
    channelSeqs.push(seq);
  }
  const insCount = Math.min(255, Math.max(1, song.instruments.length));
  const channelPans = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const pat0 = song.patterns[song.songPositions[0] ?? 0];
    const panVal = ((_c = pat0 == null ? void 0 : pat0.channels[ch]) == null ? void 0 : _c.pan) ?? 0;
    const norm = (panVal + 50) / 100;
    const left = Math.round((1 - norm) * 255);
    const right = Math.round(norm * 255);
    channelPans.push({ left, right });
  }
  const buf = [];
  buf.push(83, 87, 84, 68);
  buf.push(ST_VERSION >> 8 & 255, ST_VERSION & 255);
  buf.push(SPS_PAL >> 8 & 255, SPS_PAL & 255);
  buf.push(channelCount);
  for (let ch = 0; ch < channelCount; ch++) {
    const seq = channelSeqs[ch];
    const pan = channelPans[ch];
    const len = seq.length;
    buf.push(pan.left & 255);
    buf.push(pan.right & 255);
    buf.push(len >> 8 & 255, len & 255);
    buf.push(0, 0);
    const rLoop = len - 1;
    buf.push(rLoop >> 8 & 255, rLoop & 255);
    for (const step of seq) {
      buf.push(step.part & 255);
      buf.push(step.transp & 255);
      buf.push(step.dAmp & 255);
    }
  }
  buf.push(partCount & 255);
  for (const part of exportParts) {
    const stepCount = Math.min(255, part.steps.length);
    buf.push(part.sps & 255);
    buf.push(stepCount & 255);
    for (let i = 0; i < stepCount; i++) {
      const s = part.steps[i];
      buf.push(s.ins & 255);
      buf.push(s.eff & 255);
      buf.push(s.note & 255);
    }
  }
  const totalInstruments = Math.max(2, insCount + 1);
  buf.push(totalInstruments - 1 & 255);
  for (let i = 1; i < totalInstruments; i++) {
    buf.push(1);
    buf.push(0);
    buf.push(127);
    buf.push(1);
    buf.push(0);
    buf.push(255);
    buf.push(0);
    buf.push(1);
    buf.push(1);
    buf.push(1);
    buf.push(1);
    buf.push(1);
    buf.push(0);
    buf.push(30);
    buf.push(1);
    buf.push(0);
    buf.push(0);
    buf.push(36);
  }
  buf.push(0);
  writeString(buf, song.name || "Untitled");
  writeString(buf, "");
  for (let i = 0; i < partCount; i++) {
    writeString(buf, exportParts[i].name || "");
  }
  for (let i = 1; i < totalInstruments; i++) {
    const inst = song.instruments[i - 1];
    writeString(buf, (inst == null ? void 0 : inst.name) || `Ins ${i}`);
  }
  const output = new Uint8Array(buf);
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
  const filename = `${baseName}.st`;
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename,
    warnings
  };
}
export {
  exportSawteeth
};
