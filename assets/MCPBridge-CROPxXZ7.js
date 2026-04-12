const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/DJActions-Ap2A5JjP.js","assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/parseModuleToSong-B-Yqzlmn.js"])))=>i.map(i=>d[i]);
import { getInstrumentLevel, getVoiceState, getAudioContextInfo, getAudioAnalysis, getLoadedSynths, getSynthConfig, getSampleWaveform, getSampleInfo, validatePattern, renderPatternText, getCommandList, getClipboardState, getMIDIState, getFormatState, getSynthErrors, getAudioState, getOscilloscopeInfo, getHistoryState, getUIState, getChannelState, getMixerState, getEditorState, getSelection, getCursor, getPlaybackState, getCurrentInstrument, getInstrument, getInstrumentsList, diffPatterns, getPatternStats, searchPattern, getChannelColumn, getCell, getPatternOrder, getPatternList, getPattern, getProjectMetadata, getFullState, getSongInfo, getConsoleErrors } from "./readHandlers-CteNaKeA.js";
import { e as evaluateScript, a as exportNative, b as exportMod, c as exportMidi, d as exportPatternText, f as exportWav, r as runSynthTests, h as runRegressionSuite, i as runFormatTest, j as getModalState, k as dismissModal, l as cancelAutoEffect, s as setAutoEffect, m as autoMix, n as stopMonitoring, o as getMonitoringData, p as startMonitoring, q as sweepParameter, t as analyzeInstrumentSpectrum, w as waitForAudio, g as getAudioLevel, u as testTone, v as loadFile, x as setSynthBusGain, y as setSampleBusGain, z as toggleMasterEffect, A as removeMasterEffect, B as updateMasterEffect, C as addMasterEffect, D as updateSynthConfig, E as releaseNote, F as triggerNote, G as setSynthParam, H as executeCommand, I as toggleBookmark, J as setColumnVisibility, K as pasteClipboard, L as setProjectMetadata, M as cloneInstrument, N as deleteInstrument, O as updateInstrument, P as createInstrument, Q as selectInstrument, R as setTrackerZoom, S as setStatusMessage, T as setActiveView, U as setFollowPlayback, V as setEditStep, W as setOctave, X as soloChannel, Y as setChannelSolo, Z as setChannelMute, _ as setChannelPan, $ as setChannelVolume, a0 as setMasterMute, a1 as setMasterVolume, a2 as fadeVolume, a3 as scaleVolume, a4 as humanizeSelection, a5 as interpolateSelection, a6 as transposeSelection, a7 as selectRange, a8 as moveCursor, a9 as seekTo, aa as setLooping, ab as setGlobalPitch, ac as setSwing, ad as setSpeed, ae as setBpm, af as swapChannels, ag as deleteRow, ah as insertRow, ai as removeFromOrder, aj as addToOrder, ak as setPatternOrder, al as resizePattern, am as duplicatePattern, an as addPattern, ao as writeNoteSequence, ap as fillRange, aq as clearChannel, ar as clearPattern, as as clearCell, at as setCells, au as setCell, av as clearConsoleErrors, aw as releaseAllNotes, ax as dismissErrors, ay as cutSelection, az as copySelection, aA as redo, aB as undo, aC as toggleRecordMode, aD as unmuteAllChannels, aE as muteAllChannels, aF as clearSelection, aG as selectAll, aH as toggleMetronome, aI as pause, aJ as stop, aK as play } from "./writeHandlers-Dgd83ZOv.js";
import { R as useTrackerStore, ax as useTransportStore, am as __vitePreload, u as useDJPlaylistStore, b as useDJStore } from "./main-BbV5VyEH.js";
import "./vendor-tone-48TQc1H3.js";
import "./AudioDataBus-DGyOo1ms.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const NOTE_NAMES$1 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};
const CHORD_TEMPLATES = {
  "maj": [0, 4, 7],
  "min": [0, 3, 7],
  "dim": [0, 3, 6],
  "aug": [0, 4, 8],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "min7": [0, 3, 7, 10]
};
function pitchClass(note) {
  return (note - 1) % 12;
}
function octave(note) {
  return Math.floor((note - 1) / 12);
}
function noteName(pc) {
  return NOTE_NAMES$1[pc % 12];
}
function extractNotes(patterns) {
  const notes = [];
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.note >= 1 && cell.note <= 96) {
          notes.push(cell.note);
        }
      }
    }
  }
  return notes;
}
function extractNotesPerChannel(patterns) {
  const channelNotes = /* @__PURE__ */ new Map();
  for (const pattern of patterns) {
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const existing = channelNotes.get(ch) || [];
      for (const cell of pattern.channels[ch].rows) {
        if (cell.note >= 1 && cell.note <= 96) {
          existing.push(cell.note);
        }
      }
      channelNotes.set(ch, existing);
    }
  }
  return channelNotes;
}
function pitchClassHistogram(notes) {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[pitchClass(n)]++;
  const total = notes.length || 1;
  return hist.map((v) => v / total);
}
function correlation(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}
function detectKey(notes) {
  if (notes.length === 0) {
    return { key: "Unknown", root: "?", mode: "unknown", confidence: 0, pitchClass: 0, allKeys: [] };
  }
  const hist = pitchClassHistogram(notes);
  const results = [];
  for (let root = 0; root < 12; root++) {
    const rotated = hist.map((_, i) => hist[(i + root) % 12]);
    const majCorr = correlation(rotated, MAJOR_PROFILE);
    const minCorr = correlation(rotated, MINOR_PROFILE);
    results.push({
      key: `${noteName(root)} major`,
      root: noteName(root),
      mode: "major",
      confidence: majCorr,
      pc: root
    });
    results.push({
      key: `${noteName(root)} minor`,
      root: noteName(root),
      mode: "minor",
      confidence: minCorr,
      pc: root
    });
  }
  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];
  return {
    key: best.key,
    root: best.root,
    mode: best.mode,
    confidence: +best.confidence.toFixed(4),
    pitchClass: best.pc,
    allKeys: results.slice(0, 6).map((r) => ({ key: r.key, confidence: +r.confidence.toFixed(4) }))
  };
}
function detectScale(notes, rootPc) {
  if (notes.length === 0) {
    return { name: "unknown", intervals: [], coverage: 0, outOfScale: 0 };
  }
  let bestScale = "";
  let bestCoverage = 0;
  let bestIntervals = [];
  let bestOutOfScale = 0;
  for (const [name, intervals] of Object.entries(SCALES)) {
    const scaleSet = new Set(intervals.map((i) => (i + rootPc) % 12));
    let inScale = 0;
    for (const n of notes) {
      if (scaleSet.has(pitchClass(n))) inScale++;
    }
    const coverage = inScale / notes.length;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestScale = name;
      bestIntervals = intervals;
      bestOutOfScale = notes.length - inScale;
    }
  }
  return {
    name: bestScale,
    intervals: bestIntervals,
    coverage: +bestCoverage.toFixed(4),
    outOfScale: bestOutOfScale
  };
}
function detectChord(pitchClasses) {
  if (pitchClasses.length < 2) return "";
  const unique = [...new Set(pitchClasses)].sort((a, b) => a - b);
  if (unique.length < 2) return "";
  let bestMatch = "";
  let bestScore = 0;
  for (const root of unique) {
    const intervals = unique.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
    for (const [name, template] of Object.entries(CHORD_TEMPLATES)) {
      let matches = 0;
      for (const interval of intervals) {
        if (template.includes(interval)) matches++;
      }
      const score = matches / Math.max(template.length, intervals.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = `${noteName(root)}${name === "maj" ? "" : name}`;
      }
    }
  }
  return bestScore >= 0.6 ? bestMatch : "";
}
function classifyChannel(channelIndex, notes, totalRows) {
  const result = {
    channel: channelIndex,
    role: "empty",
    noteCount: notes.length,
    avgOctave: 0,
    avgPitch: 0,
    density: 0,
    uniqueNotes: 0,
    pitchRange: 0,
    avgInterval: 0
  };
  if (notes.length === 0) return result;
  const octaves = notes.map((n) => octave(n));
  result.avgOctave = +(octaves.reduce((s, v) => s + v, 0) / notes.length).toFixed(2);
  result.avgPitch = +(notes.reduce((s, v) => s + v, 0) / notes.length).toFixed(2);
  result.density = +(notes.length / Math.max(totalRows, 1)).toFixed(4);
  result.uniqueNotes = new Set(notes.map((n) => pitchClass(n))).size;
  result.pitchRange = Math.max(...notes) - Math.min(...notes);
  let intervalSum = 0;
  for (let i = 1; i < notes.length; i++) {
    intervalSum += Math.abs(notes[i] - notes[i - 1]);
  }
  result.avgInterval = notes.length > 1 ? +(intervalSum / (notes.length - 1)).toFixed(2) : 0;
  if (result.avgOctave <= 2.5 && result.uniqueNotes <= 4 && result.avgInterval <= 7) {
    result.role = "bass";
  } else if (result.density >= 0.6 && result.avgInterval <= 4 && result.uniqueNotes <= 6) {
    result.role = "arpeggio";
  } else if (result.density >= 0.3 && result.avgInterval >= 5 && result.avgOctave >= 3.5) {
    result.role = "lead";
  } else if (result.uniqueNotes <= 3 && result.pitchRange <= 12) {
    result.role = "pad";
  } else if (result.uniqueNotes >= 3 && result.avgInterval <= 5) {
    result.role = "chord";
  } else if (notes.length > 0) {
    result.role = result.avgOctave < 3 ? "bass" : result.avgOctave > 4 ? "lead" : "chord";
  }
  return result;
}
function detectChordProgression(patterns, _beatsPerRow = 1, rowsPerBeat = 4) {
  var _a;
  const chords = [];
  for (const pattern of patterns) {
    const numRows = ((_a = pattern.channels[0]) == null ? void 0 : _a.rows.length) || 0;
    for (let row = 0; row < numRows; row += rowsPerBeat) {
      const pcs = [];
      for (const channel of pattern.channels) {
        const cell = channel.rows[row];
        if (cell && cell.note >= 1 && cell.note <= 96) {
          pcs.push(pitchClass(cell.note));
        }
      }
      const chord = detectChord(pcs);
      if (chord && (chords.length === 0 || chords[chords.length - 1] !== chord)) {
        chords.push(chord);
      }
    }
  }
  return chords;
}
function getNoteDistribution(notes) {
  const dist = {};
  for (const n of notes) {
    const name = noteName(pitchClass(n));
    dist[name] = (dist[name] || 0) + 1;
  }
  return dist;
}
function analyzeSong(patterns) {
  var _a;
  const allNotes = extractNotes(patterns);
  const channelNotes = extractNotesPerChannel(patterns);
  const key = detectKey(allNotes);
  const scale = detectScale(allNotes, key.pitchClass);
  let totalRows = 0;
  for (const p of patterns) totalRows += ((_a = p.channels[0]) == null ? void 0 : _a.rows.length) || 0;
  const channelAnalysis = [];
  for (const [ch, notes] of channelNotes) {
    channelAnalysis.push(classifyChannel(ch, notes, totalRows));
  }
  const instruments = /* @__PURE__ */ new Set();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument > 0) instruments.add(cell.instrument);
      }
    }
  }
  return {
    key,
    scale,
    noteDistribution: getNoteDistribution(allNotes),
    totalNotes: allNotes.length,
    uniquePitchClasses: new Set(allNotes.map((n) => pitchClass(n))).size,
    channelAnalysis,
    chordProgression: detectChordProgression(patterns),
    usedInstruments: [...instruments].sort((a, b) => a - b)
  };
}
function euclideanRhythm(steps, pulses) {
  if (pulses >= steps) return new Array(steps).fill(true);
  if (pulses <= 0) return new Array(steps).fill(false);
  let pattern = [];
  for (let i = 0; i < steps; i++) {
    pattern.push(i < pulses ? [1] : [0]);
  }
  let level = 0;
  while (true) {
    const newPattern = [];
    const remainder = pattern.filter((p) => p[0] === 0);
    const front = pattern.filter((p) => p[0] === 1);
    if (remainder.length <= 1) break;
    const minLen = Math.min(front.length, remainder.length);
    for (let i = 0; i < minLen; i++) {
      newPattern.push([...front[i], ...remainder[i]]);
    }
    for (let i = minLen; i < front.length; i++) newPattern.push(front[i]);
    for (let i = minLen; i < remainder.length; i++) newPattern.push(remainder[i]);
    pattern = newPattern;
    level++;
    if (level > 32) break;
  }
  return pattern.flat().map((v) => v === 1);
}
function getScaleNotes(rootPc, scaleIntervals, octaveLow, octaveHigh) {
  const notes = [];
  for (let oct = octaveLow; oct <= octaveHigh; oct++) {
    for (const interval of scaleIntervals) {
      const note = oct * 12 + 1 + (rootPc + interval) % 12;
      if (note >= 1 && note <= 96) notes.push(note);
    }
  }
  return notes.sort((a, b) => a - b);
}
function pickScaleNote(scaleNotes, rootPc, preferredIntervals = [0, 4, 7], chordWeight = 0.6) {
  if (scaleNotes.length === 0) return 1;
  const chordNotes = scaleNotes.filter((n) => {
    const interval = (pitchClass(n) - rootPc + 12) % 12;
    return preferredIntervals.includes(interval);
  });
  if (chordNotes.length > 0 && Math.random() < chordWeight) {
    return chordNotes[Math.floor(Math.random() * chordNotes.length)];
  }
  return scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
}
function reverseNotes(cells) {
  const notes = cells.filter((c) => c.note >= 1 && c.note <= 96);
  notes.reverse();
  let noteIdx = 0;
  return cells.map((c) => {
    if (c.note >= 1 && c.note <= 96 && noteIdx < notes.length) {
      return { ...c, note: notes[noteIdx++].note };
    }
    return c;
  });
}
function rotateCells(cells, amount) {
  const len = cells.length;
  if (len === 0) return cells;
  const shift = (amount % len + len) % len;
  return [...cells.slice(len - shift), ...cells.slice(0, len - shift)];
}
function invertNotes(cells, pivotNote) {
  return cells.map((c) => {
    if (c.note >= 1 && c.note <= 96) {
      const inverted = 2 * pivotNote - c.note;
      const clamped = Math.max(1, Math.min(96, inverted));
      return { ...c, note: clamped };
    }
    return c;
  });
}
function analyzeSongHandler(_params) {
  try {
    const { patterns } = useTrackerStore.getState();
    if (!patterns || patterns.length === 0) {
      return { error: "No song loaded" };
    }
    const analysis = analyzeSong(patterns);
    const { bpm } = useTransportStore.getState();
    return {
      key: analysis.key.key,
      keyConfidence: analysis.key.confidence,
      root: analysis.key.root,
      mode: analysis.key.mode,
      scale: {
        name: analysis.scale.name,
        intervals: analysis.scale.intervals,
        coverage: analysis.scale.coverage,
        outOfScaleNotes: analysis.scale.outOfScale
      },
      tempo: bpm,
      totalNotes: analysis.totalNotes,
      uniquePitchClasses: analysis.uniquePitchClasses,
      noteDistribution: analysis.noteDistribution,
      channelAnalysis: analysis.channelAnalysis.map((ch) => ({
        channel: ch.channel,
        role: ch.role,
        noteCount: ch.noteCount,
        avgOctave: ch.avgOctave,
        density: ch.density,
        uniqueNotes: ch.uniqueNotes,
        pitchRange: ch.pitchRange,
        avgInterval: ch.avgInterval
      })),
      chordProgression: analysis.chordProgression.slice(0, 32),
      // Cap at 32 chords
      usedInstruments: analysis.usedInstruments,
      topKeys: analysis.key.allKeys
    };
  } catch (e) {
    return { error: `Analysis failed: ${e.message}` };
  }
}
const NOTE_NAMES = {
  "C": 0,
  "C#": 1,
  "D": 2,
  "D#": 3,
  "E": 4,
  "F": 5,
  "F#": 6,
  "G": 7,
  "G#": 8,
  "A": 9,
  "A#": 10,
  "B": 11
};
const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};
function resolveRoot(key) {
  const upper = key.toUpperCase().replace("-", "").replace("B", "B");
  for (const [name, pc] of Object.entries(NOTE_NAMES)) {
    if (upper === name.toUpperCase()) return pc;
  }
  const first = upper[0];
  const sharp = upper.length > 1 && upper[1] === "#";
  const base = NOTE_NAMES[first] ?? 0;
  return sharp ? (base + 1) % 12 : base;
}
function generatePattern(params) {
  try {
    const type = params.type || "bass";
    const channel = params.channel ?? 0;
    const patternIndex = params.patternIndex ?? 0;
    const instrument = params.instrument ?? 1;
    const octaveParam = params.octave ?? 3;
    const density = params.density ?? 0.5;
    let rootPc;
    let scaleIntervals;
    const keyParam = params.key;
    const scaleParam = params.scale || "minor";
    if (keyParam) {
      rootPc = resolveRoot(keyParam);
      scaleIntervals = SCALE_INTERVALS[scaleParam] || SCALE_INTERVALS.minor;
    } else {
      const { patterns: patterns2 } = useTrackerStore.getState();
      const allNotes = extractNotes(patterns2);
      if (allNotes.length > 10) {
        const detected = detectKey(allNotes);
        rootPc = detected.pitchClass;
        const scaleResult = detectScale(allNotes, rootPc);
        scaleIntervals = SCALE_INTERVALS[scaleResult.name] || SCALE_INTERVALS.minor;
      } else {
        rootPc = 0;
        scaleIntervals = SCALE_INTERVALS[scaleParam] || SCALE_INTERVALS.minor;
      }
    }
    const { patterns } = useTrackerStore.getState();
    const pattern = patterns[patternIndex];
    if (!pattern) return { error: `Pattern ${patternIndex} not found` };
    if (channel >= pattern.channels.length) return { error: `Channel ${channel} out of range` };
    const numRows = pattern.length;
    const setCell2 = useTrackerStore.getState().setCell;
    const scaleNotes = getScaleNotes(rootPc, scaleIntervals, octaveParam - 1, octaveParam + 1);
    const chordTones = [0, scaleIntervals[2] || 4, scaleIntervals[4] || 7];
    const algParams = params.params || {};
    let notesWritten = 0;
    switch (type) {
      case "bass": {
        const bassNotes = getScaleNotes(rootPc, scaleIntervals, octaveParam - 1, octaveParam);
        const rhythm = euclideanRhythm(numRows, Math.round(numRows * density));
        for (let row = 0; row < numRows; row++) {
          if (rhythm[row]) {
            const note = pickScaleNote(bassNotes, rootPc, [0, 7], 0.7);
            setCell2(channel, row, { note, instrument });
            notesWritten++;
          }
        }
        break;
      }
      case "drums": {
        const kick = algParams.kick ?? 36;
        const snare = algParams.snare ?? 38;
        const hihat = algParams.hihat ?? 42;
        const rowsPerBeat = algParams.rowsPerBeat ?? 4;
        for (let row = 0; row < numRows; row++) {
          const beatPos = row % (rowsPerBeat * 4);
          if (beatPos === 0 || beatPos === rowsPerBeat * 2) {
            setCell2(channel, row, { note: kick, instrument });
            notesWritten++;
          } else if (beatPos === rowsPerBeat || beatPos === rowsPerBeat * 3) {
            setCell2(channel, row, { note: snare, instrument });
            notesWritten++;
          } else if (density > 0.3 && row % 2 === 0) {
            setCell2(channel, row, { note: hihat, instrument });
            notesWritten++;
          } else if (density > 0.7) {
            setCell2(channel, row, { note: hihat, instrument });
            notesWritten++;
          }
        }
        break;
      }
      case "arpeggio": {
        const arpRate = algParams.rate ?? 2;
        const arpNotes = scaleNotes.filter((n) => {
          const interval = ((n - 1) % 12 - rootPc + 12) % 12;
          return chordTones.includes(interval);
        });
        if (arpNotes.length === 0) break;
        let arpIdx = 0;
        for (let row = 0; row < numRows; row++) {
          if (row % Math.max(1, Math.round(4 / arpRate)) === 0) {
            setCell2(channel, row, { note: arpNotes[arpIdx % arpNotes.length], instrument });
            arpIdx++;
            notesWritten++;
          }
        }
        break;
      }
      case "chord": {
        const rowsPerBeat = algParams.rowsPerBeat ?? 4;
        const chordNotes = scaleNotes.filter((n) => {
          const interval = ((n - 1) % 12 - rootPc + 12) % 12;
          return chordTones.includes(interval);
        }).slice(0, 4);
        for (let row = 0; row < numRows; row += rowsPerBeat) {
          if (chordNotes.length > 0) {
            setCell2(channel, row, { note: chordNotes[0], instrument });
            notesWritten++;
          }
        }
        break;
      }
      case "melody": {
        const rhythm = euclideanRhythm(numRows, Math.round(numRows * density));
        let currentIdx = Math.floor(scaleNotes.length / 2);
        for (let row = 0; row < numRows; row++) {
          if (rhythm[row]) {
            const note = scaleNotes[currentIdx];
            setCell2(channel, row, { note, instrument });
            notesWritten++;
            const step = Math.floor(Math.random() * 3) + 1;
            currentIdx += Math.random() < 0.5 ? step : -step;
            currentIdx = Math.max(0, Math.min(scaleNotes.length - 1, currentIdx));
          }
        }
        break;
      }
      case "fill":
      case "euclidean": {
        const steps = algParams.steps ?? numRows;
        const pulses = algParams.pulses ?? Math.round(steps * density);
        const rhythm = euclideanRhythm(steps, pulses);
        for (let row = 0; row < Math.min(numRows, steps); row++) {
          if (rhythm[row]) {
            const note = pickScaleNote(scaleNotes, rootPc, chordTones, 0.5);
            setCell2(channel, row, { note, instrument });
            notesWritten++;
          }
        }
        break;
      }
      default:
        return { error: `Unknown generator type: ${type}` };
    }
    return { ok: true, notesWritten, type, channel, patternIndex, key: Object.keys(NOTE_NAMES).find((k) => NOTE_NAMES[k] === rootPc) || "C", scale: scaleParam };
  } catch (e) {
    return { error: `generatePattern failed: ${e.message}` };
  }
}
function transformPattern(params) {
  var _a, _b, _c, _d;
  try {
    const patternIndex = params.patternIndex ?? 0;
    const channel = params.channel ?? 0;
    const operation = params.operation || "reverse";
    const transformParams = params.params || {};
    const { patterns } = useTrackerStore.getState();
    const pattern = patterns[patternIndex];
    if (!pattern) return { error: `Pattern ${patternIndex} not found` };
    if (channel >= pattern.channels.length) return { error: `Channel ${channel} out of range` };
    const cells = pattern.channels[channel].rows;
    const setCell2 = useTrackerStore.getState().setCell;
    let cellsModified = 0;
    switch (operation) {
      case "reverse": {
        const reversed = reverseNotes(cells);
        for (let row = 0; row < reversed.length; row++) {
          if (reversed[row].note !== cells[row].note) {
            setCell2(channel, row, { note: reversed[row].note });
            cellsModified++;
          }
        }
        break;
      }
      case "rotate": {
        const amount = transformParams.amount ?? 4;
        const rotated = rotateCells(cells, amount);
        for (let row = 0; row < rotated.length; row++) {
          if (rotated[row].note !== cells[row].note || rotated[row].instrument !== cells[row].instrument) {
            setCell2(channel, row, {
              note: rotated[row].note,
              instrument: rotated[row].instrument,
              volume: rotated[row].volume
            });
            cellsModified++;
          }
        }
        break;
      }
      case "invert": {
        const notes = cells.filter((c) => c.note >= 1 && c.note <= 96).map((c) => c.note);
        const pivot = transformParams.pivot ?? (notes.length > 0 ? Math.round(notes.reduce((s, n) => s + n, 0) / notes.length) : 48);
        const inverted = invertNotes(cells, pivot);
        for (let row = 0; row < inverted.length; row++) {
          if (inverted[row].note !== cells[row].note) {
            setCell2(channel, row, { note: inverted[row].note });
            cellsModified++;
          }
        }
        break;
      }
      case "transpose": {
        const semitones = transformParams.semitones ?? 0;
        for (let row = 0; row < cells.length; row++) {
          const cell = cells[row];
          if (cell.note >= 1 && cell.note <= 96) {
            const newNote = Math.max(1, Math.min(96, cell.note + semitones));
            if (newNote !== cell.note) {
              setCell2(channel, row, { note: newNote });
              cellsModified++;
            }
          }
        }
        break;
      }
      case "retrograde": {
        const noteValues = cells.filter((c) => c.note >= 1 && c.note <= 96).map((c) => c.note);
        noteValues.reverse();
        let idx = 0;
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            if (noteValues[idx] !== cells[row].note) {
              setCell2(channel, row, { note: noteValues[idx] });
              cellsModified++;
            }
            idx++;
          }
        }
        break;
      }
      case "augment": {
        const noteRows = [];
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            noteRows.push({ row, note: cells[row].note, instrument: cells[row].instrument });
          }
        }
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            setCell2(channel, row, { note: 0, instrument: 0 });
            cellsModified++;
          }
        }
        for (let i = 0; i < noteRows.length; i++) {
          const newRow = i * 2 * (((_a = noteRows[1]) == null ? void 0 : _a.row) - ((_b = noteRows[0]) == null ? void 0 : _b.row) || 1);
          if (newRow < cells.length) {
            setCell2(channel, newRow, { note: noteRows[i].note, instrument: noteRows[i].instrument });
          }
        }
        break;
      }
      case "diminish": {
        const noteRows2 = [];
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            noteRows2.push({ row, note: cells[row].note, instrument: cells[row].instrument });
          }
        }
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            setCell2(channel, row, { note: 0, instrument: 0 });
            cellsModified++;
          }
        }
        for (let i = 0; i < noteRows2.length; i++) {
          const newRow = Math.round(i * 0.5 * (((_c = noteRows2[1]) == null ? void 0 : _c.row) - ((_d = noteRows2[0]) == null ? void 0 : _d.row) || 2));
          if (newRow < cells.length) {
            setCell2(channel, newRow, { note: noteRows2[i].note, instrument: noteRows2[i].instrument });
          }
        }
        break;
      }
      case "humanize": {
        const amount = transformParams.amount ?? 0.2;
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96 && cells[row].volume > 0) {
            const variation = 1 + (Math.random() * 2 - 1) * amount;
            const newVol = Math.max(1, Math.min(255, Math.round(cells[row].volume * variation)));
            if (newVol !== cells[row].volume) {
              setCell2(channel, row, { volume: newVol });
              cellsModified++;
            }
          }
        }
        break;
      }
      default:
        return { error: `Unknown transform: ${operation}` };
    }
    return { ok: true, cellsModified, operation, channel, patternIndex };
  } catch (e) {
    return { error: `transformPattern failed: ${e.message}` };
  }
}
async function getActions() {
  return __vitePreload(() => import("./DJActions-Ap2A5JjP.js").then((n) => n.a7), true ? __vite__mapDeps([0,1,2,3,4,5,6,7,8]) : void 0);
}
function getDJState() {
  const s = useDJStore.getState();
  return {
    decks: {
      A: deckSnapshot(s.decks.A),
      B: deckSnapshot(s.decks.B)
    },
    crossfaderPosition: s.crossfaderPosition,
    crossfaderCurve: s.crossfaderCurve,
    masterVolume: s.masterVolume,
    autoDJEnabled: s.autoDJEnabled,
    autoDJStatus: s.autoDJStatus,
    autoDJCurrentTrackIndex: s.autoDJCurrentTrackIndex,
    autoDJNextTrackIndex: s.autoDJNextTrackIndex
  };
}
function deckSnapshot(d) {
  return {
    isPlaying: d.isPlaying,
    fileName: d.fileName,
    trackName: d.trackName,
    detectedBPM: d.detectedBPM,
    effectiveBPM: d.effectiveBPM,
    elapsedMs: d.elapsedMs,
    durationMs: d.durationMs,
    audioPosition: d.audioPosition,
    volume: d.volume,
    eqLow: d.eqLow,
    eqMid: d.eqMid,
    eqHigh: d.eqHigh,
    eqLowKill: d.eqLowKill,
    eqMidKill: d.eqMidKill,
    eqHighKill: d.eqHighKill,
    filterPosition: d.filterPosition,
    pitchOffset: d.pitchOffset,
    keyLockEnabled: d.keyLockEnabled,
    playbackMode: d.playbackMode,
    musicalKey: d.musicalKey
  };
}
function getDJPlaylistState() {
  const s = useDJPlaylistStore.getState();
  const active = s.playlists.find((p) => p.id === s.activePlaylistId);
  return {
    activePlaylistId: s.activePlaylistId,
    playlistName: (active == null ? void 0 : active.name) ?? null,
    trackCount: (active == null ? void 0 : active.tracks.length) ?? 0
  };
}
async function djTogglePlay(params) {
  const deckId = params.deckId || "A";
  const actions = await getActions();
  await actions.togglePlay(deckId);
  return { ok: true };
}
async function djStop(params) {
  const deckId = params.deckId || "A";
  const actions = await getActions();
  actions.stopDeck(deckId);
  return { ok: true };
}
async function djCue(params) {
  const deckId = params.deckId || "A";
  const position = params.position ?? 0;
  const actions = await getActions();
  actions.cueDeck(deckId, position);
  return { ok: true };
}
async function djSync(params) {
  const deckId = params.deckId || "A";
  const actions = await getActions();
  actions.syncDeckBPM(deckId);
  return { ok: true };
}
async function djCrossfader(params) {
  const position = params.position;
  const actions = await getActions();
  actions.setCrossfader(position);
  return { ok: true };
}
async function djCrossfaderCurve(params) {
  const curve = params.curve;
  const actions = await getActions();
  actions.setCrossfaderCurve(curve);
  return { ok: true };
}
async function djEQ(params) {
  const deckId = params.deckId || "A";
  const band = params.band;
  const dB = params.dB;
  const actions = await getActions();
  actions.setDeckEQ(deckId, band, dB);
  return { ok: true };
}
async function djEQKill(params) {
  const deckId = params.deckId || "A";
  const band = params.band;
  const kill = params.kill;
  const actions = await getActions();
  actions.setDeckEQKill(deckId, band, kill);
  return { ok: true };
}
async function djFilter(params) {
  const deckId = params.deckId || "A";
  const position = params.position;
  const actions = await getActions();
  actions.setDeckFilter(deckId, position);
  return { ok: true };
}
async function djVolume(params) {
  const deckId = params.deckId || "A";
  const volume = params.volume;
  const actions = await getActions();
  actions.setDeckVolume(deckId, volume);
  return { ok: true };
}
async function djMasterVolume(params) {
  const volume = params.volume;
  const actions = await getActions();
  actions.setMasterVolume(volume);
  return { ok: true };
}
async function djPitch(params) {
  const deckId = params.deckId || "A";
  const semitones = params.semitones;
  const actions = await getActions();
  actions.setDeckPitch(deckId, semitones);
  return { ok: true };
}
async function djKeyLock(params) {
  const deckId = params.deckId || "A";
  const enabled = params.enabled;
  const actions = await getActions();
  actions.setDeckKeyLock(deckId, enabled);
  return { ok: true };
}
async function djNudge(params) {
  const deckId = params.deckId || "A";
  const offset = params.offset ?? 1;
  const actions = await getActions();
  actions.nudgeDeck(deckId, offset);
  return { ok: true };
}
async function djLoop(params) {
  const deckId = params.deckId || "A";
  const size = params.size ?? 4;
  const actions = await getActions();
  actions.setDeckLineLoop(deckId, size);
  return { ok: true };
}
async function djLoopClear(params) {
  const deckId = params.deckId || "A";
  const actions = await getActions();
  actions.clearDeckLineLoop(deckId);
  return { ok: true };
}
async function djAutoDJEnable(params) {
  const startIndex = params.startIndex;
  const actions = await getActions();
  await actions.enableAutoDJ(startIndex);
  return { ok: true };
}
async function djAutoDJDisable() {
  const actions = await getActions();
  actions.disableAutoDJ();
  return { ok: true };
}
async function djAutoDJSkip() {
  const actions = await getActions();
  await actions.skipAutoDJ();
  return { ok: true };
}
async function djDuck() {
  var _a;
  const { getDJEngineIfActive } = await __vitePreload(async () => {
    const { getDJEngineIfActive: getDJEngineIfActive2 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
    return { getDJEngineIfActive: getDJEngineIfActive2 };
  }, true ? __vite__mapDeps([1,2,3,4,5,6,7]) : void 0);
  (_a = getDJEngineIfActive()) == null ? void 0 : _a.mixer.duck();
  return { ok: true };
}
async function djUnduck() {
  var _a;
  const { getDJEngineIfActive } = await __vitePreload(async () => {
    const { getDJEngineIfActive: getDJEngineIfActive2 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
    return { getDJEngineIfActive: getDJEngineIfActive2 };
  }, true ? __vite__mapDeps([1,2,3,4,5,6,7]) : void 0);
  (_a = getDJEngineIfActive()) == null ? void 0 : _a.mixer.unduck();
  return { ok: true };
}
const WS_URL = "ws://localhost:4003";
const INITIAL_BACKOFF_MS = 2e3;
const MAX_BACKOFF_MS = 3e4;
const handlers = {
  // ─── Read ────────────────────────────────────────────────────────────────────
  get_song_info: getSongInfo,
  get_full_state: getFullState,
  get_project_metadata: getProjectMetadata,
  get_pattern: getPattern,
  get_pattern_list: getPatternList,
  get_pattern_order: getPatternOrder,
  get_cell: getCell,
  get_channel_column: getChannelColumn,
  search_pattern: searchPattern,
  get_pattern_stats: getPatternStats,
  diff_patterns: diffPatterns,
  get_instruments_list: getInstrumentsList,
  get_instrument: getInstrument,
  get_current_instrument: getCurrentInstrument,
  get_playback_state: getPlaybackState,
  get_cursor: getCursor,
  get_selection: getSelection,
  get_editor_state: getEditorState,
  get_mixer_state: getMixerState,
  get_channel_state: getChannelState,
  get_ui_state: getUIState,
  get_history_state: getHistoryState,
  get_oscilloscope_info: getOscilloscopeInfo,
  get_audio_state: getAudioState,
  get_synth_errors: getSynthErrors,
  get_format_state: getFormatState,
  get_midi_state: getMIDIState,
  get_clipboard_state: getClipboardState,
  get_command_list: getCommandList,
  render_pattern_text: renderPatternText,
  validate_pattern: validatePattern,
  // ─── Write: Cells ────────────────────────────────────────────────────────────
  set_cell: setCell,
  set_cells: setCells,
  clear_cell: clearCell,
  clear_pattern: clearPattern,
  clear_channel: clearChannel,
  fill_range: fillRange,
  write_note_sequence: writeNoteSequence,
  // ─── Write: Pattern Management ───────────────────────────────────────────────
  add_pattern: addPattern,
  duplicate_pattern: duplicatePattern,
  resize_pattern: resizePattern,
  // ─── Write: Pattern Order ────────────────────────────────────────────────────
  set_pattern_order: setPatternOrder,
  add_to_order: addToOrder,
  remove_from_order: removeFromOrder,
  // ─── Write: Row/Channel ──────────────────────────────────────────────────────
  insert_row: insertRow,
  delete_row: deleteRow,
  swap_channels: swapChannels,
  // ─── Write: Transport ────────────────────────────────────────────────────────
  set_bpm: setBpm,
  set_speed: setSpeed,
  play: () => play(),
  stop: () => stop(),
  pause: () => pause(),
  set_swing: setSwing,
  set_global_pitch: setGlobalPitch,
  toggle_metronome: () => toggleMetronome(),
  set_looping: setLooping,
  seek_to: seekTo,
  // ─── Write: Cursor & Selection ───────────────────────────────────────────────
  move_cursor: moveCursor,
  select_range: selectRange,
  select_all: () => selectAll(),
  clear_selection: () => clearSelection(),
  // ─── Write: Transforms ──────────────────────────────────────────────────────
  transpose_selection: transposeSelection,
  interpolate_selection: interpolateSelection,
  humanize_selection: humanizeSelection,
  scale_volume: scaleVolume,
  fade_volume: fadeVolume,
  // ─── Write: Mixer ────────────────────────────────────────────────────────────
  set_master_volume: setMasterVolume,
  set_master_mute: setMasterMute,
  set_channel_volume: setChannelVolume,
  set_channel_pan: setChannelPan,
  set_channel_mute: setChannelMute,
  set_channel_solo: setChannelSolo,
  solo_channel: soloChannel,
  mute_all_channels: () => muteAllChannels(),
  unmute_all_channels: () => unmuteAllChannels(),
  // ─── Write: Editor ──────────────────────────────────────────────────────────
  set_octave: setOctave,
  set_edit_step: setEditStep,
  toggle_record_mode: () => toggleRecordMode(),
  set_follow_playback: setFollowPlayback,
  // ─── Write: UI ──────────────────────────────────────────────────────────────
  set_active_view: setActiveView,
  set_status_message: setStatusMessage,
  set_tracker_zoom: setTrackerZoom,
  // ─── Write: Instruments ──────────────────────────────────────────────────────
  select_instrument: selectInstrument,
  create_instrument: createInstrument,
  update_instrument: updateInstrument,
  delete_instrument: deleteInstrument,
  clone_instrument: cloneInstrument,
  // ─── Write: Project ─────────────────────────────────────────────────────────
  set_project_metadata: setProjectMetadata,
  // ─── Write: History ─────────────────────────────────────────────────────────
  undo: () => undo(),
  redo: () => redo(),
  // ─── Write: Clipboard ────────────────────────────────────────────────────────
  copy_selection: () => copySelection(),
  cut_selection: () => cutSelection(),
  paste: pasteClipboard,
  // ─── Write: Error Management ─────────────────────────────────────────────────
  dismiss_errors: () => dismissErrors(),
  // ─── Write: Editor Config ───────────────────────────────────────────────────
  set_column_visibility: setColumnVisibility,
  toggle_bookmark: toggleBookmark,
  // ─── Write: Commands ────────────────────────────────────────────────────────
  execute_command: executeCommand,
  // ─── Read: Sample & Synth ──────────────────────────────────────────────────
  get_sample_info: getSampleInfo,
  get_sample_waveform: getSampleWaveform,
  get_synth_config: getSynthConfig,
  get_loaded_synths: getLoadedSynths,
  // ─── Read: Audio Analysis ─────────────────────────────────────────────────
  get_audio_analysis: getAudioAnalysis,
  get_audio_context_info: getAudioContextInfo,
  get_voice_state: getVoiceState,
  get_instrument_level: getInstrumentLevel,
  // ─── Write: Synth Control ─────────────────────────────────────────────────
  set_synth_param: setSynthParam,
  trigger_note: triggerNote,
  release_note: releaseNote,
  release_all_notes: () => releaseAllNotes(),
  update_synth_config: updateSynthConfig,
  // ─── Write: Master Effects ────────────────────────────────────────────────
  add_master_effect: addMasterEffect,
  update_master_effect: updateMasterEffect,
  remove_master_effect: removeMasterEffect,
  toggle_master_effect: toggleMasterEffect,
  // ─── Write: Bus Gains ─────────────────────────────────────────────────────
  set_sample_bus_gain: setSampleBusGain,
  set_synth_bus_gain: setSynthBusGain,
  // ─── File Loading & Audio Measurement ───────────────────────────────────
  load_file: loadFile,
  test_tone: testTone,
  get_audio_level: getAudioLevel,
  wait_for_audio: waitForAudio,
  // ─── Analysis & Composition ─────────────────────────────────────────────
  analyze_song: analyzeSongHandler,
  generate_pattern: generatePattern,
  transform_pattern: transformPattern,
  // ─── Synth Programming ──────────────────────────────────────────────────────
  analyze_instrument_spectrum: analyzeInstrumentSpectrum,
  sweep_parameter: sweepParameter,
  // ─── Live Performance ─────────────────────────────────────────────────────
  start_monitoring: startMonitoring,
  get_monitoring_data: getMonitoringData,
  stop_monitoring: stopMonitoring,
  auto_mix: autoMix,
  set_auto_effect: setAutoEffect,
  cancel_auto_effect: cancelAutoEffect,
  // ─── Modal Control ────────────────────────────────────────────────────────
  dismiss_modal: dismissModal,
  get_modal_state: getModalState,
  // ─── Format Regression Testing ──────────────────────────────────────────
  run_format_test: runFormatTest,
  run_regression_suite: runRegressionSuite,
  run_synth_tests: runSynthTests,
  // ─── Export Tools ───────────────────────────────────────────────────────
  export_wav: exportWav,
  export_pattern_text: exportPatternText,
  export_midi: exportMidi,
  export_mod: exportMod,
  export_native: exportNative,
  // ─── Console Capture ────────────────────────────────────────────────────
  get_console_errors: () => getConsoleErrors(),
  clear_console_errors: () => clearConsoleErrors(),
  evaluate_script: evaluateScript,
  // ─── DJ Remote Control ─────────────────────────────────────────────────
  dj_get_state: getDJState,
  dj_get_playlist_state: getDJPlaylistState,
  dj_toggle_play: djTogglePlay,
  dj_stop: djStop,
  dj_cue: djCue,
  dj_sync: djSync,
  dj_crossfader: djCrossfader,
  dj_crossfader_curve: djCrossfaderCurve,
  dj_eq: djEQ,
  dj_eq_kill: djEQKill,
  dj_filter: djFilter,
  dj_volume: djVolume,
  dj_master_volume: djMasterVolume,
  dj_pitch: djPitch,
  dj_key_lock: djKeyLock,
  dj_nudge: djNudge,
  dj_loop: djLoop,
  dj_loop_clear: djLoopClear,
  dj_auto_dj_enable: djAutoDJEnable,
  dj_auto_dj_disable: djAutoDJDisable,
  dj_auto_dj_skip: djAutoDJSkip,
  dj_duck: djDuck,
  dj_unduck: djUnduck
};
let ws = null;
let reconnectTimer = null;
let backoffMs = INITIAL_BACKOFF_MS;
let disposed = false;
let connectAttempts = 0;
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
async function handleMessage(data) {
  let request;
  try {
    request = JSON.parse(data);
  } catch {
    return;
  }
  if (request.type !== "call") return;
  const handler = handlers[request.method];
  if (!handler) {
    send({ id: request.id, type: "error", error: `Unknown method: ${request.method}` });
    return;
  }
  try {
    const result = await handler(request.params ?? {});
    send({ id: request.id, type: "result", data: result });
  } catch (e) {
    send({ id: request.id, type: "error", error: e.message });
  }
}
function connect() {
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  let receivedMessage = false;
  ws.onopen = () => {
    if (connectAttempts === 0) {
      console.log("[mcp-bridge] Connected to MCP relay");
    }
  };
  ws.onmessage = (event) => {
    if (!receivedMessage) {
      receivedMessage = true;
      backoffMs = INITIAL_BACKOFF_MS;
      connectAttempts = 0;
      console.log("[mcp-bridge] MCP server active");
    }
    handleMessage(typeof event.data === "string" ? event.data : event.data.toString());
  };
  ws.onclose = () => {
    connectAttempts++;
    if (connectAttempts === 1) {
      console.log("[mcp-bridge] MCP relay not available, will retry in background");
    }
    ws = null;
    if (!receivedMessage) {
      scheduleReconnect();
    } else {
      scheduleReconnect();
    }
  };
  ws.onerror = () => {
    ws == null ? void 0 : ws.close();
  };
}
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }, backoffMs);
}
function initMCPBridge() {
  if (ws || disposed) return;
  connect();
}
export {
  initMCPBridge
};
