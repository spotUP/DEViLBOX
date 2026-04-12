import { dA as TD3_SYSEX } from "./main-BbV5VyEH.js";
function encodeNote(step) {
  if (!step.note) {
    return 0;
  }
  const { value, octave, upperC } = step.note;
  let encoded = 12 + value + octave * 12;
  if (upperC) {
    encoded |= 128;
  }
  return encoded;
}
function encodeNoteData(steps) {
  const data = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    const step = steps[i] || { note: null };
    const encoded = encodeNote(step);
    data[i * 2] = encoded >> 4 & 15;
    data[i * 2 + 1] = encoded & 15;
  }
  return data;
}
function encodeAccentData(steps) {
  const data = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    const step = steps[i] || { accent: false };
    data[i * 2] = 0;
    data[i * 2 + 1] = step.accent ? 1 : 0;
  }
  return data;
}
function encodeSlideData(steps) {
  const data = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    const step = steps[i] || { slide: false };
    data[i * 2] = 0;
    data[i * 2 + 1] = step.slide ? 1 : 0;
  }
  return data;
}
function encodeTieBits(steps) {
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    const step = steps[i];
    if (step == null ? void 0 : step.tie) {
      bits |= 1 << i;
    }
  }
  return new Uint8Array([
    bits >> 4 & 15,
    // Bits 4-7
    bits & 15,
    // Bits 0-3
    bits >> 12 & 15,
    // Bits 12-15
    bits >> 8 & 15
    // Bits 8-11
  ]);
}
function encodeRestBits(steps) {
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    const step = steps[i];
    if (!(step == null ? void 0 : step.note)) {
      bits |= 1 << i;
    }
  }
  return new Uint8Array([
    bits >> 4 & 15,
    bits & 15,
    bits >> 12 & 15,
    bits >> 8 & 15
  ]);
}
function encodeActiveSteps(count) {
  const clamped = Math.max(1, Math.min(16, count));
  return new Uint8Array([
    clamped >> 4 & 15,
    clamped & 15
  ]);
}
function encodePattern(data) {
  const group = Math.max(0, Math.min(3, data.group));
  const pattern = Math.max(0, Math.min(15, data.pattern));
  const steps = data.steps.slice(0, 16);
  while (steps.length < 16) {
    steps.push({ note: null, accent: false, slide: false, tie: false });
  }
  const noteData = encodeNoteData(steps);
  const accentData = encodeAccentData(steps);
  const slideData = encodeSlideData(steps);
  const tripletFlag = new Uint8Array([0, data.triplet ? 1 : 0]);
  const activeSteps = encodeActiveSteps(data.activeSteps);
  const reserved = new Uint8Array([0, 0]);
  const tieBits = encodeTieBits(steps);
  const restBits = encodeRestBits(steps);
  const headerSize = TD3_SYSEX.HEADER.length;
  const payloadSize = 1 + 2 + 2 + 32 + 32 + 32 + 2 + 2 + 2 + 4 + 4;
  const messageSize = headerSize + payloadSize + 1;
  const message = new Uint8Array(messageSize);
  let offset = 0;
  message.set(TD3_SYSEX.HEADER, offset);
  offset += TD3_SYSEX.HEADER.length;
  message[offset++] = TD3_SYSEX.CMD_SEND_PATTERN;
  message[offset++] = group;
  message[offset++] = pattern;
  message[offset++] = 0;
  message[offset++] = 1;
  message.set(noteData, offset);
  offset += noteData.length;
  message.set(accentData, offset);
  offset += accentData.length;
  message.set(slideData, offset);
  offset += slideData.length;
  message.set(tripletFlag, offset);
  offset += tripletFlag.length;
  message.set(activeSteps, offset);
  offset += activeSteps.length;
  message.set(reserved, offset);
  offset += reserved.length;
  message.set(tieBits, offset);
  offset += tieBits.length;
  message.set(restBits, offset);
  offset += restBits.length;
  message[offset] = TD3_SYSEX.FOOTER;
  return message;
}
function encodePatternRequest(group, pattern) {
  const g = Math.max(0, Math.min(3, group));
  const p = Math.max(0, Math.min(15, pattern));
  const message = new Uint8Array(TD3_SYSEX.HEADER.length + 4);
  message.set(TD3_SYSEX.HEADER, 0);
  message[TD3_SYSEX.HEADER.length] = TD3_SYSEX.CMD_REQUEST_PATTERN;
  message[TD3_SYSEX.HEADER.length + 1] = g;
  message[TD3_SYSEX.HEADER.length + 2] = p;
  message[TD3_SYSEX.HEADER.length + 3] = TD3_SYSEX.FOOTER;
  return message;
}
function formatPatternLocation(group, pattern) {
  const groupLetter = ["A", "B", "C", "D"][group] || "?";
  const patternNum = pattern % 8 + 1;
  const bank = pattern < 8 ? "A" : "B";
  return `${groupLetter}${bank}${patternNum}`;
}
function decodeNote(highNibble, lowNibble) {
  const encoded = highNibble << 4 | lowNibble;
  if (encoded === 0) {
    return null;
  }
  const upperC = (encoded & 128) !== 0;
  const value = encoded & 127;
  const adjusted = value - 12;
  if (adjusted < 0) {
    return null;
  }
  const octave = Math.floor(adjusted / 12);
  const noteValue = adjusted % 12;
  return {
    value: noteValue,
    octave: Math.min(octave, 2),
    // Clamp to valid range
    upperC: upperC && noteValue === 0
  };
}
function decodeNoteData(data, offset) {
  const notes = [];
  for (let i = 0; i < 16; i++) {
    const highNibble = data[offset + i * 2];
    const lowNibble = data[offset + i * 2 + 1];
    notes.push(decodeNote(highNibble, lowNibble));
  }
  return notes;
}
function decodeBooleanFlags(data, offset) {
  const flags = [];
  for (let i = 0; i < 16; i++) {
    flags.push(data[offset + i * 2 + 1] !== 0);
  }
  return flags;
}
function decodeBitmask(data, offset) {
  const bits = data[offset + 1] | // Bits 0-3
  data[offset] << 4 | // Bits 4-7
  data[offset + 3] << 8 | // Bits 8-11
  data[offset + 2] << 12;
  const flags = [];
  for (let i = 0; i < 16; i++) {
    flags.push((bits & 1 << i) !== 0);
  }
  return flags;
}
function decodeActiveSteps(data, offset) {
  return data[offset] << 4 | data[offset + 1];
}
function validateTD3PatternSysEx(data) {
  if (data.length < TD3_SYSEX.HEADER.length + 5) {
    return { valid: false, error: "Message too short" };
  }
  for (let i = 0; i < TD3_SYSEX.HEADER.length; i++) {
    if (data[i] !== TD3_SYSEX.HEADER[i]) {
      return { valid: false, error: "Invalid TD-3 header" };
    }
  }
  const command = data[TD3_SYSEX.HEADER.length];
  if (command !== TD3_SYSEX.CMD_SEND_PATTERN) {
    return { valid: false, error: `Invalid command: expected ${TD3_SYSEX.CMD_SEND_PATTERN}, got ${command}` };
  }
  if (data[data.length - 1] !== TD3_SYSEX.FOOTER) {
    return { valid: false, error: "Invalid SysEx footer" };
  }
  return { valid: true };
}
function decodePattern(data) {
  const validation = validateTD3PatternSysEx(data);
  if (!validation.valid) {
    console.warn("[TD3SysExDecoder]", validation.error);
    return null;
  }
  const baseOffset = TD3_SYSEX.HEADER.length + 1;
  const group = data[baseOffset];
  const pattern = data[baseOffset + 1];
  const notes = decodeNoteData(data, baseOffset + 4);
  const accents = decodeBooleanFlags(data, baseOffset + 36);
  const slides = decodeBooleanFlags(data, baseOffset + 68);
  const triplet = data[baseOffset + 101] !== 0;
  const activeSteps = decodeActiveSteps(data, baseOffset + 102);
  const ties = decodeBitmask(data, baseOffset + 106);
  const steps = [];
  for (let i = 0; i < 16; i++) {
    steps.push({
      note: notes[i],
      accent: accents[i],
      slide: slides[i],
      tie: ties[i]
    });
  }
  return {
    group,
    pattern,
    steps,
    triplet,
    activeSteps: Math.min(16, Math.max(1, activeSteps))
  };
}
function isTD3PatternResponse(data) {
  if (data.length < TD3_SYSEX.HEADER.length + 2) {
    return false;
  }
  for (let i = 0; i < TD3_SYSEX.HEADER.length; i++) {
    if (data[i] !== TD3_SYSEX.HEADER[i]) {
      return false;
    }
  }
  return data[TD3_SYSEX.HEADER.length] === TD3_SYSEX.CMD_SEND_PATTERN;
}
function encodeNibbledBits(bits) {
  let word0 = 0;
  let word1 = 0;
  for (let i = 0; i < 8; i++) {
    if (bits[i]) word0 |= 1 << i;
  }
  for (let i = 8; i < 16; i++) {
    if (bits[i]) word1 |= 1 << i - 8;
  }
  return new Uint8Array([
    word0 >> 4 & 15,
    word0 & 15,
    word1 >> 4 & 15,
    word1 & 15
  ]);
}
function exportTD3PatternToSeq(data) {
  const buffer = new Uint8Array(146);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 597185654, false);
  const header = new Uint8Array([
    0,
    0,
    0,
    8,
    0,
    84,
    0,
    68,
    0,
    45,
    0,
    51,
    // "T.D.-.3"
    0,
    0,
    0,
    10,
    0,
    49,
    0,
    46,
    0,
    51,
    0,
    46,
    0,
    55,
    0,
    0
    // Version 1.3.7
  ]);
  buffer.set(header, 4);
  buffer[32] = 0;
  buffer[33] = 112;
  buffer[34] = 0;
  buffer[35] = 0;
  const dataOffset = 36;
  const tieBits = Array(16).fill(false);
  const restBits = Array(16).fill(false);
  const pitchSequence = [];
  const accentSequence = [];
  const slideSequence = [];
  for (let i = 0; i < 16; i++) {
    const step = data.steps[i] || { note: null, accent: false, slide: false, tie: false };
    if (i > 0 && step.tie) {
      tieBits[i] = false;
      restBits[i] = step.note === null;
    } else {
      tieBits[i] = true;
      restBits[i] = step.note === null;
      let noteVal = 0;
      if (step.note) {
        noteVal = 24 + step.note.value + step.note.octave * 12;
        if (step.note.upperC) noteVal = 60;
      }
      pitchSequence.push(noteVal);
      accentSequence.push(step.accent);
      slideSequence.push(step.slide);
    }
  }
  for (let i = 0; i < 16; i++) {
    const val = pitchSequence[i] || 0;
    buffer[dataOffset + i * 2] = val >> 4 & 15;
    buffer[dataOffset + i * 2 + 1] = val & 15;
  }
  for (let i = 0; i < 16; i++) {
    const val = accentSequence[i] ? 1 : 0;
    buffer[dataOffset + 32 + i * 2] = 0;
    buffer[dataOffset + 32 + i * 2 + 1] = val;
  }
  for (let i = 0; i < 16; i++) {
    const val = slideSequence[i] ? 1 : 0;
    buffer[dataOffset + 64 + i * 2] = 0;
    buffer[dataOffset + 64 + i * 2 + 1] = val;
  }
  buffer[dataOffset + 96] = 0;
  buffer[dataOffset + 97] = data.triplet ? 1 : 0;
  buffer[dataOffset + 98] = 0;
  buffer[dataOffset + 99] = data.activeSteps & 15;
  buffer.set(encodeNibbledBits(tieBits), dataOffset + 102);
  buffer.set(encodeNibbledBits(restBits), dataOffset + 106);
  return buffer;
}
export {
  encodePattern as a,
  encodePatternRequest as b,
  decodePattern as d,
  exportTD3PatternToSeq as e,
  formatPatternLocation as f,
  isTD3PatternResponse as i
};
