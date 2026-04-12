import { $ as getToneEngine, e as useInstrumentStore, R as useTrackerStore, ap as getGlobalRegistry, Q as useMIDIStore, aq as useFormatStore, ar as useSynthErrorStore, as as useAudioStore, b as useDJStore, at as getDJEngineIfActive, au as useOscilloscopeStore, av as useHistoryStore, a as useUIStore, aj as useMixerStore, aw as useEditorStore, U as useCursorStore, ax as useTransportStore, ay as getTrackerReplayer, az as useProjectStore, g as getConsoleEntries } from "./main-BbV5VyEH.js";
import { getContext } from "./vendor-tone-48TQc1H3.js";
import { A as AudioDataBus } from "./AudioDataBus-DGyOo1ms.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const NOTE_NAMES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
function noteToString(note) {
  if (note === 0) return "---";
  if (note === 97) return "OFF";
  const noteIndex = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}
function formatHex(val, digits = 2) {
  return val.toString(16).toUpperCase().padStart(digits, "0");
}
const DSP_EFFECT_CHARS = ["D", "E", "C", "L", "X"];
function effectToString(effTyp, eff) {
  if (effTyp === 0 && eff === 0) return "...";
  if (effTyp >= 80 && effTyp <= 84) {
    return `${DSP_EFFECT_CHARS[effTyp - 80] ?? "D"}${formatHex(eff)}`;
  }
  return `${formatHex(effTyp, 1)}${formatHex(eff)}`;
}
function formatCell(cell) {
  return {
    note: cell.note,
    noteStr: noteToString(cell.note),
    instrument: cell.instrument,
    volume: cell.volume,
    effTyp: cell.effTyp,
    eff: cell.eff,
    effStr: effectToString(cell.effTyp, cell.eff),
    effTyp2: cell.effTyp2 ?? 0,
    eff2: cell.eff2 ?? 0
  };
}
function getSongInfo() {
  var _a;
  const tracker = useTrackerStore.getState();
  const transport = useTransportStore.getState();
  const format = useFormatStore.getState();
  const project = useProjectStore.getState();
  const pattern = tracker.patterns[tracker.currentPatternIndex];
  return {
    projectName: project.metadata.name,
    author: project.metadata.author,
    isDirty: project.isDirty,
    bpm: transport.bpm,
    speed: transport.speed,
    numPatterns: tracker.patterns.length,
    numChannels: ((_a = pattern == null ? void 0 : pattern.channels) == null ? void 0 : _a.length) ?? 0,
    patternLength: (pattern == null ? void 0 : pattern.length) ?? 64,
    currentPattern: tracker.currentPatternIndex,
    currentPosition: tracker.currentPositionIndex,
    patternOrder: tracker.patternOrder,
    editorMode: format.editorMode,
    isPlaying: transport.isPlaying,
    isPaused: transport.isPaused,
    isLooping: transport.isLooping,
    globalPitch: transport.globalPitch,
    swing: transport.swing,
    metronomeEnabled: transport.metronomeEnabled
  };
}
function getProjectMetadata() {
  const project = useProjectStore.getState();
  return { ...project.metadata, isDirty: project.isDirty };
}
function getPattern(params) {
  var _a, _b;
  const tracker = useTrackerStore.getState();
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  const startRow = params.startRow ?? 0;
  const endRow = params.endRow ?? pattern.length - 1;
  const channelFilter = params.channels;
  const compact = params.compact;
  const rows = [];
  for (let r = startRow; r <= endRow && r < pattern.length; r++) {
    if (compact) {
      let hasContent = false;
      for (let c = 0; c < pattern.channels.length; c++) {
        if (channelFilter && !channelFilter.includes(c)) continue;
        const cell = (_a = pattern.channels[c]) == null ? void 0 : _a.rows[r];
        if (cell && (cell.note || cell.instrument || cell.volume || cell.effTyp || cell.effTyp2)) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) continue;
    }
    const rowCells = [];
    for (let c = 0; c < pattern.channels.length; c++) {
      if (channelFilter && !channelFilter.includes(c)) continue;
      const cell = (_b = pattern.channels[c]) == null ? void 0 : _b.rows[r];
      if (cell) {
        rowCells.push({ channel: c, ...formatCell(cell) });
      }
    }
    rows.push({ row: r, cells: rowCells });
  }
  return {
    patternIndex,
    name: pattern.name ?? `Pattern ${patternIndex}`,
    length: pattern.length,
    numChannels: pattern.channels.length,
    rows
  };
}
function getPatternList() {
  const tracker = useTrackerStore.getState();
  return tracker.patterns.map((p, i) => ({
    index: i,
    name: p.name ?? `Pattern ${i}`,
    length: p.length,
    numChannels: p.channels.length
  }));
}
function getPatternOrder() {
  const tracker = useTrackerStore.getState();
  return {
    order: tracker.patternOrder,
    currentPosition: tracker.currentPositionIndex,
    length: tracker.patternOrder.length
  };
}
function getCell(params) {
  var _a;
  const tracker = useTrackerStore.getState();
  const channel = params.channel;
  const row = params.row;
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  const cell = (_a = pattern.channels[channel]) == null ? void 0 : _a.rows[row];
  if (!cell) return { error: `Cell at ch${channel} row${row} not found` };
  return {
    channel,
    row,
    patternIndex,
    ...formatCell(cell),
    flag1: cell.flag1,
    flag2: cell.flag2,
    probability: cell.probability,
    period: cell.period
  };
}
function getChannelColumn(params) {
  const tracker = useTrackerStore.getState();
  const channel = params.channel;
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const column = params.column ?? "note";
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  if (!pattern.channels[channel]) return { error: `Channel ${channel} not found` };
  const values = [];
  for (let r = 0; r < pattern.length; r++) {
    const cell = pattern.channels[channel].rows[r];
    if (!cell) {
      values.push(null);
      continue;
    }
    switch (column) {
      case "note":
        values.push({ note: cell.note, noteStr: noteToString(cell.note) });
        break;
      case "instrument":
        values.push(cell.instrument);
        break;
      case "volume":
        values.push(cell.volume);
        break;
      case "effect":
        values.push(cell.effTyp ? `${formatHex(cell.effTyp, 1)}${formatHex(cell.eff)}` : null);
        break;
      default:
        values.push(cell[column] ?? null);
    }
  }
  return { channel, patternIndex, column, length: pattern.length, values };
}
function getInstrumentsList() {
  var _a;
  const instruments = useInstrumentStore.getState().instruments;
  if (instruments.length > 0) {
    return instruments.map((inst) => ({
      id: inst.id,
      name: inst.name,
      type: inst.type,
      synthType: inst.synthType
    }));
  }
  try {
    const replayer = getTrackerReplayer();
    const song = replayer == null ? void 0 : replayer.getSong();
    if ((_a = song == null ? void 0 : song.instruments) == null ? void 0 : _a.length) {
      return song.instruments.map((inst) => ({
        id: inst.id,
        name: inst.name,
        type: inst.type ?? "sample",
        synthType: inst.synthType ?? "TrackerSample"
      }));
    }
  } catch {
  }
  return [];
}
function getInstrument(params) {
  const id = params.id;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };
  return JSON.parse(JSON.stringify(inst, (_key, value) => {
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) return void 0;
    return value;
  }));
}
function getCurrentInstrument() {
  const store = useInstrumentStore.getState();
  if (!store.currentInstrumentId) return { error: "No instrument selected" };
  const inst = store.getInstrument(store.currentInstrumentId);
  if (!inst) return { error: `Instrument ${store.currentInstrumentId} not found` };
  return JSON.parse(JSON.stringify(inst, (_key, value) => {
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) return void 0;
    return value;
  }));
}
function getPlaybackState() {
  const transport = useTransportStore.getState();
  return {
    isPlaying: transport.isPlaying,
    isPaused: transport.isPaused,
    isLooping: transport.isLooping,
    currentRow: transport.currentRow,
    currentPattern: transport.currentPatternIndex,
    currentGlobalRow: transport.currentGlobalRow,
    bpm: transport.bpm,
    speed: transport.speed,
    swing: transport.swing,
    jitter: transport.jitter,
    globalPitch: transport.globalPitch,
    metronomeEnabled: transport.metronomeEnabled,
    metronomeVolume: transport.metronomeVolume,
    countInEnabled: transport.countInEnabled,
    smoothScrolling: transport.smoothScrolling,
    grooveTemplateId: transport.grooveTemplateId,
    grooveSteps: transport.grooveSteps,
    loopStartRow: transport.loopStartRow
  };
}
function getCursor() {
  const cursor = useCursorStore.getState().cursor;
  return {
    row: cursor.rowIndex,
    channel: cursor.channelIndex,
    columnType: cursor.columnType,
    digitIndex: cursor.digitIndex
  };
}
function getSelection() {
  const sel = useCursorStore.getState().selection;
  if (!sel) return { hasSelection: false };
  return {
    hasSelection: true,
    startChannel: sel.startChannel,
    endChannel: sel.endChannel,
    startRow: sel.startRow,
    endRow: sel.endRow,
    startColumn: sel.startColumn,
    endColumn: sel.endColumn
  };
}
function getEditorState() {
  const editor = useEditorStore.getState();
  return {
    currentOctave: editor.currentOctave,
    recordMode: editor.recordMode,
    editStep: editor.editStep,
    insertMode: editor.insertMode,
    wrapMode: editor.wrapMode,
    followPlayback: editor.followPlayback,
    linearPeriods: editor.linearPeriods,
    multiChannelRecord: editor.multiChannelRecord,
    recordQuantize: editor.recordQuantize,
    autoRecord: editor.autoRecord,
    bookmarks: editor.bookmarks
  };
}
function getMixerState() {
  const mixer = useMixerStore.getState();
  const audio = useAudioStore.getState();
  return {
    masterVolume: audio.masterVolume,
    masterMuted: audio.masterMuted,
    sampleBusGain: audio.sampleBusGain,
    synthBusGain: audio.synthBusGain,
    autoGain: audio.autoGain,
    channels: mixer.channels.map((ch, i) => ({
      index: i,
      name: ch.name,
      volume: ch.volume,
      pan: ch.pan,
      muted: ch.muted,
      soloed: ch.soloed,
      effects: ch.effects
    }))
  };
}
function getChannelState(params) {
  const ch = params.channel;
  const mixer = useMixerStore.getState();
  const channel = mixer.channels[ch];
  if (!channel) return { error: `Channel ${ch} not found` };
  return {
    index: ch,
    name: channel.name,
    volume: channel.volume,
    pan: channel.pan,
    muted: channel.muted,
    soloed: channel.soloed,
    effects: channel.effects
  };
}
function getUIState() {
  const ui = useUIStore.getState();
  return {
    activeView: ui.activeView,
    trackerViewMode: ui.trackerViewMode,
    trackerZoom: ui.trackerZoom,
    useHexNumbers: ui.useHexNumbers,
    oscilloscopeVisible: ui.oscilloscopeVisible,
    showPatterns: ui.showPatterns,
    showInstrumentPanel: ui.showInstrumentPanel,
    showFileBrowser: ui.showFileBrowser,
    sidebarCollapsed: ui.sidebarCollapsed,
    showAutomationLanes: ui.showAutomationLanes,
    showBeatLabels: ui.showBeatLabels,
    blankEmptyCells: ui.blankEmptyCells,
    rowHighlightInterval: ui.rowHighlightInterval,
    chordEntryMode: ui.chordEntryMode,
    statusMessage: ui.statusMessage,
    performanceQuality: ui.performanceQuality,
    modalOpen: ui.modalOpen,
    dialogOpen: ui.dialogOpen
  };
}
function getHistoryState() {
  const history = useHistoryStore.getState();
  return {
    undoCount: history.undoStack.length,
    redoCount: history.redoStack.length,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0
  };
}
function getOscilloscopeInfo() {
  const osc = useOscilloscopeStore.getState();
  return {
    isActive: osc.isActive,
    numChannels: osc.numChannels,
    channelNames: osc.channelNames,
    hasData: osc.channelData.some((d) => d !== null)
  };
}
function searchPattern(params) {
  var _a;
  const tracker = useTrackerStore.getState();
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  const noteFilter = params.note;
  const instrumentFilter = params.instrument;
  const effectFilter = params.effTyp;
  const channelFilter = params.channel;
  const results = [];
  for (let c = 0; c < pattern.channels.length; c++) {
    if (channelFilter !== void 0 && c !== channelFilter) continue;
    for (let r = 0; r < pattern.length; r++) {
      const cell = (_a = pattern.channels[c]) == null ? void 0 : _a.rows[r];
      if (!cell) continue;
      let match = false;
      if (noteFilter !== void 0 && cell.note === noteFilter) match = true;
      if (instrumentFilter !== void 0 && cell.instrument === instrumentFilter) match = true;
      if (effectFilter !== void 0 && cell.effTyp === effectFilter) match = true;
      if (match) {
        results.push({ channel: c, row: r, ...formatCell(cell) });
      }
    }
  }
  return { patternIndex, matchCount: results.length, results };
}
function getPatternStats(params) {
  var _a;
  const tracker = useTrackerStore.getState();
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  let totalCells = 0;
  let noteCells = 0;
  let effectCells = 0;
  const noteCount = {};
  const instrumentUsage = {};
  const effectUsage = {};
  for (let c = 0; c < pattern.channels.length; c++) {
    for (let r = 0; r < pattern.length; r++) {
      totalCells++;
      const cell = (_a = pattern.channels[c]) == null ? void 0 : _a.rows[r];
      if (!cell) continue;
      if (cell.note > 0 && cell.note < 97) {
        noteCells++;
        const noteStr = noteToString(cell.note);
        noteCount[noteStr] = (noteCount[noteStr] || 0) + 1;
      }
      if (cell.instrument > 0) {
        instrumentUsage[cell.instrument] = (instrumentUsage[cell.instrument] || 0) + 1;
      }
      if (cell.effTyp > 0) {
        effectCells++;
        const key = `${formatHex(cell.effTyp, 1)}xx`;
        effectUsage[key] = (effectUsage[key] || 0) + 1;
      }
    }
  }
  return {
    patternIndex,
    totalCells,
    noteCells,
    effectCells,
    noteDensity: totalCells > 0 ? +(noteCells / totalCells * 100).toFixed(1) : 0,
    uniqueNotes: Object.keys(noteCount).length,
    noteDistribution: noteCount,
    instrumentUsage,
    effectUsage
  };
}
function diffPatterns(params) {
  var _a, _b;
  const tracker = useTrackerStore.getState();
  const a = params.patternA;
  const b = params.patternB;
  const patA = tracker.patterns[a];
  const patB = tracker.patterns[b];
  if (!patA) return { error: `Pattern ${a} not found` };
  if (!patB) return { error: `Pattern ${b} not found` };
  const diffs = [];
  const maxRows = Math.max(patA.length, patB.length);
  const maxChs = Math.max(patA.channels.length, patB.channels.length);
  for (let c = 0; c < maxChs; c++) {
    for (let r = 0; r < maxRows; r++) {
      const cellA = (_a = patA.channels[c]) == null ? void 0 : _a.rows[r];
      const cellB = (_b = patB.channels[c]) == null ? void 0 : _b.rows[r];
      const aNote = (cellA == null ? void 0 : cellA.note) ?? 0;
      const bNote = (cellB == null ? void 0 : cellB.note) ?? 0;
      const aInst = (cellA == null ? void 0 : cellA.instrument) ?? 0;
      const bInst = (cellB == null ? void 0 : cellB.instrument) ?? 0;
      const aVol = (cellA == null ? void 0 : cellA.volume) ?? 0;
      const bVol = (cellB == null ? void 0 : cellB.volume) ?? 0;
      const aEff = (cellA == null ? void 0 : cellA.effTyp) ?? 0;
      const bEff = (cellB == null ? void 0 : cellB.effTyp) ?? 0;
      const aEffP = (cellA == null ? void 0 : cellA.eff) ?? 0;
      const bEffP = (cellB == null ? void 0 : cellB.eff) ?? 0;
      if (aNote !== bNote || aInst !== bInst || aVol !== bVol || aEff !== bEff || aEffP !== bEffP) {
        diffs.push({
          channel: c,
          row: r,
          a: { note: aNote, noteStr: noteToString(aNote), instrument: aInst, volume: aVol, effTyp: aEff, eff: aEffP },
          b: { note: bNote, noteStr: noteToString(bNote), instrument: bInst, volume: bVol, effTyp: bEff, eff: bEffP }
        });
      }
    }
  }
  return { patternA: a, patternB: b, diffCount: diffs.length, diffs };
}
function getAudioState() {
  const audio = useAudioStore.getState();
  const dj = useDJStore.getState();
  let djDiag;
  if (dj.djModeActive) {
    try {
      const engine = getDJEngineIfActive();
      if (engine) {
        const mixer = engine.mixer;
        djDiag = {
          mixerMasterGain: mixer.getMasterVolume(),
          mixerMasterLevel: mixer.getMasterLevel(),
          crossfader: mixer.getCrossfader(),
          deckA: {
            isPlaying: dj.decks.A.isPlaying,
            isLoaded: dj.decks.A.fileName !== null,
            volume: dj.decks.A.volume,
            meterLevel: engine.deckA.meter.getValue()
          },
          deckB: {
            isPlaying: dj.decks.B.isPlaying,
            isLoaded: dj.decks.B.fileName !== null,
            volume: dj.decks.B.volume,
            meterLevel: engine.deckB.meter.getValue()
          }
        };
      }
    } catch {
    }
  }
  return {
    initialized: audio.initialized,
    contextState: audio.contextState,
    masterVolume: audio.masterVolume,
    masterMuted: audio.masterMuted,
    sampleBusGain: audio.sampleBusGain,
    synthBusGain: audio.synthBusGain,
    autoGain: audio.autoGain,
    masterEffects: audio.masterEffects.map((fx) => ({
      id: fx.id,
      type: fx.type,
      category: fx.category,
      enabled: fx.enabled,
      wet: fx.wet,
      parameters: fx.parameters
    })),
    ...djDiag ? { dj: djDiag } : {}
  };
}
function getSynthErrors() {
  const store = useSynthErrorStore.getState();
  return {
    count: store.errors.length,
    activeError: store.activeError ? {
      id: store.activeError.id,
      synthType: store.activeError.synthType,
      synthName: store.activeError.synthName,
      errorType: store.activeError.errorType,
      message: store.activeError.message,
      debugData: store.activeError.debugData
    } : null,
    errors: store.errors.map((e) => ({
      id: e.id,
      synthType: e.synthType,
      synthName: e.synthName,
      errorType: e.errorType,
      message: e.message,
      dismissed: e.dismissed,
      timestamp: e.debugData.timestamp
    }))
  };
}
function getFormatState() {
  var _a, _b;
  const format = useFormatStore.getState();
  return {
    editorMode: format.editorMode,
    hasFurnaceNative: !!format.furnaceNative,
    hasHivelyNative: !!format.hivelyNative,
    hivelyMeta: format.hivelyMeta,
    furnaceActiveSubsong: format.furnaceActiveSubsong,
    furnaceSubsongCount: ((_a = format.furnaceSubsongs) == null ? void 0 : _a.length) ?? 0,
    songDBInfo: format.songDBInfo,
    sidMetadata: format.sidMetadata,
    hasOriginalModuleData: !!format.originalModuleData,
    originalModuleFormat: ((_b = format.originalModuleData) == null ? void 0 : _b.format) ?? null,
    // Which WASM engine file data is loaded
    loadedWasmEngines: [
      format.hivelyFileData && "hively",
      format.klysFileData && "klystrack",
      format.c64SidFileData && "c64sid",
      format.jamCrackerFileData && "jamcracker",
      format.preTrackerFileData && "pretracker",
      format.maFileData && "music-assembler",
      format.hippelFileData && "hippel",
      format.sonixFileData && "sonix",
      format.pxtoneFileData && "pxtone",
      format.organyaFileData && "organya",
      format.eupFileData && "eupmini",
      format.ixsFileData && "ixalance",
      format.psycleFileData && "psycle",
      format.sc68FileData && "sc68",
      format.zxtuneFileData && "zxtune",
      format.pumaTrackerFileData && "pumatracker",
      format.artOfNoiseFileData && "artofnoise",
      format.bdFileData && "bendaglish",
      format.sd2FileData && "sidmon2",
      format.uadeEditableFileData && "uade-editable",
      format.libopenmptFileData && "libopenmpt",
      format.musiclineFileData && "musicline",
      format.futurePlayerFileData && "futureplayer"
    ].filter(Boolean)
  };
}
function getMIDIState() {
  const midi = useMIDIStore.getState();
  return {
    isSupported: midi.isSupported,
    isInitialized: midi.isInitialized,
    lastError: midi.lastError,
    inputDevices: midi.inputDevices,
    outputDevices: midi.outputDevices,
    selectedInputId: midi.selectedInputId,
    selectedOutputId: midi.selectedOutputId,
    midiOutputEnabled: midi.midiOutputEnabled,
    midiOctaveOffset: midi.midiOctaveOffset,
    knobBank: midi.knobBank,
    padBank: midi.padBank,
    isLearning: midi.isLearning,
    ccMappings: midi.ccMappings
  };
}
function getClipboardState() {
  const tracker = useTrackerStore.getState();
  const clipboard = tracker.clipboard;
  if (!clipboard) return { hasClipboard: false };
  return {
    hasClipboard: true,
    channels: clipboard.channels,
    rows: clipboard.rows
  };
}
function getCommandList() {
  try {
    const registry = getGlobalRegistry();
    if (!registry) return { error: "Command registry not initialized" };
    const commands = registry.getAllCommands();
    return {
      count: commands.length,
      commands: commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        contexts: cmd.contexts
      }))
    };
  } catch (e) {
    return { error: `Command registry not available: ${e.message}` };
  }
}
function renderPatternText(params) {
  var _a;
  const tracker = useTrackerStore.getState();
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  const startRow = params.startRow ?? 0;
  const endRow = params.endRow ?? pattern.length - 1;
  const channelFilter = params.channels;
  const channelIndices = channelFilter ?? Array.from({ length: pattern.channels.length }, (_, i) => i);
  const header = "Row | " + channelIndices.map((c) => `Ch${String(c).padStart(2, "0")}             `).join("| ");
  const sep = "-".repeat(header.length);
  const lines = [header, sep];
  for (let r = startRow; r <= endRow && r < pattern.length; r++) {
    const rowStr = String(r).padStart(3, "0");
    const cellStrs = [];
    for (const c of channelIndices) {
      const cell = (_a = pattern.channels[c]) == null ? void 0 : _a.rows[r];
      if (!cell || !cell.note && !cell.instrument && !cell.volume && !cell.effTyp && !cell.effTyp2) {
        cellStrs.push("--- .. .. ... ...");
      } else {
        const n = noteToString(cell.note);
        const i = cell.instrument ? formatHex(cell.instrument) : "..";
        const v = cell.volume ? formatHex(cell.volume) : "..";
        const e1 = effectToString(cell.effTyp, cell.eff);
        const e2 = cell.effTyp2 || cell.eff2 ? effectToString(cell.effTyp2 ?? 0, cell.eff2 ?? 0) : "...";
        cellStrs.push(`${n} ${i} ${v} ${e1} ${e2}`);
      }
    }
    lines.push(`${rowStr} | ${cellStrs.join("| ")}`);
  }
  return {
    patternIndex,
    text: lines.join("\n")
  };
}
function validatePattern(params) {
  var _a;
  const tracker = useTrackerStore.getState();
  const instruments = useInstrumentStore.getState().instruments;
  const patternIndex = params.patternIndex ?? tracker.currentPatternIndex;
  const pattern = tracker.patterns[patternIndex];
  if (!pattern) return { error: `Pattern ${patternIndex} not found` };
  const instrumentIds = new Set(instruments.map((i) => i.id));
  const issues = [];
  for (let c = 0; c < pattern.channels.length; c++) {
    let noteOn = false;
    for (let r = 0; r < pattern.length; r++) {
      const cell = (_a = pattern.channels[c]) == null ? void 0 : _a.rows[r];
      if (!cell) continue;
      if (cell.note > 0 && cell.note < 97 && cell.instrument === 0) {
        issues.push({ type: "note_no_instrument", channel: c, row: r, note: noteToString(cell.note) });
      }
      if (cell.instrument > 0 && !instrumentIds.has(cell.instrument)) {
        issues.push({ type: "missing_instrument", channel: c, row: r, instrument: cell.instrument });
      }
      if (cell.note === 97 && !noteOn) {
        issues.push({ type: "orphan_noteoff", channel: c, row: r });
      }
      if (cell.note > 0 && cell.note < 97) noteOn = true;
      if (cell.note === 97) noteOn = false;
      if (cell.volume > 64 && cell.volume < 16) {
        issues.push({ type: "unusual_volume", channel: c, row: r, volume: cell.volume });
      }
    }
  }
  return {
    patternIndex,
    valid: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}
function getSampleInfo(params) {
  var _a, _b, _c;
  const id = params.id;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };
  if (!inst.sample) return { error: `Instrument ${id} has no sample config` };
  const s = inst.sample;
  const result = {
    instrumentId: id,
    instrumentName: inst.name,
    url: s.url,
    baseNote: s.baseNote,
    detune: s.detune,
    loop: s.loop,
    loopType: s.loopType ?? "off",
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    sustainLoop: s.sustainLoop ?? false,
    sustainLoopType: s.sustainLoopType ?? "off",
    sustainLoopStart: s.sustainLoopStart ?? 0,
    sustainLoopEnd: s.sustainLoopEnd ?? 0,
    sampleRate: s.sampleRate ?? 44100,
    reverse: s.reverse,
    playbackRate: s.playbackRate,
    hasAudioBuffer: !!s.audioBuffer,
    audioBufferByteLength: ((_a = s.audioBuffer) == null ? void 0 : _a.byteLength) ?? 0,
    hasMultiMap: !!s.multiMap,
    multiMapNotes: s.multiMap ? Object.keys(s.multiMap) : [],
    sliceCount: ((_b = s.slices) == null ? void 0 : _b.length) ?? 0,
    slices: ((_c = s.slices) == null ? void 0 : _c.map((sl, i) => ({ index: i, ...sl }))) ?? [],
    sourceInstrumentId: s.sourceInstrumentId,
    sliceStart: s.sliceStart,
    sliceEnd: s.sliceEnd
  };
  try {
    const engine = getToneEngine();
    const decoded = engine.getDecodedBuffer(id);
    if (decoded) {
      result.decodedBuffer = {
        duration: decoded.duration,
        length: decoded.length,
        numberOfChannels: decoded.numberOfChannels,
        sampleRate: decoded.sampleRate
      };
    }
  } catch {
  }
  return result;
}
function getSampleWaveform(params) {
  const id = params.id;
  const resolution = params.resolution ?? 256;
  try {
    const engine = getToneEngine();
    const decoded = engine.getDecodedBuffer(id);
    if (!decoded) return { error: `No decoded buffer for instrument ${id}` };
    const channel0 = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(channel0.length / resolution));
    const mins = [];
    const maxs = [];
    for (let i = 0; i < channel0.length; i += step) {
      let min = Infinity, max = -Infinity;
      const end = Math.min(i + step, channel0.length);
      for (let j = i; j < end; j++) {
        if (channel0[j] < min) min = channel0[j];
        if (channel0[j] > max) max = channel0[j];
      }
      mins.push(+min.toFixed(4));
      maxs.push(+max.toFixed(4));
    }
    return {
      instrumentId: id,
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      length: decoded.length,
      channels: decoded.numberOfChannels,
      resolution: mins.length,
      waveformMin: mins,
      waveformMax: maxs
    };
  } catch {
    return { error: `Cannot read waveform for instrument ${id}` };
  }
}
function getSynthConfig(params) {
  var _a;
  const id = params.id;
  const inst = useInstrumentStore.getState().getInstrument(id);
  if (!inst) return { error: `Instrument ${id} not found` };
  const result = {
    instrumentId: id,
    name: inst.name,
    type: inst.type,
    synthType: inst.synthType,
    volume: inst.volume,
    pan: inst.pan,
    monophonic: inst.monophonic ?? false,
    isLive: inst.isLive ?? false
  };
  const configKeys = [
    "oscillator",
    "envelope",
    "filter",
    "filterEnvelope",
    "pitchEnvelope",
    "tb303",
    "wavetable",
    "harmonicSynth",
    "granular",
    "superSaw",
    "polySynth",
    "organ",
    "drumMachine",
    "chipSynth",
    "pwmSynth",
    "stringMachine",
    "formantSynth",
    "wobbleBass",
    "dubSiren",
    "spaceLaser",
    "synare",
    "v2",
    "v2Speech",
    "sam",
    "furnace",
    "dexed",
    "obxd",
    "rdpiano",
    "mame",
    "buzzmachine",
    "chiptuneModule",
    "hively",
    "jamCracker",
    "uade",
    "soundMon",
    "sidMon",
    "digMug",
    "fc",
    "deltaMusic1",
    "deltaMusic2",
    "sonicArranger",
    "fred",
    "tfmx",
    "hippelCoso",
    "robHubbard",
    "sidmon1",
    "octamed",
    "davidWhittaker",
    "sunvox",
    "superCollider",
    "wam",
    "drumKit"
  ];
  for (const key of configKeys) {
    const val = inst[key];
    if (val !== void 0 && val !== null) {
      try {
        result[key] = JSON.parse(JSON.stringify(val, (_k, v) => {
          if (v instanceof ArrayBuffer || v instanceof Uint8Array) return "[binary]";
          return v;
        }));
      } catch {
        result[key] = "[serialization error]";
      }
    }
  }
  if (inst.lfo) result.lfo = inst.lfo;
  result.effects = ((_a = inst.effects) == null ? void 0 : _a.map((fx) => ({
    id: fx.id,
    type: fx.type,
    category: fx.category,
    enabled: fx.enabled,
    wet: fx.wet,
    parameters: fx.parameters
  }))) ?? [];
  if (inst.parameters) result.parameters = inst.parameters;
  return result;
}
function getAudioAnalysis() {
  try {
    const bus = AudioDataBus.getShared();
    bus.update();
    const frame = bus.getFrame();
    const result = {
      rms: +(frame.rms ?? 0).toFixed(4),
      peak: +(frame.peak ?? 0).toFixed(4),
      beat: !!frame.beat,
      time: +(frame.time ?? 0).toFixed(3)
    };
    if (frame.subEnergy !== void 0) {
      result.bandEnergy = {
        sub: +frame.subEnergy.toFixed(4),
        bass: +frame.bassEnergy.toFixed(4),
        mid: +frame.midEnergy.toFixed(4),
        high: +frame.highEnergy.toFixed(4)
      };
    }
    if (frame.fft && frame.fft.length > 0) {
      const fftBins = 64;
      const fftData = [];
      const step = Math.max(1, Math.floor(frame.fft.length / fftBins));
      for (let i = 0; i < frame.fft.length; i += step) {
        let max = -Infinity;
        for (let j = i; j < Math.min(i + step, frame.fft.length); j++) {
          if (frame.fft[j] > max) max = frame.fft[j];
        }
        fftData.push(+max.toFixed(1));
      }
      result.fftSpectrum = fftData;
      result.fftBinCount = frame.fft.length;
    }
    if (frame.waveform && frame.waveform.length > 0) {
      const wfPoints = 128;
      const wfData = [];
      const step = Math.max(1, Math.floor(frame.waveform.length / wfPoints));
      for (let i = 0; i < frame.waveform.length; i += step) {
        wfData.push(+frame.waveform[i].toFixed(4));
      }
      result.waveformSnapshot = wfData;
    }
    return result;
  } catch (e) {
    return { error: `Audio analysis not available: ${e.message}` };
  }
}
function getAudioContextInfo() {
  try {
    const toneCtx = getContext();
    const ctx = toneCtx.rawContext ?? toneCtx._context ?? toneCtx;
    if (!(ctx == null ? void 0 : ctx.sampleRate)) return { error: "AudioContext not initialized" };
    return {
      sampleRate: ctx.sampleRate,
      state: ctx.state,
      currentTime: +ctx.currentTime.toFixed(3),
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: ctx.outputLatency ?? null
    };
  } catch (e) {
    return { error: `AudioContext not available: ${e.message}` };
  }
}
function getVoiceState() {
  try {
    const engine = getToneEngine();
    if (engine.voiceAllocator) {
      const stats = engine.voiceAllocator.getStats();
      const voices = engine.voiceAllocator.getAllActiveVoices();
      return {
        ...stats,
        voices: voices.map((v) => ({
          channel: v.channelIndex,
          note: v.note,
          instrumentId: v.instrumentId,
          velocity: v.velocity,
          isReleasing: v.isReleasing,
          age: +((performance.now() - v.startTime) / 1e3).toFixed(2)
        }))
      };
    }
    return { activeVoices: 0, freeVoices: 0, maxVoices: 0, utilizationPercent: 0, voices: [] };
  } catch (e) {
    return { error: `Voice allocator not available: ${e.message}` };
  }
}
function getInstrumentLevel(params) {
  const id = params.id;
  try {
    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(id);
    if (!analyser) return { instrumentId: id, level: 0, peak: 0, active: false };
    return {
      instrumentId: id,
      level: +analyser.getLevel().toFixed(4),
      peak: +analyser.getPeak().toFixed(4),
      active: analyser.hasActivity()
    };
  } catch {
    return { instrumentId: id, error: "Analyser not available" };
  }
}
function getLoadedSynths() {
  try {
    const engine = getToneEngine();
    if (!engine) return { count: 0, synths: [] };
    const instruments = engine.instruments;
    const list = [];
    instruments.forEach((synth, id) => {
      const inst = useInstrumentStore.getState().getInstrument(id);
      const entry = {
        id,
        name: (inst == null ? void 0 : inst.name) ?? `Instrument ${id}`,
        synthType: (inst == null ? void 0 : inst.synthType) ?? "unknown"
      };
      if (synth && typeof synth === "object" && "name" in synth) {
        entry.engineName = synth.name;
      }
      list.push(entry);
    });
    return { count: list.length, synths: list };
  } catch (e) {
    return { error: `Engine not available: ${e.message}` };
  }
}
function getFullState() {
  return {
    song: getSongInfo(),
    playback: getPlaybackState(),
    cursor: getCursor(),
    selection: getSelection(),
    editor: getEditorState(),
    mixer: getMixerState(),
    audio: getAudioState(),
    ui: getUIState(),
    history: getHistoryState(),
    oscilloscope: getOscilloscopeInfo(),
    instruments: getInstrumentsList(),
    patternList: getPatternList(),
    patternOrder: getPatternOrder(),
    format: getFormatState(),
    clipboard: getClipboardState(),
    errors: getSynthErrors()
  };
}
function getConsoleErrors() {
  return { entries: getConsoleEntries() };
}
export {
  diffPatterns,
  getAudioAnalysis,
  getAudioContextInfo,
  getAudioState,
  getCell,
  getChannelColumn,
  getChannelState,
  getClipboardState,
  getCommandList,
  getConsoleErrors,
  getCurrentInstrument,
  getCursor,
  getEditorState,
  getFormatState,
  getFullState,
  getHistoryState,
  getInstrument,
  getInstrumentLevel,
  getInstrumentsList,
  getLoadedSynths,
  getMIDIState,
  getMixerState,
  getOscilloscopeInfo,
  getPattern,
  getPatternList,
  getPatternOrder,
  getPatternStats,
  getPlaybackState,
  getProjectMetadata,
  getSampleInfo,
  getSampleWaveform,
  getSelection,
  getSongInfo,
  getSynthConfig,
  getSynthErrors,
  getUIState,
  getVoiceState,
  noteToString,
  renderPatternText,
  searchPattern,
  validatePattern
};
