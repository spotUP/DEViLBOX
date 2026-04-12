const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1e3, 3e3, 5e3, 8e3];
const DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3e3, 9e3, 15e3, 24e3];
const WAVEFORMS = [
  { name: "Triangle", shortName: "TRI", icon: "△", bit: 16, description: "Pure, flute-like tone" },
  { name: "Sawtooth", shortName: "SAW", icon: "⊿", bit: 32, description: "Bright, buzzy tone rich in harmonics" },
  { name: "Pulse", shortName: "PUL", icon: "⊓", bit: 64, description: "Variable-width square wave" },
  { name: "Noise", shortName: "NOI", icon: "⊕", bit: 128, description: "White noise for percussion/effects" }
];
function encodeAD(attack, decay) {
  return (attack & 15) << 4 | decay & 15;
}
function encodeSR(sustain, release) {
  return (sustain & 15) << 4 | release & 15;
}
function attackLabel(value) {
  const ms = ATTACK_MS[value & 15];
  return ms >= 1e3 ? `${(ms / 1e3).toFixed(1)}s` : `${ms}ms`;
}
function decayLabel(value) {
  const ms = DECAY_MS[value & 15];
  return ms >= 1e3 ? `${(ms / 1e3).toFixed(1)}s` : `${ms}ms`;
}
function sustainLabel(value) {
  return `${Math.round(value / 15 * 100)}%`;
}
function decodeFilter(regs, offset = 21) {
  const cutoffLo = regs[offset] & 7;
  const cutoffHi = regs[offset + 1];
  const filterRes = regs[offset + 2];
  const modeVol = regs[offset + 3];
  return {
    cutoff: cutoffHi << 3 | cutoffLo,
    resonance: filterRes >> 4 & 15,
    filterVoice1: (filterRes & 1) !== 0,
    filterVoice2: (filterRes & 2) !== 0,
    filterVoice3: (filterRes & 4) !== 0,
    filterExt: (filterRes & 8) !== 0,
    lowPass: (modeVol & 16) !== 0,
    bandPass: (modeVol & 32) !== 0,
    highPass: (modeVol & 64) !== 0,
    mute3: (modeVol & 128) !== 0,
    volume: modeVol & 15
  };
}
function filterModeName(info) {
  const modes = [];
  if (info.lowPass) modes.push("LP");
  if (info.bandPass) modes.push("BP");
  if (info.highPass) modes.push("HP");
  return modes.length > 0 ? modes.join("+") : "Off";
}
export {
  ATTACK_MS as A,
  DECAY_MS as D,
  WAVEFORMS as W,
  encodeSR as a,
  attackLabel as b,
  decodeFilter as c,
  decayLabel as d,
  encodeAD as e,
  filterModeName as f,
  sustainLabel as s
};
