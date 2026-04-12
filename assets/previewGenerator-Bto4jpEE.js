import { getContext, Context, setContext, getTransport } from "./vendor-tone-48TQc1H3.js";
import { c0 as getNKSTypeForSynth, c1 as InstrumentFactory } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const SAMPLE_RATE = 44100;
const MAX_DURATION = 6;
const DEFAULT_TEMPO = 120;
function melodicPattern() {
  return [{ note: "C3", time: 0, duration: 2, velocity: 0.78 }];
}
function bassPattern() {
  return [{ note: "C1", time: 0, duration: 2, velocity: 0.78 }];
}
function chordPattern() {
  return [
    { note: "C3", time: 0, duration: 2.5, velocity: 0.75 },
    { note: "E3", time: 0, duration: 2.5, velocity: 0.7 },
    { note: "G3", time: 0, duration: 2.5, velocity: 0.7 }
  ];
}
function drumPattern() {
  const beatDur = 60 / DEFAULT_TEMPO;
  const notes = [];
  for (let bar = 0; bar < 2; bar++) {
    const barStart = bar * 4 * beatDur;
    notes.push({ note: "C1", time: barStart, duration: 0.2, velocity: 0.9 });
    notes.push({ note: "C1", time: barStart + 2 * beatDur, duration: 0.2, velocity: 0.85 });
    notes.push({ note: "D1", time: barStart + beatDur, duration: 0.15, velocity: 0.8 });
    notes.push({ note: "D1", time: barStart + 3 * beatDur, duration: 0.15, velocity: 0.8 });
    for (let i = 0; i < 8; i++) {
      notes.push({
        note: "F#1",
        time: barStart + i * beatDur * 0.5,
        duration: 0.1,
        velocity: i % 2 === 0 ? 0.7 : 0.5
      });
    }
  }
  return notes;
}
function padPattern() {
  return [{ note: "C3", time: 0, duration: 5, velocity: 0.7 }];
}
function fxPattern() {
  return [{ note: "C3", time: 0, duration: 0.5, velocity: 0.85 }];
}
const PATTERN_MAP = {
  melodic: melodicPattern,
  bass: bassPattern,
  chord: chordPattern,
  drum: drumPattern,
  pad: padPattern,
  fx: fxPattern
};
function getPreviewPattern(synthType, category) {
  const nksInfo = getNKSTypeForSynth(synthType, category);
  const type = nksInfo.type;
  switch (type) {
    case "Bass":
      return "bass";
    case "Drums":
    case "Percussion":
      return "drum";
    case "Piano / Keys":
    case "Organ":
      return "chord";
    case "Synth Pad":
    case "Soundscapes":
      return "pad";
    case "Sound Effects":
      return "fx";
    case "Synth Lead":
    case "Synth Misc":
    case "Guitar":
    case "Bowed Strings":
    case "Brass":
    case "Flute":
    case "Reed Instruments":
    case "Plucked Strings":
    case "Mallet Instruments":
    case "Vocal":
    default:
      return "melodic";
  }
}
function measureLUFS(buffer) {
  const channels = buffer.numberOfChannels;
  let sumSquared = 0;
  let totalSamples = 0;
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    let prev = 0;
    for (let i = 0; i < data.length; i++) {
      const weighted = data[i] + 0.3 * (data[i] - prev);
      prev = data[i];
      sumSquared += weighted * weighted;
    }
    totalSamples += data.length;
  }
  const meanSquared = sumSquared / totalSamples;
  if (meanSquared < 1e-10) return -Infinity;
  return -0.691 + 10 * Math.log10(meanSquared);
}
function measurePeakDb(buffer) {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak < 1e-10) return -Infinity;
  return 20 * Math.log10(peak);
}
function normalizeLoudness(buffer, targetLUFS = -19, peakLimitDb = -3) {
  const currentLUFS = measureLUFS(buffer);
  if (!isFinite(currentLUFS)) {
    return { gainDb: 0, finalLUFS: -Infinity, finalPeakDb: -Infinity };
  }
  let gainDb = targetLUFS - currentLUFS;
  let gainLinear = Math.pow(10, gainDb / 20);
  const currentPeakDb = measurePeakDb(buffer);
  const newPeakDb = currentPeakDb + gainDb;
  if (newPeakDb > peakLimitDb) {
    gainDb = peakLimitDb - currentPeakDb;
    gainLinear = Math.pow(10, gainDb / 20);
  }
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
      const limit = Math.pow(10, peakLimitDb / 20);
      if (data[i] > limit) data[i] = limit;
      if (data[i] < -limit) data[i] = -limit;
    }
  }
  return {
    gainDb,
    finalLUFS: measureLUFS(buffer),
    finalPeakDb: measurePeakDb(buffer)
  };
}
function detectBestPreviewFormat() {
  if (typeof MediaRecorder === "undefined") return "wav";
  if (MediaRecorder.isTypeSupported("audio/ogg; codecs=vorbis")) return "ogg";
  if (MediaRecorder.isTypeSupported("audio/webm; codecs=opus")) return "webm";
  return "wav";
}
async function encodeViaMediaRecorder(buffer, mimeType) {
  const ctx = new AudioContext({ sampleRate: buffer.sampleRate });
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);
  const recorder = new MediaRecorder(dest.stream, {
    mimeType,
    audioBitsPerSecond: 128e3
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      ctx.close();
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = (e) => {
      ctx.close();
      reject(e);
    };
    recorder.start();
    source.start(0);
    source.onended = () => {
      setTimeout(() => recorder.stop(), 100);
    };
  });
}
function encodeToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const fileSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}
function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
async function encodePreview(buffer, format) {
  const target = format ?? detectBestPreviewFormat();
  if (target === "ogg") {
    try {
      const blob = await encodeViaMediaRecorder(buffer, "audio/ogg; codecs=vorbis");
      return { blob, format: "ogg" };
    } catch {
    }
  }
  if (target === "webm" || target === "ogg") {
    try {
      const blob = await encodeViaMediaRecorder(buffer, "audio/webm; codecs=opus");
      return { blob, format: "webm" };
    } catch {
    }
  }
  return { blob: encodeToWav(buffer), format: "wav" };
}
async function generatePreview(config, options = {}) {
  const {
    duration: rawDuration = MAX_DURATION,
    tempo = DEFAULT_TEMPO,
    pattern: patternOverride,
    format,
    onProgress
  } = options;
  const duration = Math.min(rawDuration, MAX_DURATION);
  const patternType = patternOverride ?? getPreviewPattern(config.synthType);
  const notes = PATTERN_MAP[patternType]();
  onProgress == null ? void 0 : onProgress(0.05);
  const numChannels = 2;
  const totalSamples = Math.ceil(SAMPLE_RATE * duration);
  const offlineContext = new OfflineAudioContext(numChannels, totalSamples, SAMPLE_RATE);
  const originalContext = getContext();
  const offlineToneContext = new Context(offlineContext);
  setContext(offlineToneContext);
  try {
    getTransport().bpm.value = tempo;
    const instrument = InstrumentFactory.createInstrument(config);
    if (instrument.connect) {
      instrument.connect(getContext().destination);
    }
    onProgress == null ? void 0 : onProgress(0.15);
    for (const n of notes) {
      if (instrument.triggerAttackRelease) {
        offlineContext.suspend(n.time).then(() => {
          instrument.triggerAttackRelease(n.note, n.duration, void 0, n.velocity);
          offlineContext.resume();
        });
      } else if (instrument.triggerAttack) {
        offlineContext.suspend(n.time).then(() => {
          instrument.triggerAttack(n.note, void 0, n.velocity);
          offlineContext.resume();
        });
        if (instrument.triggerRelease) {
          const releaseTime = n.time + n.duration;
          if (releaseTime < duration) {
            offlineContext.suspend(releaseTime).then(() => {
              instrument.triggerRelease(n.note);
              offlineContext.resume();
            });
          }
        }
      }
    }
    onProgress == null ? void 0 : onProgress(0.25);
    const rendered = await offlineContext.startRendering();
    onProgress == null ? void 0 : onProgress(0.6);
    if (instrument.dispose) instrument.dispose();
    const normResult = normalizeLoudness(rendered, -19, -3);
    onProgress == null ? void 0 : onProgress(0.75);
    const { blob, format: actualFormat } = await encodePreview(rendered, format);
    onProgress == null ? void 0 : onProgress(1);
    return {
      blob,
      format: actualFormat,
      duration,
      lufs: normResult.finalLUFS,
      peakDb: normResult.finalPeakDb
    };
  } finally {
    setContext(originalContext);
  }
}
function previewExtension(format) {
  return format === "ogg" ? ".ogg" : format === "webm" ? ".webm" : ".wav";
}
function downloadPreview(result, presetName) {
  const ext = previewExtension(result.format);
  const filename = `${presetName}.nksf${ext}`;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export {
  detectBestPreviewFormat,
  downloadPreview,
  generatePreview,
  getPreviewPattern
};
