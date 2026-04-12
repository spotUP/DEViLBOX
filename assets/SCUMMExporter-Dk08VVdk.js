import { e as encodeSCUMMCell } from "./SCUMMEncoder-DscPMg-Y.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
async function exportSCUMM(song) {
  var _a;
  const warnings = [];
  if (song.uadeEditableFileData && song.uadeEditableFileData.byteLength > 0) {
    const baseName2 = sanitizeName(song.name);
    return {
      data: new Blob([song.uadeEditableFileData], { type: "application/octet-stream" }),
      filename: deriveFilename(baseName2, song.uadeEditableFileName),
      warnings
    };
  }
  warnings.push(
    "No original SCUMM binary available. Exporting pattern data only — the resulting file will not contain a valid 68k player."
  );
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const BYTES_PER_CELL = 4;
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `SCUMM supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }
  const numPatterns = Math.max(1, song.patterns.length);
  const HEADER_SIZE = 6;
  const patternBlockSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const totalSize = HEADER_SIZE + patternBlockSize;
  const output = new Uint8Array(totalSize);
  output[4] = 96;
  output[5] = 0;
  let offset = HEADER_SIZE;
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    if (pat && pat.length > ROWS_PER_PATTERN) {
      warnings.push(
        `Pattern ${p} has ${pat.length} rows but SCUMM supports max ${ROWS_PER_PATTERN}. Extra rows truncated.`
      );
    }
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = ((_a = pat == null ? void 0 : pat.channels[ch]) == null ? void 0 : _a.rows[row]) ?? {
          note: 0,
          instrument: 0,
          effTyp: 0,
          eff: 0
        };
        const encoded = encodeSCUMMCell(cell);
        output.set(encoded, offset);
        offset += BYTES_PER_CELL;
      }
    }
  }
  const baseName = sanitizeName(song.name);
  return {
    data: new Blob([output], { type: "application/octet-stream" }),
    filename: `${baseName}.scumm`,
    warnings
  };
}
function sanitizeName(name) {
  return (name || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "untitled";
}
function deriveFilename(baseName, originalFilename) {
  if (originalFilename) {
    return originalFilename;
  }
  return `${baseName}.scumm`;
}
export {
  exportSCUMM
};
