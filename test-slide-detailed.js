/**
 * Detailed Slide Analysis Test
 * Shows exactly how slide flags are interpreted in both systems
 */

const testPattern = [
  { step: 0, key: 6, octave: 0, gate: true, accent: false, slide: false },
  { step: 1, key: 0, octave: 0, gate: true, accent: false, slide: false },
  { step: 2, key: 6, octave: 0, gate: true, accent: false, slide: true },  // <-- slide flag ON
  { step: 3, key: 11, octave: 1, gate: false, accent: false, slide: false }, // REST
  { step: 4, key: 11, octave: 1, gate: true, accent: true, slide: true },   // <-- slide flag ON
  { step: 5, key: 0, octave: 0, gate: true, accent: false, slide: false },
  { step: 6, key: 9, octave: 1, gate: true, accent: false, slide: false },
  { step: 7, key: 6, octave: 1, gate: true, accent: true, slide: true },    // <-- slide flag ON
  { step: 8, key: 6, octave: 0, gate: true, accent: false, slide: true },   // <-- slide flag ON
  { step: 9, key: 6, octave: 1, gate: true, accent: false, slide: false },
  { step: 10, key: 10, octave: 1, gate: false, accent: false, slide: false }, // REST
  { step: 11, key: 6, octave: 0, gate: true, accent: true, slide: true },   // <-- slide flag ON
  { step: 12, key: 6, octave: 1, gate: true, accent: true, slide: false },
  { step: 13, key: 6, octave: 0, gate: true, accent: false, slide: true },  // <-- slide flag ON
  { step: 14, key: 6, octave: 1, gate: true, accent: false, slide: false },
  { step: 15, key: 6, octave: 0, gate: false, accent: false, slide: false }, // REST
];

const rootNote = 36; // C2 in MIDI
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiToName = m => noteNames[m % 12] + (Math.floor(m / 12) - 1);
const keyOctaveToMidi = (k, o) => rootNote + k + (o * 12);

console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    DETAILED SLIDE FLAG ANALYSIS                            ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('TB-303 Slide Semantics:');
console.log('  - Slide flag on step N means "slide FROM step N TO step N+1"');
console.log('  - The PREVIOUS step\'s slide flag determines if current note slides');
console.log('  - REST (gate=false) ALWAYS breaks the chain and releases the note');
console.log('');

console.log('Step | Gate | Slide | Note  | Prev.Slide | DB303 Action              | DEViLBOX TrackerCell');
console.log('-----|------|-------|-------|------------|---------------------------|---------------------');

let db303PrevSlide = false;
let dvPrevSlide = false;
let db303CurrentNote = -1;
let dvCurrentNote = -1;

for (let i = 0; i < testPattern.length; i++) {
  const step = testPattern[i];
  const prevStep = i > 0 ? testPattern[i - 1] : null;
  const midi = keyOctaveToMidi(step.key, step.octave);
  const noteName = midiToName(midi).padEnd(5);
  
  // What DB303 does (reference)
  const db303PrevHadSlide = prevStep && prevStep.slide && prevStep.gate;
  let db303Action = '';
  
  if (!step.gate) {
    db303Action = db303CurrentNote >= 0 ? `noteOff(${midiToName(db303CurrentNote)})` : 'REST (silent)';
    db303CurrentNote = -1;
  } else if (db303PrevHadSlide && db303CurrentNote >= 0) {
    db303Action = `SLIDE → ${midiToName(midi)}`;
    db303CurrentNote = midi;
  } else {
    db303Action = db303CurrentNote >= 0 
      ? `noteOff(${midiToName(db303CurrentNote)}) + noteOn(${midiToName(midi)})`
      : `noteOn(${midiToName(midi)})`;
    db303CurrentNote = midi;
  }
  
  // What DEViLBOX TrackerReplayer should produce
  // TrackerCell format: note value, flag2 = 2 means slide
  let trackerNote = 0;
  let trackerFlag2 = 0;
  
  if (step.gate) {
    // XM note = MIDI - 11 (MIDI 36 = XM 25 = C-2)
    trackerNote = midi - 11;
    trackerFlag2 = step.slide ? 2 : 0;
  } else {
    // REST: insert note-off (97)
    trackerNote = 97;
  }
  
  // What TrackerReplayer does with this
  let dvAction = '';
  const hasNote = trackerNote > 0 && trackerNote !== 97;
  const slideActive = dvPrevSlide && hasNote;
  
  if (trackerNote === 97) {
    dvAction = dvCurrentNote >= 0 ? `noteOff(${midiToName(dvCurrentNote)})` : 'REST (silent)';
    dvCurrentNote = -1;
    dvPrevSlide = false;
  } else if (slideActive) {
    dvAction = `SLIDE → ${midiToName(midi)}`;
    dvCurrentNote = midi;
    dvPrevSlide = step.slide;
  } else if (hasNote) {
    dvAction = dvCurrentNote >= 0
      ? `noteOff(${midiToName(dvCurrentNote)}) + noteOn(${midiToName(midi)})`
      : `noteOn(${midiToName(midi)})`;
    dvCurrentNote = midi;
    dvPrevSlide = step.slide;
  }
  
  // Format TrackerCell
  const cellStr = trackerNote === 97 
    ? 'note=97 (OFF)' 
    : trackerNote === 0 
      ? 'note=0 (empty)'
      : `note=${trackerNote}, flag2=${trackerFlag2}`;
  
  const match = db303Action === dvAction ? '✓' : '❌';
  
  console.log(
    `${i.toString().padStart(4)} | ${step.gate ? 'ON ' : 'off'} | ${step.slide ? 'YES' : 'no '} | ${noteName} | ${db303PrevHadSlide ? 'YES' : 'no '} | ${db303Action.padEnd(25)} | ${cellStr} ${match}`
  );
  
  if (db303Action !== dvAction) {
    console.log(`     ⚠️  MISMATCH: DEViLBOX does: ${dvAction}`);
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    SLIDE FLAG STORAGE ANALYSIS                             ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Key insight: The slide flag is stored on the step that INITIATES the slide,');
console.log('but it affects the NEXT step. TrackerReplayer uses `previousSlideFlag`.');
console.log('');

// Show how TrackerReplayer reads the pattern
console.log('TrackerReplayer reads pattern row by row:');
console.log('');
for (let i = 0; i < testPattern.length; i++) {
  const step = testPattern[i];
  const midi = keyOctaveToMidi(step.key, step.octave);
  
  let trackerNote = step.gate ? (midi - 11) : 97;
  let flag2 = step.slide ? 2 : 0;
  
  const slideFlag = (flag2 === 2) ? 'slide=true' : 'slide=false';
  const noteStr = trackerNote === 97 ? '=== (OFF)' : midiToName(midi);
  
  console.log(`Row ${i.toString().padStart(2)}: note=${noteStr.padEnd(10)} ${slideFlag.padEnd(12)} → ch.previousSlideFlag set to ${step.slide}`);
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    CRITICAL SLIDE TRANSITIONS                              ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');
console.log('');

const criticalSteps = [
  { from: 2, to: 3, desc: 'Step 2 has slide=true, Step 3 is REST → should NOT slide, should release' },
  { from: 4, to: 5, desc: 'Step 4 has slide=true, Step 5 has gate → should SLIDE to Step 5' },
  { from: 7, to: 8, desc: 'Step 7 has slide=true, Step 8 has gate → should SLIDE to Step 8' },
  { from: 8, to: 9, desc: 'Step 8 has slide=true, Step 9 has gate → should SLIDE to Step 9' },
  { from: 11, to: 12, desc: 'Step 11 has slide=true, Step 12 has gate → should SLIDE to Step 12' },
  { from: 13, to: 14, desc: 'Step 13 has slide=true, Step 14 has gate → should SLIDE to Step 14' },
];

for (const { from, to, desc } of criticalSteps) {
  const fromStep = testPattern[from];
  const toStep = testPattern[to];
  const fromMidi = keyOctaveToMidi(fromStep.key, fromStep.octave);
  const toMidi = keyOctaveToMidi(toStep.key, toStep.octave);
  
  console.log(`Step ${from} → ${to}:`);
  console.log(`  ${desc}`);
  console.log(`  From: ${midiToName(fromMidi)} (slide=${fromStep.slide}, gate=${fromStep.gate})`);
  console.log(`  To:   ${midiToName(toMidi)} (slide=${toStep.slide}, gate=${toStep.gate})`);
  
  // DB303 behavior
  const shouldSlide = fromStep.slide && fromStep.gate && toStep.gate;
  console.log(`  DB303: ${shouldSlide ? 'SLIDE' : 'RETRIGGER'}`);
  console.log('');
}
