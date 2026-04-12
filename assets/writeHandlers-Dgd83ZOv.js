const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/AdPlugParser-B_YVZZlR.js","assets/parseModuleToSong-B-Yqzlmn.js","assets/AdPlugPlayer-CpyKSX05.js","assets/audioExport-CBM9EItl.js","assets/LibopenmptEngine-Bz0IidoH.js","assets/readHandlers-CteNaKeA.js","assets/AudioDataBus-DGyOo1ms.js","assets/midiExport-BvJVaxgH.js","assets/OpenMPTExporter-CTwKLtBQ.js","assets/OpenMPTSoundlib-RubRPKN7.js","assets/JamCrackerExporter-Bm1Nsd2L.js","assets/SoundMonExporter-FD_nnlBy.js","assets/UADEChipEditor-DnALwiXS.js","assets/SidMon2Exporter-CAyTYVHD.js","assets/Sd2Engine-BgIHLVPo.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload, az as useProjectStore, R as useTrackerStore, e as useInstrumentStore, ax as useTransportStore, d1 as testToneSynths, d2 as testCustomSynths, d3 as testFurnaceSynths, d4 as testMAMESynths, d5 as testAllSynths, a as useUIStore, as as useAudioStore, aj as useMixerStore, $ as getToneEngine, d6 as suppressFormatChecks, d7 as restoreFormatChecks, ap as getGlobalRegistry, aw as useEditorStore, U as useCursorStore, c as clearConsoleEntries, ar as useSynthErrorStore, av as useHistoryStore } from "./main-BbV5VyEH.js";
import { now, Gain, Oscillator } from "./vendor-tone-48TQc1H3.js";
import { A as AudioDataBus } from "./AudioDataBus-DGyOo1ms.js";
const DEFAULT_BUFFER_SIZE = 120;
const DEFAULT_INTERVAL_MS = 250;
const BPM_MIN = 60;
const BPM_MAX = 200;
class AudioMonitor {
  buffer = [];
  bufferSize;
  writeIdx = 0;
  filled = false;
  intervalId = null;
  intervalMs;
  bus;
  beatTimes = [];
  constructor(bufferSize = DEFAULT_BUFFER_SIZE, intervalMs = DEFAULT_INTERVAL_MS) {
    this.bufferSize = bufferSize;
    this.intervalMs = intervalMs;
    this.bus = AudioDataBus.getShared();
  }
  start() {
    if (this.intervalId) return;
    this.buffer = [];
    this.writeIdx = 0;
    this.filled = false;
    this.beatTimes = [];
    this.intervalId = setInterval(() => this.capture(), this.intervalMs);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  isRunning() {
    return this.intervalId !== null;
  }
  capture() {
    this.bus.update();
    const frame = this.bus.getFrame();
    const now2 = performance.now();
    const snapshot = {
      time: now2,
      rms: frame.rms,
      peak: frame.peak,
      subEnergy: frame.subEnergy,
      bassEnergy: frame.bassEnergy,
      midEnergy: frame.midEnergy,
      highEnergy: frame.highEnergy,
      beat: frame.beat
    };
    if (frame.beat) {
      this.beatTimes.push(now2);
      if (this.beatTimes.length > 30) this.beatTimes.shift();
    }
    if (this.buffer.length < this.bufferSize) {
      this.buffer.push(snapshot);
    } else {
      this.buffer[this.writeIdx] = snapshot;
      this.filled = true;
    }
    this.writeIdx = (this.writeIdx + 1) % this.bufferSize;
  }
  /** Get ordered snapshots (oldest first) */
  getSnapshots() {
    if (!this.filled) return this.buffer.slice();
    return [
      ...this.buffer.slice(this.writeIdx),
      ...this.buffer.slice(0, this.writeIdx)
    ];
  }
  /** Estimate BPM from detected beats */
  getBPM() {
    if (this.beatTimes.length < 3) return null;
    const intervals = [];
    for (let i = 1; i < this.beatTimes.length; i++) {
      intervals.push(this.beatTimes[i] - this.beatTimes[i - 1]);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median <= 0) return null;
    const bpm = 6e4 / median;
    return bpm >= BPM_MIN && bpm <= BPM_MAX ? Math.round(bpm) : null;
  }
  /** Get energy profile (band averages over the buffer window) */
  getEnergyProfile() {
    const snaps = this.getSnapshots();
    if (snaps.length === 0) {
      return { rmsAvg: 0, peakMax: 0, subAvg: 0, bassAvg: 0, midAvg: 0, highAvg: 0, beats: 0 };
    }
    let rmsSum = 0, peakMax = 0, subSum = 0, bassSum = 0, midSum = 0, highSum = 0, beats = 0;
    for (const s of snaps) {
      rmsSum += s.rms;
      if (s.peak > peakMax) peakMax = s.peak;
      subSum += s.subEnergy;
      bassSum += s.bassEnergy;
      midSum += s.midEnergy;
      highSum += s.highEnergy;
      if (s.beat) beats++;
    }
    const n = snaps.length;
    return {
      rmsAvg: +(rmsSum / n).toFixed(4),
      peakMax: +peakMax.toFixed(4),
      subAvg: +(subSum / n).toFixed(4),
      bassAvg: +(bassSum / n).toFixed(4),
      midAvg: +(midSum / n).toFixed(4),
      highAvg: +(highSum / n).toFixed(4),
      beats
    };
  }
  /** Get summary data for MCP response */
  getData() {
    const snapshots = this.getSnapshots();
    const profile = this.getEnergyProfile();
    const bpm = this.getBPM();
    const maxPoints = 60;
    let sampled;
    if (snapshots.length <= maxPoints) {
      sampled = snapshots;
    } else {
      const step = snapshots.length / maxPoints;
      sampled = [];
      for (let i = 0; i < maxPoints; i++) {
        sampled.push(snapshots[Math.floor(i * step)]);
      }
    }
    return {
      running: this.isRunning(),
      snapshotCount: snapshots.length,
      bufferDurationMs: snapshots.length * this.intervalMs,
      estimatedBPM: bpm,
      energyProfile: profile,
      snapshots: sampled.map((s) => ({
        rms: +s.rms.toFixed(4),
        peak: +s.peak.toFixed(4),
        sub: +s.subEnergy.toFixed(3),
        bass: +s.bassEnergy.toFixed(3),
        mid: +s.midEnergy.toFixed(3),
        high: +s.highEnergy.toFixed(3),
        beat: s.beat
      }))
    };
  }
}
let instance = null;
function getAudioMonitor() {
  if (!instance) instance = new AudioMonitor();
  return instance;
}
function disposeAudioMonitor() {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
const NOTE_MAP = {
  "C-": 0,
  "C#": 1,
  "D-": 2,
  "D#": 3,
  "E-": 4,
  "F-": 5,
  "F#": 6,
  "G-": 7,
  "G#": 8,
  "A-": 9,
  "A#": 10,
  "B-": 11
};
function parseNoteString(noteStr) {
  const upper = noteStr.toUpperCase().trim();
  if (upper === "OFF") return 97;
  if (upper === "---" || upper === "") return 0;
  if (upper.length >= 3) {
    const notePart = upper.substring(0, 2);
    const octave = parseInt(upper.substring(2), 10);
    const noteIndex = NOTE_MAP[notePart];
    if (noteIndex !== void 0 && !isNaN(octave) && octave >= 0 && octave <= 7) {
      return noteIndex + octave * 12 + 1;
    }
  }
  return void 0;
}
function resolveNote(note) {
  if (typeof note === "number") return note;
  if (typeof note === "string") {
    let s = note;
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    const asNum = parseInt(s, 10);
    if (!isNaN(asNum) && String(asNum) === s) return asNum;
    return parseNoteString(s);
  }
  return void 0;
}
function setCell(params) {
  const channel = params.channel;
  const row = params.row;
  const patternIndex = params.patternIndex;
  if (patternIndex !== void 0) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  const cellUpdate = {};
  if (params.note !== void 0) {
    const noteVal = resolveNote(params.note);
    if (noteVal === void 0) return { error: `Invalid note: ${params.note}` };
    cellUpdate.note = noteVal;
  }
  if (params.instrument !== void 0) cellUpdate.instrument = params.instrument;
  if (params.volume !== void 0) cellUpdate.volume = params.volume;
  if (params.effTyp !== void 0) cellUpdate.effTyp = params.effTyp;
  if (params.eff !== void 0) cellUpdate.eff = params.eff;
  if (params.effTyp2 !== void 0) cellUpdate.effTyp2 = params.effTyp2;
  if (params.eff2 !== void 0) cellUpdate.eff2 = params.eff2;
  if (params.flag1 !== void 0) cellUpdate.flag1 = params.flag1;
  if (params.flag2 !== void 0) cellUpdate.flag2 = params.flag2;
  if (params.probability !== void 0) cellUpdate.probability = params.probability;
  useTrackerStore.getState().setCell(channel, row, cellUpdate);
  return { ok: true };
}
function setCells(params) {
  const patternIndex = params.patternIndex;
  const cells = params.cells;
  if (patternIndex !== void 0) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  let count = 0;
  for (const cell of cells) {
    const result = setCell({ ...cell, patternIndex: void 0 });
    if ("error" in result) return result;
    count++;
  }
  return { ok: true, count };
}
function clearCell(params) {
  const channel = params.channel;
  const row = params.row;
  const patternIndex = params.patternIndex;
  if (patternIndex !== void 0) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  useTrackerStore.getState().clearCell(channel, row);
  return { ok: true };
}
function clearPattern(params) {
  const patternIndex = params.patternIndex;
  if (patternIndex !== void 0) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  useTrackerStore.getState().clearPattern();
  return { ok: true };
}
function clearChannel(params) {
  const channel = params.channel;
  useTrackerStore.getState().clearChannel(channel);
  return { ok: true };
}
function addPattern(params) {
  const length = params.length;
  useTrackerStore.getState().addPattern(length);
  const tracker = useTrackerStore.getState();
  return { ok: true, patternIndex: tracker.patterns.length - 1 };
}
function duplicatePattern(params) {
  const index = params.patternIndex ?? useTrackerStore.getState().currentPatternIndex;
  useTrackerStore.getState().duplicatePattern(index);
  const tracker = useTrackerStore.getState();
  return { ok: true, newPatternIndex: tracker.patterns.length - 1 };
}
function resizePattern(params) {
  const index = params.patternIndex ?? useTrackerStore.getState().currentPatternIndex;
  const newLength = params.length;
  useTrackerStore.getState().resizePattern(index, newLength);
  return { ok: true };
}
function setPatternOrder(params) {
  const order = params.order;
  useTrackerStore.getState().setPatternOrder(order);
  return { ok: true };
}
function addToOrder(params) {
  const patternIndex = params.patternIndex;
  const position = params.position;
  useTrackerStore.getState().addToOrder(patternIndex, position);
  return { ok: true };
}
function removeFromOrder(params) {
  const positionIndex = params.positionIndex;
  useTrackerStore.getState().removeFromOrder(positionIndex);
  return { ok: true };
}
function setBpm(params) {
  suppressFormatChecks();
  try {
    useTransportStore.getState().setBPM(params.bpm);
  } finally {
    restoreFormatChecks();
  }
  return { ok: true };
}
function setSpeed(params) {
  useTransportStore.getState().setSpeed(params.speed);
  return { ok: true };
}
async function play(params = {}) {
  const mode = params.mode || "song";
  const store = useTransportStore.getState();
  if (mode === "song") {
    store.setIsLooping(false);
  } else {
    store.setIsLooping(true);
  }
  await store.play();
  return { ok: true, mode };
}
function stop() {
  useTransportStore.getState().stop();
  return { ok: true };
}
function pause() {
  useTransportStore.getState().pause();
  return { ok: true };
}
function setSwing(params) {
  useTransportStore.getState().setSwing(params.swing);
  return { ok: true };
}
function setGlobalPitch(params) {
  useTransportStore.getState().setGlobalPitch(params.pitch);
  return { ok: true };
}
function toggleMetronome() {
  useTransportStore.getState().toggleMetronome();
  const state = useTransportStore.getState();
  return { ok: true, metronomeEnabled: state.metronomeEnabled };
}
function setLooping(params) {
  const transport = useTransportStore.getState();
  if (params.loopStartRow !== void 0) {
    transport.setLoopStartRow(params.loopStartRow);
  }
  return { ok: true };
}
function seekTo(params) {
  if (params.position !== void 0) {
    useTrackerStore.getState().setCurrentPosition(params.position);
  }
  if (params.row !== void 0) {
    useTransportStore.getState().setCurrentRow(params.row);
  }
  return { ok: true };
}
function moveCursor(params) {
  const cursorStore = useCursorStore.getState();
  if (params.pattern !== void 0) {
    useTrackerStore.getState().setCurrentPattern(params.pattern);
  }
  if (params.row !== void 0) {
    cursorStore.moveCursorToRow(params.row);
  }
  if (params.channel !== void 0) {
    cursorStore.moveCursorToChannel(params.channel);
  }
  if (params.columnType !== void 0) {
    cursorStore.moveCursorToColumn(params.columnType);
  }
  return { ok: true };
}
function selectRange(params) {
  const cursor = useCursorStore.getState();
  const startCh = params.startChannel;
  const startRow = params.startRow;
  const endCh = params.endChannel;
  const endRow = params.endRow;
  cursor.moveCursorToChannel(startCh);
  cursor.moveCursorToRow(startRow);
  cursor.startSelection();
  cursor.updateSelection(endCh, endRow);
  cursor.endSelection();
  return { ok: true };
}
function selectAll() {
  useCursorStore.getState().selectPattern();
  return { ok: true };
}
function clearSelection() {
  useCursorStore.getState().clearSelection();
  return { ok: true };
}
function transposeSelection(params) {
  const semitones = params.semitones;
  useTrackerStore.getState().transposeSelection(semitones);
  return { ok: true };
}
function interpolateSelection(params) {
  const column = params.column ?? "volume";
  const startValue = params.startValue;
  const endValue = params.endValue;
  const curve = params.curve ?? "linear";
  useTrackerStore.getState().interpolateSelection(
    column,
    startValue,
    endValue,
    curve
  );
  return { ok: true };
}
function humanizeSelection(params) {
  const variation = params.volumeVariation ?? 10;
  useTrackerStore.getState().humanizeSelection(variation);
  return { ok: true };
}
function scaleVolume(params) {
  const scope = params.scope ?? "block";
  const factor = params.factor;
  useTrackerStore.getState().scaleVolume(scope, factor);
  return { ok: true };
}
function fadeVolume(params) {
  const scope = params.scope ?? "block";
  const startVol = params.startVolume;
  const endVol = params.endVolume;
  useTrackerStore.getState().fadeVolume(scope, startVol, endVol);
  return { ok: true };
}
function setMasterVolume(params) {
  useAudioStore.getState().setMasterVolume(params.volume);
  return { ok: true };
}
function setMasterMute(params) {
  useAudioStore.getState().setMasterMuted(params.muted);
  return { ok: true };
}
function setChannelVolume(params) {
  useMixerStore.getState().setChannelVolume(params.channel, params.volume);
  return { ok: true };
}
function setChannelPan(params) {
  useMixerStore.getState().setChannelPan(params.channel, params.pan);
  return { ok: true };
}
function setChannelMute(params) {
  useMixerStore.getState().setChannelMute(params.channel, params.muted);
  return { ok: true };
}
function setChannelSolo(params) {
  useMixerStore.getState().setChannelSolo(params.channel, params.soloed);
  return { ok: true };
}
function muteAllChannels() {
  const mixer = useMixerStore.getState();
  for (let i = 0; i < mixer.channels.length; i++) {
    mixer.setChannelMute(i, true);
  }
  return { ok: true };
}
function unmuteAllChannels() {
  const mixer = useMixerStore.getState();
  for (let i = 0; i < mixer.channels.length; i++) {
    mixer.setChannelMute(i, false);
    mixer.setChannelSolo(i, false);
  }
  return { ok: true };
}
function soloChannel(params) {
  const ch = params.channel;
  const mixer = useMixerStore.getState();
  for (let i = 0; i < mixer.channels.length; i++) {
    mixer.setChannelSolo(i, i === ch);
  }
  return { ok: true };
}
function setOctave(params) {
  useEditorStore.getState().setCurrentOctave(params.octave);
  return { ok: true };
}
function setEditStep(params) {
  useEditorStore.getState().setEditStep(params.step);
  return { ok: true };
}
function toggleRecordMode() {
  useEditorStore.getState().toggleRecordMode();
  const state = useEditorStore.getState();
  return { ok: true, recordMode: state.recordMode };
}
function setFollowPlayback(params) {
  useEditorStore.getState().setFollowPlayback(params.follow);
  return { ok: true };
}
function setActiveView(params) {
  useUIStore.getState().setActiveView(params.view);
  return { ok: true };
}
function setStatusMessage(params) {
  useUIStore.getState().setStatusMessage(params.message);
  return { ok: true };
}
function setTrackerZoom(params) {
  useUIStore.getState().setTrackerZoom(params.zoom);
  return { ok: true };
}
function selectInstrument(params) {
  useInstrumentStore.getState().setCurrentInstrument(params.id);
  return { ok: true };
}
function createInstrument(params) {
  const config = params.config ?? {};
  if (params.name && !config.name) config.name = params.name;
  if (params.synthType && !config.synthType) config.synthType = params.synthType;
  const id = useInstrumentStore.getState().createInstrument(config);
  return { ok: true, instrumentId: id };
}
function updateInstrument(params) {
  const id = params.id;
  const updates = params.updates;
  useInstrumentStore.getState().updateInstrument(id, updates);
  return { ok: true };
}
function deleteInstrument(params) {
  useInstrumentStore.getState().deleteInstrument(params.id);
  return { ok: true };
}
function cloneInstrument(params) {
  const newId = useInstrumentStore.getState().cloneInstrument(params.id);
  return { ok: true, newInstrumentId: newId };
}
function setProjectMetadata(params) {
  const updates = {};
  if (params.name !== void 0) updates.name = params.name;
  if (params.author !== void 0) updates.author = params.author;
  if (params.description !== void 0) updates.description = params.description;
  useProjectStore.getState().setMetadata(updates);
  return { ok: true };
}
function undo() {
  const restored = useHistoryStore.getState().undo();
  if (restored) {
    const patternIndex = useTrackerStore.getState().currentPatternIndex;
    useTrackerStore.setState((state) => {
      state.patterns[patternIndex] = restored;
    });
    return { ok: true };
  }
  return { ok: false, error: "Nothing to undo" };
}
function redo() {
  const restored = useHistoryStore.getState().redo();
  if (restored) {
    const patternIndex = useTrackerStore.getState().currentPatternIndex;
    useTrackerStore.setState((state) => {
      state.patterns[patternIndex] = restored;
    });
    return { ok: true };
  }
  return { ok: false, error: "Nothing to redo" };
}
function executeCommand(params) {
  const commandName = params.command;
  try {
    const registry = getGlobalRegistry();
    if (!registry) return { error: "Command registry not initialized" };
    const success = registry.execute(commandName, "global");
    return success ? { ok: true, command: commandName } : { error: `Command '${commandName}' failed or not found` };
  } catch (e) {
    return { error: `Command execution failed: ${e.message}` };
  }
}
function insertRow(params) {
  const channel = params.channel;
  const row = params.row;
  useTrackerStore.getState().insertRow(channel, row);
  return { ok: true };
}
function deleteRow(params) {
  const channel = params.channel;
  const row = params.row;
  useTrackerStore.getState().deleteRow(channel, row);
  return { ok: true };
}
function swapChannels(params) {
  const ch1 = params.channel1;
  const ch2 = params.channel2;
  useTrackerStore.getState().swapChannels(ch1, ch2);
  return { ok: true };
}
function fillRange(params) {
  const channel = params.channel;
  const startRow = params.startRow;
  const endRow = params.endRow;
  const step = params.step ?? 1;
  const cellData = params.cell;
  const patternIndex = params.patternIndex;
  if (patternIndex !== void 0) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  let count = 0;
  for (let r = startRow; r <= endRow; r += step) {
    const result = setCell({ ...cellData, channel, row: r });
    if ("error" in result) return result;
    count++;
  }
  return { ok: true, count };
}
function writeNoteSequence(params) {
  const channel = params.channel;
  const startRow = params.startRow;
  const notes = params.notes;
  const instrument = params.instrument;
  const step = params.step ?? 1;
  const patternIndex = params.patternIndex;
  if (patternIndex !== void 0) {
    useTrackerStore.getState().setCurrentPattern(patternIndex);
  }
  let row = startRow;
  for (const note of notes) {
    const cellParams = { channel, row, note };
    if (instrument !== void 0) cellParams.instrument = instrument;
    const result = setCell(cellParams);
    if ("error" in result) return result;
    row += step;
  }
  return { ok: true, count: notes.length };
}
function copySelection() {
  useTrackerStore.getState().copySelection();
  const clipboard = useTrackerStore.getState().clipboard;
  return { ok: true, channels: (clipboard == null ? void 0 : clipboard.channels) ?? 0, rows: (clipboard == null ? void 0 : clipboard.rows) ?? 0 };
}
function cutSelection() {
  useTrackerStore.getState().cutSelection();
  const clipboard = useTrackerStore.getState().clipboard;
  return { ok: true, channels: (clipboard == null ? void 0 : clipboard.channels) ?? 0, rows: (clipboard == null ? void 0 : clipboard.rows) ?? 0 };
}
function pasteClipboard(params) {
  const mode = params.mode ?? "paste";
  const tracker = useTrackerStore.getState();
  switch (mode) {
    case "mix":
      tracker.pasteMix();
      break;
    case "flood":
      tracker.pasteFlood();
      break;
    default:
      tracker.paste();
      break;
  }
  return { ok: true };
}
function dismissErrors() {
  useSynthErrorStore.getState().dismissAll();
  return { ok: true };
}
function setColumnVisibility(params) {
  useEditorStore.getState().setColumnVisibility(params);
  return { ok: true };
}
function toggleBookmark(params) {
  useEditorStore.getState().toggleBookmark(params.row);
  return { ok: true };
}
function setSynthParam(params) {
  const id = params.id;
  const param = params.param;
  const value = params.value;
  try {
    const engine = getToneEngine();
    const config = useInstrumentStore.getState().getInstrument(id);
    if (!config) return { error: `Instrument ${id} not found` };
    const synth = engine.getInstrument(id, config);
    if (!synth) return { error: `No active synth for instrument ${id}` };
    if (typeof synth === "object" && "set" in synth && typeof synth.set === "function") {
      synth.set(param, value);
      return { ok: true, instrumentId: id, param, value };
    }
    if (typeof synth === "object" && "set" in synth) {
      synth.set({ [param]: value });
      return { ok: true, instrumentId: id, param, value };
    }
    return { error: `Synth for instrument ${id} does not support parameter setting` };
  } catch (e) {
    return { error: `setSynthParam failed: ${e.message}` };
  }
}
async function triggerNote(params) {
  const id = params.id;
  const note = params.note;
  const velocity = params.velocity ?? 100;
  const duration = params.duration;
  try {
    const engine = getToneEngine();
    const config = useInstrumentStore.getState().instruments.find((i) => i.id === id);
    if (!config) return { error: `Instrument ${id} not found` };
    await engine.ensureInstrumentReady(config);
    const now$1 = now();
    if (duration) {
      engine.triggerNoteAttack(id, note, now$1, velocity / 127, config);
      engine.triggerNoteRelease(id, note, now$1 + duration, config);
    } else {
      engine.triggerNoteAttack(id, note, now$1, velocity / 127, config);
    }
    return { ok: true, instrumentId: id, note, velocity };
  } catch (e) {
    return { error: `triggerNote failed: ${e.message}` };
  }
}
function releaseNote(params) {
  const id = params.id;
  const note = params.note;
  try {
    const engine = getToneEngine();
    const config = useInstrumentStore.getState().instruments.find((i) => i.id === id);
    if (!config) return { ok: true };
    engine.triggerNoteRelease(id, note, now(), config);
    return { ok: true, instrumentId: id, note };
  } catch (e) {
    return { error: `releaseNote failed: ${e.message}` };
  }
}
function releaseAllNotes() {
  try {
    const engine = getToneEngine();
    engine.releaseAll();
    return { ok: true };
  } catch (e) {
    return { error: `releaseAllNotes failed: ${e.message}` };
  }
}
function updateSynthConfig(params) {
  const id = params.id;
  const configKey = params.configKey;
  const updates = params.updates;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };
  const instrumentUpdate = {};
  const currentSubConfig = inst[configKey] ?? {};
  instrumentUpdate[configKey] = { ...currentSubConfig, ...updates };
  useInstrumentStore.getState().updateInstrument(id, instrumentUpdate);
  return { ok: true, instrumentId: id, configKey, updatedFields: Object.keys(updates) };
}
function addMasterEffect(params) {
  const effectType = params.effectType;
  const force = params.force;
  if (force) {
    useAudioStore.getState().addMasterEffectConfig({
      category: "tonejs",
      type: effectType,
      enabled: true,
      wet: 50,
      parameters: {}
    });
  } else {
    useAudioStore.getState().addMasterEffect(effectType);
  }
  return { ok: true, effectType };
}
function updateMasterEffect(params) {
  const effectId = params.effectId;
  const updates = params.updates;
  useAudioStore.getState().updateMasterEffect(effectId, updates);
  return { ok: true, effectId };
}
function removeMasterEffect(params) {
  const effectId = params.effectId;
  useAudioStore.getState().removeMasterEffect(effectId);
  return { ok: true, effectId };
}
function toggleMasterEffect(params) {
  const effectId = params.effectId;
  const audio = useAudioStore.getState();
  const effect = audio.masterEffects.find((fx) => fx.id === effectId);
  if (!effect) return { error: `Effect ${effectId} not found` };
  audio.updateMasterEffect(effectId, { enabled: !effect.enabled });
  return { ok: true, effectId, enabled: !effect.enabled };
}
function setSampleBusGain(params) {
  useAudioStore.getState().setSampleBusGain(params.gain);
  return { ok: true };
}
function setSynthBusGain(params) {
  useAudioStore.getState().setSynthBusGain(params.gain);
  return { ok: true };
}
async function loadFile(params) {
  var _a, _b, _c, _d;
  const filename = params.filename;
  const base64Data = params.data;
  if (!filename || !base64Data) {
    return { error: "Missing required params: filename, data (base64)" };
  }
  try {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;
    const companionFilesRaw = params.companionFiles;
    const companionFiles = /* @__PURE__ */ new Map();
    if (companionFilesRaw) {
      for (const [name, b64] of Object.entries(companionFilesRaw)) {
        const cStr = atob(b64);
        const cBytes = new Uint8Array(cStr.length);
        for (let i = 0; i < cStr.length; i++) cBytes[i] = cStr.charCodeAt(i);
        companionFiles.set(name, cBytes.buffer);
      }
    }
    const file = new File([arrayBuffer], filename, { type: "application/octet-stream" });
    const { loadFile: unifiedLoadFile } = await __vitePreload(async () => {
      const { loadFile: unifiedLoadFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.jq);
      return { loadFile: unifiedLoadFile2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const { detectFormat } = await __vitePreload(async () => {
      const { detectFormat: detectFormat2 } = await import("./main-BbV5VyEH.js").then((n) => n.jj);
      return { detectFormat: detectFormat2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const format = detectFormat(filename);
    const subsong = params.subsong ?? 0;
    let loadResult = await unifiedLoadFile(file, { subsong, companionFiles: companionFiles.size > 0 ? companionFiles : void 0 });
    if (!loadResult.success) {
      throw new Error(loadResult.error || `Failed to load ${filename}`);
    }
    if (loadResult.success === "pending-confirmation") {
      throw new Error(`${filename} requires user confirmation before loading (format dialog suppressed)`);
    }
    if (loadResult.success === "pending-import") {
      suppressFormatChecks();
      try {
        const useLib = params.useLibopenmpt === true;
        const libopenmptExts = /\.(mod|xm|s3m|it|stm|669|far|ult|mtm|med|mmd[0-3]|okt|okta|gdm|psm)$/i;
        const canUseLibopenmpt = useLib && libopenmptExts.test(filename);
        const moduleLoaderNativeExts = /\.(fur|dmf|xrns)$/i;
        const needsModuleLoader = canUseLibopenmpt || moduleLoaderNativeExts.test(filename);
        if (needsModuleLoader) {
          const { loadModuleFile } = await __vitePreload(async () => {
            const { loadModuleFile: loadModuleFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.jo);
            return { loadModuleFile: loadModuleFile2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { importTrackerModule } = await __vitePreload(async () => {
            const { importTrackerModule: importTrackerModule2 } = await import("./main-BbV5VyEH.js").then((n) => n.jq);
            return { importTrackerModule: importTrackerModule2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const moduleInfo = await loadModuleFile(file);
          await importTrackerModule(moduleInfo, {
            useLibopenmpt: canUseLibopenmpt,
            subsong,
            companionFiles: companionFiles.size > 0 ? companionFiles : void 0
          });
        } else if (((_a = format == null ? void 0 : format.nativeParser) == null ? void 0 : _a.parseFn) === "parseAdPlugFile") {
          const { parseAdPlugFile } = await __vitePreload(async () => {
            const { parseAdPlugFile: parseAdPlugFile2 } = await import("./AdPlugParser-B_YVZZlR.js");
            return { parseAdPlugFile: parseAdPlugFile2 };
          }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
          const song = parseAdPlugFile(arrayBuffer, filename);
          const { useTrackerStore: ts } = await __vitePreload(async () => {
            const { useTrackerStore: ts2 } = await import("./main-BbV5VyEH.js").then((n) => n.j8);
            return { useTrackerStore: ts2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useInstrumentStore: is } = await __vitePreload(async () => {
            const { useInstrumentStore: is2 } = await import("./main-BbV5VyEH.js").then((n) => n.j0);
            return { useInstrumentStore: is2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useTransportStore: trs } = await __vitePreload(async () => {
            const { useTransportStore: trs2 } = await import("./main-BbV5VyEH.js").then((n) => n.j1);
            return { useTransportStore: trs2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useProjectStore: ps } = await __vitePreload(async () => {
            const { useProjectStore: ps2 } = await import("./main-BbV5VyEH.js").then((n) => n.j9);
            return { useProjectStore: ps2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useFormatStore: fs } = await __vitePreload(async () => {
            const { useFormatStore: fs2 } = await import("./main-BbV5VyEH.js").then((n) => n.iR);
            return { useFormatStore: fs2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { getToneEngine: getToneEngine2 } = await __vitePreload(async () => {
            const { getToneEngine: getToneEngine22 } = await import("./main-BbV5VyEH.js").then((n) => n.j2);
            return { getToneEngine: getToneEngine22 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const engine = getToneEngine2();
          if (trs.getState().isPlaying) trs.getState().stop();
          engine.releaseAll();
          trs.getState().reset();
          ts.getState().reset();
          is.getState().reset();
          engine.disposeAllInstruments();
          is.getState().loadInstruments(song.instruments);
          ts.getState().loadPatterns(song.patterns);
          if (song.songPositions) ts.getState().setPatternOrder(song.songPositions);
          trs.getState().setBPM(song.initialBPM ?? 125);
          ps.getState().setMetadata({ name: song.name });
          fs.getState().applyEditorMode(song);
        } else {
          const { parseModuleToSong } = await __vitePreload(async () => {
            const { parseModuleToSong: parseModuleToSong2 } = await import("./parseModuleToSong-B-Yqzlmn.js").then((n) => n.b);
            return { parseModuleToSong: parseModuleToSong2 };
          }, true ? __vite__mapDeps([8,0,1,2,3,4,5,6]) : void 0);
          const song = await parseModuleToSong(file, subsong, void 0, void 0, companionFiles.size > 0 ? companionFiles : void 0);
          const { useTrackerStore: ts } = await __vitePreload(async () => {
            const { useTrackerStore: ts2 } = await import("./main-BbV5VyEH.js").then((n) => n.j8);
            return { useTrackerStore: ts2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useInstrumentStore: is } = await __vitePreload(async () => {
            const { useInstrumentStore: is2 } = await import("./main-BbV5VyEH.js").then((n) => n.j0);
            return { useInstrumentStore: is2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useTransportStore: trs } = await __vitePreload(async () => {
            const { useTransportStore: trs2 } = await import("./main-BbV5VyEH.js").then((n) => n.j1);
            return { useTransportStore: trs2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useProjectStore: ps } = await __vitePreload(async () => {
            const { useProjectStore: ps2 } = await import("./main-BbV5VyEH.js").then((n) => n.j9);
            return { useProjectStore: ps2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { useFormatStore: fs } = await __vitePreload(async () => {
            const { useFormatStore: fs2 } = await import("./main-BbV5VyEH.js").then((n) => n.iR);
            return { useFormatStore: fs2 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const { getToneEngine: getToneEngine2 } = await __vitePreload(async () => {
            const { getToneEngine: getToneEngine22 } = await import("./main-BbV5VyEH.js").then((n) => n.j2);
            return { getToneEngine: getToneEngine22 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const engine = getToneEngine2();
          if (trs.getState().isPlaying) trs.getState().stop();
          engine.releaseAll();
          trs.getState().reset();
          ts.getState().reset();
          is.getState().reset();
          engine.disposeAllInstruments();
          is.getState().loadInstruments(song.instruments);
          ts.getState().loadPatterns(song.patterns);
          if (song.songPositions) ts.getState().setPatternOrder(song.songPositions);
          trs.getState().setBPM(song.initialBPM ?? 125);
          ps.getState().setMetadata({ name: song.name });
          fs.getState().applyEditorMode(song);
        }
      } finally {
        restoreFormatChecks();
      }
      loadResult = { success: true, message: "imported" };
    }
    await new Promise((resolve) => queueMicrotask(resolve));
    const { isAdPlugWasmFormat } = await __vitePreload(async () => {
      const { isAdPlugWasmFormat: isAdPlugWasmFormat2 } = await import("./main-BbV5VyEH.js").then((n) => n.jq);
      return { isAdPlugWasmFormat: isAdPlugWasmFormat2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    if (isAdPlugWasmFormat(filename)) {
      const instrumentState2 = useInstrumentStore.getState();
      const hasExtractedInstruments = instrumentState2.instruments.some((i) => i.synthType === "OPL3");
      if (!hasExtractedInstruments) {
        const { getAdPlugPlayer } = await __vitePreload(async () => {
          const { getAdPlugPlayer: getAdPlugPlayer2 } = await import("./AdPlugPlayer-CpyKSX05.js");
          return { getAdPlugPlayer: getAdPlugPlayer2 };
        }, true ? __vite__mapDeps([9,0,1,2,3,4,5,6]) : void 0);
        const meta = getAdPlugPlayer().meta;
        return {
          ok: true,
          format: (meta == null ? void 0 : meta.formatType) || "AdPlug",
          streaming: true,
          title: (meta == null ? void 0 : meta.title) || filename,
          subsongs: (meta == null ? void 0 : meta.subsongs) || 1,
          instruments: ((_b = meta == null ? void 0 : meta.instruments) == null ? void 0 : _b.length) || 0,
          filename
        };
      }
    }
    if (filename.endsWith(".v2m")) {
      return {
        ok: true,
        format: "V2M",
        streaming: true,
        filename
      };
    }
    const trackerState = useTrackerStore.getState();
    const instrumentState = useInstrumentStore.getState();
    const formatState = (await __vitePreload(async () => {
      const { useFormatStore } = await import("./main-BbV5VyEH.js").then((n) => n.iR);
      return { useFormatStore };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0)).useFormatStore.getState();
    return {
      ok: true,
      format: (format == null ? void 0 : format.label) || "Unknown",
      editorMode: formatState.editorMode,
      channels: ((_d = (_c = trackerState.patterns[0]) == null ? void 0 : _c.channels) == null ? void 0 : _d.length) || 0,
      patterns: trackerState.patterns.length,
      instruments: instrumentState.instruments.length,
      filename
    };
  } catch (e) {
    return { error: `loadFile failed: ${e.message}` };
  }
}
let _testToneOsc = null;
let _testToneGain = null;
function testTone(params) {
  const action = params.action ?? "start";
  const freq = params.frequency ?? 440;
  const level = params.level ?? -12;
  if (action === "stop") {
    if (_testToneOsc) {
      _testToneOsc.stop();
      _testToneOsc.dispose();
      _testToneOsc = null;
    }
    if (_testToneGain) {
      _testToneGain.dispose();
      _testToneGain = null;
    }
    return { status: "stopped" };
  }
  if (_testToneOsc) {
    _testToneOsc.stop();
    _testToneOsc.dispose();
    _testToneOsc = null;
  }
  if (_testToneGain) {
    _testToneGain.dispose();
    _testToneGain = null;
  }
  const engine = getToneEngine();
  if (!engine) {
    return { error: "ToneEngine not initialized" };
  }
  _testToneGain = new Gain(Math.pow(10, level / 20));
  _testToneOsc = new Oscillator({ frequency: freq, type: "sine" });
  _testToneOsc.connect(_testToneGain);
  _testToneGain.connect(engine.masterEffectsInput);
  _testToneOsc.start();
  return { status: "playing", frequency: freq, levelDb: level };
}
function getAudioLevel(params) {
  const durationMs = params.durationMs ?? 2e3;
  return new Promise((resolve) => {
    try {
      const bus = AudioDataBus.getShared();
      let framesAnalyzed = 0;
      let rmsSum = 0;
      let rmsMax = 0;
      let peakMax = 0;
      const startTime = performance.now();
      const interval = setInterval(() => {
        const frame = bus.update();
        framesAnalyzed++;
        rmsSum += frame.rms;
        if (frame.rms > rmsMax) rmsMax = frame.rms;
        if (frame.peak > peakMax) peakMax = frame.peak;
        if (performance.now() - startTime >= durationMs) {
          clearInterval(interval);
          const rmsAvg = framesAnalyzed > 0 ? rmsSum / framesAnalyzed : 0;
          resolve({
            rmsAvg: +rmsAvg.toFixed(6),
            rmsMax: +rmsMax.toFixed(6),
            peakMax: +peakMax.toFixed(6),
            framesAnalyzed,
            durationMs: Math.round(performance.now() - startTime),
            silent: rmsMax < 1e-3
          });
        }
      }, 16);
    } catch (e) {
      resolve({ error: `getAudioLevel failed: ${e.message}` });
    }
  });
}
function waitForAudio(params) {
  const timeoutMs = params.timeoutMs ?? 5e3;
  const thresholdRms = params.thresholdRms ?? 1e-3;
  return new Promise((resolve) => {
    try {
      const bus = AudioDataBus.getShared();
      const startTime = performance.now();
      const interval = setInterval(() => {
        const frame = bus.update();
        const elapsed = performance.now() - startTime;
        if (frame.rms > thresholdRms) {
          clearInterval(interval);
          resolve({
            detected: true,
            rms: +frame.rms.toFixed(6),
            peak: +frame.peak.toFixed(6),
            waitedMs: Math.round(elapsed)
          });
        } else if (elapsed >= timeoutMs) {
          clearInterval(interval);
          resolve({
            detected: false,
            rms: +frame.rms.toFixed(6),
            peak: +frame.peak.toFixed(6),
            waitedMs: Math.round(elapsed)
          });
        }
      }, 16);
    } catch (e) {
      resolve({ error: `waitForAudio failed: ${e.message}` });
    }
  });
}
async function analyzeInstrumentSpectrum(params) {
  const instrumentId = params.instrumentId ?? 0;
  const note = params.note || "C-3";
  const durationMs = params.durationMs ?? 1e3;
  const captureDelayMs = params.captureDelayMs ?? 100;
  try {
    const engine = getToneEngine();
    const instrumentConfig = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!instrumentConfig) return { error: `Instrument ${instrumentId} not found` };
    const bus = AudioDataBus.getShared();
    const now$1 = now();
    const durationSec = durationMs / 1e3;
    engine.triggerNoteAttack(instrumentId, note, now$1, 0.8, instrumentConfig);
    engine.triggerNoteRelease(instrumentId, note, now$1 + durationSec, instrumentConfig);
    return new Promise((resolve) => {
      const startTime = performance.now();
      const fftFrames = [];
      const rmsValues = [];
      let collecting = false;
      function capture() {
        const elapsed = performance.now() - startTime;
        if (elapsed >= captureDelayMs) collecting = true;
        if (collecting) {
          bus.update();
          const frame = bus.getFrame();
          if (frame.fft && frame.fft.length > 0) {
            fftFrames.push(new Float32Array(frame.fft));
          }
          rmsValues.push(frame.rms ?? 0);
        }
        if (elapsed < durationMs + 50) {
          requestAnimationFrame(capture);
        } else {
          resolve(computeSpectralMetrics(fftFrames, rmsValues, note, instrumentId));
        }
      }
      requestAnimationFrame(capture);
    });
  } catch (e) {
    return { error: `analyzeInstrumentSpectrum failed: ${e.message}` };
  }
}
function computeSpectralMetrics(fftFrames, rmsValues, note, instrumentId) {
  if (fftFrames.length === 0) {
    return { error: "No FFT data captured — is the instrument producing audio?", instrumentId, note };
  }
  const binCount = fftFrames[0].length;
  const avgFft = new Float32Array(binCount);
  for (const frame of fftFrames) {
    for (let i = 0; i < binCount; i++) {
      avgFft[i] += frame[i] / fftFrames.length;
    }
  }
  const sampleRate = 44100;
  const fftSize = binCount * 2;
  const binHz = sampleRate / fftSize;
  let peakBin = 0;
  let peakValue = -Infinity;
  for (let i = 1; i < binCount; i++) {
    if (avgFft[i] > peakValue) {
      peakValue = avgFft[i];
      peakBin = i;
    }
  }
  const fundamentalHz = peakBin * binHz;
  const harmonics = [];
  for (let h = 2; h <= 8; h++) {
    const targetBin = Math.round(peakBin * h);
    if (targetBin >= binCount) break;
    let maxVal = -Infinity;
    for (let j = Math.max(0, targetBin - 2); j <= Math.min(binCount - 1, targetBin + 2); j++) {
      if (avgFft[j] > maxVal) maxVal = avgFft[j];
    }
    harmonics.push(peakValue > -100 ? +(maxVal - peakValue).toFixed(1) : 0);
  }
  let weightedSum = 0;
  let totalEnergy = 0;
  for (let i = 0; i < binCount; i++) {
    const linearMag = Math.pow(10, avgFft[i] / 20);
    weightedSum += i * binHz * linearMag;
    totalEnergy += linearMag;
  }
  const spectralCentroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;
  const cutoffBin = Math.floor(2e3 / binHz);
  let highEnergy = 0;
  let totalE = 0;
  for (let i = 1; i < binCount; i++) {
    const lin = Math.pow(10, avgFft[i] / 20);
    totalE += lin;
    if (i >= cutoffBin) highEnergy += lin;
  }
  const brightness = totalE > 0 ? highEnergy / totalE : 0;
  const rmsAvg = rmsValues.length > 0 ? rmsValues.reduce((s, v) => s + v, 0) / rmsValues.length : 0;
  const rmsMax = rmsValues.length > 0 ? Math.max(...rmsValues) : 0;
  let peakRmsIdx = 0;
  let peakRms = 0;
  for (let i = 0; i < rmsValues.length; i++) {
    if (rmsValues[i] > peakRms) {
      peakRms = rmsValues[i];
      peakRmsIdx = i;
    }
  }
  const msPerFrame = rmsValues.length > 1 ? 1e3 / 60 : 16.67;
  const attackMs = peakRmsIdx * msPerFrame;
  const sustainStart = Math.floor(rmsValues.length * 0.7);
  const sustainFrames = rmsValues.slice(sustainStart);
  const sustainLevel = sustainFrames.length > 0 ? sustainFrames.reduce((s, v) => s + v, 0) / sustainFrames.length : 0;
  const fftSummary = [];
  const step = Math.max(1, Math.floor(binCount / 32));
  for (let i = 0; i < binCount; i += step) {
    let max = -Infinity;
    for (let j = i; j < Math.min(i + step, binCount); j++) {
      if (avgFft[j] > max) max = avgFft[j];
    }
    fftSummary.push(+max.toFixed(1));
  }
  return {
    instrumentId,
    note,
    framesAnalyzed: fftFrames.length,
    fundamental: +fundamentalHz.toFixed(1),
    fundamentalDb: +peakValue.toFixed(1),
    harmonicsDb: harmonics,
    spectralCentroid: +spectralCentroid.toFixed(1),
    brightness: +brightness.toFixed(3),
    rmsAvg: +rmsAvg.toFixed(4),
    rmsMax: +rmsMax.toFixed(4),
    envelope: {
      attackMs: +attackMs.toFixed(0),
      sustainLevel: +sustainLevel.toFixed(4)
    },
    fftSummary
  };
}
async function sweepParameter(params) {
  const instrumentId = params.instrumentId ?? 0;
  const parameter = params.parameter;
  const from = params.from ?? 0;
  const to = params.to ?? 1;
  const steps = params.steps ?? 10;
  const note = params.note || "C-3";
  const noteDurationMs = params.noteDurationMs ?? 500;
  const settleMs = params.settleMs ?? 100;
  if (!parameter) return { error: "parameter is required" };
  try {
    const engine = getToneEngine();
    const instrumentConfig = useInstrumentStore.getState().getInstrument(instrumentId);
    if (!instrumentConfig) return { error: `Instrument ${instrumentId} not found` };
    const synth = engine.getInstrument(instrumentId, instrumentConfig);
    if (!synth) return { error: `No active synth for instrument ${instrumentId}` };
    const hasSetter = typeof synth === "object" && "set" in synth && typeof synth.set === "function";
    if (!hasSetter) return { error: `Synth for instrument ${instrumentId} does not support parameter setting` };
    const bus = AudioDataBus.getShared();
    const sweepConfig = useInstrumentStore.getState().instruments.find((i) => i.id === instrumentId);
    if (!sweepConfig) return { error: `Instrument ${instrumentId} not found` };
    const results = [];
    for (let i = 0; i <= steps; i++) {
      const value = from + (to - from) * (i / steps);
      synth.set(parameter, value);
      await new Promise((r) => setTimeout(r, settleMs));
      const now$1 = now();
      engine.triggerNoteAttack(instrumentId, note, now$1, 0.8, sweepConfig);
      const fftFrames = [];
      const rmsValues = [];
      await new Promise((resolve) => {
        const startTime = performance.now();
        function capture() {
          bus.update();
          const frame = bus.getFrame();
          if (frame.fft && frame.fft.length > 0) {
            fftFrames.push(new Float32Array(frame.fft));
          }
          rmsValues.push(frame.rms ?? 0);
          if (performance.now() - startTime < noteDurationMs) {
            requestAnimationFrame(capture);
          } else {
            resolve();
          }
        }
        setTimeout(() => requestAnimationFrame(capture), 50);
      });
      engine.triggerNoteRelease(instrumentId, note, now(), sweepConfig);
      await new Promise((r) => setTimeout(r, 100));
      if (fftFrames.length > 0) {
        const binCount = fftFrames[0].length;
        const avgFft = new Float32Array(binCount);
        for (const frame of fftFrames) {
          for (let j = 0; j < binCount; j++) avgFft[j] += frame[j] / fftFrames.length;
        }
        const sampleRate = 44100;
        const binHz = sampleRate / (binCount * 2);
        let weightedSum = 0;
        let totalEnergy = 0;
        for (let j = 0; j < binCount; j++) {
          const lin = Math.pow(10, avgFft[j] / 20);
          weightedSum += j * binHz * lin;
          totalEnergy += lin;
        }
        const centroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;
        const cutBin = Math.floor(2e3 / binHz);
        let highE = 0, totE = 0;
        for (let j = 1; j < binCount; j++) {
          const lin = Math.pow(10, avgFft[j] / 20);
          totE += lin;
          if (j >= cutBin) highE += lin;
        }
        const rmsAvg = rmsValues.reduce((s, v) => s + v, 0) / rmsValues.length;
        results.push({
          value: +value.toFixed(3),
          spectralCentroid: +centroid.toFixed(1),
          brightness: +(totE > 0 ? highE / totE : 0).toFixed(3),
          rmsAvg: +rmsAvg.toFixed(4),
          rmsMax: +Math.max(...rmsValues).toFixed(4),
          frames: fftFrames.length
        });
      } else {
        results.push({ value: +value.toFixed(3), error: "no FFT data", rmsAvg: 0 });
      }
    }
    return {
      ok: true,
      instrumentId,
      parameter,
      from,
      to,
      steps,
      note,
      results
    };
  } catch (e) {
    return { error: `sweepParameter failed: ${e.message}` };
  }
}
function startMonitoring(params) {
  const bufferSize = params.bufferSize ?? 120;
  const intervalMs = params.intervalMs ?? 250;
  disposeAudioMonitor();
  const monitor = getAudioMonitor();
  monitor.start();
  return { ok: true, bufferSize, intervalMs, status: "started" };
}
function getMonitoringData() {
  const monitor = getAudioMonitor();
  if (!monitor.isRunning()) {
    return { error: "Monitor is not running. Call start_monitoring first." };
  }
  return monitor.getData();
}
function stopMonitoring() {
  const monitor = getAudioMonitor();
  monitor.stop();
  return { ok: true, status: "stopped" };
}
function autoMix(params) {
  var _a, _b, _c;
  try {
    const mode = params.mode || "balance";
    const intensity = params.intensity ?? 0.5;
    const targetChannels = params.channels;
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return { error: "No current pattern" };
    const mixer = useMixerStore.getState();
    const bus = AudioDataBus.getShared();
    bus.update();
    const frame = bus.getFrame();
    const channels = targetChannels ?? Array.from({ length: pattern.channels.length }, (_, i) => i);
    const adjustments = [];
    switch (mode) {
      case "balance": {
        const mixerChannels = mixer.channels;
        const targetRms = frame.rms > 0 ? frame.rms / channels.length : 0.1;
        for (const ch of channels) {
          const currentVol = ((_a = mixerChannels[ch]) == null ? void 0 : _a.volume) ?? 1;
          const adjustment = (targetRms > 1e-3 ? 0 : 0.05) * intensity;
          if (Math.abs(adjustment) > 0.01) {
            const newVol = Math.max(0, Math.min(1, currentVol + adjustment));
            mixer.setChannelVolume(ch, newVol);
            adjustments.push({ channel: ch, action: "volume", value: +newVol.toFixed(3) });
          }
        }
        break;
      }
      case "duck_bass": {
        const mixerChannels2 = mixer.channels;
        const bassThreshold = 0.3 * intensity;
        if (frame.bassEnergy > bassThreshold) {
          const duckAmount = Math.min(0.3, frame.bassEnergy * 0.5 * intensity);
          for (const ch of channels.slice(1)) {
            const currentVol = ((_b = mixerChannels2[ch]) == null ? void 0 : _b.volume) ?? 1;
            const newVol = Math.max(0, currentVol - duckAmount);
            mixer.setChannelVolume(ch, newVol);
            adjustments.push({ channel: ch, action: "duck", value: +newVol.toFixed(3) });
          }
        }
        break;
      }
      case "emphasize_melody": {
        const mixerChannels3 = mixer.channels;
        const boost = 0.1 * intensity;
        for (const ch of channels) {
          const currentVol = ((_c = mixerChannels3[ch]) == null ? void 0 : _c.volume) ?? 1;
          if (frame.midEnergy > frame.bassEnergy && frame.midEnergy > 0.2) {
            const newVol = Math.min(1, currentVol + boost);
            mixer.setChannelVolume(ch, newVol);
            adjustments.push({ channel: ch, action: "boost_melody", value: +newVol.toFixed(3) });
          }
        }
        break;
      }
      case "reset": {
        for (const ch of channels) {
          mixer.setChannelVolume(ch, 1);
          mixer.setChannelPan(ch, 0);
          mixer.setChannelMute(ch, false);
          adjustments.push({ channel: ch, action: "reset", value: 1 });
        }
        break;
      }
      default:
        return { error: `Unknown auto_mix mode: ${mode}` };
    }
    return {
      ok: true,
      mode,
      intensity,
      adjustments,
      audioState: {
        rms: +frame.rms.toFixed(4),
        bass: +frame.bassEnergy.toFixed(3),
        mid: +frame.midEnergy.toFixed(3),
        high: +frame.highEnergy.toFixed(3)
      }
    };
  } catch (e) {
    return { error: `autoMix failed: ${e.message}` };
  }
}
function setAutoEffect(params) {
  var _a;
  try {
    let modulate = function() {
      if (!active) return;
      bus.update();
      const frame = bus.getFrame();
      let rawValue;
      switch (source) {
        case "rms":
          rawValue = frame.rms;
          break;
        case "peak":
          rawValue = frame.peak;
          break;
        case "bass":
          rawValue = frame.bassEnergy;
          break;
        case "mid":
          rawValue = frame.midEnergy;
          break;
        case "high":
          rawValue = frame.highEnergy;
          break;
        case "sub":
          rawValue = frame.subEnergy;
          break;
        case "beat":
          rawValue = frame.beat ? 1 : 0;
          break;
        default:
          rawValue = 0;
      }
      smoothedValue = smoothedValue * (1 - alpha) + rawValue * alpha;
      const mapped = min + smoothedValue * (max - min);
      const audioStore = useAudioStore.getState();
      const effects = audioStore.masterEffects || [];
      const effect = effects.find((e) => e.id === effectId);
      if (effect) {
        try {
          if (parameter === "wet") {
            audioStore.updateMasterEffect(effectId, { wet: mapped });
          } else {
            audioStore.updateMasterEffect(effectId, {
              parameters: { ...effect.parameters, [parameter]: mapped }
            });
          }
        } catch {
        }
      }
      requestAnimationFrame(modulate);
    };
    const effectId = params.effectId;
    const parameter = params.parameter;
    const source = params.source || "rms";
    const min = params.min ?? 0;
    const max = params.max ?? 100;
    const smoothing = params.smoothing ?? 0.5;
    if (!effectId) return { error: "effectId is required" };
    if (!parameter) return { error: "parameter is required" };
    const validSources = ["rms", "peak", "bass", "mid", "high", "sub", "beat"];
    if (!validSources.includes(source)) {
      return { error: `Invalid source: ${source}. Valid: ${validSources.join(", ")}` };
    }
    const bus = AudioDataBus.getShared();
    let active = true;
    let smoothedValue = 0;
    const alpha = 1 - smoothing;
    const key = `${effectId}:${parameter}`;
    if ((_a = globalThis.__autoEffects) == null ? void 0 : _a[key]) {
      globalThis.__autoEffects[key]();
    }
    if (!globalThis.__autoEffects) globalThis.__autoEffects = {};
    globalThis.__autoEffects[key] = () => {
      active = false;
    };
    requestAnimationFrame(modulate);
    return {
      ok: true,
      effectId,
      parameter,
      source,
      range: [min, max],
      smoothing,
      status: "active",
      cancelKey: key
    };
  } catch (e) {
    return { error: `setAutoEffect failed: ${e.message}` };
  }
}
function cancelAutoEffect(params) {
  const key = params.key;
  if (!key) return { error: "key is required (from set_auto_effect response cancelKey)" };
  const effects = globalThis.__autoEffects;
  if (effects == null ? void 0 : effects[key]) {
    effects[key]();
    delete effects[key];
    return { ok: true, cancelled: key };
  }
  return { error: `No active auto-effect with key: ${key}` };
}
function dismissModal() {
  const modalOpen = useUIStore.getState().modalOpen;
  if (modalOpen) {
    useUIStore.getState().closeModal();
    return { ok: true, dismissed: modalOpen };
  }
  return { ok: true, dismissed: null, message: "No modal was open" };
}
function getModalState() {
  const { modalOpen, modalData } = useUIStore.getState();
  return { modalOpen: modalOpen ?? null, modalData: modalData ?? null };
}
async function runFormatTest(params) {
  const filename = params.filename;
  const base64Data = params.data;
  const playDurationMs = params.playDurationMs ?? 3e3;
  const measureDurationMs = params.measureDurationMs ?? 2e3;
  const audioTimeoutMs = params.audioTimeoutMs ?? 5e3;
  const subsong = params.subsong ?? 0;
  if (!filename || !base64Data) {
    return { error: "Missing required params: filename, data (base64)" };
  }
  const startTime = performance.now();
  const result = { filename, subsong };
  try {
    const loadResult = await loadFile({ filename, data: base64Data, subsong });
    if (loadResult.error) {
      return { ...result, pass: false, stage: "load", error: loadResult.error };
    }
    result.format = loadResult.format;
    result.editorMode = loadResult.editorMode;
    result.channels = loadResult.channels;
    result.patterns = loadResult.patterns;
    result.instruments = loadResult.instruments;
    result.loadTimeMs = Math.round(performance.now() - startTime);
    const transport = useTransportStore.getState();
    transport.play();
    const waitResult = await waitForAudio({ timeoutMs: audioTimeoutMs, thresholdRms: 1e-3 });
    if (!waitResult.detected) {
      transport.stop();
      return { ...result, pass: false, stage: "audio_wait", error: "No audio detected within timeout", waitResult };
    }
    result.audioDetectedMs = waitResult.waitedMs;
    await new Promise((r) => setTimeout(r, playDurationMs));
    const levelResult = await getAudioLevel({ durationMs: measureDurationMs });
    result.audioLevel = levelResult;
    transport.stop();
    const rmsAvg = levelResult.rmsAvg ?? 0;
    const silent = levelResult.silent ?? true;
    result.pass = !silent && rmsAvg > 1e-3;
    result.totalTimeMs = Math.round(performance.now() - startTime);
    return result;
  } catch (e) {
    try {
      useTransportStore.getState().stop();
    } catch {
    }
    return { ...result, pass: false, stage: "exception", error: e.message, totalTimeMs: Math.round(performance.now() - startTime) };
  }
}
async function runRegressionSuite(params) {
  const files = params.files;
  const playDurationMs = params.playDurationMs ?? 2e3;
  const measureDurationMs = params.measureDurationMs ?? 1e3;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return { error: "Missing required param: files (array of {filename, data, subsong?})" };
  }
  const results = [];
  let passed = 0;
  let failed = 0;
  const suiteStartTime = performance.now();
  for (const file of files) {
    const testResult = await runFormatTest({
      filename: file.filename,
      data: file.data,
      subsong: file.subsong ?? 0,
      playDurationMs,
      measureDurationMs
    });
    results.push(testResult);
    if (testResult.pass) passed++;
    else failed++;
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    total: files.length,
    passed,
    failed,
    passRate: files.length > 0 ? `${Math.round(passed / files.length * 100)}%` : "0%",
    totalTimeMs: Math.round(performance.now() - suiteStartTime),
    results
  };
}
const _liveCaptures = window.__devilboxLiveCaptures ?? (window.__devilboxLiveCaptures = /* @__PURE__ */ new Map());
async function exportWav(params) {
  var _a;
  try {
    const isPoll = params.captureId || params.patternIndex === -1;
    if (isPoll) {
      const captureId2 = params.captureId;
      let entry2;
      let foundId;
      if (captureId2) {
        entry2 = _liveCaptures.get(captureId2);
        foundId = captureId2;
      } else {
        for (const [id, e] of _liveCaptures) {
          if (!entry2 || e.startedAt > entry2.startedAt) {
            entry2 = e;
            foundId = id;
          }
        }
      }
      if (!entry2 || !foundId) {
        return { error: 'No pending capture found. Start one with export_wav(scope:"song") first.' };
      }
      if (entry2.status === "capturing") {
        const elapsed = ((Date.now() - entry2.startedAt) / 1e3).toFixed(1);
        return { ok: true, captureId: foundId, status: "capturing", elapsedSec: +elapsed };
      }
      if (entry2.status === "error") {
        _liveCaptures.delete(foundId);
        return { error: entry2.error ?? "Capture failed" };
      }
      const doneBlob = entry2.blob;
      _liveCaptures.delete(foundId);
      const doneArrBuf = await doneBlob.arrayBuffer();
      const doneBytes = new Uint8Array(doneArrBuf);
      let doneB64 = "";
      for (let i = 0; i < doneBytes.length; i += 8190) {
        doneB64 += btoa(String.fromCharCode(...doneBytes.subarray(i, i + 8190)));
      }
      return {
        ok: true,
        captureId: foundId,
        status: "done",
        method: "live-capture",
        scope: "song",
        durationSec: +((doneArrBuf.byteLength - 44) / (44100 * 4)).toFixed(2),
        sizeBytes: doneArrBuf.byteLength,
        wavBase64: doneB64
      };
    }
    const scope = params.scope || "song";
    const patternIndex = params.patternIndex;
    const tracker = useTrackerStore.getState();
    const instruments = useInstrumentStore.getState().instruments;
    const transport = useTransportStore.getState();
    const {
      getUADEInstrument,
      renderUADEToWav,
      captureAudioLive,
      renderPatternToAudio,
      audioBufferToWav
    } = await __vitePreload(async () => {
      const {
        getUADEInstrument: getUADEInstrument2,
        renderUADEToWav: renderUADEToWav2,
        captureAudioLive: captureAudioLive2,
        renderPatternToAudio: renderPatternToAudio2,
        audioBufferToWav: audioBufferToWav2
      } = await import("./audioExport-CBM9EItl.js");
      return {
        getUADEInstrument: getUADEInstrument2,
        renderUADEToWav: renderUADEToWav2,
        captureAudioLive: captureAudioLive2,
        renderPatternToAudio: renderPatternToAudio2,
        audioBufferToWav: audioBufferToWav2
      };
    }, true ? __vite__mapDeps([10,0,1,2,3,4,5,6]) : void 0);
    const OFFLINE_SYNTH_TYPES = /* @__PURE__ */ new Set([
      "MonoSynth",
      "PolySynth",
      "DuoSynth",
      "FMSynth",
      "ToneAM",
      "MembraneSynth",
      "MetalSynth",
      "NoiseSynth",
      "PluckSynth"
    ]);
    const { useFormatStore } = await __vitePreload(async () => {
      const { useFormatStore: useFormatStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.iR);
      return { useFormatStore: useFormatStore2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const fmt = useFormatStore.getState();
    const hasNativeEngine = !!(fmt.libopenmptFileData || fmt.uadeEditableFileData || fmt.hivelyFileData || fmt.klysFileData || fmt.musiclineFileData || fmt.c64SidFileData || fmt.jamCrackerFileData || fmt.futurePlayerFileData || fmt.preTrackerFileData || fmt.maFileData || fmt.hippelFileData || fmt.sonixFileData || fmt.pxtoneFileData || fmt.organyaFileData || fmt.eupFileData || fmt.ixsFileData || fmt.psycleFileData || fmt.sc68FileData || fmt.zxtuneFileData || fmt.pumaTrackerFileData || fmt.artOfNoiseFileData || fmt.bdFileData || fmt.sd2FileData || fmt.symphonieFileData || fmt.goatTrackerData);
    const isToneOnly = !hasNativeEngine && instruments.every(
      (i) => !i || !i.synthType || OFFLINE_SYNTH_TYPES.has(i.synthType)
    );
    async function blobToBase64(blob) {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let b64 = "";
      for (let i = 0; i < bytes.length; i += 8190) {
        b64 += btoa(String.fromCharCode(...bytes.subarray(i, i + 8190)));
      }
      return b64;
    }
    async function estimateSongDuration() {
      var _a2, _b;
      if (fmt.libopenmptFileData) {
        try {
          const { LibopenmptEngine } = await __vitePreload(async () => {
            const { LibopenmptEngine: LibopenmptEngine2 } = await import("./LibopenmptEngine-Bz0IidoH.js");
            return { LibopenmptEngine: LibopenmptEngine2 };
          }, true ? __vite__mapDeps([11,0,1,2,3,4,5,6]) : void 0);
          if (LibopenmptEngine.hasInstance()) {
            const sec = LibopenmptEngine.getInstance().getDurationSeconds();
            if (sec > 0) return sec + 2;
          }
        } catch {
        }
      }
      const bpm = transport.bpm || 125;
      const speed = transport.speed || 6;
      const secPerRow = speed * 60 / (bpm * 24);
      let totalRows = 0;
      for (const patIdx of tracker.patternOrder) {
        const pat = tracker.patterns[patIdx];
        totalRows += pat ? ((_b = (_a2 = pat.channels[0]) == null ? void 0 : _a2.rows) == null ? void 0 : _b.length) ?? 64 : 64;
      }
      return Math.max(5, totalRows * secPerRow + 2);
    }
    const uadeInst = getUADEInstrument(instruments);
    if ((_a = uadeInst == null ? void 0 : uadeInst.uade) == null ? void 0 : _a.fileData) {
      const blob = await renderUADEToWav(
        uadeInst.uade.fileData,
        uadeInst.uade.filename ?? "module"
      );
      const arrayBuf = await blob.arrayBuffer();
      const base64 = await blobToBase64(blob);
      return {
        ok: true,
        method: "uade-offline",
        scope: "song",
        sizeBytes: arrayBuf.byteLength,
        durationSec: +((arrayBuf.byteLength - 44) / (44100 * 4)).toFixed(2),
        wavBase64: base64
      };
    }
    if (isToneOnly) {
      const bpm = transport.bpm || 125;
      if (scope === "pattern") {
        const idx = patternIndex ?? tracker.currentPatternIndex;
        const pattern = tracker.patterns[idx];
        if (!pattern) return { error: `Pattern ${idx} not found` };
        const audioBuffer = await renderPatternToAudio(pattern, instruments, bpm);
        const wavBlob2 = audioBufferToWav(audioBuffer);
        const base642 = await blobToBase64(wavBlob2);
        const arrayBuf2 = await wavBlob2.arrayBuffer();
        return {
          ok: true,
          method: "tone-offline",
          scope: "pattern",
          patternIndex: idx,
          sampleRate: audioBuffer.sampleRate,
          durationSec: +(audioBuffer.length / audioBuffer.sampleRate).toFixed(2),
          sizeBytes: arrayBuf2.byteLength,
          wavBase64: base642
        };
      }
      const sequence = tracker.patternOrder;
      const buffers = [];
      for (const idx of sequence) {
        const pattern = tracker.patterns[idx];
        if (!pattern) continue;
        buffers.push(await renderPatternToAudio(pattern, instruments, bpm));
      }
      if (buffers.length === 0) return { error: "No patterns in sequence to export" };
      const totalLength = buffers.reduce((s, b) => s + b.length, 0);
      const sampleRate = buffers[0].sampleRate;
      const combined = new OfflineAudioContext(2, totalLength, sampleRate).createBuffer(2, totalLength, sampleRate);
      let off = 0;
      for (const buf of buffers) {
        for (let ch = 0; ch < 2; ch++) {
          combined.getChannelData(ch).set(buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1)), off);
        }
        off += buf.length;
      }
      const wavBlob = audioBufferToWav(combined);
      const base64 = await blobToBase64(wavBlob);
      const arrayBuf = await wavBlob.arrayBuffer();
      return {
        ok: true,
        method: "tone-offline",
        scope: "song",
        patterns: sequence.length,
        sampleRate,
        durationSec: +(totalLength / sampleRate).toFixed(2),
        sizeBytes: arrayBuf.byteLength,
        wavBase64: base64
      };
    }
    const maxDurationSec = typeof params.maxDurationSec === "number" ? params.maxDurationSec : 60;
    const rawDurationSec = await estimateSongDuration();
    const durationSec = Math.min(rawDurationSec, maxDurationSec);
    const captureId = crypto.randomUUID();
    const entry = { status: "capturing", startedAt: Date.now() };
    _liveCaptures.set(captureId, entry);
    captureAudioLive(durationSec).then((blob) => {
      entry.status = "done";
      entry.blob = blob;
    }).catch((err) => {
      entry.status = "error";
      entry.error = err.message;
    });
    await seekTo({ position: 0 });
    await play({});
    return {
      ok: true,
      captureId,
      status: "capturing",
      method: "live-capture",
      scope: "song",
      estimatedDurationSec: +durationSec.toFixed(2),
      instructions: `Poll with export_wav(captureId: "${captureId}") until status is "done"`
    };
  } catch (e) {
    return { error: `exportWav failed: ${e.message}` };
  }
}
async function exportPatternText(params) {
  try {
    const patternIndex = params.patternIndex;
    const format = params.format || "tracker";
    const tracker = useTrackerStore.getState();
    const idx = patternIndex ?? tracker.currentPatternIndex;
    const pattern = tracker.patterns[idx];
    if (!pattern) return { error: `Pattern ${idx} not found` };
    if (format === "csv") {
      const lines = ["row,channel,note,instrument,volume,effectType,effectValue"];
      for (let row = 0; row < pattern.length; row++) {
        for (let ch = 0; ch < pattern.channels.length; ch++) {
          const cell = pattern.channels[ch].rows[row];
          if (cell.note || cell.instrument !== null || cell.volume !== 0 || cell.effTyp || cell.eff) {
            lines.push(`${row},${ch},${cell.note ?? 0},${cell.instrument ?? ""},${cell.volume ?? 0},${cell.effTyp ?? ""},${cell.eff ?? 0}`);
          }
        }
      }
      return { ok: true, patternIndex: idx, format: "csv", lineCount: lines.length, text: lines.join("\n") };
    }
    const { renderPatternText } = await __vitePreload(async () => {
      const { renderPatternText: renderPatternText2 } = await import("./readHandlers-CteNaKeA.js");
      return { renderPatternText: renderPatternText2 };
    }, true ? __vite__mapDeps([12,0,1,2,3,4,5,6,13]) : void 0);
    const result = renderPatternText({ patternIndex: idx });
    return { ok: true, patternIndex: idx, format: "tracker", ...result };
  } catch (e) {
    return { error: `exportPatternText failed: ${e.message}` };
  }
}
async function exportMidi(params) {
  try {
    const scope = params.scope || "pattern";
    const patternIndex = params.patternIndex;
    const tracker = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const bpm = transport.bpm;
    const timeSignature = [4, 4];
    const { exportPatternToMIDI, exportSongToMIDI } = await __vitePreload(async () => {
      const { exportPatternToMIDI: exportPatternToMIDI2, exportSongToMIDI: exportSongToMIDI2 } = await import("./midiExport-BvJVaxgH.js");
      return { exportPatternToMIDI: exportPatternToMIDI2, exportSongToMIDI: exportSongToMIDI2 };
    }, true ? __vite__mapDeps([14,0,1,2,3,4,5,6]) : void 0);
    if (scope === "song") {
      const midiData = exportSongToMIDI(
        tracker.patterns,
        tracker.patternOrder.map((i) => {
          var _a;
          return (_a = tracker.patterns[i]) == null ? void 0 : _a.id;
        }).filter(Boolean),
        bpm,
        timeSignature,
        []
        // No automation curves via MCP for now
      );
      const base64 = btoa(String.fromCharCode(...midiData));
      return { ok: true, scope: "song", sizeBytes: midiData.byteLength, midiBase64: base64 };
    } else {
      const idx = patternIndex ?? tracker.currentPatternIndex;
      const pattern = tracker.patterns[idx];
      if (!pattern) return { error: `Pattern ${idx} not found` };
      const midiData = exportPatternToMIDI(pattern, bpm, timeSignature);
      const base64 = btoa(String.fromCharCode(...midiData));
      return { ok: true, scope: "pattern", patternIndex: idx, sizeBytes: midiData.byteLength, midiBase64: base64 };
    }
  } catch (e) {
    return { error: `exportMidi failed: ${e.message}` };
  }
}
async function exportMod(params) {
  var _a;
  try {
    const format = params.format ?? "mod";
    const trackerState = useTrackerStore.getState();
    const instrumentState = useInstrumentStore.getState();
    const transportState = (await __vitePreload(async () => {
      const { useTransportStore: useTransportStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.j1);
      return { useTransportStore: useTransportStore2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0)).useTransportStore.getState();
    const projectState = useProjectStore.getState();
    const { exportWithOpenMPT } = await __vitePreload(async () => {
      const { exportWithOpenMPT: exportWithOpenMPT2 } = await import("./OpenMPTExporter-CTwKLtBQ.js");
      return { exportWithOpenMPT: exportWithOpenMPT2 };
    }, true ? __vite__mapDeps([15,0,1,2,3,4,5,6,16]) : void 0);
    const result = await exportWithOpenMPT(
      trackerState.patterns,
      instrumentState.instruments,
      trackerState.patternOrder,
      {
        format,
        moduleName: ((_a = projectState.metadata) == null ? void 0 : _a.name) ?? "Untitled",
        initialBPM: transportState.bpm,
        initialSpeed: transportState.speed
      }
    );
    const arrayBuf = await result.data.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    const base64 = btoa(binary);
    return {
      ok: true,
      filename: result.filename,
      sizeBytes: arrayBuf.byteLength,
      warnings: result.warnings,
      modBase64: base64
    };
  } catch (e) {
    return { error: `exportMod failed: ${e.message}` };
  }
}
async function exportNative(_params) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  try {
    const { getTrackerReplayer } = await __vitePreload(async () => {
      const { getTrackerReplayer: getTrackerReplayer2 } = await import("./main-BbV5VyEH.js").then((n) => n.j6);
      return { getTrackerReplayer: getTrackerReplayer2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    let song = getTrackerReplayer().getSong();
    const { useFormatStore } = await __vitePreload(async () => {
      const { useFormatStore: useFormatStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.iR);
      return { useFormatStore: useFormatStore2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const fmt = useFormatStore.getState();
    const projectState = useProjectStore.getState();
    const trackerState = useTrackerStore.getState();
    if (!song && trackerState.patterns.length === 0) return { error: "No song loaded" };
    const baseName = ((song == null ? void 0 : song.name) || ((_a = projectState.metadata) == null ? void 0 : _a.name) || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
    const blobType = "application/octet-stream";
    let result = null;
    if (!song && (fmt.editorMode === "hively" || fmt.editorMode === "klystrack" || fmt.editorMode === "jamcracker")) {
      const instrumentState = useInstrumentStore.getState();
      const transportState = (await __vitePreload(async () => {
        const { useTransportStore: useTransportStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.j1);
        return { useTransportStore: useTransportStore2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0)).useTransportStore.getState();
      const format = fmt.editorMode === "hively" ? ((_b = fmt.hivelyMeta) == null ? void 0 : _b.version) === 0 ? "AHX" : "HVL" : fmt.editorMode === "klystrack" ? "KT" : "JamCracker";
      song = {
        name: ((_c = projectState.metadata) == null ? void 0 : _c.name) ?? "Untitled",
        format,
        patterns: trackerState.patterns,
        instruments: instrumentState.instruments,
        songPositions: trackerState.patternOrder ?? trackerState.patterns.map((_, i) => i),
        songLength: ((_d = trackerState.patternOrder) == null ? void 0 : _d.length) ?? trackerState.patterns.length,
        restartPosition: 0,
        numChannels: ((_f = (_e = trackerState.patterns[0]) == null ? void 0 : _e.channels) == null ? void 0 : _f.length) ?? 4,
        initialSpeed: transportState.speed ?? 6,
        initialBPM: transportState.bpm ?? 125,
        hivelyNative: fmt.hivelyNative ?? void 0,
        hivelyFileData: fmt.hivelyFileData ?? void 0,
        hivelyMeta: fmt.hivelyMeta ?? void 0,
        klysNative: fmt.klysNative ?? void 0,
        klysFileData: fmt.klysFileData ?? void 0,
        jamCrackerFileData: fmt.jamCrackerFileData ?? void 0
      };
    }
    if (song) {
      const format = song.format;
      const layoutFormatId = ((_g = song.uadePatternLayout) == null ? void 0 : _g.formatId) || ((_h = song.uadeVariableLayout) == null ? void 0 : _h.formatId) || "";
      if (format === "JamCracker") {
        const { exportAsJamCracker } = await __vitePreload(async () => {
          const { exportAsJamCracker: exportAsJamCracker2 } = await import("./JamCrackerExporter-Bm1Nsd2L.js");
          return { exportAsJamCracker: exportAsJamCracker2 };
        }, true ? __vite__mapDeps([17,0,1,2,3,4,5,6]) : void 0);
        result = await exportAsJamCracker(song);
      } else if (format === "SMON") {
        const { exportAsSoundMon } = await __vitePreload(async () => {
          const { exportAsSoundMon: exportAsSoundMon2 } = await import("./SoundMonExporter-FD_nnlBy.js");
          return { exportAsSoundMon: exportAsSoundMon2 };
        }, true ? __vite__mapDeps([18,19,0,1,2,3,4,5,6]) : void 0);
        result = await exportAsSoundMon(song);
      } else if (format === "FC") {
        const { exportFC } = await __vitePreload(async () => {
          const { exportFC: exportFC2 } = await import("./FCExporter-CAwaVezs.js");
          return { exportFC: exportFC2 };
        }, true ? [] : void 0);
        const buf = exportFC(song);
        result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.fc`, warnings: [] };
      } else if (format === "SidMon2") {
        const { exportSidMon2File } = await __vitePreload(async () => {
          const { exportSidMon2File: exportSidMon2File2 } = await import("./SidMon2Exporter-CAyTYVHD.js");
          return { exportSidMon2File: exportSidMon2File2 };
        }, true ? __vite__mapDeps([20,21,0,1,2,3,4,5,6]) : void 0);
        const buf = await exportSidMon2File(song);
        result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.sd2`, warnings: [] };
      } else if (format === "PumaTracker") {
        const { exportPumaTrackerFile } = await __vitePreload(async () => {
          const { exportPumaTrackerFile: exportPumaTrackerFile2 } = await import("./PumaTrackerExporter-BrGn_mRA.js");
          return { exportPumaTrackerFile: exportPumaTrackerFile2 };
        }, true ? [] : void 0);
        const buf = exportPumaTrackerFile(song);
        result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.puma`, warnings: [] };
      } else if (format === "OctaMED") {
        const { exportMED } = await __vitePreload(async () => {
          const { exportMED: exportMED2 } = await import("./MEDExporter-C5dzZxI4.js");
          return { exportMED: exportMED2 };
        }, true ? [] : void 0);
        const buf = exportMED(song);
        result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.mmd0`, warnings: [] };
      } else if (format === "HVL" || format === "AHX" || layoutFormatId === "hivelyHVL" || layoutFormatId === "hivelyAHX") {
        const { exportAsHively } = await __vitePreload(async () => {
          const { exportAsHively: exportAsHively2 } = await import("./main-BbV5VyEH.js").then((n) => n.jv);
          return { exportAsHively: exportAsHively2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        const hvlFmt = format === "AHX" || layoutFormatId === "hivelyAHX" ? "ahx" : "hvl";
        result = exportAsHively(song, { format: hvlFmt, nativeOverride: fmt.hivelyNative });
      } else if (format === "DIGI" || layoutFormatId === "digiBooster") {
        const { exportDigiBooster } = await __vitePreload(async () => {
          const { exportDigiBooster: exportDigiBooster2 } = await import("./DigiBoosterExporter-B8oJIU6Q.js");
          return { exportDigiBooster: exportDigiBooster2 };
        }, true ? [] : void 0);
        const buf = exportDigiBooster(song);
        result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.dbm`, warnings: [] };
      } else if (format === "OKT" || layoutFormatId === "oktalyzer") {
        const { exportOktalyzer } = await __vitePreload(async () => {
          const { exportOktalyzer: exportOktalyzer2 } = await import("./OktalyzerExporter-BLabO2-P.js");
          return { exportOktalyzer: exportOktalyzer2 };
        }, true ? [] : void 0);
        const buf = exportOktalyzer(song);
        result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.okt`, warnings: [] };
      } else if (format === "KT" || layoutFormatId === "klystrack") {
        const { exportAsKlystrack } = await __vitePreload(async () => {
          const { exportAsKlystrack: exportAsKlystrack2 } = await import("./main-BbV5VyEH.js").then((n) => n.jz);
          return { exportAsKlystrack: exportAsKlystrack2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        result = await exportAsKlystrack(song);
      } else if (format === "IS10" || layoutFormatId === "inStereo1") {
        const { exportInStereo1 } = await __vitePreload(async () => {
          const { exportInStereo1: exportInStereo12 } = await import("./InStereo1Exporter-Cxkntot5.js");
          return { exportInStereo1: exportInStereo12 };
        }, true ? [] : void 0);
        result = await exportInStereo1(song);
      } else if (format === "AdPlug") {
        const { exportAdPlug } = await __vitePreload(async () => {
          const { exportAdPlug: exportAdPlug2 } = await import("./AdPlugExporter-DwxlB-cL.js");
          return { exportAdPlug: exportAdPlug2 };
        }, true ? [] : void 0);
        result = exportAdPlug(song, "rad");
      } else {
        const exporterMap = {
          musicLine: { module: "MusicLineExporter", fn: "exportMusicLineFile" },
          musicAssembler: { module: "MusicAssemblerExporter", fn: "exportAsMusicAssembler" },
          futurePlayer: { module: "FuturePlayerExporter", fn: "exportAsFuturePlayer" },
          digitalSymphony: { module: "DigitalSymphonyExporter", fn: "exportDigitalSymphony" },
          amosMusicBank: { module: "AMOSMusicBankExporter", fn: "exportAMOSMusicBank" },
          hippelCoSo: { module: "HippelCoSoExporter", fn: "exportAsHippelCoSo" },
          symphoniePro: { module: "SymphonieProExporter", fn: "exportSymphonieProFile" },
          inStereo2: { module: "InStereo2Exporter", fn: "exportInStereo2" },
          deltaMusic1: { module: "DeltaMusic1Exporter", fn: "exportDeltaMusic1" },
          deltaMusic2: { module: "DeltaMusic2Exporter", fn: "exportDeltaMusic2" },
          digitalMugician: { module: "DigitalMugicianExporter", fn: "exportDigitalMugician" },
          sidmon1: { module: "SidMon1Exporter", fn: "exportSidMon1" },
          sonicArranger: { module: "SonicArrangerExporter", fn: "exportSonicArranger" },
          tfmx: { module: "TFMXExporter", fn: "exportTFMX" },
          fredEditor: { module: "FredEditorExporter", fn: "exportFredEditor" },
          soundfx: { module: "SoundFXExporter", fn: "exportSoundFX" },
          tcbTracker: { module: "TCBTrackerExporter", fn: "exportTCBTracker" },
          gameMusicCreator: { module: "GameMusicCreatorExporter", fn: "exportGameMusicCreator" },
          quadraComposer: { module: "QuadraComposerExporter", fn: "exportQuadraComposer" },
          activisionPro: { module: "ActivisionProExporter", fn: "exportActivisionPro" },
          digiBoosterPro: { module: "DigiBoosterProExporter", fn: "exportDigiBoosterPro" },
          faceTheMusic: { module: "FaceTheMusicExporter", fn: "exportFaceTheMusic" },
          sawteeth: { module: "SawteethExporter", fn: "exportSawteeth" },
          earAche: { module: "EarAcheExporter", fn: "exportEarAche" },
          iffSmus: { module: "IffSmusExporter", fn: "exportIffSmus" },
          actionamics: { module: "ActionamicsExporter", fn: "exportActionamics" },
          soundFactory: { module: "SoundFactoryExporter", fn: "exportSoundFactory" },
          synthesis: { module: "SynthesisExporter", fn: "exportSynthesis" },
          soundControl: { module: "SoundControlExporter", fn: "exportSoundControl" },
          c67: { module: "CDFM67Exporter", fn: "exportCDFM67" },
          zoundMonitor: { module: "ZoundMonitorExporter", fn: "exportZoundMonitor" },
          chuckBiscuits: { module: "ChuckBiscuitsExporter", fn: "exportChuckBiscuits" },
          composer667: { module: "Composer667Exporter", fn: "exportComposer667" },
          kris: { module: "KRISExporter", fn: "exportKRIS" },
          nru: { module: "NRUExporter", fn: "exportNRU" },
          ims: { module: "IMSExporter", fn: "exportIMS" },
          stp: { module: "STPExporter", fn: "exportSTP" },
          unic: { module: "UNICExporter", fn: "exportUNIC" },
          dsm_dyn: { module: "DSMDynExporter", fn: "exportDSMDyn" },
          scumm: { module: "SCUMMExporter", fn: "exportSCUMM" },
          xmf: { module: "XMFExporter", fn: "exportXMF" }
        };
        const entry = exporterMap[layoutFormatId];
        if (entry) {
          const mod = await __vitePreload(() => import(
            /* @vite-ignore */
            `../../lib/export/${entry.module}`
          ), true ? [] : void 0);
          const exportFn = mod[entry.fn];
          const raw = await exportFn(song);
          if (raw instanceof ArrayBuffer) {
            result = { data: new Blob([new Uint8Array(raw)], { type: blobType }), filename: `${baseName}.bin`, warnings: [] };
          } else if (raw instanceof Uint8Array) {
            result = { data: new Blob([new Uint8Array(raw)], { type: blobType }), filename: `${baseName}.bin`, warnings: [] };
          } else if (raw && typeof raw === "object" && "data" in raw) {
            result = raw;
          }
        }
      }
    }
    if (!result) {
      const rawData = fmt.uadeEditableFileData || fmt.libopenmptFileData;
      const rawName = fmt.uadeEditableFileName || "";
      if (rawData) {
        const ext = rawName.split(".").pop() || "bin";
        result = {
          data: new Blob([new Uint8Array(rawData)], { type: blobType }),
          filename: `${baseName}.${ext}`,
          warnings: []
        };
      }
    }
    if (!result) {
      return { error: `No native exporter available. editorMode="${fmt.editorMode}" hasUadeFileData=${!!fmt.uadeEditableFileData} uadeFileName="${fmt.uadeEditableFileName || ""}"` };
    }
    const arrayBuf = await result.data.arrayBuffer();
    const outBytes = new Uint8Array(arrayBuf);
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < outBytes.length; i += CHUNK) {
      binary += String.fromCharCode(...Array.from(outBytes.subarray(i, Math.min(i + CHUNK, outBytes.length))));
    }
    const base64 = btoa(binary);
    return {
      ok: true,
      format: (song == null ? void 0 : song.format) ?? fmt.editorMode,
      filename: result.filename,
      sizeBytes: arrayBuf.byteLength,
      warnings: result.warnings,
      nativeBase64: base64
    };
  } catch (e) {
    return { error: `exportNative failed: ${e.message}` };
  }
}
async function runSynthTests(params) {
  const suite = params.suite ?? "all";
  const timeout = params.timeout ?? 5e3;
  try {
    let summary;
    if (suite === "tone") {
      summary = await testToneSynths();
    } else if (suite === "custom") {
      summary = await testCustomSynths();
    } else if (suite === "furnace") {
      summary = await testFurnaceSynths();
    } else if (suite === "mame") {
      const startIndex = params.startIndex ?? 0;
      const batchSize = params.batchSize ?? 0;
      summary = await testMAMESynths(startIndex, batchSize);
    } else {
      summary = await testAllSynths({ timeout, verbose: false });
    }
    return { ok: true, suite, ...summary };
  } catch (e) {
    return { error: `runSynthTests failed: ${e.message}` };
  }
}
function clearConsoleErrors() {
  clearConsoleEntries();
  return { ok: true };
}
function evaluateScript(params) {
  const code = params.code;
  if (!code) return { error: "Missing code param" };
  try {
    const result = (0, eval)(code);
    return { result };
  } catch (e) {
    return { error: e.message };
  }
}
export {
  setChannelVolume as $,
  removeMasterEffect as A,
  updateMasterEffect as B,
  addMasterEffect as C,
  updateSynthConfig as D,
  releaseNote as E,
  triggerNote as F,
  setSynthParam as G,
  executeCommand as H,
  toggleBookmark as I,
  setColumnVisibility as J,
  pasteClipboard as K,
  setProjectMetadata as L,
  cloneInstrument as M,
  deleteInstrument as N,
  updateInstrument as O,
  createInstrument as P,
  selectInstrument as Q,
  setTrackerZoom as R,
  setStatusMessage as S,
  setActiveView as T,
  setFollowPlayback as U,
  setEditStep as V,
  setOctave as W,
  soloChannel as X,
  setChannelSolo as Y,
  setChannelMute as Z,
  setChannelPan as _,
  exportNative as a,
  setMasterMute as a0,
  setMasterVolume as a1,
  fadeVolume as a2,
  scaleVolume as a3,
  humanizeSelection as a4,
  interpolateSelection as a5,
  transposeSelection as a6,
  selectRange as a7,
  moveCursor as a8,
  seekTo as a9,
  redo as aA,
  undo as aB,
  toggleRecordMode as aC,
  unmuteAllChannels as aD,
  muteAllChannels as aE,
  clearSelection as aF,
  selectAll as aG,
  toggleMetronome as aH,
  pause as aI,
  stop as aJ,
  play as aK,
  setLooping as aa,
  setGlobalPitch as ab,
  setSwing as ac,
  setSpeed as ad,
  setBpm as ae,
  swapChannels as af,
  deleteRow as ag,
  insertRow as ah,
  removeFromOrder as ai,
  addToOrder as aj,
  setPatternOrder as ak,
  resizePattern as al,
  duplicatePattern as am,
  addPattern as an,
  writeNoteSequence as ao,
  fillRange as ap,
  clearChannel as aq,
  clearPattern as ar,
  clearCell as as,
  setCells as at,
  setCell as au,
  clearConsoleErrors as av,
  releaseAllNotes as aw,
  dismissErrors as ax,
  cutSelection as ay,
  copySelection as az,
  exportMod as b,
  exportMidi as c,
  exportPatternText as d,
  evaluateScript as e,
  exportWav as f,
  getAudioLevel as g,
  runRegressionSuite as h,
  runFormatTest as i,
  getModalState as j,
  dismissModal as k,
  cancelAutoEffect as l,
  autoMix as m,
  stopMonitoring as n,
  getMonitoringData as o,
  startMonitoring as p,
  sweepParameter as q,
  runSynthTests as r,
  setAutoEffect as s,
  analyzeInstrumentSpectrum as t,
  testTone as u,
  loadFile as v,
  waitForAudio as w,
  setSynthBusGain as x,
  setSampleBusGain as y,
  toggleMasterEffect as z
};
