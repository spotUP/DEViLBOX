const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { aA as UADEEngine, am as __vitePreload } from "./main-BbV5VyEH.js";
import { Offline, PolySynth, Synth, Player, Sampler, NoiseSynth, MembraneSynth, MetalSynth, PluckSynth, DuoSynth, AMSynth, FMSynth, MonoSynth, getContext } from "./vendor-tone-48TQc1H3.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function xmNoteToToneNote(note) {
  if (note <= 0 || note > 96) return "";
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const semitone = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${noteNames[semitone]}${octave}`;
}
async function renderPatternToAudio(pattern, instruments, bpm, options = {}) {
  const { sampleRate = 44100, onProgress } = options;
  const beatsPerRow = 0.25;
  const secondsPerRow = 60 / bpm * beatsPerRow;
  const patternDuration = pattern.length * secondsPerRow;
  const tailDuration = 2;
  const totalDuration = patternDuration + tailDuration;
  onProgress == null ? void 0 : onProgress(0);
  const buffer = await Offline(({ transport }) => {
    transport.bpm.value = bpm;
    const synths = /* @__PURE__ */ new Map();
    const usedInstrumentIds = /* @__PURE__ */ new Set();
    pattern.channels.forEach((channel) => {
      if (channel.instrumentId !== null) {
        usedInstrumentIds.add(channel.instrumentId);
      }
      channel.rows.forEach((cell) => {
        if (cell.instrument !== null) {
          usedInstrumentIds.add(cell.instrument);
        }
      });
    });
    instruments.forEach((inst) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
      if (!usedInstrumentIds.has(inst.id)) return;
      let synth;
      switch (inst.synthType) {
        case "MonoSynth":
          synth = new MonoSynth({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscillator: { type: ((_a = inst.oscillator) == null ? void 0 : _a.type) || "sawtooth" },
            envelope: {
              attack: ((_b = inst.envelope) == null ? void 0 : _b.attack) ?? 0.01,
              decay: ((_c = inst.envelope) == null ? void 0 : _c.decay) ?? 0.2,
              sustain: ((_d = inst.envelope) == null ? void 0 : _d.sustain) ?? 0.5,
              release: ((_e = inst.envelope) == null ? void 0 : _e.release) ?? 0.5
            },
            filter: {
              type: ((_f = inst.filter) == null ? void 0 : _f.type) || "lowpass",
              frequency: ((_g = inst.filter) == null ? void 0 : _g.frequency) ?? 2e3,
              Q: ((_h = inst.filter) == null ? void 0 : _h.Q) ?? 1
            }
          }).toDestination();
          break;
        case "FMSynth":
          synth = new PolySynth(FMSynth).toDestination();
          break;
        case "ToneAM":
          synth = new PolySynth(AMSynth).toDestination();
          break;
        case "DuoSynth":
          synth = new DuoSynth().toDestination();
          break;
        case "PluckSynth":
          synth = new PluckSynth().toDestination();
          break;
        case "MetalSynth":
          synth = new MetalSynth().toDestination();
          break;
        case "MembraneSynth":
          synth = new MembraneSynth().toDestination();
          break;
        case "NoiseSynth":
          synth = new NoiseSynth().toDestination();
          break;
        case "Sampler":
          if ((_i = inst.parameters) == null ? void 0 : _i.sampleUrl) {
            synth = new Sampler({
              urls: { C4: inst.parameters.sampleUrl },
              volume: inst.volume || -12
            }).toDestination();
          } else {
            return;
          }
          break;
        case "Player":
          if ((_j = inst.parameters) == null ? void 0 : _j.sampleUrl) {
            synth = new Player({
              url: inst.parameters.sampleUrl,
              volume: inst.volume || -12
            }).toDestination();
          } else {
            return;
          }
          break;
        default:
          synth = new PolySynth(Synth, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscillator: { type: ((_k = inst.oscillator) == null ? void 0 : _k.type) || "sawtooth" },
            envelope: {
              attack: ((_l = inst.envelope) == null ? void 0 : _l.attack) ?? 0.01,
              decay: ((_m = inst.envelope) == null ? void 0 : _m.decay) ?? 0.2,
              sustain: ((_n = inst.envelope) == null ? void 0 : _n.sustain) ?? 0.5,
              release: ((_o = inst.envelope) == null ? void 0 : _o.release) ?? 0.5
            }
          }).toDestination();
      }
      synths.set(inst.id, synth);
    });
    pattern.channels.forEach((channel) => {
      const defaultInstrumentId = channel.instrumentId ?? 0;
      channel.rows.forEach((cell, rowIndex) => {
        if (cell.note === 0) return;
        if (cell.note === 97) return;
        const time = rowIndex * secondsPerRow;
        const instrumentId = cell.instrument ?? defaultInstrumentId;
        const synth = synths.get(instrumentId);
        if (!synth) return;
        let duration = secondsPerRow;
        for (let nextRow = rowIndex + 1; nextRow < pattern.length; nextRow++) {
          const nextCell = channel.rows[nextRow];
          if (nextCell.note !== 0) {
            duration = (nextRow - rowIndex) * secondsPerRow;
            break;
          }
        }
        const toneNote = xmNoteToToneNote(cell.note);
        if (!toneNote) return;
        const velocity = cell.volume !== 0 ? cell.volume / 64 : 0.8;
        transport.schedule((t) => {
          try {
            if ("triggerAttackRelease" in synth) {
              synth.triggerAttackRelease(toneNote, duration, t, velocity);
            }
          } catch (e) {
            console.warn(`Failed to trigger note ${toneNote}:`, e);
          }
        }, time);
      });
    });
    transport.start(0);
    onProgress == null ? void 0 : onProgress(50);
  }, totalDuration, 2, sampleRate);
  onProgress == null ? void 0 : onProgress(100);
  return buffer.get();
}
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const fileSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
function concatenateAudioBuffers(buffers, sampleRate) {
  if (buffers.length === 0) {
    throw new Error("No buffers to concatenate");
  }
  if (buffers.length === 1) {
    return buffers[0];
  }
  const numChannels = buffers[0].numberOfChannels;
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const offlineCtx = new OfflineAudioContext(numChannels, totalLength, sampleRate);
  const combinedBuffer = offlineCtx.createBuffer(numChannels, totalLength, sampleRate);
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = combinedBuffer.getChannelData(channel);
      const sourceData = buffer.getChannelData(channel);
      channelData.set(sourceData, offset);
    }
    offset += buffer.length;
  }
  return combinedBuffer;
}
function captureAudioLive(durationSec, onProgress) {
  return new Promise((resolve, reject) => {
    __vitePreload(async () => {
      const { getToneEngine } = await import("./main-BbV5VyEH.js").then((n) => n.j2);
      return { getToneEngine };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ getToneEngine }) => {
      __vitePreload(async () => {
        const { getNativeAudioNode } = await import("./main-BbV5VyEH.js").then((n) => n.iK);
        return { getNativeAudioNode };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ getNativeAudioNode }) => {
        const toneCtx = getContext();
        const ctx = toneCtx.rawContext ?? toneCtx._context ?? toneCtx;
        const sampleRate = ctx.sampleRate;
        const totalSamples = Math.ceil(durationSec * sampleRate);
        const BUFFER_SIZE = 4096;
        const bufL = new Float32Array(totalSamples);
        const bufR = new Float32Array(totalSamples);
        let captured = 0;
        let done = false;
        const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
        function finish() {
          if (done) return;
          done = true;
          try {
            processor.disconnect();
          } catch {
          }
          try {
            const toneEngine = getToneEngine();
            const mn = getNativeAudioNode(toneEngine.masterEffectsInput);
            mn == null ? void 0 : mn.disconnect(processor);
          } catch {
          }
          const audioBuffer = ctx.createBuffer(2, captured, sampleRate);
          audioBuffer.getChannelData(0).set(bufL.subarray(0, captured));
          audioBuffer.getChannelData(1).set(bufR.subarray(0, captured));
          resolve(audioBufferToWav(audioBuffer));
        }
        processor.onaudioprocess = (event) => {
          if (done) return;
          const inputL = event.inputBuffer.getChannelData(0);
          const inputR = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputL;
          const count = Math.min(inputL.length, totalSamples - captured);
          bufL.set(inputL.subarray(0, count), captured);
          bufR.set(inputR.subarray(0, count), captured);
          captured += count;
          onProgress == null ? void 0 : onProgress(Math.min(99, captured / totalSamples * 100));
          if (captured >= totalSamples) finish();
        };
        try {
          const toneEngine = getToneEngine();
          const masterNode = getNativeAudioNode(toneEngine.masterEffectsInput);
          if (!masterNode) throw new Error("Could not find masterEffectsInput native node");
          const silentGain = ctx.createGain();
          silentGain.gain.value = 0;
          silentGain.connect(ctx.destination);
          masterNode.connect(processor);
          processor.connect(silentGain);
          setTimeout(finish, durationSec * 1e3 + 500);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  });
}
function getUADEInstrument(instruments) {
  return instruments.find((i) => {
    var _a;
    return i.synthType === "UADESynth" && ((_a = i.uade) == null ? void 0 : _a.fileData);
  }) ?? null;
}
async function renderUADEToWav(fileData, filename, subsong = 0, onProgress) {
  onProgress == null ? void 0 : onProgress(5);
  const engine = UADEEngine.getInstance();
  await engine.ready();
  onProgress == null ? void 0 : onProgress(10);
  await engine.load(fileData.slice(0), filename);
  onProgress == null ? void 0 : onProgress(20);
  const wavBuffer = await engine.renderFull(subsong);
  onProgress == null ? void 0 : onProgress(90);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  onProgress == null ? void 0 : onProgress(100);
  return blob;
}
async function exportUADEAsWav(fileData, filename, outputFilename, subsong = 0, onProgress) {
  const wavBlob = await renderUADEToWav(fileData, filename, subsong, onProgress);
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outputFilename.endsWith(".wav") ? outputFilename : `${outputFilename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
async function exportPatternAsWav(pattern, instruments, bpm, filename, onProgress) {
  const buffer = await renderPatternToAudio(pattern, instruments, bpm, { onProgress });
  const wavBlob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".wav") ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
async function exportSongAsWav(patterns, sequence, instruments, bpm, filename, onProgress) {
  if (sequence.length === 0) {
    throw new Error("No patterns in sequence to export");
  }
  const sampleRate = 44100;
  const buffers = [];
  const totalSteps = sequence.length;
  for (let i = 0; i < sequence.length; i++) {
    const patternIndex = sequence[i];
    const pattern = patterns[patternIndex];
    if (!pattern) {
      console.warn(`Pattern ${patternIndex} not found in sequence, skipping`);
      continue;
    }
    const patternProgress = (progress) => {
      const baseProgress = i / totalSteps * 100;
      const stepProgress = progress / 100 * (100 / totalSteps);
      onProgress == null ? void 0 : onProgress(Math.round(baseProgress + stepProgress));
    };
    const buffer = await renderPatternToAudio(pattern, instruments, bpm, {
      sampleRate,
      onProgress: patternProgress
    });
    buffers.push(buffer);
  }
  if (buffers.length === 0) {
    throw new Error("No valid patterns to export");
  }
  const combinedBuffer = concatenateAudioBuffers(buffers, sampleRate);
  const wavBlob = audioBufferToWav(combinedBuffer);
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".wav") ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onProgress == null ? void 0 : onProgress(100);
}
async function renderStemToAudio(pattern, instruments, bpm, channelIndex, options = {}) {
  const stemPattern = {
    ...pattern,
    id: `stem-${channelIndex}-${pattern.id}`,
    channels: pattern.channels.map((ch, i) => {
      if (i === channelIndex) return ch;
      return {
        ...ch,
        rows: ch.rows.map(() => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0
        }))
      };
    })
  };
  return renderPatternToAudio(stemPattern, instruments, bpm, options);
}
async function exportAllStems(pattern, instruments, bpm, onProgress) {
  const results = [];
  const numChannels = pattern.channels.length;
  for (let ch = 0; ch < numChannels; ch++) {
    const stemProgress = (progress) => {
      onProgress == null ? void 0 : onProgress(ch, numChannels, progress);
    };
    const buffer = await renderStemToAudio(pattern, instruments, bpm, ch, {
      sampleRate: 44100,
      onProgress: stemProgress
    });
    const blob = audioBufferToWav(buffer);
    const channelName = pattern.channels[ch].name || `Channel ${ch + 1}`;
    results.push({ channelIndex: ch, channelName, blob });
  }
  return results;
}
async function downloadAllStems(pattern, instruments, bpm, baseName, onProgress) {
  const stems = await exportAllStems(pattern, instruments, bpm, onProgress);
  for (const stem of stems) {
    const url = URL.createObjectURL(stem.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_${stem.channelName.replace(/[^a-zA-Z0-9]/g, "_")}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
export {
  audioBufferToWav,
  captureAudioLive,
  downloadAllStems,
  exportAllStems,
  exportPatternAsWav,
  exportSongAsWav,
  exportUADEAsWav,
  getUADEInstrument,
  renderPatternToAudio,
  renderStemToAudio,
  renderUADEToWav
};
