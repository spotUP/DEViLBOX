/**
 * EXTREME LOGGING TEST
 * Traces every single byte/value through the entire conversion and playback pipeline
 * Compares DEViLBOX vs DB303 at every step
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST PATTERN DATA (raw from DB303 XML)
// ═══════════════════════════════════════════════════════════════════════════════

const testPattern = [
  { step: 0, key: 6, octave: 0, gate: true, accent: false, slide: false },
  { step: 1, key: 0, octave: 0, gate: true, accent: false, slide: false },
  { step: 2, key: 6, octave: 0, gate: true, accent: false, slide: true },
  { step: 3, key: 11, octave: 1, gate: false, accent: false, slide: false },
  { step: 4, key: 11, octave: 1, gate: true, accent: true, slide: true },
  { step: 5, key: 0, octave: 0, gate: true, accent: false, slide: false },
  { step: 6, key: 9, octave: 1, gate: true, accent: false, slide: false },
  { step: 7, key: 6, octave: 1, gate: true, accent: true, slide: true },
  { step: 8, key: 6, octave: 0, gate: true, accent: false, slide: true },
  { step: 9, key: 6, octave: 1, gate: true, accent: false, slide: false },
  { step: 10, key: 10, octave: 1, gate: false, accent: false, slide: false },
  { step: 11, key: 6, octave: 0, gate: true, accent: true, slide: true },
  { step: 12, key: 6, octave: 1, gate: true, accent: true, slide: false },
  { step: 13, key: 6, octave: 0, gate: true, accent: false, slide: true },
  { step: 14, key: 6, octave: 1, gate: true, accent: false, slide: false },
  { step: 15, key: 6, octave: 0, gate: false, accent: false, slide: false },
];

const rootNote = 36; // C2 in MIDI (from XML <rootNote>36</rootNote>)

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  return `${noteNames[semitone]}${octave}`;
}

function xmToNoteName(xm) {
  if (xm === 0) return '...';
  if (xm === 97) return '===';
  const noteIndex = xm - 1;
  const octave = Math.floor(noteIndex / 12);
  const semitone = noteIndex % 12;
  return `${noteNames[semitone]}-${octave}`;
}

function keyOctaveToMidi(key, octave) {
  return rootNote + key + (octave * 12);
}

function midiToXm(midi) {
  // XM note = MIDI - 11 (MIDI 12 = XM 1 = C-0)
  return midi - 11;
}

function xmToMidi(xm) {
  // MIDI = XM + 11
  return xm + 11;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: RAW XML DATA ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                           PHASE 1: RAW XML DATA ANALYSIS                                     ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Root Note from XML: ${rootNote} (MIDI) = ${midiToNoteName(rootNote)}`);
console.log('');
console.log('Step | key | oct | gate  | acc   | slide | RAW MIDI CALC                   | MIDI | Note');
console.log('-----|-----|-----|-------|-------|-------|----------------------------------|------|------');

for (const step of testPattern) {
  const midiCalc = `${rootNote} + ${step.key} + (${step.octave} * 12)`;
  const midi = keyOctaveToMidi(step.key, step.octave);
  const noteName = midiToNoteName(midi);
  
  console.log(
    `${step.step.toString().padStart(4)} | ${step.key.toString().padStart(3)} | ${step.octave.toString().padStart(3)} | ${step.gate ? 'true ' : 'false'} | ${step.accent ? 'true ' : 'false'} | ${step.slide ? 'true ' : 'false'} | ${midiCalc.padEnd(32)} | ${midi.toString().padStart(4)} | ${noteName}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: MIDI TO XM CONVERSION (Db303PatternConverter)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PHASE 2: MIDI → XM CONVERSION                                         ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Formula: XM = MIDI - 11 (so MIDI 12 = XM 1 = C-0, MIDI 36 = XM 25 = C-2)');
console.log('');
console.log('Step | gate  | MIDI | XM Calc      | XM Note | XM Display | flag1 | flag2 | Action');
console.log('-----|-------|------|--------------|---------|------------|-------|-------|--------');

let lastGatedStep = -1;
const trackerCells = [];

for (const step of testPattern) {
  const midi = keyOctaveToMidi(step.key, step.octave);
  let xmNote = 0;
  let flag1 = 0;
  let flag2 = 0;
  let action = '';
  
  if (step.gate) {
    xmNote = midiToXm(midi);
    flag1 = step.accent ? 1 : 0;
    flag2 = step.slide ? 2 : 0;
    action = 'NOTE ON';
    lastGatedStep = step.step;
  } else {
    // REST - insert note-off if there was a previous gated step
    if (lastGatedStep >= 0) {
      xmNote = 97;
      action = 'NOTE OFF (REST)';
    } else {
      xmNote = 0;
      action = 'EMPTY';
    }
  }
  
  const xmCalc = step.gate ? `${midi} - 11 = ${xmNote}` : (xmNote === 97 ? '97 (OFF)' : '0 (empty)');
  const xmDisplay = xmToNoteName(xmNote);
  
  console.log(
    `${step.step.toString().padStart(4)} | ${step.gate ? 'true ' : 'false'} | ${midi.toString().padStart(4)} | ${xmCalc.padEnd(12)} | ${xmNote.toString().padStart(7)} | ${xmDisplay.padEnd(10)} | ${flag1.toString().padStart(5)} | ${flag2.toString().padStart(5)} | ${action}`
  );
  
  trackerCells.push({
    step: step.step,
    note: xmNote,
    flag1,
    flag2,
    originalMidi: midi,
    gate: step.gate,
    accent: step.accent,
    slide: step.slide
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: XM BACK TO MIDI (TrackerReplayer reads pattern)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PHASE 3: XM → MIDI (TrackerReplayer)                                  ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Formula: MIDI = XM + 11 (inverse of conversion)');
console.log('');
console.log('Step | XM Note | XM Display | MIDI Calc    | MIDI | Note  | slide (flag2=2) | accent (flag1=1)');
console.log('-----|---------|------------|--------------|------|-------|-----------------|------------------');

for (const cell of trackerCells) {
  let midiCalc = '';
  let midi = 0;
  let noteName = '';
  
  if (cell.note === 0) {
    midiCalc = 'N/A (empty)';
    noteName = '...';
  } else if (cell.note === 97) {
    midiCalc = 'N/A (note off)';
    noteName = '===';
  } else {
    midi = xmToMidi(cell.note);
    midiCalc = `${cell.note} + 11 = ${midi}`;
    noteName = midiToNoteName(midi);
  }
  
  const slideStr = (cell.flag2 === 2) ? 'YES (flag2=2)' : 'no';
  const accentStr = (cell.flag1 === 1) ? 'YES (flag1=1)' : 'no';
  
  console.log(
    `${cell.step.toString().padStart(4)} | ${cell.note.toString().padStart(7)} | ${xmToNoteName(cell.note).padEnd(10)} | ${midiCalc.padEnd(12)} | ${midi.toString().padStart(4)} | ${noteName.padEnd(5)} | ${slideStr.padEnd(15)} | ${accentStr}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4: SLIDE FLAG STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PHASE 4: SLIDE FLAG STATE MACHINE                                     ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('TB-303 Slide Rule: Slide flag on row N causes pitch to GLIDE from row N to row N+1');
console.log('TrackerReplayer: previousSlideFlag is read BEFORE processing current row');
console.log('');
console.log('Row  | prev.Slide | curr.Slide | hasNote | slideActive | Action              | Note');
console.log('-----|------------|------------|---------|-------------|---------------------|------');

let previousSlideFlag = false;
let currentNote = -1;

for (const cell of trackerCells) {
  const hasNote = cell.note > 0 && cell.note !== 97;
  const isNoteOff = cell.note === 97;
  const currSlide = cell.flag2 === 2;
  const slideActive = previousSlideFlag && hasNote;
  
  let action = '';
  let noteStr = '';
  
  if (isNoteOff) {
    action = 'RELEASE (note off)';
    noteStr = '===';
    currentNote = -1;
  } else if (!hasNote) {
    action = 'EMPTY';
    noteStr = '...';
  } else if (slideActive) {
    const midi = xmToMidi(cell.note);
    action = 'SLIDE (pitch glide)';
    noteStr = midiToNoteName(midi);
    currentNote = midi;
  } else {
    const midi = xmToMidi(cell.note);
    action = 'TRIGGER (retrigger)';
    noteStr = midiToNoteName(midi);
    currentNote = midi;
  }
  
  console.log(
    `${cell.step.toString().padStart(4)} | ${previousSlideFlag ? 'YES' : 'no '.padEnd(10)} | ${currSlide ? 'YES' : 'no '.padEnd(10)} | ${hasNote ? 'YES' : 'no '.padEnd(7)} | ${slideActive ? 'YES' : 'no '.padEnd(11)} | ${action.padEnd(19)} | ${noteStr}`
  );
  
  // Update previousSlideFlag for next iteration (just like TrackerReplayer does)
  if (hasNote) {
    previousSlideFlag = currSlide;
  } else if (isNoteOff) {
    previousSlideFlag = false; // Note-off clears slide flag
  }
  // If empty (note=0), keep previousSlideFlag unchanged (sustain case)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5: SYNTH CALLS (what ToneEngine.triggerNote receives)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PHASE 5: SYNTH CALLS (ToneEngine)                                     ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('TrackerReplayer calls: engine.triggerNote(id, noteName, duration, time, velocity, config, accent, slide, ...)');
console.log('DB303Synth receives: triggerAttack(note, time, velocity, accent, slide, hammer)');
console.log('');
console.log('Row  | Call Type     | Note Name | MIDI | accent | slide | Expected Synth Behavior');
console.log('-----|---------------|-----------|------|--------|-------|-------------------------');

previousSlideFlag = false;
currentNote = -1;

for (const cell of trackerCells) {
  const hasNote = cell.note > 0 && cell.note !== 97;
  const isNoteOff = cell.note === 97;
  const currSlide = cell.flag2 === 2;
  const accent = cell.flag1 === 1;
  const slideActive = previousSlideFlag && hasNote;
  
  let callType = '';
  let noteNameStr = '';
  let midiStr = '';
  let accentStr = '';
  let slideStr = '';
  let synthBehavior = '';
  
  if (isNoteOff) {
    callType = 'triggerRelease';
    noteNameStr = 'N/A';
    midiStr = '';
    accentStr = '';
    slideStr = '';
    synthBehavior = 'Release envelope, stop note';
  } else if (!hasNote) {
    callType = '(no call)';
    noteNameStr = '';
    midiStr = '';
    accentStr = '';
    slideStr = '';
    synthBehavior = 'Nothing happens';
  } else {
    callType = 'triggerAttack';
    const midi = xmToMidi(cell.note);
    noteNameStr = midiToNoteName(midi);
    midiStr = midi.toString();
    accentStr = accent ? 'true' : 'false';
    slideStr = slideActive ? 'true' : 'false';  // slideActive from PREVIOUS row!
    
    if (slideActive) {
      synthBehavior = 'Glide pitch (no retrigger)';
    } else {
      synthBehavior = 'New note attack (retrigger)';
    }
    if (accent) {
      synthBehavior += ' + ACCENT';
    }
  }
  
  console.log(
    `${cell.step.toString().padStart(4)} | ${callType.padEnd(13)} | ${noteNameStr.padEnd(9)} | ${midiStr.padEnd(4)} | ${accentStr.padEnd(6)} | ${slideStr.padEnd(5)} | ${synthBehavior}`
  );
  
  // Update state
  if (hasNote) {
    previousSlideFlag = currSlide;
    currentNote = xmToMidi(cell.note);
  } else if (isNoteOff) {
    previousSlideFlag = false;
    currentNote = -1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6: DB303 REFERENCE COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PHASE 6: DB303 REFERENCE COMPARISON                                   ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('DB303 sequencer: prevStep.slide && prevStep.gate && currStep.gate → SLIDE');
console.log('');
console.log('Row  | DEViLBOX slide param | DB303 would slide | Match?');
console.log('-----|----------------------|-------------------|--------');

previousSlideFlag = false;

for (let i = 0; i < testPattern.length; i++) {
  const step = testPattern[i];
  const prevStep = i > 0 ? testPattern[i - 1] : null;
  const cell = trackerCells[i];
  
  const hasNote = cell.note > 0 && cell.note !== 97;
  const currSlide = cell.flag2 === 2;
  
  // What DEViLBOX does
  const dvSlideActive = previousSlideFlag && hasNote;
  
  // What DB303 does
  const db303ShouldSlide = prevStep && prevStep.slide && prevStep.gate && step.gate;
  
  const match = (dvSlideActive === db303ShouldSlide) ? '✓' : '❌ MISMATCH!';
  
  console.log(
    `${i.toString().padStart(4)} | ${dvSlideActive ? 'true '.padEnd(20) : 'false'.padEnd(20)} | ${db303ShouldSlide ? 'true '.padEnd(17) : 'false'.padEnd(17)} | ${match}`
  );
  
  // Update DEViLBOX state
  if (hasNote) {
    previousSlideFlag = currSlide;
  } else if (cell.note === 97) {
    previousSlideFlag = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 7: COMPLETE EVENT SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PHASE 7: COMPLETE EVENT SEQUENCE                                      ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');

const events = [];
previousSlideFlag = false;
currentNote = -1;

for (const cell of trackerCells) {
  const hasNote = cell.note > 0 && cell.note !== 97;
  const isNoteOff = cell.note === 97;
  const currSlide = cell.flag2 === 2;
  const accent = cell.flag1 === 1;
  const slideActive = previousSlideFlag && hasNote;
  
  if (isNoteOff) {
    if (currentNote >= 0) {
      events.push({ row: cell.step, type: 'noteOff', midi: currentNote, note: midiToNoteName(currentNote) });
    }
    currentNote = -1;
    previousSlideFlag = false;
  } else if (hasNote) {
    const midi = xmToMidi(cell.note);
    
    if (slideActive) {
      events.push({ row: cell.step, type: 'slide', midi, note: midiToNoteName(midi), accent });
    } else {
      if (currentNote >= 0) {
        events.push({ row: cell.step, type: 'noteOff', midi: currentNote, note: midiToNoteName(currentNote) });
      }
      events.push({ row: cell.step, type: 'noteOn', midi, note: midiToNoteName(midi), accent });
    }
    
    currentNote = midi;
    previousSlideFlag = currSlide;
  }
}

console.log('Seq | Row | Event Type | MIDI | Note  | Accent');
console.log('----|-----|------------|------|-------|--------');

events.forEach((e, i) => {
  console.log(
    `${i.toString().padStart(3)} | ${e.row.toString().padStart(3)} | ${e.type.padEnd(10)} | ${e.midi.toString().padStart(4)} | ${e.note.padEnd(5)} | ${e.accent ? 'YES' : ''}`
  );
});

console.log('');
console.log(`Total events: ${events.length}`);
console.log(`  noteOn:  ${events.filter(e => e.type === 'noteOn').length}`);
console.log(`  noteOff: ${events.filter(e => e.type === 'noteOff').length}`);
console.log(`  slide:   ${events.filter(e => e.type === 'slide').length}`);
