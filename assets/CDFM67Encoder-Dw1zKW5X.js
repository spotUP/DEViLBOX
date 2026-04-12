import { c5 as registerVariableEncoder } from "./main-BbV5VyEH.js";
const NUM_PCM_CHANNELS = 4;
const NUM_FM_INSTRS = 32;
const FM_VOLUME_REVERSE = /* @__PURE__ */ new Map([
  [8, 0],
  [16, 1],
  [24, 2],
  [32, 3],
  [40, 4],
  [44, 5],
  [48, 6],
  [52, 7],
  [54, 8],
  [56, 9],
  [58, 10],
  [60, 11],
  [61, 12],
  [62, 13],
  [63, 14],
  [64, 15]
]);
function reverseVolume(vol, isFM) {
  if (isFM) {
    let bestNibble = 0;
    let bestDist = 999;
    for (const [fmVol, nibble] of FM_VOLUME_REVERSE) {
      const dist = Math.abs(fmVol - vol);
      if (dist < bestDist) {
        bestDist = dist;
        bestNibble = nibble;
      }
    }
    return bestNibble;
  }
  return Math.max(0, Math.min(15, Math.round((vol - 4) / 4)));
}
function encodeC67Pattern(allChannelRows, numRows) {
  const parts = [];
  let skipCount = 0;
  for (let row = 0; row < numRows; row++) {
    let hasData = false;
    for (let ch = 0; ch < allChannelRows.length; ch++) {
      const cell = allChannelRows[ch][row];
      if (!cell) continue;
      const hasNote = (cell.note ?? 0) !== 0;
      const hasVol = (cell.volume ?? 0) !== 0;
      const isFM = ch >= NUM_PCM_CHANNELS;
      if (hasNote) {
        if (skipCount > 0) {
          parts.push(64);
          parts.push(skipCount);
          skipCount = 0;
        }
        const xmNote = cell.note ?? 0;
        const instr = (cell.instrument ?? 1) - 1;
        const noteBase = isFM ? 12 : 36;
        const raw = xmNote - 1 - noteBase;
        const octave = Math.max(0, Math.min(7, Math.floor(raw / 12)));
        const semitone = Math.max(0, Math.min(11, raw - octave * 12));
        const instrBase = isFM ? NUM_FM_INSTRS : 0;
        const instrIdx = Math.max(0, instr - instrBase);
        const noteByte = semitone | octave << 4 | (instrIdx & 16) << 3;
        const volNibble = reverseVolume(cell.volume ?? 0, isFM);
        const instrVolByte = (instrIdx & 15) << 4 | volNibble & 15;
        parts.push(ch);
        parts.push(noteByte);
        parts.push(instrVolByte);
        hasData = true;
      } else if (hasVol) {
        if (skipCount > 0) {
          parts.push(64);
          parts.push(skipCount);
          skipCount = 0;
        }
        const volNibble = reverseVolume(cell.volume ?? 0, isFM);
        parts.push(32 + ch);
        parts.push(volNibble & 15);
        hasData = true;
      }
    }
    if (!hasData) {
      skipCount++;
    } else {
      skipCount = 0;
    }
  }
  parts.push(96);
  return new Uint8Array(parts);
}
const cdfm67Encoder = {
  formatId: "c67",
  encodePattern(rows, channel) {
    return encodeC67SingleChannel(rows, channel);
  }
};
function encodeC67SingleChannel(rows, channel) {
  const parts = [];
  const isFM = channel >= NUM_PCM_CHANNELS;
  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const hasNote = (cell.note ?? 0) !== 0;
    const hasVol = (cell.volume ?? 0) !== 0;
    if (hasNote) {
      const xmNote = cell.note ?? 0;
      const instr = (cell.instrument ?? 1) - 1;
      const noteBase = isFM ? 12 : 36;
      const raw = xmNote - 1 - noteBase;
      const octave = Math.max(0, Math.min(7, Math.floor(raw / 12)));
      const semitone = Math.max(0, Math.min(11, raw - octave * 12));
      const instrBase = isFM ? NUM_FM_INSTRS : 0;
      const instrIdx = Math.max(0, instr - instrBase);
      const noteByte = semitone | octave << 4 | (instrIdx & 16) << 3;
      const volNibble = reverseVolume(cell.volume ?? 0, isFM);
      const instrVolByte = (instrIdx & 15) << 4 | volNibble & 15;
      parts.push(channel);
      parts.push(noteByte);
      parts.push(instrVolByte);
    } else if (hasVol) {
      const volNibble = reverseVolume(cell.volume ?? 0, isFM);
      parts.push(32 + channel);
      parts.push(volNibble & 15);
    }
  }
  return new Uint8Array(parts);
}
registerVariableEncoder(cdfm67Encoder);
export {
  cdfm67Encoder as c,
  encodeC67Pattern as e
};
