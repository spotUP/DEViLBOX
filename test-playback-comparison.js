/**
 * Playback Comparison Test
 * Compares DEViLBOX TrackerReplayer logic vs DB303 Internal Sequencer logic
 */

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

const rootNote = 36;
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiToName = m => noteNames[m % 12] + (Math.floor(m / 12) - 1);
const keyOctaveToMidi = (k, o) => rootNote + k + (o * 12);

// Collect events for comparison
const devilboxEvents = [];
const db303Events = [];

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║     DEViLBOX TrackerReplayer (DB303-compatible behavior)       ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

let previousSlideFlag = false;
let currentNote = -1;

// First, simulate what the Db303PatternConverter produces:
// - gate=true: note value = MIDI + 1
// - gate=false: ALWAYS note = 97 (note-off) - REST breaks the chain!
// DB303 behavior: A rest ALWAYS releases the note, even if prev step had slide
const convertedPattern = testPattern.map((step, i) => {
  if (step.gate) {
    return { ...step, trackerNote: keyOctaveToMidi(step.key, step.octave) + 1 };
  } else {
    // REST always produces note-off in DB303
    return { ...step, trackerNote: 97 }; // Note-off
  }
});

// Now simulate TrackerReplayer behavior
for (const step of convertedPattern) {
  const midi = keyOctaveToMidi(step.key, step.octave);
  const noteValue = step.trackerNote;
  const hasNote = noteValue > 0 && noteValue !== 97;
  const slideActive = previousSlideFlag && hasNote;
  
  // Handle note-off (97) from imported pattern
  if (noteValue === 97) {
    console.log(`Step ${step.step.toString().padStart(2)}: REST`);
    devilboxEvents.push({ step: step.step, type: 'rest' });
    if (currentNote >= 0) {
      console.log(`         noteOff(${midiToName(currentNote)})`);
      devilboxEvents.push({ step: step.step, type: 'noteOff', midi: currentNote });
      currentNote = -1;
    }
    previousSlideFlag = false; // Note-off clears slide
  } else if (!hasNote) {
    // Empty row (value 0) - sustain through (slide case)
    console.log(`Step ${step.step.toString().padStart(2)}: (sustain)`);
    devilboxEvents.push({ step: step.step, type: 'sustain' });
    // Keep previousSlideFlag for slide sustain
  } else if (slideActive) {
    console.log(`Step ${step.step.toString().padStart(2)}: SLIDE → ${midiToName(midi)}${step.accent ? ' +ACC' : ''}`);
    devilboxEvents.push({ step: step.step, type: 'slide', midi, accent: step.accent });
    currentNote = midi;
    previousSlideFlag = step.slide;
  } else {
    if (currentNote >= 0) {
      console.log(`         noteOff(${midiToName(currentNote)})`);
      devilboxEvents.push({ step: step.step, type: 'noteOff', midi: currentNote });
    }
    console.log(`Step ${step.step.toString().padStart(2)}: noteOn(${midiToName(midi)})${step.accent ? ' +ACC' : ''}`);
    devilboxEvents.push({ step: step.step, type: 'noteOn', midi, accent: step.accent });
    currentNote = midi;
    previousSlideFlag = step.slide;
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║                   DB303 Internal Sequencer                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

currentNote = -1;

for (let i = 0; i < testPattern.length; i++) {
  const step = testPattern[i];
  const prevStep = i > 0 ? testPattern[i - 1] : null;
  const midi = keyOctaveToMidi(step.key, step.octave);
  
  // DB303 internal sequencer: checks if PREVIOUS step had slide AND gate
  // If so, current step slides from previous note (if current has gate)
  // If current step has gate=false (REST), the note is released regardless
  const prevHadSlide = prevStep && prevStep.slide && prevStep.gate;
  
  if (!step.gate) {
    // REST always releases the note in DB303 sequencer
    if (currentNote >= 0) {
      console.log(`Step ${step.step.toString().padStart(2)}: REST → noteOff(${midiToName(currentNote)})`);
      db303Events.push({ step: step.step, type: 'rest' });
      db303Events.push({ step: step.step, type: 'noteOff', midi: currentNote });
      currentNote = -1;
    } else {
      console.log(`Step ${step.step.toString().padStart(2)}: REST`);
      db303Events.push({ step: step.step, type: 'rest' });
    }
  } else if (prevHadSlide && currentNote >= 0) {
    // Previous step had slide AND current step has gate → slide
    console.log(`Step ${step.step.toString().padStart(2)}: SLIDE → ${midiToName(midi)}${step.accent ? ' +ACC' : ''}`);
    db303Events.push({ step: step.step, type: 'slide', midi, accent: step.accent });
    currentNote = midi;
  } else {
    // New note trigger (release previous first)
    if (currentNote >= 0) {
      console.log(`         noteOff(${midiToName(currentNote)})`);
      db303Events.push({ step: step.step, type: 'noteOff', midi: currentNote });
    }
    console.log(`Step ${step.step.toString().padStart(2)}: noteOn(${midiToName(midi)})${step.accent ? ' +ACC' : ''}`);
    db303Events.push({ step: step.step, type: 'noteOn', midi, accent: step.accent });
    currentNote = midi;
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║                       COMPARISON RESULT                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

// Filter to note events only
const dvNotes = devilboxEvents.filter(e => e.type === 'noteOn' || e.type === 'noteOff' || e.type === 'slide');
const dbNotes = db303Events.filter(e => e.type === 'noteOn' || e.type === 'noteOff' || e.type === 'slide');

let differences = [];
const maxLen = Math.max(dvNotes.length, dbNotes.length);

for (let i = 0; i < maxLen; i++) {
  const dv = dvNotes[i];
  const db = dbNotes[i];
  
  if (!dv && db) {
    differences.push(`Event ${i}: DEViLBOX missing, DB303: ${db.type}(${midiToName(db.midi || 0)}) at step ${db.step}`);
  } else if (dv && !db) {
    differences.push(`Event ${i}: DB303 missing, DEViLBOX: ${dv.type}(${midiToName(dv.midi || 0)}) at step ${dv.step}`);
  } else if (dv && db) {
    if (dv.type !== db.type) {
      differences.push(`Event ${i} TYPE: DEViLBOX=${dv.type}, DB303=${db.type} at step ${dv.step}`);
    } else if (dv.midi !== db.midi) {
      differences.push(`Event ${i} MIDI: DEViLBOX=${dv.midi}(${midiToName(dv.midi)}), DB303=${db.midi}(${midiToName(db.midi)}) at step ${dv.step}`);
    }
  }
}

if (differences.length === 0) {
  console.log('✅ PASS! Both players produce identical note events.');
  console.log(`   Total events: ${dvNotes.length}`);
} else {
  console.log(`❌ FAIL! ${differences.length} differences found:`);
  differences.forEach(d => console.log(`   • ${d}`));
}

console.log('');
console.log('Event comparison:');
console.log('Step | DEViLBOX           | DB303');
console.log('-----|--------------------|-----------------');

for (let i = 0; i < testPattern.length; i++) {
  const dvStep = dvNotes.filter(e => e.step === i);
  const dbStep = dbNotes.filter(e => e.step === i);
  
  const dvStr = dvStep.map(e => `${e.type}(${midiToName(e.midi || 0)})`).join(', ') || '-';
  const dbStr = dbStep.map(e => `${e.type}(${midiToName(e.midi || 0)})`).join(', ') || '-';
  
  const match = dvStr === dbStr ? '  ' : '❌';
  console.log(`${i.toString().padStart(4)} | ${dvStr.padEnd(18)} | ${dbStr} ${match}`);
}
