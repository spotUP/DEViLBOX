import { aQ as stringNoteToXM, aR as xmNoteToString } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const TD3_BASE_OCTAVE = 2;
const TD3_MAX_OCTAVE_OFFSET = 2;
const NOTE_TO_SEMITONE = {
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
const SEMITONE_TO_NOTE = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
];
function parseTrackerNote(note) {
  if (!note || note === "===" || note === "---") {
    return null;
  }
  const match = note.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) return null;
  const [, noteLetter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteName = noteLetter + (sharp || "");
  const semitone = NOTE_TO_SEMITONE[noteName];
  if (semitone === void 0) return null;
  return { semitone, octave };
}
function trackerNoteToTD3(trackerNote, baseOctave = TD3_BASE_OCTAVE) {
  if (!trackerNote) return null;
  const parsed = parseTrackerNote(trackerNote);
  if (!parsed) return null;
  const { semitone, octave } = parsed;
  let octaveOffset = octave - baseOctave;
  let upperC = false;
  if (semitone === 0 && octaveOffset === TD3_MAX_OCTAVE_OFFSET + 1) {
    upperC = true;
    octaveOffset = TD3_MAX_OCTAVE_OFFSET;
  }
  if (octaveOffset < 0 || octaveOffset > TD3_MAX_OCTAVE_OFFSET) {
    return null;
  }
  return {
    value: semitone,
    octave: octaveOffset,
    upperC
  };
}
function td3NoteToTracker(td3Note, baseOctave = TD3_BASE_OCTAVE) {
  let octave = baseOctave + td3Note.octave;
  if (td3Note.upperC && td3Note.value === 0) {
    octave += 1;
  }
  const noteName = SEMITONE_TO_NOTE[td3Note.value];
  if (noteName.includes("#")) {
    return `${noteName}${octave}`;
  }
  return `${noteName}-${octave}`;
}
function trackerCellToTD3Step(cell, baseOctave = TD3_BASE_OCTAVE) {
  const isRest = cell.note === 0 || cell.note === 97;
  const noteStr = !isRest ? xmNoteToString(cell.note) : "";
  const step = {
    note: isRest ? null : trackerNoteToTD3(noteStr, baseOctave),
    accent: cell.flag1 === 1 || cell.flag2 === 1,
    slide: cell.flag1 === 2 || cell.flag2 === 2,
    tie: false
    // Note: Tie detection is handled in trackerPatternToTD3Steps which has access to previous cells
  };
  return step;
}
function td3StepToTrackerCell(step, baseOctave = TD3_BASE_OCTAVE) {
  const noteStr = step.note ? td3NoteToTracker(step.note, baseOctave) : "";
  const note = noteStr ? stringNoteToXM(noteStr) : 0;
  const cell = {
    note,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
    flag1: step.accent ? 1 : void 0,
    flag2: step.slide ? 2 : void 0
  };
  return cell;
}
function trackerPatternToTD3Steps(cells, baseOctave = TD3_BASE_OCTAVE) {
  const warnings = [];
  const steps = [];
  const maxSteps = 16;
  if (cells.length > maxSteps) {
    warnings.push(`Pattern has ${cells.length} rows, only first ${maxSteps} will be exported`);
  }
  for (let i = 0; i < Math.min(cells.length, maxSteps); i++) {
    const cell = cells[i];
    const step = trackerCellToTD3Step(cell, baseOctave);
    if (cell.note && cell.note !== 0 && cell.note !== 97 && !step.note) {
      const noteStr = xmNoteToString(cell.note);
      warnings.push(`Row ${i + 1}: Note ${noteStr} is out of TD-3 range (C2-C5)`);
    }
    if (i > 0 && step.note && cells[i - 1]) {
      const prevCell = cells[i - 1];
      if (prevCell.note && prevCell.note !== 0 && prevCell.note !== 97) {
        if (prevCell.note === cell.note) {
          step.tie = true;
        }
      }
    }
    steps.push(step);
  }
  while (steps.length < maxSteps) {
    steps.push({
      note: null,
      accent: false,
      slide: false,
      tie: false
    });
  }
  return { steps, warnings };
}
function td3StepsToTrackerCells(steps, baseOctave = TD3_BASE_OCTAVE) {
  return steps.map((step) => td3StepToTrackerCell(step, baseOctave));
}
function suggestBaseOctave(cells) {
  const octaveCounts = /* @__PURE__ */ new Map();
  for (const cell of cells) {
    if (cell.note && cell.note !== 0 && cell.note !== 97) {
      const noteStr = xmNoteToString(cell.note);
      const parsed = parseTrackerNote(noteStr);
      if (parsed) {
        const count = octaveCounts.get(parsed.octave) || 0;
        octaveCounts.set(parsed.octave, count + 1);
      }
    }
  }
  if (octaveCounts.size === 0) return TD3_BASE_OCTAVE;
  let maxCount = 0;
  let bestOctave = TD3_BASE_OCTAVE;
  octaveCounts.forEach((count, octave) => {
    if (count > maxCount) {
      maxCount = count;
      bestOctave = octave;
    }
  });
  return Math.max(1, Math.min(4, bestOctave));
}
function validatePatternForTD3Export(cells, baseOctave = TD3_BASE_OCTAVE) {
  const errors = [];
  const warnings = [];
  if (cells.length === 0) {
    errors.push("Pattern is empty");
    return { valid: false, errors, warnings };
  }
  if (cells.length > 16) {
    warnings.push(`Pattern has ${cells.length} rows, only first 16 will be exported`);
  }
  let notesOutOfRange = 0;
  for (let i = 0; i < Math.min(cells.length, 16); i++) {
    const cell = cells[i];
    if (cell.note && cell.note !== 0 && cell.note !== 97) {
      const noteStr = xmNoteToString(cell.note);
      const td3Note = trackerNoteToTD3(noteStr, baseOctave);
      if (!td3Note) {
        notesOutOfRange++;
      }
    }
  }
  if (notesOutOfRange > 0) {
    warnings.push(`${notesOutOfRange} note(s) are out of TD-3 range and will be skipped`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
export {
  parseTrackerNote,
  suggestBaseOctave,
  td3NoteToTracker,
  td3StepToTrackerCell,
  td3StepsToTrackerCells,
  trackerCellToTD3Step,
  trackerNoteToTD3,
  trackerPatternToTD3Steps,
  validatePatternForTD3Export
};
